import { afterEach, describe, expect, it } from 'vitest'
import {
  GRID_GESTURE,
  GRID_GESTURES,
  GRID_SCOPE,
  matchGridKey,
  mountGridGestures,
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
    expect(matchGridKey(r, key('Delete', 'Delete'))).toBe(GRID_GESTURE.rollDelete)
    expect(matchGridKey(r, key('Backspace', 'Backspace'))).toBe(GRID_GESTURE.rollDelete)
    expect(matchGridKey(r, key('c', 'KeyC', { metaKey: true }))).toBe(GRID_GESTURE.rollCopy)
    expect(matchGridKey(r, key('v', 'KeyV', { metaKey: true }))).toBe(GRID_GESTURE.rollPaste)
    expect(matchGridKey(r, key('c', 'KeyC'))).toBeUndefined()
    // ⌥⌫ is not delete, ⌘⇧C is Chrome's element picker (#1425).
    expect(matchGridKey(r, key('Backspace', 'Backspace', { altKey: true }))).toBeUndefined()
    expect(matchGridKey(r, key('C', 'KeyC', { metaKey: true, shiftKey: true }))).toBeUndefined()
  })

  it('answers nothing for a scope with no gestures', () => {
    expect(matchGridKey(GRID_SCOPE.sequencer, key('Delete', 'Delete'))).toBeUndefined()
  })

  it('declares every gesture once', () => {
    expect(new Set(GRID_GESTURES.map((g) => g.id)).size).toBe(GRID_GESTURES.length)
    expect(GRID_GESTURES.map((g) => g.id).sort()).toEqual(Object.values(GRID_GESTURE).sort())
  })
})

describe('setGridKeyMatcher', () => {
  it('replaces the defaults, and its release restores them', () => {
    const off = setGridKeyMatcher((_scope, e) => (e.key === 'x' ? GRID_GESTURE.rollDelete : undefined))
    expect(matchGridKey(GRID_SCOPE.pianoRoll, key('x', 'KeyX'))).toBe(GRID_GESTURE.rollDelete)
    expect(matchGridKey(GRID_SCOPE.pianoRoll, key('Delete', 'Delete'))).toBeUndefined()
    off()
    expect(matchGridKey(GRID_SCOPE.pianoRoll, key('Delete', 'Delete'))).toBe(GRID_GESTURE.rollDelete)
  })

  it('drops an id that is not a grid gesture', () => {
    release.push(setGridKeyMatcher(() => 'stave.timeline.splitSection'))
    expect(matchGridKey(GRID_SCOPE.pianoRoll, key('s', 'KeyS'))).toBeUndefined()
  })

  it("a stale release leaves a newer matcher in place", () => {
    const offA = setGridKeyMatcher(() => GRID_GESTURE.rollCopy)
    release.push(setGridKeyMatcher(() => GRID_GESTURE.rollPaste))
    offA()
    expect(matchGridKey(GRID_SCOPE.pianoRoll, key('q', 'KeyQ'))).toBe(GRID_GESTURE.rollPaste)
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
      [GRID_GESTURE.rollCopy, true],
      [GRID_GESTURE.rollCopy, false],
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
