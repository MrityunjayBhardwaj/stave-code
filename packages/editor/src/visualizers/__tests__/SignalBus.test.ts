/**
 * SignalBus unit tests — PURE module, loads in isolation (P12: no p5/hydra).
 *
 * Covers the PLAN T1 (a)-(f) observations AND the two non-negotiable traps
 * (RESEARCH §5):
 *   1. Per-field feed — `.velocity`/`.note` from the SCHEDULER feed, never the
 *      envelope (HapEvent has NO velocity → silent zero).
 *   2. Two key spaces — `track('$0')` keys on `trackSchedulers.get('$0')`, NOT
 *      `IREvent.trackId` (which is `'d1'` for anonymous blocks).
 */

import { describe, it, expect } from 'vitest'
import { SignalBus, type BusHapEvent } from '../signals/SignalBus'
import { ALIAS_MAP } from '../signals/aliasMap'
import type { IRPattern } from '../../ir/IRPattern'
import type { IREvent } from '../../ir/IREvent'

/** Build a fake IREvent with sensible defaults; override per test. */
function makeEvent(over: Partial<IREvent>): IREvent {
  return {
    begin: 0,
    end: 0.1,
    endClipped: 0.1,
    note: 0,
    freq: 0,
    s: null,
    gain: 1,
    velocity: 1,
    color: null,
    ...over,
  }
}

/** A scheduler whose `query(now, now+ε)` returns a fixed event list, with a
 *  fixed `now()`. Used to drive the instantaneous (scheduler) feed. */
function makeScheduler(events: IREvent[], now = 0): IRPattern {
  return {
    now: () => now,
    query: (begin: number, end: number) =>
      events.filter((e) => e.begin >= begin && e.begin < end),
  }
}

/** A HapStream-shaped event for the envelope feed (`bump`). */
function hap(s: string, gain = 1, color: string | null = null): BusHapEvent {
  return { s, color, hap: { value: { gain } } }
}

describe('SignalBus — .env feed (bump + decay)', () => {
  it('(a) bump then 3× tick decays envValue to ≈ 0.92³', () => {
    const bus = new SignalBus()
    bus.bump(hap('bd', 1))
    bus.tick()
    bus.tick()
    bus.tick()
    const expected = 0.92 ** 3
    expect(bus.envValue('bd')).toBeCloseTo(expected, 6)
  })

  it('bump clamps the level to 1 across repeated hits', () => {
    const bus = new SignalBus()
    bus.bump(hap('bd', 0.8))
    bus.bump(hap('bd', 0.8))
    // 0.8 + 0.8 = 1.6 → clamped to 1
    expect(bus.envValue('bd')).toBe(1)
  })

  it('decay is multiplicative — a never-fired sound stays 0', () => {
    const bus = new SignalBus()
    bus.tick()
    expect(bus.envValue('bd')).toBe(0)
  })
})

describe('SignalBus — alias resolution', () => {
  it('(b) uKick alias returns the bd envelope level', () => {
    const bus = new SignalBus()
    bus.bump(hap('bd', 1))
    expect(bus.envValue('uKick')).toBe(bus.envValue('bd'))
    expect(bus.envValue('uKick')).toBe(1)
  })

  it('(c) uTom array alias = MAX over lt / mt / ht', () => {
    const bus = new SignalBus()
    bus.bump(hap('lt', 0.3))
    bus.bump(hap('ht', 0.7))
    // max(0.3, 0, 0.7) = 0.7
    expect(bus.envValue('uTom')).toBeCloseTo(0.7, 6)
    expect(ALIAS_MAP.uTom).toEqual(['lt', 'mt', 'ht'])
  })

  it('a raw sound name (no alias) resolves to itself', () => {
    const bus = new SignalBus()
    bus.bump(hap('mysound', 0.5))
    expect(bus.envValue('mysound')).toBeCloseTo(0.5, 6)
  })
})

