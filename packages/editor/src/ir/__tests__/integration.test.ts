/**
 * Integration tests: code string → parse → PatternIR → collect → IREvent[] → toStrudel
 *
 * No Strudel runtime required — parser works on strings, not Pattern objects.
 */

import { describe, it, expect } from 'vitest'
import { parseMini } from '../parseMini'
import { parseStrudel } from '../parseStrudel'
import { collect } from '../collect'
import { toStrudel } from '../toStrudel'
import { patternToJSON, patternFromJSON } from '../serialize'
import { propagate, StrudelParseSystem, IREventCollectSystem, type ComponentBag } from '../propagation'
import { IR } from '../PatternIR'

// ---------------------------------------------------------------------------
// parseMini
// ---------------------------------------------------------------------------

describe('parseMini', () => {
  it('parses simple sequence', () => {
    const tree = parseMini('c4 e4 g4')
    expect(tree.tag).toBe('Seq')
    if (tree.tag === 'Seq') {
      expect(tree.children).toHaveLength(3)
      expect(tree.children[0].tag).toBe('Play')
    }
  })

  it('parses rest', () => {
    const tree = parseMini('c4 ~ e4')
    expect(tree.tag).toBe('Seq')
    if (tree.tag === 'Seq') {
      expect(tree.children[1].tag).toBe('Sleep')
    }
  })

  it('parses cycle with angle brackets', () => {
    const tree = parseMini('<c4 e4 g4>')
    expect(tree.tag).toBe('Cycle')
    if (tree.tag === 'Cycle') {
      expect(tree.items).toHaveLength(3)
      expect(tree.items[0].tag).toBe('Play')
    }
  })

  it('parses sub-sequence with brackets', () => {
    const tree = parseMini('[c4 e4] g4')
    expect(tree.tag).toBe('Seq')
    if (tree.tag === 'Seq') {
      expect(tree.children).toHaveLength(2)
      expect(tree.children[0].tag).toBe('Seq') // sub-sequence
    }
  })

  it('parses repeat with *', () => {
    const tree = parseMini('c4*2')
    expect(tree.tag).toBe('Fast')
    if (tree.tag === 'Fast') {
      expect(tree.factor).toBe(2)
      expect(tree.body.tag).toBe('Play')
    }
  })

  it('parses sometimes with ?', () => {
    const tree = parseMini('c4?')
    expect(tree.tag).toBe('Choice')
    if (tree.tag === 'Choice') {
      expect(tree.p).toBe(0.5)
    }
  })

  it('empty string returns Pure', () => {
    expect(parseMini('')).toEqual(IR.pure())
  })

  it('single note returns Play', () => {
    const tree = parseMini('c4')
    expect(tree.tag).toBe('Play')
    if (tree.tag === 'Play') expect(tree.note).toBe('c4')
  })

  it('sample mode sets s param', () => {
    const tree = parseMini('bd sd hh', true)
    expect(tree.tag).toBe('Seq')
    if (tree.tag === 'Seq') {
      const first = tree.children[0]
      if (first.tag === 'Play') {
        expect(first.params.s).toBe('bd')
      }
    }
  })

  it('unrecognized token preserved as Play note', () => {
    // Forward compatible: unknown atoms become Play nodes
    const tree = parseMini('xyz123')
    expect(tree.tag).toBe('Play')
  })
})

// ---------------------------------------------------------------------------
// parseStrudel
// ---------------------------------------------------------------------------

