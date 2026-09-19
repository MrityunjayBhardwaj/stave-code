// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { watchSkippedTicks } from '../StrudelEngine'

/**
 * #1348 — counting the notes a late scheduler tick drops. A fake pattern with
 * one onset every 0.25 cycles, and a fake scheduler that queries the way
 * Strudel's cyclist does: contiguous stretches, tagged `{ cyclist: 'cyclist' }`,
 * with a late tick skipping its query but still advancing (`cyclist.mjs:47-56`).
 */
function quarterNotes() {
  return {
    queryArc(begin: number, end: number) {
      const haps = []
      for (let k = Math.ceil(begin * 4 - 1e-9); k / 4 < end - 1e-9; k++) {
        haps.push({ at: k / 4 + 0, hasOnset: () => true })
      }
      return haps
    },
    tag: 'real',
  }
}

function fakeCyclist() {
  const sched: { pattern: any; lastEnd: number } = { pattern: null, lastEnd: 0 } // eslint-disable-line @typescript-eslint/no-explicit-any
  const dropped: number[] = []
  watchSkippedTicks(sched, (n) => dropped.push(n))
  const played: number[] = []
  const tick = (end: number, late = false) => {
    const begin = sched.lastEnd
    sched.lastEnd = end
    if (late) return
    for (const h of sched.pattern.queryArc(begin, end, { _cps: 0.5, cyclist: 'cyclist' })) played.push(h.at)
  }
  return { sched, dropped, played, tick }
}

describe('watchSkippedTicks (#1348)', () => {
  it('counts nothing while every tick queries in turn', () => {
    const c = fakeCyclist()
    c.sched.pattern = quarterNotes()
    for (let e = 0.5; e <= 2; e += 0.5) c.tick(e)
    expect(c.dropped).toEqual([])
    expect(c.played).toHaveLength(8)
  })

  it('counts the onsets of the stretch a late tick skipped', () => {
    const c = fakeCyclist()
    c.sched.pattern = quarterNotes()
    c.tick(0.5)
    c.tick(1.0, true) // skipped: 0.5, 0.75 lost
    c.tick(1.5, true) // skipped: 1.0, 1.25 lost
    c.tick(2.0)
    expect(c.dropped).toEqual([4])
    expect(c.played).toEqual([0, 0.25, 1.5, 1.75])
  })

  it('a restart is not a gap', () => {
    const c = fakeCyclist()
    c.sched.pattern = quarterNotes()
    c.tick(1.0)
    c.sched.lastEnd = 0 // stop()
    c.tick(0.5)
    expect(c.dropped).toEqual([])
  })

  it('ignores queries that are not the scheduler own', () => {
    const c = fakeCyclist()
    c.sched.pattern = quarterNotes()
    c.tick(0.5)
    c.sched.pattern.queryArc(3, 4) // a visualiser looking ahead
    c.tick(1.0)
    expect(c.dropped).toEqual([])
  })

  it('wraps every pattern the scheduler is given, and the wrapper reads like the pattern', () => {
    const c = fakeCyclist()
    const first = quarterNotes()
    c.sched.pattern = first
    expect(c.sched.pattern.tag).toBe('real')
    expect(Object.getPrototypeOf(c.sched.pattern)).toBe(first)
    c.sched.pattern = quarterNotes()
    c.tick(0.5)
    c.tick(1.0, true)
    c.tick(1.5)
    expect(c.dropped).toEqual([2])
  })
})
