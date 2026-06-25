import { HapStream } from './HapStream'
import { BreakpointStore } from './BreakpointStore'
import { LiveRecorder } from './LiveRecorder'
import { perf } from '../perf/profiler'
import { OfflineRenderer } from './OfflineRenderer'
import { normalizeStrudelHap } from './NormalizedHap'
import type { HapEvent } from './HapStream'
import type { PatternScheduler } from '../visualizers/types'
import type { LiveCodingEngine, EngineComponents } from './LiveCodingEngine'
import { propagate, StrudelParseSystem, IREventCollectSystem } from '../ir/propagation'
import type { PatternIR } from '../ir/PatternIR'
import type { IREvent } from '../ir/IREvent'
import { getTierFlags, type TierFlags } from './tierFlags'
import { resolveAlias } from './aliases'
import { isSoundfontZoneError, soundfontRangeMessage } from './friendlyErrors'

type HapHandler = (event: HapEvent) => void

/**
 * Reconstruct a literal viz name from whatever the user passed to
 * `.viz(...)` after Strudel's transpiler has reified it.
 *
 * Strudel runs every string argument through `reify()` which parses
 * it as mini-notation. The mini-notation tokenizer treats spaces as
 * sequence operators and `:` as the sample-index operator, so a
 * literal name like `"Piano Roll"` ends up as a 2-step Pattern, and
 * `"pianoroll:hydra"` ends up as a 1-step Pattern whose value is the
 * array `["pianoroll", "hydra"]`. We undo both transformations to
 * recover the user's original string.
 *
 * Exported (and pure) so it can be unit-tested without booting the
 * full Strudel runtime.
 *
 * @remarks
 * Names that contain other mini-notation operators (`*`, `[`, `<`,
 * `,`, `?`, etc.) won't roundtrip cleanly — those characters change
 * the Pattern shape in ways we can't unambiguously reverse. The
 * documented allowed character set for viz names is alphanumerics +
 * spaces + `:`.
 */
export function extractVizName(rawArg: unknown): string | undefined {
  if (typeof rawArg === 'string') return rawArg || undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pat = rawArg as any
  if (!pat || !pat._Pattern || typeof pat.queryArc !== 'function') {
    return undefined
  }
  const renderHapValue = (v: unknown): string => {
    if (typeof v === 'string') return v
    if (Array.isArray(v)) return v.join(':')
    if (v == null) return ''
    return String(v)
  }
  let haps: Array<{ value: unknown }>
  try {
    haps = pat.queryArc(0, 1)
  } catch {
    return undefined
  }
  if (haps.length === 0) return undefined
  if (haps.length === 1) {
    const out = renderHapValue(haps[0].value)
    return out === '' ? undefined : out
  }
  // Multi-token sequence — rejoin with spaces.
  const out = haps.map((h) => renderHapValue(h.value)).join(' ')
  return out === '' ? undefined : out
}

/**
 * Strudel's official inline-visualization vocabulary → the Stave renderer
 * id each one maps to. The keys are Strudel's Pattern viz methods (verified
 * against `@strudel/draw` + `@strudel/webaudio` source): `pianoroll`,
 * `punchcard`, `spiral`, `pitchwheel` (draw); `scope`, `tscope`, `fscope`,
 * `spectrum` (webaudio); `wordfall` (draw).
 *
 * Each method is intercepted in BOTH chain forms so pasted Strudel code
 * works out of the gate:
 *   - `._name()` (underscore) → inline viz zone (mini, in-REPL form)
 *   - `.name()`  (non-underscore) → Stave backdrop (the "big"/fullscreen form)
 *
 * Aliases map to the nearest Stave renderer that exists today:
 *   - `tscope` → `scope`     (Strudel itself aliases tscope = scope)
 *   - `punchcard` → `pianoroll` (no PunchcardSketch yet — approximation;
 *      a real punchcard renderer is a tracked follow-up)
 *
 * We deliberately do NOT chain to Strudel's real method: `@strudel/draw`
 * isn't loaded, and the webaudio `scope`/`spectrum`/`fscope` would draw
 * strudel's own fullscreen `#test-canvas` — the very thing Stave avoids.
 */
export const STRUDEL_VIZ_METHODS: Record<string, string> = {
  pianoroll: 'pianoroll',
  punchcard: 'pianoroll',
  wordfall: 'wordfall',
  scope: 'scope',
  tscope: 'scope',
  fscope: 'fscope',
  spectrum: 'spectrum',
  spiral: 'spiral',
  pitchwheel: 'pitchwheel',
}

/**
 * Single source of truth for audio in Stave.
 * Wraps @strudel/webaudio (which wraps superdough) via webaudioRepl().
 *
 * API surface matches ARCHITECTURE.md.
 * One instance per page. Must be init()'d after a user gesture.
 */
