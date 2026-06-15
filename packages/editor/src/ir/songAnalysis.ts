/**
 * songAnalysis — full-song analysis for the navigable timeline (#385).
 *
 * Re-expresses the reference editor's `analyze`/`attribute` capabilities on
 * top of our IR: query the evaluated pattern over a PROGRESSIVE horizon
 * (hint-seeded, doubling to a cap) in budget-bounded slices, accumulate
 * per-lane onset activity, detect the loop PERIOD from per-cycle fingerprints,
 * and partition the horizon into SECTIONS by active-lane signature.
 *
 * Design SoT: VISUAL-EDITING-AND-SCRUB-DESIGN.md §7.5. Runs off the in-memory
 * IR and NEVER calls `toStrudel` (no fidelity tax). Pure sub-functions operate
 * on already-collected `IREvent[]`; the async `analyzeSong` wrapper owns the
 * budgeted collection. Both the collector, the clock, and the yield primitive
 * are injectable so the slicing logic is deterministic under test.
 *
 * Attribution note: lanes key on `trackId ?? s ?? '$default'` — the SAME key
 * the timeline's `groupEventsByTrack` uses — so analysis lanes line up exactly
 * with rendered rows. `trackId`/`dollarPos` already carry IR-node provenance
 * (assigned by collect.ts), so this is reuse, not a parallel attribution path.
 *
 * Seek caveat (§7.4): patterns with RNG/state (`degrade`, `shuffle`, running
 * counters) have no clean loop — `detectPeriod` returns null and the horizon
 * falls back to the analyzed cap. Documented edge, not a bug.
 */

import type { PatternIR } from './PatternIR'
import type { IREvent } from './IREvent'
import { collectCycles } from './collect'

/**
 * Lane (row) key for an event. Mirrors `groupEventsByTrack`'s key so analysis
 * lanes and rendered timeline rows share identity.
 */
export function laneKeyOf(ev: IREvent): string {
  return ev.trackId ?? ev.s ?? '$default'
}

export interface LaneActivity {
  readonly laneKey: string
  /** `onsetsByCycle[c]` = count of event onsets with `floor(begin) === c`.
   *  Length === `horizonCycles`. */
  readonly onsetsByCycle: readonly number[]
}

export interface SongSection {
  /** First cycle of the section (inclusive). */
  readonly startCycle: number
  /** One past the last cycle (exclusive). */
  readonly endCycle: number
  /** Lane keys active anywhere in the section, sorted for stable identity. */
  readonly laneKeys: readonly string[]
}

export interface SongAnalysis {
  /** Detected loop period in cycles, or `null` if none within the horizon. */
  readonly periodCycles: number | null
  /** Number of cycles actually analyzed. */
  readonly horizonCycles: number
  /** Per-lane onset activity across the horizon, in first-seen lane order. */
  readonly lanes: readonly LaneActivity[]
  /** Contiguous sections partitioning `[0, horizonCycles)` by active-lane set. */
  readonly sections: readonly SongSection[]
  /** True when the progressive horizon reached the cap before a period was
   *  found (e.g. RNG/stateful patterns with no clean loop). */
  readonly reachedCap: boolean
}

// ---------------------------------------------------------------------------
// Pure analysis over already-collected events
// ---------------------------------------------------------------------------

/**
 * Accumulate per-lane onset counts bucketed by integer cycle over
 * `[0, horizon)`. Lane order is first-seen (matching `groupEventsByTrack`).
 * Events whose `floor(begin)` lands outside `[0, horizon)` are ignored.
 */
export function accumulateLanes(
  events: readonly IREvent[],
  horizon: number,
): LaneActivity[] {
  const order: string[] = []
  const byLane = new Map<string, number[]>()
  for (const ev of events) {
    const cycle = Math.floor(ev.begin)
    if (!Number.isFinite(cycle) || cycle < 0 || cycle >= horizon) continue
    const key = laneKeyOf(ev)
    let counts = byLane.get(key)
    if (!counts) {
      counts = new Array<number>(horizon).fill(0)
      byLane.set(key, counts)
      order.push(key)
    }
    counts[cycle] += 1
  }
  return order.map((laneKey) => ({ laneKey, onsetsByCycle: byLane.get(laneKey)! }))
}

