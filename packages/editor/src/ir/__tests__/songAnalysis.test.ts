import { describe, it, expect, vi } from 'vitest'
import type { IREvent } from '../IREvent'
import { parseStrudel } from '../parseStrudel'
import {
  accumulateLanes,
  cycleFingerprints,
  detectPeriod,
  computeSections,
  analyzeEvents,
  analyzeSong,
  laneKeyOf,
} from '../songAnalysis'

// Minimal IREvent fixture — only the fields songAnalysis reads matter.
function ev(begin: number, lane: string, note: number | string | null = null): IREvent {
  return {
    begin,
    end: begin + 0.25,
    endClipped: begin + 0.25,
    note,
    freq: null,
    s: lane,
    gain: 1,
    velocity: 1,
    color: null,
    trackId: lane,
  }
}

describe('laneKeyOf', () => {
  it('prefers trackId, falls back to s, then $default', () => {
    expect(laneKeyOf({ ...ev(0, 'bd'), trackId: 'd1' })).toBe('d1')
    expect(laneKeyOf({ ...ev(0, 'bd'), trackId: undefined })).toBe('bd')
    expect(laneKeyOf({ ...ev(0, 'bd'), trackId: undefined, s: null })).toBe('$default')
  })
})

describe('accumulateLanes', () => {
  it('buckets onsets per integer cycle in first-seen lane order', () => {
    const events = [ev(0, 'bd'), ev(0.5, 'bd'), ev(1, 'hh'), ev(0, 'hh')]
    const lanes = accumulateLanes(events, 2)
    expect(lanes.map((l) => l.laneKey)).toEqual(['bd', 'hh']) // first-seen
    expect(lanes[0].onsetsByCycle).toEqual([2, 0]) // bd: two in cycle 0
    expect(lanes[1].onsetsByCycle).toEqual([1, 1]) // hh: one each cycle
  })

  it('ignores events outside [0, horizon)', () => {
    const lanes = accumulateLanes([ev(-1, 'bd'), ev(5, 'bd'), ev(1, 'bd')], 2)
    expect(lanes[0].onsetsByCycle).toEqual([0, 1])
  })
})

describe('cycleFingerprints + detectPeriod', () => {
  it('detects a period-4 pattern (note varies by cycle % 4)', () => {
    const events: IREvent[] = []
    for (let c = 0; c < 8; c++) events.push(ev(c, 'bd', c % 4))
    expect(detectPeriod(cycleFingerprints(events, 8))).toBe(4)
  })

  it('detects period 1 when every cycle is identical', () => {
    const events: IREvent[] = []
    for (let c = 0; c < 6; c++) events.push(ev(c, 'bd', 60))
    expect(detectPeriod(cycleFingerprints(events, 6))).toBe(1)
  })

  it('returns null when no period repeats twice within the window', () => {
    const events: IREvent[] = []
    for (let c = 0; c < 8; c++) events.push(ev(c, 'bd', c)) // all distinct
    expect(detectPeriod(cycleFingerprints(events, 8))).toBeNull()
  })

  it('requires two full repetitions (a one-off prefix is not a period)', () => {
    // [a, b, a] — p=2 would need fp[0]===fp[2] (a===a ✓) but len(3) < 2*2,
    // so p=2 is out of range; p=1 fails (a!==b). No period.
    const events = [ev(0, 'bd', 1), ev(1, 'bd', 2), ev(2, 'bd', 1)]
    expect(detectPeriod(cycleFingerprints(events, 3))).toBeNull()
  })

  it('quantises within-cycle offset so float noise does not break matching', () => {
    const a = [ev(0.3333333, 'bd', 1), ev(1.3333334, 'bd', 1)]
    // both round to the same offset → period 1
    expect(detectPeriod(cycleFingerprints(a, 2))).toBe(1)
  })
})

describe('computeSections', () => {
  it('cuts a section wherever the active-lane set changes', () => {
    // cycles 0,1 = {bd}; cycles 2,3 = {bd, hh}
    const events = [
      ev(0, 'bd'),
      ev(1, 'bd'),
      ev(2, 'bd'),
      ev(2, 'hh'),
      ev(3, 'bd'),
      ev(3, 'hh'),
    ]
    const lanes = accumulateLanes(events, 4)
    const sections = computeSections(lanes, 4)
    expect(sections).toEqual([
      { startCycle: 0, endCycle: 2, laneKeys: ['bd'] },
      { startCycle: 2, endCycle: 4, laneKeys: ['bd', 'hh'] },
    ])
  })

  it('treats a silent run as its own empty-lane section', () => {
    const events = [ev(0, 'bd'), ev(2, 'bd')] // cycle 1 silent
    const lanes = accumulateLanes(events, 3)
    const sections = computeSections(lanes, 3)
    expect(sections.map((s) => [s.startCycle, s.endCycle, s.laneKeys.length])).toEqual([
      [0, 1, 1],
      [1, 2, 0],
      [2, 3, 1],
    ])
  })

  it('returns [] for a zero horizon', () => {
    expect(computeSections([], 0)).toEqual([])
  })
})

