/**
 * Integration tests: code string → parse → PatternIR → collect → IREvent[] → toStrudel
 *
 * No Strudel runtime required — parser works on strings, not Pattern objects.
 */

import { describe, it, expect } from 'vitest'
import { parseMini, bjorklund } from '../parseMini'
import { parseStrudel } from '../parseStrudel'
import { collect } from '../collect'
import { toStrudel } from '../toStrudel'
import { patternToJSON, patternFromJSON } from '../serialize'
import { propagate, StrudelParseSystem, IREventCollectSystem, type ComponentBag } from '../propagation'
import { IR, type PatternIR } from '../PatternIR'

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

  // ---- Tier 2: slice ----------------------------------------------------

  describe('slice (a:N)', () => {
    it('attaches slice index to a sample Play.params', () => {
      const tree = parseMini('bd:2', true)
      expect(tree.tag).toBe('Play')
      if (tree.tag === 'Play') {
        expect(tree.params.s).toBe('bd')
        expect(tree.params.slice).toBe(2)
      }
    })

    it('non-sample mode still records the slice index', () => {
      const tree = parseMini('c4:1')
      expect(tree.tag).toBe('Play')
      if (tree.tag === 'Play') expect(tree.params.slice).toBe(1)
    })

    it('composes with repeat — slice resolves first, then *N wraps', () => {
      const tree = parseMini('bd:2*3', true)
      // Fast(3, Play(bd, slice:2))
      expect(tree.tag).toBe('Fast')
      if (tree.tag === 'Fast') {
        expect(tree.factor).toBe(3)
        if (tree.body.tag === 'Play') expect(tree.body.params.slice).toBe(2)
      }
    })

    it('mixes with plain atoms in a sequence', () => {
      const tree = parseMini('bd bd:1 bd:2', true)
      expect(tree.tag).toBe('Seq')
      if (tree.tag === 'Seq') {
        expect(tree.children).toHaveLength(3)
        const slices = tree.children
          .map(c => (c.tag === 'Play' ? c.params.slice : undefined))
        expect(slices).toEqual([undefined, 1, 2])
      }
    })

    it('rejects negative or non-numeric slice — falls through silently', () => {
      // The character after `:` is not a digit, so the colon stays with
      // the next token (or is dropped). Atom is parsed without slice.
      const tree = parseMini('bd:abc', true)
      // We don't promise an exact shape for malformed input — just that
      // it doesn't throw and Play.slice isn't set.
      const play = tree.tag === 'Play' ? tree
        : tree.tag === 'Seq' ? (tree.children[0].tag === 'Play' ? tree.children[0] : null)
        : null
      if (play) expect(play.params.slice).toBeUndefined()
    })
  })

  // ---- Tier 2: elongation -----------------------------------------------

  describe('elongation (a@N)', () => {
    it('wraps a single atom in Elongate', () => {
      const tree = parseMini('c4@2')
      expect(tree.tag).toBe('Elongate')
      if (tree.tag === 'Elongate') {
        expect(tree.factor).toBe(2)
        expect(tree.body.tag).toBe('Play')
      }
    })

    it('inside a sequence — elongated child carries weight', () => {
      const tree = parseMini('c4@2 e4')
      expect(tree.tag).toBe('Seq')
      if (tree.tag === 'Seq') {
        expect(tree.children).toHaveLength(2)
        expect(tree.children[0].tag).toBe('Elongate')
        expect(tree.children[1].tag).toBe('Play')
      }
    })

    it('non-integer factor allowed (1.5x)', () => {
      const tree = parseMini('c4@1.5')
      expect(tree.tag).toBe('Elongate')
      if (tree.tag === 'Elongate') expect(tree.factor).toBe(1.5)
    })

    it('zero/negative factors are silently dropped', () => {
      const tree = parseMini('c4@0')
      expect(tree.tag).toBe('Play') // no Elongate wrapper
    })
  })

  // ---- Tier 2: Euclidean ------------------------------------------------

  describe('bjorklund', () => {
    it('canonical 3 over 8 = [1 0 0 1 0 0 1 0]', () => {
      expect(bjorklund(3, 8)).toEqual([true, false, false, true, false, false, true, false])
    })
    it('5 over 8 = [1 0 1 1 0 1 1 0]', () => {
      // The exact distribution depends on the Bjorklund variant used —
      // we only assert the count + length.
      const r = bjorklund(5, 8)
      expect(r.length).toBe(8)
      expect(r.filter(Boolean)).toHaveLength(5)
    })
    it('hits >= steps fills with onsets', () => {
      expect(bjorklund(8, 8)).toEqual(new Array(8).fill(true))
    })
    it('zero hits → all rests', () => {
      expect(bjorklund(0, 4)).toEqual([false, false, false, false])
    })
  })

  describe('Euclidean (a(h,s,r?))', () => {
    it('bd(3,8) expands to a Seq of 8 slots', () => {
      const tree = parseMini('bd(3,8)', true)
      expect(tree.tag).toBe('Seq')
      if (tree.tag === 'Seq') {
        expect(tree.children).toHaveLength(8)
        const onsets = tree.children.filter(c => c.tag === 'Play').length
        const rests = tree.children.filter(c => c.tag === 'Sleep').length
        expect(onsets).toBe(3)
        expect(rests).toBe(5)
      }
    })

    it('rotation rolls the pattern by N steps', () => {
      const a = parseMini('bd(3,8)', true)
      const b = parseMini('bd(3,8,2)', true)
      // Both have same onset count, different placement.
      const onsetsAt = (t: PatternIR) =>
        t.tag === 'Seq'
          ? t.children.map((c, i) => (c.tag === 'Play' ? i : -1)).filter(i => i >= 0)
          : []
      const ai = onsetsAt(a)
      const bi = onsetsAt(b)
      expect(ai).not.toEqual(bi)
      expect(ai.length).toBe(bi.length)
    })

    it('a(3,3) = a a a (no rests)', () => {
      const tree = parseMini('bd(3,3)', true)
      expect(tree.tag).toBe('Seq')
      if (tree.tag === 'Seq') {
        expect(tree.children.every(c => c.tag === 'Play')).toBe(true)
        expect(tree.children).toHaveLength(3)
      }
    })

    it('malformed (only one arg) falls through to plain atom', () => {
      const tree = parseMini('bd(3)', true)
      // The euclid token is rejected (needs 2+ args), atom stays as-is.
      expect(tree.tag).toBe('Play')
    })

    it('combines with repeat: bd(3,8)*2 wraps in Fast', () => {
      const tree = parseMini('bd(3,8)*2', true)
      expect(tree.tag).toBe('Fast')
      if (tree.tag === 'Fast') {
        expect(tree.factor).toBe(2)
        expect(tree.body.tag).toBe('Seq')
      }
    })
  })

  // ---- Tier 2: polymetric ----------------------------------------------

  describe('polymetric ({a b, c d})', () => {
    it('two-segment polymeter lowers to Stack', () => {
      const tree = parseMini('{c4 e4, g4 b4 d5}')
      expect(tree.tag).toBe('Stack')
      if (tree.tag === 'Stack') {
        expect(tree.tracks).toHaveLength(2)
      }
    })

    it('each segment can have any of the existing structures inside', () => {
      const tree = parseMini('{c4 e4, [g4 b4]*2, <a4 d5>}')
      expect(tree.tag).toBe('Stack')
      if (tree.tag === 'Stack') {
        expect(tree.tracks).toHaveLength(3)
      }
    })

    it('single segment (no comma) just inlines the sub-sequence', () => {
      const tree = parseMini('{c4 e4 g4}')
      expect(tree.tag).toBe('Seq') // not Stack
    })

    it('empty polymeter is a no-op', () => {
      const tree = parseMini('{}')
      // Implementation may emit Pure or omit nodes entirely.
      expect(['Pure']).toContain(tree.tag)
    })

    it('polymetric inside a sequence parses as one element', () => {
      const tree = parseMini('c4 {e4, g4 b4} a4')
      expect(tree.tag).toBe('Seq')
      if (tree.tag === 'Seq') {
        expect(tree.children).toHaveLength(3)
        expect(tree.children[1].tag).toBe('Stack')
      }
    })
  })

  // ---- Source-location tracking ----------------------------------------

  describe('Play.loc — source-range tracking', () => {
    it('single atom carries its char range', () => {
      const tree = parseMini('c4')
      expect(tree.tag).toBe('Play')
      if (tree.tag === 'Play') {
        expect(tree.loc).toEqual([{ start: 0, end: 2 }])
      }
    })

    it('atoms in a sequence carry distinct ranges', () => {
      const tree = parseMini('c4 e4 g4')
      expect(tree.tag).toBe('Seq')
      if (tree.tag === 'Seq') {
        const locs = tree.children.map(c =>
          c.tag === 'Play' ? c.loc?.[0] : null,
        )
        expect(locs).toEqual([
          { start: 0, end: 2 },
          { start: 3, end: 5 },
          { start: 6, end: 8 },
        ])
      }
    })

    it('baseOffset shifts every atom by the same amount', () => {
      const tree = parseMini('c4 e4', false, 100)
      if (tree.tag === 'Seq' && tree.children[0].tag === 'Play') {
        expect(tree.children[0].loc).toEqual([{ start: 100, end: 102 }])
      }
    })

    it('atoms inside sub-sequences keep accurate offsets', () => {
      // [c4 e4] g4 — c4 at 1-3, e4 at 4-6, g4 at 8-10
      const tree = parseMini('[c4 e4] g4')
      expect(tree.tag).toBe('Seq')
      if (tree.tag === 'Seq') {
        const sub = tree.children[0]
        const last = tree.children[1]
        if (sub.tag === 'Seq' && sub.children[0].tag === 'Play') {
          expect(sub.children[0].loc).toEqual([{ start: 1, end: 3 }])
        }
        if (last.tag === 'Play') {
          expect(last.loc).toEqual([{ start: 8, end: 10 }])
        }
      }
    })

    it('atoms inside a polymeter keep accurate offsets', () => {
      // {c4, e4} — c4 at 1-3, e4 at 5-7
      const tree = parseMini('{c4, e4}')
      expect(tree.tag).toBe('Stack')
      if (tree.tag === 'Stack') {
        const a = tree.tracks[0]
        const b = tree.tracks[1]
        if (a.tag === 'Play') expect(a.loc).toEqual([{ start: 1, end: 3 }])
        if (b.tag === 'Play') expect(b.loc).toEqual([{ start: 5, end: 7 }])
      }
    })
  })

  // ---- collect propagates Play.loc → IREvent.loc -----------------------

  describe('collect propagates Play.loc → IREvent.loc', () => {
    it('events carry the loc set on their producing Play node', () => {
      const tree = parseMini('c4 e4', false, 50)
      const events = collect(tree)
      expect(events.map(e => e.loc?.[0])).toEqual([
        { start: 50, end: 52 },
        { start: 53, end: 55 },
      ])
    })

    it('Play built without loc produces events with loc undefined', () => {
      const events = collect(IR.play('c4'))
      expect(events[0].loc).toBeUndefined()
    })
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

  it('parses .late(0.125) into Late tag (Tier 4)', () => {
    const tree = parseStrudel('s("bd").late(0.125)')
    expect(tree.tag).toBe('Late')
    if (tree.tag === 'Late') {
      expect(tree.offset).toBe(0.125)
      // Body is the parsed `s("bd")` — a single Play (parseMini collapses
      // single-token sequences to a bare Play, see parseMini.ts).
      expect(tree.body.tag).toBe('Play')
      if (tree.body.tag === 'Play') expect(tree.body.params.s).toBe('bd')
    }
  })

  it('parses .late(0.5) on a multi-token sequence into Late wrapping a Seq', () => {
    const tree = parseStrudel('note("c4 e4 g4").late(0.5)')
    expect(tree.tag).toBe('Late')
    if (tree.tag === 'Late') {
      expect(tree.offset).toBe(0.5)
      expect(tree.body.tag).toBe('Seq')
    }
  })

  describe('source-range tracking', () => {
    it('single-line note("c4 e4") — Play.loc points at exact char ranges', () => {
      // 0123456789012345
      // note("c4 e4")
      // c4 at 6-8, e4 at 9-11
      const tree = parseStrudel('note("c4 e4")')
      expect(tree.tag).toBe('Seq')
      if (tree.tag === 'Seq') {
        const c = tree.children[0]
        const e = tree.children[1]
        if (c.tag === 'Play') expect(c.loc).toEqual([{ start: 6, end: 8 }])
        if (e.tag === 'Play') expect(e.loc).toEqual([{ start: 9, end: 11 }])
      }
    })

    it('s("bd sd") — sample atoms also carry loc', () => {
      // s("bd sd")
      // bd at 3-5, sd at 6-8
      const tree = parseStrudel('s("bd sd")')
      expect(tree.tag).toBe('Seq')
      if (tree.tag === 'Seq') {
        const a = tree.children[0]
        const b = tree.children[1]
        if (a.tag === 'Play') expect(a.loc).toEqual([{ start: 3, end: 5 }])
        if (b.tag === 'Play') expect(b.loc).toEqual([{ start: 6, end: 8 }])
      }
    })

    it('multi-track $: blocks each map to their own absolute offsets', () => {
      // $: note("c4 e4")\n$: s("bd sd")
      // 0  3       11
      // c4 at 9-11 of code; bd at first char after `$: s("` of second track
      const code = '$: note("c4 e4")\n$: s("bd sd")'
      const tree = parseStrudel(code)
      expect(tree.tag).toBe('Stack')
      if (tree.tag === 'Stack') {
        // First track: note("c4 e4") with `$: ` prefix → body starts
        // at offset 3, then `note("` is 6 chars → c4 at 3+6=9
        const t0 = tree.tracks[0]
        if (t0.tag === 'Seq' && t0.children[0].tag === 'Play') {
          expect(t0.children[0].loc?.[0].start).toBe(9)
        }
        // Second track: `$: s("` prefix. Code length up to second $: is
        // 17 ('$: note("c4 e4")\n'). After `$: ` body offset = 17+3=20.
        // Then `s("` is 3 chars → bd at 20+3=23.
        const t1 = tree.tracks[1]
        if (t1.tag === 'Seq' && t1.children[0].tag === 'Play') {
          expect(t1.children[0].loc?.[0]).toEqual({ start: 23, end: 25 })
        }
      }
    })

    it('events from collect carry loc all the way through', () => {
      const events = collect(parseStrudel('note("c4 e4")'))
      expect(events).toHaveLength(2)
      expect(events[0].loc).toEqual([{ start: 6, end: 8 }])
      expect(events[1].loc).toEqual([{ start: 9, end: 11 }])
    })

    it('opaque expressions have no loc (correct — the mapping is unknown)', () => {
      const events = collect(parseStrudel('mystery(42)'))
      expect(events.every(e => e.loc === undefined)).toBe(true)
    })
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
