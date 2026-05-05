/**
 * Unit tests for the IR Inspector projection rules.
 *
 * Phase 19-06 (#76) — covers all 30 rows of RESEARCH §2 truth-table
 * plus the .off() 4-arrow-shape coverage (RESEARCH §2.x), Code
 * whitelist (NEW pre-mortem #8), Pure-as-Choice.else_ filter (NEW
 * pre-mortem #10), and direct stripInnerLate edge cases.
 *
 * Imports parseStrudel from the editor source path directly to avoid
 * the @stave/editor barrel pulling in the p5/gifenc transitive
 * dependencies (vitest's ESM loader can't resolve gifenc).
 */
import { describe, it, expect } from 'vitest'
import { parseStrudel } from '../../../../editor/src/ir/parseStrudel'
import { IR, type PatternIR } from '../../../../editor/src/ir/PatternIR'
import { runRawStage } from '../../../../editor/src/ir/parseStrudelStages'
import {
  projectedLabel,
  projectedChildren,
  stripInnerLate,
  LOCALSTORAGE_KEY,
} from '../irProjection'

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function parseRoot(code: string): PatternIR {
  return parseStrudel(code)
}

/**
 * Walk the IR tree (raw children, NOT projected) and return the first
 * node matching the predicate, or null.
 */
function find(
  node: PatternIR,
  pred: (n: PatternIR) => boolean,
): PatternIR | null {
  if (pred(node)) return node
  const kids = rawChildren(node)
  for (const k of kids) {
    const hit = find(k, pred)
    if (hit) return hit
  }
  return null
}

function rawChildren(node: PatternIR): readonly PatternIR[] {
  switch (node.tag) {
    case 'Seq':   return node.children
    case 'Stack': return node.tracks
    case 'Cycle': return node.items
    case 'Choice': return [node.then, node.else_]
    case 'Every': return node.default_ ? [node.body, node.default_] : [node.body]
    case 'When':  return [node.body]
    case 'FX':
    case 'Ramp':
    case 'Fast':
    case 'Slow':
    case 'Elongate':
    case 'Late':
    case 'Degrade':
    case 'Ply':
    case 'Struct':
    case 'Swing':
    case 'Shuffle':
    case 'Scramble':
    case 'Chop':
    case 'Loop':
      return [node.body]
    case 'Chunk': return [node.body, node.transform]
    case 'Pick':  return [node.selector, ...node.lookup]
    default:      return []
  }
}

// -----------------------------------------------------------------------------
// Module-scope constant
// -----------------------------------------------------------------------------

describe('LOCALSTORAGE_KEY', () => {
  it('uses the colon-prefix convention (RESEARCH §5.2)', () => {
    expect(LOCALSTORAGE_KEY).toBe('stave:inspector.irMode')
  })
})

// -----------------------------------------------------------------------------
// projectedLabel
// -----------------------------------------------------------------------------

