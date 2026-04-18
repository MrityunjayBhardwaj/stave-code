/**
 * WorkspaceFile store — Yjs-backed (PM Phase 1).
 *
 * Replaces the Phase 10.2 in-memory Map with a Yjs Y.Doc backing.
 * The public API is IDENTICAL to the original:
 *
 *   createWorkspaceFile, getFile, setContent, subscribe
 *
 * plus a new `seedWorkspaceFile` for persistence-aware create-or-load.
 *
 * ## How persistence works
 *
 * Each file is a Y.Map inside the doc's top-level "files" Y.Map.
 * Content is stored as Y.Text (ready for Phase 3 multiplayer).
 * A cached `WorkspaceFile` snapshot is maintained per file for
 * reference-stability (required by useSyncExternalStore).
 *
 * Two init modes:
 * - Real app: call `initProjectDoc(id)` (async, IDB-backed) BEFORE
 *   mounting components. Files loaded from IDB are available after.
 * - Tests: no init needed — the store lazy-inits an in-memory Y.Doc
 *   on first access via `ensureDoc()`.
 *
 * ## Snapshot identity contract (unchanged from Phase 10.2)
 *
 * `getFile(id) === getFile(id)` — unless content changed in between.
 * Achieved by caching snapshots and only rebuilding on Y.Text changes.
 */

import * as Y from 'yjs'
import { ensureDoc, getFilesMap, destroyProjectDoc } from './projectDoc'
import { STRUCT_ORIGIN, resetUndoManager } from './undoManager'
import type { WorkspaceFile, WorkspaceLanguage } from './types'

type Subscriber = () => void

// ── Cache layer ──────────────────────────────────────────────────────
// Cached WorkspaceFile snapshots for reference stability.
const cachedSnapshots = new Map<string, WorkspaceFile>()

// Per-file subscriber sets (same pattern as Phase 10.2).
const subscribersByFile = new Map<string, Set<Subscriber>>()

// Track Y.Text observers so we can clean up on reset/project switch.
const textObservers = new Map<string, { ytext: Y.Text; handler: () => void }>()

// ── Snapshot rebuild ─────────────────────────────────────────────────

function rebuildSnapshot(id: string): void {
  const filesMap = getFilesMap()
  const fileMap = filesMap.get(id) as Y.Map<unknown> | undefined
  if (!fileMap) {
    cachedSnapshots.delete(id)
    return
  }
  const ytext = fileMap.get('content') as Y.Text
  cachedSnapshots.set(id, {
    id: fileMap.get('id') as string,
    path: fileMap.get('path') as string,
    content: ytext.toString(),
    language: fileMap.get('language') as WorkspaceLanguage,
    meta: fileMap.get('meta') as Readonly<Record<string, unknown>> | undefined,
  })
}

// ── Y.Text observer wiring ──────────────────────────────────────────

function wireTextObserver(id: string, ytext: Y.Text): void {
  // Remove existing observer if any (idempotent)
  unwireTextObserver(id)

  const handler = () => {
    rebuildSnapshot(id)
    notify(id)
  }
  ytext.observe(handler)
  textObservers.set(id, { ytext, handler })
}

function unwireTextObserver(id: string): void {
  const entry = textObservers.get(id)
  if (entry) {
    entry.ytext.unobserve(entry.handler)
    textObservers.delete(id)
  }
}

// ── Folder-order observer (PM-3) ────────────────────────────────────

let folderOrderObserverWired = false
const folderOrderSubscribers = new Set<Subscriber>()

function notifyFolderOrder(): void {
  const snapshot = Array.from(folderOrderSubscribers)
  for (const cb of snapshot) cb()
}

function getFolderOrderMap(): Y.Map<Y.Array<string>> {
  return ensureDoc().getMap('fileOrder') as Y.Map<Y.Array<string>>
}

function getSubfolderOrderMap(): Y.Map<Y.Array<string>> {
  return ensureDoc().getMap('subfolderOrder') as Y.Map<Y.Array<string>>
}

function getChildOrderMap(): Y.Map<Y.Array<string>> {
  return ensureDoc().getMap('childOrder') as Y.Map<Y.Array<string>>
}

