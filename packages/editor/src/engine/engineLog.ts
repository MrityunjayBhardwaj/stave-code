/**
 * Shared event store for every runtime's info / warn / error messages.
 *
 * Goal: one stream of structured log entries that multiple UI surfaces
 * subscribe to — toast on new errors, status-bar LED counting new
 * entries since last opened, Monaco inline markers on the offending
 * file, and a dedicated Console panel with history + filters. Each
 * runtime (Strudel, Sonic Pi, p5.js, Hydra) emits through the same
 * `emitLog` entry point so downstream consumers don't need per-runtime
 * special-casing.
 *
 * The store keeps a bounded history (MAX_HISTORY most recent entries).
 * Listeners are fired synchronously on emit so UI surfaces can update
 * in the same microtask as the runtime error handler.
 */

export type LogLevel = 'info' | 'warn' | 'error'

export type RuntimeId =
  | 'strudel'
  | 'sonicpi'
  | 'p5'
  | 'hydra'
  /** Stave-itself errors (engine init, host-side failures). */
  | 'stave'

/**
 * "Did you mean X?" hint produced by the friendly-error formatter from
 * a fuzzy match against the runtime's `DocsIndex`. Carried on the log
 * entry so every UI surface (toast, console row, Monaco marker) can
 * render it the same way.
 */
export interface LogSuggestion {
  /** Canonical symbol name (e.g. `noise`). */
  name: string
  /** In-app docs page for the suggested symbol. */
  docsUrl: string
  /** One-line example if the DocsIndex carried one. */
  example?: string
  /** First-sentence description if present. */
  description?: string
}

export interface LogEntry {
  /** Monotonic-ish unique id — used as React key, preserved through history. */
  id: string
  /** Epoch ms when the entry was emitted. */
  ts: number
  level: LogLevel
  runtime: RuntimeId
  /** Workspace file path this entry originated from, if known. */
  source?: string
  /** 1-indexed line number inside `source`, if known. */
  line?: number
  column?: number
  message: string
  suggestion?: LogSuggestion
  /** Raw error stack for the "expand stack" fold. */
  stack?: string
}

type LogListener = (
  entry: LogEntry | null,
  history: readonly LogEntry[],
) => void

const MAX_HISTORY = 500

const history: LogEntry[] = []
const listeners = new Set<LogListener>()

let idSeq = 0

function makeId(): string {
  idSeq += 1
  return `log-${Date.now().toString(36)}-${idSeq.toString(36)}`
}

/**
 * Emit a log entry. Returns the full entry (with generated id + ts) so
 * callers can hold a reference for later deduplication or jumping. A
 * `null` listener signal is reserved for `clearLog` / reset — emitLog
 * always passes the emitted entry.
 */
export function emitLog(
  partial: Omit<LogEntry, 'id' | 'ts'>,
): LogEntry {
  const entry: LogEntry = {
    id: makeId(),
    ts: Date.now(),
    ...partial,
  }
  history.push(entry)
  // Bound the buffer — drop oldest when past the cap. Listeners see
  // only the newest entry; they can re-read getLogHistory() if they
  // need the whole window.
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY)
  }
  // Fire listeners in a microtask so runtime error paths (Strudel
  // onEvalError, Monaco marker commit, etc.) aren't forced to re-enter
  // React's commit phase with React setStates happening from
  // subscribers — mid-eval state updates caused the whole subtree to
  // unmount when a live syntax error interleaved with the engine's
  // own error reporting. Deferred is still fast enough (<1ms) for toast
  // + status bar feel instantaneous.
  queueMicrotask(() => {
    for (const fn of listeners) {
      try {
        fn(entry, history)
      } catch {
        // A broken subscriber shouldn't kill the emitter.
      }
    }
  })
  return entry
}

/**
 * Subscribe to every future log entry. Returns an unsubscribe. Does
 * NOT replay history — consumers that need it should call
 * `getLogHistory()` on mount.
 */
export function subscribeLog(fn: LogListener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/**
 * Read the current history in chronological order. Safe to mutate the
 * returned array; we give back a frozen slice of the internal buffer.
 */
export function getLogHistory(): readonly LogEntry[] {
  return [...history]
}

/**
 * Empty the history and fire a `null` notification so subscribers can
 * reset their local state (clear marker maps, zero the LED counter).
 */
export function clearLog(): void {
  history.length = 0
  for (const fn of listeners) {
    try {
      fn(null, history)
    } catch {
      /* ignore */
    }
  }
}

/**
 * TESTING ONLY — wipe state between vitest suites so module-level
 * history doesn't leak across tests.
 */
export function __resetEngineLogForTests(): void {
  history.length = 0
  listeners.clear()
  idSeq = 0
}