describe('projectedLabel — user-callable tags use userMethod (PV31 first consumer)', () => {
  it('Stack from .layer() projects to "layer"', () => {
    const ir = parseRoot('note("c d e f").layer(x => x.add("0,2"))')
    expect(projectedLabel(ir)).toBe('layer')
  })

  it('Stack from .jux() projects to "jux"', () => {
    const ir = parseRoot('s("bd hh sd cp").jux(x => x.gain(0.5))')
    expect(projectedLabel(ir)).toBe('jux')
  })

  it('Stack from .off() projects to "off"', () => {
    const ir = parseRoot('s("bd hh sd cp").off(0.125, x => x.gain(0.5))')
    expect(projectedLabel(ir)).toBe('off')
  })

  it('Stack from stack() literal projects to "stack" (PV31 distinguishes from layer/jux/off)', () => {
    const ir = parseRoot('stack(s("bd"), s("hh"))')
    expect(projectedLabel(ir)).toBe('stack')
  })

  it('Late projects to "late"', () => {
    const ir = parseRoot('s("bd").late(0.125)')
    expect(projectedLabel(ir)).toBe('late')
  })

  it('Degrade from .degrade() projects to "degrade"', () => {
    const ir = parseRoot('s("bd hh sd cp ride lt mt ht").degrade()')
    expect(projectedLabel(ir)).toBe('degrade')
  })

  it('Degrade from .degradeBy() projects to "degradeBy" (PV31 distinguishes)', () => {
    const ir = parseRoot('s("bd hh sd cp ride lt mt ht").degradeBy(0.3)')
    expect(projectedLabel(ir)).toBe('degradeBy')
  })

  it.each([
    ['s("bd hh sd cp").chunk(4, x => x.gain(0.5))', 'chunk'],
    ['s("bd").ply(3)', 'ply'],
    ['mini("<0 1 2 3>").pick(["c","e","g","b"]).note()', 'pick'],
    ['note("c d e f").struct("x ~ x ~ x")', 'struct'],
    ['note("c d e f g h").swing(2)', 'swing'],
    ['note("c d e f").shuffle(4)', 'shuffle'],
    ['note("c d e f").scramble(4)', 'scramble'],
    ['s("bd").chop(4)', 'chop'],
    ['s("bd").fast(2)', 'fast'],
    ['s("bd").slow(2)', 'slow'],
    ['s("bd").every(2, x => x.fast(2))', 'every'],
    ['s("bd").gain(0.5)', 'gain'],
  ])('parses %s and projects label %s', (code, expected) => {
    const ir = parseRoot(code)
    expect(projectedLabel(ir)).toBe(expected)
  })

  it('Choice from .sometimes() projects to "sometimes" (Choice with userMethod)', () => {
    const ir = parseRoot('s("bd").sometimes(x => x.gain(0.5))')
    // sometimes desugars to Choice; userMethod set to 'sometimes'.
    expect(projectedLabel(ir)).toBe('sometimes')
  })
})

describe('projectedLabel — mini-notation symbols (D-03)', () => {
  it('Sleep from `~` projects to "~"', () => {
    const ir = parseRoot('s("bd ~ sd")')
    const sleep = find(ir, (n) => n.tag === 'Sleep')
    expect(sleep).not.toBeNull()
    expect(projectedLabel(sleep!)).toBe('~')
  })

  it('Cycle from `<>` projects to "<>"', () => {
    const ir = parseRoot('s("<bd hh sd>")')
    const cycle = find(ir, (n) => n.tag === 'Cycle')
    expect(cycle).not.toBeNull()
    expect(projectedLabel(cycle!)).toBe('<>')
  })

  it('Choice from `?` projects to "?"', () => {
    const ir = parseRoot('s("bd?")')
    const choice = find(ir, (n) => n.tag === 'Choice')
    expect(choice).not.toBeNull()
    expect(projectedLabel(choice!)).toBe('?')
  })

  it('Fast from `*4` projects to "*4" (symbol-with-value)', () => {
    const ir = parseRoot('s("bd*4")')
    const fast = find(
      ir,
      (n) => n.tag === 'Fast' && n.userMethod === undefined,
    )
    expect(fast).not.toBeNull()
    expect(projectedLabel(fast!)).toBe('*4')
  })

  it('Fast from `*2` projects to "*2" (distinguished from *4)', () => {
    const ir = parseRoot('s("bd*2")')
    const fast = find(
      ir,
      (n) => n.tag === 'Fast' && n.userMethod === undefined,
    )
    expect(fast).not.toBeNull()
    expect(projectedLabel(fast!)).toBe('*2')
  })

  it('Elongate from `@2` projects to "@2"', () => {
    const ir = parseRoot('s("bd@2 sd")')
    const elong = find(ir, (n) => n.tag === 'Elongate')
    expect(elong).not.toBeNull()
    expect(projectedLabel(elong!)).toBe('@2')
  })

  it('Stack from polymetric `{a, b}` projects to "{}"', () => {
    const ir = parseRoot('s("{bd, sd hh}")')
    const stack = find(
      ir,
      (n) => n.tag === 'Stack' && n.userMethod === undefined,
    )
    expect(stack).not.toBeNull()
    expect(projectedLabel(stack!)).toBe('{}')
  })

  it('Seq from inner `[bd sd]` projects to "[]"', () => {
    const ir = parseRoot('s("[bd sd] hh")')
    const seq = find(
      ir,
      (n) => n.tag === 'Seq' && n.userMethod === undefined,
    )
    expect(seq).not.toBeNull()
    expect(projectedLabel(seq!)).toBe('[]')
  })
})