function ensureFolderOrderObserver(): void {
  if (folderOrderObserverWired) return
  const map = getFolderOrderMap()
  const submap = getSubfolderOrderMap()
  const childmap = getChildOrderMap()
  // Observe both shallow (keys added/removed) and deep (inner Y.Array
  // mutations) so reordering within a folder propagates. All three
  // share the same subscribers — callers re-render the whole tree on
  // any change.
  map.observeDeep(() => notifyFolderOrder())
  submap.observeDeep(() => notifyFolderOrder())
  childmap.observeDeep(() => notifyFolderOrder())
  folderOrderObserverWired = true
}

// ── Y.Map observer (structural: file added/removed) ─────────────────

// Track the CURRENT wired filesMap reference (not just a boolean). If
// the active doc swaps to a new one, getFilesMap returns a different
// reference — we detect that and re-wire. A bare boolean flag was
// vulnerable to a stale-wire race: resetFileStore fires notifyFileList
// synchronously, which triggers a React re-render that calls
// listWorkspaceFiles → ensureFilesMapObserver BEFORE the awaited
// switchProject has swapped the active doc. That would leave the
// observer bound to the soon-to-be-destroyed OLD filesMap.
let wiredFilesMap: Y.Map<Y.Map<unknown>> | null = null

function ensureFilesMapObserver(): void {
  const filesMap = getFilesMap()
  if (wiredFilesMap === filesMap) return
  // observeDeep so nested changes (inner fileMap's path/meta keys
  // mutating — e.g. after an undo that reverts a rename) also trigger
  // snapshot rebuild + notify. Without deep observation, Y.Doc state
  // would flip but the cached snapshot and UI would stay stale.
  filesMap.observeDeep((events) => {
    let anyStructuralChange = false
    for (const event of events) {
      if (event.target === filesMap) {
        // Structural change on the top-level map.
        const mapEvent = event as Y.YMapEvent<Y.Map<unknown>>
        for (const [key, change] of mapEvent.changes.keys) {
          if (change.action === 'add' || change.action === 'update') {
            const fileMap = filesMap.get(key) as Y.Map<unknown>
            const ytext = fileMap.get('content') as Y.Text
            rebuildSnapshot(key)
            wireTextObserver(key, ytext)
            notify(key)
            anyStructuralChange = true
          } else if (change.action === 'delete') {
            unwireTextObserver(key)
            cachedSnapshots.delete(key)
            notify(key)
            anyStructuralChange = true
          }
        }
        continue
      }
      // Skip Y.Text change events — wireTextObserver already handles
      // those and tests assert a single notification per content change.
      if (event.target instanceof Y.Text) continue
      // Nested change — an inner fileMap's field (path / meta) was
      // mutated. Walk the path to find the owning fileId so we can
      // invalidate just that snapshot.
      const path = event.path
      const ownerId = path.length > 0 ? String(path[0]) : null
      if (!ownerId) continue
      if (filesMap.has(ownerId)) {
        rebuildSnapshot(ownerId)
        notify(ownerId)
        anyStructuralChange = true
      }
    }
    if (anyStructuralChange) notifyFileList()
  })
  wiredFilesMap = filesMap
}

// ── Public API (unchanged signatures) ────────────────────────────────

/**
 * Create a new WorkspaceFile. Always overwrites if the file already exists.
 * Safe to call multiple times for the same id.
 *
 * For persistence-aware "create only if not in IDB" semantics, use
 * `seedWorkspaceFile` instead (LiveCodingEditor uses that).
 */
export function createWorkspaceFile(
  id: string,
  path: string,
  content: string,
  language: WorkspaceLanguage,
  meta?: Record<string, unknown>,
): WorkspaceFile {
  ensureDoc()
  ensureFilesMapObserver()
  const filesMap = getFilesMap()
  const doc = ensureDoc()

  doc.transact(() => {
    const fileMap = new Y.Map<unknown>()
    fileMap.set('id', id)
    fileMap.set('path', path)
    fileMap.set('language', language)
    if (meta !== undefined) fileMap.set('meta', meta)
    const ytext = new Y.Text()
    ytext.insert(0, content)
    fileMap.set('content', ytext)
    // Setting on filesMap triggers the Y.Map observer which wires
    // the Y.Text observer, rebuilds the snapshot, and notifies.
    filesMap.set(id, fileMap)
  }, STRUCT_ORIGIN)

  return cachedSnapshots.get(id) ?? { id, path, content, language, meta }
}

