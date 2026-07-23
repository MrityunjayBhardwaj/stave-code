/**
 * Integration test for the parse → run chain that backs the IR Inspector.
 * Mirrors the production wire-up in StrudelEditorClient (Phase 19-07 — 4-stage
 * STRUDEL_PASSES) without going through the React/runtime layer: seed a known
 * Strudel string as a Code node, run it through the 4-stage pass list, and pin
 * the contract. Onset events come from Strudel's eval (queryArc) in production;
 * here the structural walk (walkLeafItems) covers the loc-propagation contract.
 *
 * Phase 19-07 (#79): passes[] grew from 1 entry ('Parsed' identity) to
 * 4 entries (RAW / MINI-EXPANDED / CHAIN-APPLIED / Parsed). The FINAL
 * tab name remains 'Parsed' for IRInspectorPanel persistence
 * backward-compat (RESEARCH §3.2). The PV27 alias contract holds via
 * snap.ir === snap.passes[passes.length - 1].ir.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  parseStrudel,
  runPasses,
  IR,
  runRawStage,
  runMiniExpandedStage,
  runChainAppliedStage,
  runFinalStage,
  type Pass,
} from '../../ir'
import { walkLeafItems } from '../../ir/structuralWalk'
import type { PatternIR } from '../../ir/PatternIR'
import { publishIRSnapshot, clearIRSnapshot, type IRSnapshotInput } from '../irInspector'
import { getCaptureBuffer, __resetCaptureForTest } from '../timelineCapture'

const v4Passes: readonly Pass<PatternIR>[] = [
  { name: 'RAW',           run: runRawStage           },
  { name: 'MINI-EXPANDED', run: runMiniExpandedStage  },
  { name: 'CHAIN-APPLIED', run: runChainAppliedStage  },
  { name: 'Parsed',        run: runFinalStage         },
]

describe('irInspector integration — parse → run', () => {
  it('produces a 4-pass snapshot whose FINAL IR equals parseStrudel output', () => {
    const code = 'note("c3 e3 g3")'
    const seed = IR.code(code)
    const passes = runPasses(seed, v4Passes)

    // Phase 19-07 — passes[] has 4 entries with locked stage names.
    expect(passes).toHaveLength(4)
    expect(passes[0].name).toBe('RAW')
    expect(passes[1].name).toBe('MINI-EXPANDED')
    expect(passes[2].name).toBe('CHAIN-APPLIED')
    expect(passes[3].name).toBe('Parsed')

    // PV27 — `snap.ir` MUST track passes[passes.length - 1].ir (the
    // FINAL pass's output). Referential equality holds because FINAL
    // is identity over CHAIN-APPLIED.
    const finalIR = passes[passes.length - 1].ir
    expect(finalIR).toBe(passes[2].ir)

    // FINAL output is byte-equal (deep-equal) to today's parseStrudel
    // (D-06 regression gate). Reference equality does NOT hold across
    // the staged pipeline — the IR is rebuilt at MINI-EXPANDED via
    // parseRoot — so we use deep-equal here.
    const direct = parseStrudel(code)
    expect(finalIR).toEqual(direct)
  })

  it('leaf items flow from passes[last].ir and carry loc (PV24, PV25)', () => {
    const code = 'note("c3 e3 g3")'
    const seed = IR.code(code)
    const passes = runPasses(seed, v4Passes)
    const finalIR = passes[passes.length - 1].ir
    const items = walkLeafItems(finalIR, 1)

    expect(items.length).toBeGreaterThan(0)
    // PV24: every leaf must carry loc — the 4-stage pipeline must
    // not break the parser's loc propagation.
    for (const it of items) {
      expect(it.loc).toBeDefined()
      expect(Array.isArray(it.loc)).toBe(true)
      expect(it.loc!.length).toBeGreaterThan(0)
    }
  })

  it('purity: running the pipeline twice on the same code yields deep-equal IR', () => {
    const code = 'note("c3 e3 g3")'
    const run1 = runPasses(IR.code(code), v4Passes)[3].ir
    const run2 = runPasses(IR.code(code), v4Passes)[3].ir
    expect(run2).toEqual(run1)
  })
})

// ---------------------------------------------------------------------------
// Phase 19-08 — publishIRSnapshot also captures into timelineCapture (PK9 §8a)
// ---------------------------------------------------------------------------
//
// PR-A boundary probe: confirm the cross-module hook (irInspector
// publish → timelineCapture push) lands on every publish. Future
// refactors that accidentally break the fan-out trip a clear test
// here, separate from the unit-level coverage in timelineCapture.test.ts.

function buildSnap(code: string = 'note("c3")'): IRSnapshotInput {
  const seed = IR.code(code)
  const passes = runPasses(seed, v4Passes)
  const finalIR = passes[passes.length - 1].ir
  return {
    ts: 1234,
    source: 'integration.strudel',
    runtime: 'strudel',
    code,
    passes,
    ir: finalIR, // PV27 alias: passes[last].ir
    // Onsets come from Strudel's eval (queryArc) in production; this fan-out
    // plumbing test only asserts the events ARRAY REFERENCE flows through, so an
    // empty stand-in suffices.
    events: [],
  }
}

describe('publishIRSnapshot also captures into timelineCapture (PK9 step 8a)', () => {
  beforeEach(() => {
    clearIRSnapshot()
    __resetCaptureForTest()
  })

  it('every publish pushes one entry into the capture buffer', () => {
    expect(getCaptureBuffer()).toHaveLength(0)
    const snap = buildSnap()
    publishIRSnapshot(snap, { cycleCount: 1.5 })
    expect(getCaptureBuffer()).toHaveLength(1)
    // PV27-cousin: snapshot stored without deep-cloning. Phase 20-05: the
    // publisher now wraps the input via `enrichWithLookups` (PV38 clause 1)
    // — a shallow spread that adds `irNodeIdLookup` + `irNodeLocLookup`
    // and preserves all inner references (events, passes, ir). The
    // captured snapshot is the enriched object; inner refs equal the
    // input's inner refs (no deep clone, only a shallow wrap).
    const captured = getCaptureBuffer()[0].snapshot
    expect(captured.events).toBe(snap.events)
    expect(captured.passes).toBe(snap.passes)
    expect(captured.ir).toBe(snap.ir)
    expect(captured.irNodeIdLookup).toBeInstanceOf(Map)
    expect(captured.irNodeLocLookup).toBeInstanceOf(Map)
    expect(getCaptureBuffer()[0].cycleCount).toBe(1.5)
  })

  it('publish without meta records cycleCount: null (existing callers stay source-compatible)', () => {
    publishIRSnapshot(buildSnap())
    expect(getCaptureBuffer()).toHaveLength(1)
    expect(getCaptureBuffer()[0].cycleCount).toBeNull()
  })

  it('publish forwards snap.ts onto the capture entry by default', () => {
    const snap = buildSnap()
    publishIRSnapshot(snap)
    expect(getCaptureBuffer()[0].ts).toBe(1234)
  })
})
