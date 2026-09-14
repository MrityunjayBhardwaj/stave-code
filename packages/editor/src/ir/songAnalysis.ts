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
 * makes every cycle genuinely differ, and such a LANE is aperiodic in the only
 * sense this module measures. Swept over 150 real tunes, that took documents
 * landing on the cap from 53 to 69 of the 142 that evaluate.
 *
 * A lane being aperiodic no longer makes the SONG aperiodic (#1104). Once the
 * progressive horizon is exhausted such lanes ABSTAIN and the span comes from
 * the lanes that do loop, which is #488's phasing rule applied to the case the
 * veto used to cover — see `detectDisplayPeriodAtCap`. That returned 20 of the
 * 69 to a real period, so the swept figure was then 49. ⚠ #1107 later moved it
 * to 56 — see the sweep test's own tally line, which carries the whole chain
 * (53 pre-#1102 → 69 post-#1102 → 49 post-#1104 → 56 post-#1107 → 37 post-#1465).
 *
 * Of those, 32 have a single lane, so there is nothing to borrow a period from
 * at all, and what the display should do with them is #1105.
 *
 * ⚠ "APERIODIC UNDER EVERY RULE MEASURED" WAS TRUE WHEN WRITTEN AND IS NOT NOW.
 * #1465 SHIPPED a rule that recovers 19 of the 56 by asking the identity question
 * without the dimensions the document's own SOURCE says are continuously
 * modulated, then folding those signals' own rates back in so the answer is a
 * period the audio honours — an exclusion read structurally from the IR, which is
 * what the earlier probe-window attempt could not do. `signalInformedPeriod`
 * carries the argument; `song-period-signal-fold.test.ts` carries the numbers.
 * That leaves 37 aperiodic at the cap, and they belong to #1105.
 *
 * A DETECTED PERIOD CAN ALSO BE TOO SHORT TO BE THIS SONG'S (#1107). It can be
 * true of everything the analysis has heard and still describe only part of the
 * document — accepted before a track entered, or accepted with a span that
 * excludes one — and either way the missing track draws as an empty, UNMARKED
 * row, indistinguishable from silence. `displayPeriodRule` adds the two
 * plausibility clauses that refuse those spans; swept, they move exactly the
 * seven defective documents and take the at-cap figure 49 → 56.
 */

import type { PatternIR } from './PatternIR'
import type { IREvent } from './IREvent'
import { eventValueKey } from './eventValueKey'
import { signalAutomations, signalCarryingParamKeys, hasTruePeriod, isNoiseKind, type SignalAutomation, type SignalKind } from './signalAutomation'
import { isSectionWindow, type TimeStep } from './parameterRoutes'
import { steppedAutomations } from './steppedAutomation'

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

/**
 * The span the view should show, together with WHAT IT MEANS — the analysis's
 * own answer, not a number a consumer has to interpret.
 *
 * ── WHY THIS IS ONE VALUE AND NOT A NUMBER PLUS A BOOLEAN ───────────────────
 * `periodCycles` is a MEASUREMENT; a horizon is where the analysis STOPPED
 * LOOKING. They are different kinds of fact and they were previously told apart
 * by a sibling boolean that reached almost no consumer, so `periodCycles ??
 * horizonCycles` — the idiom that erases the difference — spread through the
 * view instead. Carrying the span and its meaning in one value makes the
 * distinction impossible to drop by accident: you cannot read `cycles` without
 * having `kind` in your hand.
 *
 * The three kinds are the three the view already distinguished by hand:
 *   `loop`    — a period was DETECTED. `cycles` is that period and the lanes
 *               span exactly one of them. This is the only cyclic kind: it is
 *               the only one where cycle `n + cycles` genuinely sounds like `n`.
 *   `capped`  — the horizon grew to its cap without confirming a period.
 *               `cycles` is where we gave up, not a property of the song.
 *   `horizon` — analysis ended before the cap with no period (collection was
 *               aborted, or there was nothing to analyze). `cycles` is what was
 *               actually looked at.
 *
 * ⚠ `capped` and `horizon` both mean "no period was found", and only `capped`
 * says the search was exhausted. They are kept apart because the view says
 * different things about them ("N+ cycles" vs "N cycles"), and collapsing them
 * would reintroduce exactly the erasure this type exists to prevent.
 */
export interface DisplaySpan {
  readonly kind: 'loop' | 'capped' | 'horizon'
  /** The span in cycles the view spans. For `loop`, the detected period. */
  readonly cycles: number
}

export interface SongAnalysis {
  /** Detected loop period in cycles, or `null` if none within the horizon.
   *  A MEASUREMENT — for anything asking what the analysis found. A consumer
   *  choosing what to DISPLAY wants `displaySpan` instead. */
  readonly periodCycles: number | null
  /** Number of cycles actually analyzed. A MEASUREMENT — see `periodCycles`. */
  readonly horizonCycles: number
  /** Per-lane onset activity across the horizon, in first-seen lane order. */
  readonly lanes: readonly LaneActivity[]
  /** Contiguous sections partitioning `[0, horizonCycles)` by active-lane set. */
  readonly sections: readonly SongSection[]
  /** The span to show and what it means — the single answer for every consumer
   *  deciding geometry, wrapping, or what to tell the user. */
  readonly displaySpan: DisplaySpan
  /**
   * The cycles after which EVERY lane has come back round (#1599), or null where
   * that cannot be vouched for. A LENGTH, for a consumer asking how long one pass
   * of the audio is — a bounce. A consumer drawing the view wants `displaySpan`,
   * which spans the longest single lane so lanes of different lengths phase
   * inside it (#488): a 4-cycle lane beside a 3-cycle lane views at 4 and repeats
   * at 12. For lanes of one length the two are equal.
   *
   * Always a whole number of `periodCycles` when it is a number. Null when there
   * is no period, a lane has no loop of its own, or the repeat runs past the cap
   * — see `wholeSongRepeat`.
   */
  readonly repeatCycles: number | null
  /**
   * Each lane's own period, and its period with its stepped parameters left out
   * (#1602), over the horizon the periods were detected on. The repeat is built
   * from these, so the two can never disagree about a lane.
   *
   * `restCycles` exists for a preview: a lane's period already folds its stepped
   * parameter in, and a least common multiple cannot be taken apart again, so a
   * song length after a step-count change has to start from what the lane plays
   * WITHOUT that parameter — see `previewRepeat`.
   */
  readonly lanePeriods: readonly LanePeriod[]
}

/** One lane's periods (#1602). Null where the lane has no loop within the horizon. */
export interface LanePeriod {
  readonly laneKey: string
  /** The lane's smallest period over everything it plays. */
  readonly periodCycles: number | null
  /** The same, with the lane's stepped parameters left out. Always divides
   *  `periodCycles` when both are numbers; equal to it on a lane with none. */
  readonly restCycles: number | null
}

// ---------------------------------------------------------------------------
// Pure analysis over already-collected events
// ---------------------------------------------------------------------------

/**
 * Accumulate per-lane onset counts bucketed by integer cycle over
 * `[0, horizon)`. Lane order is first-seen (matching `groupEventsByTrack`).
 * Events whose `floor(begin)` lands outside `[0, horizon)` are ignored.
 *
 * ⚠ A LANE IS CREATED ONLY BY AN ONSET INSIDE THE WINDOW, so narrowing the
 * window filters lane MEMBERSHIP and not merely the counts ([[P405]]). A track
 * whose first onset is later than `horizon` does not go empty — it ceases to
 * exist, and the display then rebuilds its row from the DOCUMENT's track set
 * (#1098) without the silenced treatment a muted track gets, which is how a
 * track playing thousands of notes came to look exactly like one playing none.
 *
 * `analyzeSong` re-accumulates over `[0, period)` when it accepts a period, so
 * that is the call this matters at — and it is safe there BY THE INVARIANT, not
 * by luck: `displayPeriodRule` refuses any period whose span leaves a known lane
 * empty (#1107), so every lane provably has an onset in range.
 */
export function accumulateLanes(
  events: readonly IREvent[],
  horizon: number,
): LaneActivity[] {
  return accumulateLanesInWindow(events, 0, horizon)
}

/**
 * `accumulateLanes` over an arbitrary window `[originCycle, originCycle + spanCycles)`
 * (#1108). `onsetsByCycle[i]` is the onset count at ABSOLUTE cycle
 * `originCycle + i` — the array is window-relative, everything else the view
 * holds stays song-absolute, and the scene carries the one conversion.
 *
 * ── `pinnedLaneKeys` IS THE POINT OF THIS FUNCTION ──────────────────────────
 * The header above warns that a lane exists only by having an onset inside the
 * window, so narrowing the window filters MEMBERSHIP and not merely counts. At
 * the period-trim call that is safe by an invariant — `displayPeriodRule`
 * refuses any period whose span leaves a known lane empty (#1107). **A paged
 * window has no such invariant**: nothing refuses window `[256, 512)` because
 * some track happens to be silent through it. Without a pin, paging re-opens
 * #1098/#1107 exactly — a track playing thousands of notes elsewhere in the
 * song draws as an empty, unmarked row, indistinguishable from silence.
 *
 * Membership is the UNION of the pin and what this window heard, which is the
 * only rule that avoids BOTH failures:
 *   - pinned but silent here  → an empty row, present and legible as silent
 *     (drop it and the track vanishes — the #1098 defect)
 *   - heard here but unpinned → appended
 *     (drop it and a track entering at cycle 300 is invisible forever, which is
 *      the same defect mirrored, and the one a strict pin would introduce)
 * Pinned keys come first, in the order given, so rows do not reorder as the
 * user pages; newly-seen lanes follow in first-seen order.
 */
export function accumulateLanesInWindow(
  events: readonly IREvent[],
  originCycle: number,
  spanCycles: number,
  pinnedLaneKeys?: readonly string[],
): LaneActivity[] {
  const origin = Math.max(0, Math.floor(Number.isFinite(originCycle) ? originCycle : 0))
  const span = Math.max(0, Math.floor(Number.isFinite(spanCycles) ? spanCycles : 0))
  const order: string[] = []
  const byLane = new Map<string, number[]>()
  const ensure = (key: string): number[] => {
    let counts = byLane.get(key)
    if (!counts) {
      counts = new Array<number>(span).fill(0)
      byLane.set(key, counts)
      order.push(key)
    }
    return counts
  }
  // Seed the pin FIRST so its order is the row order, and so a pinned lane with
  // no onset in this window still produces a row (all-zero, not absent).
  if (pinnedLaneKeys) for (const key of pinnedLaneKeys) ensure(key)
  for (const ev of events) {
    const cycle = Math.floor(ev.begin)
    if (!Number.isFinite(cycle) || cycle < origin || cycle >= origin + span) continue
    ensure(laneKeyOf(ev))[cycle - origin] += 1
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
 * The cycles after which every lane has come back round: the LCM of each lane's
 * own period, as `detectDisplayPeriod` detects it (#1599). Null when a lane has no
 * loop in `horizon`, when there are no lanes, or when the LCM passes `cap`.
 *
 * ⚠ EXACT, NOT AN ESTIMATE. Every lane's SMALLEST period divides any period of the
 * whole song, so the least common multiple of those periods is the whole song's
 * smallest period — no wider horizon is needed to confirm it, only the per-lane
 * periods the display rule already requires to have looped twice.
 *
 * ⚠ PAST THE CAP IT IS NULL, never a span the audio does not repeat at. The same
 * direction the source-informed fold takes for the same reason
 * (`foldWithSignalPeriods`): a true period nobody can bounce is not a length to
 * offer, and the caller keeps the span it already had.
 */
export function wholeSongRepeat(
  events: readonly IREvent[],
  horizon: number,
  cap: number,
): number | null {
  return repeatOf(lanePeriodsOf(events, horizon, NO_STEPPED_KEYS).map((l) => l.periodCycles), cap)
}

/** No lane carries a stepped parameter — the rest period is the lane's own. */
const NO_STEPPED_KEYS: ReadonlyMap<string, ReadonlySet<string>> = new Map()

/**
 * Every lane's periods, in first-seen order (#1602): its own, and its own with the
 * keys `steppedKeys` names for it stripped from every event before fingerprinting.
 *
 * ⚠ THE REST PERIOD IS FOUND ON THE SAME HORIZON. Leaving a dimension out can only
 * make more cycles equal, so the rest period divides the lane's own and has already
 * repeated twice wherever that one has.
 */
function lanePeriodsOf(
  events: readonly IREvent[],
  horizon: number,
  steppedKeys: ReadonlyMap<string, ReadonlySet<string>>,
): LanePeriod[] {
  const out: LanePeriod[] = []
  for (const [laneKey, laneEvents] of eventsByLane(events)) {
    const periodCycles = detectPeriod(cycleFingerprints(laneEvents, horizon))
    const keys = steppedKeys.get(laneKey)
    const restCycles =
      keys && keys.size > 0
        ? detectPeriod(cycleFingerprints(laneEvents.map((ev) => withoutKeys(ev, keys)), horizon))
        : periodCycles
    out.push({ laneKey, periodCycles, restCycles })
  }
  return out
}

/** The least common multiple of `periods`, or null for none, a null period, or a
 *  result past `cap` — the one fold both the repeat and its preview use. */
function repeatOf(periods: readonly (number | null)[], cap: number): number | null {
  if (periods.length === 0) return null
  let repeat = 1
  for (const p of periods) {
    if (p === null) return null
    const next = rationalLcm(repeat, p)
    if (next === null || !Number.isFinite(next) || next > cap) return null
    repeat = next
  }
  return repeat
}

/** The canonical key of every stepped parameter, by the lane (track) that plays it. */
function steppedKeysByLane(ir: PatternIR | null): ReadonlyMap<string, ReadonlySet<string>> {
  const by = new Map<string, Set<string>>()
  for (const a of steppedAutomations(ir)) {
    let keys = by.get(a.trackId)
    if (!keys) by.set(a.trackId, (keys = new Set()))
    keys.add(a.paramKey)
  }
  return by
}

/**
 * The song's repeat if lane `laneKey`'s stepped parameters came back round at
 * `paramPeriods` song cycles (#1602), or null when that cannot be said.
 *
 * A preview, before any edit is evaluated: the other lanes as measured, this lane
 * WITHOUT its stepped parameters, and the stepped parameters' song periods as the
 * edit would leave them — every stepped parameter on the lane, the edited one
 * replaced (`songPeriodOf`). Starting from this lane's own period instead reads the
 * old steps back in: `s("hh*4").gain("<.2 .8 .5>")` beside a 4-cycle lane, cut to
 * two steps, repeats at 4, and lcm(4, 3, 2) says 12. Measured through the engine on
 * 2, 4 and 5 steps: this reading matched every time, and that one never did.
 */
export function previewRepeat(
  analysis: SongAnalysis,
  laneKey: string,
  paramPeriods: readonly number[],
  cap: number = DEFAULT_CAP,
): number | null {
  const mine = analysis.lanePeriods.find((l) => l.laneKey === laneKey)
  if (!mine) return null
  const others = analysis.lanePeriods.filter((l) => l !== mine).map((l) => l.periodCycles)
  return repeatOf([...others, mine.restCycles, ...paramPeriods], cap)
}

/** A curve read as another shape (#1611), named by where its shape is spelled —
 *  `SignalAutomation.spans.shape.start`, the offset the source and every read of it
 *  agree on. */
export interface ShapeSwap {
  readonly at: number
  readonly kind: SignalKind
}

/** The grain a stand-in phase is counted in: the millionth of a cycle
 *  `cycleFingerprints` rounds an onset's offset to, so two onsets it places at one point
 *  in the cycle get one phase. */
const PHASE_GRAIN = 1e6

/**
 * How many of its own cycles a noise signal takes to come back round. Strudel's default
 * random signals seed from `frac(t / 300)` (`@strudel/core@1.2.6/signal.mjs:244`, under
 * `RNG_MODE = 'legacy'`, the default at `:260`). Measured through the engine: `rand`,
 * `perlin` and `berlin` agree at t and t+300 and t+600, and at none of 1, 100, 150, 299
 * or 301 — so `perlin.slow(0.05)` repeats every 15 song cycles and `perlin.slow(16)` far
 * past the cap. A document that calls `useRNG('precise')` never repeats; the preview does
 * not read that switch.
 */
const NOISE_SEED_CYCLES = 300

/**
 * The song as it would be analysed with curve `a` switched to shape `next` (#1611),
 * before anything is written — or null when that cannot be said.
 *
 * ⚠ THE SWAPPED DOCUMENT IS NOT EVALUATED, AND DOES NOT NEED TO BE. What a shape decides
 * about a song's length is only WHEN its values come round again, never what they are,
 * and the analysis asks nothing else of them: it compares cycles for identity
 * (`cycleFingerprints`) and folds in the periods of the signals that repeat
 * (`signalDimensionsOf`). So this runs the PRODUCTION analysis over the events the
 * document already plays, with the automated control on the curve's lane replaced by a
 * stand-in that comes round exactly as `next` does —
 *  - a waveform comes back once per song period (`songPeriodOf`, which a swap leaves
 *    alone — the rate and the placements stay as written): the onset's phase in it;
 *  - noise comes back too, once per `NOISE_SEED_CYCLES` of its own time, so its stand-in
 *    is the onset's phase in THAT song period. The first reading here, "noise never comes
 *    back", was wrong on an archive document sweeping at `sine.slow(0.015)`: switched to
 *    perlin it repeats at 36, and a never-repeating stand-in said 12;
 * — and with the signals read as `next`. Every rule that picks the length (the veto
 * below the cap, abstention at it, the source-informed fold, the whole-song repeat) is
 * then the one that will run after the edit, and not a second copy of it.
 *
 * Measured against the swapped SOURCE through the engine and the same analysis, 16 of 16
 * hand-picked swaps agreed — a 16-bar sweep beside a 4-bar line (16 → 4, and back),
 * alone (16 → 1), beside a 2-bar line (16 → 2), under a whole-track slow, inside an
 * arrangement section, on a lane that loops by itself — see `shapeSwap.engine.test.ts`.
 *
 * Null for a curve whose shape is not spelled, a `next` that is neither noise nor a
 * waveform, a song period that is not an exact fraction, or no collector. `opts` are the
 * caller's own collector and presence check: the ones its analysis runs with.
 */
export async function previewShapeSwap(
  ir: PatternIR | null,
  a: SignalAutomation,
  next: SignalKind,
  opts: Pick<AnalyzeSongOptions, 'collectFn' | 'hasUnheardTrack' | 'signal' | 'yieldFn'>,
): Promise<SongAnalysis | null> {
  const at = a.spans.shape?.start
  const collect = opts.collectFn
  if (at === undefined || !collect) return null
  const standIn = standInFor(a, next)
  if (standIn === null) return null
  // Toward noise that only comes back past the cap, the other writers cannot matter: the
  // lane repeats within no horizon either way (`sharesItsControl`).
  const standInPeriod = standInPeriodOf(a, next)
  const pastCap = !hasTruePeriod(next) && standInPeriod !== null && standInPeriod > DEFAULT_CAP
  if (!pastCap && sharesItsControl(ir, a)) return null
  const key = a.paramKey
  return analyzeSong(ir, {
    ...opts,
    collectFn: (start, end) =>
      collect(start, end).map((ev) => (laneKeyOf(ev) === a.trackId ? withValue(ev, key, standIn(ev)) : ev)),
    signals: signalDimensionsOf(ir, { at, kind: next }),
  })
}

/**
 * Does anything else on `a`'s lane move the control `a` moves — another curve, or steps?
 *
 * ⚠ A STAND-IN CANNOT TELL WHOSE EVENT IT IS REPLACING. An event carries the control's
 * value and nothing says which writer gave it, so `previewShapeSwap` replaces every value
 * of the key on the lane, and the other writers' noise or periods are overwritten by the
 * new shape's phase. The one direction where that is still exact is noise that comes back
 * only past the analysis cap (`NOISE_SEED_CYCLES`): the lane then repeats within no
 * horizon, whatever the others do. Faster noise repeats, and the others count again. Found on an archive document whose drop stacks four `perlin` gains in one track:
 * switching one to `sine` leaves the song at 7 bars, and a stand-in over all four named 40
 * and 120.
 *
 * A fixed value is not counted. A constant comes round with the structure the lane already
 * repeats at, so overwriting it with the new curve's phase moves no period — a hand-built
 * pair (noise and a fixed cutoff in one `cat`) agreed with the engine.
 */
function sharesItsControl(ir: PatternIR | null, a: SignalAutomation): boolean {
  if (!ir) return false
  const same = (b: { readonly trackId: string; readonly paramKey: string }) =>
    b.trackId === a.trackId && b.paramKey === a.paramKey
  return signalAutomations(ir).filter(same).length > 1 || steppedAutomations(ir).some(same)
}

/** How many song cycles `next`'s values take to come back round on curve `a`'s route:
 *  its rate for a waveform, `NOISE_SEED_CYCLES` times its rate for noise. Null for any
 *  other kind, or a route `songPeriodOf` cannot resolve. */
function standInPeriodOf(a: SignalAutomation, next: SignalKind): number | null {
  const own = hasTruePeriod(next) ? a.periodCycles : isNoiseKind(next) ? NOISE_SEED_CYCLES * a.periodCycles : null
  return own === null ? null : songPeriodOf({ periodCycles: own, placements: a.placements })
}

/** What `next` gives the onset `ev`, as far as identity can tell — `previewShapeSwap`'s
 *  stand-in: the onset's phase in the period `next` comes back at. Null when `next` is
 *  neither noise nor a waveform, or that period is not an exact fraction (`rationalLcm`
 *  could not fold it either). */
function standInFor(a: SignalAutomation, next: SignalKind): ((ev: IREvent) => number) | null {
  const song = standInPeriodOf(a, next)
  const f = song === null ? null : asFraction(song)
  if (f === null) return null
  // In ticks of 1/(d·PHASE_GRAIN) cycle, so a period of n/d is a whole n·PHASE_GRAIN
  // and the phase is integer arithmetic. A float `%` does not group onsets the same way:
  // measured over 9 periods × 7 onset grids × 256 cycles, 903 of 168,192 onsets land a hair
  // below the wrap — `(13/3) % (1/3)` rounds to 0.333333 where its phase is 0 — and a lane
  // that should repeat stops repeating.
  const [n, d] = f
  const ticks = n * PHASE_GRAIN
  return (ev) => {
    const t = Math.round(ev.begin * d * PHASE_GRAIN)
    return ((t % ticks) + ticks) % ticks
  }
}

/** `ev` with `key` set to `value`, in whichever half of the value partition holds it —
 *  `withoutKeys`' partition. An event not carrying `key` is returned as it is: a
 *  stand-in replaces what the curve gives and adds nothing it does not. */
function withValue(ev: IREvent, key: string, value: unknown): IREvent {
  const rec = ev as unknown as Record<string, unknown>
  if (rec[key] !== undefined) return { ...rec, [key]: value } as unknown as IREvent
  if (ev.params && key in ev.params) return { ...ev, params: { ...ev.params, [key]: value } } as IREvent
  return ev
}

/**
 * `repeatCycles` for an accepted `period`: the whole-song repeat, held to being a
 * whole number of display spans, because a bounce of a repeat that is not a whole
 * number of the view's own loops would contradict the view.
 *
 * ⚠ NO PRODUCTION RULE REACHES THE NON-DIVISOR NULL. Every production span is one
 * lane's own period, which divides the LCM. The two rules that look like they
 * could differ cannot get here with a number: the abstaining rule answers only by
 * skipping a lane with no loop (`detectDisplayPeriodAtCap`), and the
 * source-informed retry runs only after the structural rules found none — both
 * leave a lane without a period, so `wholeSongRepeat` is already null. The check
 * guards the injected `detectPeriodFn` seam the sweeps pass candidates through.
 */
function repeatBeside(
  lanePeriods: readonly LanePeriod[],
  cap: number,
  period: number | null,
): number | null {
  if (period === null) return null
  const repeat = repeatOf(lanePeriods.map((l) => l.periodCycles), cap)
  return repeat !== null && repeat % period === 0 ? repeat : null
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
 * lost, and none collapse to 1. The 49 that remained (56 after #1107) were
 * aperiodic by every reading THEN and belong to the display question, not to this
 * rule — but see #1465, which prices a source-informed exclusion reaching 19 of
 * them, including 5 single-lane documents this rule cannot help by construction.
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
 * Does `[0, period)` contain at least one onset from every lane the events show?
 *
 * A span that leaves a whole track empty is not that song's loop. This is the
 * SECOND clause of the plausibility rule (#1107) and it is a test on the ANSWER,
 * not on which lanes answered — the family PV256 measured and refused, where
 * `detectDisplayPeriodAtCap` was already forced to choose between an ostinato
 * and the content it plays under. Here nothing is compared to anything: either a
 * lane appears inside the accepted span or the span does not describe it.
 *
 * Its existence also makes the re-accumulation below SAFE. `analyzeSong` derives
 * the shipped lanes with `accumulateLanes(events, period)`, which creates a lane
 * only for an onset inside the window — so narrowing the window silently filters
 * lane MEMBERSHIP, not just the counts ([[P405]]). With this clause holding, no
 * lane can be lost that way, because every lane provably has an onset in range.
 */
function spanCoversEveryLane(events: readonly IREvent[], period: number): boolean {
  const inSpan = new Set<string>()
  const all = new Set<string>()
  for (const ev of events) {
    const key = laneKeyOf(ev)
    all.add(key)
    const cycle = Math.floor(ev.begin)
    if (Number.isFinite(cycle) && cycle >= 0 && cycle < period) inSpan.add(key)
  }
  for (const key of all) if (!inSpan.has(key)) return false
  return true
}

/**
 * THE display-period rule — the combine step plus the two plausibility clauses,
 * in ONE definition so the decision that ends the analysis cannot be made by a
 * different rule than the one that drove it ([[P403]]).
 *
 * ── THE COMBINE STEP is situation-aware (#1104) ──────────────────────────────
 * At the cap the veto has nowhere to grow and lanes with no loop of their own
 * ABSTAIN; below it the veto stands, because a `null` there is what buys the
 * next doubling. `detectDisplayPeriodAtCap`'s own header carries that argument.
 *
 * ── THE PLAUSIBILITY CLAUSES (#1107) ─────────────────────────────────────────
 * A detected period can be true of everything the analysis has HEARD and still
 * be false about the song, and both ways it fails leave a track drawing as an
 * empty, unmarked row — pixel-identical to a track that plays nothing, and
 * without even the fade a muted one gets.
 *
 * (a) UNHEARD TRACK — the analysis converged before a track entered. Measured on
 *     the corpus: `0/-Hx1rNCmeyD8` accepts period 1 at horizon 8 while its other
 *     six tracks first sound at cycles 16, 32, 56, 95, 128 and 159. Nothing here
 *     can detect that, because those events have not been collected — only the
 *     caller knows the document declares tracks it has not heard from, so it is
 *     asked (`hasUnheardTrack`). Gated to `horizon < cap` for the same reason
 *     abstention is gated to the cap: below it a `null` is the signal that grows
 *     the horizon, and at the cap there is nowhere left to grow, so an unheard
 *     track must not be able to block an answer forever. That bound is what
 *     makes the clause verdict-NEUTRAL for a track that is simply silent: six
 *     corpus documents register a pattern that never sounds in 256 cycles, and
 *     all six keep their exact period — they only take longer to reach it.
 *
 * (b) EXCLUDED LANE — the analysis heard the track and then accepted a span that
 *     excludes it. `250/19FzyPQc7bcR` accepts period 6 while `x4` first sounds at
 *     cycle 6 and `x5` at cycle 23, putting ~98.6% of the document's onsets and
 *     2 of its 5 tracks outside the view, on a document whose own `.mask()`s
 *     spell a 32–64-cycle arrangement.
 *
 * Swept per document, both clauses together move EXACTLY the seven defective
 * documents and nothing else — every one recovering its full lane set (1→7 ×3,
 * 2→4, 5→6, 3→5 ×2) — and aperiodic-at-cap goes 49 → 56 of 142. Three of those
 * are periods #1104 recovered; they are given back deliberately, because a span
 * that hides a whole track is a loop claim the document does not support, and
 * #1105 already made the aperiodic display an honest one.
 */
/**
 * What the document's SOURCE says is continuously modulated (#1465).
 *
 * Two facts, read structurally off the IR and therefore HORIZON-FREE, which is
 * the property that makes them safe to feed a horizon-driven detection. An
 * earlier attempt at this exclusion derived it by watching a probe window, so a
 * field whose period exceeded that window read as unstable and got dropped — it
 * discarded `note` and `s` in ~75 documents. `Param{value: …Signal}` is the same
 * fact at horizon 4 and at horizon 256.
 */
export interface SignalDimensions {
  /** Every parameter KEY whose argument carries a signal — the dimensions to ask
   *  the identity question WITHOUT. Named by key because that is how the cycle
   *  fingerprint names a dimension (`eventValueKey`). */
  readonly keys: ReadonlySet<string>
  /** Cycle periods of the modulating signals that actually REPEAT. `rand`,
   *  `perlin`, `time` and the mouse signals contribute nothing here — see
   *  `hasTruePeriod`. Empty means "this document is modulated, but by nothing
   *  that comes back", which is a different answer from "not modulated". */
  readonly periods: readonly number[]
}

/**
 * Read `SignalDimensions` off a document's IR. The caller holds the IR;
 * `analyzeSong` only ever sees events, so this is how the fact reaches it.
 *
 * ⚠ MUTED TRACKS ARE EXCLUDED FROM THE READ (#1488), and the fold is why this
 * is not a nicety. The exclusion half could afford to be sloppy here — a muted
 * track emits no events, so stripping a key nothing carries changes no
 * fingerprint — but the fold is pure arithmetic on the IR and never consults
 * events at all. Measured on `0/-9BuEqUq3uzT`: its two audible tracks modulate
 * only `gain`, at period 1, while a SILENT `_$:` block carries
 * `.lpq(sine.range(2,10).slow(32))`. Reading the whole document folded that
 * document's 2-cycle structure up to 32 — a 16x overstatement sourced entirely
 * from a track that makes no sound, and offered to the user as a bounce length.
 *
 * Only the TOP level is scoped, which is the level muting exists at: a `_$:`
 * silences a whole statement, and nothing inside a sounding track is muted
 * independently.
 *
 * `swap` reads one curve as another shape (#1611) — the document a shape menu's
 * preview is asking about, before it is written (`previewShapeSwap`).
 */
export function signalDimensionsOf(ir: PatternIR | null | undefined, swap?: ShapeSwap): SignalDimensions {
  const audible = audibleTracks(ir)
  const periods: number[] = []
  const keys = new Set<string>()
  for (const t of audible) {
    for (const a of signalAutomations(t)) {
      // Its key stays in `keys` whichever shape it is read as: noise and a waveform
      // both move the control.
      const kind = swap !== undefined && a.spans.shape?.start === swap.at ? swap.kind : a.kind
      if (!hasTruePeriod(kind) || !(a.periodCycles > 0)) continue
      const song = songPeriodOf(a)
      if (song !== null) periods.push(song)
    }
    for (const k of signalCarryingParamKeys(t)) keys.add(k)
  }
  return { keys, periods }
}

/**
 * How many SONG cycles a curve's value takes to come back round (#1590), or null
 * when that cannot be said.
 *
 * Under no section it is the signal's own period. Inside a section it is longer:
 * the curve advances only while its section plays, `cycles` per pass of `total`
 * (`parameterRoutes.ts`, `placementTimeAt`), so its value repeats after the smallest
 * number of passes `m` with `m·cycles` a multiple of `P` — `total · lcm(cycles, P) /
 * cycles` song cycles, applied from the innermost section out. Measured through the
 * engine: `arrange([1, hh], [3, saw.slow(3)])` repeats at 4, not 3;
 * `arrange([3, sine.slow(4)], [1, hh])` at 16, not 4; `cat(hh, saw.slow(3))` at 6.
 *
 * A binding arranged twice repeats at the LCM of its placements. A placement through
 * an arm of weight 0 never plays and contributes nothing. A pair `rationalLcm` cannot
 * resolve drops the period, the direction `PERIODIC_KINDS` already argues is safe.
 */
export function songPeriodOf(a: { readonly periodCycles: number; readonly placements: readonly (readonly TimeStep[])[] }): number | null {
  let out: number | null = null
  for (const placement of a.placements) {
    if (placement.some((w) => isSectionWindow(w) && w.cycles === 0)) continue
    let p: number | null = a.periodCycles
    for (let k = placement.length - 1; k >= 0 && p !== null; k--) {
      const step = placement[k]
      // A warp hands the curve `t · times / per`, so the curve comes back round
      // `per / times` times as late: `.slow(2)` doubles the period, `.fast(2)`
      // halves it, and a shift moves where it starts but not how long it takes
      // (#1595). Innermost first, like the sections: the engine repeats
      // `arrange([1, hh], [2, saw.slow(3)]).slow(2)` at 18, and the other order gives 9.
      if (!isSectionWindow(step)) {
        p = (p * step.per) / step.times
        continue
      }
      const { cycles, total } = step
      const l = rationalLcm(cycles, p)
      p = l === null ? null : (total * l) / cycles
    }
    if (p === null) return null
    out = out === null ? p : rationalLcm(out, p)
    if (out === null) return null
  }
  return out
}

/**
 * The document's sounding top-level nodes.
 *
 * A document is a `Stack` of `Track`s, a single `Track`, or a bare expression
 * with no `Track` wrapper at all. Only the first two can carry a mute marker —
 * muting is a prefix on a LABEL, and a bare statement has no label to prefix
 * (`trackOrder.ts` measured that across every spelling) — so an unwrapped
 * document is returned whole rather than treated as unmuted-by-default, which
 * would be the same answer reached by a weaker argument.
 */
function audibleTracks(ir: PatternIR | null | undefined): readonly PatternIR[] {
  if (!ir) return []
  const roots: readonly PatternIR[] = ir.tag === 'Stack' ? ir.tracks : [ir]
  const tracks = roots.filter((n): n is PatternIR => n?.tag === 'Track')
  if (tracks.length === 0) return [ir]
  return tracks.filter((t) => t.tag !== 'Track' || t.muted !== true)
}

/**
 * Strip named dimensions from an event, in whichever half of the value partition
 * holds them.
 *
 * The partition has exactly two halves and they do not overlap: `extractParams`
 * builds `params` as the COMPLEMENT of `KNOWN_VALUE_FIELDS`, so a key is a
 * dedicated slot or a `params` entry, never both. Both halves are cleared anyway
 * — unconditionally, rather than with a guard that assumes the partition —
 * because the cost is one lookup and the alternative is a silent half-strip if
 * that invariant ever moves.
 *
 * A dedicated slot becomes `undefined` rather than being deleted, because
 * `eventValueKey` reads `VALUE_SLOTS` positionally and an absent slot still
 * contributes `slot=undefined` — a constant in every cycle, which is precisely
 * the neutral value wanted. A `params` entry is removed outright, because that
 * half is keyed by presence.
 *
 * Returns the ORIGINAL event when nothing matched, so the common case allocates
 * nothing across a 256-cycle sweep.
 */
export function withoutKeys(ev: IREvent, keys: ReadonlySet<string>): IREvent {
  if (keys.size === 0) return ev
  const rec = ev as unknown as Record<string, unknown>
  let touched = false
  let copy: Record<string, unknown> | null = null

  for (const k of keys) {
    if (rec[k] === undefined) continue
    copy ??= { ...rec }
    copy[k] = undefined
    touched = true
  }

  const params = ev.params
  if (params) {
    let dropped = false
    const next: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(params)) {
      if (keys.has(k)) { dropped = true; continue }
      next[k] = v
    }
    if (dropped) {
      copy ??= { ...rec }
      copy.params = next
      touched = true
    }
  }
  return (touched && copy ? copy : rec) as unknown as IREvent
}

const gcdInt = (a: number, b: number): number => (b === 0 ? a : gcdInt(b, a % b))

/**
 * `x` as an exact fraction, or null when it is not one within `maxDen`.
 *
 * Signal periods are rationals by construction — `.slow(4)` gives 4, `.fast(3)`
 * gives 1/3 — but they reach here as floats, and folding needs exact arithmetic
 * or it reports a period that is off by a rounding error. Returning null for
 * anything that does not land cleanly is the conservative branch: the caller
 * then skips the fold and keeps the structural period, which is the answer
 * production already gives.
 */
function asFraction(x: number, maxDen = 1024): readonly [number, number] | null {
  if (!Number.isFinite(x) || x <= 0) return null
  for (let d = 1; d <= maxDen; d++) {
    const n = x * d
    if (Math.abs(n - Math.round(n)) < 1e-9) {
      const num = Math.round(n)
      const g = gcdInt(num, d)
      return [num / g, d / g]
    }
  }
  return null
}

/**
 * The smallest span that is a whole number of BOTH periods, or null when either
 * is not an exact rational. `lcm(a/b, c/d) = lcm(a, c) / gcd(b, d)` with both
 * fractions in lowest terms.
 */
function rationalLcm(x: number, y: number): number | null {
  const fx = asFraction(x)
  const fy = asFraction(y)
  if (!fx || !fy) return null
  const [a, b] = fx
  const [c, d] = fy
  const lcmNum = (a * c) / gcdInt(a, c)
  return lcmNum / gcdInt(b, d)
}

/**
 * Raise a structural period to one the AUDIO actually repeats at (#1465).
 *
 * Excluding a modulated dimension answers "does the rest of this repeat?", and
 * that span is only the song's period if the modulation also comes back within
 * it. `.gain(sine.slow(4))` over a 2-cycle structure repeats at 4, not at 2 —
 * #1465's own verification says it directly: a bounce of N cycles should contain
 * a whole number of periods of the LFO. So fold the structural period up to the
 * least common multiple of itself and every signal that repeats.
 *
 * ⚠ WHEN THE FOLD EXCEEDS THE CAP, THE STRUCTURAL PERIOD IS RETURNED UNFOLDED,
 * and it is worth being plain that this returns a span the audio does not repeat
 * at. Measured over the corpus, two documents fold to 792 and 1,801,800 cycles —
 * periods that are true and useless, and the honest alternative for them is not
 * a bigger number but the aperiodic notice, which is what production gave them
 * before this rule existed. Handing back the structural span keeps them at a
 * usable, if incomplete, view. It is a DISPLAY span, and the whole reason
 * #1105's notice exists is that the two are not the same claim.
 *
 * A partial fold — folding in the signals that fit and dropping the ones that do
 * not — is deliberately NOT done: the result would be a period honest about some
 * of the modulation and silent about the rest, which is harder to reason about
 * than either endpoint and no more true.
 */
function foldWithSignalPeriods(
  period: number,
  periods: readonly number[],
  cap: number,
): number {
  // The result stays a whole number of cycles, and that is a property rather
  // than a hope: `period` is a cycle count, so it enters as `a/1`, and
  // `lcm(a/1, c/d) = lcm(a, c) / gcd(1, d) = lcm(a, c)`. A denominator can
  // never survive the fold, so a signal faster than a cycle — `.fast(3)`,
  // period 1/3 — folds to the structural period unchanged rather than to a
  // fractional span nothing could draw.
  let folded = period
  for (const q of periods) {
    const next = rationalLcm(folded, q)
    if (next === null || !Number.isFinite(next) || next > cap) return period
    folded = next
  }
  return folded
}

export function displayPeriodRule(
  events: readonly IREvent[],
  horizon: number,
  cap: number,
  hasUnheardTrack: boolean,
  signals?: SignalDimensions,
): number | null {
  const period = horizon >= cap ? detectDisplayPeriodAtCap(events, horizon) : detectDisplayPeriod(events, horizon)
  if (period !== null) {
    if (hasUnheardTrack && horizon < cap) return null
    if (!spanCoversEveryLane(events, period)) return null
    return period
  }
  return signalInformedPeriod(events, horizon, cap, signals)
}

/**
 * The source-informed retry (#1465), reached only when every rule above found
 * nothing and the horizon is spent.
 *
 * ── WHY IT CAN ONLY ADD ──────────────────────────────────────────────────────
 * This runs exclusively on the `period === null` branch, so it never replaces an
 * answer production already gave — it offers one where production had none. That
 * is where the safety comes from, and it is worth stating because the plan for
 * this claimed the `horizon >= cap` gate was what provided it. Measured, that
 * was wrong: the ungated arm scores identically on the corpus (19 recovered, 0
 * below-cap documents changed, 0 periods destroyed, 0 collapsed to 1). The gate
 * costs exactly zero recoveries and is kept as free insurance — it turns "no
 * below-cap document changed" from something true of these 142 documents into
 * something a reader can see is true of any document.
 *
 * ── WHAT IT ASKS ─────────────────────────────────────────────────────────────
 * `cycleFingerprints` summarises a cycle from the event's whole value partition,
 * which is right — that is what fixed #1102. But a control driven by an LFO makes
 * every cycle genuinely differ on that one axis, so the LANE goes aperiodic and
 * the document falls to the cap. The structure did not change; one dimension is
 * sweeping over it. Excluding exactly that dimension asks "does the rest of this
 * repeat?", and folding the signal's own rate back in (`foldWithSignalPeriods`)
 * turns that structural answer into one the audio honours.
 *
 * Swept over the corpus this returns 19 of the 56 aperiodic-at-cap documents to
 * a real period — 5 of them single-lane, which #1104's abstention cannot reach
 * by construction — while changing nothing below the cap, destroying no period
 * and lengthening none. Of the 19: 9 are modulated only by noise (`rand`,
 * `perlin`), where no fold exists and the structural span is the only available
 * answer; 4 fold to a longer, honest period; 4 already were one; 2 fold past the
 * cap and keep the structural span, which `foldWithSignalPeriods` argues.
 *
 * ⚠ THE LANE-COVERAGE CLAUSE IS RE-ASKED ON THE ORIGINAL EVENTS, not the
 * stripped ones. Stripping is about the identity question only — whether a span
 * hides a whole track is a fact about what sounds, and `gain` being modulated
 * has no bearing on it. Asking it on the stripped copy would silently widen
 * #1107's guarantee's blind spot.
 */
function signalInformedPeriod(
  events: readonly IREvent[],
  horizon: number,
  cap: number,
  signals: SignalDimensions | undefined,
): number | null {
  if (horizon < cap) return null
  if (!signals || signals.keys.size === 0) return null
  const stripped = events.map((ev) => withoutKeys(ev, signals.keys))
  const structural = detectDisplayPeriodAtCap(stripped, horizon)
  if (structural === null) return null
  const folded = foldWithSignalPeriods(structural, signals.periods, cap)
  if (!spanCoversEveryLane(events, folded)) return null
  return folded
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
  return computeSectionsInWindow(lanes, 0, horizon)
}

/**
 * `computeSections` over `[originCycle, originCycle + spanCycles)` (#1108).
 *
 * ⚠ TWO FRAMES, DELIBERATELY. It READS `onsetsByCycle` window-relative (index 0
 * is the origin, matching `accumulateLanesInWindow`) and EMITS `startCycle` /
 * `endCycle` song-ABSOLUTE. That asymmetry is not an oversight: section bounds
 * become ruler chips on an axis whose labels must keep meaning absolute song
 * position, or a user cannot tell which part of the piece they are looking at.
 * The relative half is an implementation detail of the counts array; the
 * absolute half is what every consumer of a `SongSection` already assumes.
 */
export function computeSectionsInWindow(
  lanes: readonly LaneActivity[],
  originCycle: number,
  spanCycles: number,
): SongSection[] {
  const origin = Math.max(0, Math.floor(Number.isFinite(originCycle) ? originCycle : 0))
  const span = Math.max(0, Math.floor(Number.isFinite(spanCycles) ? spanCycles : 0))
  if (span <= 0) return []
  const signatureAt = (index: number): string[] =>
    lanes
      .filter((l) => (l.onsetsByCycle[index] ?? 0) > 0)
      .map((l) => l.laneKey)
      .sort()

  const sections: SongSection[] = []
  let start = 0
  let sig = signatureAt(0)
  let sigKey = sig.join('|')
  for (let i = 1; i < span; i++) {
    const nextSig = signatureAt(i)
    const nextKey = nextSig.join('|')
    if (nextKey !== sigKey) {
      sections.push({ startCycle: origin + start, endCycle: origin + i, laneKeys: sig })
      start = i
      sig = nextSig
      sigKey = nextKey
    }
  }
  sections.push({ startCycle: origin + start, endCycle: origin + span, laneKeys: sig })
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
  //
  // The DEFAULT follows `reachedCap` rather than being fixed, so this function's
  // two arguments cannot be set into a contradiction: a caller that says it hit
  // the cap gets the cap's rule (#1104). `analyzeSong` always passes its own
  // rule explicitly, so this only governs direct callers.
  detectPeriodFn?: (events: readonly IREvent[], horizon: number) => number | null,
  // #1599 — the cap a whole-song repeat may not pass. `analyzeSong` passes its
  // own; a direct caller gets the production default.
  capCycles: number = DEFAULT_CAP,
  // #1602 — the stepped parameter keys each lane carries, for its rest period.
  // `analyzeSong` reads them off the IR; a direct caller has no IR and gets none.
  steppedKeys: ReadonlyMap<string, ReadonlySet<string>> = NO_STEPPED_KEYS,
): SongAnalysis {
  // ONE rule for direct callers too ([[P403]]): `displayPeriodRule` with the cap
  // placed so `horizon >= cap` is true exactly when the caller says it hit the
  // cap. `hasUnheardTrack` is false — a direct caller hands over a finished event
  // list and makes no claim about tracks it has not heard from.
  const periodOf =
    detectPeriodFn ??
    ((evs: readonly IREvent[], h: number) =>
      displayPeriodRule(evs, h, reachedCap ? h : Number.POSITIVE_INFINITY, false))
  const lanes = accumulateLanes(events, horizon)
  // Per-lane MAX, not the global combined period — differing-length tracks
  // phase and the view spans the longest single loop (#488, see detectDisplayPeriod).
  const periodCycles = periodOf(events, horizon)
  const sections = computeSections(lanes, horizon)
  // THE ONE PLACE the span and its meaning are decided. `periodCycles ??
  // horizonCycles` used to live at every consumer; it lives here now, paired
  // with the kind that says which of the two answered.
  const displaySpan: DisplaySpan =
    periodCycles != null
      ? { kind: 'loop', cycles: periodCycles }
      : { kind: reachedCap ? 'capped' : 'horizon', cycles: horizon }
  const lanePeriods = lanePeriodsOf(events, horizon, steppedKeys)
  const repeatCycles = repeatBeside(lanePeriods, capCycles, periodCycles)
  return { periodCycles, horizonCycles: horizon, lanes, sections, displaySpan, repeatCycles, lanePeriods }
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

  /**
   * What the document's SOURCE says is continuously modulated (#1465), from
   * `signalDimensionsOf(ir)`.
   *
   * Asked of the CALLER for the same reason `hasUnheardTrack` is: the question
   * is about the DOCUMENT, and `analyzeSong` only ever sees events. Unlike that
   * clause the answer is derivable here — the reader lives in this package now
   * (#1489) — but only from an IR the caller holds.
   *
   * Omitting it is safe and means exactly one thing: a document whose every lane
   * is aperiodic keeps the cap and the #1105 notice, which is what production
   * did before this existed. It can only ever ADD a period, never change one.
   */
  signals?: SignalDimensions

  /**
   * "Does the document declare a track that has produced no onset yet?" — clause
   * (a) of `displayPeriodRule`, asked of the CALLER because only the caller can
   * answer it soundly.
   *
   * ── WHY THE CALLER OWNS IT, and it is not derived from `events` ─────────────
   * The question needs two sets in ONE key space: what the document declares,
   * and what has been heard. The events reaching `analyzeSong` are in the
   * DISPLAY lane space — production remaps every hap through `laneKeyForHap`
   * source containment (`MusicalTimeline.tsx`) so analysis lanes line up with
   * rendered rows ([[PV175]]) — and that space cannot answer it. Measured over
   * the corpus: 20 of the 78 documents with structural anchors have an anchor key
   * that NEVER receives an event in 256 cycles (a track whose haps carry no
   * `loc`, or whose `loc` precedes its own statement). There, "unheard" does not
   * mean a track that has yet to enter; it means a key nothing can ever land on,
   * so the clause would be waiting for something that does not exist.
   *
   * NOT a cost argument, which is worth saying because that was the first guess
   * and measurement refuted it: priced against its own control arm the structural
   * clause takes documents collected to the full cap from 71 to 85, +14, and the
   * capture-space clause costs +13 by construction (the 7 it moves, plus the 6
   * documents with a registered track that never sounds). The work is the same.
   * What differs is whether the question has an answer.
   *
   * In the CAPTURE key space the engine stamps — one key per registered pattern —
   * an unheard key can only mean a track that genuinely never sounds, which is 6
   * documents, and all 6 keep their exact period because the clause is bounded to
   * `horizon < cap`. Measured past the cap too: all 9 such tracks are silent
   * through 1024 cycles, so none is a late entry the bound hides.
   *
   * So the caller reads the raw capture keys BEFORE its own remap and compares
   * them against the engine's registered set. Absent, the clause is inert and
   * the rule is exactly the #1104 one — a deliberate default, since a caller
   * that cannot name the document's tracks has nothing to claim about them.
   */
  hasUnheardTrack?: () => boolean
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
  const steppedKeys = steppedKeysByLane(ir)
  /**
   * The period rule for a given horizon — ONE definition, used by the loop and
   * by every terminal `analyzeEvents`, so the decision that ends the analysis
   * cannot be made by a different rule than the one that drove it.
   *
   * Situation-aware rather than fixed: at the cap the veto has nowhere to grow
   * and lanes abstain (#1104); below it the veto stands, because that is what
   * buys the next doubling. Both that choice and the two plausibility clauses
   * live in `displayPeriodRule`, whose header carries the argument. Written as
   * an explicit conditional, never `opts.detectPeriodFn?.(…) ?? …` — `null` is a
   * meaningful verdict here and `??` would silently swap an injected rule for the
   * production one whenever it answered "aperiodic".
   *
   * `hasUnheardTrack` is asked at DECISION time rather than passed as a value,
   * because its answer moves with the horizon: `analyzeSong` has always collected
   * up to `h` before calling this, so the caller's set is current by construction.
   */
  const periodRule = (evs: readonly IREvent[], h: number): number | null =>
    opts.detectPeriodFn
      ? opts.detectPeriodFn(evs, h)
      : displayPeriodRule(evs, h, cap, opts.hasUnheardTrack ? opts.hasUnheardTrack() : false, opts.signals)

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
    if (events.length === 0) return analyzeEvents([], 0, false, periodRule, cap, steppedKeys)
    // The DISPLAY period = the longest single lane's loop (#488). Differing-
    // length tracks phase; the view spans the longest one. `null` until EVERY
    // active lane has looped at least twice within the horizon, so we keep
    // growing until the slowest lane resolves (or the cap forces aperiodic).
    // `periodRule` picks the veto below the cap and abstention at it (#1104);
    // its own doc carries why. Stated once, there.
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
      // Over the FULL horizon, like the repeat: one trimmed loop has no repetition.
      const lanePeriods = lanePeriodsOf(events, horizon, steppedKeys)
      return {
        periodCycles: period,
        horizonCycles: period,
        lanes,
        sections,
        displaySpan: { kind: 'loop', cycles: period },
        // #1599 — over the full collection horizon, where every lane's period was
        // detected, NOT the trimmed one-loop span (one loop has no repetition).
        repeatCycles: repeatBeside(lanePeriods, cap, period),
        lanePeriods,
      }
    }
    if (horizon >= cap) {
      return analyzeEvents(events, cap, true, periodRule, cap, steppedKeys)
    }
    horizon = Math.min(horizon * 2, cap)
  }

  // Aborted path — analyze what was collected.
  return analyzeEvents(events, Math.min(horizon, collectedTo), false, periodRule, cap, steppedKeys)
}

// ---------------------------------------------------------------------------
// Windowed collection (#1108) — reaching material past the first span
// ---------------------------------------------------------------------------

/**
 * One window of a song that has no loop. Deliberately NOT a `SongAnalysis`.
 *
 * ── WHY THERE IS NO `periodCycles` FIELD ────────────────────────────────────
 * The period is a property of the SONG, detected once over `[0, cap)`. Paging
 * exists only on the branch where that detection FAILED — when a period was
 * found, cycle 257 genuinely is cycle 1 and there is nothing to the right to
 * reach. So a window can never contribute a period, and the decision recorded
 * on #1108 is that it must never try: a song aperiodic in `[0, 256)` is not
 * re-judged as an 8-cycle loop in `[256, 512)`, because that would change the
 * view's span underneath the user as they page and make the density heatmap's
 * scale incomparable between windows.
 *
 * Expressed as a MISSING FIELD rather than a flag on purpose. A
 * `periodCycles: null` that callers must remember to ignore is a rule kept in
 * step by hand; a type with nowhere to put a period cannot drift.
 */
export interface WindowAnalysis {
  /** First cycle of this window (inclusive, song-absolute). */
  readonly originCycle: number
  /** Window width in cycles. `onsetsByCycle` arrays have exactly this length. */
  readonly spanCycles: number
  /** Per-lane onset activity across the window; index 0 is `originCycle`. */
  readonly lanes: readonly LaneActivity[]
  /** Sections partitioning the window, with song-ABSOLUTE bounds. */
  readonly sections: readonly SongSection[]
  /** False when collection was aborted before the whole window was gathered —
   *  the lanes then describe only a prefix of it, and the caller must not
   *  present a partial window as a complete one. */
  readonly complete: boolean
}

export interface AnalyzeWindowOptions {
  /** Cycles collected per slice before a budget check (default 4). */
  sliceCycles?: number
  /** Wall-clock budget (ms) between yields to the event loop (default 10). */
  sliceBudgetMs?: number
  /** Collector — the band accessor (#1197). With none, the window is empty. */
  collectFn?: (startCycle: number, endCycle: number) => IREvent[]
  /** Clock — defaults to `performance.now()`. Injected in tests. */
  now?: () => number
  /** Yield to the event loop between budgeted slices. Default = macrotask. */
  yieldFn?: () => Promise<void>
  /** Cooperative cancellation; checked between slices. */
  signal?: { readonly aborted: boolean }
  /**
   * Lane keys that must appear as rows even when silent through this window —
   * normally the first window's lane set, or the document's track set. See
   * `accumulateLanesInWindow`: without this, a track silent here CEASES TO
   * EXIST rather than going empty, and the display rebuilds its row without the
   * silenced treatment (#1098/#1107).
   */
  pinnedLaneKeys?: readonly string[]
}

/**
 * Collect and accumulate ONE window `[originCycle, originCycle + spanCycles)`.
 *
 * Same budgeted, abortable slicing discipline as `analyzeSong` — but no
 * progressive horizon and no period rule, because a window neither grows nor
 * decides. It is the "keep looking further into a song we already know does not
 * repeat" half of #1108.
 */
export async function analyzeWindow(
  originCycle: number,
  spanCycles: number,
  opts: AnalyzeWindowOptions = {},
): Promise<WindowAnalysis> {
  const origin = Math.max(0, Math.floor(Number.isFinite(originCycle) ? originCycle : 0))
  const span = Math.max(0, Math.floor(Number.isFinite(spanCycles) ? spanCycles : 0))
  const slice = Math.max(1, Math.floor(opts.sliceCycles ?? DEFAULT_SLICE))
  const budgetMs = opts.sliceBudgetMs ?? DEFAULT_BUDGET_MS
  const collectFn = opts.collectFn ?? (() => [])
  const now = opts.now ?? defaultNow
  const yieldFn = opts.yieldFn ?? defaultYield
  const signal = opts.signal

  const events: IREvent[] = []
  let collectedTo = origin
  let lastYield = now()
  let complete = true

  while (collectedTo < origin + span) {
    if (signal?.aborted) {
      complete = false
      break
    }
    const sliceEnd = Math.min(collectedTo + slice, origin + span)
    events.push(...collectFn(collectedTo, sliceEnd))
    collectedTo = sliceEnd
    if (now() - lastYield >= budgetMs && collectedTo < origin + span) {
      await yieldFn()
      lastYield = now()
    }
  }

  // Accumulate over the span REQUESTED, not the span reached: a window aborted
  // halfway keeps its full width so the view's geometry does not silently
  // shrink mid-page. `complete` is what tells the caller the difference.
  const lanes = accumulateLanesInWindow(events, origin, span, opts.pinnedLaneKeys)
  const sections = computeSectionsInWindow(lanes, origin, span)
  return { originCycle: origin, spanCycles: span, lanes, sections, complete }
}
