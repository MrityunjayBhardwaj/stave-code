import { describe, it, expect, beforeEach } from 'vitest'
import { computeStress, maxPerFrame, periodFor, minGapMs, vizGovernor } from '../vizGovernor'

describe('vizGovernor — pure helpers', () => {
  it('computeStress: 0 when smooth, 1 when janky, ramps between', () => {
    expect(computeStress(8)).toBe(0) // 120fps → no stress
    expect(computeStress(20)).toBe(0) // healthy floor
    expect(computeStress(45)).toBe(1) // jank ceiling
    expect(computeStress(100)).toBe(1) // clamps
    const mid = computeStress(32.5) // halfway 20..45
    expect(mid).toBeGreaterThan(0.4)
    expect(mid).toBeLessThan(0.6)
  })

  it('maxPerFrame: all viz when smooth, one when fully stressed', () => {
    expect(maxPerFrame(5, 0)).toBe(5)
    expect(maxPerFrame(5, 1)).toBe(1)
    expect(maxPerFrame(1, 0)).toBe(1)
    expect(maxPerFrame(5, 0.5)).toBeGreaterThanOrEqual(2)
  })

  it('periodFor: every frame when smooth, every Nth when stressed', () => {
    expect(periodFor(5, 0)).toBe(1) // all draw every frame
    expect(periodFor(5, 1)).toBe(5) // one viz per frame, each every 5th
    expect(periodFor(1, 1)).toBe(1) // single viz: round-robin can't throttle it
  })

  it('minGapMs: no floor when smooth, ≥10fps gap when fully stressed', () => {
    expect(minGapMs(0)).toBe(0)
    expect(minGapMs(1)).toBe(100) // 1000/MIN_FPS(10)
    expect(minGapMs(0.5)).toBe(50)
  })
})

describe('vizGovernor — transparency when smooth', () => {
  beforeEach(() => vizGovernor._setEnabledForTest(true))

  it('is a no-op at stress 0: every viz may produce every frame', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) vizGovernor.register(id)
    let ts = 1000
    for (let i = 0; i < 6; i++) {
      ts += 8 // healthy 120fps cadence
      vizGovernor.observeFrame(ts)
    }
    expect(vizGovernor.state().stress).toBe(0)
    const allProduce = ['a', 'b', 'c', 'd', 'e'].every((id) => vizGovernor.mayProduce(id, ts))
    expect(allProduce).toBe(true)
  })

  it('disabled → always true regardless of stress', () => {
    vizGovernor._setEnabledForTest(false)
    for (const id of ['a', 'b']) vizGovernor.register(id)
    let ts = 1000
    for (let i = 0; i < 8; i++) { ts += 100; vizGovernor.observeFrame(ts) }
    expect(['a', 'b'].every((id) => vizGovernor.mayProduce(id, ts))).toBe(true)
  })
})

describe('vizGovernor — throttles under sustained jank', () => {
  beforeEach(() => vizGovernor._setEnabledForTest(true))

  function warmJank(ids: string[], deltaMs = 100, frames = 10): number {
    for (const id of ids) vizGovernor.register(id)
    let ts = 1000
    for (let i = 0; i < frames; i++) { ts += deltaMs; vizGovernor.observeFrame(ts) }
    return ts
  }

  it('raises stress and caps concurrency: ≤2 of 5 viz produce on a janky frame', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const ts = warmJank(ids)
    expect(vizGovernor.state().stress).toBeGreaterThan(0.9)
    const producers = ids.filter((id) => vizGovernor.mayProduce(id, ts)).length
    expect(producers).toBeGreaterThanOrEqual(1)
    expect(producers).toBeLessThanOrEqual(2) // round-robin spreads the rest to other frames
  })

  it('is fair: every viz produces at least once across a full round-robin period', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    let ts = warmJank(ids)
    const produced = new Set<string>()
    // Walk several frames; each advances frameIndex via observeFrame.
    for (let f = 0; f < 5; f++) {
      ts += 100
      vizGovernor.observeFrame(ts)
      for (const id of ids) if (vizGovernor.mayProduce(id, ts)) produced.add(id)
    }
    expect(produced.size).toBe(ids.length) // no viz starved
  })

  it('throttles even a SINGLE heavy viz via the fps-gap floor', () => {
    const ts = warmJank(['solo'])
    expect(vizGovernor.state().stress).toBeGreaterThan(0.9)
    // First produce allowed (no prior), records lastProduce.
    expect(vizGovernor.mayProduce('solo', ts)).toBe(true)
    // A second produce only 5ms later is blocked by the ~100ms stress gap.
    expect(vizGovernor.mayProduce('solo', ts + 5)).toBe(false)
    // After a full gap it's allowed again.
    expect(vizGovernor.mayProduce('solo', ts + 120)).toBe(true)
  })

  it('eases stress back down (slow) once frames recover', () => {
    const ids = ['a', 'b']
    let ts = warmJank(ids)
    const peak = vizGovernor.state().stress
    expect(peak).toBeGreaterThan(0.9)
    // Healthy frames now — stress should DECREASE but not snap to 0 (hysteresis).
    for (let i = 0; i < 3; i++) { ts += 8; vizGovernor.observeFrame(ts) }
    const eased = vizGovernor.state().stress
    expect(eased).toBeLessThan(peak)
    expect(eased).toBeGreaterThan(0) // slow release, not instant
  })

  it('resets to healthy when the last viz unregisters', () => {
    const ids = ['a', 'b']
    warmJank(ids)
    expect(vizGovernor.state().stress).toBeGreaterThan(0.9)
    for (const id of ids) vizGovernor.unregister(id)
    expect(vizGovernor.state().stress).toBe(0)
    expect(vizGovernor.state().n).toBe(0)
  })
})