/**
 * Persistence-aware create-or-load. If the file already exists in the
 * Y.Doc (loaded from IDB), returns the persisted version without
 * overwriting. If the file does not exist, creates it with the given
 * seed content.
 *
 * Use this from components that seed files on mount (LiveCodingEditor,
 * WorkspaceShell) to avoid overwriting persisted user work on refresh.
 */
export function seedWorkspaceFile(
  id: string,
  path: string,
  content: string,
  language: WorkspaceLanguage,
  meta?: Record<string, unknown>,
): WorkspaceFile {
  ensureDoc()
  ensureFilesMapObserver()
  const filesMap = getFilesMap()
  const existing = filesMap.get(id) as Y.Map<unknown> | undefined

  if (existing) {
    // File already in Y.Doc — persisted from previous session.
    // Ensure snapshot cache is populated and observer is wired.
    if (!cachedSnapshots.has(id)) {
      rebuildSnapshot(id)
    }
    const ytext = existing.get('content') as Y.Text
    if (!textObservers.has(id)) {
      wireTextObserver(id, ytext)
    }
    return cachedSnapshots.get(id)!
  }

  // File not in Y.Doc — create with seed content.
  return createWorkspaceFile(id, path, content, language, meta)
}

/**
 * Return the current snapshot for a file id, or `undefined` if the id
 * is not registered. Reference-stable across calls.
 */
export function getFile(id: string): WorkspaceFile | undefined {
  return cachedSnapshots.get(id)
}

/**
 * Replace the content of a file. Writing to an unknown id is a no-op.
 */
export function setContent(id: string, newContent: string): void {
  const filesMap = getFilesMap()
  const fileMap = filesMap.get(id) as Y.Map<unknown> | undefined
  if (!fileMap) return

  const ytext = fileMap.get('content') as Y.Text
  const currentContent = ytext.toString()
  if (currentContent === newContent) return // no-op, preserve identity

  const doc = ensureDoc()
  doc.transact(() => {
    ytext.delete(0, ytext.length)
    ytext.insert(0, newContent)
  })
  // Y.Text observer fires → rebuildSnapshot → notify
}

/**
 * Register a subscriber for a specific file id. Returns unsubscribe fn.
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

// ── File-list operations (PM Phase 2.5 — file tree) ──────────────────

/**
 * Subscribers for file-list-level changes (add/delete/rename). Fires when
 * a file is created, deleted, or its path changes — useful for the file
 * tree UI to update its rendering.
 */
const fileListSubscribers = new Set<Subscriber>()

function notifyFileList(): void {
  const snapshot = Array.from(fileListSubscribers)
  for (const cb of snapshot) cb()
}

/**
 * Register a subscriber for file-list-level changes (file added, deleted,
 * or renamed). Fires after the change is committed to the Y.Doc.
 */
export function subscribeToFileList(cb: Subscriber): () => void {
  fileListSubscribers.add(cb)
  return () => {
    fileListSubscribers.delete(cb)
  }
}

/**
 * Return all workspace files as a list. Snapshots are reference-stable
 * so this return value is suitable for useSyncExternalStore.
 */
export function listWorkspaceFiles(): WorkspaceFile[] {
  ensureDoc()
  ensureFilesMapObserver()
  // Ensure every file in the Y.Map has a cached snapshot
  const filesMap = getFilesMap()
  for (const id of filesMap.keys()) {
    if (!cachedSnapshots.has(id)) {
      rebuildSnapshot(id)
      const fileMap = filesMap.get(id) as Y.Map<unknown>
      const ytext = fileMap.get('content') as Y.Text
      if (!textObservers.has(id)) {
        wireTextObserver(id, ytext)
      }
    }
  }
  return Array.from(cachedSnapshots.values())
}

/**
 * Delete a file from the Y.Doc. No-op if the id doesn't exist.
 */
export function deleteWorkspaceFile(id: string): void {
  const filesMap = getFilesMap()
  if (!filesMap.has(id)) return
  const doc = ensureDoc()
  doc.transact(() => {
    filesMap.delete(id)
  }, STRUCT_ORIGIN)
  // Y.Map observer fires → 'delete' action → clears cache + notifies subscribers
  notifyFileList()
}

