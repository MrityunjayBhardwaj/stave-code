import { afterEach, describe, expect, it } from 'vitest'
import {
  GRID_GESTURE,
  GRID_GESTURES,
  GRID_SCOPE,
  gridGestureAction,
  matchGridKey,
  mountGridGestures,
  moveCursor,
  runGridGesture,
  setGridKeyMatcher,
} from '../gridGestures'

// #1801 — the bridge between the editor's grids and the host's command registry.

function key(k: string, code: string, mods: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: k, code, ...mods })
}

const release: Array<() => void> = []
afterEach(() => {
  while (release.length) release.pop()!()
})

describe('matchGridKey with no host matcher (the defaults)', () => {
  it('matches the roll defaults exactly, modifiers included', () => {
    const r = GRID_SCOPE.pianoRoll
    expect(matchGridKey(r, key('Delete', 'Delete'))).toBe('remove')
    expect(matchGridKey(r, key('Backspace', 'Backspace'))).toBe('remove')
    expect(matchGridKey(r, key('c', 'KeyC', { metaKey: true }))).toBe('copy')
    expect(matchGridKey(r, key('v', 'KeyV', { metaKey: true }))).toBe('paste')
    expect(matchGridKey(r, key("'", 'Quote'))).toBe('toggle')
    expect(matchGridKey(r, key('Enter', 'Enter'))).toBe('toggle')
    expect(matchGridKey(r, key('ArrowRight', 'ArrowRight'))).toBe('right')
    expect(matchGridKey(r, key('Home', 'Home', { metaKey: true }))).toBe('first')
    // Space is Play or Stop in Logic, never a toggle here.
    expect(matchGridKey(r, key(' ', 'Space'))).toBeUndefined()
    expect(matchGridKey(r, key('c', 'KeyC'))).toBeUndefined()
    // ⌥⌫ is not delete, ⌘⇧C is Chrome's element picker (#1425).
    expect(matchGridKey(r, key('Backspace', 'Backspace', { altKey: true }))).toBeUndefined()
    expect(matchGridKey(r, key('C', 'KeyC', { metaKey: true, shiftKey: true }))).toBeUndefined()
  })

  it("matches the sequencer's own keys, Clear Step included", () => {
    const q = GRID_SCOPE.sequencer
    expect(matchGridKey(q, key('Delete', 'Delete'))).toBe('remove')
    expect(matchGridKey(q, key("'", 'Quote'))).toBe('toggle')
    expect(matchGridKey(q, key('ArrowUp', 'ArrowUp'))).toBe('up')
    // No copy/paste in the sequencer.
    expect(matchGridKey(q, key('c', 'KeyC', { metaKey: true }))).toBeUndefined()
  })

  it("an id is only its own grid's", () => {
    expect(gridGestureAction(GRID_SCOPE.pianoRoll, GRID_GESTURE.rollDelete)).toBe('remove')
    expect(gridGestureAction(GRID_SCOPE.sequencer, GRID_GESTURE.rollDelete)).toBeUndefined()
  })

  it('declares every gesture once', () => {
    expect(new Set(GRID_GESTURES.map((g) => g.id)).size).toBe(GRID_GESTURES.length)
    expect(GRID_GESTURES.map((g) => g.id).sort()).toEqual(Object.values(GRID_GESTURE).sort())
  })
})

describe('setGridKeyMatcher', () => {
  it('replaces the defaults, and its release restores them', () => {
    const off = setGridKeyMatcher((_scope, e) => (e.key === 'x' ? GRID_GESTURE.rollDelete : undefined))
    expect(matchGridKey(GRID_SCOPE.pianoRoll, key('x', 'KeyX'))).toBe('remove')
    expect(matchGridKey(GRID_SCOPE.pianoRoll, key('Delete', 'Delete'))).toBeUndefined()
    off()
    expect(matchGridKey(GRID_SCOPE.pianoRoll, key('Delete', 'Delete'))).toBe('remove')
  })

  it('drops an id that is not a grid gesture', () => {
    release.push(setGridKeyMatcher(() => 'stave.timeline.splitSection'))
    expect(matchGridKey(GRID_SCOPE.pianoRoll, key('s', 'KeyS'))).toBeUndefined()
  })

  it("a stale release leaves a newer matcher in place", () => {
    const offA = setGridKeyMatcher(() => GRID_GESTURE.rollCopy)
    release.push(setGridKeyMatcher(() => GRID_GESTURE.rollPaste))
    offA()
    expect(matchGridKey(GRID_SCOPE.pianoRoll, key('q', 'KeyQ'))).toBe('paste')
  })
})

