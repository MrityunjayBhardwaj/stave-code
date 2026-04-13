/**
 * WorkspaceShell — Phase 10.2 Task 04.
 *
 * Generic tab/group/split container. Holds any tab kind (editor or
 * preview), supports drag-drop between groups for either kind, and
 * dispatches rendering by `tab.kind` without knowing the file type. Owns
 * nothing about engines, runtime state, or keyboard shortcuts — those are
 * injected by Task 05 (`runtimeProviders` + `chromeForTab`), resolved by
 * Task 06 (`previewProviderFor`), and added by Task 08 (Cmd+K V/B/W
 * window listeners).
 *
 * @remarks
 * ## Relationship to the legacy `EditorGroup.tsx`
 *
 * The old `packages/editor/src/visualizers/editor/EditorGroup.tsx` bundled
 * tab bar + Monaco + preview layout with four rendering modes (panel,
 * inline, background, popout) encoded as a single state field on the
 * group. This file replaces the tab bar / group chrome / drag-drop logic
 * with a **lifted** implementation — not an import, not a delegation.
 * The old group stays on disk until Task 09 deletes it; until then it
 * owns zero dependencies on this shell, and this shell owns zero
 * dependencies on it. Lifting (rather than delegating) is the
 * non-negotiable constraint because the old group's rendering-mode field
 * is exactly what Phase 10.2 exists to dissolve — importing from it
 * would pull that field back in through the type system.
 *
 * The PV7 acceptance test in `WorkspaceShell.test.tsx` greps this file's
 * source for the legacy mode-field identifier and fails if any occurrence
 * is found. The string stays out of this file intentionally.
 *
 * ## Group state shape
 *
 * The shell owns a `Map<groupId, WorkspaceGroupState>` plus an ordered
 * `groupOrder: string[]` that records the left-to-right layout. Using a
 * Map (rather than an object keyed by id) is a deliberate choice: it
 * makes the ordering explicit via `groupOrder`, keeps lookups O(1) on
 * group id, and prevents the "key collision with builtin prototype"
 * class of bugs that plain-object stores suffer. The two fields are
 * always updated together inside a single `setGroups`/`setGroupOrder`
 * transaction so they can't desync.
 *
 * ## Tab dispatch (PV7)
 *
 * Inside `renderGroup()`, the active tab is looked up and dispatched on
 * `tab.kind` via an exhaustiveness-checked `switch`:
 *
 *   - `'editor'` → `<EditorView .../>`
 *   - `'preview'` → `<PreviewView .../>`
 *   - default → `assertNever(tab)` — a `never`-typed call that makes
 *     TypeScript fail the compile if a new tab kind is added without
 *     a branch here.
 *
 * The `chromeSlot` for the editor comes from `props.chromeForTab?.(tab)`
 * — Task 05 wires it to runtime chrome via the runtime provider registry.
 * Task 04 calls the callback if supplied and passes `undefined` otherwise
 * (viz / markdown editors have no chrome).
 *
 * ## Drag-drop logic (lifted from EditorGroup, sanitized for PV7)
 *
 * HTML5 drag-drop with a custom MIME type `application/workspace-tab`.
 * Payload is `{ sourceGroupId, tabId }` JSON-encoded into the dataTransfer.
 * On drop, the shell:
 *
 *   1. Reads the payload from `dataTransfer.getData`.
 *   2. Finds the source group + tab.
 *   3. Removes the tab from the source group.
 *   4. Appends the tab to the target group's tab list.
 *   5. Marks the target group's active tab = the dropped tab.
 *   6. Fires `onActiveTabChange` if the active tab changed.
 *
 * The source group may become empty after the drop — that's legal. The
 * shell does not auto-collapse empty groups (the user might be about to
 * drop something else into it); the explicit "close group" button handles
 * removal.
 *
 * ## Group split
 *
 * `splitGroup(groupId)` inserts a new empty group immediately after the
 * given group in `groupOrder`. The new group has a freshly generated id
 * and no tabs. `SplitPane`'s size reconciliation handles the new pane
 * sizing.
 *
 * ## Close group
 *
 * `closeGroup(groupId)` merges the closing group's tabs into the next
 * adjacent group (previous if this is the last one). If the shell has
 * only one group, close-group is disabled (the user must close individual
 * tabs instead). The merged tabs append to the neighbor's tab list and
 * the active tab in the neighbor stays unchanged.
 *
 * ## Active tab tracking
 *
 * Each group has its own `activeTabId`. The shell also tracks a single
 * `activeGroupId` — the group the user last interacted with — so that
 * `getActiveTab()` can return the one "shell-wide active tab." Clicking
 * a tab in a different group updates both `activeGroupId` and the group's
 * `activeTabId`; `onActiveTabChange` fires with the resolved tab.
 *
 * ## Theme ownership (PV6 / PK6)
 *
 * `applyTheme(shellRootRef.current, theme)` runs in a `useEffect` keyed
 * on `[theme]`. This is belt-and-suspenders: child `EditorView` /
 * `PreviewView` roots also apply their own theme, so the shell chrome
 * (tab bars, group dividers, split handles) has a themed ancestor even
 * when child views mount late.
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { SplitPane } from '../visualizers/editor/SplitPane'
import { applyTheme } from '../theme/tokens'
import { EditorView } from './EditorView'
import { PreviewView } from './PreviewView'
import { useKeyboardCommands } from './commands/useKeyboardCommands'
import { executeCommand } from './commands/CommandRegistry'
import { getPreviewProviderForLanguage } from './preview/registry'
import { getFile, subscribe as subscribeToWorkspaceFile } from './WorkspaceFile'
import type { WorkspaceShellActions } from './commands/CommandRegistry'
import type {
  WorkspaceGroupState,
  WorkspaceShellProps,
  WorkspaceTab,
} from './types'
import {
  type GroupLayout,
  type DropDirection,
  findGroupCoords,
  allGroupIds,
  insertGroup as layoutInsertGroup,
  insertEdgeGroup as layoutInsertEdgeGroup,
  removeGroup as layoutRemoveGroup,
} from './groupLayout'
import { findBuiltinExampleSource } from './builtinExampleSources'

/**
 * Exhaustiveness helper used inside the tab dispatch switch. If TypeScript
 * ever sees a new `WorkspaceTab` variant without a branch added above the
 * default case, this call fails the type-check at compile time.
 */
// Webkit/Blink doesn't honour `scrollbarWidth: 'none'` inline style yet —
// inject a one-time stylesheet rule so the tabbar can scroll horizontally
// without showing a visible track/thumb.
let tabbarScrollStyleInjected = false
function ensureTabbarScrollStyle(): void {
  if (tabbarScrollStyleInjected) return
  if (typeof document === 'undefined') return
  const el = document.createElement('style')
  el.setAttribute('data-stave-style', 'tabbar-scroll')
  el.textContent = '[data-workspace-group-tabbar]::-webkit-scrollbar{display:none;width:0;height:0}'
  document.head.appendChild(el)
  tabbarScrollStyleInjected = true
}

function assertNever(value: never): never {
  throw new Error(
    `WorkspaceShell: unhandled tab kind in dispatch: ${JSON.stringify(value)}`,
  )
}

/**
 * Stable-ish id generator for newly created groups. Uses a module-level
 * counter plus `Math.random()` — good enough for in-memory shell state
 * that never crosses process boundaries. If we ever need deterministic
 * ids for snapshot testing, inject a factory via props.
 */