/**
 * Rename a file's path. The file id stays the same — only the path field
 * is updated. This is how files move between folders (e.g., "foo.strudel"
 * → "sketches/foo.strudel"). No-op if the id doesn't exist.
 */
export function renameWorkspaceFile(id: string, newPath: string): void {
  const filesMap = getFilesMap()
  const fileMap = filesMap.get(id) as Y.Map<unknown> | undefined
  if (!fileMap) return
  const currentPath = fileMap.get('path') as string
  if (currentPath === newPath) return
  const doc = ensureDoc()
  doc.transact(() => {
    fileMap.set('path', newPath)
  }, STRUCT_ORIGIN)
  // The inner Y.Map change doesn't auto-trigger the outer observer.
  // Manually rebuild the snapshot and notify.
  rebuildSnapshot(id)
  notify(id)
  notifyFileList()
}

// ── Folder order (PM-3) ──────────────────────────────────────────────

/**
 * Return the explicit file-id order for a folder, or an empty array if
 * none is set (callers should fall back to alphabetical). The root is
 * addressed as the empty string `""`.
 */
export function getFolderOrder(folderPath: string): string[] {
  ensureDoc()
  ensureFolderOrderObserver()
  const map = getFolderOrderMap()
  const arr = map.get(folderPath)
  return arr ? arr.toArray() : []
}

/**
 * Replace the ordered file-id list for a folder. Missing file ids are
 * ignored at render time (tree builder filters to files that actually
 * belong to the folder). Empty array clears the explicit order.
 */
export function setFolderOrder(folderPath: string, orderedIds: string[]): void {
  ensureDoc()
  ensureFolderOrderObserver()
  const map = getFolderOrderMap()
  const doc = ensureDoc()
  doc.transact(() => {
    // Replace the whole Y.Array rather than diffing — simpler and the
    // folder-level scope keeps the update tiny.
    const next = new Y.Array<string>()
    next.push(orderedIds)
    map.set(folderPath, next)
  }, STRUCT_ORIGIN)
  // observeDeep fires → notifyFolderOrder
}

/**
 * Subscribe to folder-order changes (both files and subfolders).
 * Fires after any reorder commits.
 */
export function subscribeToFolderOrder(cb: Subscriber): () => void {
  ensureFolderOrderObserver()
  folderOrderSubscribers.add(cb)
  return () => {
    folderOrderSubscribers.delete(cb)
  }
}

/**
 * Return the explicit subfolder-name order for a parent folder, or an
 * empty array if none is set. Names are relative (immediate children),
 * not full paths. Root = "".
 */
export function getSubfolderOrder(parentPath: string): string[] {
  ensureDoc()
  ensureFolderOrderObserver()
  const map = getSubfolderOrderMap()
  const arr = map.get(parentPath)
  return arr ? arr.toArray() : []
}

/**
 * Replace the ordered subfolder-name list for a parent folder. Names
 * that no longer correspond to a real subfolder are filtered out at
 * render time.
 */
export function setSubfolderOrder(parentPath: string, orderedNames: string[]): void {
  ensureDoc()
  ensureFolderOrderObserver()
  const map = getSubfolderOrderMap()
  const doc = ensureDoc()
  doc.transact(() => {
    const next = new Y.Array<string>()
    next.push(orderedNames)
    map.set(parentPath, next)
  }, STRUCT_ORIGIN)
}

/**
 * Return the explicit mixed child order for a folder, or an empty array
 * if none is set. Each entry is `"d:folderName"` or `"f:fileId"`. When
 * present, this overrides the separate fileOrder + subfolderOrder for
 * rendering purposes — items appear in exactly this order (folders and
 * files interleaved).
 */
export function getChildOrder(parentPath: string): string[] {
  ensureDoc()
  ensureFolderOrderObserver()
  const map = getChildOrderMap()
  const arr = map.get(parentPath)
  return arr ? arr.toArray() : []
}

/**
 * Replace the mixed child order for a folder. Entries are `"d:name"` for
 * folders and `"f:id"` for files. Empty array clears (reverts to
 * folders-first fallback).
 */
export function setChildOrder(parentPath: string, entries: string[]): void {
  ensureDoc()
  ensureFolderOrderObserver()
  const map = getChildOrderMap()
  const doc = ensureDoc()
  doc.transact(() => {
    const next = new Y.Array<string>()
    next.push(entries)
    map.set(parentPath, next)
  }, STRUCT_ORIGIN)
}