export class StrudelEngine implements LiveCodingEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private repl: any = null
  private audioCtx: AudioContext | null = null
  private analyserNode: AnalyserNode | null = null
  private hapStream: HapStream = new HapStream()
  private initialized = false
  // Resolve function for the current in-flight evaluate() call
  private evalResolve: ((result: { error?: Error }) => void) | null = null
  // Runtime audio error handler (e.g. "sound X not found" during scheduling)
  private runtimeErrorHandler: ((err: Error) => void) | null = null
  // Sound names registered after init() — used for editor autocompletion
  private loadedSoundNames: string[] = []
  // Per-track PatternSchedulers captured during the last evaluate() call
  private trackSchedulers: Map<string, PatternScheduler> = new Map()
  // Per-track viz requests captured during the last evaluate() call
  private vizRequests: Map<string, string> = new Map()
  // Per-track viz options (the `.pianoroll({...})` argument), keyed by the
  // same captureId as vizRequests. Empty when no viz call passed an argument.
  private vizOptions: Map<string, Record<string, unknown>> = new Map()
  // Options for the backdrop viz call (`.pianoroll({...})`), null when none.
  private backdropVizOptions: Record<string, unknown> | null = null
  // Backdrop viz requested by a non-underscore Strudel viz method (e.g.
  // `.scope()`, `.pianoroll()`) during the last evaluate(). Strudel's
  // non-underscore viz methods are its "big"/fullscreen form — we map them
  // to Stave's backdrop instead of drawing strudel's own fullscreen canvas.
  // Resolved renderer id (e.g. 'scope', 'pianoroll'); null when none called.
  private backdropVizRequest: string | null = null
  // Reference to superdough audio controller (set during init)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private audioController: any = null
  // Per-track AnalyserNodes keyed by captureId, side-tapped off the
  // superdough Orbit each captured pattern plays through.
  private trackAnalysers: Map<string, AnalyserNode> = new Map()
  // The orbit each tracked analyser is tapped from — lets re-evaluate reuse
  // existing analysers when the captureId/orbit pair hasn't changed.
  private trackOrbit: Map<string, number> = new Map()
  // Code from the last successful evaluate() — used by buildVizRequestsWithLines
  private lastEvaluatedCode: string = ''
  // Pattern IR from the last successful evaluate() — derived by propagation
  private lastPatternIR: PatternIR | null = null
  private lastIREvents: IREvent[] = []
  // PV38 clause 2 — loc-keyed lookup over lastIREvents; both queryArc
  // callbacks (per-track + convenience) read this to enrich haps with
  // `irNodeId`. Mirrors the lifecycle of lastIREvents (built on eval
  // success, cleared on failure).
  private lastIRNodeLocLookup: ReadonlyMap<string, IREvent[]> | null = null

  // Phase 20-07 (PK13 step 9) — engine-attached breakpoint registry.
  // Per-engine scope (PV33). The hit-check in `wrappedOutput` reads
  // `breakpointStore.has(irNodeId)` on the audio scheduler hot path.
  private breakpointStore: BreakpointStore = new BreakpointStore()
  // Phase 20-07 — engine-driven pause state. Mirrored to consumers via
  // `onPausedChanged` listeners. Set when the hit-check pauses the
  // scheduler (engine pauses ITSELF on hit) and via the public pause()
  // method. Idempotence guarded by setPaused().
  private isPausedState: boolean = false
  private pauseChangedListeners: Set<(paused: boolean) => void> = new Set()

  // #384 — transport seek offset, in cycles. The song position the user sees
  // is `scheduler.now() - transportOffset`; `0` means normal playback (no
  // seek). Set by `setTransportOffset()` (the runtime's `seekTo` computes
  // `now - targetCycle`). Applied at the `.p` capture seam inside evaluate()
  // by wrapping the pattern with `.late(transportOffset)` — the IR-level
  // transport wrap — so the scheduler plays song-cycle `songPosition` at
  // wall-clock `now`. This is the ONLY place a time-shift touches
  // Pattern.prototype; the runtime must never do so (PV2 / P2 source-grep
  // guard). Exact only for stateless-cyclic patterns; state-accumulating
  // patterns seek approximately (documented edge, design §7.4).
  private transportOffset = 0

  // Phase 20-14 α-5 — tier flags read at boot. β-4 wires `midi` to call
  // enableWebMidi(); the other 7 (csound, tidal, osc, serial, gamepad,
  // motion, mqtt) land as one follow-up issue each. Mid-session toggle
  // changes are NOT picked up here — settings modal shows the "Changes
  // take effect on reload" caption.
  private tierFlags: TierFlags | null = null

  // Phase 20-14 β-2 — alias-resolution accumulator. Reset at `evaluate()`
  // entry; appended to by `wrappedOutput` whenever the alias map rewrites
  // a hap's `s` field. β-5's friendly-error builder reads this to surface
  // "tried alias `kick` → `bd` (resolved)" on a related error. Owned by
  // the engine instance (NOT module state) so concurrent engines don't
  // collide and a stale accumulator can't leak across evals.
  private lastAliasResolutions: Array<{ from: string; to: string }> = []

  // Phase 20-14 β-2 — live reference to superdough's `soundMap`. Captured
  // at init() (when `@strudel/webaudio` resolves). `wrappedOutput` reads
  // `soundMap.get()[name]` at trigger time to honour the Strategy A guard
  // — user-registered names always win over the curated alias map.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private soundMapRef: any = null

  /** Read-only snapshot of the tier flags consumed at this engine's init(). */
  getTierFlagsSnapshot(): Readonly<TierFlags> | null {
    return this.tierFlags
  }

  /**
   * #384 — set the transport seek offset (cycles). Does NOT re-evaluate by
   * itself: the runtime's `seekTo` calls this and then `play()`, whose
   * re-eval re-reads `transportOffset` and applies the `.late()` wrap at the
   * `.p` seam. Kept off the `LiveCodingEngine` interface (v1) and reached via
   * `(engine as any).setTransportOffset?.()` so non-Strudel engines no-op,
   * mirroring the pause/resume delegation convention.
   */
  setTransportOffset(offset: number): void {
    this.transportOffset = Number.isFinite(offset) ? offset : 0
  }

  /** #384 — current transport offset (cycles). `0` when no seek is active. */
  getTransportOffset(): number {
    return this.transportOffset
  }

  /**
   * Phase 20-14 β-2 — read-only snapshot of alias rewrites that have fired
   * during the current evaluate() window. Each entry is one hap rewrite;
   * the same `from → to` pair may appear multiple times if the rewrite
   * fired across multiple cycles.
   *
   * Lifecycle: reset to empty at `evaluate()` entry, appended to by
   * `wrappedOutput`, read by friendlyErrors at message-build time.
   */
  getLastAliasResolutions(): ReadonlyArray<{ from: string; to: string }> {
    return this.lastAliasResolutions
  }

  async init(): Promise<void> {
    if (this.initialized) return

    // Phase 20-14 α-5: tier-flag consume-at-init contract. Read ONCE here
    // and stash on the instance. β-4 (MIDI wiring) reads from
    // `this.tierFlags`. The dev-console log is the consumed-at-init
    // proof — α-5's Lokayata gate looks for it on reload.
    this.tierFlags = getTierFlags()
    // eslint-disable-next-line no-console
    console.log('[StrudelEngine] tierFlags read at init:', this.tierFlags)

    // Load all strudel modules up-front so evalScope can register their
    // exports (note, s, gain, stack, etc.) into globalThis.  The eval'd user
    // code runs inside Function() with no special scope, so every function it
    // calls must be a global.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [coreMod, miniMod, tonalMod, webaudioMod, soundfontsMod, xenMod, midiMod, mondoMod] = await Promise.all([
      import('@strudel/core') as Promise<any>,
      import('@strudel/mini') as Promise<any>,
      import('@strudel/tonal') as Promise<any>,
      import('@strudel/webaudio') as Promise<any>,
      import('@strudel/soundfonts') as Promise<any>,
      import('@strudel/xen') as Promise<any>,
      import('@strudel/midi') as Promise<any>,
      // Phase 20-14 α-1: audio-pure addition. Exposes `mondo`, `mondi`,
      // `mondolang`, `getLocations` on globalThis via evalScope. Verified
      // exports against upstream npm @strudel/mondo@1.1.6 (dist/mondough.mjs).
      // @strudel/edo (also called for by upstream loadModules at the pinned SHA)
      // is intentionally NOT added here — it is not yet published to npm
      // (registry.npmjs.org returns 404 for @strudel/edo on 2026-05-15).
      // Tracked as a follow-up when upstream publishes it.
      import('@strudel/mondo') as Promise<any>,
    ])

    // Register all module exports into globalThis so eval'd patterns can use them
    // (note, s, gain, stack, etc. must be globals — user code runs in Function())
    // midi: uses onTrigger (additive) — highlighting still fires for every hap.
    //        enableWebMidi() is gated by the `midi` tier flag (β-4 below).
    //        The module import is unconditional (80 KB, audio-pure); only
    //        the permission-triggering call is gated.
    // drawMod (@strudel/draw) intentionally excluded: it injects a full-screen canvas
    // into document.body (id="test-canvas") the first time any draw function runs.
    // Stave uses its own visualizer system, so strudel's canvas draw functions
    // (pianoroll, drawFrequencyScope, etc.) are not exposed to user code.
    await coreMod.evalScope(coreMod, miniMod, tonalMod, webaudioMod, soundfontsMod, xenMod, midiMod, mondoMod)

    // Phase 20-14 β-4: thread the `midi` tier flag through engine init.
    // When the flag is ON, call `enableWebMidi()` after evalScope resolves so
    // `Pattern.prototype.midi` and the WebMIDI hookup go live. The browser
    // permission prompt fires during init (early-prompt UX per RESEARCH §4 +
    // CONTEXT gray-area #3) — the settings row caption telegraphs this so
    // the user opts in deliberately.
    //
    // When the flag is OFF (default), the call is skipped — preserves the
    // pre-α behavior where `@strudel/midi` was loaded but no permission
    // prompt fired. The other 7 tier flags (csound/tidal/osc/serial/gamepad/
    // motion/mqtt) are NOT threaded here — each has its own follow-up issue
    // (#124-#130) from β-3.
    if (this.tierFlags?.midi) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const enableWebMidi = (midiMod as any)?.enableWebMidi
        if (typeof enableWebMidi === 'function') {
          await enableWebMidi()
        } else {
          console.warn('[StrudelEngine] tierFlags.midi is ON but @strudel/midi did not export enableWebMidi.')
        }
      } catch (err) {
        // Browser-permission denial throws here. Log + continue — engine
        // boot must succeed even if MIDI is unavailable.
        console.warn('[StrudelEngine] enableWebMidi() failed; MIDI output unavailable.', err)
      }
    }

    // Set up mini-notation string parser (parses "c3 e3 g3" strings as patterns)
    miniMod.miniAllStrings()

    // Transpiler converts $: pattern syntax → pattern.p("$") and handles
    // mini-notation template literals. Required for $: to work correctly.
    const { transpiler } = await import('@strudel/transpiler')

    const { initAudio, getAudioContext, webaudioOutput, webaudioRepl } = webaudioMod

    await initAudio()
    // Register built-in oscillator synths (sine, sawtooth, square, triangle, user, one)
    // and noise generators (pink, white, brown, crackle).
    // Without this, superdough throws "sound sine not found! Is it loaded?"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(webaudioMod as any).registerSynthSounds()
    // Register ZZFX procedural sounds (zzfx, z_sine, z_sawtooth, z_triangle, z_square, z_tan, z_noise).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(webaudioMod as any).registerZZFXSounds()
    // Register all 128 GM soundfont instruments (piano, bass, guitar, strings, etc.).
    // Fonts are lazy-loaded from felixroos.github.io/webaudiofontdata on first use.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(soundfontsMod as any).registerSoundfonts()
    // Load Dirt-Samples manifest so bd, hh, sd, cp, rim, cr, rd etc. resolve at runtime.
    // Individual samples are lazy-loaded on first play; only the index JSON is fetched here.
    // Worklet-based effects (crush, coarse, distort, djf, bytebeat) are loaded by initAudio() above.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (webaudioMod as any).samples('github:tidalcycles/Dirt-Samples/master')

    // Phase 20-14 α-2: mirror upstream `prebake.mjs` sample-manifest fetches.
    // Upstream b-cdn manifests unlock `s("piano")` (Salamander), `.bank("tr909")`
    // (tidal-drum-machines), uzu-drumkit/wavetables, mridangam, VCSL orchestra,
    // and the inline Dirt-Samples bank set (casio/crow/insect/wind/jazz/metal/
    // east/space/numbers/num). See upstream prebake.mjs lines 25-155 at SHA
    // f73b395648645aabe699f91ba0989f35a6fd8a3c.
    //
    // Each samples() call is wrapped in try/catch so a b-cdn outage does NOT
    // break engine boot — the previously-loaded Dirt-Samples + synths still
    // serve unaffected. Documented as accepted risk in 20-14-PLAN.md §6.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const samplesFn = (webaudioMod as any).samples
    const baseCDN = 'https://strudel.b-cdn.net'  // upstream prebake.mjs:11
    const safeSamples = async (label: string, fn: () => Promise<unknown>) => {
      try { await fn() }
      catch (e) {
        // Boot-time soft failure: log + continue. Bd/hh/etc. still work.
        console.warn(`[StrudelEngine] sample manifest "${label}" failed to load; continuing without it.`, e)
      }
    }
    await Promise.all([
      // Salamander piano — unlocks `s("piano")`. Closes the symptom of issue #110.
      safeSamples('piano', () => samplesFn(`${baseCDN}/piano.json`, `${baseCDN}/piano/`, { prebake: true })),
      // VCSL orchestral library (CC0).
      safeSamples('vcsl', () => samplesFn(`${baseCDN}/vcsl.json`, `${baseCDN}/VCSL/`, { prebake: true })),
      // tidal-drum-machines — unlocks `.bank("tr909")`, `.bank("RolandTR808")`, etc.
      safeSamples('tidal-drum-machines', () => samplesFn(`${baseCDN}/tidal-drum-machines.json`, `${baseCDN}/tidal-drum-machines/machines/`, { prebake: true, tag: 'drum-machines' })),
      // uzu-drumkit — extra drum banks.
      safeSamples('uzu-drumkit', () => samplesFn(`${baseCDN}/uzu-drumkit.json`, `${baseCDN}/uzu-drumkit/`, { prebake: true, tag: 'drum-machines' })),
      // uzu-wavetables — wavetable synth fodder.
      safeSamples('uzu-wavetables', () => samplesFn(`${baseCDN}/uzu-wavetables.json`, `${baseCDN}/uzu-wavetables/`, { prebake: true })),
      // mridangam — percussion bank.
      safeSamples('mridangam', () => samplesFn(`${baseCDN}/mridangam.json`, `${baseCDN}/mrid/`, { prebake: true, tag: 'drum-machines' })),
      // Inline Dirt-Samples categories (casio/crow/insect/wind/jazz/metal/east/
      // space/numbers/num) served from b-cdn. Upstream prebake.mjs:42-155.
      // The earlier `github:tidalcycles/Dirt-Samples/master` call (above) registers
      // bd/hh/sd/etc.; soundMap.setKey overwrites on duplicate so this call wins
      // for shared keys — matches upstream behavior (RESEARCH §1c).
      safeSamples('dirt-extras', () => samplesFn({
        casio: ['casio/high.wav', 'casio/low.wav', 'casio/noise.wav'],
        crow: ['crow/000_crow.wav', 'crow/001_crow2.wav', 'crow/002_crow3.wav', 'crow/003_crow4.wav'],
        insect: [
          'insect/000_everglades_conehead.wav',
          'insect/001_robust_shieldback.wav',
          'insect/002_seashore_meadow_katydid.wav',
        ],
        wind: [
          'wind/000_wind1.wav', 'wind/001_wind10.wav', 'wind/002_wind2.wav', 'wind/003_wind3.wav',
          'wind/004_wind4.wav', 'wind/005_wind5.wav', 'wind/006_wind6.wav', 'wind/007_wind7.wav',
          'wind/008_wind8.wav', 'wind/009_wind9.wav',
        ],
        jazz: [
          'jazz/000_BD.wav', 'jazz/001_CB.wav', 'jazz/002_FX.wav', 'jazz/003_HH.wav',
          'jazz/004_OH.wav', 'jazz/005_P1.wav', 'jazz/006_P2.wav', 'jazz/007_SN.wav',
        ],
        metal: [
          'metal/000_0.wav', 'metal/001_1.wav', 'metal/002_2.wav', 'metal/003_3.wav',
          'metal/004_4.wav', 'metal/005_5.wav', 'metal/006_6.wav', 'metal/007_7.wav',
          'metal/008_8.wav', 'metal/009_9.wav',
        ],
        east: [
          'east/000_nipon_wood_block.wav', 'east/001_ohkawa_mute.wav', 'east/002_ohkawa_open.wav',
          'east/003_shime_hi.wav', 'east/004_shime_hi_2.wav', 'east/005_shime_mute.wav',
          'east/006_taiko_1.wav', 'east/007_taiko_2.wav', 'east/008_taiko_3.wav',
        ],
        space: [
          'space/000_0.wav', 'space/001_1.wav', 'space/002_11.wav', 'space/003_12.wav',
          'space/004_13.wav', 'space/005_14.wav', 'space/006_15.wav', 'space/007_16.wav',
          'space/008_17.wav', 'space/009_18.wav', 'space/010_2.wav', 'space/011_3.wav',
          'space/012_4.wav', 'space/013_5.wav', 'space/014_6.wav', 'space/015_7.wav',
          'space/016_8.wav', 'space/017_9.wav',
        ],
        numbers: [
          'numbers/0.wav', 'numbers/1.wav', 'numbers/2.wav', 'numbers/3.wav', 'numbers/4.wav',
          'numbers/5.wav', 'numbers/6.wav', 'numbers/7.wav', 'numbers/8.wav',
        ],
        num: [
          'num/00.wav', 'num/01.wav', 'num/02.wav', 'num/03.wav', 'num/04.wav', 'num/05.wav',
          'num/06.wav', 'num/07.wav', 'num/08.wav', 'num/09.wav', 'num/10.wav', 'num/11.wav',
          'num/12.wav', 'num/13.wav', 'num/14.wav', 'num/15.wav', 'num/16.wav', 'num/17.wav',
          'num/18.wav', 'num/19.wav', 'num/20.wav',
        ],
      }, `${baseCDN}/Dirt-Samples/`, { prebake: true })),
    ])

    // Phase 20-14 α-3: aliasBank() registers 69 bank-name aliases (e.g.
    //   RolandTR909 → 909, KorgKR55 → KR55) so users can spell drum-machine
    //   banks the way upstream tunes do. See upstream prebake.mjs:158.
    //
    // Merge-vs-replace semantics (RESEARCH §3 open question #3):
    //   superdough/superdough.mjs:86-117 (aliasBankMap) reads the current
    //   soundMap.get() dictionary, MUTATES it in place to add aliased keys
    //   (e.g. `909_bd` aliased from `RolandTR909_bd`), then calls
    //   soundMap.set({...soundDictionary}). That spread is a SHALLOW MERGE
    //   of the same dict back onto itself plus the new alias keys — so the
    //   post-aliasBank count is monotonically ≥ the pre-count. We log
    //   BEFORE/AFTER to make the contract observable; α-7 SUMMARY pins this.
    //
    // Wrapped in try/catch for the same boot-resilience reason as α-2.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const soundMapRef = (webaudioMod as any).soundMap
    // β-2 — stash the live soundMap on the instance so wrappedOutput's
    // Strategy A guard can read it at trigger time. Live read (not snapshot);
    // user `samples()` calls between init and trigger should be honored.
    this.soundMapRef = soundMapRef
    const preAliasCount = soundMapRef?.get ? Object.keys(soundMapRef.get()).length : 0
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (webaudioMod as any).aliasBank(`${baseCDN}/tidal-drum-machines-alias.json`)
    } catch (e) {
      console.warn('[StrudelEngine] aliasBank fetch failed; .bank() aliases unavailable.', e)
    }
    const postAliasCount = soundMapRef?.get ? Object.keys(soundMapRef.get()).length : 0
    // Dev-only observation log — α-7 SUMMARY cites this for the merge-vs-replace
    // gate. Drop noisily if a future review wants quieter boot — keep the
    // observation visible until structural parity ships.
    console.log(`[StrudelEngine] aliasBank: soundMap keys ${preAliasCount} → ${postAliasCount} (Δ ${postAliasCount - preAliasCount}; expect non-negative)`)

    // Snapshot all registered sound names (synths + Dirt-Samples) for editor autocompletion.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const soundMapData: Record<string, unknown> = (webaudioMod as any).soundMap?.get() ?? {}
    this.loadedSoundNames = Object.keys(soundMapData).filter(k => !k.startsWith('_'))
    this.audioCtx = getAudioContext()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const audioCtx = this.audioCtx!

    // Tap superdough's master output for analysis.
    // connectToDestination() wires a node as a SOURCE into superdough's mix — wrong for
    // an analyser because nothing feeds into the analyser's INPUT, so it sees silence.
    // Correct approach: get the master destinationGain and connect it → analyserNode
    // as a side-tap. Audio still flows unchanged to audioCtx.destination.
    this.analyserNode = audioCtx.createAnalyser()
    this.analyserNode.fftSize = 2048
    this.analyserNode.smoothingTimeConstant = 0.8
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const audioController = (webaudioMod as any).getSuperdoughAudioController()
    this.audioController = audioController
    audioController.output.destinationGain.connect(this.analyserNode)

    // Wrap the native output trigger so we can fan events to HapStream subscribers
    const hapStream = this.hapStream
    const audioCtxRef = audioCtx

    // Strudel's scheduler calls: onTrigger(hap, deadline, duration, cps, t)
    // (cyclist.mjs:64-71). NOTE the signature is the inverse of what the
    // names suggest:
    //   deadline = targetTime − phase — a small RELATIVE lookahead (~latency
    //              0.1s), flagged "dumb and only here for backwards
    //              compatibility" upstream. NOT an absolute time.
    //   duration = note duration in seconds
    //   cps = cycles per second
    //   t = targetTime — the ABSOLUTE AudioContext time the note sounds.
    // HapStream wants the absolute play-time as its 2nd arg (it stores it as
    // `audioTime` and derives `scheduledAheadMs = (it − currentTime)`), so we
    // pass `t`, NOT `deadline` (#512: passing the relative deadline made
    // scheduledAheadMs grow hugely negative with session uptime).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedOutput = async (hap: any, deadline: number, duration: number, cps: number, t: number) => {
      perf.inc('audio.triggers') // #228 — scheduler event throughput (rate = count/uptime)
      // Phase 20-14 β-2 — Strategy A sound-alias intercept. We are POST-
      // reify (P1): `hap.value.s` is the final per-event string Strudel's
      // scheduler resolved. If the bare name is not in the live soundMap
      // AND the curated alias map has a target, rewrite the hap so
      // superdough sees the canonical name. User-registered names ALWAYS
      // win (RESEARCH §3 + §7 open-question #4). Sub-microsecond per hap
      // (one Map.get + one Object index lookup); negligible vs scheduler
      // overhead.
      const rawS = hap?.value?.s
      if (typeof rawS === 'string') {
        const lower = rawS.toLowerCase()
        // Live read — user `samples(...)` calls between init and trigger
        // should be honored.
        const liveSoundMap: Record<string, unknown> | undefined =
          this.soundMapRef?.get?.() ?? undefined
        if (!liveSoundMap || liveSoundMap[lower] === undefined) {
          const aliased = resolveAlias(rawS)
          if (aliased && aliased !== rawS) {
            this.lastAliasResolutions.push({ from: rawS, to: aliased })
            // Shallow clone the value so downstream consumers that snapshot
            // the original hap reference see a stable shape; only this hap's
            // `s` is rewritten for the audio side.
            hap.value = { ...hap.value, s: aliased }
          }
        }
      }

      // Phase 20-07 (T-α-2) — emit returns the enriched HapEvent so the
      // breakpoint hit-check below reads `irNodeId` in O(1) without
      // re-running findMatchedEvent. P50 single-strategy match preserved.
      const enriched = hapStream.emit(hap, t, duration, cps, audioCtxRef.currentTime, this.lastIRNodeLocLookup ?? undefined)

      // Phase 20-07 (PK13 step 9 / DEC-AMENDED-3) — breakpoint hit-check.
      // PERF: O(1) Set.has() on the audio scheduler hot path; do NOT
      // extend to predicate evaluation here (D-03 forbids).
      // Order: emit fired ABOVE so the user SEES which row caused the
      // break before the scheduler pauses (DEC-AMENDED-3). PV37 alignment
      // — undefined `irNodeId` never hits.
      if (enriched.irNodeId && this.breakpointStore.has(enriched.irNodeId)) {
        this.repl?.scheduler?.pause()  // ← pause, NOT stop (DEC-AMENDED-1; cyclist.mjs:112-116 vs :117-122)
        this.setPaused(true)
        return  // skip audio dispatch — synchronous early return
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (webaudioOutput as any)(hap, deadline, duration, cps, t)
      } catch (err) {
        // Route scheduler-time errors (e.g. "sound X not found", "cannot parse as numeral")
        // through the registered handler so they surface in the editor UI, not just the console.
        const error = err instanceof Error ? err : new Error(String(err))
        // A "no soundfont zone found" throw means this note's pitch fell outside the
        // loaded instrument's sampled key-range. Upstream drops the preset + pitch
        // from the message (`new Error(msg, name, ...)` ignores extra args —
        // @strudel/soundfonts/fontloader.mjs:87), so the raw message is empty and
        // useless. We still hold the offending `hap` here, so recover the note +
        // instrument from it and rewrite the message into something actionable (#561).
        if (isSoundfontZoneError(error.message)) {
          const better = soundfontRangeMessage(hap?.value)
          if (better) error.message = better
        }
        this.runtimeErrorHandler?.(error)
      }
    }

    this.repl = webaudioRepl({
      transpiler,
      defaultOutput: wrappedOutput,
      onEvalError: (err: Error) => {
        this.evalResolve?.({ error: err })
        this.evalResolve = null
      },
    })

    // Phase 20-14 α-4: vendor upstream `piano.mjs` chain method. Side-effect
    // import — attaches Pattern.prototype.piano once at boot. evalScope
    // populated Pattern on globalThis ~200 lines above, so by here the
    // prototype exists to extend. NOT re-imported per evaluate (UV2 / P2
    // safe — `.piano` is not in the injectPatternMethods overwrite list).
    await import('./vendored/piano')

    this.initialized = true
  }

  async evaluate(code: string): Promise<{ error?: Error }> {
    if (!this.initialized) await this.init()
    this.lastEvaluatedCode = code
    // Phase 20-14 β-2 — reset alias-resolution accumulator at the entry
    // of every evaluate(). β-5's friendly-error builder reads this; a
    // stale accumulator from a previous eval would surface aliases that
    // are unrelated to the current error. Reset must be the FIRST
    // statement after lastEvaluatedCode, NOT buried in a helper.
    this.lastAliasResolutions = []

    const capturedPatterns = new Map<string, any>() // eslint-disable-line @typescript-eslint/no-explicit-any
    const capturedVizRequests = new Map<string, string>()
    // Per-track viz options from a `.pianoroll({ ... })` / `._pianoroll({ ... })`
    // argument, keyed by captureId — flows to the renderer's `stave.options`.
    const capturedVizOptions = new Map<string, Record<string, unknown>>()
    // Backdrop viz requested via a non-underscore method this evaluate.
    // Singular (last `.scope()`/`.pianoroll()` call wins); set directly by
    // the method wrappers below via this closure, independent of `.p()`
    // capture so a bare top-level `.scope()` still registers.
    let capturedBackdropViz: string | null = null
    let capturedBackdropVizOptions: Record<string, unknown> | null = null
    let anonIndex = 0
    // Auto-orbit counter: each captured $: block with a .viz() request but no
    // explicit .orbit(N) gets its own unique orbit number starting high enough
    // that it won't collide with user-set orbits (typically 1..8). Without this
    // every viz defaults to orbit 1 and every inline viz shows the master mix
    // rather than its own track. Numbers ≥ 100 + captureId keep the mapping
    // stable across evaluates.
    let autoOrbitNext = 100
    // #384 — snapshot the seek offset for this evaluate. `this` is the engine
    // here (evaluate's body); the `.p` value function below closes over this
    // const, so each re-eval (every play()/seekTo) applies the current offset.
    const transportOffset = this.transportOffset
    const probeExplicitOrbit = (pat: any): boolean => { // eslint-disable-line @typescript-eslint/no-explicit-any
      try {
        const haps = pat.queryArc(0, 1)
        for (const h of haps) {
          if (h?.value?.orbit !== undefined) return true
        }
        // Also check a longer window — slow patterns may not have a hap in the first cycle.
        const more = pat.queryArc(0, 4)
        for (const h of more) {
          if (h?.value?.orbit !== undefined) return true
        }
      } catch { /* silent patterns throw or return empty */ }
      return false
    }

    // Dynamic import — Pattern is from @strudel/core which is already loaded after init()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Pattern } = await import('@strudel/core') as any

    // Save current descriptor (may be value descriptor from previous injectPatternMethods)
    const savedDescriptor = Object.getOwnPropertyDescriptor(Pattern.prototype, 'p')
    const savedVizDescriptor = Object.getOwnPropertyDescriptor(Pattern.prototype, 'viz')

    // Strudel-official viz methods (see STRUDEL_VIZ_METHODS). Both chain
    // forms of every name are intercepted below; we save the prior
    // descriptors (some non-underscore forms are live @strudel/webaudio
    // methods) so they restore cleanly after evaluate.
    const savedLegacyDescriptors = new Map<string, PropertyDescriptor | undefined>()

    // Install setter trap — fires when injectPatternMethods does Pattern.prototype.p = fn
    // This intercepts the assignment so we can wrap Strudel's fn with our capturing logic.
    // IMPORTANT: .viz() and legacy method wrappers are installed INSIDE this setter,
    // AFTER injectPatternMethods finishes — because injectPatternMethods overwrites
    // any .viz() we install beforehand (Strudel has its own .viz() from @strudel/draw).
    Object.defineProperty(Pattern.prototype, 'p', {
      configurable: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      set(strudelFn: (id: string) => any) {
        // NOW install .viz() wrapper — after injectPatternMethods has set Strudel's .viz()
        // Wrap Strudel's existing .viz() so it still renders, but also capture the viz name.
        const strudelViz = Pattern.prototype.viz // eslint-disable-line @typescript-eslint/no-explicit-any
        Object.defineProperty(Pattern.prototype, 'viz', {
          configurable: true,
          writable: true,
          value: function(this: any, vizName: any, opts?: unknown) { // eslint-disable-line @typescript-eslint/no-explicit-any
            // Extract viz name — see `extractVizName` for the full
            // explanation of Strudel's reify-induced shapes. Pure
            // helper exported for unit testing.
            const resolvedName = extractVizName(vizName)
            const optsObj =
              opts && typeof opts === 'object' ? (opts as Record<string, unknown>) : null
            // #364 (350b): `.viz('name', { backdrop: true })` promotes the
            // viz to the BACKDROP slot — a code-override source alongside the
            // non-underscore `.scope()`/`.pianoroll()` forms below — instead of
            // an inline view-zone. Sets the SAME `capturedBackdropViz` closure
            // those methods use; the app's handleCodeBackdropChange →
            // setBackgroundOverride (#363) then makes it an active-pane override.
            // opacity/quality ride along in the options bag → backdropRequest.options
            // (per-pane application is #365). We still chain to Strudel's `.viz()`
            // for parity but DELIBERATELY do not tag `_pendingViz`, so the `.p()`
            // wrapper never registers an inline request for a backdrop viz.
            // G3: in a NON-active program this only mutates the closure, which the
            // singular engine commits for the active evaluate alone → effectively a
            // no-op until that program is active. `.viz('name')` (no flag) stays inline.
            if (resolvedName && optsObj && optsObj.backdrop === true) {
              capturedBackdropViz = resolvedName
              capturedBackdropVizOptions = optsObj
              return strudelViz ? strudelViz.call(this, vizName) : this
            }
            // Chain to Strudel's .viz() if it exists
            const result = strudelViz ? strudelViz.call(this, vizName) : this
            // Tag the RETURNED pattern with the resolved viz name
            if (resolvedName) {
              result._pendingViz = resolvedName
            }
            // Carry the `.viz(name, {...})` options object so the `.p()` wrapper
            // keys it to this track's captureId → stave.options — the same path
            // `._pianoroll({...})` uses. Without this, `.viz` options were
            // silently dropped (#215).
            if (opts && typeof opts === 'object') {
              result._pendingVizOptions = opts
            }
            return result
          },
        })

        // Install Strudel-official viz method wrappers AFTER injectPatternMethods.
        // For each official viz name we intercept BOTH chain forms so pasted
        // Strudel code works out of the gate:
        //   - `._name()` (underscore) → inline viz zone  (tags `_pendingViz`,
        //      read by the `.p()` wrapper below → capturedVizRequests)
        //   - `.name()`  (non-underscore) → Stave backdrop  (sets the
        //      `capturedBackdropViz` closure directly; does not depend on `.p()`)
        // Neither form chains to Strudel's real method: `@strudel/draw` isn't
        // loaded, and the live webaudio `scope`/`spectrum`/`fscope` would draw
        // strudel's fullscreen `#test-canvas`. Returning `this` keeps the chain
        // intact while Stave renders the viz its own way.
        for (const [name, renderer] of Object.entries(STRUDEL_VIZ_METHODS)) {
          // Underscore form → inline viz zone.
          const underscore = `_${name}`
          savedLegacyDescriptors.set(underscore, Object.getOwnPropertyDescriptor(Pattern.prototype, underscore))
          Object.defineProperty(Pattern.prototype, underscore, {
            configurable: true,
            writable: true,
            value: function(this: any, opts?: unknown) { // eslint-disable-line @typescript-eslint/no-explicit-any
              this._pendingViz = renderer
              // Carry the `.pianoroll({...})` argument so the `.p()` wrapper
              // can key it to this track's captureId → stave.options.
              if (opts && typeof opts === 'object') this._pendingVizOptions = opts
              return this
            },
          })
          // Non-underscore form → backdrop (Strudel's "big"/fullscreen form).
          savedLegacyDescriptors.set(name, Object.getOwnPropertyDescriptor(Pattern.prototype, name))
          Object.defineProperty(Pattern.prototype, name, {
            configurable: true,
            writable: true,
            value: function(this: any, opts?: unknown) { // eslint-disable-line @typescript-eslint/no-explicit-any
              capturedBackdropViz = renderer
              capturedBackdropVizOptions = opts && typeof opts === 'object' ? (opts as Record<string, unknown>) : null
              return this
            },
          })
        }

        // Wrap Strudel's .p() fn with our capturing logic
        Object.defineProperty(Pattern.prototype, 'p', {
          configurable: true,
          writable: true,
          value: function (this: any, id: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
            if (typeof id === 'string' && !(id.startsWith('_') || id.endsWith('_'))) {
              let captureId = id
              if (id.includes('$')) {
                captureId = `$${anonIndex}`
                anonIndex++
              }

              // Resolve pending .viz() request — .viz() fires BEFORE .p() in chain.
              let vizName: string = ''
              if (this._pendingViz && typeof this._pendingViz === 'string') {
                vizName = this._pendingViz
                capturedVizRequests.set(captureId, vizName)
                delete this._pendingViz
              }
              // Resolve pending viz options (`.pianoroll({...})` argument).
              if (this._pendingVizOptions && typeof this._pendingVizOptions === 'object') {
                capturedVizOptions.set(captureId, this._pendingVizOptions as Record<string, unknown>)
                delete this._pendingVizOptions
              }

              // Per-track audio isolation: strudel's default orbit is 1, so every
              // $: block without an explicit .orbit(N) call lands on the SAME
              // superdough Orbit. That makes every inline viz see the master mix
              // rather than its own track. For captured blocks that have a .viz()
              // request and NO user-set orbit, wrap the pattern with a unique
              // auto-orbit so it routes through its own Orbit node — which is
              // what StrudelEngine.rebuildTrackAnalysers() side-taps.
              let effectivePattern = this
              if (vizName && typeof this.orbit === 'function' && !probeExplicitOrbit(this)) {
                const autoOrbit = autoOrbitNext++
                try { effectivePattern = this.orbit(autoOrbit) } catch { /* fall back to this */ }
              }
              // #384 — transport seek. Shift the whole captured pattern in time
              // so the scheduler plays song-cycle `now - transportOffset` at
              // wall-clock `now`. `.late(offset)` delays onsets by `offset`
              // cycles (negative = seek forward, i.e. `.early`). Applied AFTER
              // the auto-orbit wrap so routing is preserved, and to the SAME
              // `effectivePattern` used for both audio (`strudelFn.call`) and
              // capture (viz/timeline queryArc) — keeping every consumer in one
              // coherent scheduler frame. Guarded: only when seeking, and only
              // if `.late` is present (registered @strudel/core; exotic
              // patterns may lack it → keep unshifted). PV2: this time-shift on
              // Pattern.prototype lives engine-side only.
              if (transportOffset !== 0 && typeof effectivePattern.late === 'function') {
                try { effectivePattern = effectivePattern.late(transportOffset) } catch { /* keep unshifted */ }
              }
              capturedPatterns.set(captureId, effectivePattern)
              return strudelFn.call(effectivePattern, id)
            }
            // Strudel's `.p()` only accepts strings (registers pattern in
            // D registry keyed by the id). Strudel's double-quoted-string-
            // to-mini transformer turns `.p("name")` into `.p(<Pattern>)`
            // at the transpiler stage — passing a Pattern blows up
            // `k.includes("$")`. Guard the delegation: if id isn't a
            // string, no-op (return `this`) so the chain doesn't crash.
            // User-facing fix: use single quotes (`p('name')`) or pass a
            // numeric orbit via `.orbit(N)`. PV35: invalid input is
            // dropped silently here, not promoted to a runtime hap.
            if (typeof id !== 'string') return this
            return strudelFn.call(this, id)
          },
        })
      },
    })

    try {
      // repl.evaluate() never rejects — errors go to the onEvalError callback
      // set during repl construction. We bridge via evalResolve.
      const result = await new Promise<{ error?: Error }>((resolve) => {
        this.evalResolve = resolve
        this.repl.evaluate(code).then(() => {
          // If onEvalError didn't fire, evaluation succeeded
          if (this.evalResolve) { this.evalResolve({}); this.evalResolve = null }
        })
      })

      if (!result.error) {
        // Build PatternSchedulers from captured patterns
        const sched = (this.repl as any).scheduler // eslint-disable-line @typescript-eslint/no-explicit-any
        this.trackSchedulers = new Map<string, PatternScheduler>()
        for (const [id, pattern] of capturedPatterns) {
          const captured = pattern // close over this specific pattern instance
          const trackId = id // capture for the closure below
          this.trackSchedulers.set(id, {
            now: () => sched.now(),
            query: (begin: number, end: number) => {
              try {
                return captured
                  .queryArc(begin, end)
                  .map((hap: unknown) => normalizeStrudelHap(hap, trackId, this.lastIRNodeLocLookup ?? undefined))
              } catch {
                return []
              }
            },
          })
        }
        this.vizRequests = capturedVizRequests
        this.vizOptions = capturedVizOptions
        this.backdropVizRequest = capturedBackdropViz
        this.backdropVizOptions = capturedBackdropVizOptions

        // Per-track analyser side-taps: for each captured pattern, discover the
        // orbit it plays through and connect the orbit's output GainNode to a
        // dedicated AnalyserNode. Lets inline .viz() show per-track FFT instead
        // of the master mix. Reuses existing analysers when (captureId, orbit)
        // persists across re-evaluates — avoids reconnect churn + flicker.
        this.rebuildTrackAnalysers(capturedPatterns)

        // Run propagation pipeline: code → PatternIR → IREvent[]
        // Uses the ORIGINAL user code string (not transpiled) so the parser
        // sees idiomatic Strudel patterns rather than reified output.
        const irBag = propagate(
          { strudelCode: code },
          [StrudelParseSystem, IREventCollectSystem],
        )
        this.lastPatternIR = irBag.patternIR ?? null
        this.lastIREvents = irBag.irEvents ?? []
        // PV38 clause 2 — build the loc lookup once per eval; queryArc
        // callbacks read it to enrich haps with irNodeId. Mirrors how
        // lastIREvents is stored alongside lastPatternIR. ReadonlyMap
        // (via type) enforces PV33 immutability per snapshot lifetime.
        // NOTE: this duplicates the loc-lookup build in irInspector.ts's
        // `enrichWithLookups` — kept separate per phase 20-05 PLAN §7
        // T-γ-4 "Note on duplication": two specific sites today (engine's
        // lastIREvents from `propagate()` vs published snapshot from
        // `collect(finalIR)` in StrudelEditorClient.tsx). DEC-NEW-1:
        // consolidation requires a third occurrence + span-check signal.
        const locLookup = new Map<string, IREvent[]>()
        for (const e of this.lastIREvents) {
          if (e.loc && e.loc.length > 0) {
            const key = `${e.loc[0].start}:${e.loc[0].end}`
            const arr = locLookup.get(key)
            if (arr) arr.push(e)
            else locLookup.set(key, [e])
          }
        }
        this.lastIRNodeLocLookup = locLookup
      } else {
        // Failed evaluate — clear stale IR
        this.lastPatternIR = null
        this.lastIREvents = []
        this.lastIRNodeLocLookup = null
        this.backdropVizRequest = null
      }

      return result
    } finally {
      // Always restore Pattern.prototype.p — even on error
      if (savedDescriptor) {
        Object.defineProperty(Pattern.prototype, 'p', savedDescriptor)
      } else {
        delete (Pattern.prototype as any).p // eslint-disable-line @typescript-eslint/no-explicit-any
      }

      // Restore Pattern.prototype.viz — same pattern as .p restoration above
      if (savedVizDescriptor) {
        Object.defineProperty(Pattern.prototype, 'viz', savedVizDescriptor)
      } else {
        delete (Pattern.prototype as any).viz // eslint-disable-line @typescript-eslint/no-explicit-any
      }

      // Restore legacy ._vizName() methods
      for (const [methodName, desc] of savedLegacyDescriptors) {
        if (desc) {
          Object.defineProperty(Pattern.prototype, methodName, desc)
        } else {
          delete (Pattern.prototype as any)[methodName] // eslint-disable-line @typescript-eslint/no-explicit-any
        }
      }
    }
  }

  get components(): Partial<EngineComponents> {
    const bag: Partial<EngineComponents> = {
      streaming: { hapStream: this.hapStream },
    }
    if (this.analyserNode && this.audioCtx) {
      bag.audio = {
        analyser: this.analyserNode,
        audioCtx: this.audioCtx,
        trackAnalysers: this.trackAnalysers.size > 0 ? this.trackAnalysers : undefined,
      }
    }
    bag.queryable = {
      scheduler: this.getPatternScheduler(),
      trackSchedulers: this.trackSchedulers,
    }
    // Build inlineViz from vizRequests + line scanning. Created when there's
    // EITHER an inline viz request OR a code-driven backdrop request, so a
    // bare `.scope()` (backdrop, no inline `.viz()`) still surfaces.
    const hasInlineViz = this.vizRequests.size > 0 && this.lastEvaluatedCode
    if (hasInlineViz || this.backdropVizRequest) {
      bag.inlineViz = {
        vizRequests: hasInlineViz
          ? this.buildVizRequestsWithLines(this.vizRequests, this.lastEvaluatedCode!)
          : new Map(),
        backdropRequest: this.backdropVizRequest
          ? { vizId: this.backdropVizRequest, options: this.backdropVizOptions ?? undefined }
          : undefined,
      }
    }
    // Expose Pattern IR if available
    if (this.lastPatternIR) {
      bag.ir = {
        patternIR: this.lastPatternIR,
        irEvents: this.lastIREvents,
      }
    }
    return bag
  }

  /**
   * Scans code for $: blocks and maps each track's viz request to the line
   * after the last line of that block. Mirrors the line-scanning logic in
   * viewZones.ts but returns structured data instead of creating DOM zones.
   */
  private buildVizRequestsWithLines(
    requests: Map<string, string>,
    code: string,
  ): Map<string, { vizId: string; afterLine: number; contentHash: string; options?: Record<string, unknown> }> {
    const result = new Map<string, { vizId: string; afterLine: number; contentHash: string; options?: Record<string, unknown> }>()
    const lines = code.split('\n')
    let anonIndex = 0

    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].trim().startsWith('$:')) continue

      const key = `$${anonIndex}`
      anonIndex++

      const vizId = requests.get(key)
      if (!vizId) continue

      // Find last line of this pattern block (continuation lines).
      // Blank lines are allowed within a block — only break on a new block
      // start ($:, setcps) or end of file. This handles multi-line patterns
      // with arbitrary whitespace.
      let lastLineIdx = i
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim()
        if (next.startsWith('$:') || next.startsWith('setcps')) break
        if (next !== '' && !next.startsWith('//')) lastLineIdx = j
      }

      // Content hash — first 120 chars of the block, whitespace-normalized.
      // Used by pruneZoneOverrides to detect block reordering.
      const blockLines = lines.slice(i, lastLineIdx + 1).join(' ').replace(/\s+/g, ' ').trim()
      const contentHash = blockLines.slice(0, 120)

      const options = this.vizOptions.get(key)
      result.set(key, { vizId, afterLine: lastLineIdx + 1, contentHash, ...(options ? { options } : {}) })
    }

    return result
  }

  play(): void {
    this.repl?.scheduler?.start()
  }

  stop(): void {
    this.repl?.scheduler?.stop()
  }

  /**
   * Phase 20-07 (DEC-AMENDED-1) — debugger pause. Calls
   * `scheduler.pause()` (NOT `.stop()`) — pause preserves cycle position
   * (cyclist.mjs:112-116), stop rewinds lastEnd to 0 (cyclist.mjs:117-122).
   * Idempotent: setPaused() guards against double-fire of listeners (T17).
   */
  pause(): void {
    this.repl?.scheduler?.pause?.()
    this.setPaused(true)
  }

  /**
   * Phase 20-07 — debugger resume. Calls `scheduler.start()` which uses
   * the preserved lastEnd from pause (cyclist.mjs:101-111). Idempotent.
   */
  resume(): void {
    this.repl?.scheduler?.start?.()
    this.setPaused(false)
  }

  /** Current debugger pause state (true after a breakpoint hit). */
  getPaused(): boolean {
    return this.isPausedState
  }

  /**
   * Subscribe to engine pause-state transitions. Mirrors the
   * subscriber-set pattern used by `LiveCodingRuntime.onPlayingChanged`
   * (RESEARCH Q3). Returns a disposer.
   */
  onPausedChanged(listener: (paused: boolean) => void): () => void {
    this.pauseChangedListeners.add(listener)
    let unsubscribed = false
    return () => {
      if (unsubscribed) return
      unsubscribed = true
      this.pauseChangedListeners.delete(listener)
    }
  }

  /**
   * Phase 20-07 — accessor onto the engine's BreakpointStore. The
   * runtime exposes this through its own `getBreakpointStore()` so the
   * editor's useBreakpoints hook (Wave β) and the Inspector (Wave γ)
   * share a single store.
   */
  getBreakpointStore(): BreakpointStore {
    return this.breakpointStore
  }

  /**
   * Internal — flip pause state and fan out to subscribers, with an
   * idempotence guard (T17): both Inspector + Monaco "Resume" surfaces
   * may fire setPaused(false) simultaneously; this short-circuits the
   * second call so listeners never see a redundant transition.
   */
  private setPaused(paused: boolean): void {
    if (this.isPausedState === paused) return
    this.isPausedState = paused
    for (const l of this.pauseChangedListeners) {
      try {
        l(paused)
      } catch {
        /* listener errors don't break dispatch */
      }
    }
  }

  async record(durationSeconds: number): Promise<Blob> {
    if (!this.analyserNode || !this.audioCtx) {
      throw new Error('StrudelEngine not initialized — call init() first')
    }
    return LiveRecorder.capture(this.analyserNode, this.audioCtx, durationSeconds)
  }

  async renderOffline(
    code: string,
    duration: number,
    sampleRate?: number
  ): Promise<Blob> {
    return OfflineRenderer.render(
      code,
      duration,
      sampleRate ?? this.audioCtx?.sampleRate ?? 44100
    )
  }

  async renderStems(
    stems: Record<string, string>,
    duration: number,
    onProgress?: (stem: string, i: number, total: number) => void
  ): Promise<Record<string, Blob>> {
    const keys = Object.keys(stems)
    const sampleRate = this.audioCtx?.sampleRate ?? 44100

    const blobs = await Promise.all(
      keys.map(async (key, i) => {
        const blob = await OfflineRenderer.render(stems[key], duration, sampleRate)
        onProgress?.(key, i + 1, keys.length)
        return [key, blob] as [string, Blob]
      })
    )
    return Object.fromEntries(blobs)
  }

  getAnalyser(): AnalyserNode {
    if (!this.analyserNode) throw new Error('StrudelEngine not initialized')
    return this.analyserNode
  }

  getAudioContext(): AudioContext {
    if (!this.audioCtx) throw new Error('StrudelEngine not initialized')
    return this.audioCtx
  }

  on(_event: 'hap', handler: HapHandler): void {
    this.hapStream.on(handler)
  }

  off(_event: 'hap', handler: HapHandler): void {
    this.hapStream.off(handler)
  }

  getHapStream(): HapStream {
    return this.hapStream
  }

  /**
   * Returns a thin PatternScheduler wrapper around the Strudel scheduler.
   * Only available after evaluate() succeeds (scheduler.pattern is set then).
   */
  getPatternScheduler(): PatternScheduler | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sched = (this.repl as any)?.scheduler
    const pattern = sched?.pattern
    if (!sched || !pattern) return null
    return {
      now: () => sched.now(),
      query: (begin: number, end: number) => {
        // Side-fix (closes #101): the previous bare normalizeStrudelHap reference
        // passed directly to Array#map received the `index` arg as trackId
        // (latent bug since the trackId param landed). Arrow-wrap explicitly
        // to pass undefined trackId AND the loc lookup. PV38 clause 2 + Trap 8.
        try {
          return pattern
            .queryArc(begin, end)
            .map((hap: unknown) => normalizeStrudelHap(hap, undefined, this.lastIRNodeLocLookup ?? undefined))
        } catch { return [] }
      },
    }
  }

  /**
   * Returns per-track PatternSchedulers captured during the last evaluate() call.
   * Each $: block gets its own scheduler that queries its Pattern directly via queryArc.
   * Keys: anonymous "$:" → "$0", "$1"; named "d1:" → "d1".
   * Empty Map before first evaluate or after evaluate error.
   */
  getTrackSchedulers(): Map<string, PatternScheduler> {
    return this.trackSchedulers
  }

  /**
   * Returns per-track viz requests captured during the last evaluate() call.
   * Maps track keys ("$0", "$1", "d1") to viz descriptor IDs ("pianoroll", "scope").
   * Only patterns that called .viz("name") in user code appear in this map.
   * Empty Map before first evaluate or if no patterns use .viz().
   */
  getVizRequests(): Map<string, string> {
    return this.vizRequests
  }


  /** Register a handler for runtime audio errors (fires during scheduling, not evaluation). */
  setRuntimeErrorHandler(handler: (err: Error) => void): void {
    this.runtimeErrorHandler = handler
  }

  /** Returns all sound names registered after init() — useful for editor autocompletion. */
  getSoundNames(): string[] {
    return this.loadedSoundNames
  }

  dispose(): void {
    this.repl?.scheduler?.stop()
    this.hapStream.dispose()
    this.analyserNode?.disconnect()
    for (const analyser of this.trackAnalysers.values()) {
      try { analyser.disconnect() } catch { /* already disconnected */ }
    }
    this.trackAnalysers.clear()
    this.trackOrbit.clear()
    // Phase 20-07 — clear breakpoint registry + pause listeners on dispose.
    this.breakpointStore.dispose()
    this.pauseChangedListeners.clear()
    this.initialized = false
    this.repl = null
  }

  /**
   * Query a pattern for its first non-silent hap within [0, lookahead) cycles
   * and return the orbit it uses. Default orbit is 1 (superdough's default).
   * Returns 1 for silent patterns — falls back to orbit 1 just like superdough.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private resolveOrbit(pattern: any): number {
    const tryArc = (begin: number, end: number): number | null => {
      try {
        const haps = pattern.queryArc(begin, end) as Array<{ value?: { orbit?: number } }>
        for (const h of haps) {
          const o = h?.value?.orbit
          if (typeof o === 'number') return o
        }
      } catch { /* pattern may throw on empty/invalid arcs */ }
      return null
    }
    return tryArc(0, 1) ?? tryArc(0, 4) ?? 1
  }

  /**
   * Reconcile trackAnalysers against capturedPatterns.
   * - Creates analysers for new captureIds, tapped off their orbit's GainNode.
   * - Reuses analysers when (captureId, orbit) is unchanged.
   * - Rewires when a captureId's orbit changed (disconnect old, tap new).
   * - Removes+disconnects analysers for captureIds no longer present.
   *
   * Safe to call repeatedly. No-op if audioController isn't available yet.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rebuildTrackAnalysers(capturedPatterns: Map<string, any>): void {
    if (!this.audioController || !this.audioCtx) return

    const seen = new Set<string>()
    for (const [captureId, pattern] of capturedPatterns) {
      seen.add(captureId)
      const orbit = this.resolveOrbit(pattern)
      const existingOrbit = this.trackOrbit.get(captureId)
      const existingAnalyser = this.trackAnalysers.get(captureId)

      if (existingAnalyser && existingOrbit === orbit) continue // reuse — same tap

      // Force-create orbit if it doesn't exist yet — superdough lazy-creates
      // orbits on first hap, but we need the GainNode available NOW to tap.
      let orbitNode: { output?: AudioNode } | null = null
      try {
        orbitNode = this.audioController.getOrbit(orbit, [0, 1])
      } catch (err) {
        console.warn(`[stave] Could not resolve superdough orbit ${orbit} for "${captureId}":`, err)
      }
      const orbitOutput = orbitNode?.output
      if (!orbitOutput) {
        // No orbit available — if we had an analyser, keep it for now; consumer's
        // last value is better than suddenly null. Do not pollute the map.
        continue
      }

      // Reuse the existing AnalyserNode when the track persists but its orbit
      // changed. This keeps the AnalyserNode identity stable across
      // re-evaluates — consumers can hold references without flicker. We just
      // rewire the tap: disconnect old orbit source, connect new.
      const analyser = existingAnalyser ?? this.audioCtx.createAnalyser()
      if (!existingAnalyser) {
        analyser.fftSize = 2048
        analyser.smoothingTimeConstant = 0.8
      } else {
        // Source changed — drop incoming connections so the analyser only hears
        // the new orbit. disconnect() with no args is fine on AnalyserNode; the
        // downstream consumers (viz canvases) read via getByteFrequencyData and
        // have no graph connection to sever.
        try { analyser.disconnect() } catch { /* noop */ }
      }
      try {
        orbitOutput.connect(analyser)
      } catch (err) {
        console.warn(`[stave] Could not tap orbit ${orbit} for "${captureId}":`, err)
        continue
      }
      this.trackAnalysers.set(captureId, analyser)
      this.trackOrbit.set(captureId, orbit)
    }

    // Purge analysers for captureIds no longer present.
    for (const captureId of [...this.trackAnalysers.keys()]) {
      if (seen.has(captureId)) continue
      const a = this.trackAnalysers.get(captureId)
      if (a) { try { a.disconnect() } catch { /* noop */ } }
      this.trackAnalysers.delete(captureId)
      this.trackOrbit.delete(captureId)
    }
  }
}