let __nextGroupSeq = 0
function generateGroupId(): string {
  __nextGroupSeq += 1
  return `group-${__nextGroupSeq}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * MIME type for the HTML5 drag-drop payload. Distinct from the legacy
 * `'application/viz-tab'` type so drag-drops between the shell and the
 * legacy `EditorGroup` (during the transition period) don't cross wires.
 */
const DRAG_MIME = 'application/workspace-tab'

interface DragPayload {
  readonly sourceGroupId: string
  readonly tabId: string
}

/**
 * Create the initial group state from seed tabs. Always produces exactly
 * one group; later splits / drag-drops may create more. The first seed
 * tab becomes the active tab. The initial layout is a single column
 * containing that one group (`[[id]]`).
 */
function createInitialGroupState(
  initialTabs: readonly WorkspaceTab[],
): {
  groups: Map<string, WorkspaceGroupState>
  layout: GroupLayout
  activeGroupId: string
} {
  const id = generateGroupId()
  const group: WorkspaceGroupState = {
    id,
    tabs: initialTabs,
    activeTabId: initialTabs.length > 0 ? initialTabs[0].id : null,
  }
  const groups = new Map<string, WorkspaceGroupState>()
  groups.set(id, group)
  return { groups, layout: [[id]], activeGroupId: id }
}

/**
 * Imperative handle exposed via `ref` on `WorkspaceShell`.
 *
 * Lets parent components programmatically control tab state without
 * going through the `initialTabs` prop (which is read once on mount).
 * Used by the PM Phase 2.5+ file tree to open/focus a file's tab when
 * the user clicks it in the sidebar.
 */
export interface WorkspaceShellHandle {
  /**
   * Open or focus the editor tab for the given file id. If a tab with
   * `kind: 'editor'` and matching `fileId` already exists (in any group),
   * focuses it. Otherwise creates a new editor tab in the currently active
   * group and focuses it. No-op if already focused.
   *
   * When `options.preview` is true, the tab is marked preview — a single
   * preview slot per group is reused across successive preview opens,
   * matching VSCode's single-click-to-preview behaviour. Promotion to a
   * pinned tab happens on double-click or the first content edit.
   */
  openOrFocusFile(fileId: string, options?: { preview?: boolean }): void

  /**
   * Promote the given tab out of preview mode — it becomes pinned and
   * stops being eligible for replacement by the next preview open. No-op
   * if the tab doesn't exist or was already pinned.
   */
  promoteTab(tabId: string): void

  /**
   * Close every tab (editor + preview) that targets the given file id,
   * in any group. Used when a file is deleted from the sidebar so its
   * orphan tabs vanish without remounting the shell. No-op if no tabs
   * reference the file.
   */
  closeTabsForFile(fileId: string): void

  /**
   * Close every tab in the tab's group EXCEPT the given tab. No-op if
   * the tab doesn't exist.
   */
  closeOtherTabs(tabId: string): void

  /** Close every tab in the tab's group. */
  closeAllTabsInGroup(tabId: string): void

  /**
   * Split the currently active group by inserting a new empty group in
   * the given direction (east = right, south = below). Focus stays on
   * the original group; the new group is a drop target for dragged
   * tabs. No-op if there is no active group.
   */
  splitActiveGroup(direction?: 'east' | 'south'): void
}

export const WorkspaceShell = forwardRef<WorkspaceShellHandle, WorkspaceShellProps>(function WorkspaceShell({
  initialTabs = [],
  theme = 'dark',
  height = '100%',
  onActiveTabChange,
  onTabClose,
  previewProviderFor,
  chromeForTab,
  editorExtrasForTab,
  onSaveFile,
  onTabContextMenu,
}, forwardedRef) {
  const shellRootRef = useRef<HTMLDivElement>(null)

  // One-shot seeding — `initialTabs` is read exactly once on mount. This
  // mirrors React's uncontrolled-input pattern: the prop is an initial
  // value, not a source of truth. Re-renders with a new `initialTabs`
  // reference do NOT re-seed the shell.
  const initialState = useRef(createInitialGroupState(initialTabs))
  const [groups, setGroups] = useState<Map<string, WorkspaceGroupState>>(
    () => initialState.current.groups,
  )
  const [layout, setLayout] = useState<GroupLayout>(
    () => initialState.current.layout,
  )
  const [activeGroupId, setActiveGroupId] = useState<string>(
    () => initialState.current.activeGroupId,
  )

  // Quadrant drop zone state — when a tab is being dragged over a
  // specific group, `dragOverTarget` records both the target group id
  // and the direction (N/S/E/W/center). Drives the guide line overlay.
  const [dragOverTarget, setDragOverTarget] = useState<{
    groupId: string
    direction: DropDirection
  } | null>(null)

  // Edge drop zone hover state — `'start'` = left edge, `'end'` = right
  // edge, `null` = no edge hovered. Drives the highlight overlay the
  // user sees while dragging a tab near the shell's outer borders.
  // Issue #1: dragging a tab to the left/right edge creates a new
  // split group at that position.
  const [dragOverEdge, setDragOverEdge] = useState<'start' | 'end' | null>(
    null,
  )

  // Global "a tab drag is in progress" flag. Used to toggle the edge
  // drop zones' pointer-events: when no drag is active, the zones are
  // transparent to clicks so the user can interact with content near
  // the shell borders normally; during a drag, the zones activate so
  // drop-over/drop events reach them. Set in handleTabDragStart and
  // cleared in a window-level dragend listener so interrupted drags
  // (drop outside the shell, ESC) also reset state.
  const [tabDragInProgress, setTabDragInProgress] = useState(false)

  /**
   * Set of file ids whose preview tab's render loop is currently
   * paused (user clicked the chrome's Stop button). The chrome
   * reads `previewPaused = pausedPreviews.has(fileId)` and
   * `PreviewView` receives `paused={…}` which threads through to
   * the compiled viz mount, which calls `renderer.pause()` /
   * `renderer.resume()` on state change.
   *
   * Keyed by FILE id (not tab id) because the pause state should
   * survive drag-dropping a preview tab to a new group — the
   * underlying viz file is the same, just rehoused.
   */
  const [pausedPreviews, setPausedPreviews] = useState<Set<string>>(
    () => new Set(),
  )

  // Theme application — PV6 / PK6. Effect, not render.
  useEffect(() => {
    if (!shellRootRef.current) return
    applyTheme(shellRootRef.current, theme)
  }, [theme])

  // Inject the tabbar-scrollbar hide rule once (webkit/blink fallback
  // because inline scrollbarWidth: 'none' isn't honoured there).
  useEffect(() => {
    ensureTabbarScrollStyle()
  }, [])

  // Resolve the current shell-wide active tab from the group map.
  // Memoized on the [groups, activeGroupId] dep set so the identity
  // reference is stable until something actually changes.
  const activeTab: WorkspaceTab | null = useMemo(() => {
    const group = groups.get(activeGroupId)
    if (!group || group.activeTabId === null) return null
    return group.tabs.find((t) => t.id === group.activeTabId) ?? null
  }, [groups, activeGroupId])

  // Fire `onActiveTabChange` whenever the resolved active tab changes.
  // Identity comparison on the tab reference is the signal — it changes
  // on tab-level activation AND on active-group switches. Also fires
  // once on mount so subscribers see the initial state.
  const prevActiveTabRef = useRef<WorkspaceTab | null | undefined>(undefined)
  useEffect(() => {
    if (prevActiveTabRef.current !== activeTab) {
      prevActiveTabRef.current = activeTab
      onActiveTabChange?.(activeTab)
    }
  }, [activeTab, onActiveTabChange])

  /**
   * Immutable group-state update helper. Takes the current groups map
   * and a patch function; returns a NEW map with the patched group.
   * Leaves the rest of the map alone, so React's referential update
   * semantics work correctly.
   */
  const updateGroup = useCallback(
    (
      groupId: string,
      patch: (g: WorkspaceGroupState) => WorkspaceGroupState,
    ) => {
      setGroups((prev) => {
        const existing = prev.get(groupId)
        if (!existing) return prev
        const next = new Map(prev)
        next.set(groupId, patch(existing))
        return next
      })
    },
    [],
  )

  /**
   * Activate a given tab inside a given group. Updates both the group's
   * local `activeTabId` and the shell-wide `activeGroupId` so the
   * resolved active tab reflects the click.
   */
  const handleTabClick = useCallback(
    (groupId: string, tabId: string) => {
      updateGroup(groupId, (g) => ({ ...g, activeTabId: tabId }))
      setActiveGroupId(groupId)
    },
    [updateGroup],
  )

  /**
   * Close a tab from a group. If the closed tab was active, switches
   * the active tab to the next adjacent tab (preferring the one to the
   * right of the closed position; falling back to the one to the left;
   * null if none remain).
   */
  const handleTabClose = useCallback(
    (groupId: string, tabId: string) => {
      let closedTab: WorkspaceTab | null = null
      // Snapshot the tab count BEFORE the close so we can decide below
      // whether this was the last tab in its group and therefore the
      // group itself should collapse (VS Code parity). We read from
      // the current `groups` closure instead of the setGroups updater
      // because the collapse decision branches on the count AFTER
      // removal, and doing it inside the updater would fight React's
      // batching.
      const existing = groups.get(groupId)
      const wasLastTab =
        existing !== undefined && existing.tabs.length === 1
      const canCollapseGroup = wasLastTab && groups.size > 1

      setGroups((prev) => {
        const cur = prev.get(groupId)
        if (!cur) return prev
        const idx = cur.tabs.findIndex((t) => t.id === tabId)
        if (idx === -1) return prev
        closedTab = cur.tabs[idx]
        const nextTabs = cur.tabs.filter((t) => t.id !== tabId)
        let nextActive: string | null = cur.activeTabId
        if (cur.activeTabId === tabId) {
          if (nextTabs.length === 0) {
            nextActive = null
          } else if (idx < nextTabs.length) {
            nextActive = nextTabs[idx].id
          } else {
            nextActive = nextTabs[nextTabs.length - 1].id
          }
        }
        const next = new Map(prev)
        // Auto-collapse: removing the last tab of a non-only group
        // drops the group entirely. Matches VS Code's "close the last
        // tab and the pane goes away" behavior. Only leaves the group
        // around as an empty "Drop a tab here" placeholder when it's
        // the only group in the shell (otherwise the shell would have
        // nowhere to render).
        if (canCollapseGroup) {
          next.delete(groupId)
        } else {
          next.set(groupId, {
            ...cur,
            tabs: nextTabs,
            activeTabId: nextActive,
          })
        }
        return next
      })

      if (canCollapseGroup) {
        setLayout((prev) => layoutRemoveGroup(prev, groupId))
        // If the closed group was the shell-active one, pick a
        // neighbor from the post-remove layout so the user still has
        // a focused group to interact with.
        setActiveGroupId((prev) => {
          if (prev !== groupId) return prev
          const remaining = allGroupIds(layoutRemoveGroup(layout, groupId))
          return remaining[0] ?? prev
        })
      }

      if (closedTab) {
        // If the closed tab was a preview, clean up its pause
        // state. Keyed by file id because preview tabs can be
        // re-opened from the editor chrome and a stale `paused`
        // entry would freeze the fresh render loop immediately.
        const maybePreview = closedTab as WorkspaceTab
        if (maybePreview.kind === 'preview') {
          const fileId = maybePreview.fileId
          setPausedPreviews((prev) => {
            if (!prev.has(fileId)) return prev
            const next = new Set(prev)
            next.delete(fileId)
            return next
          })
          // If this preview tab was pinned to a built-in example
          // audio source, stop it. Without this, closing the
          // preview tab leaves the drum / chord / sample sound
          // looping forever in the background — the user expects
          // "× the tab → silence" and gets only "× the tab → viz
          // gone, audio still playing."
          //
          // Pattern runtime sources are NOT in the built-in
          // registry, so this never reaches into a Strudel /
          // SonicPi tab's audio. Pattern tabs own their own audio
          // and have their own Stop button.
          if (maybePreview.sourceRef.kind === 'file') {
            const builtin = findBuiltinExampleSource(
              maybePreview.sourceRef.fileId,
            )
            if (builtin) builtin.stopIfRunning()
          }
        }
        onTabClose?.(closedTab)
      }
    },
    [groups, layout, onTabClose],
  )

  /**
   * Split a group horizontally — create a new empty group to the east
   * of the given group in the layout. Focus stays on the original
   * group; the new group becomes available as a drop target.
   */
  const handleSplit = useCallback(
    (groupId: string, direction: 'east' | 'south' = 'east') => {
      const newId = generateGroupId()
      setGroups((prev) => {
        const next = new Map(prev)
        next.set(newId, { id: newId, tabs: [], activeTabId: null })
        return next
      })
      setLayout((prev) => layoutInsertGroup(prev, groupId, direction, newId))
    },
    [],
  )

  /**
   * Helper — find a "neighbor" group id for a closing group so its tabs
   * can be merged somewhere. Walks reading order (left-to-right, top-
   * to-bottom) and picks the first group that isn't the closing one.
   * Returns `null` when the closing group is the only group in the
   * layout; callers MUST check and skip the close in that case.
   */
  const findNeighborGroupId = useCallback(
    (closingId: string): string | null => {
      for (const id of allGroupIds(layout)) {
        if (id !== closingId) return id
      }
      return null
    },
    [layout],
  )

  /**
   * Close a group. Merges the closing group's tabs into a neighbor and
   * removes the closing group from the layout (which collapses empty
   * columns via `removeGroup`). No-op when only one group exists — the
   * shell must always have at least one group.
   */
  const handleCloseGroup = useCallback(
    (groupId: string) => {
      const neighborId = findNeighborGroupId(groupId)
      if (!neighborId) return // only one group exists

      let movedTabs: readonly WorkspaceTab[] = []
      setGroups((prev) => {
        const closing = prev.get(groupId)
        const neighbor = prev.get(neighborId)
        if (!closing || !neighbor) return prev
        movedTabs = closing.tabs
        const mergedTabs = [...neighbor.tabs, ...closing.tabs]
        const mergedActive =
          neighbor.activeTabId ??
          (mergedTabs.length > 0 ? mergedTabs[0].id : null)
        const next = new Map(prev)
        next.delete(groupId)
        next.set(neighborId, {
          ...neighbor,
          tabs: mergedTabs,
          activeTabId: mergedActive,
        })
        return next
      })
      setLayout((prev) => layoutRemoveGroup(prev, groupId))
      if (activeGroupId === groupId) {
        setActiveGroupId(neighborId)
      }
      // Swallow `movedTabs` — it's declared for clarity and as a future
      // hook if we want to emit a per-tab "moved" event. Today's
      // consumers only care about close-tab events, not move events.
      void movedTabs
    },
    [findNeighborGroupId, activeGroupId],
  )

  // -------------------------------------------------------------------------
  // Task 08 — Command-system imperative actions
  // -------------------------------------------------------------------------

  /**
   * Create a sibling group to the right of `originGroupId` and insert
   * `newTab` as its sole tab. Used by `workspace.openPreviewToSide`.
   */
  const splitGroupWithTab = useCallback(
    (originGroupId: string, _direction: 'right', newTab: WorkspaceTab) => {
      const newId = generateGroupId()
      setGroups((prev) => {
        const next = new Map(prev)
        next.set(newId, {
          id: newId,
          tabs: [newTab],
          activeTabId: newTab.id,
        })
        return next
      })
      setLayout((prev) => layoutInsertGroup(prev, originGroupId, 'east', newId))
    },
    [],
  )

  /**
   * Move a tab to a brand-new group at one of the four quadrants of an
   * existing target group (N/S/E/W) — used by the per-group quadrant
   * drop zones (Issue #1). The layout helper `insertGroup` handles the
   * 2-D insertion; here we only own the Map updates for the groups'
   * tab lists and clean up the source group if it empties.
   *
   * If removing the tab leaves the source group empty, the source is
   * dropped from both the `groups` Map and the `layout` via
   * `layoutRemoveGroup` (which collapses empty columns). Activates the
   * new group on success so focus follows the drop.
   *
   * No-op if the source tab isn't found or the target group doesn't
   * exist in the layout. Defensive against mid-drag deletions.
   */
  const moveTabToNewQuadrant = useCallback(
    (
      sourceGroupId: string,
      tabId: string,
      targetGroupId: string,
      direction: 'west' | 'east' | 'north' | 'south',
    ) => {
      const source = groups.get(sourceGroupId)
      if (!source) return
      const movingTab = source.tabs.find((t) => t.id === tabId)
      if (!movingTab) return
      if (!findGroupCoords(layout, targetGroupId)) return

      // Degenerate case: the user is trying to split a single-tab
      // group by dragging its only tab to its own quadrant. The
      // resulting state would be "source collapses, new group takes
      // its slot" — visually identical to doing nothing. Skip it so
      // the user's drop feels like a no-op rather than silently
      // "working" into an identical state.
      if (
        sourceGroupId === targetGroupId &&
        source.tabs.length === 1
      ) {
        return
      }

      // Whether the source group will still exist after we remove
      // the moving tab. Matters for the layout update below: if the
      // source stays (multi-tab case), we insert the new group
      // relative to it; if it collapses (sole-tab cross-group move),
      // we remove it from the layout first.
      const sourceWillCollapse = source.tabs.length === 1

      const newId = generateGroupId()
      setGroups((prev) => {
        const next = new Map(prev)
        // Remove tab from source group.
        const srcTabs = source.tabs.filter((t) => t.id !== tabId)
        const srcActive: string | null =
          source.activeTabId === tabId
            ? srcTabs[0]?.id ?? null
            : source.activeTabId
        if (srcTabs.length === 0) {
          next.delete(sourceGroupId)
        } else {
          next.set(sourceGroupId, {
            ...source,
            tabs: srcTabs,
            activeTabId: srcActive,
          })
        }
        next.set(newId, {
          id: newId,
          tabs: [movingTab],
          activeTabId: movingTab.id,
        })
        return next
      })
      setLayout((prev) => {
        // If the source group just emptied AND isn't the target
        // (which would have made us return above), remove it from
        // the layout first. Then insert the new group in the chosen
        // direction relative to the target.
        const afterRemove =
          sourceWillCollapse && sourceGroupId !== targetGroupId
            ? layoutRemoveGroup(prev, sourceGroupId)
            : prev
        return layoutInsertGroup(afterRemove, targetGroupId, direction, newId)
      })
      setActiveGroupId(newId)
    },
    [groups, layout],
  )

  /**
   * Move a tab to a brand-new group at the leftmost or rightmost edge
   * of the layout — used by the shell's outer edge drop zones. Wraps
   * `layoutInsertEdgeGroup` and handles the `groups` Map side exactly
   * like `moveTabToNewQuadrant`.
   */
  const moveTabToNewEdgeGroup = useCallback(
    (sourceGroupId: string, tabId: string, position: 'start' | 'end') => {
      const source = groups.get(sourceGroupId)
      if (!source) return
      const movingTab = source.tabs.find((t) => t.id === tabId)
      if (!movingTab) return

      const newId = generateGroupId()
      setGroups((prev) => {
        const next = new Map(prev)
        const srcTabs = source.tabs.filter((t) => t.id !== tabId)
        const srcActive: string | null =
          source.activeTabId === tabId
            ? srcTabs[0]?.id ?? null
            : source.activeTabId
        if (srcTabs.length === 0) {
          next.delete(sourceGroupId)
        } else {
          next.set(sourceGroupId, {
            ...source,
            tabs: srcTabs,
            activeTabId: srcActive,
          })
        }
        next.set(newId, {
          id: newId,
          tabs: [movingTab],
          activeTabId: movingTab.id,
        })
        return next
      })
      setLayout((prev) => {
        const afterRemove =
          source.tabs.length === 1
            ? layoutRemoveGroup(prev, sourceGroupId)
            : prev
        return layoutInsertEdgeGroup(afterRemove, position, newId)
      })
      setActiveGroupId(newId)
    },
    [groups],
  )

  /**
   * Toggle the background decoration on a group. Set `backgroundTabId` to
   * show a preview layer behind the editor, or `null` to hide it.
   */
  const updateGroupBackground = useCallback(
    (groupId: string, backgroundTabId: string | null) => {
      updateGroup(groupId, (g) => ({
        ...g,
        backgroundTabId: backgroundTabId ?? undefined,
      }))
    },
    [updateGroup],
  )

  /**
   * Close a tab by id — scans every group, removes the matching tab, and
   * fires the normal `handleTabClose` path so runtime disposal (U3) still
   * runs. No-op if the tab id isn't found. If closing the tab empties a
   * group that isn't the last group, the empty group is removed from
   * `groupOrder` so the split layout collapses cleanly — matching the
   * "close the preview tab = dismiss the panel" expectation.
   */
  const closeTabById = useCallback(
    (tabId: string) => {
      let ownerGroupId: string | null = null
      for (const [gid, g] of groups.entries()) {
        if (g.tabs.some((t) => t.id === tabId)) {
          ownerGroupId = gid
          break
        }
      }
      if (!ownerGroupId) return
      handleTabClose(ownerGroupId, tabId)

      // Collapse the group if it's now empty AND we have more than one
      // group. Single-group shells keep the empty group around so the
      // shell doesn't render a blank screen with no tab bar.
      const owner = groups.get(ownerGroupId)
      const wasLastTab = owner ? owner.tabs.length === 1 : false
      const willCollapse = wasLastTab && groups.size > 1

      if (willCollapse) {
        setGroups((prev) => {
          if (prev.size <= 1) return prev
          const next = new Map(prev)
          next.delete(ownerGroupId!)
          return next
        })
        setLayout((prev) => layoutRemoveGroup(prev, ownerGroupId!))
        // If the closed group was active, pick the first remaining
        // group from the post-remove layout.
        setActiveGroupId((prev) => {
          if (prev !== ownerGroupId) return prev
          const remaining = allGroupIds(
            layoutRemoveGroup(layout, ownerGroupId!),
          )
          return remaining[0] ?? prev
        })
      }
    },
    [groups, layout, handleTabClose],
  )

  /**
   * Find the first tab with the given file id and kind across all groups.
   * Returns `{ groupId, tabId }` or `null`. The chrome uses this to check
   * whether a preview already exists for the editor tab's file — drives
   * the Play/Stop toggle state on the viz chrome's primary button.
   */
  const findTabByFileId = useCallback(
    (
      fileId: string,
      kind: 'editor' | 'preview',
    ): { groupId: string; tabId: string } | null => {
      for (const [gid, g] of groups.entries()) {
        for (const t of g.tabs) {
          if (t.kind === kind && t.fileId === fileId) {
            return { groupId: gid, tabId: t.id }
          }
        }
      }
      return null
    },
    [groups],
  )

  /**
   * Find the first group that currently contains ANY preview tab. Returns
   * its id or `null` if no group hosts a preview. The chrome's "open
   * preview" handler uses this to REUSE an existing preview area instead
   * of always splitting off a new group — so once the user has opened
   * one preview pane (and possibly resized it), every subsequent "Play"
   * on a different viz file adds its preview to the same pane instead
   * of spawning a parallel split.
   *
   * Treating "any group with any preview tab" as the reuse target
   * (rather than requiring the group to be adjacent or empty-except-for
   * -previews) matches the VS Code side-panel semantic: the user's
   * mental model is "the preview panel," singular, and the shell should
   * preserve that expectation even though structurally it's just a
   * group with preview tabs in it.
   */
  const findGroupWithAnyPreview = useCallback((): string | null => {
    for (const [gid, g] of groups.entries()) {
      if (g.tabs.some((t) => t.kind === 'preview')) return gid
    }
    return null
  }, [groups])

  /**
   * WorkspaceShellActions object for the command system. Stable reference
   * via useMemo since the callbacks themselves are stable (useCallback).
   */
  const shellActionsRef = useRef<WorkspaceShellActions>(null as unknown as WorkspaceShellActions)
  const shellActions: WorkspaceShellActions = useMemo(
    () => ({
      addTab: (groupId: string, tab: WorkspaceTab) => {
        updateGroup(groupId, (g) => ({
          ...g,
          tabs: [...g.tabs, tab],
          activeTabId: tab.id,
        }))
      },
      splitGroupWithTab,
      updateGroupBackground,
      closeTab: closeTabById,
      findTabByFileId,
    }),
    [splitGroupWithTab, updateGroupBackground, updateGroup, closeTabById, findTabByFileId],
  )
  shellActionsRef.current = shellActions

  // -------------------------------------------------------------------------
  // Task 08 — Keyboard commands (Cmd+K chord)
  // -------------------------------------------------------------------------

  // Stable getter refs for the keyboard hook. The hook stores these in a
  // ref so the listener always reads current state without re-attachment.
  const getActiveTab = useCallback((): WorkspaceTab | null => activeTab, [activeTab])
  const getActiveGroupId = useCallback((): string | null => activeGroupId, [activeGroupId])
  const getActiveGroup = useCallback((): WorkspaceGroupState | null => {
    return groups.get(activeGroupId) ?? null
  }, [groups, activeGroupId])

  /**
   * Bridge the shell's `previewProviderFor` prop (keyed by tab) with the
   * command system's `getPreviewProvider` (keyed by language). When the
   * prop is supplied (tests inject stubs here), we construct a synthetic
   * preview-tab stub with the active editor's fileId so the prop callback
   * can match on it. Falls back to the module-level registry.
   */
  const getPreviewProviderForCommand = useCallback(
    (language: string) => {
      // Module-level registry first (production path).
      const fromRegistry = getPreviewProviderForLanguage(language)
      if (fromRegistry) return fromRegistry

      // Prop-level fallback (test path): construct a stub preview tab
      // using the current active editor tab's fileId.
      if (previewProviderFor) {
        const currentTab = activeTab
        const fileId = currentTab?.fileId ?? ''
        return previewProviderFor({
          kind: 'preview',
          id: '__cmd-lookup__',
          fileId,
          sourceRef: { kind: 'default' },
        })
      }
      return undefined
    },
    [previewProviderFor, activeTab],
  )

  useKeyboardCommands({
    getActiveTab,
    getActiveGroupId,
    getActiveGroup,
    shellActions,
    getPreviewProvider: getPreviewProviderForCommand,
  })

  /**
   * Edge drop handler (Issue #1). Parses the DRAG_MIME payload and moves
   * the tab to a brand-new group at the target edge position. No-op on
   * malformed payloads or unknown tab ids — edges behave as inert
   * backdrops in the error cases, matching the expectation that "drop
   * that did nothing" is visible by the tab snapping back to its source.
   */
  const handleEdgeDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, position: 'start' | 'end') => {
      e.preventDefault()
      e.stopPropagation()
      setDragOverEdge(null)
      const raw = e.dataTransfer.getData(DRAG_MIME)
      if (!raw) return
      let payload: DragPayload
      try {
        payload = JSON.parse(raw)
      } catch {
        return
      }
      moveTabToNewEdgeGroup(payload.sourceGroupId, payload.tabId, position)
    },
    [moveTabToNewEdgeGroup],
  )

  const handleEdgeDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, position: 'start' | 'end') => {
      if (!e.dataTransfer.types.includes(DRAG_MIME)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (dragOverEdge !== position) setDragOverEdge(position)
    },
    [dragOverEdge],
  )

  const handleEdgeDragLeave = useCallback(() => {
    setDragOverEdge(null)
  }, [])

  // Shell-level Cmd+S / Ctrl+S save: dispatches to the host-supplied
  // `onSaveFile` with the currently-active editor tab. The host decides
  // what "save" means for that file type (e.g., `flushToPreset` for viz
  // files backed by `VizPresetStore`). No-op if no onSaveFile is
  // registered, or if the active tab is not an editor tab.
  const onSaveFileRef = useRef(onSaveFile)
  onSaveFileRef.current = onSaveFile
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key !== 's' && e.key !== 'S') return
      const current = onSaveFileRef.current
      if (!current) return
      const tab = activeTab
      if (!tab || tab.kind !== 'editor') return
      e.preventDefault()
      current(tab)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTab])

  /**
   * Drag start handler. Writes the payload into the dataTransfer using
   * the `DRAG_MIME` type. We also stash the tab id on a JSON payload so
   * the drop handler can look up the source group without relying on
   * cross-component state. Flips the shell's `tabDragInProgress` flag
   * so edge drop zones become click-active for the duration of the
   * drag (Issue #1).
   */
  const handleTabDragStart = useCallback(
    (
      e: React.DragEvent<HTMLDivElement>,
      groupId: string,
      tab: WorkspaceTab,
    ) => {
      const payload: DragPayload = { sourceGroupId: groupId, tabId: tab.id }
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
      e.dataTransfer.effectAllowed = 'move'
      setTabDragInProgress(true)
    },
    [],
  )

  // Reset drag-in-progress state on any dragend (drop inside, drop
  // outside, ESC cancel). Window-level because dragend fires on the
  // source element, which may have been unmounted by the time the
  // event lands if the tab moved between groups during the drag.
  useEffect(() => {
    const onDragEnd = () => {
      setTabDragInProgress(false)
      setDragOverEdge(null)
      setDragOverTarget(null)
    }
    window.addEventListener('dragend', onDragEnd)
    window.addEventListener('drop', onDragEnd)
    return () => {
      window.removeEventListener('dragend', onDragEnd)
      window.removeEventListener('drop', onDragEnd)
    }
  }, [])

  /**
   * Compute the drop quadrant for a tab-drag event relative to an
   * element's bounding rect. Four outer quadrants + a center region:
   *
   *   +--------+--------+
   *   |   NW   |   NE   |   ← but we only care about N/S/E/W, so the
   *   +--------+--------+     diagonal gets assigned to whichever
   *   |   SW   |   SE   |     edge the cursor is closer to.
   *   +--------+--------+
   *
   * The center region is a 40% × 40% box in the middle — dropping
   * there keeps the existing "add tab to this group" behavior. Outside
   * the center, the cursor's distance to each of the four edges (as a
   * fraction) decides the direction.
   */
  const computeQuadrant = useCallback(
    (e: React.DragEvent<HTMLElement>, el: HTMLElement): DropDirection => {
      const rect = el.getBoundingClientRect()
      // Degenerate rect (zero width/height) — happens in jsdom tests
      // that don't compute layout, or during transitions. Default to
      // `'center'` so programmatic tests that fire synthetic drops get
      // the intuitive "add to target group" behavior without having to
      // mock getBoundingClientRect.
      if (rect.width <= 0 || rect.height <= 0) return 'center'
      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height
      // NaN guard — if clientX/Y are unreliable the division can
      // produce NaN; treat that as center too.
      if (Number.isNaN(x) || Number.isNaN(y)) return 'center'
      // Center: 30%..70% both dimensions.
      if (x >= 0.3 && x <= 0.7 && y >= 0.3 && y <= 0.7) {
        return 'center'
      }
      // Pick the nearest edge (smallest fractional distance).
      const distWest = x
      const distEast = 1 - x
      const distNorth = y
      const distSouth = 1 - y
      const min = Math.min(distWest, distEast, distNorth, distSouth)
      if (min === distWest) return 'west'
      if (min === distEast) return 'east'
      if (min === distNorth) return 'north'
      return 'south'
    },
    [],
  )

  /**
   * Drop handler for a target group. Parses the payload, computes the
   * drop quadrant, and dispatches:
   *
   *   - `'center'` → add the tab to the target group (existing
   *     behavior — drop-on-group means "combine").
   *   - `'west'`/`'east'` → create a new column adjacent to the target.
   *   - `'north'`/`'south'` → split the target's column vertically and
   *     stack the new group above or below.
   *
   * The direction-based cases go through `moveTabToNewQuadrant` which
   * delegates to the pure `insertGroup` layout helper so the 2-D
   * arithmetic is tested in isolation.
   */
  const handleDropOnGroup = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetGroupId: string) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOverTarget(null)
      const raw = e.dataTransfer.getData(DRAG_MIME)
      if (!raw) return
      let payload: DragPayload
      try {
        payload = JSON.parse(raw)
      } catch {
        return
      }
      const { sourceGroupId, tabId } = payload
      const direction = computeQuadrant(e, e.currentTarget)

      // Drop on own group in the center = just activate the tab.
      // Directional drops on the SAME group (the common case when the
      // shell starts with all tabs in one group) fall through to the
      // split path below — `moveTabToNewQuadrant` handles the edge
      // case where the source has only one tab.
      if (sourceGroupId === targetGroupId && direction === 'center') {
        setGroups((prev) => {
          const g = prev.get(targetGroupId)
          if (!g) return prev
          const tab = g.tabs.find((t) => t.id === tabId)
          if (!tab) return prev
          const next = new Map(prev)
          next.set(targetGroupId, { ...g, activeTabId: tabId })
          return next
        })
        setActiveGroupId(targetGroupId)
        return
      }

      if (direction === 'center') {
        // Cross-group drop into the center: add the moving tab to the
        // target group's tab list, remove from the source.
        setGroups((prev) => {
          const source = prev.get(sourceGroupId)
          const target = prev.get(targetGroupId)
          if (!source || !target) return prev
          const movingTab = source.tabs.find((t) => t.id === tabId)
          if (!movingTab) return prev
          const sourceTabs = source.tabs.filter((t) => t.id !== tabId)
          let sourceActive: string | null = source.activeTabId
          if (source.activeTabId === tabId) {
            sourceActive = sourceTabs.length > 0 ? sourceTabs[0].id : null
          }
          const next = new Map(prev)
          // Collapse source if it just emptied AND we have other groups.
          if (sourceTabs.length === 0 && prev.size > 1) {
            next.delete(sourceGroupId)
          } else {
            next.set(sourceGroupId, {
              ...source,
              tabs: sourceTabs,
              activeTabId: sourceActive,
            })
          }
          next.set(targetGroupId, {
            ...target,
            tabs: [...target.tabs, movingTab],
            activeTabId: tabId,
          })
          return next
        })
        // If the source was collapsed, drop it from the layout too.
        setLayout((prev) => {
          const source = groups.get(sourceGroupId)
          if (!source || source.tabs.length !== 1) return prev
          return layoutRemoveGroup(prev, sourceGroupId)
        })
        setActiveGroupId(targetGroupId)
        return
      }

      // Directional drop → create a new split group adjacent to target.
      moveTabToNewQuadrant(sourceGroupId, tabId, targetGroupId, direction)
    },
    [computeQuadrant, groups, moveTabToNewQuadrant],
  )

  /**
   * Dispatch a single tab to its view component. Exhaustiveness-checked
   * so a new `WorkspaceTab` kind fails compile if this switch is not
   * updated alongside the type.
   */
  const renderTabContent = useCallback(
    (
      tab: WorkspaceTab,
      groupId: string,
      isActive: boolean,
    ): React.ReactNode => {
      switch (tab.kind) {
        case 'editor': {
          // Runtime chrome (pattern files) comes from the host's chromeForTab.
          // Preview chrome (viz files) comes from the preview provider's
          // renderEditorChrome — tried as a fallback when no runtime chrome.
          let chromeSlot: React.ReactNode = chromeForTab?.(tab) ?? undefined
          if (!chromeSlot && previewProviderFor) {
            const previewTab = { ...tab, kind: 'preview' as const, sourceRef: { kind: 'default' as const } }
            const provider = previewProviderFor(previewTab as any)
            if (provider?.renderEditorChrome) {
              const file = getFile(tab.fileId)
              if (file) {
                const existingPreview = findTabByFileId(tab.fileId, 'preview')
                chromeSlot = provider.renderEditorChrome({
                  file,
                  previewOpen: existingPreview !== null,
                  previewPaused: pausedPreviews.has(tab.fileId),
                  onTogglePausePreview: () => {
                    // Flip the file's entry in the pausedPreviews
                    // set. The resulting state change propagates
                    // through PreviewView → provider ctx →
                    // CompiledVizMount's pause/resume effect.
                    //
                    // ALSO dispatch start/stop on the built-in
                    // example audio source IF the open preview is
                    // pinned to one. The shell is the right place
                    // for this — not the chrome — because the
                    // chrome's local `selectedSource` state can
                    // get wiped when the layout shape transitions
                    // (e.g., splitting from one group to two
                    // remounts the chrome subtree). The shell-
                    // owned preview tab's `sourceRef` survives
                    // those remounts because it lives in the
                    // groups map, not in component state.
                    //
                    // Pattern runtime sources are NOT in the
                    // built-in registry and stay untouched —
                    // they're owned by their own pattern tab.
                    const wasPaused = pausedPreviews.has(tab.fileId)
                    setPausedPreviews((prev) => {
                      const next = new Set(prev)
                      if (next.has(tab.fileId)) next.delete(tab.fileId)
                      else next.add(tab.fileId)
                      return next
                    })
                    const previewTabLoc =
                      shellActionsRef.current.findTabByFileId(
                        tab.fileId,
                        'preview',
                      )
                    if (previewTabLoc) {
                      const previewTabObj = groups
                        .get(previewTabLoc.groupId)
                        ?.tabs.find((t) => t.id === previewTabLoc.tabId)
                      if (
                        previewTabObj &&
                        previewTabObj.kind === 'preview' &&
                        previewTabObj.sourceRef.kind === 'file'
                      ) {
                        const builtin = findBuiltinExampleSource(
                          previewTabObj.sourceRef.fileId,
                        )
                        if (builtin) {
                          if (wasPaused) {
                            // Resuming after Stop — re-arm the
                            // audio loop so the viz has live data.
                            builtin.startIfIdle()
                          } else {
                            // Pausing — silence the built-in audio
                            // alongside freezing the viz draw loop.
                            builtin.stopIfRunning()
                          }
                        }
                      }
                    }
                  },
                  onChangePreviewSource: (nextRef) => {
                    // Find the open preview tab for this file and
                    // update its sourceRef in place. Task 2's
                    // sourceRef-keyed React tree triggers a remount
                    // on the swap, so setup() re-runs with the
                    // fresh injected refs and any stale module-
                    // level caches get reset. If no preview is
                    // open (shouldn't happen because the chrome
                    // guards on previewOpen before calling this),
                    // silently no-op.
                    const current =
                      shellActionsRef.current.findTabByFileId(
                        tab.fileId,
                        'preview',
                      )
                    if (!current) return
                    updateGroup(current.groupId, (g) => ({
                      ...g,
                      tabs: g.tabs.map((t) =>
                        t.id === current.tabId && t.kind === 'preview'
                          ? { ...t, sourceRef: nextRef }
                          : t,
                      ),
                    }))
                  },
                  onOpenPreview: (selectedSourceRef) => {
                    // Idempotent open: if a preview tab for this file
                    // already exists anywhere in the shell, return
                    // early. Viz tabs are editing surfaces, not
                    // transports — the preview is closed by its own
                    // ✕ button, not by a chrome action. Re-read via
                    // shellActionsRef so a stale closure (after a
                    // user dragged the preview tab elsewhere) still
                    // resolves correctly.
                    const current = shellActionsRef.current.findTabByFileId(
                      tab.fileId,
                      'preview',
                    )
                    if (current) {
                      return
                    }

                    // Issue #4b: the chrome's source dropdown lets the
                    // user pin the new preview tab to a specific audio
                    // publisher (a pattern file, the sample sound, or
                    // none). Default to follow-most-recent if the chrome
                    // didn't supply one.
                    const sourceRef = selectedSourceRef ?? { kind: 'default' as const }

                    // Issue #4a: reuse an existing preview pane if any
                    // group already hosts preview tabs. Only split off a
                    // new group when no preview pane exists yet. This
                    // matches the "one preview panel" mental model while
                    // still allowing the user to manually split further
                    // via drag-drop.
                    const existingPreviewGroup = findGroupWithAnyPreview()
                    if (existingPreviewGroup) {
                      const newTab: WorkspaceTab = {
                        kind: 'preview',
                        id: `preview-${tab.fileId}-${Date.now()}`,
                        fileId: tab.fileId,
                        sourceRef,
                      }
                      shellActionsRef.current.addTab(
                        existingPreviewGroup,
                        newTab,
                      )
                      return
                    }

                    // No existing preview area — split off a new group.
                    // Inline the split here (rather than going through
                    // the command) so we can thread the selected
                    // sourceRef; the command defaults to 'default' and
                    // doesn't accept an override.
                    const newTab: WorkspaceTab = {
                      kind: 'preview',
                      id: `preview-${tab.fileId}-${Date.now()}`,
                      fileId: tab.fileId,
                      sourceRef,
                    }
                    shellActionsRef.current.splitGroupWithTab(
                      groupId,
                      'right',
                      newTab,
                    )
                  },
                  onToggleBackground: () => {
                    executeCommand('workspace.toggleBackgroundPreview', {
                      activeTab: tab,
                      activeGroupId: groupId,
                      activeGroup: groups.get(groupId) ?? null,
                      shell: shellActionsRef.current,
                      getPreviewProvider: (lang) => {
                        const pTab = { kind: 'preview' as const, id: '', fileId: '', sourceRef: { kind: 'default' as const } }
                        return previewProviderFor?.({ ...pTab, fileId: tab.fileId }) ?? undefined
                      },
                    })
                  },
                  onSave: () => {
                    // Bridge to the host-supplied save callback. The host
                    // owns the persistence layer (e.g., flushToPreset for
                    // viz files backed by VizPresetStore). Same code path
                    // the window-level Cmd+S listener takes.
                    onSaveFileRef.current?.(tab)
                  },
                  // hotReload / onToggleHotReload are optional on the
                  // PreviewEditorChromeContext interface. Phase 10.2 ships
                  // a provider-level reload policy (always-on for viz);
                  // per-tab toggle is a follow-up phase.
                })
              }
            }
          }
          const extras = editorExtrasForTab?.(tab as WorkspaceTab & { kind: 'editor' })
          return (
            <EditorView
              key={tab.id}
              fileId={tab.fileId}
              chromeSlot={chromeSlot}
              theme={theme}
              onPlay={extras?.onPlay}
              onStop={extras?.onStop}
              error={extras?.error}
            />
          )
        }
        case 'preview': {
          const provider = previewProviderFor?.(tab)
          if (!provider) {
            return (
              <div
                data-testid={`preview-no-provider-${tab.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'var(--foreground-muted)',
                  fontSize: 12,
                }}
              >
                No preview provider registered for this file type.
              </div>
            )
          }
          return (
            <PreviewView
              key={tab.id}
              fileId={tab.fileId}
              provider={provider}
              sourceRef={tab.sourceRef}
              theme={theme}
              // Issue #3 fix: only the active tab of each group is
              // mounted here, so by the time PreviewView renders the tab
              // is always visible. The old `hidden={!isActive}` was
              // wrong — it paused viz previews whenever the user focused
              // a different group, even though the preview was still
              // on-screen. D-03's "pause when hidden" is for the
              // tab-switched-away case, which the shell handles by
              // simply not rendering inactive tabs at all.
              hidden={false}
              paused={pausedPreviews.has(tab.fileId)}
              onSourceRefChange={(nextRef) => {
                // Update the tab's sourceRef in place. Tab id is stable,
                // so we replace the tab object inside the group while
                // preserving its order.
                updateGroup(groupId, (g) => ({
                  ...g,
                  tabs: g.tabs.map((t) =>
                    t.id === tab.id && t.kind === 'preview'
                      ? { ...t, sourceRef: nextRef }
                      : t,
                  ),
                }))
              }}
            />
          )
        }
        default:
          return assertNever(tab)
      }
    },
    // Issue #2 fix: `groups` and `findTabByFileId` must be in the dep
    // array so `previewOpen` stays fresh after a preview tab is added.
    // Without them, renderTabContent holds a stale closure over the
    // old groups map, findTabByFileId always returns null, and the
    // chrome's Play button never flips to Stop. editorExtrasForTab and
    // findGroupWithAnyPreview are also added because they were silently
    // missing before.
    //
    // `pausedPreviews` must ALSO be a dep — without it, a second-click
    // Stop → Play transition can't refresh the chrome. The first click
    // (Preview → Stop) happens to work because `groups` changes (a
    // preview tab is added), invalidating the callback. The second
    // click only changes `pausedPreviews`, and without this dep the
    // callback returns a cached function that reads a stale
    // `pausedPreviews.has(fileId) === false` via its closure. The
    // regression test in WorkspaceShell.test.tsx covers this exact
    // path and fails without `pausedPreviews` in the deps.
    [
      chromeForTab,
      previewProviderFor,
      theme,
      updateGroup,
      groups,
      pausedPreviews,
      findTabByFileId,
      findGroupWithAnyPreview,
      editorExtrasForTab,
    ],
  )

  /**
   * Render one group's tab bar + content area. Factored out of the top-
   * level render body so the `SplitPane` children are readable.
   */
  const renderGroup = useCallback(
    (group: WorkspaceGroupState): React.ReactNode => {
      const activeTabObj = group.tabs.find((t) => t.id === group.activeTabId)
      const isShellActiveGroup = activeGroupId === group.id
      const canClose = groups.size > 1
      const isDragOver = dragOverTarget?.groupId === group.id

      return (
        <div
          data-workspace-group={group.id}
          data-active-group={isShellActiveGroup ? 'true' : 'false'}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(DRAG_MIME)) {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              const direction = computeQuadrant(e, e.currentTarget)
              if (
                dragOverTarget?.groupId !== group.id ||
                dragOverTarget.direction !== direction
              ) {
                setDragOverTarget({ groupId: group.id, direction })
              }
            }
          }}
          onDragLeave={(e) => {
            // Only clear the highlight when leaving the group's root,
            // not when crossing child boundaries inside it.
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setDragOverTarget((t) =>
                t?.groupId === group.id ? null : t,
              )
            }
          }}
          onDrop={(e) => handleDropOnGroup(e, group.id)}
          onMouseDown={() => {
            // Clicking anywhere inside a group focuses it without
            // changing the tab selection. Used by `onActiveTabChange`
            // to emit group-switch events when the user clicks into
            // a non-active group's content area.
            if (activeGroupId !== group.id) {
              setActiveGroupId(group.id)
            }
          }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            width: '100%',
            background: 'var(--background)',
            outline: isDragOver
              ? '2px solid var(--accent, #75baff)'
              : 'none',
            outlineOffset: -2,
          }}
        >
          {/* Tab bar */}
          <div
            data-workspace-group-tabbar={group.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--surface)',
              borderBottom: '1px solid var(--border)',
              height: 30,
              flexShrink: 0,
              overflowX: 'auto',
              overflowY: 'hidden',
              // Hide the scrollbar visually (Firefox + legacy IE).
              // Webkit uses the injected CSS rule in tabbarScrollStyle below.
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {group.tabs.map((tab) => {
              const isActive = tab.id === group.activeTabId
              const isPreview =
                tab.kind === 'editor' && (tab as { preview?: boolean }).preview === true
              return (
                <div
                  key={tab.id}
                  data-workspace-tab={tab.id}
                  data-tab-kind={tab.kind}
                  data-tab-active={isActive ? 'true' : 'false'}
                  data-tab-preview={isPreview ? 'true' : 'false'}
                  draggable
                  onDragStart={(e) => handleTabDragStart(e, group.id, tab)}
                  onClick={() => handleTabClick(group.id, tab.id)}
                  onContextMenu={(e) => {
                    if (!onTabContextMenu) return
                    e.preventDefault()
                    e.stopPropagation()
                    onTabContextMenu(tab, e.clientX, e.clientY)
                  }}
                  onDoubleClick={() => {
                    // Double-click promotes a preview tab to pinned.
                    if (isPreview) {
                      setGroups((prev) => {
                        const g = prev.get(group.id)
                        if (!g) return prev
                        const nextTabs = g.tabs.map((t) =>
                          t.id === tab.id && t.kind === 'editor'
                            ? { ...t, preview: false }
                            : t,
                        )
                        const nx = new Map(prev)
                        nx.set(group.id, { ...g, tabs: nextTabs })
                        return nx
                      })
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '0 8px',
                    height: '100%',
                    cursor: 'grab',
                    background: isActive
                      ? 'var(--background)'
                      : 'transparent',
                    borderRight: '1px solid var(--border)',
                    color: isActive
                      ? 'var(--foreground)'
                      : 'var(--foreground-muted)',
                    fontSize: 11,
                    fontStyle: isPreview ? 'italic' : 'normal',
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ fontSize: 9, opacity: 0.5 }}>
                    {tab.kind === 'editor' ? '\u25A1' : '\u25CE'}
                  </span>
                  <span>{tab.fileId}</span>
                  <button
                    data-testid={`tab-close-${tab.id}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleTabClose(group.id, tab.id)
                    }}
                    style={closeBtnStyle}
                  >
                    {'\u00D7'}
                  </button>
                </div>
              )
            })}
            <div style={{ flex: 1 }} />
            {/* Group actions */}
            <div
              style={{
                display: 'flex',
                gap: 1,
                padding: '0 4px',
                flexShrink: 0,
              }}
            >
              <button
                data-testid={`group-split-${group.id}`}
                onClick={() => handleSplit(group.id, 'east')}
                title="Split right (⌘\\)"
                style={actionBtnStyle}
              >
                {'\u2502'}
              </button>
              <button
                data-testid={`group-split-down-${group.id}`}
                onClick={() => handleSplit(group.id, 'south')}
                title="Split down (⌘⇧\\)"
                style={actionBtnStyle}
              >
                {'\u2500'}
              </button>
              {canClose && (
                <button
                  data-testid={`group-close-${group.id}`}
                  onClick={() => handleCloseGroup(group.id)}
                  title="Close group"
                  style={actionBtnStyle}
                >
                  {'\u00D7'}
                </button>
              )}
            </div>
          </div>

          {/* Content area */}
          <div
            data-workspace-group-content={group.id}
            style={{ flex: 1, minHeight: 0, position: 'relative' }}
          >
            {/* Task 08 — Background decoration (Cmd+K B) */}
            {group.backgroundTabId && activeTabObj?.kind === 'editor' && (() => {
              const bgProvider = previewProviderFor?.({
                kind: 'preview',
                id: group.backgroundTabId!,
                fileId: activeTabObj.fileId,
                sourceRef: { kind: 'default' },
              })
              if (!bgProvider) return null
              return (
                <div
                  data-workspace-background={group.id}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 0,
                    opacity: 0.4,
                    pointerEvents: 'none',
                  }}
                >
                  <PreviewView
                    fileId={activeTabObj.fileId}
                    provider={bgProvider}
                    sourceRef={{ kind: 'default' }}
                    theme={theme}
                    hidden={false}
                    onSourceRefChange={() => {}}
                  />
                </div>
              )
            })()}
            {activeTabObj ? (
              <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
                {renderTabContent(activeTabObj, group.id, isShellActiveGroup)}
              </div>
            ) : (
              <div
                data-testid={`group-empty-${group.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'var(--foreground-muted)',
                  fontSize: 12,
                }}
              >
                Drop a tab here
              </div>
            )}
          </div>
        </div>
      )
    },
    [
      activeGroupId,
      groups,
      dragOverTarget,
      computeQuadrant,
      handleDropOnGroup,
      handleTabClick,
      handleTabClose,
      handleTabDragStart,
      handleSplit,
      handleCloseGroup,
      renderTabContent,
    ],
  )

  // Total group count — used to decide the "canClose" button visibility
  // across multiple groups, and to skip rendering the outer SplitPane
  // when there's only one group.
  const totalGroupCount = useMemo(
    () => allGroupIds(layout).length,
    [layout],
  )

  // Auto-promote preview tabs on first edit to the backing file. We
  // subscribe to every preview tab's workspace file; the subscription
  // fires only on real Y.Text changes (initial read state doesn't fire
  // synchronously), so the first fire is the user's first edit. We
  // promote the tab and tear down the subscription in one pass.
  const previewTabIds = useMemo(() => {
    const out: Array<{ tabId: string; fileId: string }> = []
    for (const g of groups.values()) {
      for (const t of g.tabs) {
        if (
          t.kind === 'editor' &&
          (t as { preview?: boolean }).preview === true
        ) {
          out.push({ tabId: t.id, fileId: t.fileId })
        }
      }
    }
    return out
  }, [groups])

  useEffect(() => {
    const unsubs = previewTabIds.map(({ tabId, fileId }) =>
      subscribeToWorkspaceFile(fileId, () => {
        setGroups((prev) => {
          let changed = false
          const next = new Map(prev)
          for (const [gid, g] of prev) {
            const nextTabs = g.tabs.map((t) => {
              if (t.id !== tabId) return t
              if (t.kind !== 'editor' || !(t as { preview?: boolean }).preview) return t
              changed = true
              return { ...t, preview: false }
            })
            if (changed) next.set(gid, { ...g, tabs: nextTabs })
          }
          return changed ? next : prev
        })
      }),
    )
    return () => {
      for (const u of unsubs) u()
    }
  }, [previewTabIds])

  // Expose imperative handle — lets parent call openOrFocusFile(fileId)
  // to programmatically open/focus a file's editor tab. Used by the file
  // tree sidebar so clicking a file opens its tab.
  useImperativeHandle(
    forwardedRef,
    () => ({
      openOrFocusFile: (fileId: string, options?: { preview?: boolean }) => {
        const preview = options?.preview === true
        // Search every group for an existing editor tab with this fileId.
        let foundGroupId: string | null = null
        let foundTabId: string | null = null
        for (const [gid, group] of groups) {
          const hit = group.tabs.find(
            (t) => t.kind === 'editor' && t.fileId === fileId,
          )
          if (hit) {
            foundGroupId = gid
            foundTabId = hit.id
            break
          }
        }
        if (foundGroupId && foundTabId) {
          // Existing tab — activate it. A pinned-open overrides an existing
          // preview flag by promoting the tab in the same pass.
          const targetGid = foundGroupId
          const targetTid = foundTabId
          setGroups((prev) => {
            const existing = prev.get(targetGid)
            if (!existing) return prev
            const next = new Map(prev)
            const nextTabs = existing.tabs.map((t) => {
              if (t.id !== targetTid) return t
              if (t.kind !== 'editor') return t
              if (!preview && t.preview) return { ...t, preview: false }
              return t
            })
            next.set(targetGid, {
              ...existing,
              tabs: nextTabs,
              activeTabId: targetTid,
            })
            return next
          })
          setActiveGroupId(targetGid)
          return
        }
        // No existing tab for this fileId. If this is a preview open and
        // the active group already has a preview tab, REPLACE its fileId
        // instead of appending — keeps the preview slot bounded to one.
        if (preview) {
          const existing = groups.get(activeGroupId)
          const slot = existing?.tabs.find(
            (t) => t.kind === 'editor' && (t as { preview?: boolean }).preview === true,
          )
          if (existing && slot) {
            const slotId = slot.id
            setGroups((prev) => {
              const g = prev.get(activeGroupId)
              if (!g) return prev
              const nextTabs = g.tabs.map((t) =>
                t.id === slotId && t.kind === 'editor'
                  ? { ...t, fileId, preview: true }
                  : t,
              )
              const nx = new Map(prev)
              nx.set(activeGroupId, { ...g, tabs: nextTabs, activeTabId: slotId })
              return nx
            })
            return
          }
        }
        // No slot to reuse — create a fresh tab.
        const newTab: WorkspaceTab = {
          kind: 'editor',
          id: `tab-${fileId}-${Date.now()}`,
          fileId,
          ...(preview ? { preview: true } : {}),
        }
        setGroups((prev) => {
          const existing = prev.get(activeGroupId)
          if (!existing) return prev
          const next = new Map(prev)
          next.set(activeGroupId, {
            ...existing,
            tabs: [...existing.tabs, newTab],
            activeTabId: newTab.id,
          })
          return next
        })
      },
      promoteTab: (tabId: string) => {
        setGroups((prev) => {
          let changed = false
          const next = new Map<string, typeof prev extends Map<infer K, infer V> ? V : never>()
          for (const [gid, g] of prev) {
            const nextTabs = g.tabs.map((t) => {
              if (t.id !== tabId) return t
              if (t.kind !== 'editor' || !(t as { preview?: boolean }).preview) return t
              changed = true
              return { ...t, preview: false }
            })
            next.set(gid, changed ? { ...g, tabs: nextTabs } : g)
          }
          return changed ? next : prev
        })
      },
      closeTabsForFile: (fileId: string) => {
        const targets: string[] = []
        for (const g of groups.values()) {
          for (const t of g.tabs) {
            if (
              (t.kind === 'editor' || t.kind === 'preview') &&
              t.fileId === fileId
            ) {
              targets.push(t.id)
            }
          }
        }
        for (const tid of targets) closeTabById(tid)
      },
      closeOtherTabs: (tabId: string) => {
        let ownerGroup: WorkspaceGroupState | null = null
        for (const g of groups.values()) {
          if (g.tabs.some((t) => t.id === tabId)) { ownerGroup = g; break }
        }
        if (!ownerGroup) return
        const victims = ownerGroup.tabs.filter((t) => t.id !== tabId).map((t) => t.id)
        for (const tid of victims) closeTabById(tid)
      },
      closeAllTabsInGroup: (tabId: string) => {
        let ownerGroup: WorkspaceGroupState | null = null
        for (const g of groups.values()) {
          if (g.tabs.some((t) => t.id === tabId)) { ownerGroup = g; break }
        }
        if (!ownerGroup) return
        const victims = ownerGroup.tabs.map((t) => t.id)
        for (const tid of victims) closeTabById(tid)
      },
      splitActiveGroup: (direction: 'east' | 'south' = 'east') => {
        if (!activeGroupId) return
        handleSplit(activeGroupId, direction)
      },
    }),
    [groups, activeGroupId, closeTabById, handleSplit],
  )

  return (
    <div
      ref={shellRootRef}
      data-workspace-shell="root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height,
        background: 'var(--background)',
        color: 'var(--foreground)',
        position: 'relative',
      }}
    >
      {/*
        Edge drop zones — Issue #1. Each is an absolutely positioned
        thin strip overlaid on the left and right borders of the shell.
        On drag over, they preview themselves with an accent tint; on
        drop they move the dragged tab into a brand-new group at the
        corresponding end of `groupOrder`.

        Top/bottom edge drops require vertical splits inside each group
        (nested SplitPane or a replacement layout engine). Tracked as a
        follow-up in the phase notes — not landed here.

        `pointerEvents` are only active while a drag is in progress —
        an idle drop zone is transparent to clicks so the user can
        interact with tabs near the edges normally. The DRAG_MIME check
        inside the dragover handlers means the zones also ignore
        non-tab drags (file drops, text selections).
      */}
      <div
        data-workspace-edge-drop="start"
        onDragOver={(e) => handleEdgeDragOver(e, 'start')}
        onDragLeave={handleEdgeDragLeave}
        onDrop={(e) => handleEdgeDrop(e, 'start')}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 24,
          zIndex: 10,
          pointerEvents: tabDragInProgress ? 'auto' : 'none',
          background:
            dragOverEdge === 'start'
              ? 'rgba(139,92,246,0.18)'
              : 'transparent',
          borderLeft:
            dragOverEdge === 'start'
              ? '2px solid var(--accent)'
              : '2px solid transparent',
          transition: 'background 80ms ease, border-color 80ms ease',
        }}
      />
      <div
        data-workspace-edge-drop="end"
        onDragOver={(e) => handleEdgeDragOver(e, 'end')}
        onDragLeave={handleEdgeDragLeave}
        onDrop={(e) => handleEdgeDrop(e, 'end')}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 24,
          zIndex: 10,
          pointerEvents: tabDragInProgress ? 'auto' : 'none',
          background:
            dragOverEdge === 'end'
              ? 'rgba(139,92,246,0.18)'
              : 'transparent',
          borderRight:
            dragOverEdge === 'end'
              ? '2px solid var(--accent)'
              : '2px solid transparent',
          transition: 'background 80ms ease, border-color 80ms ease',
        }}
      />
      {/*
       * 2-D layout render (Issue #1).
       *
       *   - Empty layout → a single "drop a tab here" placeholder.
       *   - Single group → rendered directly without any SplitPane
       *     wrapper (pure perf + zero-chrome for the common case).
       *   - Multi-column → outer horizontal SplitPane. Each column
       *     with one cell becomes a single group; each column with
       *     multiple cells becomes a nested vertical SplitPane.
       *
       * The nested-SplitPane key combines column index with the cell
       * ids it contains — so a vertical insert/remove inside one
       * column only unmounts that column's subtree, not the whole
       * shell.
       */}
      {totalGroupCount === 0 ? (
        <div
          data-testid="workspace-shell-empty"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--foreground-muted)',
            fontSize: 12,
          }}
        >
          Drop a tab here
        </div>
      ) : layout.length === 1 && layout[0].length === 1 ? (
        (() => {
          const g = groups.get(layout[0][0])
          return g ? renderGroup(g) : null
        })()
      ) : (
        <SplitPane direction="horizontal">
          {layout.map((column, colIdx) => {
            if (column.length === 1) {
              const g = groups.get(column[0])
              return (
                <React.Fragment key={`col-${colIdx}-${column[0]}`}>
                  {g ? renderGroup(g) : null}
                </React.Fragment>
              )
            }
            return (
              <SplitPane
                key={`col-${colIdx}-${column.join('+')}`}
                direction="vertical"
              >
                {column.map((gid) => {
                  const g = groups.get(gid)
                  return (
                    <React.Fragment key={gid}>
                      {g ? renderGroup(g) : null}
                    </React.Fragment>
                  )
                })}
              </SplitPane>
            )
          })}
        </SplitPane>
      )}

      {/*
       * Guide line overlay — a shell-level element that previews where
       * the dragged tab will land. Positioned in screen coordinates by
       * reading the hovered group's DOM rect. Only visible during a
       * tab drag AND when the cursor is over a known group quadrant.
       *
       * The overlay is a child of the shell root (absolutely positioned
       * with inset styles), so it layers above every group but below
       * any portal UI. `pointerEvents: none` so it never captures the
       * drag events that drive it.
       */}
      {tabDragInProgress && dragOverTarget && (
        <QuadrantGuideOverlay
          target={dragOverTarget}
          shellRootRef={shellRootRef}
        />
      )}
    </div>
  )
})