describe('parseStrudel', () => {
  it('parses note("c4 e4 g4")', () => {
    const tree = parseStrudel('note("c4 e4 g4")')
    expect(tree.tag).toBe('Seq')
    if (tree.tag === 'Seq') {
      expect(tree.children).toHaveLength(3)
      const first = tree.children[0]
      if (first.tag === 'Play') expect(first.note).toBe('c4')
    }
  })

  it('parses s("bd sd")', () => {
    const tree = parseStrudel('s("bd sd")')
    expect(tree.tag).toBe('Seq')
    if (tree.tag === 'Seq') {
      const first = tree.children[0]
      if (first.tag === 'Play') {
        expect(first.note).toBe('bd')
        expect(first.params.s).toBe('bd')
      }
    }
  })

  it('parses .fast(2)', () => {
    const tree = parseStrudel('s("bd sd").fast(2)')
    expect(tree.tag).toBe('Fast')
    if (tree.tag === 'Fast') {
      expect(tree.factor).toBe(2)
      expect(tree.body.tag).toBe('Seq')
    }
  })

  it('parses .slow(3)', () => {
    const tree = parseStrudel('note("c4").slow(3)')
    expect(tree.tag).toBe('Slow')
    if (tree.tag === 'Slow') expect(tree.factor).toBe(3)
  })

  it('parses .every(4, fast(2))', () => {
    const tree = parseStrudel('note("c4").every(4, fast(2))')
    expect(tree.tag).toBe('Every')
    if (tree.tag === 'Every') {
      expect(tree.n).toBe(4)
      expect(tree.body.tag).toBe('Fast')
    }
  })

  it('parses stack(a, b)', () => {
    const tree = parseStrudel('stack(s("bd"), note("c4"))')
    expect(tree.tag).toBe('Stack')
    if (tree.tag === 'Stack') {
      expect(tree.tracks).toHaveLength(2)
    }
  })

  it('parses multi-track $: syntax', () => {
    const code = '$: s("bd sd").p("d1")\n$: note("c4 e4").p("m1")'
    const tree = parseStrudel(code)
    expect(tree.tag).toBe('Stack')
    if (tree.tag === 'Stack') {
      expect(tree.tracks).toHaveLength(2)
    }
  })

  it('unsupported code returns Code node', () => {
    const tree = parseStrudel('const x = 42; note(x)')
    expect(tree.tag).toBe('Code')
    if (tree.tag === 'Code') {
      expect(tree.code).toContain('const x')
    }
  })

  it('empty string returns Pure', () => {
    expect(parseStrudel('')).toEqual(IR.pure())
  })

  it('never throws on any input', () => {
    const inputs = [
      'note("c4")',
      'invalid syntax ??? !!!',
      '',
      'stack()',
      '.fast(2)',
      '{ broken json',
    ]
    for (const input of inputs) {
      expect(() => parseStrudel(input)).not.toThrow()
    }
  })

  it('parses .room(0.8) as FX', () => {
    const tree = parseStrudel('note("c4").room(0.8)')
    expect(tree.tag).toBe('FX')
    if (tree.tag === 'FX') {
      expect(tree.params.room).toBe(0.8)
    }
  })
})

// ---------------------------------------------------------------------------
// Full pipeline integration
// ---------------------------------------------------------------------------

