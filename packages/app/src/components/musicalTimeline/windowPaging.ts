/**
 * The window's own arithmetic (#1201) — every question whose answer changes
 * once the view can show a stretch that does not start at cycle 0.
 *
 * ── WHY THESE LIVE TOGETHER, AND WHY THEY ARE NOT INLINE ────────────────────
 * Four sites in `FullSongTimeline` compare a song-ABSOLUTE cycle against the
 * window: the seek clamp, the past-the-end notice, the notice's text, and the
 * paging trigger. All four are correct at origin 0 whether or not they know
 * about the origin, because there the window's width and its end are the same
 * number. That is precisely what made the first three ship unverified — and
 * what let the fourth (the notice text) survive the grep recipe written to
 * catch exactly this class, since a template string is not a comparison.
 *
 * Written as pure functions of the window so a test can drive them at an
 * origin the component cannot yet reach through its own gestures. Production
 * must CALL these rather than restate the arithmetic: a restatement passes the
 * tests while the shipped view uses different numbers.
 */
import type { SongWindow } from './songAxis'

/**
 * How far into the current window the playhead gets before the next one is
 * requested. Three quarters: a window is 128-512s of playback and a page costs
 * a ~383ms median, flat with depth, so the last quarter is tens of seconds of
 * warning for a sub-second job. Deliberately not tuned tighter — the
 * measurement leaves 100-1000x headroom, so a later trigger buys only risk.
 */
export const PAGE_AHEAD_FRACTION = 0.75

/** One past the last cycle the window shows. The value four sites need and
 *  three of them previously spelled as a bare span. */
export function windowEndCycle(window: SongWindow): number {
  return window.originCycle + window.spanCycles
}

/**
 * The origin to request next, or `null` to ask for nothing.
 *
 * `null` for a song that LOOPS: paging exists only on the branch where period
 * detection failed. When a period was found, cycle 257 genuinely is cycle 1 —
 * there is nothing to the right to reach, and asking would re-analyse the same
 * music forever.
 *
 * Stable while the condition holds — the trigger fires every frame and this
 * keeps naming the same origin, because deduplication belongs to the owner
 * that knows whether a page is already in flight.
 */
export function nextWindowOriginFor(
  songPos: number | null,
  originCycle: number,
  spanCycles: number,
  looping: boolean,
): number | null {
  if (songPos == null) return null
  if (looping) return null
  if (!Number.isFinite(spanCycles) || spanCycles <= 0) return null
  if (!Number.isFinite(originCycle)) return null
  if (songPos < originCycle + spanCycles * PAGE_AHEAD_FRACTION) return null
  return originCycle + spanCycles
}

/**
 * Clamp a seek to the end of the stretch on screen.
 *
 * ⚠ Against the window's END, never its WIDTH. Origin-blind, a click near the
 * end of the second page clamps to 256 and seeks BACKWARDS into the first.
 */
export function clampSeekToWindow(cycle: number, window: SongWindow): number {
  return Math.min(cycle, windowEndCycle(window))
}

/** Has the transport passed everything this window shows? Absolute position
 *  against the absolute end, not against the width. */
export function isBeyondWindow(songPos: number | null, window: SongWindow): boolean {
  return songPos != null && songPos >= windowEndCycle(window)
}

/**
 * What to tell the user about a span that is a stopping point rather than a
 * loop — naming the cycles they are LOOKING AT.
 *
 * The first page keeps its original wording, because "the first N cycles" is
 * both true and friendlier there; any later page has to name its own range or
 * it reports the wrong part of the song with total confidence.
 */
export function windowNotice(window: SongWindow, beyond: boolean): string {
  const end = windowEndCycle(window)
  if (window.originCycle === 0) {
    return beyond
      ? `no repeat · playing past cycle ${Math.floor(end)}`
      : `no repeat · showing first ${Math.floor(window.spanCycles)} cycles`
  }
  return beyond
    ? `no repeat · playing past cycle ${Math.floor(end)}`
    : `no repeat · showing cycles ${Math.floor(window.originCycle)}–${Math.floor(end)}`
}
