import { HapStream } from './HapStream'
import { LiveRecorder } from './LiveRecorder'
import { OfflineRenderer } from './OfflineRenderer'
import { normalizeStrudelHap } from './NormalizedHap'
import type { HapEvent } from './HapStream'
import type { PatternScheduler } from '../visualizers/types'
import type { LiveCodingEngine, EngineComponents } from './LiveCodingEngine'
import { propagate, StrudelParseSystem, IREventCollectSystem } from '../ir/propagation'
import type { PatternIR } from '../ir/PatternIR'
import type { IREvent } from '../ir/IREvent'

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

  async init(): Promise<void> {
    if (this.initialized) return

    // Load all strudel modules up-front so evalScope can register their
    // exports (note, s, gain, stack, etc.) into globalThis.  The eval'd user
    // code runs inside Function() with no special scope, so every function it
    // calls must be a global.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [coreMod, miniMod, tonalMod, webaudioMod, soundfontsMod, xenMod, midiMod] = await Promise.all([
      import('@strudel/core') as Promise<any>,
      import('@strudel/mini') as Promise<any>,
      import('@strudel/tonal') as Promise<any>,
      import('@strudel/webaudio') as Promise<any>,
      import('@strudel/soundfonts') as Promise<any>,
      import('@strudel/xen') as Promise<any>,
      import('@strudel/midi') as Promise<any>,
    ])

    // Register all module exports into globalThis so eval'd patterns can use them
    // (note, s, gain, stack, etc. must be globals — user code runs in Function())
    // midi: uses onTrigger (additive) — highlighting still fires for every hap.
    //        enableWebMidi() is NOT called here; users call it explicitly (triggers browser permission prompt).
    // drawMod (@strudel/draw) intentionally excluded: it injects a full-screen canvas
    // into document.body (id="test-canvas") the first time any draw function runs.
    // Stave uses its own visualizer system, so strudel's canvas draw functions
    // (pianoroll, drawFrequencyScope, etc.) are not exposed to user code.
    await coreMod.evalScope(coreMod, miniMod, tonalMod, webaudioMod, soundfontsMod, xenMod, midiMod)

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
    //   deadline = AudioContext time when note plays
    //   duration = note duration in seconds
    //   cps = cycles per second
    //   t = current AudioContext.currentTime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedOutput = async (hap: any, deadline: number, duration: number, cps: number, t: number) => {
      // Emit to all visualizers / highlighters BEFORE triggering audio
      hapStream.emit(hap, deadline, duration, cps, audioCtxRef.currentTime)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (webaudioOutput as any)(hap, deadline, duration, cps, t)
      } catch (err) {
        // Route scheduler-time errors (e.g. "sound X not found", "cannot parse as numeral")
        // through the registered handler so they surface in the editor UI, not just the console.
        const error = err instanceof Error ? err : new Error(String(err))
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

    this.initialized = true
  }

  async evaluate(code: string): Promise<{ error?: Error }> {
    if (!this.initialized) await this.init()
    this.lastEvaluatedCode = code

    const capturedPatterns = new Map<string, any>() // eslint-disable-line @typescript-eslint/no-explicit-any
    const capturedVizRequests = new Map<string, string>()
    let anonIndex = 0

    // Dynamic import — Pattern is from @strudel/core which is already loaded after init()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Pattern } = await import('@strudel/core') as any

    // Save current descriptor (may be value descriptor from previous injectPatternMethods)
    const savedDescriptor = Object.getOwnPropertyDescriptor(Pattern.prototype, 'p')
    const savedVizDescriptor = Object.getOwnPropertyDescriptor(Pattern.prototype, 'viz')

    // Legacy viz names for backwards compat with Strudel's ._pianoroll(), ._scope(), etc.
    const legacyVizNames = ['pianoroll', 'punchcard', 'wordfall', 'scope', 'fscope', 'spectrum', 'spiral', 'pitchwheel', 'markCSS']
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
          value: function(this: any, vizName: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            // Extract viz name — see `extractVizName` for the full
            // explanation of Strudel's reify-induced shapes. Pure
            // helper exported for unit testing.
            const resolvedName = extractVizName(vizName)
            // Chain to Strudel's .viz() if it exists
            const result = strudelViz ? strudelViz.call(this, vizName) : this
            // Tag the RETURNED pattern with the resolved viz name
            if (resolvedName) {
              result._pendingViz = resolvedName
            }
            return result
          },
        })

        // Install legacy ._pianoroll(), ._scope(), etc. wrappers AFTER injectPatternMethods
        for (const name of legacyVizNames) {
          const methodName = `_${name}`
          savedLegacyDescriptors.set(methodName, Object.getOwnPropertyDescriptor(Pattern.prototype, methodName))
          const strudelLegacy = (Pattern.prototype as any)[methodName] // eslint-disable-line @typescript-eslint/no-explicit-any
          Object.defineProperty(Pattern.prototype, methodName, {
            configurable: true,
            writable: true,
            value: function(this: any, ...args: any[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
              const result = strudelLegacy ? strudelLegacy.apply(this, args) : this
              result._pendingViz = name
              return result
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
              capturedPatterns.set(captureId, this)

              // Resolve pending .viz() request — .viz() fires BEFORE .p() in chain
              if (this._pendingViz && typeof this._pendingViz === 'string') {
                capturedVizRequests.set(captureId, this._pendingViz)
                delete this._pendingViz
              }
            }
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
          this.trackSchedulers.set(id, {
            now: () => sched.now(),
            query: (begin: number, end: number) => {
              try { return captured.queryArc(begin, end).map(normalizeStrudelHap) } catch { return [] }
            },
          })
        }
        this.vizRequests = capturedVizRequests

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
      } else {
        // Failed evaluate — clear stale IR
        this.lastPatternIR = null
        this.lastIREvents = []
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
    // Build inlineViz from vizRequests + line scanning
    if (this.vizRequests.size > 0 && this.lastEvaluatedCode) {
      bag.inlineViz = {
        vizRequests: this.buildVizRequestsWithLines(this.vizRequests, this.lastEvaluatedCode),
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
  ): Map<string, { vizId: string; afterLine: number }> {
    const result = new Map<string, { vizId: string; afterLine: number }>()
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
        // New block starts — stop here
        if (next.startsWith('$:') || next.startsWith('setcps')) break
        // Track the last non-empty line as the block end
        if (next !== '') lastLineIdx = j
      }

      result.set(key, { vizId, afterLine: lastLineIdx + 1 }) // 1-indexed
    }

    return result
  }

  play(): void {
    this.repl?.scheduler?.start()
  }

  stop(): void {
    this.repl?.scheduler?.stop()
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
        try { return pattern.queryArc(begin, end).map(normalizeStrudelHap) } catch { return [] }
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
