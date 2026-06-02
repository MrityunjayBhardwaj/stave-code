/**
 * SignalBus — renderer-agnostic per-sound / per-track musical-signal bus.
 *
 * PURE module (P12): imports ONLY types + `noteToMidi`. NO p5 / hydra /
 * renderer import — anything that transitively imports the bus (every unit
 * test) must load in isolation. Renderers WRAP the shape (p5 getter-numbers,
 * hydra `() => number` thunks, D-01); the bus only knows numbers, maps, and
 * the alias constant.
 *
 * It generalizes two pre-existing per-renderer feeds:
 *   - `.env`  — `HapEnergyEnvelope`'s bump+decay (decay 0.92, clamp 0..1),
 *               but keyed `Map<sound, level>` on `e.s` ('bd'), NOT by MIDI bin.
 *   - instantaneous (`.velocity`/`.note`/`.color`) — `H()`'s query-at-now read
 *               (`scheduler.query(now, now + ε)`), ε = 0.001.
 *
 * ## Two key spaces (RESEARCH §5 — TRAP)
 * `track(id)` keys on the SCHEDULER key space — `trackSchedulers.get(id)` whose
 * keys are `$0`/`$1` (anonymous) or `d1`/`drums` (named). It does NOT key on
 * `IREvent.trackId` (which is `d1`/`d{N}` and DIFFERS from the scheduler key for
 * anonymous blocks). Keying on `IREvent.trackId` silently breaks anonymous-block
 * addressing.
 *
 * ## Per-field feed (RESEARCH §5 — TRAP)
 * `.env`      ← the envelope feed (`bump()` + `tick()` decay).
 * `.velocity` ← the SCHEDULER-query feed (active IREvent). `HapEvent` carries NO
 *               `velocity` — sourcing it from the envelope feed = silent ZERO.
 * `.note`     ← the scheduler-query feed (preserves the user's form, name|number).
 * `.color`    ← either feed (prefer the active IREvent; fall back to last bump).
 */

import { noteToMidi } from '../../engine/noteToMidi'
import type { IRPattern } from '../../ir/IRPattern'
import type { IREvent } from '../../ir/IREvent'
import { ALIAS_MAP } from './aliasMap'

/** Minimal shape the `.env` feed consumes off a HapStream event.
 *  We deliberately type only the fields the bus reads (`s`, optional gain via
 *  `hap.value.gain`, optional color) so the bus does NOT import HapEvent and
 *  stays decoupled from the engine event class (P12 — structural typing). */
export interface BusHapEvent {
  /** Instrument/sample name — the env-map key. */
  s: string | null
  /** From `.color()` in the pattern (last-bumped fallback for `.color`). */
  color?: string | null
  /** Full Strudel hap — gain is read from `hap?.value?.gain`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hap?: any
}

/** What an accessor returns for a single sound or track. */
export interface SignalReading {
  /** Decayed envelope level 0..1 (envelope feed). */
  env: number
  /** Active-event velocity 0..1 (scheduler feed — NOT the envelope). */
  velocity: number
  /** Active-event note in the user's form (name|number|null — scheduler feed). */
  note: number | string | null
  /** Display color (active event preferred, else last-bumped hap). */
  color: string | null
}

/** ε window for the query-at-now read — matches `H()`'s 1ms window
 *  (`HydraVizRenderer.ts:175`): below one audio sample at 48kHz, so a
 *  correctly-scheduled event is caught at least once. */
const EPSILON = 0.001

/** Decay constant — reused from `HapEnergyEnvelope` (`HydraVizRenderer.ts:60`). */
const DEFAULT_DECAY = 0.92

export class SignalBus {
  /** Per-sound envelope levels (0..1), decayed each frame. Keyed on `e.s`. */
  private readonly envMap = new Map<string, number>()
  /** Last-bumped color per sound — the `.color` fallback feed. */
  private readonly colorMap = new Map<string, string | null>()
  private readonly decay: number
  private readonly aliasMap: Record<string, string | string[]>

