// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BufferedScheduler } from '../BufferedScheduler'
import { HapStream } from '../HapStream'
import type { HapEvent } from '../HapStream'

// Mock AudioContext with controllable currentTime
function mockAudioCtx(time = 0): AudioContext {
  return { currentTime: time } as AudioContext
}

function emitEvent(
  stream: HapStream,
  audioTime: number,
  opts?: Partial<HapEvent>
): void {
  const duration = opts?.audioDuration ?? 0.25
  stream.emit(
    { value: { note: opts?.midiNote ?? 60, s: opts?.s ?? 'sine' } },
    audioTime,    // deadline
    duration,     // duration in seconds
    1,            // cps
    audioTime     // audioCtxCurrentTime
  )
}

describe('BufferedScheduler', () => {
  let stream: HapStream
  let ctx: AudioContext

  beforeEach(() => {
    stream = new HapStream()
    ctx = mockAudioCtx(0)
  })

  it('accumulates events from HapStream', () => {
    const sched = new BufferedScheduler(stream, ctx)
    emitEvent(stream, 1.0)
    emitEvent(stream, 1.5)
    emitEvent(stream, 2.0)
    expect(sched.query(0, 3)).toHaveLength(3)
    sched.dispose()
  })

  it('query filters by time range', () => {
    const sched = new BufferedScheduler(stream, ctx)
    emitEvent(stream, 1.0)
    emitEvent(stream, 2.0)
    emitEvent(stream, 3.0)

    const result = sched.query(1.5, 2.5)
    expect(result).toHaveLength(1)
    expect(result[0].begin).toBe(2.0)
    sched.dispose()
  })

  it('query returns events overlapping the range (not just starting in it)', () => {
    const sched = new BufferedScheduler(stream, ctx)
    // Event from 1.0 to 1.25 — overlaps range [1.1, 2.0)
    emitEvent(stream, 1.0)
    const result = sched.query(1.1, 2.0)
    expect(result).toHaveLength(1)
    sched.dispose()
  })

  it('now() returns audioContext.currentTime', () => {
    const sched = new BufferedScheduler(stream, ctx)
    expect(sched.now()).toBe(0)
    ;(ctx as any).currentTime = 5.5
    expect(sched.now()).toBe(5.5)
    sched.dispose()
  })

  describe('per-instrument overlap clipping', () => {
    it('clips previous event of SAME instrument when overlapping', () => {
      const sched = new BufferedScheduler(stream, ctx)
      // bd_haus at t=1.0 with duration 0.5 → end=1.5
      emitEvent(stream, 1.0, { s: 'bd_haus', audioDuration: 0.5 })
      // sn_dub at t=1.3 (same instrument group would be different)
      emitEvent(stream, 1.3, { s: 'bd_haus', audioDuration: 0.5 })

      const events = sched.query(0, 3)
      // First event should be clipped to end=1.3
      expect(events[0].end).toBe(1.3)
      expect(events[0].endClipped).toBe(1.3)
      // Second event is unclipped
      expect(events[1].end).toBe(1.8)
      sched.dispose()
    })

    it('does NOT clip events from DIFFERENT instruments', () => {
      const sched = new BufferedScheduler(stream, ctx)
      // bd_haus at t=1.0 with long duration
      emitEvent(stream, 1.0, { s: 'bd_haus', audioDuration: 1.0 })
      // sn_dub at t=1.2 — different instrument
      emitEvent(stream, 1.2, { s: 'sn_dub', audioDuration: 0.5 })

      const events = sched.query(0, 3)
      // bd_haus should NOT be clipped by sn_dub
      expect(events[0].s).toBe('bd_haus')
      expect(events[0].end).toBe(2.0) // original end preserved
      expect(events[1].s).toBe('sn_dub')
      expect(events[1].end).toBe(1.7)
      sched.dispose()
    })
  })

  describe('eviction', () => {
    it('evicts events older than maxAge', () => {
      const sched = new BufferedScheduler(stream, ctx, 2) // 2s maxAge
      emitEvent(stream, 0.0)
      emitEvent(stream, 0.5)
      emitEvent(stream, 1.0)

      // Advance time past maxAge for first events
      ;(ctx as any).currentTime = 3.0
      // Trigger eviction by adding a new event
      emitEvent(stream, 3.0)

      // Events at 0.0 and 0.5 should be evicted (ended at 0.25, 0.75 — both < 1.0 cutoff)
      const result = sched.query(0, 4)
      expect(result.every(e => e.begin >= 1.0)).toBe(true)
      sched.dispose()
    })
  })

  describe('clear and dispose', () => {
    it('clear() empties the buffer', () => {
      const sched = new BufferedScheduler(stream, ctx)
      emitEvent(stream, 1.0)
      emitEvent(stream, 2.0)
      expect(sched.query(0, 3)).toHaveLength(2)

      sched.clear()
      expect(sched.query(0, 3)).toHaveLength(0)
      sched.dispose()
    })

    it('dispose() unsubscribes from HapStream', () => {
      const sched = new BufferedScheduler(stream, ctx)
      emitEvent(stream, 1.0)
      expect(sched.query(0, 2)).toHaveLength(1)

      sched.dispose()
      // New events after dispose should not accumulate
      emitEvent(stream, 2.0)
      expect(sched.query(0, 3)).toHaveLength(0)
    })
  })

  describe('IREvent fields', () => {
    it('computes freq from midiNote', () => {
      const sched = new BufferedScheduler(stream, ctx)
      emitEvent(stream, 1.0, { midiNote: 69 }) // A4 = 440Hz
      const events = sched.query(0, 2)
      expect(events[0].freq).toBeCloseTo(440)
      sched.dispose()
    })

    it('sets freq to null for non-numeric midiNote', () => {
      const sched = new BufferedScheduler(stream, ctx)
      // Use emitEvent directly — emit() extracts midiNote from raw hap
      stream.emitEvent({
        audioTime: 1.0,
        audioDuration: 0.25,
        scheduledAheadMs: 0,
        midiNote: null,
        s: 'bd_haus',
        color: null,
        loc: null,
      })
      const events = sched.query(0, 2)
      expect(events[0].freq).toBeNull()
      sched.dispose()
    })

    it('preserves loc from HapEvent', () => {
      const sched = new BufferedScheduler(stream, ctx)
      // Emit via emitEvent directly to pass loc
      stream.emitEvent({
        audioTime: 1.0,
        audioDuration: 0.25,
        scheduledAheadMs: 0,
        midiNote: 60,
        s: 'sine',
        color: '#ff0000',
        loc: [{ start: 10, end: 20 }],
      })
      const events = sched.query(0, 2)
      expect(events[0].loc).toEqual([{ start: 10, end: 20 }])
      expect(events[0].color).toBe('#ff0000')
      sched.dispose()
    })
  })
})
