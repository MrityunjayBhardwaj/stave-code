import { describe, it, expect } from 'vitest'

import { detectAllChunks } from '../../chunkDetect'
import { buildStripModels, statementOffsetForSource, otherTrackNames } from '../stripModel'
import { colorForTrack } from '../../trackColor'

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

// #559 — a top-level transport/config statement (`setcps`, `samples`, …) is not
// a playable track: it must produce NO strip, and must not consume a positional
// `$<n>` slot (which would shift every real track's captureId off the engine).
describe('buildStripModels — transport/config statements are not tracks (#559)', () => {
  it('drops a leading setcps(...) line and keeps only the real tracks', () => {
    const strips = stripsOf(
      ['setcps(0.5)', '$: s("bd")', '$: note("c e g")'].join('\n'),
    )
    expect(strips).toHaveLength(2)
    // names = the display key (V-track-1): both anon → positional d{ordinal},
    // counting from 1 after the dropped config line (d1, d2 — never d2, d3).
    expect(strips.map((s) => s.name)).toEqual(['d1', 'd2'])
  })

  it('renumbers anonymous captureIds to $0.. after dropping setcps (no off-by-one)', () => {
    // Engine numbers anon $: patterns from $0 (StrudelEngine.ts:735-739); setcps
    // never calls .p(), so the first real anon track must be $0, not $1.
    const strips = stripsOf(
      ['setcps(0.5).gain(0.3)', '$: s("bd")', '$: s("hh")'].join('\n'),
    )
    expect(strips.map((s) => s.captureId)).toEqual(['$0', '$1'])
  })

  it('drops every known transport/config head (samples, hush, setbpm, …)', () => {
    for (const cfg of ['setcps(0.5)', 'setcpm(120)', 'samples("x")', 'hush()', 'all(x => x)']) {
      expect(stripsOf([cfg, '$: s("bd")'].join('\n'))).toHaveLength(1)
    }
  })

  it('keeps a bare pattern expression (unknown head) as a track — denylist is conservative', () => {
    const strips = stripsOf(['s("bd")', '$: note("c e")'].join('\n'))
    expect(strips).toHaveLength(2)
    expect(strips[0].muteable).toBe(false) // bare expression, still a strip
  })

  it('keeps source-order index even when an earlier statement was filtered out', () => {
    // setcps is filtered; the surviving track keeps its TRUE source position (1).
    const [strip] = stripsOf(['setcps(0.5)', '$: s("bd")'].join('\n'))
    expect(strip.index).toBe(1)
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

  it('names + colours each strip by its display key — label, else positional d{N} (V-track-1, #579)', () => {
    // The display key matches what the Song Timeline shows: a NAMED track keys on
    // its label; an ANONYMOUS `$:` keys on `d{ordinal}` (its 1-based position) —
    // the same positional hap id the Timeline lanes by. Name AND colour derive
    // from that ONE key via the shared resolver, so they can't diverge.
    const strips = stripsOf(['bass: note("c2 e2")', '$: s("hh*8")', '$: note("c").sound("piano")'].join('\n'))
    expect(strips.map((s) => s.name)).toEqual(['bass', 'd2', 'd3'])
    expect(strips[0].color).toBe(colorForTrack('bass'))
    expect(strips[1].color).toBe(colorForTrack('d2'))
    expect(strips[2].color).toBe(colorForTrack('d3'))
    // anon names/colours follow position, NOT the instrument — so the strip never
    // auto-adopts a sample name (renaming stays the user's explicit edit).
    expect(strips[1].id).toBe('#0') // stable UI id is still positional `#k`
  })

  it('keeps same-sample anon tracks distinct in name AND colour (no collision)', () => {
    // Two identical `s("bd")` tracks → d1 / d2, distinct colours. This is why the
    // display key is positional, not the sample (which would collide).
    const dup = stripsOf(['$: s("bd*4")', '$: s("bd*4")'].join('\n'))
    expect(dup.map((s) => s.name)).toEqual(['d1', 'd2'])
    expect(dup[0].color).not.toBe(dup[1].color)
  })

  it('classifies a stack(...) statement as a group', () => {
    expect(stripsOf('$: stack(s("bd"), note("c e"))')[0].kind).toBe('group')
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

describe('otherTrackNames — the rename collision set (#585)', () => {
  it('returns every track display name except the one at the given offset', () => {
    const doc = ['bass: s("bd")', '$: s("hh")', 'lead: note("c4")'].join('\n')
    // exclude the first statement (offset 0) → the OTHER names
    expect(otherTrackNames(doc, 0)).toEqual(['d2', 'lead'])
  })

  it('uses display names — anon tracks contribute their positional d{N}', () => {
    const doc = ['$: s("bd")', '$: s("hh")'].join('\n')
    // exclude the 2nd anon (d2) → the remaining display name is d1
    expect(otherTrackNames(doc, doc.indexOf('$: s("hh")'))).toEqual(['d1'])
  })

  it('drops config lines (not tracks) from the set, like the Mixer does', () => {
    const doc = ['setcps(0.5)', 'bass: s("bd")', 'lead: s("hh")'].join('\n')
    // excluding bass → only lead remains (setcps is not a track, #559)
    expect(otherTrackNames(doc, doc.indexOf('bass:'))).toEqual(['lead'])
  })

  it('an unmatched offset excludes nothing → all names', () => {
    const doc = ['bass: s("bd")', 'lead: s("hh")'].join('\n')
    expect(otherTrackNames(doc, 9999)).toEqual(['bass', 'lead'])
  })
})
