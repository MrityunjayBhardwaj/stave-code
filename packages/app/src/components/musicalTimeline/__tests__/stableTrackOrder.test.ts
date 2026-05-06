/**
 * stableTrackOrder — Trap 5 (CONTEXT) + DB-03.
 *
 * Tracks present in prev keep their slot; new tracks are appended;
 * disappeared tracks are reserved (their row stays). Fresh Map per call.
 */
import { describe, it, expect } from 'vitest'
import { stableTrackOrder } from '../stableTrackOrder'

describe('stableTrackOrder (Trap 5)', () => {
  it('assigns sequential slots starting at 0 from an empty prev', () => {
    const next = stableTrackOrder(new Map(), ['bd', 'hh', 'cp'])
    expect(next.get('bd')).toBe(0)
    expect(next.get('hh')).toBe(1)
    expect(next.get('cp')).toBe(2)
  })

  it('preserves existing slots when ids reappear', () => {
    const prev = new Map([
      ['bd', 0],
      ['hh', 1],
      ['cp', 2],
    ])
    const next = stableTrackOrder(prev, ['bd', 'cp']) // hh missing
    expect(next.get('bd')).toBe(0)
    expect(next.get('hh')).toBe(1) // RESERVED
    expect(next.get('cp')).toBe(2) // unchanged — NOT pushed up
  })

  it('appends new ids at max+1 after a reserved row', () => {
    const prev = new Map([
      ['bd', 0],
      ['hh', 1],
      ['cp', 2],
    ])
    // Snapshot now adds 'sn' but 'hh' is missing.
    const next = stableTrackOrder(prev, ['bd', 'sn', 'cp'])
    expect(next.get('bd')).toBe(0)
    expect(next.get('hh')).toBe(1) // reserved
    expect(next.get('cp')).toBe(2)
    expect(next.get('sn')).toBe(3) // new — appended at the END, not slot 1
  })

  it('does nothing when current ids are all already present', () => {
    const prev = new Map([
      ['bd', 0],
      ['hh', 1],
    ])
    const next = stableTrackOrder(prev, ['bd', 'hh'])
    expect(next.size).toBe(2)
    expect(next.get('bd')).toBe(0)
    expect(next.get('hh')).toBe(1)
  })

  it('reserves all rows when current is empty', () => {
    const prev = new Map([
      ['bd', 0],
      ['hh', 1],
    ])
    const next = stableTrackOrder(prev, [])
    expect(next.size).toBe(2)
    expect(next.get('bd')).toBe(0)
    expect(next.get('hh')).toBe(1)
  })

  it('returns a fresh Map (PV34)', () => {
    const prev = new Map([['bd', 0]])
    const next = stableTrackOrder(prev, ['bd'])
    expect(next).not.toBe(prev)
    // Mutating the result must not affect prev.
    next.set('hh', 1)
    expect(prev.has('hh')).toBe(false)
  })
})
