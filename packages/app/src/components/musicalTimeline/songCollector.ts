/**
 * The onset collector the Song analysis reads through — ONE definition, shared
 * by the whole-song pass and by every window.
 *
 * ── WHY THIS IS A MODULE AND NOT AN INLINE CLOSURE (#1201 item 3) ───────────
 * It used to be built inside `MusicalTimeline`'s analyze effect, which was fine
 * while `analyzeSong` was the only caller. Paging adds a second: `analyzeWindow`
 * needs onsets in the SAME key space, filtered by the SAME band rule. Left
 * inline, the second caller has to hold a copy of the lane anchors, the
 * `laneKeyForHap` remap, and the straddling-onset filter — and that filter is
 * load-bearing in a way a copy will not preserve for long: double-counting one
 * onset changes the cycle fingerprints, which changes the DETECTED PERIOD. A
 * verbatim copy of a transform in a second consumer is how the seventh render
 * site stayed invisible in #1201's first half; this exists so there is no copy
 * to drift.
 *
 * The collector is created ONCE PER ANALYSIS RUN rather than memoised, because
 * `heard` accumulates within a run and `hasUnheardTrack` is asked at decision
 * time — see below.
 */
import type { IREvent, PatternIR } from '@stave/editor'
import { buildLaneAnchors, laneKeyForHap, readEventsInBand } from './timelineMarks'

/** The runtime accessors a collector reads through. All optional: with none
 *  threaded (tests / non-Strudel runtimes) there is no collector and analysis
 *  sees no onsets. */
export interface SongCollectorAccessors {
  readonly getTimelineEvents?: ((cycles: number) => IREvent[]) | undefined
  readonly getTimelineEventsBand?: ((startCycle: number, endCycle: number) => IREvent[]) | undefined
  readonly getSongTrackIds?: (() => string[]) | undefined
}

export interface SongCollector {
  /** `[startCycle, endCycle)` → events in the DISPLAY lane key space.
   *  `undefined` when no runtime accessor is threaded. */
  readonly collectFn: ((startCycle: number, endCycle: number) => IREvent[]) | undefined
  /**
   * Clause (a) of `displayPeriodRule`, answered in the CAPTURE key space.
   *
   * ⚠ Meaningful ONLY for `analyzeSong`. A window neither detects nor can
   * contribute a period, so `analyzeWindow` has no option to pass this to and
   * must not grow one.
   */
  readonly hasUnheardTrack: (() => boolean) | undefined
}

/**
 * Build the collector for one analysis run over `ir`.
 *
 * Per-run rather than shared: `heard` is a running record of the capture keys
 * this run has seen, and `hasUnheardTrack` reads it at DECISION time so the
 * answer reflects everything collected up to the horizon being judged. A
 * collector shared across runs would carry a previous document's hearing into
 * the current one's period verdict.
 */
export function createSongCollector(
  ir: PatternIR,
  accessors: SongCollectorAccessors,
): SongCollector {
  const getEvents = accessors.getTimelineEvents
  const getEventsBand = accessors.getTimelineEventsBand
  const getTrackIds = accessors.getSongTrackIds

  let collectFn: ((startCycle: number, endCycle: number) => IREvent[]) | undefined
  // #1107 — the CAPTURE keys heard so far, recorded BEFORE the remap below.
  // This is the whole reason the question is answered here: the remapped keys
  // are display lanes, and 20 of the corpus's 78 anchored documents have an
  // anchor key no hap ever lands on (a track whose haps carry no `loc`, or one
  // whose `loc` precedes its own statement) — so there, "unheard" would mean a
  // key nothing can ever satisfy rather than a track yet to enter. In the
  // capture space every registered pattern that sounds at all stamps its own
  // key, so an unheard key means an unheard TRACK.
  const heard = new Set<string>()
  if (getEvents || getEventsBand) {
    const anchors = buildLaneAnchors(ir, 1)
    collectFn = (startCycle, endCycle) => {
      // #1197 — ask for the BAND when that accessor is threaded, else the
      // prefix form. `analyzeSong` walks adjacent bands as its horizon grows,
      // so on the prefix path a document running to the 256 cap queried 8320
      // cycles to cover 256. The choice itself lives in `readEventsInBand`
      // (#1209), shared with the marks reader — the two must never disagree
      // about which events exist for a band. Its header carries the fallback's
      // exact semantics; the filter below is what narrows a prefix.
      const raw = readEventsInBand({ getTimelineEventsBand: getEventsBand, getTimelineEvents: getEvents }, startCycle, endCycle) ?? []
      return raw
        // ⚠ LOAD-BEARING ON BOTH PATHS, and for DIFFERENT reasons. On the
        // prefix path it selects the band out of `[0, endCycle)`. On the band
        // path the query is already narrowed, but `queryArc` returns every hap
        // OVERLAPPING the arc — so a hap beginning at cycle 3.5 comes back
        // from both `[0, 4)` and `[4, 8)`. Analysis buckets an onset by
        // `floor(begin)`, so without this the straddling onset is counted in
        // two bands, which changes the cycle fingerprints and can move the
        // detected period. Do not delete it as redundant with the band.
        .filter((ev) => {
          const c = Math.floor(ev.begin)
          return c >= startCycle && c < endCycle
        })
        .map((ev) => {
          if (ev.trackId !== undefined) heard.add(ev.trackId)
          return { ...ev, trackId: laneKeyForHap(ev, anchors) }
        })
    }
  }

  // Asked at DECISION time, so it reflects everything collected up to the
  // horizon being judged. Only claims an unheard track when BOTH accessors are
  // threaded — a registered set with no event source would report every track
  // unheard and stall every document at the cap.
  const hasUnheardTrack = (getEvents || getEventsBand) && getTrackIds
    ? () => getTrackIds().some((id) => !heard.has(id))
    : undefined

  return { collectFn, hasUnheardTrack }
}
