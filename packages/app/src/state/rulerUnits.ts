"use client";

import { useSyncExternalStore } from "react";

/**
 * Shared ruler-units state (#750).
 *
 * CYCLES = Strudel's native cycle numbering; BARS = DAW convention (one
 * cycle ≈ one bar) with quarter-cycle beat ticks (#412).
 *
 * The control that flips this lives on the editor pattern bar
 * (StrudelEditorClient chrome), while the consumer — the Timeline ruler
 * (FullSongTimeline) — lives in a different subtree. Their only common
 * ancestor is StaveApp, so instead of threading the value through two large
 * prop surfaces we keep it in this tiny external store (same shape as the
 * commands/keybindings store). Both sides read via `useRulerUnits`; the
 * pattern-bar button writes via `toggleRulerUnits`.
 *
 * In-session only (survives Timeline remounts, resets on reload) — matches
 * the prior local-useState behaviour. Persistence, if wanted, is a later
 * one-liner here.
 */

export type RulerUnits = "cycles" | "bars";

let current: RulerUnits = "cycles";
const listeners = new Set<() => void>();

export function getRulerUnits(): RulerUnits {
  return current;
}

export function setRulerUnits(next: RulerUnits): void {
  if (next === current) return;
  current = next;
  for (const l of listeners) l();
}

export function toggleRulerUnits(): void {
  setRulerUnits(current === "cycles" ? "bars" : "cycles");
}

export function subscribeRulerUnits(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** React binding — re-renders the caller whenever the units change. */
export function useRulerUnits(): RulerUnits {
  return useSyncExternalStore(subscribeRulerUnits, getRulerUnits, getRulerUnits);
}
