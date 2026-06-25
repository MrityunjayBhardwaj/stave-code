import { describe, it, expect } from 'vitest'

import { detectAllChunks } from '../../chunkDetect'
import { buildStripModels } from '../stripModel'

/** strips for a whole document, the read path the Mixer actually uses */
function stripsOf(src: string) {
  return buildStripModels(detectAllChunks(src))
}

describe('buildStripModels — one strip per top-level statement', () => {
  it('projects each $: / named statement in source order', () => {
    const strips = stripsOf(
      ['$: s("bd sn")', 'd1: note("c e g")', '$: s("hh*4")'].join('\n'),
    )
    expect(strips).toHaveLength(3)
    expect(strips.map((s) => s.index)).toEqual([0, 1, 2])
    expect(strips.map((s) => s.kind)).toEqual(['step', 'roll', 'step'])
  })

  it('gives anonymous $: tracks unique positional ids (label "$" is not a name)', () => {
    const strips = stripsOf(['$: s("bd")', '$: s("hh")'].join('\n'))
    expect(strips.map((s) => s.id)).toEqual(['$0', '$1'])
    expect(strips.every((s) => s.label === null)).toBe(true)
  })

  it('keeps a genuine label as the id, name and captureId', () => {
    const [strip] = stripsOf('drums: s("bd sn")')
    expect(strip.id).toBe('drums')
    expect(strip.label).toBe('drums')
    expect(strip.name).toBe('drums')
    expect(strip.captureId).toBe('drums')
  })

  it('numbers captureIds: named keep their name, anonymous get $0/$1 (GR1 candidate)', () => {
    const strips = stripsOf(['$: s("bd")', 'd1: s("hh")', '$: s("cp")'].join('\n'))
    expect(strips.map((s) => s.captureId)).toEqual(['$0', 'd1', '$1'])
  })
})

describe('buildStripModels — per-strip read model', () => {
  it('reads source: .bank for drums, .sound/.s for melody', () => {
    const [drum] = stripsOf('$: s("bd sn").bank("RolandTR909")')
    expect(drum.source).toBe('RolandTR909')
    const [mel] = stripsOf('$: note("c e g").sound("piano")')
    expect(mel.source).toBe('piano')
  })

  it('reads pan, room and delay scalars; null when absent', () => {
    const [s] = stripsOf('$: s("bd").pan(0.3).room(0.4)')
    expect(s.pan).toBe(0.3)
    expect(s.sends.room).toBe(0.4)
    expect(s.sends.delay).toBeNull()
  })

  it('carries the gain state through to the strip', () => {
    expect(stripsOf('$: s("bd").gain(0.7)')[0].gain.kind).toBe('scalar')
    expect(stripsOf('$: s("bd sn").gain("0.5 1")')[0].gain.kind).toBe('managed')
    expect(stripsOf('$: s("bd").gain(sine)')[0].gain.kind).toBe('foreign')
    expect(stripsOf('$: s("bd")')[0].gain.kind).toBe('absent')
  })

  it('colours a step strip from its first drum voice', () => {
    // bd → kick magenta (the same palette the Sequencer uses)
    expect(stripsOf('$: s("bd sn")')[0].color).toBe('#e0407f')
  })

  it('classifies a stack(...) statement as a group', () => {
    expect(stripsOf('$: stack(s("bd"), note("c e"))')[0].kind).toBe('group')
  })

  it('falls back to source/head for an unnamed strip name', () => {
    expect(stripsOf('$: note("c e g").sound("piano")')[0].name).toBe('piano')
    expect(stripsOf('$: s("bd sn")')[0].name).toBe('s') // no bank → head fallback
  })

  it('is a pure function of the document (re-derive → identical)', () => {
    const src = '$: s("bd sn").gain(0.6)\nd1: note("c e").pan(0.2)'
    expect(buildStripModels(detectAllChunks(src))).toEqual(
      buildStripModels(detectAllChunks(src)),
    )
  })
})