/**
 * Per-cycle fingerprint string — a sorted signature of every onset's
 * (lane, within-cycle offset, note) in that cycle. Two cycles with identical
 * fingerprints are musically identical, which is what period detection needs.
 * Within-cycle offset is quantised to 1e-6 to absorb float noise from the
 * rational→number conversion in collect.
 */
export function cycleFingerprints(
  events: readonly IREvent[],
  horizon: number,
): string[] {
  const perCycle: string[][] = Array.from({ length: horizon }, () => [])
  for (const ev of events) {
    const cycle = Math.floor(ev.begin)
    if (!Number.isFinite(cycle) || cycle < 0 || cycle >= horizon) continue
    const offset = Math.round((ev.begin - cycle) * 1e6)
    const note = ev.note ?? ''
    perCycle[cycle].push(`${laneKeyOf(ev)}@${offset}:${note}`)
  }
  return perCycle.map((tokens) => tokens.sort().join('|'))
}

/**
 * Smallest period `p` in `[1, floor(len/2)]` such that every cycle equals the
 * cycle `p` ahead of it — and at least two full repetitions exist (`len >= 2p`)
 * so a one-off prefix can't masquerade as a period. Returns `null` when no
 * such period exists within the analyzed length.
 */
export function detectPeriod(fingerprints: readonly string[]): number | null {
  const len = fingerprints.length
  // All-silent windows trivially "repeat" at period 1 — but silence is not a
  // song period (it would also make a silent intro stop progressive growth
  // early). Require at least one onset somewhere before claiming any period.
  if (fingerprints.every((fp) => fp === '')) return null
  for (let p = 1; p <= Math.floor(len / 2); p++) {
    let repeats = true
    for (let c = 0; c + p < len; c++) {
      if (fingerprints[c] !== fingerprints[c + p]) {
        repeats = false
        break
      }
    }
    if (repeats) return p
  }
  return null
}

/**
 * Partition `[0, horizon)` into contiguous sections, cutting wherever the set
 * of active lanes (lanes with ≥1 onset in that cycle) changes. Captures the
 * musical arc — intro/drop/breakdown emerge as the active-lane set thins and
 * thickens. Silent runs become their own (empty-lane) sections.
 */
export function computeSections(
  lanes: readonly LaneActivity[],
  horizon: number,
): SongSection[] {
  if (horizon <= 0) return []
  const signatureAt = (cycle: number): string[] =>
    lanes
      .filter((l) => (l.onsetsByCycle[cycle] ?? 0) > 0)
      .map((l) => l.laneKey)
      .sort()

  const sections: SongSection[] = []
  let start = 0
  let sig = signatureAt(0)
  let sigKey = sig.join('|')
  for (let c = 1; c < horizon; c++) {
    const nextSig = signatureAt(c)
    const nextKey = nextSig.join('|')
    if (nextKey !== sigKey) {
      sections.push({ startCycle: start, endCycle: c, laneKeys: sig })
      start = c
      sig = nextSig
      sigKey = nextKey
    }
  }
  sections.push({ startCycle: start, endCycle: horizon, laneKeys: sig })
  return sections
}

/**
 * Compose the pure analysis: lanes + period + sections over `[0, horizon)`.
 * `reachedCap` is supplied by the caller (it's a property of the collection
 * loop, not of the events). Synchronous — used directly in unit tests.
 */
export function analyzeEvents(
  events: readonly IREvent[],
  horizon: number,
  reachedCap = false,
): SongAnalysis {
  const lanes = accumulateLanes(events, horizon)
  const periodCycles = detectPeriod(cycleFingerprints(events, horizon))
  const sections = computeSections(lanes, horizon)
  return { periodCycles, horizonCycles: horizon, lanes, sections, reachedCap }
}

