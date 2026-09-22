"use client";

import type { DrawnSongFrame } from "../components/musicalTimeline/songAxis";

/**
 * The frame the Song timeline's playhead is drawn in (#1725): the window it
 * wraps over and whether that window loops.
 *
 * The timeline owns it, since only the timeline's analysis knows how long the
 * song is. The transport display reads it so the number it shows is the one
 * under the playhead. They sit in different subtrees (the menubar and the
 * bottom panel), so the value lives here, not in props through StaveApp.
 *
 * `null` when no timeline is mounted (the drawer is closed): nothing is drawn,
 * so there is no drawn position to agree with, and a frame left behind by an
 * earlier document would be a guess about this one.
 *
 * Read on the display's animation loop, so there are no subscribers.
 */

let current: DrawnSongFrame | null = null;

export function publishDrawnSongFrame(frame: DrawnSongFrame | null): void {
  current = frame;
}

export function readDrawnSongFrame(): DrawnSongFrame | null {
  return current;
}
