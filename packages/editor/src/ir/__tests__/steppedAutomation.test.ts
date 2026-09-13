/**
 * Stepped automation read off the static IR (#1463 Stage 1).
 *
 * ⚠ Every case goes through the REAL parser, never a hand-built node — the same
 * discipline `signalAutomation.test.ts` states, for the same reason: a fixture
 * pins this module against a belief about the parser's output. The shapes these
 * arms rely on were printed from `parseStrudel` before any of this was written.
 */
import { describe, it, expect } from 'vitest'
import { parseStrudel } from '../parseStrudel'
import { steppedAutomations, stepIndexAtCycle, stepValueEdit } from '../steppedAutomation'

const read = (src: string) => steppedAutomations(parseStrudel(src) as never)
const apply = (src: string, e: { range: [number, number]; text: string }) =>
  src.slice(0, e.range[0]) + e.text + src.slice(e.range[1])

describe('steppedAutomations — the simple shape', () => {
  it('reads each step, its weight, where it starts and where its number is written', () => {
    const src = '$: s("bd*2").gain("<0.2 0.8>")'
    const [a] = read(src)
    expect(a).toMatchObject({ trackId: 'd1', paramKey: 'gain', method: 'gain', periodCycles: 2 })
    expect(a.steps.map((s) => [s.value, s.weight, s.startCycle])).toEqual([
      [0.2, 1, 0],
      [0.8, 1, 1],
    ])
    // The span is the NUMBER, not the atom's surroundings — read back as text.
    expect(a.steps.map((s) => src.slice(s.valueSpan.start, s.valueSpan.end))).toEqual(['0.2', '0.8'])
  })

  it('a weighted step spans its weight, and the period is the sum', () => {
    const src = '$: s("bd*2").gain("<0.2@2 0.8>")'
    const [a] = read(src)
    expect(a.periodCycles).toBe(3)
    expect(a.steps.map((s) => [s.value, s.weight, s.startCycle])).toEqual([
      [0.2, 2, 0],
      [0.8, 1, 2],
    ])
    // ⚠ The value span must exclude the `@2`, or a value edit eats the weight.
    expect(src.slice(a.steps[0].valueSpan.start, a.steps[0].valueSpan.end)).toBe('0.2')
  })

  it('reads the numbers as the user spelled them — negative, leading dot, spaced', () => {
    expect(read('$: s("bd*2").pan("<-1 .5 1>")')[0].steps.map((s) => s.value)).toEqual([-1, 0.5, 1])
    expect(read('$: s("bd*2").gain("< 0.2  0.8 >")')[0].steps.map((s) => s.value)).toEqual([0.2, 0.8])
  })

  it('reads all three quote styles — the engine pattern-parses each (see the engine test)', () => {
    for (const q of ['"', "'", '`']) {
      const [a] = read(`$: s("bd*2").gain(${q}<0.2 0.8>${q})`)
      expect(a?.steps.map((s) => s.value), `quote ${q}`).toEqual([0.2, 0.8])
    }
  })

  it('keys by the CANONICAL control and keeps the typed method', () => {
    expect(read('$: s("bd*2").lpf("<200 2000>")')[0]).toMatchObject({ paramKey: 'cutoff', method: 'lpf' })
  })

  it('reads several parameters on one chain', () => {
    const keys = read('$: s("bd*2").velocity("<.2 .8>").room("<0 0.5>")').map((a) => a.paramKey)
    expect(keys.sort()).toEqual(['room', 'velocity'])
  })

  it('attributes to the track that declares it, inside a stack too', () => {
    expect(read('lead: stack(s("bd*2").gain("<0.2 0.8>"), s("hh*2"))')[0].trackId).toBe('lead')
    expect(read('$: stack(s("bd*2").gain("<0.2 0.8>"), s("hh*4"))')[0].trackId).toBe('d1')
  })

  it('is empty for a document with no stepped parameter — the ordinary case', () => {
    expect(read('$: s("bd*2").gain(0.8)')).toEqual([])
    expect(read('$: s("bd*2")')).toEqual([])
    expect(steppedAutomations(null)).toEqual([])
  })
})

