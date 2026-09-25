import { structuralWalk, wholeWalkWindow, type PatternIR, type SongAnalysis } from '@stave/editor'

import type { DrawnSongFrame } from './songAxis'

/**
 * The span the Song timeline draws a song over, and the frame its playhead
 * wraps in (#1726).
 *
 * Two readers need the SAME answer: the timeline, which draws the song over
 * this span, and the transport display, which wraps the song position to it
 * (#1725). The display has to work with the drawer closed, when no timeline is
 * mounted, so the rule lives here rather than inside the timeline, and both
 * call it.
 */

/** A bare loop's single implicit clip spans the SONG, not just its one-cycle
 *  period — so it has room to be split into addressable bars (#489 D3). A pure
 *  bare song (no `arrange`/`cat` combinator) is floored to this many cycles;
 *  extensible later via #487. A real arrangement already defines its own span. */
export const MIN_BARE_SPAN = 4

/** The smallest span a user may SHRINK a bare loop to by dragging its edge
 *  (#662). Two cycles keeps Split possible (a split needs ≥ 2 to yield two
 *  non-empty arms). Once the user has resized, this clamp — not `MIN_BARE_SPAN`
 *  — is the floor, so a tight 2-bar working area is reachable. */
export const MIN_BARE_SPLIT_SPAN = 2

/** The natural display span: one loop period, or the analyzed horizon. ≥ 1.
 *  The choice between those two is the ANALYSIS's to make and it already made
 *  it — this only applies the floor. */
export function naturalSpan(analysis: SongAnalysis | null): number {
  if (!analysis) return 1
  return Math.max(1, analysis.displaySpan.cycles)
}

/** Display span in cycles. The natural span, but a pure bare loop is floored to
 *  `MIN_BARE_SPAN` so its single implicit clip is splittable (#489 D3). A real
 *  arrangement keeps its own length — flooring a period-2 arrange to 4 would paint
 *  empty bars past the last arm. ≥ 1.
 *
 *  `bareSpanOverride` is the user's resized span (#662, option B): a view-only
 *  preference that grows/shrinks the displayed bars with NO code write-back. When
 *  set it REPLACES the `MIN_BARE_SPAN` floor with the shrinkable `MIN_BARE_SPLIT_SPAN`
 *  clamp (so a 2-bar working area is reachable), but never drops below the true
 *  content period (`natural`) — you can't show fewer bars than one full loop. */
export function displaySpan(
  analysis: SongAnalysis | null,
  bareSong: boolean,
  bareSpanOverride?: number | null,
): number {
  const natural = naturalSpan(analysis)
  if (!bareSong) return natural
  if (bareSpanOverride != null) {
    return Math.max(MIN_BARE_SPLIT_SPAN, natural, Math.round(bareSpanOverride))
  }
  return Math.max(MIN_BARE_SPAN, natural)
}

/** Is this a pure bare song — NO `arrange`/`cat` combinator anywhere?
 *
 *  Structure-only probe (#974): "bare" = NO arrange/cat combinator. A lane carries
 *  `armByCycle` iff an event under it had an `armIndex` (an arrangement arm) — the
 *  structural walk sets it from the same source structure `collectCycles` did, so this is
 *  the byte-identical successor to the old `evs.some(e => armIndex)` check, without needing
 *  the behaviour engine and resilient on mid-edit code.
 *  Deliberately the WHOLE song, at every page (#1209): "does this document
 *  contain an arrangement at all" is a property of the DOCUMENT, and it
 *  decides the display span — so a window in which every arm happens to rest
 *  must not make a real arrangement read as a bare loop. Walked over the
 *  natural span so an arrange whose first cycles are silent still registers
 *  its later arms. */
export function isBareSong(ir: PatternIR | null, analysis: SongAnalysis | null): boolean {
  if (ir == null) return false
  const lanes = structuralWalk(ir, wholeWalkWindow(Math.max(1, Math.ceil(naturalSpan(analysis)))))
  return !lanes.some((l) => l.armByCycle !== undefined)
}

/** Does the drawn span repeat? Not when the analysis grew to its cap without
 *  confirming a period (#1105): the span is then a stopping point, and nothing
 *  about the song repeats at it. A `horizon` span, and an `arranged` one
 *  (#1721, the length after which the song comes back round), loop. */
export function spanLoops(analysis: SongAnalysis | null): boolean {
  return analysis == null || analysis.displaySpan.kind !== 'capped'
}

/** The frame the playhead wraps in, from the song alone: the span the timeline
 *  would draw at its first page. `null` with no analysis: nothing is known about
 *  where one time through ends, so nothing wraps. */
export function songFrameOf(
  analysis: SongAnalysis | null,
  ir: PatternIR | null,
  bareSpanOverride: number | null,
): DrawnSongFrame | null {
  if (analysis == null) return null
  return {
    window: { originCycle: 0, spanCycles: displaySpan(analysis, isBareSong(ir, analysis), bareSpanOverride) },
    looping: spanLoops(analysis),
  }
}
