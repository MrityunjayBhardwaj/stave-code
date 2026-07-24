/**
 * denominator-audit.test.ts — the OTHER half of the coverage fraction (#998).
 *
 * Every editability number this repo quotes is `editable / musical units`.
 * Phase after phase argued about the numerator; nobody had opened the
 * denominator. When we finally dumped and READ the units the harness files as
 * `code-only`, 41 of 125 across 150 real Bakery tunes were not musical
 * statements at all — `await initHydra()`, `s1.initVideo('https://…')`,
 * `render(o1)`, `window.spagda = spagda`, `console.log(p)`, `typeof` load
 * guards. They carry no note content and no view could ever open them, so
 * counting them did two things: deflated the percentage, and filed them under
 * `code-only`, which reads as "we have no view for this YET" — a roadmap item —
 * when the truth is "this is not a musical unit."
 *
 * WHY THIS FILE EXISTS RATHER THAN A COMMENT. An exclusion list is invisible
 * when it is wrong in either direction, and both directions are dangerous:
 *
 *   - TOO NARROW: plumbing keeps counting, the number stays quietly low, and
 *     the residual gets attributed to missing editors — which is where the
 *     roadmap effort then goes.
 *   - TOO BROAD: it silently inflates coverage forever, and an exclusion that
 *     raises a number is indistinguishable from moving the goalpost no matter
 *     how correct it is.
 *
 * The second half of this file — the "must keep counting AGAINST us" block — is
 * therefore the load-bearing half. It is what stops this rule from quietly
 * growing into "anything we cannot edit is not really a unit."
 *
 * The list it guards was DERIVED from the units (the corpus plus 150 real
 * Bakery tunes), never extended speculatively. The evidence for that discipline
 * is in the code it replaced: `SETUP_HEADS` contained `'await'`, guessed at,
 * which could never match anything because `chunkDetect` does not unwrap an
 * `AwaitExpression` — so `await samples('github:…')` had been counted as a
 * musical unit the whole time.
 */
import { describe, it, expect } from 'vitest'
import { measureDocs } from './editCoverage'

const measure = (code: string) => measureDocs([{ name: 't.strudel', code }]).tunes[0]

describe('the editability denominator — host plumbing is excluded', () => {
  const plumbing: [string, string][] = [
    ['hydra init', 'await initHydra()'],
    ['hydra init with options', 'await initHydra({feedStrudel:1})'],
    ['bytebeat init', 'await initBytebeat()'],
    ['a video source', "s1.initVideo('https://media.giphy.com/media/xyz.gif')"],
    ['a hydra render', 'render(o1)'],
    ['a hydra chain', 'src(s0).kaleid(4).diff(osc(1,0.5,5)).out()'],
    ['motion input', 'enableMotion()'],
    ['a console call', 'console.log(p)'],
    ['a load guard', "typeof setDefaultVoicings !== 'undefined' && setDefaultVoicings('legacy')"],
    ['a window re-export', 'window.spagda = spagda'],
    ['a numeric assignment', 'cpm = 110'],
  ]

  for (const [what, code] of plumbing) {
    it(`${what} is not a musical unit`, () => {
      const t = measure(code)
      expect(t.nonMusical, `"${code}" should be excluded as host plumbing`).toBe(1)
      expect(t.units, `"${code}" should leave the musical denominator empty`).toBe(0)
    })
  }

  it('an await-wrapped setup call is setup, not a musical unit', () => {
    // The bug that proved the old list was written by guessing: `SETUP_HEADS`
    // held `'await'`, but the head of `await samples(…)` is null, so this was
    // counted as a musical unit — and reported as `code-only`.
    const t = measure("await samples('github:eddyflux/crate')")
    expect(t.setup).toBe(1)
    expect(t.units).toBe(0)
    expect(t.nonMusical).toBe(0)
  })

  it('plumbing does not swallow the music around it', () => {
    const t = measure('await initHydra()\nrender(o1)\n$: s("bd sd")')
    expect(t.nonMusical).toBe(2)
    expect(t.units).toBe(1)
    expect(t.structurallyEditable).toBe(1)
  })
})

describe('the editability denominator — what must keep counting AGAINST us', () => {
  // If any of these ever starts being excluded, the coverage number has begun
  // measuring "what we chose to look at" instead of "what real code contains".
  const musical: [string, string][] = [
    ['literal silence', 'silence'],
    ['a global transform', 'all(x => x.gain(1.5))'],
    ['a chord voicing', 'chord("<am dm em>").voicing()'],
    ['a seq of patterns', 'seq("[G3 G3 C3 E3]", "[F2 D2 G2 C2]")'],
    ['a pick control', 'pick(order, sections)'],
    ['a mask', 'bass.mask("<0!8 1!999>")'],
    ['a filterHaps lambda', "p4.filterHaps(hap => hap.value.s != 'sine')"],
    ['an assignment carrying a mini', 'window.foo = "<<C E>:hirajoshi>"'],
  ]

  for (const [what, code] of musical) {
    it(`${what} stays in the denominator`, () => {
      const t = measure(code)
      expect(t.nonMusical, `"${code}" must NOT be excluded — it is a musical unit with no view yet`).toBe(0)
      expect(t.units, `"${code}" must count as a musical unit`).toBe(1)
    })
  }

  it('a declaration is out of this rule\'s scope — it is not a unit here at all', () => {
    // Pinned because it is surprising and it bounds what the exclusion may
    // claim: `detectAllChunks` deliberately yields no chunk for a
    // `VariableDeclaration` (chunkDetect.ts:263-266, so a bound track does not
    // also render a duplicate strip). A `const` line never reaches the
    // denominator on its own, and the plumbing rule must not pretend to judge it.
    //
    // This is NOT a blind spot, which is worth stating because it looks like
    // one: a binding that is actually USED is counted once, through the
    // reference that plays it (#867 resolves a bare ref to its definition), and
    // an unreferenced binding plays nothing and correctly counts as nothing.
    const t = measure('const bass = s("bd*4")')
    expect(t.units).toBe(0)
    expect(t.nonMusical).toBe(0)

    const used = measure('const bass = s("bd*4")\n$: bass')
    expect(used.units).toBe(1)
    expect(used.structurallyEditable).toBe(1)
  })
})