describe('steppedAutomations — abstains rather than drawing what does not play', () => {
  // Each of these was measured in the real evaluator (#1463's grounding).
  it('a rest step silences the track — not a value, so the parameter declines', () => {
    expect(read('$: s("bd*2").gain("<0.2 ~ 0.8>")')).toEqual([])
  })

  it('a subdivided step is not held for a cycle', () => {
    expect(read('$: s("bd*2").gain("<0.2 [0.4 0.8]>")')).toEqual([])
  })

  it('`<…>/n` and `<…>*n` change what a step spans — out of scope for now', () => {
    expect(read('$: s("bd*2").gain("<0.2 0.8>/2")')).toEqual([])
    expect(read('$: s("bd*2").gain("<0.2 0.8>*4")')).toEqual([])
  })

  it('not a per-cycle alternation at all', () => {
    expect(read('$: s("bd*2").gain("0.2 0.8")')).toEqual([])
  })

  // The parser models all three of these as the same `Cycle`. The engine does not
  // play the first one as steps at all (see the engine test), so the reader must
  // see the whole argument, not only the node it parsed to.
  it('an argument that is more than one string literal declines', () => {
    expect(read('$: s("bd*2").gain("<0.2 0.8>" + "")')).toEqual([])
    // Plays the steps (controls are unary), but is not an argument a lane can own.
    expect(read('$: s("bd*2").gain("<0.2 0.8>", 1)')).toEqual([])
  })

  it('the whole-literal CONTROL — trailing whitespace is still one literal', () => {
    expect(read('$: s("bd*2").gain("<0.2 0.8>" )').map((a) => a.paramKey)).toEqual(['gain'])
  })

  it('non-numeric steps', () => {
    expect(read('$: s("bd*2").color("<red blue>")')).toEqual([])
  })

  it('a fractional weight has no whole-cycle start', () => {
    expect(read('$: s("bd*2").gain("<0.2@1.5 0.8>")')).toEqual([])
  })

  // P168 measured again for this module: the LATER call wins on every event.
  it('a stepped parameter a later same-key call overrides is dead — it declines', () => {
    expect(read('$: s("bd*2").gain("<0.2 0.8>").gain(0.5)')).toEqual([])
    // Canonical keys: `.cutoff` overrides an earlier `.lpf`.
    expect(read('$: s("bd*2").lpf("<200 2000>").cutoff(800)')).toEqual([])
  })

  it('the override reaches through structure — a call on the whole stack hides the inner steps', () => {
    expect(read('$: stack(s("bd*2").gain("<0.2 0.8>"), s("hh*4")).gain(0.5)')).toEqual([])
  })

  it('the override CONTROL — a later call on a DIFFERENT key does not hide it', () => {
    expect(read('$: s("bd*2").gain("<0.2 0.8>").room(0.5)').map((a) => a.paramKey)).toEqual(['gain'])
  })

  it('an EARLIER same-key call does not hide a later stepped one', () => {
    expect(read('$: s("bd*2").gain(0.5).gain("<0.2 0.8>")').map((a) => a.paramKey)).toEqual(['gain'])
  })
})

describe('steppedAutomations — only where nothing above the parameter moves time (#1584)', () => {
  // Each shape here has an arm in the engine test: the declined ones play
  // something other than `cycle mod period`, the read ones play exactly that.
  it.each([
    ['slow', '$: s("bd*2").gain("<0.2 0.8>").slow(2)'],
    ['fast', '$: s("bd*2").gain("<0.2 0.8>").fast(2)'],
    ['early', '$: s("bd*2").gain("<0.2 0.8>").early(1)'],
    ['off', '$: s("bd*2").gain("<0.2 0.8>").off(0.25, x => x.speed(2))'],
    ['cat', '$: cat(s("bd*2").gain("<0.2 0.8>"), s("hh*2"))'],
    // A section counts its OWN cycles — drawing it that way is #1585.
    ['an arrange section', 'lead: arrange([3, s("bd*2").gain("<0.2 0.8>")], [1, s("hh*2")])'],
    ['every, with a time transform', '$: s("bd*2").gain("<0.2 0.8>").every(2, x => x.fast(2))'],
    ['sometimesBy, with a time transform', '$: s("bd*2").gain("<0.2 0.8>").sometimesBy(0.5, x => x.late(0.25))'],
    // The plain channel reaches the parameter cleanly; the other reaches the SAME
    // node through a Fast. One dirty route is enough.
    ['jux, with a time transform', '$: s("bd*2").gain("<0.2 0.8>").jux(x => x.fast(2))'],
  ])('%s declines', (_label, src) => {
    expect(read(src)).toEqual([])
  })

  it.each([
    ['an effect chain', '$: s("bd*2").gain("<0.2 0.8>").room(0.5).lpf(800)'],
    ['stack', '$: stack(s("bd*2").gain("<0.2 0.8>"), s("hh*2"))'],
    ['layer', '$: s("bd*2").gain("<0.2 0.8>").layer(x => x.speed(2))'],
    ['mask', '$: s("bd*2").gain("<0.2 0.8>").mask("<1 [1 0]>")'],
    ['degradeBy', '$: s("bd*2").gain("<0.2 0.8>").degradeBy(0.3)'],
    ['struct', '$: s("bd*2").gain("<0.2 0.8>").struct("x ~ x x")'],
    ['chop', '$: s("bd*2").gain("<0.2 0.8>").chop(2)'],
    ['ply', '$: s("bd*2").gain("<0.2 0.8>").ply(2)'],
    ['every, with a transform that leaves time alone', '$: s("bd*2").gain("<0.2 0.8>").every(2, x => x.speed(2))'],
    ['sometimesBy, with a transform that leaves time alone', '$: s("bd*2").gain("<0.2 0.8>").sometimesBy(0.5, x => x.speed(2))'],
    // BELOW the parameter: the steps are applied after the fast, at song time.
    ['a time transform on the receiver', '$: s("bd*2").fast(2).gain("<0.2 0.8>")'],
  ])('%s is read', (_label, src) => {
    expect(read(src).map((a) => a.paramKey)).toEqual(['gain'])
  })

  it('an opaque call declines even where it would have been harmless — a missing lane, never a wrong one', () => {
    // `superimpose` parses to an opaque Code. The engine happens to keep the steps
    // (measured), but nothing in the tree says so.
    expect(read('$: s("bd*2").gain("<0.2 0.8>").superimpose(x => x.speed(2))')).toEqual([])
  })
})