// ── Internal helpers ─────────────────────────────────────────────────

function notify(id: string): void {
  const set = subscribersByFile.get(id)
  if (!set) return
  const snapshot = Array.from(set)
  for (const cb of snapshot) cb()
}

/**
 * Reset the file store's caches and observers WITHOUT destroying the Y.Doc.
 * Used during project switching: after initProjectDoc loads a new Y.Doc,
 * call this to clear stale snapshots from the previous project and re-wire
 * observers for the new doc's files.
 */
// ---------------------------------------------------------------------------
// Per-zone overrides
// ---------------------------------------------------------------------------
//
// Inline .viz() zones share a VizPreset by name, but each user-placed zone
// is a distinct instance — cropping one must not crop the others. The
// preset itself is a shared default; per-instance overrides live here,
// keyed by (fileId, trackKey). Same trackKey the engine uses to key
// trackSchedulers / trackAnalysers / vizRequests.
//
// Storage shape inside each file's Y.Map:
//   zoneOverrides: Y.Map<trackKey, { cropRegion: { x, y, w, h } }>

export interface ZoneOverride {
  cropRegion?: { x: number; y: number; w: number; h: number }
  /** The vizId at the time the crop was set — used by pruneZoneOverrides to
   *  detect when the user switches .viz("A") → .viz("B") and the old crop
   *  no longer matches the new viz's aspect. */
  vizId?: string
  /** User-set zone height in pixels (drag-to-resize). Overrides the
   *  layout-computed height. Cleared when the user resets the crop. */
  heightPx?: number
}

const zoneOverrideSubscribers = new Map<string, Set<Subscriber>>()
const wiredZoneObservers = new Set<string>()

/**
 * Transaction origin for prune mutations. The observer skips subscriber
 * notification when it sees this origin — prune is internal bookkeeping,
 * not a user-visible override change, and firing subscribers during an
 * active zone-mount would re-trigger the mount reentrantly (see #30).
 */
const PRUNE_ZONE_OVERRIDES_ORIGIN = Symbol('prune-zone-overrides')

function ensureZoneOverridesMap(fileId: string): Y.Map<unknown> | null {
  const filesMap = getFilesMap()
  const fileMap = filesMap.get(fileId) as Y.Map<unknown> | undefined
  if (!fileMap) return null
  let overrides = fileMap.get('zoneOverrides') as Y.Map<unknown> | undefined
  if (!overrides) {
    overrides = new Y.Map()
    fileMap.set('zoneOverrides', overrides)
  }
  // Wire observer once per file. Yjs deliveres events for nested Y.Map
  // mutations via observeDeep — one subscription watches the tree.
  if (!wiredZoneObservers.has(fileId)) {
    overrides.observeDeep((events) => {
      // Skip prune-originated mutations — see PRUNE_ZONE_OVERRIDES_ORIGIN.
      if (events[0]?.transaction.origin === PRUNE_ZONE_OVERRIDES_ORIGIN) return
      const subs = zoneOverrideSubscribers.get(fileId)
      if (subs) for (const cb of subs) cb()
    })
    wiredZoneObservers.add(fileId)
  }
  return overrides
}

export function getZoneCropOverride(
  fileId: string,
  trackKey: string,
): { x: number; y: number; w: number; h: number } | undefined {
  ensureDoc()
  const overrides = ensureZoneOverridesMap(fileId)
  if (!overrides) return undefined
  const entry = overrides.get(trackKey) as ZoneOverride | undefined
  return entry?.cropRegion
}

/**
 * Set the crop override for one (fileId, trackKey) pair. Pass `null` to
 * remove the override (revert to preset default). Triggers subscribers.
 */
export function setZoneCropOverride(
  fileId: string,
  trackKey: string,
  cropRegion: { x: number; y: number; w: number; h: number } | null,
  vizId?: string,
): void {
  ensureDoc()
  const overrides = ensureZoneOverridesMap(fileId)
  if (!overrides) return
  const doc = ensureDoc()
  doc.transact(() => {
    if (cropRegion === null) {
      overrides.delete(trackKey)
    } else {
      overrides.set(trackKey, { cropRegion, vizId })
    }
  }, STRUCT_ORIGIN)
}

