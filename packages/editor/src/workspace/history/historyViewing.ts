/**
 * historyViewing — the runtime-follow time-travel override layer (#204).
 *
 * Holds a single "checked-out" commit. When a commit is checked out, all three
 * runtime read paths consult this singleton FIRST and fall back to live
 * workspace content when not viewing:
 *   1. editor display  (EditorView value)
 *   2. named viz       (re-registered from the snapshot on enter/exit)
 *   3. runtime eval    (the per-file LiveCodingRuntime content source)
 *
 * Y.Text is NEVER written here — this is a read-interception layer only. So the
 * auto-commit driver and `commitWorkspace` keep reading LIVE content and can
 * never persist a historical view (the key safety property, #204 design). Exit
 * clears the override entirely; HEAD authority is restored.
 */

export interface RuntimeViewState {
  readonly commitId: string
  /** Full project snapshot at the commit: fileId → content. */
  readonly files: Readonly<Record<string, string>>
}

let state: RuntimeViewState | null = null

type Listener = () => void
const listeners = new Set<Listener>()

function notify(): void {
  for (const l of listeners) {
    try {
      l()
    } catch {
      /* one listener's failure must not break the others */
    }
  }
}

/**
 * Enter time-travel: the runtime reflects `commitId`'s snapshot (read-only).
 * `files` is the whole-project snapshot at that commit (Decision C). Calling
 * again with a different commit swaps the view in place.
 */
export function enterRuntimeView(commitId: string, files: Record<string, string>): void {
  state = { commitId, files: { ...files } }
  notify()
}

/** Exit time-travel: restore HEAD authority. No-op when not viewing. */
export function exitRuntimeView(): void {
  if (state === null) return
  state = null
  notify()
}

/**
 * Viewed content for a file, or `null` when not viewing OR the file did not
 * exist at the checked-out commit. Callers fall back to live content on null.
 */
export function getViewedContent(fileId: string): string | null {
  if (state === null) return null
  return Object.prototype.hasOwnProperty.call(state.files, fileId)
    ? state.files[fileId]
    : null
}

export function isViewing(): boolean {
  return state !== null
}

export function getViewedCommit(): string | null {
  return state?.commitId ?? null
}

/** All file ids present in the current view (empty array when not viewing). */
export function getViewedFileIds(): string[] {
  return state ? Object.keys(state.files) : []
}

/** Subscribe to enter/exit/swap. Returns an unsubscribe fn. */
export function subscribeToRuntimeView(cb: Listener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Test helper — clear state + listeners. */
export function __resetRuntimeViewForTests(): void {
  state = null
  listeners.clear()
}
