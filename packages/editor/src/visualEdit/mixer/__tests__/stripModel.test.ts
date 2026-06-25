import { describe, it, expect } from 'vitest'

import { detectAllChunks } from '../../chunkDetect'
import { buildStripModels, statementOffsetForSource } from '../stripModel'

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

describe('buildStripModels — mute read-back (S3)', () => {
  it('reads the `_`-prefix marker as muted; an unmuted doc is not muted', () => {
    expect(stripsOf('_d1: s("bd")')[0].muted).toBe(true)
    expect(stripsOf('d1: s("bd")')[0].muted).toBe(false)
    expect(stripsOf('_$: s("bd")')[0].muted).toBe(true)
  })

  it('keeps a named track id/name STABLE across mute (`_d1`→ id `d1`, name `d1`)', () => {
    const [s] = stripsOf('_d1: s("bd")')
    expect(s.id).toBe('d1')
    expect(s.captureId).toBe('d1')
    expect(s.name).toBe('d1') // marker stripped from the display name
    expect(s.label).toBe('d1')
  })

  it('only labelled statements are muteable; a bare expression is not', () => {
    expect(stripsOf('$: s("bd")')[0].muteable).toBe(true)
    expect(stripsOf('d1: s("bd")')[0].muteable).toBe(true)
    expect(stripsOf('s("bd")')[0].muteable).toBe(false)
  })

  it('muting a middle anonymous track keeps unmuted siblings\' captureIds aligned with the engine', () => {
    // Engine skips `_`-ids without bumping anonIndex (StrudelEngine.ts:735-739),
    // so the live scheduler keys are [$0, $1] for a/c. The strips must match.
    const strips = stripsOf(['$: s("a")', '_$: s("b")', '$: s("c")'].join('\n'))
    expect(strips.map((s) => s.muted)).toEqual([false, true, false])
    expect(strips.map((s) => s.captureId)).toEqual(['$0', '_$1', '$1'])
    // ids are unique (the muted-anon `_$1` never collides with an unmuted `$n`)
    expect(new Set(strips.map((s) => s.id)).size).toBe(3)
  })

  it('two muted anonymous tracks get unique ids (no `_$` collision)', () => {
    const strips = stripsOf(['_$: s("a")', '_$: s("b")'].join('\n'))
    expect(strips.map((s) => s.muted)).toEqual([true, true])
    expect(new Set(strips.map((s) => s.id)).size).toBe(2)
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

// #567 — locate a runtime error back to its track by instrument.
describe('statementOffsetForSource', () => {
  it('returns the char offset of the statement assigning that instrument', () => {
    const doc = ['$: s("bd")', "$: note(\"c e g\").sound('gm_agogo')"].join('\n')
    const offset = statementOffsetForSource(doc, 'gm_agogo')
    // points at the start of the 2nd statement (just after the first line + \n)
    expect(offset).toBe(doc.indexOf('$: note'))
  })

  it('matches .s the same as .sound, and .bank for drums', () => {
    expect(statementOffsetForSource('$: note("c").s("sawtooth")', 'sawtooth')).toBe(0)
    expect(statementOffsetForSource('$: s("bd").bank("RolandTR909")', 'RolandTR909')).toBe(0)
  })

  it('returns null when no statement uses that instrument', () => {
    expect(statementOffsetForSource('$: s("bd")', 'gm_agogo')).toBeNull()
  })

  it('offset → 1-based line by newline count (the app conversion)', () => {
    const doc = ['setcps(0.5)', '$: s("bd")', "$: note(\"c7\").sound('gm_agogo')"].join('\n')
    const offset = statementOffsetForSource(doc, 'gm_agogo')!
    const line = doc.slice(0, offset).split('\n').length
    expect(line).toBe(3)
  })
})
