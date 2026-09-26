/**
 * The Song timeline's clip gestures as commands (#1562).
 *
 * Before this, each gesture was a character hardcoded in `FullSongTimeline`'s
 * grid key handler: none was listed in Settings → Keyboard Shortcuts, none could
 * be rebound, and for most of them the key was the only way in. Registering them
 * here puts them in the shortcuts list and the palette; the grid reads its keys
 * back through `matchScopedCommand`, so a rebind reaches it.
 *
 * They are SCOPED (#1795): the global dispatcher never runs them, so `S`, `P` or
 * Delete pressed anywhere but the focused timeline does nothing.
 *
 * Registered at module load. `FullSongTimeline` imports this module, so the
 * commands exist whenever the timeline's code does — in the app (StaveApp →
 * MusicalTimeline → FullSongTimeline, all static imports) and in any component
 * test that renders the timeline. A registration done by a host instead would
 * leave a timeline mounted without it deaf to every key.
 */

import { registerCommand, scopedCommand } from '../../commands/registry'

export const SONG_TIMELINE_SCOPE = 'songTimeline'

export const CLIP_GESTURE = {
  duplicate: 'stave.timeline.duplicateSection',
  split: 'stave.timeline.splitSection',
  delete: 'stave.timeline.deleteSection',
  rippleDelete: 'stave.timeline.rippleDeleteSection',
  insert: 'stave.timeline.insertSection',
  rename: 'stave.timeline.renameSection',
  pointAtPart: 'stave.timeline.pointSectionAtPart',
} as const

export type ClipGestureId = (typeof CLIP_GESTURE)[keyof typeof CLIP_GESTURE]

const IDS = new Set<string>(Object.values(CLIP_GESTURE))

export function isClipGestureId(id: string): id is ClipGestureId {
  return IDS.has(id)
}

interface ClipGestureDef {
  id: ClipGestureId
  title: string
  keybinding: string
  alternateKeybindings?: readonly string[]
}

/**
 * The defaults are the keys the timeline has always answered to, so nobody's
 * hands have to relearn anything. Where two keys did the same thing, both stay:
 * a Mac keyboard's delete key sends `Backspace`, and rename answers to F2 (the
 * platform's rename key) and Enter (what people reach for on a selected thing).
 */
export const CLIP_GESTURES: readonly ClipGestureDef[] = [
  { id: CLIP_GESTURE.duplicate, title: 'Duplicate section', keybinding: 'mod+d' },
  { id: CLIP_GESTURE.split, title: 'Split section in two', keybinding: 's' },
  {
    id: CLIP_GESTURE.delete,
    title: 'Delete section (leave a gap)',
    keybinding: 'delete',
    alternateKeybindings: ['backspace'],
  },
  {
    id: CLIP_GESTURE.rippleDelete,
    title: 'Ripple delete section (the song gets shorter)',
    keybinding: 'mod+shift+backspace',
    alternateKeybindings: ['mod+shift+delete'],
  },
  { id: CLIP_GESTURE.insert, title: 'Insert an empty section after', keybinding: 'mod+i' },
  {
    id: CLIP_GESTURE.rename,
    title: 'Rename section',
    keybinding: 'f2',
    alternateKeybindings: ['enter'],
  },
  { id: CLIP_GESTURE.pointAtPart, title: 'Point section at a different part', keybinding: 'p' },
]

/**
 * Whether a host offers any keyed clip gesture. Keyed by `ClipGestureId`, so a
 * caller building the record must name every gesture — the selectability gate
 * that used to list handlers by hand shipped three gestures that were missing
 * from it (#1561).
 */
export function offersAnyClipGesture(handlers: Record<ClipGestureId, unknown>): boolean {
  return Object.values(handlers).some(Boolean)
}

export const SONG_TIMELINE_CATEGORY = 'Song timeline'
const WHERE = 'On the Song timeline, with a section selected'

for (const g of CLIP_GESTURES) {
  registerCommand(
    scopedCommand({
      ...g,
      category: SONG_TIMELINE_CATEGORY,
      description: WHERE,
      scope: SONG_TIMELINE_SCOPE,
    }),
  )
}
