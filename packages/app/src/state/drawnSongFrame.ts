"use client";

import type { DrawnSongFrame } from "../components/musicalTimeline/songAxis";

/**
 * The frame the Song timeline's playhead is drawn in (#1725): the window it
 * wraps over and whether that window loops.
 *
 * The transport display reads it so the number it shows is the one under the
 * playhead. The display sits in the menubar and the timeline in the bottom
 * panel, so the value lives here, not in props through StaveApp.
 *
 * Two writers, one answer (#1726):
 *  - the timeline, while it is mounted: only it sees a live edge-drag of a bare
 *    loop and a paged window, so its frame wins;
 *  - the song analysis (`state/songAnalysis.ts`), which runs whether or not the
 *    drawer is open: the frame the timeline WOULD draw, from the same rule
 *    (`songFrame.ts`), so closing the drawer does not change the number.
 *
 * Each writer withdraws its own frame (`null`) when it has none: the timeline on
 * unmount, the analysis when a new document has no result yet. A frame left
 * behind by an earlier document would be a guess about this one.
 *
 * Read on the display's animation loop, so there are no subscribers.
 */

let drawn: DrawnSongFrame | null = null;
let song: DrawnSongFrame | null = null;

/** The timeline's frame, while it is mounted; `null` on unmount. */
export function publishDrawnSongFrame(frame: DrawnSongFrame | null): void {
  drawn = frame;
}

/** The analysis's frame for the current document; `null` while there is none. */
export function publishSongFrame(frame: DrawnSongFrame | null): void {
  song = frame;
}

export function readDrawnSongFrame(): DrawnSongFrame | null {
  return drawn ?? song;
}
