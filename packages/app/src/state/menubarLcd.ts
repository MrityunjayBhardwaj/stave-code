"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the menubar's Transport LCD is shown (#857).
 *
 * The LCD replaces the passive "Stave Code" brand in the menubar's centered
 * slot. Two subtrees care — `MenuBar` (renders the LCD or the brand) and the
 * Settings panel (toggles it) — so, like `rulerUnits`, it lives in a tiny
 * external store rather than being threaded through prop surfaces.
 *
 * Persisted (localStorage, default ON) so the choice survives reloads, the
 * way the theme does. Reads are SSR-safe: the default is returned when there
 * is no window, and the store hydrates from storage on first client read.
 */

const STORAGE_KEY = "stave:menubarLcd";
const DEFAULT_ENABLED = true;

function read(): boolean {
  try {
    if (typeof window === "undefined") return DEFAULT_ENABLED;
    const saved = window.localStorage?.getItem(STORAGE_KEY);
    if (saved === null || saved === undefined) return DEFAULT_ENABLED;
    return saved === "1";
  } catch {
    return DEFAULT_ENABLED;
  }
}

function write(next: boolean): void {
  try {
    window.localStorage?.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* storage unavailable — in-session value still updates */
  }
}

let current = read();
const listeners = new Set<() => void>();

export function getMenubarLcdEnabled(): boolean {
  return current;
}

export function setMenubarLcdEnabled(next: boolean): void {
  if (next === current) return;
  current = next;
  write(next);
  for (const l of listeners) l();
}

export function subscribeMenubarLcd(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** React binding — re-renders the caller whenever the flag changes. */
export function useMenubarLcd(): boolean {
  return useSyncExternalStore(subscribeMenubarLcd, getMenubarLcdEnabled, () => DEFAULT_ENABLED);
}
