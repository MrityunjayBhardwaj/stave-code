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

/**
 * Signal that a `(runtime, source)` pair has just evaluated cleanly.
 * Live-mode filters use the marker timestamp to hide any log entry
 * emitted BEFORE it — "old errors the user has since fixed".
 */
export interface FixedMarker {
  runtime: RuntimeId
  /** Workspace file path (or omitted → runtime-wide fix). */
  source?: string
  /** Epoch ms when the fix happened. */
  ts: number
}

type FixedListener = (
  marker: FixedMarker,
  markers: ReadonlyMap<string, number>,
) => void

const MAX_HISTORY = 500

const history: LogEntry[] = []
const listeners = new Set<LogListener>()
const fixedMarkers = new Map<string, number>()
const fixedListeners = new Set<FixedListener>()

let idSeq = 0

function fixedKey(runtime: RuntimeId, source: string | undefined): string {
  return `${runtime}:${source ?? '*'}`
}

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
  // Dedupe: if the previous entry shares (level, runtime, source, line,
  // message), treat this as a repeat and just bump its timestamp.
  // Without this, a p5 FES warning fired from inside `draw()` would
  // push 60 identical rows per second into the Console panel — the
  // user hits save, nothing gets better, the panel is unreadable in
  // seconds. The stretched timestamp also keeps the entry "newer than"
  // the last emitFixed so Live mode continues to surface it (it's
  // still broken — no reason to suppress the reminder).
  const last = history.length > 0 ? history[history.length - 1] : undefined
  if (
    last &&
    last.level === partial.level &&
    last.runtime === partial.runtime &&
    last.source === partial.source &&
    last.line === partial.line &&
    last.message === partial.message
  ) {
    last.ts = Date.now()
    // Listeners still fire — UIs may want to re-render the row's
    // timestamp or re-flash a toast on repeat. They can dedupe
    // themselves via `entry.id` if they prefer a single notification.
    queueMicrotask(() => {
      for (const fn of listeners) {
        try {
          fn(last, history)
        } catch {
          /* swallow */
        }
      }
    })
    return last
  }
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
  fixedMarkers.clear()
  for (const fn of listeners) {
    try {
      fn(null, history)
    } catch {
      /* ignore */
    }
  }
}

/**
 * Record that `(runtime, source)` just evaluated cleanly. Non-destructive:
 * history is preserved. Consumers (the Console panel's Live mode) use
 * the marker timestamp to hide entries emitted before the fix. Called
 * from the runtime's `onEvaluateSuccess` bridge.
 */
export function emitFixed(input: {
  runtime: RuntimeId
  source?: string
}): FixedMarker {
  const marker: FixedMarker = {
    runtime: input.runtime,
    source: input.source,
    ts: Date.now(),
  }
  fixedMarkers.set(fixedKey(input.runtime, input.source), marker.ts)
  queueMicrotask(() => {
    for (const fn of fixedListeners) {
      try {
        fn(marker, fixedMarkers)
      } catch {
        /* A broken subscriber shouldn't kill the emitter. */
      }
    }
  })
  return marker
}

/**
 * Subscribe to fix events. Does NOT replay existing markers — call
 * `getFixedMarkers()` on mount if a starting snapshot is needed.
 */
export function subscribeFixed(fn: FixedListener): () => void {
  fixedListeners.add(fn)
  return () => {
    fixedListeners.delete(fn)
  }
}

/** Read the current fix-marker table. Key format: `${runtime}:${source|*}`. */
export function getFixedMarkers(): ReadonlyMap<string, number> {
  return new Map(fixedMarkers)
}

/** Key helper exported for consumers that need to build the same key. */
export function makeFixedKey(
  runtime: RuntimeId,
  source: string | undefined,
): string {
  return fixedKey(runtime, source)
}

/**
 * TESTING ONLY — wipe state between vitest suites so module-level
 * history doesn't leak across tests.
 */
export function __resetEngineLogForTests(): void {
  history.length = 0
  listeners.clear()
  fixedMarkers.clear()
  fixedListeners.clear()
  idSeq = 0
}
