/**
 * #1590 — the AUTHORITY arm for where a continuous curve is drawn.
 *
 * The unit file proves the reader agrees with the PARSER. This one proves it agrees
 * with what PLAYS: the same document is read statically and evaluated through the
 * real transpiler, and the gain on every `bd` onset must be the curve evaluated at
 * `signalTimeAt` — and no onset may fall in a bar the reader calls silent. Each input
 * is one where the song-time reading gives a DIFFERENT value, and the arm asserts
 * that too, so an input that stops telling the two apart fails instead of confirming.
 *
 * Setup mirrors `steppedAutomation.engine.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import { parseStrudel } from '../parseStrudel'
import { signalAutomations, signalTimeAt, type SignalAutomation } from '../signalAutomation'
import { signalDimensionsOf } from '../songAnalysis'
import { clearStringParser, installMiniStringParser } from '../../engine/stringParser'

/* eslint-disable @typescript-eslint/no-explicit-any */

const CYCLES = 24

/** Onset time and gain of every `bd` event in [0, CYCLES), via the real engine. */
async function bdOnsets(code: string, cycles = CYCLES): Promise<{ t: number; gain: number }[]> {
  const core: any = await import('@strudel/core')
  const mini: any = await import('@strudel/mini')
  await core.evalScope(core, mini)
  installMiniStringParser({ core, mini })
  try {
    const { transpiler }: any = await import('@strudel/transpiler')
    const out = await core.evaluate(code, transpiler)
    const pat = out.pattern ?? out
    return pat
      .queryArc(0, cycles)
      .filter((h: any) => (h.hasOnset?.() ?? true) && h.value?.s === 'bd')
      .map((h: any) => ({ t: h.whole.begin.valueOf(), gain: h.value.gain }))
  } finally {
    clearStringParser({ core })
  }
}

/** The two waveforms these arms use, from `@strudel/core@1.2.6` `signal.mjs`:
 *  `saw = t % 1` and `sine = (sin(2πt) + 1) / 2`, both sampled at a hap's begin. */
const UNIT: Record<string, (x: number) => number> = {
  saw: (x) => x - Math.floor(x),
  sine: (x) => (Math.sin(2 * Math.PI * x) + 1) / 2,
}
const valueAt = (a: SignalAutomation, own: number) => a.lo + (a.hi - a.lo) * UNIT[a.kind](own / a.periodCycles)
/** What the reader says plays at song time `t`, or null for a silent section. */
const drawn = (a: SignalAutomation, t: number) => {
  const own = signalTimeAt(a, t)
  return own === null ? null : valueAt(a, own)
}
/** The rival: the curve at the song's own time — what the lane drew before #1590. */
const songTime = (a: SignalAutomation, t: number) => valueAt(a, t)
const worst = (xs: number[]) => xs.reduce((m, x) => Math.max(m, x), 0)

describe('#1590 — a curve plays at the time the reader hands it, and the song-time reading does not', () => {
  it.each([
    ['a later section', 'arrange([1, s("hh*8")], [3, s("bd*8").gain(saw.slow(3))])'],
    ['a section\'s second pass', 'arrange([3, s("bd*8").gain(sine.slow(4))], [1, s("hh*8")])'],
    ['cat', 'cat(s("hh*8"), s("bd*8").gain(saw.slow(3)))'],
    ['a nested arrangement', 'arrange([1, s("hh*8")], [2, arrange([1, s("bd*8").gain(saw.slow(3))], [1, s("cp*8")])])'],
  ])('%s', async (_label, code) => {
    const [a] = signalAutomations(parseStrudel(code) as never)
    expect(a, 'the reader found no curve').toBeDefined()
    const events = await bdOnsets(code)
    expect(events.length, 'the engine played no bd at all').toBeGreaterThan(0)

    // Every onset lies inside a playing section and carries the reader's value.
    for (const e of events) {
      const v = drawn(a, e.t)
      expect(v, `the reader calls t=${e.t} silent, and the engine plays bd there`).not.toBeNull()
      expect(Math.abs(e.gain - (v as number)), `t=${e.t}`).toBeLessThan(1e-9)
    }
    // Every bar the reader calls silent really is silent for this track.
    for (let c = 0; c < CYCLES; c++) {
      if (drawn(a, c + 0.5) !== null) continue
      expect(events.filter((e) => Math.floor(e.t) === c), `bar ${c} is called silent`).toEqual([])
    }
    // And the song-time reading is wrong on this input.
    expect(worst(events.map((e) => Math.abs(e.gain - songTime(a, e.t))))).toBeGreaterThan(0.1)
  }, 60_000)

  it('under no section the two readings are the same, and both are right — the control', async () => {
    const code = 's("bd*8").gain(saw.slow(3))'
    const [a] = signalAutomations(parseStrudel(code) as never)
    const events = await bdOnsets(code)
    expect(events.length).toBe(8 * CYCLES)
    expect(worst(events.map((e) => Math.abs(e.gain - (drawn(a, e.t) as number))))).toBeLessThan(1e-9)
  }, 60_000)
})