  /** Live refs — mutable so `bindScheduler()` rebinds in place
   *  (mirrors `HydraVizRenderer.update` live-ref discipline, `:369-371`). */
  private scheduler: IRPattern | null = null
  private trackSchedulers: Map<string, IRPattern> = new Map()

  /** Per-frame snapshot of active events from the combined scheduler feed
   *  (set by `refreshActive`). The instantaneous feed for `sound()`. */
  private activeEvents: IREvent[] = []
  /** Per-frame snapshot of active events per track-key (scheduler key space). */
  private activeByTrack = new Map<string, IREvent[]>()
  /** Every distinct `e.s` ever bumped — backs `get sounds()`. */
  private readonly seenSounds = new Set<string>()

  constructor(aliasMap: Record<string, string | string[]> = ALIAS_MAP) {
    this.aliasMap = aliasMap
    this.decay = DEFAULT_DECAY
  }

  /** Store live scheduler refs (mutable rebind — mirror the renderer's
   *  in-place update discipline). Pass `null`/empty in demo mode. */
  bindScheduler(
    scheduler: IRPattern | null | undefined,
    trackSchedulers: Map<string, IRPattern> | null | undefined,
  ): void {
    this.scheduler = scheduler ?? null
    this.trackSchedulers = trackSchedulers ?? new Map()
  }

  // ── .env feed (envelope: bump + decay) ──────────────────────────────────

  /** Bump the envelope for an event's sound. Mirrors `HapEnergyEnvelope.onHap`
   *  (`:67-82`): gain clamped 0..1, level = min(1, prev + gain). Keyed on
   *  `e.s` (NOT a MIDI bin). No-ops for an event with no sound name. */
  bump(e: BusHapEvent): void {
    const sound = e.s
    if (sound == null) return
    const gain = Math.min(1, Math.max(0, e.hap?.value?.gain ?? 1))
    const prev = this.envMap.get(sound) ?? 0
    this.envMap.set(sound, Math.min(1, prev + gain))
    if (e.color != null) this.colorMap.set(sound, e.color)
    else if (!this.colorMap.has(sound)) this.colorMap.set(sound, null)
    this.seenSounds.add(sound)
  }

  /** Apply decay to every envelope entry. Call ONCE per frame, BEFORE
   *  `refreshActive` (mirror `HapEnergyEnvelope.tick`, `:85-89`). */
  tick(): void {
    for (const [sound, level] of this.envMap) {
      this.envMap.set(sound, level * this.decay)
    }
  }

  // ── instantaneous feed (scheduler query-at-now) ─────────────────────────

  /** Snapshot the active events at `now` from the combined scheduler and each
   *  per-track scheduler. Call ONCE per frame, AFTER `tick()`. The window is
   *  [now, now + ε) — the same tight window `H()` uses (`:175`). */
  refreshActive(now: number): void {
    const begin = now
    const end = now + EPSILON
    this.activeEvents = this.scheduler ? this.scheduler.query(begin, end) : []
    this.activeByTrack.clear()
    // Key on the SCHEDULER key space (TRAP §5) — trackSchedulers.keys() are
    // `$0`/`$1`/`d1`/`drums`, NOT IREvent.trackId.
    for (const [key, sched] of this.trackSchedulers) {
      this.activeByTrack.set(key, sched.query(begin, end))
    }
  }

  /** Current scheduler time (mirror `H()`'s `sched.now()`), 0 in demo mode. */
  now(): number {
    return this.scheduler ? this.scheduler.now() : 0
  }

  // ── accessors ───────────────────────────────────────────────────────────

  /** Resolve an alias OR a raw sound name to a list of concrete sound names.
   *  `'uKick'` → `['bd']`, `'uTom'` → `['lt','mt','ht']`, `'bd'` → `['bd']`. */
  private resolveSounds(soundOrAlias: string): string[] {
    const mapped = this.aliasMap[soundOrAlias]
    if (mapped == null) return [soundOrAlias]
    return Array.isArray(mapped) ? mapped : [mapped]
  }

