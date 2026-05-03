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

  // --- Fixed: noteToFreq for numeric MIDI input ---
  it('numeric note 60 (middle C) produces freq ~261 Hz not 60', () => {
    const events = collect(IR.play(60))
    expect(events[0].freq).toBeCloseTo(261.63, 1)
  })

  it('numeric note 69 (A4) produces freq 440 Hz', () => {
    const events = collect(IR.play(69))
    expect(events[0].freq).toBeCloseTo(440, 1)
  })

  // --- Fixed: begin/end window filtering ---
  it('filters events before begin', () => {
    const tree = IR.seq(IR.play('c4'), IR.play('e4'), IR.play('g4'))
    // 3 equal slots: c4@0, e4@1/3, g4@2/3
    const events = collect(tree, { begin: 0.5, end: Infinity })
    expect(events).toHaveLength(1)
    expect(events[0].note).toBe('g4')
  })

  it('filters events at or after end', () => {
    const tree = IR.seq(IR.play('c4'), IR.play('e4'), IR.play('g4'))
    const events = collect(tree, { end: 0.5 })
    // c4@0 and e4@0.333 are < 0.5; g4@0.667 is excluded
    expect(events).toHaveLength(2)
    expect(events[0].note).toBe('c4')
    expect(events[1].note).toBe('e4')
  })

  it('default context has no end window (all events emitted)', () => {
    const tree = IR.seq(IR.play('c4'), IR.play('e4'), IR.play('g4'))
    expect(collect(tree)).toHaveLength(3)
  })

  it('Elongate weights its slot inside a Seq (c4@2 e4 → c4 takes 2/3, e4 takes 1/3)', () => {
    const tree = IR.seq(IR.elongate(2, IR.play('c4')), IR.play('e4'))
    const events = collect(tree)
    expect(events).toHaveLength(2)
    expect(events[0].begin).toBeCloseTo(0)
    // c4's slot is (2/(2+1)) * 1 = 0.667 cycles long, so e4 starts at 0.667
    expect(events[1].begin).toBeCloseTo(2 / 3)
    // e4's duration is 1/3 of cycle
    expect(events[1].end - events[1].begin).toBeCloseTo(1 / 3)
    // c4's duration is 2/3 of cycle
    expect(events[0].end - events[0].begin).toBeCloseTo(2 / 3)
  })

  it('Elongate standalone is a no-op (factor degenerate without a sibling)', () => {
    const events = collect(IR.elongate(5, IR.play('c4')))
    expect(events).toHaveLength(1)
    // No sibling to take time from — body runs over full ctx.duration
    expect(events[0].end - events[0].begin).toBeCloseTo(1)
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

  // --- Fixed: non-collapsible Seq uses cat() not invalid space-join ---
  it('non-collapsible Seq uses cat()', () => {
    const tree = IR.seq(IR.fast(2, IR.play('c4')), IR.play('e4'))
    const result = toStrudel(tree)
    expect(result).toBe('cat(note("c4").fast(2), note("e4"))')
  })

  // --- Choice with Pure else_ uses sometimesBy (per-cycle) ---
  // Phase 19-03 Task 02: the per-event `.degradeBy()` round-trip target
  // now belongs to the new `Degrade` tag (introduced in Task 06). Choice
  // is per-cycle, so `.sometimesBy(p, x => x)` is the semantically-
  // correct Strudel emit (RESEARCH §2.2 collision note).
  it('Choice with Pure else_ → sometimesBy', () => {
    expect(toStrudel(IR.choice(0.5, IR.play('c4')))).toBe('note("c4").sometimesBy(0.5, x => x)')
    expect(toStrudel(IR.choice(0.7, IR.play('c4')))).toBe('note("c4").sometimesBy(0.7, x => x)')
  })

  it('Choice with non-Pure else_ → stack with sometimesBy on both branches', () => {
    const result = toStrudel(IR.choice(0.5, IR.play('c4'), IR.play('g4')))
    expect(result).toContain('stack(')
    expect(result).toContain('note("c4").sometimesBy(0.5, x => x)')
    expect(result).toContain('note("g4").sometimesBy(0.5, x => x)')
  })

  // --- Fixed: Every uses extracted transform, not hardcoded fast(2) ---
  it('Every with Fast body → correct transform extracted', () => {
    const base = IR.play('c4')
    const tree = IR.every(4, IR.fast(2, base), base)
    expect(toStrudel(tree)).toBe('note("c4").every(4, fast(2))')
  })

  it('Every with Slow body → slow(n) extracted', () => {
    const base = IR.play('c4')
    const tree = IR.every(4, IR.slow(3, base), base)
    expect(toStrudel(tree)).toBe('note("c4").every(4, slow(3))')
  })

  it('Every with FX body → arrow function extracted', () => {
    const base = IR.play('c4')
    const tree = IR.every(4, IR.fx('reverb', { room: 0.8 }, base), base)
    expect(toStrudel(tree)).toContain('.every(4, x => x.room(0.8))')
  })

  it('Every without default_ uses generic fallback', () => {
    const tree = IR.every(4, IR.fast(2, IR.play('c4')))
    // no default_ stored → generic fallback
    const result = toStrudel(tree)
    expect(result).toContain('.every(4,')
  })
})

