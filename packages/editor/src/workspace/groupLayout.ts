/**
 * groupLayout — pure functions for the 2D workspace group layout.
 *
 * The workspace shell arranges editor/preview groups into a two-level
 * grid: an outer horizontal row of **columns**, and each column is a
 * vertical stack of **cells** (groups). This shape gives the user four
 * drop targets per group (N/S/E/W) while staying simple enough to
 * render as a top-level horizontal `SplitPane` whose children are
 * either a leaf group or a nested vertical `SplitPane`.
 *
 * @remarks
 * ## Why a 2-level grid and not a full tree
 *
 * VS Code's layout engine is a full recursive tree — each node can be
 * a horizontal split OR vertical split OR leaf, nested arbitrarily
 * deep. That supports layouts like "split left, then split the left
 * column vertically, then split the top of that horizontally again."
 *
 * For Phase 10.2 we need N/S/E/W drops from any group but not the
 * arbitrary nesting. The 2-level model (columns of cells) covers the
 * common case:
 *
 *     ┌──────┬──────┬──────┐
 *     │      │  B   │      │
 *     │  A   ├──────┤  D   │
 *     │      │  C   │      │
 *     └──────┴──────┴──────┘
 *
 * Column 0 = [A], column 1 = [B, C], column 2 = [D].
 *
 * If a future phase needs recursive nesting, this module's external
 * API (insertGroup, removeGroup, findGroupCoords) stays mostly the
 * same — only the internal representation changes.
 *
 * ## Why pure functions in a separate module
 *
 * The shell's React reducer is already crowded with state updaters.
 * Keeping the layout arithmetic pure and module-level:
 *
 *   1. Lets tests exercise every transition without a React harness.
 *   2. Avoids stale-closure bugs inside setState callbacks — every
 *      function takes the full layout and returns a new one.
 *   3. Makes the invariant "no group id appears twice in the layout"
 *      checkable in one place.
 *
 * Every function returns a NEW array (never mutates input). The shell
 * passes the result straight to `setLayout`.
 */

/**
 * One column is a vertical stack of group ids. `[g1]` is a column with
 * one cell; `[g1, g2]` stacks g1 on top of g2. Empty columns are not
 * allowed — `removeGroup` collapses them away.
 */
export type LayoutColumn = readonly string[]

/**
 * The shell's full 2-D layout: an ordered list of columns arranged
 * left-to-right at the horizontal level. An empty root layout (`[]`)
 * means "no groups at all" and the shell renders a drop-target
 * placeholder.
 */
export type GroupLayout = readonly LayoutColumn[]

/**
 * Drop direction relative to a target group. `'center'` is the
 * existing "drop on group, add as tab" behavior; the four directional
 * values create new groups in the corresponding location.
 */
export type DropDirection = 'west' | 'east' | 'north' | 'south' | 'center'

/**
 * Locate a group in the 2-D layout. Returns `[columnIndex, cellIndex]`
 * or `null` if not found. The first match wins (no group id should
 * appear twice, but the function doesn't assert this — callers that
 * care can verify via `countOccurrences`).
 */
export function findGroupCoords(
  layout: GroupLayout,
  groupId: string,
): [number, number] | null {
  for (let c = 0; c < layout.length; c++) {
    const column = layout[c]
    const r = column.indexOf(groupId)
    if (r !== -1) return [c, r]
  }
  return null
}

/**
 * Count how many times a group id appears in the layout. Used by tests
 * as an invariant check — should always be 0 or 1.
 */
export function countOccurrences(
  layout: GroupLayout,
  groupId: string,
): number {
  let n = 0
  for (const col of layout) {
    for (const id of col) {
      if (id === groupId) n++
    }
  }
  return n
}

/**
 * All group ids in the layout, flattened in reading order (left-to-
 * right, top-to-bottom per column). Useful for validation and for
 * the shell's "is this group still alive?" checks.
 */
export function allGroupIds(layout: GroupLayout): string[] {
  const out: string[] = []
  for (const col of layout) {
    for (const id of col) out.push(id)
  }
  return out
}

/**
 * Insert a new group adjacent to an existing one. If `direction` is
 * `'center'` this is a no-op and returns the input unchanged — the
 * caller should have routed to its own "add tab to target group" path
 * for that case.
 *
 *   - `'west'` / `'east'` — the new group gets its OWN column,
 *     inserted to the left or right of the target's column. The new
 *     column has a single cell containing `newId`.
 *   - `'north'` / `'south'` — the new group is stacked above or
 *     below the target inside the target's existing column.
 *
 * Returns the input unchanged if the target group isn't found.
 */
export function insertGroup(
  layout: GroupLayout,
  targetId: string,
  direction: DropDirection,
  newId: string,
): GroupLayout {
  if (direction === 'center') return layout
  const coords = findGroupCoords(layout, targetId)
  if (!coords) return layout
  const [c, r] = coords

  if (direction === 'west' || direction === 'east') {
    const newCol: LayoutColumn = [newId]
    const insertAt = direction === 'west' ? c : c + 1
    return [
      ...layout.slice(0, insertAt),
      newCol,
      ...layout.slice(insertAt),
    ]
  }

  // north / south — insert into the target's column above or below.
  const targetColumn = layout[c]
  const insertAt = direction === 'north' ? r : r + 1
  const nextColumn: LayoutColumn = [
    ...targetColumn.slice(0, insertAt),
    newId,
    ...targetColumn.slice(insertAt),
  ]
  return layout.map((col, i) => (i === c ? nextColumn : col))
}

/**
 * Insert a new group at the leftmost or rightmost edge of the layout,
 * as its own column. Used by the shell's outer edge drop zones so the
 * user can drag a tab past every existing column to spawn a new one.
 */
export function insertEdgeGroup(
  layout: GroupLayout,
  position: 'start' | 'end',
  newId: string,
): GroupLayout {
  const newCol: LayoutColumn = [newId]
  return position === 'start' ? [newCol, ...layout] : [...layout, newCol]
}

/**
 * Remove a group from the layout. Empty columns (after removal) are
 * collapsed away so the rendered SplitPane doesn't have 0-width panes.
 * No-op if the group isn't in the layout.
 */
export function removeGroup(
  layout: GroupLayout,
  groupId: string,
): GroupLayout {
  const coords = findGroupCoords(layout, groupId)
  if (!coords) return layout
  const [c] = coords
  const nextColumn = layout[c].filter((id) => id !== groupId)
  if (nextColumn.length === 0) {
    // Column collapsed — drop it entirely.
    return layout.filter((_, i) => i !== c)
  }
  return layout.map((col, i) => (i === c ? nextColumn : col))
}

/**
 * True if the layout has zero groups (used for empty-shell placeholder
 * rendering) or exactly one group (used by renderers that want to skip
 * the outer SplitPane wrapper to avoid a useless container).
 */
export function groupCount(layout: GroupLayout): number {
  return allGroupIds(layout).length
}

/**
 * True if the layout has any column with more than one cell (i.e., at
 * least one vertical split). Used to decide whether to render a nested
 * vertical SplitPane inside each column.
 */
export function hasVerticalSplits(layout: GroupLayout): boolean {
  return layout.some((col) => col.length > 1)
}