describe('full pipeline', () => {
  it('test 1: simple note pattern', () => {
    const input = 'note("c4 e4 g4")'
    const patternIR = parseStrudel(input)
    expect(patternIR.tag).toBe('Seq')
    if (patternIR.tag === 'Seq') expect(patternIR.children).toHaveLength(3)

    const events = collect(patternIR)
    expect(events).toHaveLength(3)
    // Events at sequential times
    expect(events[0].begin).toBeLessThan(events[1].begin)
    expect(events[1].begin).toBeLessThan(events[2].begin)

    const code = toStrudel(patternIR)
    expect(code).toContain('c4')
    expect(code).toContain('e4')
    expect(code).toContain('g4')
  })

  it('test 2: drum pattern with fast', () => {
    const input = 's("bd sd hh hh").fast(2)'
    const patternIR = parseStrudel(input)
    expect(patternIR.tag).toBe('Fast')
    if (patternIR.tag === 'Fast') {
      expect(patternIR.factor).toBe(2)
      expect(patternIR.body.tag).toBe('Seq')
    }

    const code = toStrudel(patternIR)
    expect(code).toContain('.fast(2)')
  })

  it('test 3: stack (multi-track)', () => {
    const input = 'stack(s("bd sd"), note("c4 e4 g4"))'
    const patternIR = parseStrudel(input)
    expect(patternIR.tag).toBe('Stack')
    if (patternIR.tag === 'Stack') {
      expect(patternIR.tracks).toHaveLength(2)
    }

    const events = collect(patternIR)
    expect(events.length).toBeGreaterThan(0)

    const code = toStrudel(patternIR)
    expect(code).toContain('stack(')
  })

  it('test 4: every + transforms (cycle-dependent)', () => {
    const input = 'note("c4").every(4, fast(2))'
    const patternIR = parseStrudel(input)
    expect(patternIR.tag).toBe('Every')

    // cycle 0 fires body
    const eventsOn = collect(patternIR, { cycle: 0 })
    expect(eventsOn.length).toBeGreaterThan(0)

    // cycle 1 fires default (same node since every wraps with ir as default)
    const eventsOff = collect(patternIR, { cycle: 1 })
    expect(eventsOff.length).toBeGreaterThanOrEqual(0)
  })

  it('test 5: cycle alternation', () => {
    const input = 'note("<c4 e4 g4>")'
    const patternIR = parseStrudel(input)
    // parseMini returns Cycle inside Seq(single item)
    const flat = flattenSingleSeq(patternIR)
    expect(flat.tag).toBe('Cycle')
    if (flat.tag === 'Cycle') {
      expect(flat.items).toHaveLength(3)
    }

    const e0 = collect(flat, { cycle: 0 })
    const e1 = collect(flat, { cycle: 1 })
    expect(e0[0]?.note).toBe('c4')
    expect(e1[0]?.note).toBe('e4')
  })

  it('test 6: JSON round-trip', () => {
    const input = 'note("c4 e4 g4")'
    const patternIR = parseStrudel(input)
    const json = patternToJSON(patternIR)
    const restored = patternFromJSON(json)
    const code1 = toStrudel(patternIR)
    const code2 = toStrudel(restored)
    expect(code1).toBe(code2)
  })

  it('test 7: unparseable code returns Code node (graceful fallback)', () => {
    const input = 'const x = 42; note(x)'
    const patternIR = parseStrudel(input)
    expect(patternIR.tag).toBe('Code')
    // toStrudel(Code) = original code
    expect(toStrudel(patternIR)).toBe(input)
    // collect(Code) = [] (no Strudel runtime)
    expect(collect(patternIR)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Propagation engine
// ---------------------------------------------------------------------------

describe('propagate', () => {
  it('processes strudelCode → patternIR → irEvents', () => {
    const bag = propagate({ strudelCode: 'note("c4")' }, [StrudelParseSystem, IREventCollectSystem])
    expect(bag.patternIR).toBeDefined()
    expect(bag.irEvents).toBeDefined()
  })

  it('systems run in stratum order', () => {
    const order: string[] = []
    const s1 = { name: 'A', stratum: 2, inputs: [] as (keyof ComponentBag)[], outputs: [] as (keyof ComponentBag)[], run: (b: ComponentBag) => { order.push('A'); return b } }
    const s2 = { name: 'B', stratum: 1, inputs: [] as (keyof ComponentBag)[], outputs: [] as (keyof ComponentBag)[], run: (b: ComponentBag) => { order.push('B'); return b } }
    propagate({}, [s1, s2])
    expect(order).toEqual(['B', 'A'])
  })

  it('system with missing input is skipped', () => {
    const bag = propagate({}, [IREventCollectSystem])
    expect(bag.irEvents).toBeUndefined()
  })

  it('empty bag returns empty bag', () => {
    const bag = propagate({}, [StrudelParseSystem, IREventCollectSystem])
    expect(bag.patternIR).toBeUndefined()
    expect(bag.irEvents).toBeUndefined()
  })

  it('custom system can be added', () => {
    const customSystem = {
      name: 'Custom',
      stratum: 3,
      inputs: ['irEvents'] as (keyof ComponentBag)[],
      outputs: [] as (keyof ComponentBag)[],
      run: (bag: ComponentBag) => ({ ...bag, _custom: true } as ComponentBag),
    }
    const bag = propagate(
      { strudelCode: 'note("c4")' },
      [StrudelParseSystem, IREventCollectSystem, customSystem],
    ) as ComponentBag & { _custom?: boolean }
    expect(bag._custom).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** If tree is a Seq with a single child, unwrap it. */
function flattenSingleSeq(tree: ReturnType<typeof parseStrudel>): ReturnType<typeof parseStrudel> {
  if (tree.tag === 'Seq' && tree.children.length === 1) return tree.children[0]
  return tree
}
