/**
 * vizFramePump (PV72, #302) — the single rAF + shared sampler that drives all
 * worker viz. Tests the CADENCE CONTRACT with a manually-flushed rAF: one loop for
 * N renderers, ONE cache + ONE governor observation per tick, register/unregister
 * lifecycle, and isolation of a throwing driven.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { vizFramePump, type PumpDriven } from '../vizFramePump'
import { vizGovernor } from '../vizGovernor'
import { FrameSampleCache } from '../worker/frameSampleCache'

// ── manual rAF control ───────────────────────────────────────────────────────
let pending: Array<(ts: number) => void> = []
let nextId = 1

function flush(ts: number): void {
  const cbs = pending
  pending = []
  for (const cb of cbs) cb(ts)
}

beforeEach(() => {
  pending = []
  nextId = 1
  vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => {
    pending.push(cb)
    return nextId++
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vizFramePump._resetForTest()
  // Governor on but at a healthy baseline → no-op gates (so pumpTick produces).
  vizGovernor._setEnabledForTest(true)
})

afterEach(() => {
  vizFramePump._resetForTest()
  vi.unstubAllGlobals()
})

/** A fake driven that records the ticks it received. */
function fakeDriven(id: string, opts: { throws?: boolean } = {}): PumpDriven & {
  ticks: Array<{ ts: number; cache: FrameSampleCache | undefined }>
} {
  const ticks: Array<{ ts: number; cache: FrameSampleCache | undefined }> = []
  return {
    perfId: id,
    ticks,
    pumpTick(ts, cache) {
      ticks.push({ ts, cache })
      if (opts.throws) throw new Error('boom')
    },
  }
}

describe('vizFramePump — lifecycle', () => {
  it('starts the loop on first register, drives pumpTick, stops on last unregister', () => {
    const d = fakeDriven('a')
    expect(vizFramePump.state()).toMatchObject({ running: false, n: 0 })

    vizFramePump.register(d)
    expect(vizFramePump.state()).toMatchObject({ running: true, n: 1 })

    flush(16)
    expect(d.ticks.map((t) => t.ts)).toEqual([16])

    flush(33)
    expect(d.ticks.map((t) => t.ts)).toEqual([16, 33])

    vizFramePump.unregister('a')
    expect(vizFramePump.state()).toMatchObject({ running: false, n: 0 })
    // After unregister the loop is stopped — a stale flush drives nobody.
    flush(50)
    expect(d.ticks).toHaveLength(2)
  })

  it('register is idempotent (re-register does not double-schedule)', () => {
    const d = fakeDriven('a')
    vizFramePump.register(d)
    vizFramePump.register(d) // idempotent
    expect(vizFramePump.state().n).toBe(1)
    flush(16)
    expect(d.ticks).toHaveLength(1) // ONE loop, one tick (not two)
  })
})

describe('vizFramePump — one clock, one cache for all', () => {
  it('drives N renderers from ONE loop with the SAME cache per tick', () => {
    const a = fakeDriven('a')
    const b = fakeDriven('b')
    vizFramePump.register(a)
    vizFramePump.register(b)

    flush(16)
    expect(a.ticks).toHaveLength(1)
    expect(b.ticks).toHaveLength(1)
    // The shared per-tick cache is the SAME instance for both (so a shared analyser
    // read is deduped across them) and is a FrameSampleCache.
    expect(a.ticks[0].cache).toBe(b.ticks[0].cache)
    expect(a.ticks[0].cache).toBeInstanceOf(FrameSampleCache)

    // Next tick → a fresh cache (never reused across frames).
    flush(33)
    expect(a.ticks[1].cache).not.toBe(a.ticks[0].cache)
  })

  it('passes NO cache when the shared cache is disabled (A/B / escape hatch)', () => {
    vizFramePump._resetForTest(false) // shared cache OFF
    const a = fakeDriven('a')
    vizFramePump.register(a)
    flush(16)
    expect(a.ticks[0].cache).toBeUndefined() // each viz samples locally, no dedup
    expect(vizFramePump.state().sharedCache).toBe(false)
  })

  it('calls vizGovernor.observeFrame ONCE per tick (not once per renderer)', () => {
    const spy = vi.spyOn(vizGovernor, 'observeFrame')
    vizFramePump.register(fakeDriven('a'))
    vizFramePump.register(fakeDriven('b'))
    vizFramePump.register(fakeDriven('c'))
    flush(16)
    expect(spy.mock.calls.filter((c) => c[0] === 16)).toHaveLength(1)
    spy.mockRestore()
  })
})

describe('vizFramePump — fault isolation', () => {
  it('a throwing driven does not stop the loop or skip the others', () => {
    const bad = fakeDriven('bad', { throws: true })
    const good = fakeDriven('good')
    vizFramePump.register(bad)
    vizFramePump.register(good)

    flush(16)
    expect(good.ticks).toHaveLength(1) // not skipped by bad's throw
    // The loop survived — it rescheduled, so the next frame still drives both.
    flush(33)
    expect(good.ticks).toHaveLength(2)
    expect(vizFramePump.state().running).toBe(true)
  })
})
