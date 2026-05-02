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
  /**
   * Per-pass IR snapshots, in execution order. v1 Strudel pipeline
   * publishes a single entry: { name: "Parsed", ir: <parseStrudel output> }.
   * Future passes (parser decomposition, JS API Tier 4 desugaring) append.
   *
   * Note: this list is IR-shaped only. The collected IREvent[] is NOT
   * a pass entry — it lives in `events` below because it is not a
   * PatternIR tree.
   */
  passes: { readonly name: string; readonly ir: PatternIR }[]
  /**
   * Convenience alias of `passes[passes.length - 1].ir` — the IR
   * after the last pass ran. Kept for back-compat with consumers
   * that read `snap.ir` directly. Publishers MUST set this to
   * stay consistent with `passes`. New consumers should prefer
   * `passes[selected].ir` so they can switch passes.
   */
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