describe('analyzeEvents', () => {
  it('composes lanes + period + sections', () => {
    const events: IREvent[] = []
    for (let c = 0; c < 4; c++) {
      events.push(ev(c, 'bd', 60))
      if (c % 2 === 0) events.push(ev(c, 'hh', 70))
    }
    const a = analyzeEvents(events, 4)
    expect(a.horizonCycles).toBe(4)
    expect(a.periodCycles).toBe(2) // hh every other cycle → period 2
    expect(a.lanes.map((l) => l.laneKey)).toEqual(['bd', 'hh'])
    expect(a.reachedCap).toBe(false)
  })
})

describe('analyzeSong (budgeted progressive horizon)', () => {
  // A period-4 collector: every cycle's note = cycle % 4 → periodic.
  const periodicCollect = (s: number, e: number): IREvent[] => {
    const out: IREvent[] = []
    for (let c = s; c < e; c++) out.push(ev(c, 'bd', c % 4))
    return out
  }
  // A never-repeating collector: note = cycle (all distinct) → no period.
  const uniqueCollect = (s: number, e: number): IREvent[] => {
    const out: IREvent[] = []
    for (let c = s; c < e; c++) out.push(ev(c, 'bd', c))
    return out
  }

  it('finds the period at the hint horizon without growing', async () => {
    const a = await analyzeSong(null, {
      hintCycles: 8,
      collectFn: periodicCollect,
      yieldFn: async () => {},
    })
    expect(a.periodCycles).toBe(4)
    expect(a.horizonCycles).toBe(8)
    expect(a.reachedCap).toBe(false)
  })

  it('doubles the horizon to the cap when no period is found, flagging reachedCap', async () => {
    const a = await analyzeSong(null, {
      hintCycles: 4,
      capCycles: 16,
      collectFn: uniqueCollect,
      yieldFn: async () => {},
    })
    expect(a.periodCycles).toBeNull()
    expect(a.horizonCycles).toBe(16)
    expect(a.reachedCap).toBe(true)
  })

  it('yields to the event loop when a slice exceeds the time budget', async () => {
    const yieldFn = vi.fn(async () => {})
    // now() always jumps 100ms per call → every slice exceeds the 10ms budget.
    let t = 0
    const now = () => (t += 100)
    // period-2 collector so analysis stops at the hint (no growth) → 4 cycles.
    const collectFn = (s: number, e: number): IREvent[] => {
      const out: IREvent[] = []
      for (let c = s; c < e; c++) out.push(ev(c, 'bd', c % 2))
      return out
    }
    await analyzeSong(null, {
      hintCycles: 4,
      sliceCycles: 1,
      sliceBudgetMs: 10,
      collectFn,
      now,
      yieldFn,
    })
    // Slices fill [0,4): yields after cycles 1,2,3 (not the final one).
    expect(yieldFn).toHaveBeenCalledTimes(3)
  })

  it('returns a partial analysis when aborted mid-collection', async () => {
    const signal = { aborted: false }
    let collected = 0
    const collectFn = (s: number, e: number): IREvent[] => {
      collected = e
      if (e >= 4) signal.aborted = true // abort after 4 cycles
      return uniqueCollect(s, e)
    }
    const a = await analyzeSong(null, {
      hintCycles: 32,
      sliceCycles: 2,
      collectFn,
      yieldFn: async () => {},
      signal,
    })
    expect(collected).toBeLessThan(32) // stopped early
    expect(a.horizonCycles).toBeLessThanOrEqual(collected)
  })

  it('yields an empty analysis for a null IR and no collector', async () => {
    const a = await analyzeSong(null, { yieldFn: async () => {} })
    expect(a.lanes).toEqual([])
    expect(a.sections).toEqual([])
  })

  // Integration through the REAL default collector (collectCycles) on a parsed
  // IR — verifies the wiring, not just the logic against injected fakes.
  describe('integration via real collectCycles', () => {
    it('an identical-every-cycle pattern has period 1 and one lane', async () => {
      const ir = parseStrudel('s("bd hh bd hh")')
      const a = await analyzeSong(ir, { hintCycles: 4, yieldFn: async () => {} })
      expect(a.periodCycles).toBe(1)
      expect(a.lanes.length).toBe(1)
      expect(a.reachedCap).toBe(false)
    })

    it('an alternating <a b> pattern has period 2', async () => {
      const ir = parseStrudel('s("<bd hh>")')
      const a = await analyzeSong(ir, { hintCycles: 8, yieldFn: async () => {} })
      expect(a.periodCycles).toBe(2)
    })
  })
})
