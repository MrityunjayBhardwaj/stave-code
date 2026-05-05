/**
 * parseStrudelStages — per-stage round-trip tests (PR-A scope).
 *
 * Phase 19-07 (#79). Per CONTEXT D-06, BOTH end-to-end parity AND
 * per-stage round-trip invariants are required. PR-A scope covers:
 *
 *   T-05.a — RAW: every Code lift's loc matches extractTracks offsets.
 *   T-05.b — MINI-EXPANDED: parseRoot output preserves loc; root nodes
 *            carry unresolvedChain metadata when chain non-empty;
 *            root-level stack(...) preserves userMethod === 'stack'.
 *   T-05.c — Regression sentinel (REV-6): for a 6-fixture set, the
 *            4-stage pipeline FINAL output is byte-equal to today's
 *            parseStrudel(code). Plus assertNoStageMeta against
 *            CHAIN-APPLIED (passes[2]) and FINAL (passes[3]) outputs
 *            so D-06.c orphan-metadata is caught in PR-A, not deferred.
 *   T-05.d — CHAIN-APPLIED → FINAL: identity (FINAL is identity stage).
 *
 * `assertNoStageMeta` is exported so PR-B's T-10.c can reuse it without
 * redefinition (REV-6).
 */

import { describe, it, expect } from 'vitest'
import { parseStrudel } from '../parseStrudel'
import { IR, type PatternIR } from '../PatternIR'
import {
  runRawStage,
  runMiniExpandedStage,
  runChainAppliedStage,
  runFinalStage,
} from '../parseStrudelStages'
import type { Pass } from '../passes'
import { runPasses } from '../passes'

const PASSES: readonly Pass<PatternIR>[] = [
  { name: 'RAW',           run: runRawStage           },
  { name: 'MINI-EXPANDED', run: runMiniExpandedStage  },
  { name: 'CHAIN-APPLIED', run: runChainAppliedStage  },
  { name: 'Parsed',        run: runFinalStage         },
]

function pipeline(code: string): PatternIR {
  const seed = IR.code(code)
  const passes = runPasses(seed, PASSES)
  return passes[passes.length - 1].ir
}

// ---------------------------------------------------------------------------
// Helpers — exported for PR-B's T-10.c reuse (REV-6).
// ---------------------------------------------------------------------------

/**
 * Assert recursively that no node carries stage-transition metadata.
 * D-06.c invariant: CHAIN-APPLIED and FINAL outputs MUST NOT contain
 * any `unresolvedChain` or `chainOffset` field on any node.
 *
 * Walks the IR tree via tag-based child enumeration. Any node where
 * the field is present (even with `undefined` value) fails the assertion.
 */
export function assertNoStageMeta(node: PatternIR): void {
  const visit = (n: PatternIR): void => {
    const rec = n as Record<string, unknown>
    expect(
      Object.prototype.hasOwnProperty.call(rec, 'unresolvedChain'),
      `node tag=${n.tag} has orphan unresolvedChain`,
    ).toBe(false)
    expect(
      Object.prototype.hasOwnProperty.call(rec, 'chainOffset'),
      `node tag=${n.tag} has orphan chainOffset`,
    ).toBe(false)
    // Recurse into children based on tag shape.
    switch (n.tag) {
      case 'Seq':
        for (const c of n.children) visit(c)
        break
      case 'Stack':
        for (const t of n.tracks) visit(t)
        break
      case 'Cycle':
        for (const i of n.items) visit(i)
        break
      case 'Choice':
        visit(n.then)
        visit(n.else_)
        break
      case 'Every':
        visit(n.body)
        if (n.default_) visit(n.default_)
        break
      case 'When':
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
        visit(n.body)
        break
      case 'Chunk':
        visit(n.transform)
        visit(n.body)
        break
      case 'Pick':
        visit(n.selector)
        for (const l of n.lookup) visit(l)
        break
      case 'Pure':
      case 'Play':
      case 'Sleep':
      case 'Code':
        // No children.
        break
    }
  }
  visit(node)
}

/**
 * Recursive deep-clone that drops `unresolvedChain` + `chainOffset` on
 * every node. Used for cross-stage byte-equality comparisons where the
 * MINI-EXPANDED snapshot still carries metadata that FINAL doesn't.
 */
