import { describe, it, expect } from 'vitest'
import { IR, type PatternIR } from '../PatternIR'
import { collect } from '../collect'
import { toStrudel } from '../toStrudel'
import { patternToJSON, patternFromJSON, PATTERN_IR_SCHEMA_VERSION } from '../serialize'

// ---------------------------------------------------------------------------
// Type construction — every node variant via smart constructors
// ---------------------------------------------------------------------------

describe('PatternIR smart constructors', () => {
  it('IR.pure() constructs Pure node', () => {
    expect(IR.pure()).toEqual({ tag: 'Pure' })
  })

  it('IR.play() constructs Play with defaults', () => {
    const node = IR.play('c4')
    expect(node.tag).toBe('Play')
    if (node.tag === 'Play') {
      expect(node.note).toBe('c4')
      expect(node.duration).toBe(0.25)
      expect(node.params.gain).toBe(1)
      expect(node.params.velocity).toBe(1)
    }
  })

  it('IR.play() accepts numeric note', () => {
    const node = IR.play(60, 0.5)
    expect(node.tag).toBe('Play')
    if (node.tag === 'Play') expect(node.note).toBe(60)
  })

  it('IR.play() merges params', () => {
    const node = IR.play('c4', 0.25, { s: 'piano', gain: 0.5 })
    if (node.tag === 'Play') {
      expect(node.params.s).toBe('piano')
      expect(node.params.gain).toBe(0.5)
    }
  })

  it('IR.sleep() constructs Sleep', () => {
    expect(IR.sleep(0.5)).toEqual({ tag: 'Sleep', duration: 0.5 })
  })

  it('IR.seq() constructs Seq', () => {
    const node = IR.seq(IR.play('c4'), IR.play('e4'))
    expect(node.tag).toBe('Seq')
    if (node.tag === 'Seq') expect(node.children.length).toBe(2)
  })

  it('IR.stack() constructs Stack', () => {
    const node = IR.stack(IR.play('c4'), IR.play('e4'))
    expect(node.tag).toBe('Stack')
    if (node.tag === 'Stack') expect(node.tracks.length).toBe(2)
  })

  it('IR.choice() constructs Choice', () => {
    const node = IR.choice(0.7, IR.play('c4'))
    expect(node.tag).toBe('Choice')
    if (node.tag === 'Choice') {
      expect(node.p).toBe(0.7)
      expect(node.else_.tag).toBe('Pure')
    }
  })

  it('IR.every() constructs Every', () => {
    const node = IR.every(4, IR.play('c4'))
    expect(node.tag).toBe('Every')
    if (node.tag === 'Every') {
      expect(node.n).toBe(4)
      expect(node.default_).toBeUndefined()
    }
  })

  it('IR.cycle() constructs Cycle', () => {
    const node = IR.cycle(IR.play('c4'), IR.play('e4'), IR.play('g4'))
    expect(node.tag).toBe('Cycle')
    if (node.tag === 'Cycle') expect(node.items.length).toBe(3)
  })

  it('IR.when() constructs When', () => {
    const node = IR.when('1 0 1 1', IR.play('bd', 0.25, { s: 'bd' }))
    expect(node.tag).toBe('When')
    if (node.tag === 'When') expect(node.gate).toBe('1 0 1 1')
  })

  it('IR.fx() constructs FX', () => {
    const node = IR.fx('reverb', { room: 0.8 }, IR.play('c4'))
    expect(node.tag).toBe('FX')
    if (node.tag === 'FX') {
      expect(node.name).toBe('reverb')
      expect(node.params.room).toBe(0.8)
    }
  })

  it('IR.ramp() constructs Ramp', () => {
    const node = IR.ramp('gain', 0, 1, 4, IR.play('c4'))
    expect(node.tag).toBe('Ramp')
    if (node.tag === 'Ramp') {
      expect(node.param).toBe('gain')
      expect(node.from).toBe(0)
      expect(node.to).toBe(1)
      expect(node.cycles).toBe(4)
    }
  })

  it('IR.fast() constructs Fast', () => {
    expect(IR.fast(2, IR.play('c4'))).toEqual({ tag: 'Fast', factor: 2, body: IR.play('c4') })
  })

  it('IR.slow() constructs Slow', () => {
    expect(IR.slow(3, IR.play('c4'))).toEqual({ tag: 'Slow', factor: 3, body: IR.play('c4') })
  })

  it('IR.loop() constructs Loop', () => {
    const node = IR.loop(IR.play('c4'))
    expect(node.tag).toBe('Loop')
  })

  it('IR.code() constructs Code', () => {
    const node = IR.code('some complex expression')
    expect(node.tag).toBe('Code')
    if (node.tag === 'Code') {
      expect(node.code).toBe('some complex expression')
      expect(node.lang).toBe('strudel')
    }
  })

  it('nested trees compile', () => {
    const tree = IR.every(4, IR.fast(2, IR.play('bd', 0.25, { s: 'bd' })))
    expect(tree.tag).toBe('Every')
    if (tree.tag === 'Every') {
      expect(tree.body.tag).toBe('Fast')
      if (tree.body.tag === 'Fast') {
        expect(tree.body.body.tag).toBe('Play')
      }
    }
  })

  it('IR.stack(IR.play("c4"), IR.play("e4")) is valid', () => {
    const node = IR.stack(IR.play('c4'), IR.play('e4'))
    expect(node).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// collect interpreter
// ---------------------------------------------------------------------------

describe('collect', () => {
  it('Pure returns []', () => {
    expect(collect(IR.pure())).toEqual([])
  })

  it('Code returns []', () => {
    expect(collect(IR.code('note("c4")'))).toEqual([])
  })

  it('single Play returns 1 IREvent', () => {
    const events = collect(IR.play('c4'))
    expect(events).toHaveLength(1)
    expect(events[0].note).toBe('c4')
    expect(events[0].begin).toBe(0)
  })

  it('Play with sample sets s and type', () => {
    const events = collect(IR.play('bd', 0.25, { s: 'bd' }))
    expect(events[0].s).toBe('bd')
    expect(events[0].type).toBe('sample')
  })

  it('Sleep returns []', () => {
    expect(collect(IR.sleep(0.5))).toEqual([])
  })

  it('Seq produces events at sequential times', () => {
    const tree = IR.seq(IR.play('c4'), IR.sleep(0.25), IR.play('e4'))
    const events = collect(tree)
    expect(events).toHaveLength(2)
    // With 3 children, each slot = 1/3 of cycle (duration=1, speed=1)
    expect(events[0].begin).toBeCloseTo(0)
    expect(events[1].begin).toBeCloseTo(2/3) // after 2 slots
  })

  it('Stack produces events at same time', () => {
    const tree = IR.stack(IR.play('c4'), IR.play('e4'))
    const events = collect(tree)
    expect(events).toHaveLength(2)
    expect(events[0].begin).toBe(events[1].begin)
  })

  it('Fast compresses time', () => {
    const tree = IR.fast(2, IR.seq(IR.play('c4'), IR.play('e4')))
    const events = collect(tree)
    expect(events).toHaveLength(2)
    // Fast(2) means speed=2, so each slot ends sooner
    expect(events[1].begin).toBeLessThan(events[1].begin + 1) // sanity
    expect(events[0].begin).toBeCloseTo(0)
    // Each event in seq gets duration / speed = 1/2 cycle, seq has 2 children → slot = 0.25
    expect(events[1].begin).toBeCloseTo(0.5 / 2) // 0.25
  })

  it('Slow dilates time', () => {
    const tree = IR.slow(2, IR.play('c4'))
    const events = collect(tree)
    expect(events[0].begin).toBe(0)
    // Duration is doubled by slow (speed=0.5)
    expect(events[0].end).toBeCloseTo(1 / 0.5) // 2
  })

  it('Nested Fast is multiplicative', () => {
    // fast(2, fast(3, play)) → speed = 6
    const tree = IR.fast(2, IR.fast(3, IR.play('c4')))
    const events = collect(tree)
    expect(events[0].end - events[0].begin).toBeCloseTo(1 / 6)
  })

  it('FX passes params to IREvent', () => {
    const tree = IR.fx('reverb', { room: 0.8 }, IR.play('c4'))
    const events = collect(tree)
    expect(events[0].params?.room).toBe(0.8)
  })

  it('Ramp interpolates param at cycle 0', () => {
    const tree = IR.ramp('gain', 0, 1, 4, IR.play('c4'))
    const events = collect(tree, { cycle: 0 })
    // progress = 0/4 = 0 → gain = 0 + (1-0)*0 = 0
    expect(events[0].params?.gain).toBeCloseTo(0)
  })

  it('Ramp interpolates param at cycle 2', () => {
    const tree = IR.ramp('gain', 0, 1, 4, IR.play('c4'))
    const events = collect(tree, { cycle: 2 })
    // progress = 2/4 = 0.5 → gain = 0.5
    expect(events[0].params?.gain).toBeCloseTo(0.5)
  })

  it('Every fires body on matching cycle', () => {
    const tree = IR.every(4, IR.play('c4'), IR.pure())
    const on = collect(tree, { cycle: 0 })
    expect(on).toHaveLength(1)
    const off = collect(tree, { cycle: 1 })
    expect(off).toHaveLength(0)
    const on2 = collect(tree, { cycle: 4 })
    expect(on2).toHaveLength(1)
  })

  it('Cycle picks item by cycle index', () => {
    const tree = IR.cycle(IR.play('c4'), IR.play('e4'), IR.play('g4'))
    const e0 = collect(tree, { cycle: 0 })
    const e1 = collect(tree, { cycle: 1 })
    const e2 = collect(tree, { cycle: 2 })
    const e3 = collect(tree, { cycle: 3 })
    expect(e0[0].note).toBe('c4')
    expect(e1[0].note).toBe('e4')
    expect(e2[0].note).toBe('g4')
    expect(e3[0].note).toBe('c4') // wraps
  })

  it('Loop collects body once', () => {
    const tree = IR.loop(IR.play('c4'))
    const events = collect(tree)
    expect(events).toHaveLength(1)
  })

  it('Pure in Seq is safe', () => {
    const tree = IR.seq(IR.pure(), IR.play('c4'), IR.pure())
    const events = collect(tree)
    expect(events).toHaveLength(1)
  })

  it('complex drum pattern', () => {
    const drumPattern = IR.stack(
      IR.seq(IR.play('bd', 0.25, { s: 'bd' }), IR.sleep(0.25),
             IR.play('bd', 0.25, { s: 'bd' }), IR.sleep(0.25)),
      IR.seq(IR.sleep(0.25), IR.play('sd', 0.25, { s: 'sd' }), IR.sleep(0.5)),
      IR.fast(2, IR.play('hh', 0.125, { s: 'hh' })),
    )
    const events = collect(drumPattern)
    // Stack: 2 bd from first track + 1 sd + 1 hh
    expect(events.length).toBeGreaterThanOrEqual(4)
    expect(events.some(e => e.note === 'bd')).toBe(true)
    expect(events.some(e => e.note === 'sd')).toBe(true)
    expect(events.some(e => e.note === 'hh')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// toStrudel interpreter
// ---------------------------------------------------------------------------

describe('toStrudel', () => {
  it('Pure → empty string', () => {
    expect(toStrudel(IR.pure())).toBe('""')
  })

  it('Play with note → note("c4")', () => {
    expect(toStrudel(IR.play('c4'))).toBe('note("c4")')
  })

  it('Play with s param → s("bd")', () => {
    expect(toStrudel(IR.play('bd', 0.25, { s: 'bd' }))).toBe('s("bd")')
  })

  it('Seq of notes collapses to mini-notation', () => {
    const tree = IR.seq(IR.play('c4'), IR.play('e4'), IR.play('g4'))
    expect(toStrudel(tree)).toBe('note("c4 e4 g4")')
  })

  it('Seq with Sleep collapses to mini-notation with ~', () => {
    const tree = IR.seq(IR.play('c4'), IR.sleep(0.25), IR.play('e4'))
    expect(toStrudel(tree)).toBe('note("c4 ~ e4")')
  })

  it('Seq of samples collapses to s(...)', () => {
    const tree = IR.seq(
      IR.play('bd', 0.25, { s: 'bd' }),
      IR.play('sd', 0.25, { s: 'sd' }),
    )
    expect(toStrudel(tree)).toBe('s("bd sd")')
  })

  it('Stack produces stack(...)', () => {
    const tree = IR.stack(IR.play('c4'), IR.play('e4'))
    const result = toStrudel(tree)
    expect(result).toContain('stack(')
    expect(result).toContain('note("c4")')
    expect(result).toContain('note("e4")')
  })

  it('Fast wraps with .fast(n)', () => {
    expect(toStrudel(IR.fast(2, IR.play('c4')))).toBe('note("c4").fast(2)')
  })

  it('Slow wraps with .slow(n)', () => {
    expect(toStrudel(IR.slow(3, IR.play('c4')))).toBe('note("c4").slow(3)')
  })

  it('Cycle → note("<c4 e4 g4>")', () => {
    const tree = IR.cycle(IR.play('c4'), IR.play('e4'), IR.play('g4'))
    expect(toStrudel(tree)).toBe('note("<c4 e4 g4>")')
  })

  it('Cycle of samples → s("<bd sd>")', () => {
    const tree = IR.cycle(
      IR.play('bd', 0.25, { s: 'bd' }),
      IR.play('sd', 0.25, { s: 'sd' }),
    )
    expect(toStrudel(tree)).toBe('s("<bd sd>")')
  })

  it('Loop passes through to body', () => {
    expect(toStrudel(IR.loop(IR.play('c4')))).toBe('note("c4")')
  })

  it('Code returns original code', () => {
    expect(toStrudel(IR.code('const x = 42'))).toBe('const x = 42')
  })

  it('FX generates method chain', () => {
    const tree = IR.fx('reverb', { room: 0.8 }, IR.play('c4'))
    const result = toStrudel(tree)
    expect(result).toContain('note("c4")')
    expect(result).toContain('.room(0.8)')
  })
})

// ---------------------------------------------------------------------------
// JSON serialization
// ---------------------------------------------------------------------------

describe('patternToJSON / patternFromJSON', () => {
  it('round-trips Pure', () => {
    const tree = IR.pure()
    expect(patternFromJSON(patternToJSON(tree))).toEqual(tree)
  })

  it('round-trips Play', () => {
    const tree = IR.play('c4', 0.5, { s: 'piano', gain: 0.8 })
    expect(patternFromJSON(patternToJSON(tree))).toEqual(tree)
  })

  it('round-trips Sleep', () => {
    const tree = IR.sleep(0.25)
    expect(patternFromJSON(patternToJSON(tree))).toEqual(tree)
  })

  it('round-trips Seq', () => {
    const tree = IR.seq(IR.play('c4'), IR.sleep(0.25), IR.play('e4'))
    expect(patternFromJSON(patternToJSON(tree))).toEqual(tree)
  })

  it('round-trips Stack', () => {
    const tree = IR.stack(IR.play('c4'), IR.play('e4'))
    expect(patternFromJSON(patternToJSON(tree))).toEqual(tree)
  })

  it('round-trips Choice', () => {
    const tree = IR.choice(0.7, IR.play('c4'), IR.play('g4'))
    expect(patternFromJSON(patternToJSON(tree))).toEqual(tree)
  })

  it('round-trips Every', () => {
    const tree = IR.every(4, IR.play('c4'), IR.pure())
    expect(patternFromJSON(patternToJSON(tree))).toEqual(tree)
  })

  it('round-trips Every without default', () => {
    const tree = IR.every(4, IR.play('c4'))
    expect(patternFromJSON(patternToJSON(tree))).toEqual(tree)
  })

  it('round-trips Cycle', () => {
    const tree = IR.cycle(IR.play('c4'), IR.play('e4'), IR.play('g4'))
    expect(patternFromJSON(patternToJSON(tree))).toEqual(tree)
  })

  it('round-trips When', () => {
    const tree = IR.when('1 0 1 1', IR.play('c4'))
    expect(patternFromJSON(patternToJSON(tree))).toEqual(tree)
  })

  it('round-trips FX', () => {
    const tree = IR.fx('reverb', { room: 0.8 }, IR.play('c4'))
    expect(patternFromJSON(patternToJSON(tree))).toEqual(tree)
  })

  it('round-trips Ramp', () => {
    const tree = IR.ramp('gain', 0, 1, 4, IR.play('c4'))
    expect(patternFromJSON(patternToJSON(tree))).toEqual(tree)
  })

  it('round-trips Fast', () => {
    const tree = IR.fast(2, IR.play('c4'))
    expect(patternFromJSON(patternToJSON(tree))).toEqual(tree)
  })

  it('round-trips Slow', () => {
    const tree = IR.slow(3, IR.play('c4'))
    expect(patternFromJSON(patternToJSON(tree))).toEqual(tree)
  })

  it('round-trips Loop', () => {
    const tree = IR.loop(IR.play('c4'))
    expect(patternFromJSON(patternToJSON(tree))).toEqual(tree)
  })

  it('round-trips Code', () => {
    const tree = IR.code('const x = 42')
    expect(patternFromJSON(patternToJSON(tree))).toEqual(tree)
  })

  it('round-trips complex nested tree', () => {
    const tree = IR.stack(
      IR.seq(IR.play('bd', 0.25, { s: 'bd' }), IR.sleep(0.25),
             IR.play('bd', 0.25, { s: 'bd' }), IR.sleep(0.25)),
      IR.seq(IR.sleep(0.25), IR.play('sd', 0.25, { s: 'sd' }), IR.sleep(0.5)),
      IR.fast(2, IR.play('hh', 0.125, { s: 'hh' })),
    )
    expect(patternFromJSON(patternToJSON(tree))).toEqual(tree)
  })

  it('pretty mode produces indented JSON', () => {
    const result = patternToJSON(IR.play('c4'), true)
    expect(result).toContain('\n')
    expect(result).toContain('  ')
  })

  it('schema version is present', () => {
    const result = patternToJSON(IR.pure())
    const parsed = JSON.parse(result)
    expect(parsed.$schema).toBe(`patternir/${PATTERN_IR_SCHEMA_VERSION}`)
  })

  it('throws on invalid JSON', () => {
    expect(() => patternFromJSON('not json')).toThrow()
  })

  it('throws on missing tag', () => {
    const json = JSON.stringify({ $schema: 'patternir/1.0', tree: { note: 'c4' } })
    expect(() => patternFromJSON(json)).toThrow(/tag/)
  })

  it('throws on unknown tag', () => {
    const json = JSON.stringify({ $schema: 'patternir/1.0', tree: { tag: 'Unknown' } })
    expect(() => patternFromJSON(json)).toThrow(/tag/)
  })

  it('throws on Play without note', () => {
    const json = JSON.stringify({ $schema: 'patternir/1.0', tree: { tag: 'Play', duration: 0.25, params: {} } })
    expect(() => patternFromJSON(json)).toThrow(/note/)
  })

  it('throws on Play with wrong duration type', () => {
    const json = JSON.stringify({ $schema: 'patternir/1.0', tree: { tag: 'Play', note: 'c4', duration: 'long', params: {} } })
    expect(() => patternFromJSON(json)).toThrow(/duration/)
  })

  it('throws on Choice without p', () => {
    const json = JSON.stringify({ $schema: 'patternir/1.0', tree: { tag: 'Choice', then: { tag: 'Pure' }, else_: { tag: 'Pure' } } })
    expect(() => patternFromJSON(json)).toThrow(/p/)
  })

  it('error message includes field path for nested errors', () => {
    const json = JSON.stringify({
      $schema: 'patternir/1.0',
      tree: {
        tag: 'Stack',
        tracks: [
          { tag: 'Play', duration: 0.25, params: {} }, // missing note
        ],
      },
    })
    expect(() => patternFromJSON(json)).toThrow(/tracks\[0\]/)
  })
})