/** The smallest P at which every cycle's bd onsets (position in the cycle, gain)
 *  equal those P cycles later, over `cycles` cycles — or null. */
function enginePeriod(events: { t: number; gain: number }[], cycles: number): number | null {
  const rows = Array.from({ length: cycles }, () => [] as string[])
  for (const e of events) {
    const c = Math.floor(e.t)
    rows[c].push(`${(e.t - c).toFixed(4)}:${e.gain.toFixed(6)}`)
  }
  const keys = rows.map((r) => r.sort().join(';'))
  for (let p = 1; p <= cycles / 2; p++) {
    if (keys.every((k, c) => c + p >= cycles || k === keys[c + p])) return p
  }
  return null
}

describe('#1590 — the period fold is told the period the engine repeats at', () => {
  it.each([
    ['no section (control)', 's("bd*8").gain(saw.slow(3))', 3],
    ['a later section', 'arrange([1, s("hh*8")], [3, s("bd*8").gain(saw.slow(3))])', 4],
    ['a section\'s second pass', 'arrange([3, s("bd*8").gain(sine.slow(4))], [1, s("hh*8")])', 16],
    ['cat', 'cat(s("hh*8"), s("bd*8").gain(saw.slow(3)))', 6],
  ])('%s', async (label, code, expected) => {
    const ir = parseStrudel(code) as never
    expect(signalDimensionsOf(ir).periods).toEqual([expected])
    expect(enginePeriod(await bdOnsets(code, 48), 48)).toBe(expected)
    // Where the input tells them apart, the unsectioned rate is not the answer.
    if (!label.includes('control')) expect(signalAutomations(ir)[0].periodCycles).not.toBe(expected)
  }, 60_000)
})

describe('#1590 — what the reader declines really does play something other than the song-time curve', () => {
  const PLAIN = 's("bd*8").gain(saw.slow(3))'

  it.each([
    ['slow', `${PLAIN}.slow(2)`],
    ['fast', `${PLAIN}.fast(2)`],
    ['early', `${PLAIN}.early(0.5)`],
    // `cpm` is `fast(cpm / 60 / cps)`; in the bare core used here cps is 1.
    ['cpm', `${PLAIN}.cpm(120)`],
    ['every, with a time transform', `${PLAIN}.every(2, x => x.fast(2))`],
    ['jux, with a time transform', `${PLAIN}.jux(x => x.late(.25))`],
    ['a same-key call above it', `${PLAIN}.gain(0.5)`],
  ])('%s', async (_label, code) => {
    expect(signalAutomations(parseStrudel(code) as never)).toEqual([])
    const [plain] = signalAutomations(parseStrudel(PLAIN) as never)
    const events = await bdOnsets(code)
    expect(events.length).toBeGreaterThan(0)
    expect(worst(events.map((e) => Math.abs(e.gain - songTime(plain, e.t))))).toBeGreaterThan(0.1)
  }, 60_000)
})
