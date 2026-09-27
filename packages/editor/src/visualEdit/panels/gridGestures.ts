/**
 * The grids' keys as commands (#1801).
 *
 * A panel's keys are commands you can see in Settings → Keyboard Shortcuts,
 * rebind, and run from the palette, and they answer only while that panel has
 * focus (#1795, #1797). The command registry lives in the app, which this
 * package cannot import, so the grids meet it through this module instead:
 *
 * - `GRID_GESTURES` names each gesture — its id, the grid it belongs to, and
 *   its default keys. The app registers exactly these, so the list in Settings
 *   and the keys the grids answer to come from one table.
 * - The host calls `setGridKeyMatcher` with its own matcher (the registry's
 *   `matchScopedCommand`), so a rebind made in Settings reaches the grid. With
 *   no host matcher — component tests, any other host — a grid matches the
 *   defaults below through the one chord builder, and keeps working.
 * - A mounted grid installs what its gestures do with `mountGridGestures`;
 *   `runGridGesture` runs one there, or dry-runs it to ask whether it applies
 *   now (the palette offers a gesture only when it does).
 */

import { chordFromEvent, chordMatches } from '../../keys/chord'

export const GRID_SCOPE = {
  pianoRoll: 'pianoRoll',
  sequencer: 'sequencer',
} as const

export type GridScope = (typeof GRID_SCOPE)[keyof typeof GRID_SCOPE]

/**
 * What a grid gesture does. Each grid decides what that means on its own model:
 * `toggle` is what a click on the cursor cell does, `remove` takes away the note
 * under the cursor (the roll's Delete, the sequencer's Clear Step).
 */
export type GridAction =
  | CursorMove
  | 'toggle'
  | 'remove'
  | 'copy'
  | 'paste'

/** Where a cursor key sends the cursor. */
export type CursorMove = 'left' | 'right' | 'up' | 'down' | 'rowStart' | 'rowEnd' | 'first' | 'last'

export const GRID_GESTURE = {
  rollDelete: 'stave.pianoRoll.deleteNote',
  rollCopy: 'stave.pianoRoll.copyNote',
  rollPaste: 'stave.pianoRoll.pasteNote',
  rollToggle: 'stave.pianoRoll.toggleNote',
  rollLeft: 'stave.pianoRoll.cursorLeft',
  rollRight: 'stave.pianoRoll.cursorRight',
  rollUp: 'stave.pianoRoll.cursorUp',
  rollDown: 'stave.pianoRoll.cursorDown',
  rollRowStart: 'stave.pianoRoll.cursorRowStart',
  rollRowEnd: 'stave.pianoRoll.cursorRowEnd',
  rollFirst: 'stave.pianoRoll.cursorFirst',
  rollLast: 'stave.pianoRoll.cursorLast',
  seqToggle: 'stave.sequencer.toggleStep',
  seqClear: 'stave.sequencer.clearStep',
  seqLeft: 'stave.sequencer.cursorLeft',
  seqRight: 'stave.sequencer.cursorRight',
  seqUp: 'stave.sequencer.cursorUp',
  seqDown: 'stave.sequencer.cursorDown',
  seqRowStart: 'stave.sequencer.cursorRowStart',
  seqRowEnd: 'stave.sequencer.cursorRowEnd',
  seqFirst: 'stave.sequencer.cursorFirst',
  seqLast: 'stave.sequencer.cursorLast',
} as const

export type GridGestureId = (typeof GRID_GESTURE)[keyof typeof GRID_GESTURE]

export interface GridGestureDef {
  id: GridGestureId
  scope: GridScope
  action: GridAction
  title: string
  keybinding: string
  alternateKeybindings?: readonly string[]
}

/**
 * The cursor keys, the same in both grids. Arrows are Logic Pro 12.3's Step
 * Sequencer defaults (`Select Next Step` | `Right Arrow`, `Select Step Above` |
 * `Up Arrow`); Home/End and ⌘Home/⌘End are the ARIA grid pattern's (Logic has
 * no equivalent).
 */