function stripStageMeta(node: PatternIR): PatternIR {
  const rec = node as Record<string, unknown>
  const cloned: Record<string, unknown> = {}
  for (const k of Object.keys(rec)) {
    if (k === 'unresolvedChain' || k === 'chainOffset') continue
    const v = rec[k]
    cloned[k] = v
  }
  // Deep-clone child IR nodes.
  switch (node.tag) {
    case 'Seq':
      cloned.children = node.children.map(stripStageMeta)
      break
    case 'Stack':
      cloned.tracks = node.tracks.map(stripStageMeta)
      break
    case 'Cycle':
      cloned.items = node.items.map(stripStageMeta)
      break
    case 'Choice':
      cloned.then = stripStageMeta(node.then)
      cloned.else_ = stripStageMeta(node.else_)
      break
    case 'Every':
      cloned.body = stripStageMeta(node.body)
      if (node.default_) cloned.default_ = stripStageMeta(node.default_)
      break
    case 'When':
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
      cloned.body = stripStageMeta(node.body)
      break
    case 'Chunk':
      cloned.transform = stripStageMeta(node.transform)
      cloned.body = stripStageMeta(node.body)
      break
    case 'Pick':
      cloned.selector = stripStageMeta(node.selector)
      cloned.lookup = node.lookup.map(stripStageMeta)
      break
    default:
      break
  }
  return cloned as PatternIR
}

// ---------------------------------------------------------------------------
// T-05.a — RAW: per-track Code lifts preserve loc (PV25, P39)
// ---------------------------------------------------------------------------

describe('parseStrudel stages — RAW (T-05.a)', () => {
  it('zero-track (no $: prefix) wraps from trim-start to length', () => {
    const code = '   note("c")\n'
    const seed = IR.code(code)
    const raw = runRawStage(seed)
    expect(raw.tag).toBe('Code')
    if (raw.tag !== 'Code') throw new Error('unreachable')
    expect(raw.loc?.[0]?.start).toBe(3) // first non-WS char
    expect(raw.loc?.[0]?.end).toBe(code.length)
  })

  it('single track (no $:) covers the trimmed expr', () => {
    const code = 'note("c d e f")'
    const seed = IR.code(code)
    const raw = runRawStage(seed)
    expect(raw.tag).toBe('Code')
    if (raw.tag !== 'Code') throw new Error('unreachable')
    expect(raw.loc?.[0]?.start).toBe(0)
    expect(raw.loc?.[0]?.end).toBe(code.length)
  })

  it('multi-track $: wraps Code lifts in outer Stack with synthetic userMethod undefined', () => {
    const code = '$: note("c d")\n$: s("bd hh")'
    const seed = IR.code(code)
    const raw = runRawStage(seed)
    expect(raw.tag).toBe('Stack')
    if (raw.tag !== 'Stack') throw new Error('unreachable')
    // Outer Stack synthetic — userMethod must be undefined (RAW marker).
    expect(raw.userMethod).toBeUndefined()
    expect(raw.tracks).toHaveLength(2)
    expect(raw.loc?.[0]?.start).toBe(0)
    expect(raw.loc?.[0]?.end).toBe(code.length)

    // Each Code lift's loc matches its $: bodyStart offset.
    // First track: '$: ' is 3 chars, body starts at offset 3.
    const t0 = raw.tracks[0]
    expect(t0.tag).toBe('Code')
    if (t0.tag !== 'Code') throw new Error('unreachable')
    expect(t0.loc?.[0]?.start).toBe(3)
    expect(t0.code).toBe('note("c d")\n')
    // The slice end is the next $: dollarStart (or code.length for last).
    expect(t0.loc?.[0]?.end).toBe(t0.loc![0].start + t0.code.length)

    const t1 = raw.tracks[1]
    expect(t1.tag).toBe('Code')
    if (t1.tag !== 'Code') throw new Error('unreachable')
    // Second $:  dollarStart = 'note("c d")\n'.length + '$: '.length = 12 + 3
    // Wait: code = '$: note("c d")\n$: s("bd hh")', the second $ is at index 15
    // and bodyStart = 15 + 3 = 18.
    expect(t1.loc?.[0]?.start).toBe(18)
    expect(t1.code).toBe('s("bd hh")')
    expect(t1.loc?.[0]?.end).toBe(t1.loc![0].start + t1.code.length)
  })
})

// ---------------------------------------------------------------------------
// T-05.b — MINI-EXPANDED: parseRoot preserves userMethod + carries
//          unresolvedChain when chain non-empty (PV25, PV31).
// ---------------------------------------------------------------------------