export function getZoneHeightOverride(
  fileId: string,
  trackKey: string,
): number | undefined {
  ensureDoc()
  const overrides = ensureZoneOverridesMap(fileId)
  if (!overrides) return undefined
  const entry = overrides.get(trackKey) as ZoneOverride | undefined
  return entry?.heightPx
}

export function setZoneHeightOverride(
  fileId: string,
  trackKey: string,
  heightPx: number | null,
): void {
  ensureDoc()
  const overrides = ensureZoneOverridesMap(fileId)
  if (!overrides) return
  const doc = ensureDoc()
  doc.transact(() => {
    const existing = (overrides.get(trackKey) as ZoneOverride | undefined) ?? {}
    if (heightPx === null) {
      const { heightPx: _, ...rest } = existing
      if (Object.keys(rest).length === 0) overrides.delete(trackKey)
      else overrides.set(trackKey, rest)
    } else {
      overrides.set(trackKey, { ...existing, heightPx })
    }
  }, STRUCT_ORIGIN)
}

/**
 * Prune stale zone overrides. Called on every evaluate — removes overrides
 * whose trackKey is no longer in the current `vizRequests` or whose vizId
 * has changed (crop picked for one viz's aspect is meaningless for another).
 *
 * `currentViz` maps trackKey → vizId for every $: block with a .viz() in
 * the latest evaluate result (same Map shape as `inlineViz.vizRequests`
 * but values are just the vizId string, not the full {vizId, afterLine}).
 */
export function pruneZoneOverrides(
  fileId: string,
  currentViz: Map<string, string>,
): void {
  ensureDoc()
  const overrides = ensureZoneOverridesMap(fileId)
  if (!overrides) return
  const doc = ensureDoc()
  const stale: string[] = []
  for (const [trackKey, value] of overrides.entries()) {
    const entry = value as ZoneOverride & { vizId?: string }
    const currentVizId = currentViz.get(trackKey)
    if (!currentVizId) {
      // trackKey gone — $: block removed or anonymous keys shifted
      stale.push(trackKey)
    } else if (entry.vizId && entry.vizId !== currentVizId) {
      // vizId changed — old crop aspect doesn't match new viz
      stale.push(trackKey)
    }
  }
  if (stale.length === 0) return
  doc.transact(() => {
    for (const key of stale) overrides.delete(key)
  }, PRUNE_ZONE_OVERRIDES_ORIGIN)
}

/**
 * Subscribe to ANY zone-override change within a file. Fires after each
 * committed mutation.
 */
export function subscribeToZoneOverrides(fileId: string, cb: Subscriber): () => void {
  ensureDoc()
  ensureZoneOverridesMap(fileId)
  let set = zoneOverrideSubscribers.get(fileId)
  if (!set) {
    set = new Set()
    zoneOverrideSubscribers.set(fileId, set)
  }
  set.add(cb)
  return () => {
    set!.delete(cb)
    if (set!.size === 0) zoneOverrideSubscribers.delete(fileId)
  }
}

export function resetFileStore(): void {
  for (const [id] of textObservers) {
    unwireTextObserver(id)
  }
  textObservers.clear()
  cachedSnapshots.clear()
  subscribersByFile.clear()
  wiredFilesMap = null
  folderOrderObserverWired = false
  zoneOverrideSubscribers.clear()
  wiredZoneObservers.clear()
  // Undo manager was bound to the previous Y.Doc — drop it so the next
  // access rebuilds against the new doc.
  resetUndoManager()
  // Notify file-list subscribers so the tree re-renders with the new
  // project's files (they stay subscribed across project switches).
  notifyFileList()
  notifyFolderOrder()
}

/**
 * TESTING ONLY — reset the entire store. Destroys the Y.Doc and clears
 * all caches and observers. The next store access lazy-inits a fresh
 * in-memory doc.
 */
export function __resetWorkspaceFilesForTests(): void {
  // Unwire all Y.Text observers
  for (const [id] of textObservers) {
    unwireTextObserver(id)
  }
  textObservers.clear()
  cachedSnapshots.clear()
  subscribersByFile.clear()
  fileListSubscribers.clear()
  folderOrderSubscribers.clear()
  zoneOverrideSubscribers.clear()
  wiredZoneObservers.clear()
  wiredFilesMap = null
  folderOrderObserverWired = false
  destroyProjectDoc()
}
