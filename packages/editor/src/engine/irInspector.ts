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

export interface IRSnapshot {
  /** Epoch ms when the snapshot was captured. */
  ts: number
  /** Workspace file path the source came from, if known. */
  source?: string
  /** Runtime that produced this snapshot — only Strudel for v0. */
  runtime: RuntimeId
  /** The raw user code that was parsed. */
  code: string
  /** Top-level parsed IR. May be a Stack of $: tracks or a single track. */
  ir: PatternIR
  /** Collected events for one cycle window starting at t=0. */
  events: IREvent[]
}

type Listener = (snap: IRSnapshot | null) => void

let current: IRSnapshot | null = null
const listeners = new Set<Listener>()

export function publishIRSnapshot(snap: IRSnapshot): void {
  current = snap
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