describe('runGridGesture', () => {
  it('reaches the mounted grid, passing the dry run through', () => {
    const calls: Array<[string, boolean]> = []
    release.push(
      mountGridGestures(GRID_SCOPE.pianoRoll, (id, dryRun) => {
        calls.push([id, dryRun])
        return !dryRun
      }),
    )
    expect(runGridGesture(GRID_SCOPE.pianoRoll, GRID_GESTURE.rollCopy, true)).toBe(false)
    expect(runGridGesture(GRID_SCOPE.pianoRoll, GRID_GESTURE.rollCopy, false)).toBe(true)
    expect(calls).toEqual([
      ['copy', true],
      ['copy', false],
    ])
  })

  it('is false with no grid mounted, in another scope, or for a foreign id', () => {
    expect(runGridGesture(GRID_SCOPE.pianoRoll, GRID_GESTURE.rollDelete, false)).toBe(false)
    release.push(mountGridGestures(GRID_SCOPE.pianoRoll, () => true))
    expect(runGridGesture(GRID_SCOPE.sequencer, GRID_GESTURE.rollDelete, false)).toBe(false)
    expect(runGridGesture(GRID_SCOPE.pianoRoll, 'stave.timeline.splitSection', false)).toBe(false)
  })

  it("an unmount's stale release keeps a newer mount", () => {
    const offOld = mountGridGestures(GRID_SCOPE.pianoRoll, () => false)
    release.push(mountGridGestures(GRID_SCOPE.pianoRoll, () => true))
    offOld()
    expect(runGridGesture(GRID_SCOPE.pianoRoll, GRID_GESTURE.rollDelete, false)).toBe(true)
  })
})

describe('note edits (#1803)', () => {
  it("are Logic 12.3's ⌥ arrows in the roll; the sequencer gets length only", () => {
    const r = GRID_SCOPE.pianoRoll
    const s = GRID_SCOPE.sequencer
    expect(matchGridKey(r, key('ArrowRight', 'ArrowRight', { altKey: true }))).toBe('nudgeRight')
    expect(matchGridKey(r, key('ArrowLeft', 'ArrowLeft', { altKey: true }))).toBe('nudgeLeft')
    expect(matchGridKey(r, key('ArrowUp', 'ArrowUp', { altKey: true }))).toBe('rowUp')
    expect(matchGridKey(r, key('ArrowDown', 'ArrowDown', { altKey: true }))).toBe('rowDown')
    expect(matchGridKey(r, key('ArrowUp', 'ArrowUp', { altKey: true, shiftKey: true }))).toBe('octaveUp')
    expect(matchGridKey(r, key('ArrowDown', 'ArrowDown', { altKey: true, shiftKey: true }))).toBe('octaveDown')
    expect(matchGridKey(r, key('ArrowRight', 'ArrowRight', { altKey: true, shiftKey: true }))).toBe('longer')
    expect(matchGridKey(r, key('ArrowLeft', 'ArrowLeft', { altKey: true, shiftKey: true }))).toBe('shorter')
    expect(matchGridKey(s, key('ArrowRight', 'ArrowRight', { altKey: true, shiftKey: true }))).toBe('longer')
    expect(matchGridKey(s, key('ArrowLeft', 'ArrowLeft', { altKey: true, shiftKey: true }))).toBe('shorter')
    // No move in the sequencer: ⌥→ is not one of its keys.
    expect(matchGridKey(s, key('ArrowRight', 'ArrowRight', { altKey: true }))).toBeUndefined()
    expect(gridGestureAction(s, GRID_GESTURE.rollNudgeRight)).toBeUndefined()
    // A plain arrow is still a cursor move, not an edit.
    expect(matchGridKey(r, key('ArrowRight', 'ArrowRight'))).toBe('right')
  })
})

describe('moveCursor', () => {
  const at = { row: 1, col: 1 }
  it('moves one cell per arrow, and clamps at every edge instead of wrapping', () => {
    expect(moveCursor(at, 'left', 3, 4)).toEqual({ row: 1, col: 0 })
    expect(moveCursor(at, 'right', 3, 4)).toEqual({ row: 1, col: 2 })
    expect(moveCursor(at, 'up', 3, 4)).toEqual({ row: 0, col: 1 })
    expect(moveCursor(at, 'down', 3, 4)).toEqual({ row: 2, col: 1 })
    expect(moveCursor({ row: 0, col: 0 }, 'left', 3, 4)).toEqual({ row: 0, col: 0 })
    expect(moveCursor({ row: 0, col: 0 }, 'up', 3, 4)).toEqual({ row: 0, col: 0 })
    expect(moveCursor({ row: 2, col: 3 }, 'right', 3, 4)).toEqual({ row: 2, col: 3 })
    expect(moveCursor({ row: 2, col: 3 }, 'down', 3, 4)).toEqual({ row: 2, col: 3 })
  })
  it('Home/End go to the row ends, ⌘Home/⌘End to the grid corners', () => {
    expect(moveCursor(at, 'rowStart', 3, 4)).toEqual({ row: 1, col: 0 })
    expect(moveCursor(at, 'rowEnd', 3, 4)).toEqual({ row: 1, col: 3 })
    expect(moveCursor(at, 'first', 3, 4)).toEqual({ row: 0, col: 0 })
    expect(moveCursor(at, 'last', 3, 4)).toEqual({ row: 2, col: 3 })
  })
})
