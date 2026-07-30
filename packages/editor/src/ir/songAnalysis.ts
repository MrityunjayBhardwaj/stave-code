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
 * Seek caveat (§7.4): a pattern with no exact repeat has no clean loop —
 * `detectPeriod` returns null and the horizon falls back to the analyzed cap.
 *
 * ⚠ THAT CLASS IS MUCH LARGER THAN THE RNG CASE THIS COMMENT USED TO NAME.
 * Since the cycle fingerprint reads the event's whole value partition (#1102),
 * any CONTINUOUSLY MODULATED control — `.cutoff(sine)`, a slow `gain` LFO —
 * makes every cycle genuinely differ, and such a document is aperiodic in the
 * only sense this function measures. Swept over 150 real tunes: 69 of the 142
 * that evaluate land on the cap, up from 53. That is the true answer about the
 * EVENTS; what the display should do with it is #1104, and it is a display
 * question, not a reason to ask a narrower question about identity here.
 */

import type { PatternIR } from './PatternIR'
import type { IREvent } from './IREvent'
import { eventValueKey } from './eventValueKey'

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
 * (lane, within-cycle offset, VALUE) in that cycle. Two cycles with identical
 * fingerprints are musically identical, which is what period detection needs.
 * Within-cycle offset is quantised to 1e-6 to absorb float noise from the
 * rational→number conversion in collect.
 *
 * The value half is `eventValueKey` — the adapter's WHOLE value partition, not
 * a subset curated here. It used to be `ev.note` alone, which meant an
 * arrangement whose sections differ only by which SAMPLE plays fingerprinted as
 * identical cycles: `detectPeriod` honestly returned 1 and the Song view's
 * display span collapsed to a single cycle (#1102). `s` had only ever reached
 * this token by accident, via `laneKeyOf`'s `trackId ?? s` fallback, so every
 * event carrying a real `trackId` — which is every event in production — lost
 * it. Naming `s` here would have fixed the one fixture and left the param and
 * gain axes just as blind; the fix is to stop curating (see `eventValueKey`).
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
    perCycle[cycle].push(`${laneKeyOf(ev)}@${offset}:${eventValueKey(ev)}`)
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
 * The Song-view DISPLAY period — the longest SINGLE lane's own loop, NOT the
 * global combined period. This is the DAW/sequencer idiom for tracks of
 * differing lengths (Ableton/Logic Live Loops/Elektron polymeter): each track
 * keeps its own length and they PHASE; the least-common-multiple is only WHEN
 * they realign, never the displayed span. A 5-cycle track beside a 4-cycle
 * track shows a 5-cycle view (the 4-cycle loop repeats/phases inside it), not
 * lcm(5,4)=20 (#488, grounded in real DAW manuals).
 *
 * Per lane: `detectPeriod` over THAT lane's fingerprints. Returns the `max`
 * across lanes. Returns `null` if ANY active lane has no detectable period
 * within `horizon` — the caller then grows the horizon (or, at the cap, falls
 * back to the analyzed length, marking the song aperiodic). For a single lane
 * this is identical to `detectPeriod`; for equal-length lanes `max == lcm` so
 * equal-length songs are unchanged — only differing lengths diverge, exactly
 * the polymeter case. Cheaper convergence too: it needs ~2× the LONGEST lane,
 * not 2× the lcm.
 */
export function detectDisplayPeriod(
  events: readonly IREvent[],
  horizon: number,
): number | null {
  const byLane = eventsByLane(events)
  if (byLane.size === 0) return detectPeriod(cycleFingerprints(events, horizon))
  let maxPeriod = 0
  for (const laneEvents of byLane.values()) {
    const p = detectPeriod(cycleFingerprints(laneEvents, horizon))
    if (p === null) return null // a lane hasn't looped yet within the horizon
    if (p > maxPeriod) maxPeriod = p
  }
  return maxPeriod > 0 ? maxPeriod : null
}

/** Group events by lane key. Shared by the two combine rules so they cannot
 *  disagree about what a lane IS; each keeps its own loop because each has its
 *  own early exit, and this runs inside a budgeted slice. */
function eventsByLane(events: readonly IREvent[]): Map<string, IREvent[]> {
  const byLane = new Map<string, IREvent[]>()
  for (const ev of events) {
    const key = laneKeyOf(ev)
    let bucket = byLane.get(key)
    if (!bucket) {
      bucket = []
      byLane.set(key, bucket)
    }
    bucket.push(ev)
  }
  return byLane
}

/**
 * A display span shorter than this is not accepted from an ABSTAINED reading.
 * Private on purpose: the rule is exported, the number is not, so no caller can
 * re-ask the question with a literal of its own.
 *
 * Not a tuned value — it names a GAP in the corpus. Across the 150 real tunes
 * the spans this rule recovers begin at 6 cycles and the ones it must refuse are
 * all exactly 2; nothing lands on 3, 4 or 5. Thresholds of 3, 4 and 6 were each
 * swept and produce the identical partition (20 recovered, 0 short, 0 cost), so
 * the choice inside that gap is not load-bearing. `song-period-abstention.test.ts`
 * keeps all three arms so a future corpus that closes the gap fails there instead
 * of making this number matter silently.
 */
const MIN_ABSTAINED_PERIOD = 4

/**
 * The display period once the progressive horizon is EXHAUSTED: lanes with no
 * loop of their own abstain instead of vetoing (#1104).
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * `detectDisplayPeriod` holds two rules that disagree. Its grounded one (#488,
 * from real DAW manuals) is that lanes of differing lengths PHASE — show the
 * max, never the lcm, because a 4-cycle track repeats happily inside a 5-cycle
 * view. Its other one is `if (p === null) return null`: a single lane with NO
 * loop discards every other lane's measured period and sends the whole document
 * to the 256-cycle cap. Measured over the corpus, that was 69 of 142 documents —
 * about half — drawn as a sliver on a timeline 256 cycles wide.
 *
 * If a 4-cycle lane can phase inside a 5-cycle view, so can a lane that never
 * repeats. A continuously modulated control (`.cutoff(sine)`) makes every cycle
 * genuinely differ, so "no loop" is the true answer about THAT LANE and not
 * about the song's structure.
 *
 * ── WHY ONLY AT THE CAP, which is the whole design ────────────────────────────
 * Below the cap a `null` from the period rule is not a defect — it is the signal
 * that DOUBLES the horizon, i.e. it is how a slow lane gets room to resolve.
 * Abstaining early answers with whatever short lane happens to have resolved and
 * the document never grows to where its real loop would have been found. Measured:
 * abstaining unconditionally sent 14 documents to period 1 — the single stretched
 * clip #1102 was filed for — and destroyed 5 correct periods (12→1, 10→1, 8→1,
 * 7→1, 6→1). So the rule is only ever asked once growth is exhausted. A derived
 * exclusion rule has to share the horizon of the detection it feeds.
 *
 * ── WHY A FLOOR ON THE PERIOD, and not on which lanes answered ───────────────
 * Even at the cap, an abstained max can be set by an ostinato while the content
 * abstains: six documents recovered to a 2-cycle span whose answering lanes were
 * the arpeggios and whose silent ones were the melody and bass. Three rules that
 * tested WHICH lanes answered were swept and all failed — requiring the densest
 * lane to answer, and requiring an event-share majority, each refused 15 sound
 * recoveries while still keeping 4 of the 6, because when the ostinato is the
 * denser lane no composition test can tell it from content. The floor below is
 * what works: the answer must itself be long enough to be a structural loop.
 *
 * Swept consequence: 20 documents leave the cap for a real period (6, 8, 14, 16,
 * 23, 24, 28, 32×4, 48×2, 64, 96×3); nothing changes below the cap, no period is
 * lost, and none collapse to 1. The remaining 49 are aperiodic by every reading
 * and belong to the display question, not to this rule.
 */
export function detectDisplayPeriodAtCap(
  events: readonly IREvent[],
  horizon: number,
): number | null {
  const byLane = eventsByLane(events)
  if (byLane.size === 0) return detectPeriod(cycleFingerprints(events, horizon))
  let maxPeriod = 0
  let answered = 0
  let abstained = false
  for (const laneEvents of byLane.values()) {
    const p = detectPeriod(cycleFingerprints(laneEvents, horizon))
    if (p === null) {
      abstained = true
      continue
    }
    answered++
    if (p > maxPeriod) maxPeriod = p
  }
  if (answered === 0 || maxPeriod <= 0) return null // every lane modulated — truly aperiodic
  // The floor guards an ABSTAINED answer only. With every lane answering this
  // rule agreed with `detectDisplayPeriod` and has no standing to overrule it —
  // and because `null` here means "the document is aperiodic", refusing an
  // honest short period would push a legitimately 1- or 2-cycle song to the cap,
  // manufacturing the very defect this function exists to remove.
  if (abstained && maxPeriod < MIN_ABSTAINED_PERIOD) return null
  return maxPeriod
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
  // Same measurement seam as `AnalyzeSongOptions.detectPeriodFn`, threaded here
  // because THIS is the terminal decision: the cap-fallback path returns through
  // `analyzeEvents`, so a seam covering only the loop would leave every
  // at-cap document reporting the production rule's period while the candidate
  // rule was credited with it — silently, and on exactly the population an
  // aperiodic-display change is about.
  detectPeriodFn: (events: readonly IREvent[], horizon: number) => number | null = detectDisplayPeriod,
): SongAnalysis {
  const lanes = accumulateLanes(events, horizon)
  // Per-lane MAX, not the global combined period — differing-length tracks
  // phase and the view spans the longest single loop (#488, see detectDisplayPeriod).
  const periodCycles = detectPeriodFn(events, horizon)
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
  /** Collector — the onset source. Production injects an eval-backed collector
   *  (queryArc haps); with none, analysis sees no onsets and returns empty. */
  collectFn?: (startCycle: number, endCycle: number) => IREvent[]
  /** Clock — defaults to `performance.now()`. Injected in tests. */
  now?: () => number
  /** Yield to the event loop between budgeted slices. Default = macrotask. */
  yieldFn?: () => Promise<void>
  /** Cooperative cancellation; checked between slices. */
  signal?: { readonly aborted: boolean }
  /**
   * The display-period rule, defaulting to `detectDisplayPeriod`.
   *
   * A MEASUREMENT SEAM, not a behaviour option — production never passes it.
   * It exists because a candidate rule cannot be priced by post-processing a
   * finished analysis: a `null` from this function is exactly what doubles the
   * horizon below, so a different rule resolves at a different horizon and
   * yields a different span. Pricing one therefore requires running THIS loop,
   * and the alternative — copying the loop into the sweep — would re-implement
   * the doubling, the cap and the one-loop trim, i.e. build the second oracle
   * this module's injection points exist to avoid ([[PV192]]).
   *
   * The default keeps every verdict identical; `song-period-sweep.test.ts`'s
   * pinned per-document baseline is the control arm proving it.
   */
  detectPeriodFn?: (events: readonly IREvent[], horizon: number) => number | null
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
  // No default collector: production always injects an eval-backed `collectFn`
  // (the queryArc hap stream, MusicalTimeline.tsx). With none injected (a caller
  // that only wants lane structure, or a non-Strudel doc) analysis sees no onsets
  // and returns the empty shape. The collect interpreter that used to back this
  // default was removed with #975.
  const collectFn = opts.collectFn ?? (() => [])
  const now = opts.now ?? defaultNow
  const yieldFn = opts.yieldFn ?? defaultYield
  const signal = opts.signal
  /**
   * The period rule for a given horizon — ONE definition, used by the loop and
   * by every terminal `analyzeEvents`, so the decision that ends the analysis
   * cannot be made by a different rule than the one that drove it.
   *
   * Situation-aware rather than fixed: at the cap the veto has nowhere to grow
   * and lanes abstain (#1104); below it the veto stands, because that is what
   * buys the next doubling. Written as an explicit conditional, never
   * `opts.detectPeriodFn?.(…) ?? …` — `null` is a meaningful verdict here and
   * `??` would silently swap an injected rule for the production one whenever it
   * answered "aperiodic".
   */
  const periodRule = (evs: readonly IREvent[], h: number): number | null =>
    opts.detectPeriodFn
      ? opts.detectPeriodFn(evs, h)
      : h >= cap
        ? detectDisplayPeriodAtCap(evs, h)
        : detectDisplayPeriod(evs, h)

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
    if (events.length === 0) return analyzeEvents([], 0, false, periodRule)
    // The DISPLAY period = the longest single lane's loop (#488). Differing-
    // length tracks phase; the view spans the longest one. `null` until EVERY
    // active lane has looped at least twice within the horizon, so we keep
    // growing until the slowest lane resolves (or the cap forces aperiodic).
    // At the cap the veto has nowhere left to grow, so lanes with no loop of
    // their own abstain rather than sending the whole song to a 256-cycle span
    // (#1104). Below the cap the veto stands — it is what buys the next doubling.
    // NOT `opts.detectPeriodFn?.(…) ?? fallback` — `null` is this function's
    // MEANINGFUL answer ("no period"), not an absent one, so `??` would discard
    // an injected rule's verdict exactly when it said aperiodic and silently
    // measure the production rule instead.
    const period = periodRule(events, horizon)
    if (period !== null) {
      // Trim the analysis to exactly ONE display loop. The full-song view spans
      // `displayCycles` and wraps the playhead there; if lanes/sections kept
      // the wider collection horizon (e.g. 8 with period 4), the cells beyond
      // the period would pile up off the view edge and the playhead — which
      // wraps at the period — would no longer line up with them. Keeping the
      // view exactly one display period wide makes displayCycles === periodCycles
      // === the longest lane's loop. For equal-length lanes this is the audible
      // loop; for differing lengths a shorter lane shows its loop + a phasing
      // remainder (DAW-idiomatic — exact on pass 1, phases after). periodCycles
      // is the period DETECTED over the full horizon (re-detecting over just
      // [0, period) would find null, since one loop has no internal repetition).
      const lanes = accumulateLanes(events, period)
      const sections = computeSections(lanes, period)
      return { periodCycles: period, horizonCycles: period, lanes, sections, reachedCap: false }
    }
    if (horizon >= cap) {
      return analyzeEvents(events, cap, true, periodRule)
    }
    horizon = Math.min(horizon * 2, cap)
  }

  // Aborted path — analyze what was collected.
  return analyzeEvents(events, Math.min(horizon, collectedTo), false, periodRule)
}