function cursorKeys(
  scope: GridScope,
  ids: Record<CursorMove, GridGestureId>,
): GridGestureDef[] {
  const keys: Array<[CursorMove, string, string]> = [
    ['left', 'Move cursor left', 'arrowleft'],
    ['right', 'Move cursor right', 'arrowright'],
    ['up', 'Move cursor up', 'arrowup'],
    ['down', 'Move cursor down', 'arrowdown'],
    ['rowStart', 'Move cursor to the start of the row', 'home'],
    ['rowEnd', 'Move cursor to the end of the row', 'end'],
    ['first', 'Move cursor to the first cell', 'mod+home'],
    ['last', 'Move cursor to the last cell', 'mod+end'],
  ]
  return keys.map(([action, title, keybinding]) => ({ id: ids[action], scope, action, title, keybinding }))
}

/**
 * The roll's Delete/⌘C/⌘V are the keys it has always answered to; a Mac
 * keyboard's delete key sends `Backspace`, so delete takes both. Toggle is Logic
 * 12.3's `Toggle Selected Step` | `Apostrophe`, with Enter beside it. Space is
 * NOT a toggle: in Logic it is Play or Stop.
 */
export const GRID_GESTURES: readonly GridGestureDef[] = [
  {
    id: GRID_GESTURE.rollDelete,
    scope: GRID_SCOPE.pianoRoll,
    action: 'remove',
    title: 'Delete selected note',
    keybinding: 'delete',
    alternateKeybindings: ['backspace'],
  },
  {
    id: GRID_GESTURE.rollCopy,
    scope: GRID_SCOPE.pianoRoll,
    action: 'copy',
    title: 'Copy selected note',
    keybinding: 'mod+c',
  },
  {
    id: GRID_GESTURE.rollPaste,
    scope: GRID_SCOPE.pianoRoll,
    action: 'paste',
    title: 'Paste note at selected cell',
    keybinding: 'mod+v',
  },
  {
    id: GRID_GESTURE.rollToggle,
    scope: GRID_SCOPE.pianoRoll,
    action: 'toggle',
    title: 'Add or remove a note at the cursor',
    keybinding: "'",
    alternateKeybindings: ['enter'],
  },
  ...cursorKeys(GRID_SCOPE.pianoRoll, {
    left: GRID_GESTURE.rollLeft,
    right: GRID_GESTURE.rollRight,
    up: GRID_GESTURE.rollUp,
    down: GRID_GESTURE.rollDown,
    rowStart: GRID_GESTURE.rollRowStart,
    rowEnd: GRID_GESTURE.rollRowEnd,
    first: GRID_GESTURE.rollFirst,
    last: GRID_GESTURE.rollLast,
  }),
  {
    id: GRID_GESTURE.seqToggle,
    scope: GRID_SCOPE.sequencer,
    action: 'toggle',
    title: 'Turn the step at the cursor on or off',
    keybinding: "'",
    alternateKeybindings: ['enter'],
  },
  // Logic 12.3: `Clear Step` | `Control-Delete`. Delete and ⌫ as well, because on
  // this grid removing the hit under the cursor and clearing the step are one edit.
  {
    id: GRID_GESTURE.seqClear,
    scope: GRID_SCOPE.sequencer,
    action: 'remove',
    title: 'Clear the step at the cursor',
    keybinding: 'delete',
    alternateKeybindings: ['backspace', 'ctrl+backspace'],
  },
  ...cursorKeys(GRID_SCOPE.sequencer, {
    left: GRID_GESTURE.seqLeft,
    right: GRID_GESTURE.seqRight,
    up: GRID_GESTURE.seqUp,
    down: GRID_GESTURE.seqDown,
    rowStart: GRID_GESTURE.seqRowStart,
    rowEnd: GRID_GESTURE.seqRowEnd,
    first: GRID_GESTURE.seqFirst,
    last: GRID_GESTURE.seqLast,
  }),
]

const BY_ID = new Map<string, GridGestureDef>(GRID_GESTURES.map((g) => [g.id, g]))

