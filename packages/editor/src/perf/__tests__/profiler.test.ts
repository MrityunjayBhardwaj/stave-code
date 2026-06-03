/**
 * profiler — core stats engine (issue #228).
 *
 * Pure logic over a singleton; we toggle enabled per-test and reset between.
 * `performance.now` is stubbed to a controllable clock so interval/duration
 * math is deterministic (no real wall-clock flake).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { perf } from '../profiler'

// Controllable monotonic clock — the profiler reads performance.now().
let clock = 0
beforeEach(() => {
  clock = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  perf.setEnabled(true)
  perf.reset()
})
afterEach(() => {
  perf.setEnabled(false)
  vi.restoreAllMocks()
})

describe('disabled = zero-cost no-op', () => {
  it('records nothing while disabled', () => {
    perf.setEnabled(false)
    perf.record('x', 5)
    perf.frame('a')
    perf.inc('c')
    const snap = perf.snapshot()
    expect(snap.enabled).toBe(false)
    expect(snap.sections).toEqual({})
    expect(snap.frames).toEqual({})
    expect(snap.counters).toEqual({})
    expect(snap.uptimeMs).toBe(0)
  })
})

describe('section stats', () => {
  it('aggregates count / mean / max / last', () => {
    for (const v of [10, 20, 30]) perf.record('s', v)
    const s = perf.snapshot().sections.s
    expect(s.count).toBe(3)
    expect(s.mean).toBeCloseTo(20, 6)
    expect(s.max).toBe(30)
    expect(s.last).toBe(30)
  })

  it('computes nearest-rank percentiles', () => {
    for (let v = 1; v <= 100; v++) perf.record('s', v)
    const s = perf.snapshot().sections.s
    expect(s.p50).toBe(50)
    expect(s.p95).toBe(95)
    expect(s.p99).toBe(99)
    expect(s.max).toBe(100)
  })

  it('keeps total count uncapped but stats over the retained ring', () => {
    // Push more than RING (240). The retained window is the LAST 240, but the
    // total count reflects all pushes.
    for (let i = 0; i < 300; i++) perf.record('s', 7)
    const s = perf.snapshot().sections.s
    expect(s.count).toBe(300)
    expect(s.mean).toBe(7)
    expect(s.max).toBe(7)
  })
})

describe('begin/end + time', () => {
  it('end() records the elapsed span', () => {
    perf.begin('span')
    clock += 12
    perf.end('span')
    expect(perf.snapshot().sections.span.last).toBe(12)
  })

  it('end() with no matching begin is a safe no-op', () => {
    perf.end('never-opened')
    expect(perf.snapshot().sections['never-opened']).toBeUndefined()
  })

  it('time() returns the fn result and records duration', () => {
    const out = perf.time('t', () => {
      clock += 5
      return 42
    })
    expect(out).toBe(42)
    expect(perf.snapshot().sections.t.last).toBe(5)
  })

  it('time() runs the fn but skips recording when disabled', () => {
    perf.setEnabled(false)
    let ran = false
    const out = perf.time('t', () => {
      ran = true
      return 'ok'
    })
    expect(ran).toBe(true)
    expect(out).toBe('ok')
    expect(perf.snapshot().sections.t).toBeUndefined()
  })
})

describe('frames → fps + drops', () => {
  it('derives fps from the median interval', () => {
    // 5 frames at a steady 10ms interval → 4 intervals of 10 → ~100fps.
    for (let i = 0; i < 5; i++) {
      perf.frame('a')
      clock += 10
    }
    const f = perf.snapshot().frames.a
    expect(f.count).toBe(5)
    expect(f.p50).toBe(10)
    expect(f.fps).toBeCloseTo(100, 4)
    expect(f.drops).toBe(0)
  })

  it('counts a stutter as a dropped frame (> 2× median)', () => {
    // Build a stable 10ms median, then one 50ms frame (5× median) → 1 drop.
    for (let i = 0; i < 6; i++) {
      perf.frame('a')
      clock += 10
    }
    perf.frame('a') // closes a normal 10ms interval; median now firmly 10
    clock += 50
    perf.frame('a') // 50ms interval → drop
    expect(perf.snapshot().frames.a.drops).toBeGreaterThanOrEqual(1)
  })

  it('dropFrames forgets a dead instance', () => {
    perf.frame('a')
    clock += 10
    perf.frame('a')
    expect(perf.snapshot().frames.a).toBeDefined()
    perf.dropFrames('a')
    expect(perf.snapshot().frames.a).toBeUndefined()
  })
})

describe('counters (cumulative) vs gauges (live state)', () => {
  it('inc/dec accumulate a cumulative counter', () => {
    perf.inc('triggers', 8)
    perf.inc('triggers')
    expect(perf.snapshot().counters.triggers).toBe(9)
  })

  it('gauge tracks a live +1/-1 count', () => {
    perf.gauge('viz', 1)
    perf.gauge('viz', 1)
    perf.gauge('viz', -1)
    expect(perf.snapshot().gauges.viz).toBe(1)
  })
})

describe('reset', () => {
  it('clears samples + counters but keeps enabled AND live gauges', () => {
    perf.record('s', 1)
    perf.frame('a')
    perf.inc('c') // cumulative — cleared
    perf.gauge('viz.p5', 2) // live gauge — survives (instances still mounted)
    perf.reset()
    const snap = perf.snapshot()
    expect(snap.enabled).toBe(true)
    expect(snap.sections).toEqual({})
    expect(snap.frames).toEqual({})
    expect(snap.counters).toEqual({})
    // The gauge represents what's live NOW — reset must NOT wipe it.
    expect(snap.gauges['viz.p5']).toBe(2)
  })
})