describe('SignalBus — per-field feed (TRAP §5)', () => {
  it('(d) .velocity comes from the SCHEDULER event, NON-zero — never the envelope', () => {
    const bus = new SignalBus()
    // Envelope feed gives env, but carries NO velocity.
    bus.bump(hap('bd', 1))
    // Scheduler feed carries the real velocity.
    const scheduler = makeScheduler([makeEvent({ s: 'bd', velocity: 0.42 })])
    bus.bindScheduler(scheduler, new Map())
    bus.tick()
    bus.refreshActive(bus.now())

    const reading = bus.sound('bd')
    // .velocity sourced from the scheduler feed — NON-zero.
    expect(reading.velocity).toBe(0.42)
    // .env sourced from the envelope feed (decayed once).
    expect(reading.env).toBeCloseTo(0.92, 6)
  })

  it('.velocity is 0 (not silent-wrong) when only the envelope fed it', () => {
    // No scheduler bound → no scheduler feed → velocity has no source → 0.
    // Proves the envelope feed does NOT supply a bogus velocity.
    const bus = new SignalBus()
    bus.bump(hap('bd', 1))
    bus.refreshActive(bus.now())
    expect(bus.sound('bd').velocity).toBe(0)
    // …but .env IS present from the envelope feed.
    expect(bus.sound('bd').env).toBe(1)
  })

  it('.note preserves the user form (string name) from the scheduler feed', () => {
    const bus = new SignalBus()
    const scheduler = makeScheduler([makeEvent({ s: 'piano', note: 'c3' })])
    bus.bindScheduler(scheduler, new Map())
    bus.refreshActive(bus.now())
    expect(bus.sound('piano').note).toBe('c3')
    // noteToMidi only when a NUMBER is explicitly requested (P93).
    expect(bus.noteToMidi('c3')).toBe(48)
  })

  it('.color prefers the active IREvent, falls back to last-bumped hap color', () => {
    const bus = new SignalBus()
    // Last-bumped hap color is the fallback.
    bus.bump(hap('bd', 1, '#ff0000'))
    bus.refreshActive(bus.now())
    expect(bus.sound('bd').color).toBe('#ff0000')

    // Active IREvent color wins over the fallback.
    const scheduler = makeScheduler([makeEvent({ s: 'bd', color: '#00ff00' })])
    bus.bindScheduler(scheduler, new Map())
    bus.refreshActive(bus.now())
    expect(bus.sound('bd').color).toBe('#00ff00')
  })
})

describe('SignalBus — two key spaces (TRAP §5)', () => {
  it('(e) track("$0") keys on the scheduler map, finds events whose trackId is "d1"', () => {
    const bus = new SignalBus()
    // The event carries IREvent.trackId='d1' (the IR key space) but the
    // SCHEDULER key is '$0' (anonymous block). Keying on trackId would miss it.
    const trackSched = makeScheduler([
      makeEvent({ s: 'bd', velocity: 0.9, trackId: 'd1' }),
    ])
    const trackSchedulers = new Map<string, IRPattern>([['$0', trackSched]])
    bus.bindScheduler(makeScheduler([]), trackSchedulers)
    bus.refreshActive(bus.now())

    const t = bus.track('$0')
    expect(t.velocity).toBe(0.9)
    // Enumerates the SCHEDULER key, not the IREvent.trackId.
    expect(bus.tracks).toEqual(['$0'])
  })

  it('track(unknownKey) returns zeros, never throws', () => {
    const bus = new SignalBus()
    bus.bindScheduler(makeScheduler([]), new Map())
    bus.refreshActive(bus.now())
    const t = bus.track('nope')
    expect(t.env).toBe(0)
    expect(t.velocity).toBe(0)
    expect(t.note).toBeNull()
  })

  it('track.sound(alias) reads a specific sound within the track', () => {
    const bus = new SignalBus()
    bus.bump(hap('bd', 1))
    const trackSched = makeScheduler([
      makeEvent({ s: 'bd', velocity: 0.5, trackId: 'd1' }),
    ])
    bus.bindScheduler(
      makeScheduler([]),
      new Map<string, IRPattern>([['$0', trackSched]]),
    )
    bus.tick()
    bus.refreshActive(bus.now())
    const r = bus.track('$0').sound('uKick')
    expect(r.velocity).toBe(0.5)
    expect(r.env).toBeCloseTo(0.92, 6)
  })
})

describe('SignalBus — enumeration', () => {
  it('(f) tracks lists the scheduler keys, sounds lists bumped sounds', () => {
    const bus = new SignalBus()
    bus.bump(hap('bd'))
    bus.bump(hap('sd'))
    bus.bump(hap('bd')) // duplicate — distinct set
    bus.bindScheduler(
      makeScheduler([]),
      new Map<string, IRPattern>([
        ['$0', makeScheduler([])],
        ['$1', makeScheduler([])],
      ]),
    )
    expect(bus.tracks).toEqual(['$0', '$1'])
    expect(bus.sounds.sort()).toEqual(['bd', 'sd'])
  })

  it('demo mode (no scheduler bound) — tracks empty, now() = 0', () => {
    const bus = new SignalBus()
    expect(bus.tracks).toEqual([])
    expect(bus.now()).toBe(0)
  })
})

describe('SignalBus — purity / live-ref rebind', () => {
  it('bindScheduler rebinds live refs in place (mirror renderer update)', () => {
    const bus = new SignalBus()
    const schedA = makeScheduler([makeEvent({ s: 'bd', velocity: 0.1 })])
    bus.bindScheduler(schedA, new Map())
    bus.refreshActive(bus.now())
    expect(bus.sound('bd').velocity).toBe(0.1)

    const schedB = makeScheduler([makeEvent({ s: 'bd', velocity: 0.8 })])
    bus.bindScheduler(schedB, new Map())
    bus.refreshActive(bus.now())
    expect(bus.sound('bd').velocity).toBe(0.8)
  })

  it('accepts a custom alias map (D-04 override seam)', () => {
    const bus = new SignalBus({ uBoom: 'bd' })
    bus.bump(hap('bd', 1))
    expect(bus.envValue('uBoom')).toBe(1)
    // The built-in uKick is absent from the custom map → treated as raw name.
    expect(bus.envValue('uKick')).toBe(0)
  })
})