// ---------------------------------------------------------------------------
// Late tag — Tier 4 forced tag (Phase 19-03 Task 02)
// ---------------------------------------------------------------------------

describe('Late tag (Tier 4)', () => {
  it('IR.late() constructs Late node', () => {
    const tree = IR.late(0.125, IR.play('c4'))
    expect(tree.tag).toBe('Late')
    if (tree.tag === 'Late') {
      expect(tree.offset).toBe(0.125)
      expect(tree.body.tag).toBe('Play')
    }
  })

  it('collect shifts a single Play forward by offset', () => {
    // A bare IR.play occupies the full cycle (collect derives event
    // duration from ctx.duration/ctx.speed, not ir.duration; defaults are
    // duration=1, speed=1). Late(0.125) shifts begin 0→0.125 and end
    // 1→1.125 — past the cycle boundary, so the wrap branch fires:
    // begin wraps to -0.875 + 1 = NO; the wrap check is `begin >=
    // ctx.cycle+1`, and 0.125 < 1, so no wrap. The shifted event
    // spans [0.125, 1.125). For a multi-cycle viz consumer this is
    // fine; for a strict single-cycle query the trailing portion is
    // outside the window — but we don't clip on query window in this
    // test. The shape test asserts the shift, not the clip.
    const tree = IR.late(0.125, IR.play('c4'))
    const events = collect(tree)
    expect(events.length).toBe(1)
    expect(events[0].begin).toBeCloseTo(0.125, 9)
    expect(events[0].end).toBeCloseTo(1.125, 9)
  })

  it('collect wraps events past the cycle boundary back into the current cycle', () => {
    // Play at t=0.9, offset 0.2 → naïve shift to 1.1; should wrap to 0.1.
    // Build directly: a Play with begin time 0.9 by enclosing in a Seq
    // that places it in the last 10% of the cycle is fiddly; easier test
    // is .late(0.5) over a 4-step seq — the back half wraps to the front.
    const body = IR.seq(
      IR.play('a'), // 0.00..0.25
      IR.play('b'), // 0.25..0.50
      IR.play('c'), // 0.50..0.75
      IR.play('d'), // 0.75..1.00
    )
    const events = collect(IR.late(0.5, body))
    expect(events.length).toBe(4)
    const beginsByNote = Object.fromEntries(
      events.map((e) => [e.note as string, e.begin]),
    )
    // a 0.0 → 0.5; b 0.25 → 0.75; c 0.5 → 1.0 → wrap → 0.0; d 0.75 → 1.25 → wrap → 0.25.
    expect(beginsByNote.a).toBeCloseTo(0.5, 9)
    expect(beginsByNote.b).toBeCloseTo(0.75, 9)
    expect(beginsByNote.c).toBeCloseTo(0, 9)
    expect(beginsByNote.d).toBeCloseTo(0.25, 9)
  })

  it('propagates loc from underlying Play (PV24)', () => {
    const loc = [{ start: 7, end: 9 }]
    const tree = IR.late(0.125, IR.play('c4', 0.25, {}, loc))
    const events = collect(tree)
    expect(events.length).toBe(1)
    expect(events[0].loc).toEqual(loc)
  })

  it('toStrudel(Late) emits .late(offset) on the body', () => {
    expect(toStrudel(IR.late(0.125, IR.play('c4')))).toBe('note("c4").late(0.125)')
    expect(toStrudel(IR.late(0.5, IR.play('e4')))).toBe('note("e4").late(0.5)')
  })
})

