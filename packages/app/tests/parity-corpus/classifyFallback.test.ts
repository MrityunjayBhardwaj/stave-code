/**
 * classifyFallback.test.ts — the honesty gate for the parity backlog classifier.
 *
 * Every fixture is a REAL shape observed in the N≈360 Bakery sweep (the hashes
 * are the actual samples), reduced to the smallest form that keeps its cause.
 * The load-bearing assertions are the NEGATIVE ones: a Hydra sketch or a lambda
 * that merely happens to contain a `let`/`const` must NOT be labelled a binding
 * gap. Against the previous classifier (binding check ahead of Hydra/lambda/
 * function detection) every one of these goes RED — which is the point.
 *
 * Pure string heuristic, no parser import → hermetic, runs in the CI gate.
 */
import { describe, it, expect } from 'vitest'
import { classifyFallback } from './classifyFallback'

describe('classifyFallback — honest cause attribution (#141 mis-attribution fix)', () => {
  it('a Hydra sketch with a `let` is Hydra, NOT a binding gap (3LBt53ZvAcMz)', () => {
    const code = `let randoming = slider(0.179,0,1)
await initHydra()
src(s2).thresh(0.6).scrollX(randoming).out()`
    const cls = classifyFallback(code)
    expect(cls).toContain('Hydra')
    expect(cls).not.toMatch(/binding ref|#141/)
  })

  it('floatbeat DSP is DSP, not a binding gap (3HWHF_ZUbZD_)', () => {
    const code = 'await dough`\nlet f\nlet dsp = (t) => f ? f(t)&255 : 0\n`\ns(cat("t>>6^t&t>>9"))'
    const cls = classifyFallback(code)
    expect(cls).toContain('DSP')
    expect(cls).not.toMatch(/binding ref|#141/)
  })

  it('an arrow-fn/lambda pattern with a `const` is functional, NOT binding (3y6ivMTsJ5PA)', () => {
    const code = `const setbpm = t => setcps(t/4/60)
const tempo = 175
setbpm(tempo)
s("bd*4").sometimesBy(1/8, x => x.room(1.6))`
    const cls = classifyFallback(code)
    expect(cls).toMatch(/functional|lambda/)
    expect(cls).not.toMatch(/binding ref|#141/)
  })

  it('a `function`/`register` definition is a definition, NOT binding (1rFTPRnSH8bN)', () => {
    const code = `function arrangePrime(...parts) {
  let offset = 0
  return stack(...parts)
}
arrangePrime([1, s("bd")])`
    const cls = classifyFallback(code)
    expect(cls).toMatch(/function|register|definition/)
    expect(cls).not.toMatch(/binding ref|#141/)
  })

  it('an unmodelled combinator with string bindings is a STRUCTURAL residual, not binding-ref (42r0gryaJB8N)', () => {
    // stepcat is the real blocker; the `let measure1 = "…"` bindings resolve.
    const code = `setcpm(60/5)
let measure1 = "[c5]@2"
let measure2 = "[d5]@2"
let melody = note(stepcat(measure1, measure2)).pace(8)
stack(melody, sound("hh!5"))`
    const cls = classifyFallback(code)
    // Must NOT claim binding resolution is the cause…
    expect(cls).not.toMatch(/binding ref|#141/)
    // …and must say bindings resolve, pointing at other structure.
    expect(cls).toMatch(/bindings RESOLVE|structural residual/)
  })

  it('still catches the genuine boot-shape gaps', () => {
    expect(classifyFallback('typeof foo !== "undefined" && foo()')).toContain('#143')
    expect(classifyFallback('samples({ bd: "bd.wav" })\ns("bd")')).toContain('#142')
  })

  it('comment-only / empty program', () => {
    expect(classifyFallback('// just a note\n/* nothing here */')).toMatch(/comment-only|empty/)
  })

  it('tiers every label as CORRECT-FALLBACK or GAP (no un-tiered leakage)', () => {
    const samples = [
      'await initHydra()\nosc(5).out()',
      'await dough`let f`\ns("bd")',
      'const f = x => x.fast(2)\ns("bd").apply(f)',
      'function foo(){}\ns("bd")',
      'typeof x !== "undefined" && x()',
      'samples({ bd: "x" })\ns("bd")',
      'let a = 1\nweirdCombinator(a)',
    ]
    for (const s of samples) {
      expect(classifyFallback(s)).toMatch(/^(CORRECT-FALLBACK|GAP|comment-only)/)
    }
  })
})
