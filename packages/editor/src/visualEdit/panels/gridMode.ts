/**
 * gridMode.ts — how the step grid lays out a `,`-stack's rows (#1855).
 *
 *   exact  each row at its own part's steps: `~ sd ~ sd, hh*8` draws the snare as 4 boxes
 *          and the hats as 8, and a click fills one whole box (the default)
 *   lcm    every row cut to one shared grid, the least common multiple of the parts —
 *          the snare's steps are drawn 2 cells wide, as the grid always drew them
 *
 * A VIEW, not a model: both modes edit the same `StepGridModel` through the same writer,
 * so the code a click writes is the same either way; Exact only decides what a box is.
 *
 * A global UI setting, shared by every grid and persisted — the same tiny external
 * store + SSR-safe localStorage as `noteColor.ts`, set from the app's Settings
 * (Pattern & Timeline › Grid).
 */
import * as React from 'react'

export type GridMode = 'exact' | 'lcm'

export const GRID_MODE_KEY = 'stave:visualEdit.gridMode'
/** Exact from the first launch (decided 2026-09-30 on #1855) */
const DEFAULT_MODE: GridMode = 'exact'

function readStored(): GridMode {
  if (typeof window === 'undefined') return DEFAULT_MODE
  try {
    const v = window.localStorage.getItem(GRID_MODE_KEY)
    return v === 'exact' || v === 'lcm' ? v : DEFAULT_MODE
  } catch {
    return DEFAULT_MODE
  }
}

let current: GridMode = readStored()
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The grid mode, re-rendering when Settings changes it. */
export function useGridMode(): GridMode {
  return React.useSyncExternalStore(subscribe, () => current, () => DEFAULT_MODE)
}

/** Current grid mode — for the Settings modal to seed its control. */
export function getGridMode(): GridMode {
  return current
}

/** Set the grid mode (the Settings modal). Persists and redraws every live grid. */
export function setGridMode(mode: GridMode): void {
  if (mode === current) return
  current = mode
  try {
    window.localStorage.setItem(GRID_MODE_KEY, mode)
  } catch {
    /* Safari private mode — keep the in-memory value */
  }
  listeners.forEach((l) => l())
}