// ---------------------------------------------------------------------------
// Degrade tag — Tier 4 forced tag (Phase 19-03 Task 06)
// ---------------------------------------------------------------------------

describe('Degrade tag (Tier 4)', () => {
  it('IR.degrade() constructs Degrade node with retention probability', () => {
    const tree = IR.degrade(0.5, IR.play('c4'))
    expect(tree.tag).toBe('Degrade')
    if (tree.tag === 'Degrade') {
      expect(tree.p).toBe(0.5)
      expect(tree.body.tag).toBe('Play')
    }
  })

  it('p=1 keeps every event whose seeded rand > 0 (Strudel parity — strict comparison)', () => {
    // p=1 ⇒ drop=0 ⇒ keep when rand > 0. Legacy RNG returns 0 at t=0
    // exactly, so the t=0 onset is dropped. This matches Strudel —
    // `s("bd hh sd cp").degradeBy(0)` returns 3 haps, not 4.
    const body = IR.seq(IR.play('a'), IR.play('b'), IR.play('c'), IR.play('d'))
    const events = collect(IR.degrade(1, body))
    expect(events.length).toBe(3)
    // The dropped event is the t=0 one (note 'a').
    expect(events.map((e) => e.note)).toEqual(['b', 'c', 'd'])
  })

  it('p=0 drops every event (rand > 1 never)', () => {
    const body = IR.seq(IR.play('a'), IR.play('b'), IR.play('c'), IR.play('d'))
    const events = collect(IR.degrade(0, body))
    expect(events.length).toBe(0)
  })

  it('is deterministic: same input produces same output across calls', () => {
    const body = IR.seq(
      IR.play('a'), IR.play('b'), IR.play('c'), IR.play('d'),
      IR.play('e'), IR.play('f'), IR.play('g'), IR.play('h'),
    )
    const a = collect(IR.degrade(0.5, body)).map((e) => e.note)
    const b = collect(IR.degrade(0.5, body)).map((e) => e.note)
    expect(a).toEqual(b)
  })

  it('retention rate roughly matches p over a large sample', () => {
    // Build 64 sequential events to get a reasonable sample. The
    // seededRand used by Degrade is deterministic, so we can assert
    // a window rather than a probabilistic bound.
    const children = Array.from({ length: 64 }, (_, i) => IR.play(`n${i}`))
    const body = IR.seq(...children)
    const kept = collect(IR.degrade(0.5, body)).length
    // Empirically the retention rate over 64 events near the start
    // of the rand signal lands close to 50%. Allow a generous window
    // (25%..75%) to absorb seed-distribution skew.
    expect(kept).toBeGreaterThan(16)
    expect(kept).toBeLessThan(48)
  })

  it('propagates loc on retained events (PV24)', () => {
    // The t=0 event is dropped under strict `rand > 0` (rand(0)=0).
    // Place the Play inside a Seq so its onset is at 0.5 — rand(0.5) =
    // 0.260481 > 0, so the event is kept and we can assert loc.
    const loc = [{ start: 7, end: 9 }]
    const body = IR.seq(IR.play('a'), IR.play('c4', 0.25, {}, loc))
    const events = collect(IR.degrade(1, body))
    expect(events.length).toBe(1)
    expect(events[0].loc).toEqual(loc)
  })

  it('toStrudel(Degrade) emits .degrade() when p=0.5, else .degradeBy(1-p)', () => {
    expect(toStrudel(IR.degrade(0.5, IR.play('c4')))).toBe('note("c4").degrade()')
    // p=0.7 → drop=0.3
    expect(toStrudel(IR.degrade(0.7, IR.play('c4')))).toBe('note("c4").degradeBy(0.3)')
    // p=0.2 → drop=0.8
    expect(toStrudel(IR.degrade(0.2, IR.play('c4')))).toBe('note("c4").degradeBy(0.8)')
  })
})

// ---------------------------------------------------------------------------
// Chunk tag — Tier 4 forced tag (Phase 19-03 Task 08)
// ---------------------------------------------------------------------------