// ---------------------------------------------------------------------------
// Budgeted progressive-horizon collection
// ---------------------------------------------------------------------------

export interface AnalyzeSongOptions {
  /** Initial horizon to collect before the first period check (default 8). */
  hintCycles?: number
  /** Maximum horizon to grow to (default 256). */
  capCycles?: number
  /** Cycles collected per slice before a budget check (default 4). */
  sliceCycles?: number
  /** Wall-clock budget (ms) between yields to the event loop (default 10). */
  sliceBudgetMs?: number
  /** Collector — defaults to `collectCycles(ir, …)`. Injected in tests. */
  collectFn?: (startCycle: number, endCycle: number) => IREvent[]
  /** Clock — defaults to `performance.now()`. Injected in tests. */
  now?: () => number
  /** Yield to the event loop between budgeted slices. Default = macrotask. */
  yieldFn?: () => Promise<void>
  /** Cooperative cancellation; checked between slices. */
  signal?: { readonly aborted: boolean }
}

const DEFAULT_HINT = 8
const DEFAULT_CAP = 256
const DEFAULT_SLICE = 4
const DEFAULT_BUDGET_MS = 10

function defaultNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function defaultYield(): Promise<void> {
  // Macrotask yield — lets the audio scheduler's lookahead (~100ms) and paint
  // run between slices so analysis never starves the main thread.
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Analyze the whole song off the in-memory IR. Collects a progressive horizon
 * (hint → doubling → cap) in budget-bounded slices, yielding to the event loop
 * whenever a slice exceeds `sliceBudgetMs`, and stops as soon as a loop period
 * is confirmed (or the cap is hit). Returns a `SongAnalysis` describing lanes,
 * period, and sections.
 *
 * `null` IR (or a collector returning nothing) yields an empty analysis.
 */
export async function analyzeSong(
  ir: PatternIR | null,
  opts: AnalyzeSongOptions = {},
): Promise<SongAnalysis> {
  const hint = Math.max(1, Math.floor(opts.hintCycles ?? DEFAULT_HINT))
  const cap = Math.max(hint, Math.floor(opts.capCycles ?? DEFAULT_CAP))
  const slice = Math.max(1, Math.floor(opts.sliceCycles ?? DEFAULT_SLICE))
  const budgetMs = opts.sliceBudgetMs ?? DEFAULT_BUDGET_MS
  const collectFn =
    opts.collectFn ?? ((s: number, e: number) => (ir ? collectCycles(ir, s, e) : []))
  const now = opts.now ?? defaultNow
  const yieldFn = opts.yieldFn ?? defaultYield
  const signal = opts.signal

  const events: IREvent[] = []
  let collectedTo = 0 // events exist for [0, collectedTo)
  let horizon = hint
  let lastYield = now()

  // Collect [collectedTo, target) in budgeted slices, appending to `events`.
  const collectUpTo = async (target: number): Promise<boolean> => {
    while (collectedTo < target) {
      if (signal?.aborted) return false
      const sliceEnd = Math.min(collectedTo + slice, target)
      events.push(...collectFn(collectedTo, sliceEnd))
      collectedTo = sliceEnd
      if (now() - lastYield >= budgetMs && collectedTo < target) {
        await yieldFn()
        lastYield = now()
      }
    }
    return true
  }

  while (true) {
    const ok = await collectUpTo(horizon)
    if (!ok) break // aborted — return whatever we have at the current horizon
    // Nothing playing at all (null IR / fully silent pattern) → nothing to
    // analyze. Short-circuit to an empty analysis rather than growing the
    // horizon to the cap over empty cycles.
    if (events.length === 0) return analyzeEvents([], 0, false)
    const period = detectPeriod(cycleFingerprints(events, horizon))
    if (period !== null) {
      return analyzeEvents(events, horizon, false)
    }
    if (horizon >= cap) {
      return analyzeEvents(events, cap, true)
    }
    horizon = Math.min(horizon * 2, cap)
  }

  // Aborted path — analyze what was collected.
  return analyzeEvents(events, Math.min(horizon, collectedTo), false)
}
