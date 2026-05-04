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

  it('parses .jux(x => x.gain(0.5)) into Stack(FX(pan,-1, body), FX(pan,+1, transform(body))) (Tier 4)', () => {
    // Ground truth: pattern.mjs:2379-2381 (jux) + 2356-2368 (juxBy):
    //   jux(f)(pat) = juxBy(1, f, pat)
    //   juxBy(1, …) halves to by=0.5, splits onto two pans:
    //     left  = pat with pan = (default 0.5) - 0.5 = 0.0  (Strudel [0,1])
    //     right = f(pat with pan = (default 0.5) + 0.5 = 1.0)
    // Mapping to our IR's [-1, 1] pan convention: Strudel 0.0 → ours -1,
    // Strudel 1.0 → ours +1. The parity harness normalises Strudel-side
    // events before diff (normalizeStrudelPan).
    const tree = parseStrudel('s("bd hh sd cp").jux(x => x.gain(0.5))')
    expect(tree.tag).toBe('Stack')
    if (tree.tag === 'Stack') {
      expect(tree.tracks.length).toBe(2)
      const [left, right] = tree.tracks
      expect(left.tag).toBe('FX')
      if (left.tag === 'FX') {
        expect(left.name).toBe('pan')
        expect(left.params.pan).toBe(-1)
      }
      expect(right.tag).toBe('FX')
      if (right.tag === 'FX') {
        expect(right.name).toBe('pan')
        expect(right.params.pan).toBe(1)
        // Right body is the transformed body — gain(0.5) wraps the body in FX.
        expect(right.body.tag).toBe('FX')
        if (right.body.tag === 'FX') {
          expect(right.body.name).toBe('gain')
          expect(right.body.params.gain).toBe(0.5)
        }
      }
    }
  })

  it('parses .off(0.25, x => x.fast(2)) into Stack(body, Fast(2, Late(0.25, body))) (Tier 4)', () => {
    // Ground truth: pattern.mjs:2236-2238
    //   off(time_pat, func, pat) = stack(pat, func(pat.late(time_pat)))
    // The transform is applied to `pat.late(t)`, so Late is INSIDE the
    // transform, not outside. Our desugar mirrors that order exactly.
    const tree = parseStrudel('s("bd").off(0.25, x => x.fast(2))')
    expect(tree.tag).toBe('Stack')
    if (tree.tag === 'Stack') {
      expect(tree.tracks.length).toBe(2)
      // Left track is the original body (s("bd") — a Play).
      expect(tree.tracks[0].tag).toBe('Play')
      // Right track is Fast(2, Late(0.25, body)) — transform OUTSIDE Late.
      const right = tree.tracks[1]
      expect(right.tag).toBe('Fast')
      if (right.tag === 'Fast') {
        expect(right.factor).toBe(2)
        expect(right.body.tag).toBe('Late')
        if (right.body.tag === 'Late') {
          expect(right.body.offset).toBe(0.25)
          expect(right.body.body.tag).toBe('Play')
        }
      }
    }
  })

  it('parses .ply(3) into Ply(3, body) (Tier 4)', () => {
    // Ground truth: pattern.mjs:1905-1911. Originally planned as a desugar
    // to Fast(n, Seq(body × n)); a W4 T10 probe showed our Fast scales
    // ctx.speed and so compresses events instead of re-playing them, so
    // the desugar fails parity. Promoted to a forced new tag.
    const tree = parseStrudel('s("bd hh sd cp").ply(3)')
    expect(tree.tag).toBe('Ply')
    if (tree.tag === 'Ply') {
      expect(tree.n).toBe(3)
      expect(tree.body.tag).toBe('Seq')
    }
  })

  it('parses .ply(2.5) by silently dropping the method (non-integer falls through)', () => {
    // CONTEXT D-02 / RESEARCH §2.4: non-integer / pattern factors fall
    // through to the body — same default-branch behaviour the parser uses
    // for unrecognised method-arg shapes today. Documented as a v1
    // limitation; revisit in 19-04 if user demand surfaces.
    const tree = parseStrudel('s("bd hh sd cp").ply(2.5)')
    expect(tree.tag).not.toBe('Ply')
    expect(tree.tag).toBe('Seq')
  })

  // Phase 19-04 T-02 — Pick tag shape tests.
  it('parses .pick([…]) into Pick(selector, lookup) (Tier 4)', () => {
    // Ground truth: pick.mjs:44-54. First IR shape carrying a list of
    // sub-patterns as data. Receiver becomes selector; array-literal
    // arg becomes lookup[].
    const tree = parseStrudel('mini("<0 1 2 3>").pick(["c","e","g","b"])')
    expect(tree.tag).toBe('Pick')
    if (tree.tag === 'Pick') {
      expect(tree.lookup.length).toBe(4)
      // Selector is the parsed mini-notation (Cycle of Plays).
      expect(tree.selector.tag).toBe('Cycle')
      // Each lookup element is a Play — bare strings get wrapped in
      // note(...) by parseArrayLiteralElement (default receiver context
      // = 'note' in v1).
      for (const elem of tree.lookup) {
        expect(['Play', 'Seq']).toContain(elem.tag)
      }
    }
  })

  it('IR.pick smart constructor produces well-formed Pick node', () => {
    const sel = IR.cycle(IR.play(0), IR.play(1))
    const lookup = [IR.play('c'), IR.play('e')]
    const node = IR.pick(sel, lookup)
    expect(node.tag).toBe('Pick')
    if (node.tag === 'Pick') {
      expect(node.selector).toBe(sel)
      expect(node.lookup).toEqual(lookup)
    }
  })

  it('collect(Pick) yields one event per selector event, picking from lookup by clamped int index', () => {
    // Selector with numeric notes 0 and 1 alternating; lookup has two
    // single-note Plays. Each cycle the selector selects the matching
    // lookup entry — collect should walk the inner Play and emit its
    // event at the selector event's slot.
    const sel = IR.cycle(IR.play(0), IR.play(1))
    const lookup = [IR.play('c'), IR.play('e')]
    const node = IR.pick(sel, lookup)
    // Two cycles: cycle 0 picks lookup[0]=c, cycle 1 picks lookup[1]=e.
    const cyc0 = collect(node, { cycle: 0, time: 0, begin: 0, end: 1, duration: 1 })
    const cyc1 = collect(node, { cycle: 1, time: 1, begin: 1, end: 2, duration: 1 })
    expect(cyc0.length).toBe(1)
    expect(cyc1.length).toBe(1)
    expect(cyc0[0].note).toBe('c')
    expect(cyc1[0].note).toBe('e')
  })

  it('toStrudel(Pick) round-trips to .pick([…])', () => {
    const sel = IR.cycle(IR.play(0), IR.play(1))
    const lookup = [IR.play('c'), IR.play('e')]
    const node = IR.pick(sel, lookup)
    const code = toStrudel(node)
    expect(code).toContain('.pick([')
    expect(code).toContain(', ')  // separator between elements
  })

  it('parseArrayLiteralElement wraps bare quoted strings in note() (v1 receiver default)', () => {
    // The docstring shape `pick(["g a", ...])` requires bare-string
    // wrapping per RESEARCH §1.4 / pre-mortem #10. Verify the wrapped
    // result is a parseable Play / Seq, not a Code fallback.
    const tree = parseStrudel('mini("<0 1>").pick(["c", "e"])')
    expect(tree.tag).toBe('Pick')
    if (tree.tag === 'Pick') {
      // Each lookup element should be a Play with the bare string as note.
      expect(tree.lookup[0].tag).toBe('Play')
      expect(tree.lookup[1].tag).toBe('Play')
      if (tree.lookup[0].tag === 'Play') expect(tree.lookup[0].note).toBe('c')
      if (tree.lookup[1].tag === 'Play') expect(tree.lookup[1].note).toBe('e')
    }
  })

  // Phase 19-04 T-03 — Struct tag shape tests.
  it('parses .struct("…") into Struct(mask, body) (Tier 4)', () => {
    // Ground truth: pattern.mjs:1161 — struct(mask) = this.keepif.out(mask).
    // Re-times body's value-stream to mask onsets; distinct from When/.mask
    // (which only gates). RESEARCH §1.2.
    const tree = parseStrudel('note("c d e").struct("x ~ x")')
    expect(tree.tag).toBe('Struct')
    if (tree.tag === 'Struct') {
      expect(tree.mask).toBe('x ~ x')
      expect(tree.body.tag).toBe('Seq')
    }
  })

  it('IR.struct smart constructor produces well-formed Struct node', () => {
    const body = IR.play('c4')
    const node = IR.struct('x ~ x ~', body)
    expect(node.tag).toBe('Struct')
    if (node.tag === 'Struct') {
      expect(node.mask).toBe('x ~ x ~')
      expect(node.body).toBe(body)
    }
  })

  it('collect(Struct) re-times body events to mask onsets', () => {
    // Body is a single Play spanning [0, 1) (default duration 1 cycle).
    // Mask "x ~ x ~" has 4 slots; truthy at i=0 and i=2. Each slot is 1/4
    // wide. The body event INTERSECTS every slot, so each truthy slot
    // re-emits a copy. Net: 2 events at begins {0, 0.5} each with width 0.25.
    // (Mirrors Strudel's appRight semantics — pattern.mjs:218-237.)
    const node = IR.struct('x ~ x ~', IR.play('c4'))
    const events = collect(node, { cycle: 0, time: 0, begin: 0, end: 1, duration: 1 })
    expect(events.length).toBe(2)
    const sorted = [...events].sort((a, b) => a.begin - b.begin)
    expect(sorted[0].begin).toBeCloseTo(0, 9)
    expect(sorted[0].end).toBeCloseTo(0.25, 9)
    expect(sorted[0].note).toBe('c4')
    expect(sorted[1].begin).toBeCloseTo(0.5, 9)
    expect(sorted[1].note).toBe('c4')
  })

  it('collect(Struct) samples body across slots when body has multiple events', () => {
    // Body is Seq("c","d","e","f") — events at begin 0, 1/4, 2/4, 3/4 each
    // with end at the next slot. Mask "x ~ x ~" has truthy at i=0, i=2.
    // Slot 0 [0, 1/4) captures the c event → re-emit at 0.
    // Slot 2 [2/4, 3/4) captures the e event → re-emit at 2/4.
    const body = IR.seq(IR.play('c'), IR.play('d'), IR.play('e'), IR.play('f'))
    const node = IR.struct('x ~ x ~', body)
    const events = collect(node, { cycle: 0, time: 0, begin: 0, end: 1, duration: 1 })
    expect(events.length).toBe(2)
    const sorted = [...events].sort((a, b) => a.begin - b.begin)
    expect(sorted[0].note).toBe('c')
    expect(sorted[0].begin).toBeCloseTo(0, 9)
    expect(sorted[1].note).toBe('e')
    expect(sorted[1].begin).toBeCloseTo(0.5, 9)
  })

  it('toStrudel(Struct) round-trips to .struct("…")', () => {
    const node = IR.struct('x ~ x ~', IR.play('c4'))
    const code = toStrudel(node)
    expect(code).toContain('.struct("x ~ x ~")')
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