describe('projectedLabel — Code whitelist (RESEARCH NEW pre-mortem #8)', () => {
  it('Code from parser fall-through projects to "Code" (NOT undefined-hidden)', () => {
    // unknownFn(...) is unparseable as a root; parseStrudel returns IR.code(...)
    const ir = parseRoot('unknownFn("foo")')
    expect(ir.tag).toBe('Code')
    expect(projectedLabel(ir)).toBe('Code')
  })

  it('directly-constructed Code with no userMethod projects to "Code"', () => {
    const code: PatternIR = IR.code('foo bar')
    expect(projectedLabel(code)).toBe('Code')
  })
})

describe('projectedLabel — synthetic intermediates hidden (D-02)', () => {
  it('Late inside .off() (userMethod undefined) returns undefined', () => {
    const ir = parseRoot('s("bd").off(0.125, x => x.gain(0.5))')
    const late = find(
      ir,
      (n) => n.tag === 'Late' && n.userMethod === undefined,
    )
    expect(late).not.toBeNull()
    expect(projectedLabel(late!)).toBeUndefined()
  })

  it('FX(pan,-1) inside .jux() (userMethod undefined) returns undefined', () => {
    const ir = parseRoot('s("bd").jux(x => x.gain(0.5))')
    const fx = find(
      ir,
      (n) => n.tag === 'FX' && n.userMethod === undefined,
    )
    expect(fx).not.toBeNull()
    expect(projectedLabel(fx!)).toBeUndefined()
  })

  it('Pure node (synthetic, userMethod undefined) returns undefined', () => {
    const pure: PatternIR = IR.pure()
    expect(projectedLabel(pure)).toBeUndefined()
  })
})

describe('projectedLabel — Play leaf', () => {
  it('Play (no userMethod field) projects to "Play"', () => {
    const ir = parseRoot('s("bd")')
    // s("bd") with a single token returns a Play directly (or wrapped in Seq).
    const play = find(ir, (n) => n.tag === 'Play')
    expect(play).not.toBeNull()
    expect(projectedLabel(play!)).toBe('Play')
  })
})

// -----------------------------------------------------------------------------
// projectedChildren
// -----------------------------------------------------------------------------

describe('projectedChildren — layer (tracks verbatim, drop the Stack)', () => {
  it('returns the f(body) and g(body) sub-IRs, no scaffolding', () => {
    const ir = parseRoot('note("c d e f").layer(x => x.add("0,2"))')
    const kids = projectedChildren(ir)
    expect(kids.length).toBeGreaterThanOrEqual(1)
    // Each kid should NOT itself be a Stack (the wrapping was the IR-mode shape).
    for (const k of kids) {
      expect(k.tag).not.toBe('Stack')
    }
  })
})

describe('projectedChildren — jux (strip the FX(pan,±1) wrappers)', () => {
  it('returns [body, transformed] with no synthetic FX(pan) wrapping', () => {
    const ir = parseRoot('s("bd").jux(x => x.gain(0.5))')
    const kids = projectedChildren(ir)
    expect(kids.length).toBe(2)
    const t0 = kids[0]
    const t1 = kids[1]
    // Neither side should be a synthetic FX(pan) at the top.
    expect(!(t0.tag === 'FX' && t0.userMethod === undefined)).toBe(true)
    expect(!(t1.tag === 'FX' && t1.userMethod === undefined)).toBe(true)
  })
})

