import { describe, it, expect } from 'vitest'

import { detectAllChunks } from '../../chunkDetect'
import { applyEdits } from '../../writeback'
import { gainEdit, panEdit, muteEdit, type StripEdit } from '../writeStrip'

/** the nth detected chunk of a doc */
function chunkAt(src: string, i = 0) {
  return detectAllChunks(src)[i]
}
/** apply a strip edit to the source it was computed from */
function applied(src: string, edit: StripEdit | null): string {
  expect(edit).not.toBeNull()
  return applyEdits(src, [edit as StripEdit])
}

describe('gainEdit', () => {
  it('replaces a scalar gain literal in place', () => {
    const src = '$: s("bd").gain(0.6)'
    expect(applied(src, gainEdit(chunkAt(src), 0.8))).toBe('$: s("bd").gain(0.8)')
  })

  it('rescales a managed velocity gain to the new ceiling (shape kept)', () => {
    const src = '$: s("bd sn").gain("0.5 1")'
    expect(applied(src, gainEdit(chunkAt(src), 0.5))).toBe('$: s("bd sn").gain("0.25 0.5")')
  })

  it('appends .gain when absent', () => {
    const src = '$: s("bd")'
    expect(applied(src, gainEdit(chunkAt(src), 0.7))).toBe('$: s("bd").gain(0.7)')
  })

  it('hands off a signal gain (no edit)', () => {
    expect(gainEdit(chunkAt('$: s("bd").gain(sine)'), 0.5)).toBeNull()
  })
})

describe('panEdit', () => {
  it('replaces a scalar pan literal in place', () => {
    const src = '$: s("bd").pan(0.3)'
    expect(applied(src, panEdit(chunkAt(src), 0.8))).toBe('$: s("bd").pan(0.8)')
  })

  it('appends .pan when absent', () => {
    const src = '$: s("bd")'
    expect(applied(src, panEdit(chunkAt(src), 0.2))).toBe('$: s("bd").pan(0.2)')
  })

  it('hands off a patterned/signal pan (no edit)', () => {
    expect(panEdit(chunkAt('$: s("bd").pan(sine)'), 0.5)).toBeNull()
  })
})

describe('muteEdit', () => {
  it('mutes an anonymous $: by inserting the marker', () => {
    expect(applied('$: s("bd")', muteEdit(chunkAt('$: s("bd")'), true))).toBe('_$: s("bd")')
  })

  it('mutes a named track by inserting the marker', () => {
    expect(applied('d1: s("bd")', muteEdit(chunkAt('d1: s("bd")'), true))).toBe('_d1: s("bd")')
  })

  it('unmutes by deleting the leading marker (exact inverse — byte-identical round-trip)', () => {
    const src = 'd1: s("bd").gain(0.5)'
    const muted = applied(src, muteEdit(chunkAt(src), true))
    expect(muted).toBe('_d1: s("bd").gain(0.5)')
    expect(applied(muted, muteEdit(chunkAt(muted), false))).toBe(src)
  })

  it('is orthogonal to gain — muting never touches .gain (V-mixer-2)', () => {
    const src = '$: s("bd").gain(0.5).pan(0.3)'
    expect(applied(src, muteEdit(chunkAt(src), true))).toBe('_$: s("bd").gain(0.5).pan(0.3)')
  })

  it('no-ops when already in the requested state', () => {
    expect(muteEdit(chunkAt('_$: s("bd")'), true)).toBeNull()
    expect(muteEdit(chunkAt('$: s("bd")'), false)).toBeNull()
  })

  it('hands off an unlabelled statement (no marker to carry)', () => {
    expect(muteEdit(chunkAt('s("bd")'), true)).toBeNull()
  })
})

describe('write is surgical — siblings stay byte-identical', () => {
  it('editing one statement leaves the others untouched', () => {
    const src = '$: s("bd").gain(0.5)\nd1: note("c e").pan(0.2)\n$: s("hh*4")'
    // edit the gain on the SECOND statement's neighbour by index 0
    const out = applyEdits(src, [gainEdit(chunkAt(src, 0), 0.9) as StripEdit])
    expect(out).toBe('$: s("bd").gain(0.9)\nd1: note("c e").pan(0.2)\n$: s("hh*4")')
  })
})