describe('Chunk tag (Tier 4)', () => {
  it('IR.chunk() constructs Chunk node', () => {
    const body = IR.seq(IR.play('a'), IR.play('b'), IR.play('c'), IR.play('d'))
    const transform = IR.fast(2, body)
    const tree = IR.chunk(4, transform, body)
    expect(tree.tag).toBe('Chunk')
    if (tree.tag === 'Chunk') {
      expect(tree.n).toBe(4)
      expect(tree.transform.tag).toBe('Fast')
      expect(tree.body.tag).toBe('Seq')
    }
  })

  it('plays the full body each cycle, applying transform only to the active slot', () => {
    // Strudel's chunk(n, func) plays the body in full every cycle and
    // applies func only to the slot-k events on cycle k (verified
    // against pattern.mjs:2569-2578 + repeatCycles which repeats —
    // does not slow). Transform here is gain(0.5) on the body.
    const body = IR.seq(IR.play('a'), IR.play('b'), IR.play('c'), IR.play('d'))
    const transform = IR.fx('gain', { gain: 0.5 }, body)
    const tree = IR.chunk(4, transform, body)
    const allEvents: ReturnType<typeof collect> = []
    for (let c = 0; c < 4; c++) {
      const cycleEvents = collect(tree, {
        cycle: c, time: c, begin: c, end: c + 1, duration: 1,
      })
      allEvents.push(...cycleEvents)
    }
    // Full body plays each cycle — 4 events × 4 cycles = 16.
    expect(allEvents.length).toBe(16)
    // Cycle 0: slot 0 active ⇒ event 'a' has gain 0.5; rest are body's default 1.
    const cycle0 = allEvents.filter((e) => e.begin >= 0 && e.begin < 1)
    expect(cycle0.find((e) => e.note === 'a')?.gain).toBe(0.5)
    expect(cycle0.find((e) => e.note === 'b')?.gain).toBe(1)
    // Cycle 1: slot 1 active ⇒ 'b' has gain 0.5.
    const cycle1 = allEvents.filter((e) => e.begin >= 1 && e.begin < 2)
    expect(cycle1.find((e) => e.note === 'b')?.gain).toBe(0.5)
    expect(cycle1.find((e) => e.note === 'a')?.gain).toBe(1)
    // Cycle 3: slot 3 active ⇒ 'd' has gain 0.5.
    const cycle3 = allEvents.filter((e) => e.begin >= 3 && e.begin < 4)
    expect(cycle3.find((e) => e.note === 'd')?.gain).toBe(0.5)
  })

  it('applies transform params to slot events on cycle 0', () => {
    const body = IR.seq(IR.play('a'), IR.play('b'), IR.play('c'), IR.play('d'))
    const transform = IR.fx('gain', { gain: 0.5 }, body)
    const tree = IR.chunk(4, transform, body)
    const events = collect(tree, { cycle: 0, time: 0, begin: 0, end: 1, duration: 1 })
    expect(events.length).toBe(4)
    // Slot 0 (begin in [0, 0.25)) is 'a'; transform applies → gain 0.5.
    expect(events[0].note).toBe('a')
    expect(events[0].gain).toBe(0.5)
    // Slot 1..3 are body events with default gain.
    expect(events[1].note).toBe('b')
    expect(events[1].gain).toBe(1)
  })

  it('propagates loc through events on every cycle (PV24)', () => {
    // n=1 ⇒ slot 0 is the whole cycle ⇒ transform applies to all events.
    const loc = [{ start: 1, end: 2 }]
    const body = IR.play('a', 0.25, {}, loc)
    const transform = IR.fx('gain', { gain: 0.5 }, body)
    const tree = IR.chunk(1, transform, body)
    const events = collect(tree, { cycle: 0, time: 0, begin: 0, end: 1, duration: 1 })
    expect(events.length).toBe(1)
    expect(events[0].loc).toEqual(loc)
  })

  it('toStrudel(Chunk) emits .chunk(n, transform)', () => {
    const body = IR.play('c4')
    const transform = IR.fx('gain', { gain: 0.5 }, body)
    const result = toStrudel(IR.chunk(4, transform, body))
    expect(result).toContain('.chunk(4,')
    expect(result).toContain('gain(0.5)')
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