/** What a gesture of `scope` does, or undefined for an id that is not one. */
export function gridGestureAction(scope: GridScope, id: string): GridAction | undefined {
  const g = BY_ID.get(id)
  return g && g.scope === scope ? g.action : undefined
}

/** A cell position: `row` top to bottom, `col` left to right. */
export interface GridCell {
  row: number
  col: number
}

/**
 * Where a cursor key moves the cursor on a `rows` × `cols` grid. Clamped at the
 * edges — it never wraps, so holding → stops at the last step instead of
 * jumping to the next row.
 */
export function moveCursor(at: GridCell, move: CursorMove, rows: number, cols: number): GridCell {
  const clamp = (v: number, n: number): number => Math.max(0, Math.min(n - 1, v))
  switch (move) {
    case 'left':
      return { row: at.row, col: clamp(at.col - 1, cols) }
    case 'right':
      return { row: at.row, col: clamp(at.col + 1, cols) }
    case 'up':
      return { row: clamp(at.row - 1, rows), col: at.col }
    case 'down':
      return { row: clamp(at.row + 1, rows), col: at.col }
    case 'rowStart':
      return { row: at.row, col: 0 }
    case 'rowEnd':
      return { row: at.row, col: Math.max(0, cols - 1) }
    case 'first':
      return { row: 0, col: 0 }
    case 'last':
      return { row: Math.max(0, rows - 1), col: Math.max(0, cols - 1) }
  }
}

/** Is `action` a cursor move? */
export function isCursorMove(action: GridAction): action is CursorMove {
  return action !== 'toggle' && action !== 'remove' && action !== 'copy' && action !== 'paste'
}

/** Settings' group name and "where it works" line, per grid. */
export const GRID_SCOPE_LABEL: Record<GridScope, { category: string; where: string }> = {
  pianoRoll: { category: 'Piano roll', where: 'In the piano roll, on the selected cell' },
  sequencer: { category: 'Sequencer', where: 'In the sequencer, on the selected cell' },
}

/** Which gesture of `scope` a keystroke is bound to, if any. */
export type GridKeyMatcher = (scope: GridScope, e: KeyboardEvent) => string | undefined

function matchDefaults(scope: GridScope, e: KeyboardEvent): string | undefined {
  const chord = chordFromEvent(e)
  for (const g of GRID_GESTURES) {
    if (g.scope !== scope) continue
    if ([g.keybinding, ...(g.alternateKeybindings ?? [])].some((b) => chordMatches(chord, b))) return g.id
  }
  return undefined
}

let matcher: GridKeyMatcher = matchDefaults

/**
 * Install the host's matcher. Returns a release that restores the defaults,
 * only if this matcher is still the installed one.
 */
export function setGridKeyMatcher(fn: GridKeyMatcher): () => void {
  matcher = fn
  return () => {
    if (matcher === fn) matcher = matchDefaults
  }
}

/** What a keystroke in `scope`'s grid is bound to do, if anything. */
export function matchGridKey(scope: GridScope, e: KeyboardEvent): GridAction | undefined {
  const id = matcher(scope, e)
  return id ? gridGestureAction(scope, id) : undefined
}

/**
 * What a mounted grid does for one action. With `dryRun` it only answers
 * whether the action applies now; otherwise it acts and answers whether it did.
 */
export type GridGestureRunner = (action: GridAction, dryRun: boolean) => boolean

const mounted = new Map<GridScope, GridGestureRunner>()

/**
 * Install the mounted grid's runner for `scope`. Returns a release that only
 * removes THIS runner, so a remount that installed a newer one first keeps it.
 */
export function mountGridGestures(scope: GridScope, run: GridGestureRunner): () => void {
  mounted.set(scope, run)
  return () => {
    if (mounted.get(scope) === run) mounted.delete(scope)
  }
}

/** Run (or dry-run) a gesture in `scope`'s mounted grid. False when none is mounted. */
export function runGridGesture(scope: GridScope, id: string, dryRun: boolean): boolean {
  const action = gridGestureAction(scope, id)
  if (!action) return false
  return mounted.get(scope)?.(action, dryRun) ?? false
}
