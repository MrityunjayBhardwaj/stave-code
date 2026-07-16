import { describe, expect, test } from 'vitest'
import { downsampleMarksToCap, type SceneNote } from '../timelineScene'

/** Build `perCycle` marks in each of `[0, cycles)` — cycle-ascending, the order
 *  `collectNoteMarks` pushes them. Mirrors the #714 drum lane. */
function denseLane(cycles: number, perCycle: number): SceneNote[] {
  const out: SceneNote[] = []
  for (let c = 0; c < cycles; c++) {
    for (let k = 0; k < perCycle; k++) {
      out.push({ cycle: c + k / perCycle, end: c + k / perCycle, pitch: null, gain: 1, sourceOffset: null })
    }
  }
  return out
}

const lastCycle = (marks: readonly SceneNote[]): number =>
  marks.reduce((m, n) => Math.max(m, n.cycle), -1)

describe('downsampleMarksToCap — span-preserving note-mark cap (#714)', () => {
  test('dense lane keeps its FULL extent, not just the first `cap` in cycle order', () => {
    // The exact reported case: drum stack, 256 cycles × 35 onsets = 8960 marks.
    const marks = denseLane(256, 35)
    expect(marks.length).toBe(8960)

    const { marks: out, capped } = downsampleMarksToCap(marks, 2000)

    expect(capped).toBe(true)
    // Budget preserved: never more than `cap` retained.
    expect(out.length).toBeLessThanOrEqual(2000)
    // First onset survives → clip starts at 0.
    expect(out[0].cycle).toBe(0)
    // THE REGRESSION: the OLD tail-drop stopped at cycle ~57 (2000 / 35). The
    // downsample must reach the END of the song instead.
    expect(lastCycle(out)).toBeGreaterThan(254)
    // Definitely not the old truncation point.
    expect(lastCycle(out)).toBeGreaterThan(57)
    // Order preserved (monotonic non-decreasing in cycle).
    for (let i = 1; i < out.length; i++) expect(out[i].cycle).toBeGreaterThanOrEqual(out[i - 1].cycle)
  })

  test('sparse lane (≤ cap) is returned untouched, same reference', () => {
    const marks = denseLane(200, 2) // 400 marks < 2000
    const { marks: out, capped } = downsampleMarksToCap(marks, 2000)
    expect(capped).toBe(false)
    expect(out).toBe(marks) // no copy
    expect(lastCycle(out)).toBeGreaterThan(198)
  })

  test('output length never exceeds cap across a range of sizes', () => {
    for (const len of [1999, 2000, 2001, 4000, 4001, 8960, 100000]) {
      const marks = Array.from({ length: len }, (_, i) => ({
        cycle: i, end: i, pitch: null, gain: 1, sourceOffset: null,
      })) as SceneNote[]
      const { marks: out } = downsampleMarksToCap(marks, 2000)
      expect(out.length).toBeLessThanOrEqual(2000)
      expect(out[0].cycle).toBe(0)
      // Last survivor within one stride of the true end (extent preserved).
      const stride = Math.ceil(len / 2000)
      expect(lastCycle(out)).toBeGreaterThanOrEqual(len - 1 - stride)
    }
  })

  test('degenerate caps are safe', () => {
    const marks = denseLane(10, 4)
    expect(downsampleMarksToCap(marks, 0).marks).toBe(marks) // cap 0 → no-op
    expect(downsampleMarksToCap([], 2000).marks).toEqual([]) // empty
  })
})
