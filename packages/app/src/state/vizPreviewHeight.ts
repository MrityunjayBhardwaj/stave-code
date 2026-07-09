"use client";

import { useSyncExternalStore } from "react";

/**
 * Viz-library card PREVIEW HEIGHT (#838) — the px height of the thumbnail /
 * live-hover preview box on each viz card in the Asset Library.
 *
 * Exposed as a Settings slider (Visualization → Preview height). The control
 * (SettingsPanel) and the consumer (AssetLibraryPanel's viz cards) live in
 * different subtrees whose only common ancestor is StaveApp, so — like
 * {@link ./rulerUnits} — the value lives in this tiny external store rather than
 * threading through prop surfaces. Unlike rulerUnits it PERSISTS (a UI
 * preference), in localStorage, clamped to the slider range on read + write.
 */

const KEY = "stave.assetLibrary.vizPreviewHeight";

export const VIZ_PREVIEW_HEIGHT_MIN = 48;
export const VIZ_PREVIEW_HEIGHT_MAX = 200;
export const VIZ_PREVIEW_HEIGHT_DEFAULT = 96;

const clamp = (n: number): number =>
  Math.min(VIZ_PREVIEW_HEIGHT_MAX, Math.max(VIZ_PREVIEW_HEIGHT_MIN, Math.round(n)));

function initial(): number {
  if (typeof window === "undefined") return VIZ_PREVIEW_HEIGHT_DEFAULT;
  try {
    const raw = window.localStorage.getItem(KEY);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) ? clamp(n) : VIZ_PREVIEW_HEIGHT_DEFAULT;
  } catch {
    return VIZ_PREVIEW_HEIGHT_DEFAULT;
  }
}

let current = initial();
const listeners = new Set<() => void>();

export function getVizPreviewHeight(): number {
  return current;
}

export function setVizPreviewHeight(next: number): void {
  const v = clamp(next);
  if (v === current) return;
  current = v;
  try {
    window.localStorage.setItem(KEY, String(v));
  } catch {
    /* ignore — non-persisting is acceptable (private mode, etc.) */
  }
  for (const l of listeners) l();
}

export function subscribeVizPreviewHeight(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** React binding — re-renders the caller whenever the preview height changes. */
export function useVizPreviewHeight(): number {
  return useSyncExternalStore(subscribeVizPreviewHeight, getVizPreviewHeight, getVizPreviewHeight);
}