describe('steppedAutomations — the parsed node must be the whole literal (#1584)', () => {
  // The parser reads each of these as the bare `<0.2 0.8>` and drops the operator;
  // the engine does not (engine test).
  it.each(['<0.2 0.8>/[2]', '<0.2 0.8>/<2 1>', '<0.2 0.8>*<8 16>'])('"%s" declines', (literal) => {
    expect(read(`$: s("bd*2").gain("${literal}")`)).toEqual([])
  })

  it('the CONTROL — whitespace inside the quotes or around the argument is still the whole literal', () => {
    expect(read('$: s("bd*2").gain(" <0.2 0.8> ")').map((a) => a.paramKey)).toEqual(['gain'])
    expect(read('$: s("bd*2").gain( "<0.2 0.8>" )').map((a) => a.paramKey)).toEqual(['gain'])
  })
})

describe('stepIndexAtCycle — the engine\'s own selection', () => {
  const [plain] = read('$: s("bd*2").gain("<0.2 0.8>")')
  const [weighted] = read('$: s("bd*2").gain("<0.2@2 0.8>")')

  it('rotates by absolute cycle', () => {
    expect([0, 1, 2, 3].map((c) => stepIndexAtCycle(plain, c))).toEqual([0, 1, 0, 1])
  })

  it('holds a weighted step for its weight — the probe\'s 0.2 0.2 0.8 pattern', () => {
    expect([0, 1, 2, 3, 4, 5].map((c) => stepIndexAtCycle(weighted, c))).toEqual([0, 0, 1, 0, 0, 1])
  })

  it('reads a fractional cycle as the cycle it is inside, and wraps negatives', () => {
    expect(stepIndexAtCycle(plain, 1.75)).toBe(1)
    expect(stepIndexAtCycle(plain, -1)).toBe(1)
  })
})

describe('stepValueEdit — replaces one number and no other byte', () => {
  it('rewrites only the chosen step', () => {
    const src = '$: s("bd*2").gain("<0.2 0.8>")'
    const [a] = read(src)
    const e = stepValueEdit(a, 1, 0.5)
    expect(e).not.toBeNull()
    expect(apply(src, e!)).toBe('$: s("bd*2").gain("<0.2 0.5>")')
  })

  it('keeps the weight, and the user\'s spelling of every other step', () => {
    const src = '$: s("bd*2").gain("<.20@2  0.8>")'
    const [a] = read(src)
    expect(apply(src, stepValueEdit(a, 0, 0.3)!)).toBe('$: s("bd*2").gain("<0.3@2  0.8>")')
  })

  it('the edited document reads back with the new value and the same shape', () => {
    const src = '$: s("bd*2").velocity("<.2 .8 .5>").room(0.3)'
    const [a] = read(src)
    const next = apply(src, stepValueEdit(a, 2, 0.9)!)
    const [b] = read(next)
    expect(b.steps.map((s) => [s.value, s.weight])).toEqual([[0.2, 1], [0.8, 1], [0.9, 1]])
    expect(b.periodCycles).toBe(a.periodCycles)
  })

  it('writes nothing for an unchanged value (compared as numbers), a bad index or a non-finite value', () => {
    const [a] = read('$: s("bd*2").gain("<0.30 0.8>")')
    expect(stepValueEdit(a, 0, 0.3)).toBeNull()
    expect(stepValueEdit(a, 5, 0.3)).toBeNull()
    expect(stepValueEdit(a, 0, Number.NaN)).toBeNull()
    expect(stepValueEdit(a, 0, Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('writes nothing it could not read back — an exponent spelling would drop the lane', () => {
    const src = '$: s("bd*2").gain("<0.2 0.8>")'
    const [a] = read(src)
    // The CONTROL first: the reader does read an ordinary edit back, so the refusal
    // below is about the spelling, not about any edit at all.
    expect(read(apply(src, stepValueEdit(a, 0, 0.5)!))).toHaveLength(1)
    // `String` spells these in exponent form, and the reader declines them.
    expect(String(1e21)).toBe('1e+21')
    expect(String(1e-7)).toBe('1e-7')
    expect(stepValueEdit(a, 0, 1e21)).toBeNull()
    expect(stepValueEdit(a, 0, 1e-7)).toBeNull()
    // Negative and whole numbers stay plain decimals and are written.
    expect(stepValueEdit(a, 0, -2)?.text).toBe('-2')
    expect(stepValueEdit(a, 0, 3)?.text).toBe('3')
  })
})
