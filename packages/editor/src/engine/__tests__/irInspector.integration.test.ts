/**
 * Integration test for the parse → run → collect chain that backs
 * the IR Inspector. Mirrors the production wire-up in StrudelEditorClient
 * (Phase 19-02 Task 4) without going through the React/runtime layer:
 * parse a known Strudel string, run it through a v1-shaped pass list,
 * collect events, and pin the contract.
 */
import { describe, it, expect } from 'vitest'
import { parseStrudel, collect, runPasses, type Pass } from '../../ir'
import type { PatternIR } from '../../ir/PatternIR'

const v1Passes: readonly Pass<PatternIR>[] = [
  { name: 'Parsed', run: (ir) => ir },
]

describe('irInspector integration — parse → run → collect', () => {
  it('produces a single-pass snapshot whose IR is referentially equal to parseStrudel output', () => {
    const code = 'note("c3 e3 g3")'
    const ir = parseStrudel(code)
    const passes = runPasses(ir, v1Passes)

    expect(passes).toHaveLength(1)
    expect(passes[0].name).toBe('Parsed')
    // UV6 — identity pass returns the same reference; runner adds nothing.
    expect(passes[0].ir).toBe(ir)
  })

  it('collected events flow from passes[last].ir and carry loc (PV24, PV25)', () => {
    const code = 'note("c3 e3 g3")'
    const ir = parseStrudel(code)
    const passes = runPasses(ir, v1Passes)
    const finalIR = passes[passes.length - 1].ir
    const events = collect(finalIR)

    expect(events.length).toBeGreaterThan(0)
    // PV24: every IREvent must carry loc — the v1 identity pass must
    // not break the parser's loc propagation.
    for (const e of events) {
      expect(e.loc).toBeDefined()
      expect(Array.isArray(e.loc)).toBe(true)
      expect(e.loc!.length).toBeGreaterThan(0)
    }
  })

  it('purity: running the pipeline twice on the same code yields deep-equal events', () => {
    const code = 'note("c3 e3 g3")'
    const run1 = collect(runPasses(parseStrudel(code), v1Passes)[0].ir)
    const run2 = collect(runPasses(parseStrudel(code), v1Passes)[0].ir)
    expect(run2).toEqual(run1)
  })
})