describe('parseStrudel stages — MINI-EXPANDED (T-05.b)', () => {
  it('chained track stashes unresolvedChain + chainOffset on root', () => {
    const code = 'note("c d e").fast(2)'
    const passes = runPasses(IR.code(code), PASSES)
    const me = passes[1].ir // MINI-EXPANDED
    const meAny = me as { unresolvedChain?: string; chainOffset?: number }
    expect(meAny.unresolvedChain).toBe('.fast(2)')
    // chainOffset is the absolute position of the chain's first char
    // (the leading dot) — equals trimmedOffset + root.length where
    // trimmedOffset = 0 (no leading WS) and root = 'note("c d e")'.
    expect(meAny.chainOffset).toBe('note("c d e")'.length)
  })

  it('non-chained track has no unresolvedChain metadata', () => {
    const code = 'note("c d")'
    const passes = runPasses(IR.code(code), PASSES)
    const me = passes[1].ir
    const meRec = me as Record<string, unknown>
    expect(Object.prototype.hasOwnProperty.call(meRec, 'unresolvedChain')).toBe(
      false,
    )
    expect(Object.prototype.hasOwnProperty.call(meRec, 'chainOffset')).toBe(
      false,
    )
  })

  it('root-level stack(...) preserves userMethod === "stack" (PV31)', () => {
    const code = 'stack(s("bd"), s("hh"))'
    const passes = runPasses(IR.code(code), PASSES)
    const me = passes[1].ir
    expect(me.tag).toBe('Stack')
    expect((me as { userMethod?: string }).userMethod).toBe('stack')
  })

  it('multi-track $: produces outer Stack of parsed roots; outer Stack has no userMethod', () => {
    const code = '$: note("c d")\n$: s("bd hh")'
    const passes = runPasses(IR.code(code), PASSES)
    const me = passes[1].ir
    expect(me.tag).toBe('Stack')
    if (me.tag !== 'Stack') throw new Error('unreachable')
    // Synthetic outer Stack from RAW — userMethod still undefined at MINI-EXPANDED.
    expect(me.userMethod).toBeUndefined()
    expect(me.tracks).toHaveLength(2)
    // Each track is the parsed root (Cycle or Seq from parseMini), not Code.
    for (const t of me.tracks) {
      expect(t.tag).not.toBe('Code')
    }
  })
})

// ---------------------------------------------------------------------------
// T-05.c — Regression sentinel: 4-stage pipeline FINAL output is
//          byte-equal to today's parseStrudel(code) (D-06).
//          Plus assertNoStageMeta on CHAIN-APPLIED + FINAL outputs
//          (REV-6: PR-A ships REAL CHAIN-APPLIED, so the metadata-strip
//          invariant must be tested HERE, not deferred to PR-B).
// ---------------------------------------------------------------------------

const REGRESSION_FIXTURES: readonly string[] = [
  'note("c d e f")',
  'note("c d").fast(2)',
  's("bd hh sd cp").every(2, x => x.late(0.125))',
  '$: note("c d")\n$: s("bd hh")',
  'stack(s("bd"), s("hh"))',
  's("bd hh sd cp").layer(x => x.add("0,2"))',
]

describe('parseStrudel stages — regression sentinel (T-05.c, D-06)', () => {
  for (const code of REGRESSION_FIXTURES) {
    it(`pipeline FINAL is byte-equal to parseStrudel(code) — ${JSON.stringify(code).slice(0, 50)}`, () => {
      const fromPipeline = pipeline(code)
      const fromDirect = parseStrudel(code)
      // Strip residual metadata defensively (FINAL output should already
      // be metadata-free; defensive strip catches any test-side drift).
      expect(stripStageMeta(fromPipeline)).toEqual(stripStageMeta(fromDirect))
    })
  }

  for (const code of REGRESSION_FIXTURES) {
    it(`CHAIN-APPLIED + FINAL have no orphan stage metadata (D-06.c) — ${JSON.stringify(code).slice(0, 50)}`, () => {
      const seed = IR.code(code)
      const passes = runPasses(seed, PASSES)
      // passes[2] = CHAIN-APPLIED; passes[3] = FINAL.
      assertNoStageMeta(passes[2].ir)
      assertNoStageMeta(passes[3].ir)
    })
  }
})

// ---------------------------------------------------------------------------
// T-05.d — CHAIN-APPLIED → FINAL identity.
// ---------------------------------------------------------------------------

describe('parseStrudel stages — CHAIN-APPLIED → FINAL identity (T-05.d)', () => {
  it('FINAL.ir === CHAIN-APPLIED.ir (referential equality, identity stage)', () => {
    const code = 'note("c d")'
    const passes = runPasses(IR.code(code), PASSES)
    expect(passes[3].ir).toBe(passes[2].ir)
  })

  it('referential equality holds for chained track too', () => {
    const code = 'note("c d e").fast(2)'
    const passes = runPasses(IR.code(code), PASSES)
    expect(passes[3].ir).toBe(passes[2].ir)
  })
})
