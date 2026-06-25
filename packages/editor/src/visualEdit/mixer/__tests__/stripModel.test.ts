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

  it('gives anonymous $: tracks unique anonymous-position ids (label "$" is not a name)', () => {
    const strips = stripsOf(['$: s("bd")', '$: s("hh")'].join('\n'))
    expect(strips.map((s) => s.id)).toEqual(['#0', '#1'])
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
    // so the live scheduler keys are [$0, $1] for a/c. The captureIds must match.
    const strips = stripsOf(['$: s("a")', '_$: s("b")', '$: s("c")'].join('\n'))
    expect(strips.map((s) => s.muted)).toEqual([false, true, false])
    expect(strips.map((s) => s.captureId)).toEqual(['$0', '_$1', '$1'])
    // ids count ALL anonymous tracks (muted included) — unique and independent
    // of the captureId shift, so they don't move when `b` is muted.
    expect(strips.map((s) => s.id)).toEqual(['#0', '#1', '#2'])
  })

  it('two muted anonymous tracks get unique ids (no `#`/`_$` collision)', () => {
    const strips = stripsOf(['_$: s("a")', '_$: s("b")'].join('\n'))
    expect(strips.map((s) => s.muted)).toEqual([true, true])
    expect(strips.map((s) => s.id)).toEqual(['#0', '#1'])
    expect(new Set(strips.map((s) => s.id)).size).toBe(2)
  })
})

// #555 — strip identity (`id`) is decoupled from the engine-join key
// (`captureId`): muting must shift the positional captureId in lockstep with the
// engine, but must NOT shift the stable id that UI state (expand/solo) hangs on.
describe('buildStripModels — stable id vs positional captureId (#555)', () => {
  it('keeps every anonymous track\'s id stable when an EARLIER sibling is muted', () => {
    const before = stripsOf(['$: s("a")', '$: s("b")', '$: s("c")'].join('\n'))
    const after = stripsOf(['$: s("a")', '_$: s("b")', '$: s("c")'].join('\n'))
    // The third track `c` keeps id `#2` across the mute of `b` (its UI state stays
    // attached) even though its captureId moves $2 → $1 to track the engine.
    expect(before.map((s) => s.id)).toEqual(after.map((s) => s.id)) // ['#0','#1','#2']
    expect(before[2].captureId).toBe('$2')
    expect(after[2].captureId).toBe('$1')
  })

  it('keeps an anonymous track\'s OWN id stable when it is muted/unmuted', () => {
    const unmuted = stripsOf(['$: s("a")', '$: s("b")'].join('\n'))[1]
    const muted = stripsOf(['$: s("a")', '_$: s("b")'].join('\n'))[1]
    expect(unmuted.id).toBe('#1')
    expect(muted.id).toBe('#1') // own id survives its own mute toggle
    expect(unmuted.captureId).toBe('$1')
    expect(muted.captureId).toBe('_$1') // captureId reflects muted (dark meter)
  })

  it('numbers anonymous ids by anonymous position, skipping interleaved named tracks', () => {
    // `$: a / d1: b / $: c` → the 2nd anonymous track is `#1` (not `#2`): the id
    // counts anonymous tracks, so an interleaved named track does not consume a
    // `#`. captureId, separately, is positional-over-unmuted ($0 / d1 / $1).
    const strips = stripsOf(['$: s("a")', 'd1: s("b")', '$: s("c")'].join('\n'))
    expect(strips.map((s) => s.id)).toEqual(['#0', 'd1', '#1'])
    expect(strips.map((s) => s.captureId)).toEqual(['$0', 'd1', '$1'])
  })

  it('a named track keeps both id and captureId stable across mute', () => {
    const unmuted = stripsOf('d1: s("bd")')[0]
    const muted = stripsOf('_d1: s("bd")')[0]
    expect([unmuted.id, unmuted.captureId]).toEqual(['d1', 'd1'])
    expect([muted.id, muted.captureId]).toEqual(['d1', 'd1'])
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