  /** Decayed envelope level for a sound or alias. Array aliases (`uTom`)
   *  resolve as MAX over members. Demo-mode / never-fired → 0. */
  envValue(soundOrAlias: string): number {
    let max = 0
    for (const sound of this.resolveSounds(soundOrAlias)) {
      const v = this.envMap.get(sound) ?? 0
      if (v > max) max = v
    }
    return max
  }

  /** Find the first active IREvent (combined feed) whose `s` is in `sounds`. */
  private activeEventForSounds(sounds: string[]): IREvent | undefined {
    const set = new Set(sounds)
    for (const ev of this.activeEvents) {
      if (ev.s != null && set.has(ev.s)) return ev
    }
    return undefined
  }

  /** Per-sound reading — merged across tracks via the combined active feed
   *  (D-03). `.env` from the envelope; `.velocity`/`.note` from the active
   *  IREvent (NOT the envelope — silent-zero trap §5); `.color` from the
   *  active IREvent, falling back to the last-bumped hap color. */
  sound(soundOrAlias: string): SignalReading {
    const sounds = this.resolveSounds(soundOrAlias)
    const env = this.envValue(soundOrAlias)
    const ev = this.activeEventForSounds(sounds)
    return {
      env,
      velocity: ev?.velocity ?? 0,
      note: ev?.note ?? null,
      color: ev?.color ?? this.colorFallback(sounds),
    }
  }

  /** Last-bumped color over the resolved sounds (the `.color` fallback feed). */
  private colorFallback(sounds: string[]): string | null {
    for (const sound of sounds) {
      const c = this.colorMap.get(sound)
      if (c != null) return c
    }
    return null
  }

  /** Per-track reading, keyed on the SCHEDULER key space (TRAP §5 —
   *  `trackSchedulers.get(id)`, NOT IREvent.trackId). `.env` is the max env over
   *  the sounds this track fired this frame; `.velocity`/`.note`/`.color` come
   *  from the track's first active IREvent (scheduler feed). A `sound(s)`
   *  sub-accessor reads a specific sound within the track. Unknown id → zeros. */
  track(id: string): SignalReading & { sound: (s: string) => SignalReading } {
    const events = this.activeByTrack.get(id) ?? []
    const first = events[0]
    const trackSounds = events
      .map((e) => e.s)
      .filter((s): s is string => s != null)
    let env = 0
    for (const s of trackSounds) {
      const v = this.envMap.get(s) ?? 0
      if (v > env) env = v
    }
    const soundIn = (soundOrAlias: string): SignalReading => {
      const resolved = new Set(this.resolveSounds(soundOrAlias))
      const ev = events.find((e) => e.s != null && resolved.has(e.s))
      let sEnv = 0
      for (const s of this.resolveSounds(soundOrAlias)) {
        const v = this.envMap.get(s) ?? 0
        if (v > sEnv) sEnv = v
      }
      return {
        env: sEnv,
        velocity: ev?.velocity ?? 0,
        note: ev?.note ?? null,
        color: ev?.color ?? null,
      }
    }
    return {
      env,
      velocity: first?.velocity ?? 0,
      note: first?.note ?? null,
      color: first?.color ?? null,
      sound: soundIn,
    }
  }

  /** Enumerate the published track keys — the SCHEDULER key space
   *  (`trackSchedulers.keys()`, §5), e.g. `['$0','$1']` or `['d1','drums']`. */
  get tracks(): string[] {
    return [...this.trackSchedulers.keys()]
  }

  /** Enumerate distinct sounds ever bumped through the envelope feed. */
  get sounds(): string[] {
    return [...this.seenSounds]
  }

  /** Normalize a note to a MIDI number (P93 — only when a NUMBER is explicitly
   *  requested; the raw `.note` preserves the user's name|number form). Returns
   *  null for percussion sample names / unrecognized input. */
  noteToMidi(note: number | string | null): number | null {
    if (note == null) return null
    return noteToMidi(note)
  }
}
