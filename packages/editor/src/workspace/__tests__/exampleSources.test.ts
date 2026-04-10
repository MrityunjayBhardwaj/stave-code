/**
 * exampleSources — unit tests for the two prebaked example sources.
 *
 * `DrumPatternScheduler` and `ChordProgressionScheduler` are the
 * query-only cores of the `drumPattern` and `chordProgression`
 * built-in sources. Both are pure functions of
 * `{ currentTime: number }` + the query range, so these tests
 * exercise them in isolation with a stub ctx — no AudioContext,
 * no bus publication, no real audio.
 *
 * The audio graph and bus plumbing aren't covered here (they
 * depend on a real Web Audio implementation). The schedulers are
 * the interesting part — they're what viz tabs actually query.
 */

import { describe, it, expect } from 'vitest'
import { DrumPatternScheduler } from '../drumPattern'
import { ChordProgressionScheduler } from '../chordProgression'

// ---------------------------------------------------------------------------
// DrumPatternScheduler
// ---------------------------------------------------------------------------

describe('DrumPatternScheduler', () => {
  function make(initialTime = 0) {
    const ctx = { currentTime: initialTime }
    return { scheduler: new DrumPatternScheduler(ctx), ctx }
  }

  it('forwards ctx.currentTime via now()', () => {
    const { scheduler, ctx } = make()
    expect(scheduler.now()).toBe(0)
    ctx.currentTime = 3.5
    expect(scheduler.now()).toBe(3.5)
  })

  it('returns the full 4-beat bar over [0, 2)', () => {
    const { scheduler } = make()
    const events = scheduler.query(0, 2)
    // 4 kicks + 2 snares + 8 closed hats + 1 open hat = 15 hits
    expect(events.length).toBe(15)

    // Verify per-voice counts.
    const bdCount = events.filter((e) => e.s === 'bd').length
    const sdCount = events.filter((e) => e.s === 'sd').length
    const hhCount = events.filter((e) => e.s === 'hh').length
    const ohCount = events.filter((e) => e.s === 'oh').length
    expect(bdCount).toBe(4)
    expect(sdCount).toBe(2)
    expect(hhCount).toBe(8)
    expect(ohCount).toBe(1)
  })

  it('kick lands on every beat 0, 0.5, 1, 1.5', () => {
    const { scheduler } = make()
    const kicks = scheduler.query(0, 2).filter((e) => e.s === 'bd')
    expect(kicks.map((e) => e.begin)).toEqual([0, 0.5, 1, 1.5])
  })

  it('snare lands on the backbeat (beats 2 and 4)', () => {
    const { scheduler } = make()
    const snares = scheduler.query(0, 2).filter((e) => e.s === 'sd')
    expect(snares.map((e) => e.begin)).toEqual([0.5, 1.5])
  })

  it('each drum hit has a short duration of 0.1 seconds', () => {
    const { scheduler } = make()
    const events = scheduler.query(0, 2)
    for (const e of events) {
      expect(e.end - e.begin).toBeCloseTo(0.1)
    }
  })

  it('tags each event with the drum voice name as trackId', () => {
    const { scheduler } = make()
    const events = scheduler.query(0, 2)
    for (const e of events) {
      expect(e.trackId).toBe(e.s)
    }
  })

  it('repeats across bar boundaries', () => {
    const { scheduler } = make()
    // Query [0, 4) — two full bars = 30 hits.
    const events = scheduler.query(0, 4)
    expect(events.length).toBe(30)
  })

  it('returns [] for an empty range', () => {
    const { scheduler } = make()
    expect(scheduler.query(1, 1)).toEqual([])
  })

  it('populates IREvent fields the pianoroll reads', () => {
    const { scheduler } = make()
    const kick = scheduler.query(0, 0.1).find((e) => e.s === 'bd')
    expect(kick).toBeDefined()
    expect(kick!.note).toBe(36)
    expect(kick!.freq).toBeCloseTo(65.4, 0) // C2 ≈ 65.4 Hz
    expect(kick!.gain).toBe(1)
    expect(kick!.velocity).toBe(1)
    expect(kick!.type).toBe('sample')
  })
})

// ---------------------------------------------------------------------------
// ChordProgressionScheduler
// ---------------------------------------------------------------------------

describe('ChordProgressionScheduler', () => {
  function make(initialTime = 0) {
    const ctx = { currentTime: initialTime }
    return { scheduler: new ChordProgressionScheduler(ctx), ctx }
  }

  it('forwards ctx.currentTime via now()', () => {
    const { scheduler, ctx } = make()
    expect(scheduler.now()).toBe(0)
    ctx.currentTime = 7
    expect(scheduler.now()).toBe(7)
  })

  it('emits 3 simultaneous voices per chord, 4 chords per cycle (12 events/cycle)', () => {
    const { scheduler } = make()
    const events = scheduler.query(0, 8)
    expect(events.length).toBe(12)
  })

  it('first chord is Cmaj (60, 64, 67) held for [0, 2)', () => {
    const { scheduler } = make()
    const firstChord = scheduler.query(0, 2)
    expect(firstChord.length).toBe(3)
    expect(firstChord.map((e) => e.note).sort((a, b) => (a as number) - (b as number)))
      .toEqual([60, 64, 67])
    for (const e of firstChord) {
      expect(e.begin).toBe(0)
      expect(e.end).toBe(2)
      expect(e.s).toBe('chord-C')
      expect(e.trackId).toBe('chord-C')
    }
  })

  it('second chord is Am (57, 60, 64) at [2, 4)', () => {
    const { scheduler } = make()
    const chord = scheduler.query(2, 4)
    expect(chord.map((e) => e.note).sort((a, b) => (a as number) - (b as number)))
      .toEqual([57, 60, 64])
    for (const e of chord) expect(e.s).toBe('chord-Am')
  })

  it('fourth chord is Gmaj (55, 59, 62) at [6, 8)', () => {
    const { scheduler } = make()
    const chord = scheduler.query(6, 8)
    expect(chord.map((e) => e.note).sort((a, b) => (a as number) - (b as number)))
      .toEqual([55, 59, 62])
    for (const e of chord) expect(e.s).toBe('chord-G')
  })

  it('wraps cleanly into the next cycle at [8, 10)', () => {
    const { scheduler } = make()
    // Cycle 2's first chord starts at t=8.
    const chord = scheduler.query(8, 10)
    expect(chord.length).toBe(3)
    expect(chord.every((e) => e.s === 'chord-C')).toBe(true)
    expect(chord.every((e) => e.begin === 8)).toBe(true)
  })

  it('spanning query returns events from all chords overlapping the range', () => {
    const { scheduler } = make()
    // Range [1, 7) overlaps Cmaj (partial), Am, Fmaj, Gmaj (partial)
    // = 4 chords × 3 voices = 12 events.
    const events = scheduler.query(1, 7)
    expect(events.length).toBe(12)
  })

  it('returns [] for a zero-width range', () => {
    const { scheduler } = make()
    expect(scheduler.query(3, 3)).toEqual([])
  })
})
