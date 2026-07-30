/**
 * song-period-axes — the Song view's display period, per AXIS, end to end
 * through the real engine (#1102).
 *
 * The corpus sweep beside this file says what MOVED; these arms say what the
 * rule IS. Each one is a whole document evaluated by Strudel and analysed by the
 * production `analyzeSong`, so an arm that goes green because a unit fixture was
 * built to suit it is not a failure mode available here.
 *
 * The first four rows are #1102's own issue table, verbatim — including the two
 * that always passed, because a gate that only contains the broken cases cannot
 * show that the fix left the working ones alone. The last group is the controls:
 * a document with genuinely identical sections must STILL read 1, or the fix has
 * bought its discrimination by making everything look different.
 */
import { describe, it, expect } from 'vitest'
import { periodOfDocument } from './songPeriodSweep'

const period = async (code: string): Promise<number | null> =>
  (await periodOfDocument(code, code)).period

describe("#1102's issue table — an arrangement's sections must be told apart", () => {
  it('by SOUND — the filed defect, read 1 before the fix', async () => {
    expect(await period('arrange([2, s("bd")], [2, s("hh")])')).toBe(4)
  })

  it('by sound, LABELLED — the same document with a `$:`, also read 1 before', async () => {
    expect(await period('$: arrange([2, s("bd")], [2, s("hh")])')).toBe(4)
  })

  it('by RHYTHM — worked before, must keep working', async () => {
    expect(await period('arrange([2, s("bd")], [2, s("hh*2")])')).toBe(4)
  })

  it('by NOTE — worked before, must keep working', async () => {
    expect(await period('arrange([2, note("c4")], [2, note("e4")])')).toBe(4)
  })
})

describe('the axes found while diagnosing, which naming `s` alone would have left blind', () => {
  it('by PARAM — ~250 off-list controls route into `params` (#928)', async () => {
    expect(await period('arrange([2, s("bd").speed(1)], [2, s("bd").speed(2)])')).toBe(4)
  })

  it('by GAIN', async () => {
    expect(await period('arrange([2, s("bd").gain(0.3)], [2, s("bd").gain(0.9)])')).toBe(4)
  })
})

describe('controls — discrimination must not be bought by making everything differ', () => {
  it('genuinely identical sections still read 1', async () => {
    expect(await period('arrange([2, s("bd")], [2, s("bd")])')).toBe(1)
  })

  it('a plain one-cycle loop still reads 1', async () => {
    expect(await period('s("bd*4")')).toBe(1)
  })

  it('the same sound at two source positions is the same sound — provenance is not identity', async () => {
    // Two arms whose events differ in `loc` and `armIndex` and in nothing else.
    // If any provenance field reached the fingerprint this would read 2, and
    // every arrangement in the corpus would become longer by construction —
    // which is the same defect as #1102 with its sign flipped.
    expect(await period('cat(s("bd*4"), s("bd*4"))')).toBe(1)
  })
})

describe('`cat` shares the machinery, as the issue predicted', () => {
  it('tells `cat` sections apart by sound too', async () => {
    expect(await period('cat(s("bd*4"), s("hh*4"))')).toBe(2)
  })
})