/**
 * Shell-level overlay that draws a translucent rectangle showing where
 * a directional drop will land. Reads the target group's DOM rect via
 * `document.querySelector` (by its `data-workspace-group` attribute)
 * and computes a child rectangle covering the corresponding half
 * (N/S/E/W) or full group body (center).
 *
 * Pure DOM math, no React state beyond the prop — re-renders on every
 * `target` change because the parent passes a new object identity for
 * each dragover hit.
 */
function QuadrantGuideOverlay({
  target,
  shellRootRef,
}: {
  target: { groupId: string; direction: DropDirection }
  shellRootRef: React.RefObject<HTMLDivElement | null>
}): React.ReactElement | null {
  const shell = shellRootRef.current
  if (!shell) return null
  const groupEl = shell.querySelector<HTMLElement>(
    `[data-workspace-group="${target.groupId}"]`,
  )
  if (!groupEl) return null

  const shellRect = shell.getBoundingClientRect()
  const groupRect = groupEl.getBoundingClientRect()
  // Offsets relative to the shell root (the overlay's positioning
  // context). Avoids picking up the window's scroll position.
  const relLeft = groupRect.left - shellRect.left
  const relTop = groupRect.top - shellRect.top
  const w = groupRect.width
  const h = groupRect.height

  // Compute the overlay sub-rect based on the drop direction.
  let x = relLeft
  let y = relTop
  let width = w
  let height = h
  switch (target.direction) {
    case 'west':
      width = w / 2
      break
    case 'east':
      x = relLeft + w / 2
      width = w / 2
      break
    case 'north':
      height = h / 2
      break
    case 'south':
      y = relTop + h / 2
      height = h / 2
      break
    case 'center':
      // full group; x/y/width/height already set above
      break
  }

  return (
    <div
      data-workspace-guide-overlay={target.direction}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        zIndex: 20,
        pointerEvents: 'none',
        background: 'rgba(139,92,246,0.2)',
        border: '2px solid var(--accent)',
        borderRadius: 2,
        transition: 'left 60ms ease, top 60ms ease, width 60ms ease, height 60ms ease',
      }}
    />
  )
}

// Shared button styles — duplicated from the legacy EditorGroup's look
// without importing so the shell has zero dependencies on the old file.
const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--foreground-muted)',
  cursor: 'pointer',
  fontSize: 11,
  padding: '0 2px',
  lineHeight: 1,
}

const actionBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--foreground-muted)',
  cursor: 'pointer',
  fontSize: 11,
  padding: '2px 4px',
  lineHeight: 1,
  borderRadius: 2,
}

