import { describe, it, expect, beforeEach } from 'vitest'

import { type NoteClip, setNoteClip, getNoteClip } from '../clipboard'

const clip = (over: Partial<NoteClip> = {}): NoteClip => ({
  pitch: 'c3',
  duration: 2,
  gain: 0.8,
  ...over,
})

describe('clipboard (#528)', () => {
  beforeEach(() => setNoteClip(null))

  it('starts empty', () => {
    expect(getNoteClip()).toBeNull()
  })

  it('stores and returns the copied note shape', () => {
    const c = clip()
    setNoteClip(c)
    expect(getNoteClip()).toEqual({ pitch: 'c3', duration: 2, gain: 0.8 })
  })

  it('overwrites on a fresh copy', () => {
    setNoteClip(clip({ pitch: 'e3', duration: 1, gain: 1 }))
    setNoteClip(clip({ pitch: 'g3', duration: 3, gain: 0.5 }))
    expect(getNoteClip()).toMatchObject({ pitch: 'g3', duration: 3, gain: 0.5 })
  })

  it('clears to null', () => {
    setNoteClip(clip())
    setNoteClip(null)
    expect(getNoteClip()).toBeNull()
  })
})
