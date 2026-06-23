import { describe, it, expect, beforeEach } from 'vitest'

import {
  type NoteClip,
  setNoteClip,
  getNoteClip,
  pasteTarget,
  advanceClip,
} from '../clipboard'

const clip = (over: Partial<NoteClip> = {}): NoteClip => ({
  pitch: 'c3',
  start: 2,
  duration: 2,
  gain: 0.8,
  ...over,
})

describe('clipboard (#528)', () => {
  beforeEach(() => setNoteClip(null))

  it('stores and returns the copied note', () => {
    expect(getNoteClip()).toBeNull()
    const c = clip()
    setNoteClip(c)
    expect(getNoteClip()).toEqual(c)
  })

  it('pastes right after the note (start + duration)', () => {
    expect(pasteTarget(clip({ start: 2, duration: 2 }))).toBe(4)
    expect(pasteTarget(clip({ start: 0, duration: 1 }))).toBe(1)
    expect(pasteTarget(clip({ start: 5, duration: 3 }))).toBe(8)
  })

  it('advances the clip to its paste spot so repeated paste tiles forward', () => {
    let c = clip({ start: 2, duration: 2 })
    c = advanceClip(c) // → 4
    expect(c.start).toBe(4)
    c = advanceClip(c) // → 6
    expect(c.start).toBe(6)
    // pitch / duration / gain are preserved across the tiling
    expect(c).toMatchObject({ pitch: 'c3', duration: 2, gain: 0.8 })
  })
})
