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

export const GRID_GESTURE = {
  rollDelete: 'stave.pianoRoll.deleteNote',
  rollCopy: 'stave.pianoRoll.copyNote',
  rollPaste: 'stave.pianoRoll.pasteNote',
} as const

export type GridGestureId = (typeof GRID_GESTURE)[keyof typeof GRID_GESTURE]

export interface GridGestureDef {
  id: GridGestureId
  scope: GridScope
  title: string
  keybinding: string
  alternateKeybindings?: readonly string[]
}

/**
 * The defaults are the keys the roll has always answered to. A Mac keyboard's
 * delete key sends `Backspace`, so delete takes both. The sequencer has no keys
 * yet — its first ones arrive with the grid cursor (#1802).
 */
export const GRID_GESTURES: readonly GridGestureDef[] = [
  {
    id: GRID_GESTURE.rollDelete,
    scope: GRID_SCOPE.pianoRoll,
    title: 'Delete selected note',
    keybinding: 'delete',
    alternateKeybindings: ['backspace'],
  },
  { id: GRID_GESTURE.rollCopy, scope: GRID_SCOPE.pianoRoll, title: 'Copy selected note', keybinding: 'mod+c' },
  {
    id: GRID_GESTURE.rollPaste,
    scope: GRID_SCOPE.pianoRoll,
    title: 'Paste note at selected cell',
    keybinding: 'mod+v',
  },
]

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

/** The gesture a keystroke in `scope`'s grid is bound to, if any. */
export function matchGridKey(scope: GridScope, e: KeyboardEvent): GridGestureId | undefined {
  const id = matcher(scope, e)
  return id && isGridGestureId(id) ? id : undefined
}

const IDS = new Set<string>(Object.values(GRID_GESTURE))

export function isGridGestureId(id: string): id is GridGestureId {
  return IDS.has(id)
}

/**
 * What a mounted grid does for one gesture. With `dryRun` it only answers
 * whether the gesture applies now; otherwise it acts and answers whether it did.
 */
export type GridGestureRunner = (id: GridGestureId, dryRun: boolean) => boolean

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
  if (!isGridGestureId(id)) return false
  return mounted.get(scope)?.(id, dryRun) ?? false
}