describe('projectedChildren — off (strip the inner Late, RESEARCH §2.x option a)', () => {
  function hasSyntheticLate(n: PatternIR): boolean {
    if (n.tag === 'Late' && n.userMethod === undefined) return true
    const kids = rawChildren(n)
    for (const k of kids) {
      if (hasSyntheticLate(k)) return true
    }
    return false
  }

  it.each([
    ['x => x.gain(0.5)'],
    ['x => x.fast(2)'],
    ['x => x.late(0.125)'],
    ['x => x.gain(0.5).fast(2)'],
  ])('strips synthetic Late from transform body for %s', (transformExpr) => {
    const code = `s("bd").off(0.125, ${transformExpr})`
    const ir = parseRoot(code)
    const kids = projectedChildren(ir)
    expect(kids.length).toBe(2)
    const transformed = kids[1]
    expect(hasSyntheticLate(transformed)).toBe(false)
  })

  it('preserves user-typed .late() (userMethod set) inside transform', () => {
    // x => x.late(...) — the user-typed Late should NOT be stripped (only
    // the synthetic one with userMethod undefined gets stripped).
    const ir = parseRoot('s("bd").off(0.125, x => x.late(0.0625))')
    const kids = projectedChildren(ir)
    expect(kids.length).toBe(2)
    const transformed = kids[1]
    // The user-typed Late should still be visible (its userMethod is 'late').
    function hasUserLate(n: PatternIR): boolean {
      if (n.tag === 'Late' && n.userMethod === 'late') return true
      const ks = rawChildren(n)
      for (const k of ks) if (hasUserLate(k)) return true
      return false
    }
    expect(hasUserLate(transformed)).toBe(true)
  })
})

describe('projectedChildren — Choice (drop Pure else_ from mini `?`)', () => {
  it('mini `bd?` Choice has 1 projected child, not 2 (RESEARCH NEW pre-mortem #10)', () => {
    const ir = parseRoot('s("bd?")')
    const choice = find(ir, (n) => n.tag === 'Choice')
    expect(choice).not.toBeNull()
    const kids = projectedChildren(choice!)
    expect(kids.length).toBe(1)
  })

  it('user-typed Choice with non-Pure else_ keeps both children', () => {
    // Construct directly — the parser doesn't expose a chained .choice path;
    // use the smart constructor to model a hypothetical user-typed Choice.
    const choice: PatternIR = IR.choice(
      0.3,
      IR.play('bd'),
      IR.play('hh'),
      { userMethod: 'choice' },
    )
    const kids = projectedChildren(choice)
    expect(kids.length).toBe(2)
  })
})

describe('projectedChildren — stack(...) literal (tracks verbatim, no projection)', () => {
  it('parses stack(a, b) and projects children as the two raw track sub-IRs', () => {
    const ir = parseRoot('stack(s("bd"), s("hh"))')
    const kids = projectedChildren(ir)
    expect(kids.length).toBe(2)
  })
})

describe('projectedChildren — deep-nested-hide composition (CONSIDER C7)', () => {
  it('does not crash on nested .jux() inside .off()', () => {
    const ir = parseRoot('s("bd").off(0.125, x => x.jux(y => y.gain(0.5)))')
    // Just verify the rules don't throw and produce a sensible child list.
    expect(() => projectedChildren(ir)).not.toThrow()
    const kids = projectedChildren(ir)
    expect(kids.length).toBe(2)
  })
})

// -----------------------------------------------------------------------------
// stripInnerLate (private — exported for tests)
// -----------------------------------------------------------------------------

