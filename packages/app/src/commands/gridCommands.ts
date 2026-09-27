/**
 * The grids' keys as commands (#1801).
 *
 * The piano roll and sequencer live in the editor package, which cannot import
 * this registry, so the editor describes their gestures (`GRID_GESTURES`) and
 * this module plugs them in, the way `musicalTimeline/clipGestures.ts` does for
 * the Song timeline:
 *
 * - each gesture is a SCOPED command, so it is listed in Settings → Keyboard
 *   Shortcuts under its grid, can be rebound, and is never run by the global
 *   dispatcher;
 * - each grid's scope handler runs the gesture in whichever grid is mounted
 *   (the palette's "can run" is a dry run there);
 * - the grids ask `matchScopedCommand` which gesture a keystroke means, so a
 *   rebind made in Settings reaches them.
 *
 * Installed at module load by `StaveApp`. Without it a grid still answers to
 * its default keys (the editor matches them itself), it just isn't listed or
 * rebindable.
 */

import {
  GRID_GESTURES,
  GRID_SCOPE,
  GRID_SCOPE_LABEL,
  runGridGesture,
  setGridKeyMatcher,
} from '@stave/editor'
import { registerCommand, scopedCommand, setScopeHandler } from './registry'
import { matchScopedCommand } from './keybindings'

for (const { scope, ...g } of GRID_GESTURES) {
  const { category, where } = GRID_SCOPE_LABEL[scope]
  registerCommand(scopedCommand({ ...g, category, description: where, scope }))
}

for (const scope of Object.values(GRID_SCOPE)) {
  setScopeHandler(scope, {
    canRun: (id) => runGridGesture(scope, id, true),
    run: (id) => runGridGesture(scope, id, false),
  })
}

setGridKeyMatcher((scope, e) => matchScopedCommand(scope, e)?.id)
