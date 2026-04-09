/**
 * WorkspaceFile store — Phase 10.2 Task 01.
 *
 * The in-memory source of truth for file content during Phase 10.2. Every
 * editor view writes through `setContent`, every preview view reads through
 * `getFile` (usually via the `useWorkspaceFile` hook). No React context, no
 * prop drilling — one module-level singleton.
 *
 * @remarks
 * ## Snapshot identity contract
 *
 * This store is consumed from React via `useSyncExternalStore`. That hook
 * requires `getSnapshot` to return a **reference-stable** value across calls
 * when the underlying state has not changed — returning a fresh object each
 * call causes React to throw "getSnapshot should be cached" and, worse,
 * causes infinite re-render loops in components that depend on the returned
 * value as an effect dep.
 *
 * The invariant this store upholds:
 *
 *    `getFile(id) === getFile(id)` — unless `setContent(id, …)` was called
 *    in between.
 *
 * This is achieved by **replacing**, not mutating, the entry in the map:
 *
 * ```ts
 * const prev = files.get(id)
 * files.set(id, { ...prev, content: newContent }) // new reference
 * ```
 *
 * Consumers subscribed to *other* file ids get the same reference on every
 * `getFile` call because nothing in their slot of the map moved. This is
 * the mechanism by which typing into file "a" does not re-render a
 * component reading file "b".
 *
 * ## Single-writer assumption
 *
 * Phase 10.2 assumes **one editor view per file id** is writing to any
 * given file at a time. Multi-writer support — e.g., two split panes
 * editing the same file with cursor coordination — is deferred to Phase
 * 10.3's VirtualFileSystem layer, which will need operational-transform or
 * CRDT machinery that does not belong in an in-memory Map.
 *
 * A test asserts the single-writer case. Multi-writer is explicitly out of
 * scope.
 *
 * ## Phase 10.3 stability
 *
 * The public API — `createWorkspaceFile`, `getFile`, `setContent`,
 * `subscribe` — is the contract the Phase 10.3 VirtualFileSystem replacement
 * must honor. Hooks built on top (`useWorkspaceFile`) are stable across the
 * replacement.
 */

import type { WorkspaceFile, WorkspaceLanguage } from './types'

type Subscriber = () => void

/**
 * Module-level map of file id → current snapshot. Replaced, never mutated.
 */
const files = new Map<string, WorkspaceFile>()

/**
 * Subscribers are keyed by file id so that a content change on file "a"
 * only wakes up the subscribers of "a". A single global subscriber set
 * would cause every `useSyncExternalStore` consumer to run `getSnapshot`
 * on every keystroke anywhere in the workspace, which is cheap per
 * invocation but scales poorly with tab count.
 */
const subscribersByFile = new Map<string, Set<Subscriber>>()

/**
 * Create a new WorkspaceFile and register it in the store. Safe to call
 * multiple times for the same id — later calls overwrite the earlier
 * snapshot AND notify subscribers (useful for reload / external source
 * changes, e.g., viz preset reload in Phase 10.2 Task 10).
 *
 * @param id          Stable unique id. App code is responsible for
 *                    uniqueness; the store does not generate ids.
 * @param path        Display path. Purely metadata — does not drive any
 *                    filesystem lookup in Phase 10.2.
 * @param content     Initial content string.
 * @param language    Monaco language id.
 * @param meta        Optional metadata bag (see `WorkspaceFile.meta`).
 */
export function createWorkspaceFile(
  id: string,
  path: string,
  content: string,
  language: WorkspaceLanguage,
  meta?: Record<string, unknown>,
): WorkspaceFile {
  const file: WorkspaceFile = { id, path, content, language, meta }
  files.set(id, file)
  notify(id)
  return file
}

/**
 * Return the current snapshot for a file id, or `undefined` if the id is
 * not registered.
 *
 * @remarks
 * The returned reference is stable across calls as long as `setContent`
 * has not been called for this id. Do not mutate the returned object.
 */
export function getFile(id: string): WorkspaceFile | undefined {
  return files.get(id)
}

/**
 * Replace the content of a file. The replacement preserves every other
 * field of the existing snapshot (path, language, meta) and produces a new
 * object reference so that `useSyncExternalStore` consumers correctly
 * detect the change.
 *
 * Writing to an unknown id is a **no-op** and does not notify anyone. This
 * is intentional — the editor view should never reach this path for an
 * unregistered file, and silently swallowing the write here protects
 * against phantom subscribers on ids that were unregistered mid-keystroke
 * (e.g., tab closed while the IME was composing).
 *
 * @param id          Target file id.
 * @param newContent  New content string. Replaces the entire content; this
 *                    store does not support partial edits — the Monaco
 *                    model tracks deltas, the store just holds the text.
 */
export function setContent(id: string, newContent: string): void {
  const prev = files.get(id)
  if (!prev) return
  if (prev.content === newContent) return // no-op, preserve identity
  files.set(id, { ...prev, content: newContent })
  notify(id)
}

/**
 * Register a subscriber for a specific file id. The returned function
 * unregisters the subscriber. Safe to call from `useSyncExternalStore`'s
 * `subscribe` argument.
 *
 * @remarks
 * Subscribers registered here are **not** invoked on initial subscribe —
 * `useSyncExternalStore` reads the current snapshot via `getSnapshot`
 * directly when it first mounts. The subscriber only fires on subsequent
 * changes. This matches the React contract and avoids a redundant initial
 * render.
 */
export function subscribe(id: string, cb: Subscriber): () => void {
  let set = subscribersByFile.get(id)
  if (!set) {
    set = new Set()
    subscribersByFile.set(id, set)
  }
  set.add(cb)
  return () => {
    const current = subscribersByFile.get(id)
    if (!current) return
    current.delete(cb)
    if (current.size === 0) {
      subscribersByFile.delete(id)
    }
  }
}

/**
 * Notify every subscriber of a given file id. Internal — called by
 * `createWorkspaceFile` and `setContent`. Exported for tests that need to
 * drive the notification path directly without going through `setContent`.
 */
function notify(id: string): void {
  const set = subscribersByFile.get(id)
  if (!set) return
  // Copy before iterating — a subscriber may unsubscribe itself during
  // the callback (React 18 dev mode's StrictMode double-invoke patterns
  // can exercise this path).
  const snapshot = Array.from(set)
  for (const cb of snapshot) cb()
}

/**
 * TESTING ONLY — reset the entire store. Used by unit tests to ensure
 * isolation between cases. Not exported from the package barrel; tests
 * import it directly from this module.
 */
export function __resetWorkspaceFilesForTests(): void {
  files.clear()
  subscribersByFile.clear()
}
