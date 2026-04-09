/**
 * useWorkspaceFile — Phase 10.2 Task 01.
 *
 * React hook surfacing a `WorkspaceFile` snapshot + its writer from the
 * module-level store. Backed by `useSyncExternalStore` (React 18+) for
 * correct concurrent-mode semantics with zero extra deps.
 *
 * @remarks
 * The `getSnapshot` returned to React is `() => getFile(id)`. Because the
 * store replaces entries instead of mutating them (see WorkspaceFile.ts
 * "Snapshot identity contract"), the reference returned by `getFile` is
 * stable across unrelated changes. React's tearing-detection will not
 * throw, and components that subscribe to a different file id will not
 * re-render when this file changes.
 *
 * The `setContent` callback is bound to the current `id` via `useCallback`
 * so that consumers can pass it as a dep without defeating memoization.
 */

import { useSyncExternalStore, useCallback } from 'react'
import {
  getFile,
  setContent as storeSetContent,
  subscribe as storeSubscribe,
} from './WorkspaceFile'
import type { WorkspaceFile } from './types'

/**
 * The return shape of `useWorkspaceFile`. `file` is `undefined` until a
 * file is registered with `createWorkspaceFile(id, …)` for this id, to let
 * consumers render a loading/fallback state without requiring eager
 * registration.
 */
export interface UseWorkspaceFileResult {
  file: WorkspaceFile | undefined
  setContent: (content: string) => void
}

export function useWorkspaceFile(id: string): UseWorkspaceFileResult {
  // React calls `subscribe` once per mount; the callback on the store fires
  // on every change to this file id and triggers re-render via
  // getSnapshot identity check.
  const subscribe = useCallback(
    (onStoreChange: () => void) => storeSubscribe(id, onStoreChange),
    [id],
  )

  // Same function identity for the same `id` — critical for
  // useSyncExternalStore to not tear. Reads straight from the store map so
  // that reference stability lives in one place (the store), not here.
  const getSnapshot = useCallback(() => getFile(id), [id])

  // useSyncExternalStore uses getSnapshot for both server and client
  // render in React 18+. For an in-memory store with no SSR surface, the
  // same reader suffices for both.
  const file = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const setContent = useCallback(
    (content: string) => storeSetContent(id, content),
    [id],
  )

  return { file, setContent }
}