describe('stripInnerLate', () => {
  it('returns body when given synthetic Late directly', () => {
    const body = parseRoot('s("bd")')
    const synthLate: PatternIR = {
      tag: 'Late',
      offset: 0.125,
      body,
      // userMethod intentionally omitted (synthetic).
    }
    expect(stripInnerLate(synthLate)).toBe(body)
  })

  it('preserves user-typed Late (userMethod="late") at the top level', () => {
    const ir = parseRoot('s("bd").late(0.125)')
    expect(ir.tag).toBe('Late')
    const stripped = stripInnerLate(ir)
    // The user-typed Late stays as a Late (not stripped) and userMethod
    // is preserved. The body may be a new object (the recursion descends
    // into body looking for synthetic Late), but the wrapper survives.
    expect(stripped.tag).toBe('Late')
    expect((stripped as { userMethod?: string }).userMethod).toBe('late')
  })

  it('descends single-body wrappers (FX > synthetic Late case)', () => {
    const inner = parseRoot('s("bd")')
    const synthLate: PatternIR = {
      tag: 'Late',
      offset: 0.125,
      body: inner,
    }
    const fx: PatternIR = {
      tag: 'FX',
      name: 'gain',
      params: { gain: 0.5 },
      body: synthLate,
      userMethod: 'gain',
    }
    const stripped = stripInnerLate(fx)
    expect(stripped.tag).toBe('FX')
    expect((stripped as { body: PatternIR }).body).toBe(inner)
  })

  it('descends two single-body wrappers (Fast > FX > synthetic Late case)', () => {
    const inner = parseRoot('s("bd")')
    const synthLate: PatternIR = {
      tag: 'Late',
      offset: 0.125,
      body: inner,
    }
    const fx: PatternIR = {
      tag: 'FX',
      name: 'gain',
      params: { gain: 0.5 },
      body: synthLate,
      userMethod: 'gain',
    }
    const fast: PatternIR = {
      tag: 'Fast',
      factor: 2,
      body: fx,
      userMethod: 'fast',
    }
    const stripped = stripInnerLate(fast)
    expect(stripped.tag).toBe('Fast')
    const fastBody = (stripped as { body: PatternIR }).body
    expect(fastBody.tag).toBe('FX')
    expect((fastBody as { body: PatternIR }).body).toBe(inner)
  })

  it('stops at multi-child / leaf nodes (Stack — no recursion)', () => {
    const ir = parseRoot('stack(s("bd"), s("hh"))')
    expect(stripInnerLate(ir)).toBe(ir)
  })

  it('stops at Pure leaf', () => {
    const pure: PatternIR = IR.pure()
    expect(stripInnerLate(pure)).toBe(pure)
  })

  it('stops at Code leaf', () => {
    const code: PatternIR = IR.code('foo')
    expect(stripInnerLate(code)).toBe(code)
  })
})

// -----------------------------------------------------------------------------
// T-12.5 (REV-3) — RAW tab projection probe
//
// CONTEXT D-04 mandates uniform projection across all 4 stages
// (RAW, MINI-EXPANDED, CHAIN-APPLIED, Parsed). T-12 audits the FINAL
// (rightmost-by-default) tab via Playwright; the RAW tab — which renders
// a multi-track $: source as Stack(userMethod=undefined) > Code, Code,
// Code (RESEARCH §2.1) — has no explicit projection probe. P46 (display-
// layer projection whitelist) is the catalogue ref: a missing rule would
// fail silently as a thrown render error or blank row, neither of which
// the existing FINAL-tab tests catch.
// -----------------------------------------------------------------------------

describe('RAW tab projection (D-04 uniform projection — REV-3)', () => {
  it('multi-track $: RAW IR projects without errors; outer Stack(undefined) → "{}" mini polymetric symbol', () => {
    const code = '$: note("c d")\n$: s("bd hh")'
    const raw = runRawStage(IR.code(code))
    // Sanity: RAW returned the expected shape (multi-track outer Stack).
    expect(raw.tag).toBe('Stack')
    expect((raw as { userMethod?: string }).userMethod).toBeUndefined()
    // Outer Stack with userMethod undefined projects to the polymetric
    // mini symbol per RESEARCH §6 D-04 risk acceptance — no thrown error.
    expect(() => projectedLabel(raw)).not.toThrow()
    expect(projectedLabel(raw)).toBe('{}')
    // projectedChildren returns the per-track Code lifts (D-04 uniform
    // — Code is whitelisted out of D-02 hide rule).
    const kids = projectedChildren(raw)
    expect(kids.length).toBe(2)
    for (const k of kids) {
      expect(k.tag).toBe('Code')
      expect(projectedLabel(k)).toBe('Code')
    }
    // Each track's expr text is recoverable from its Code node.
    const codes = (kids as Array<{ tag: 'Code'; code: string }>)
      .filter((k) => k.tag === 'Code')
      .map((k) => k.code)
    expect(codes[0]).toContain('note("c d")')
    expect(codes[1]).toContain('s("bd hh")')
  })

  it('single-track RAW IR projects to one Code row with the expected text', () => {
    const code = 'note("c d")'
    const raw = runRawStage(IR.code(code))
    expect(raw.tag).toBe('Code')
    expect(() => projectedLabel(raw)).not.toThrow()
    expect(projectedLabel(raw)).toBe('Code')
    // Code is a leaf at projection — no children.
    const kids = projectedChildren(raw)
    expect(kids).toHaveLength(0)
    // The Code's text contains the source.
    expect((raw as { code: string }).code).toBe('note("c d")')
  })
})
