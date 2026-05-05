/**
 * IR Inspector store — the latest parsed-and-collected snapshot from
 * the most recent successful Strudel eval. Subscribed by the IR
 * Inspector panel; emitted by `StrudelEditorClient`'s eval hook.
 *
 * Why a tiny purpose-built store instead of reusing engineLog: the
 * payload is structurally different (a tree + an event array, not a
 * sequence of log lines) and the UI semantics are different too —
 * Console keeps history, Inspector keeps only the latest.
 */
import type { PatternIR } from '../ir/PatternIR'
import type { IREvent } from '../ir/IREvent'
import type { RuntimeId } from './engineLog'
import { captureSnapshot } from './timelineCapture'

export interface IRSnapshot {
  /** Epoch ms when the snapshot was captured. */
  ts: number
  /** Workspace file path the source came from, if known. */
  source?: string
  /** Runtime that produced this snapshot — only Strudel for v0. */
  runtime: RuntimeId
  /** The raw user code that was parsed. */
  code: string
  /** Per-pass IR snapshots, in execution order. IR-shaped only — collected events live in `events`. */
  passes: readonly { readonly name: string; readonly ir: PatternIR }[]
  /** Alias of `passes[passes.length - 1].ir`. Publishers MUST keep these in sync. */
  ir: PatternIR
  /** Collected events for one cycle window starting at t=0. */
  events: IREvent[]
}

type Listener = (snap: IRSnapshot | null) => void

let current: IRSnapshot | null = null
const listeners = new Set<Listener>()

/**
 * Publish a snapshot. Two parallel side-effects fire on every publish
 * (PK9 step 8 — order independent, both must run):
 *  1. captureSnapshot fan-out — pushes into the timeline ring buffer
 *     (timelineCapture.ts) so past evals can be scrubbed.
 *  2. listener fan-out — single-slot consumers (the IR Inspector
 *     panel's live subscribe) re-render with the new snapshot.
 *
 * The optional `meta` parameter carries cycle position (read by the
 * publisher from `runtime.getCurrentCycle()`) onto the capture entry.
 * Existing callers pass no `meta` and continue to compile; capture
 * defaults `cycleCount` to `null` in that case.
 */
export function publishIRSnapshot(
  snap: IRSnapshot,
  meta?: { cycleCount?: number | null },
): void {
  current = snap
  // PK9 step 8a — timeline capture fan-out (Phase 19-08).
  captureSnapshot(snap, {
    ts: snap.ts,
    cycleCount: meta?.cycleCount ?? null,
  })
  // PK9 step 8b — listener fan-out (single-slot consumers).
  for (const l of listeners) {
    try { l(snap) } catch { /* listener errors don't block the publish */ }
  }
}

export function clearIRSnapshot(): void {
  current = null
  for (const l of listeners) {
    try { l(null) } catch { /* swallow */ }
  }
}

export function getIRSnapshot(): IRSnapshot | null {
  return current
}

export function subscribeIRSnapshot(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
