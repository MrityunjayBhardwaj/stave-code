/**
 * The paging trigger's RULE (#1201 item 3), and what a non-zero origin proves
 * about the three sites that were previously correct only by construction.
 *
 * ── WHY THE RULE IS EXTRACTED RATHER THAN DRIVEN THROUGH THE COMPONENT ──────
 * The trigger lives inside `FullSongTimeline`'s rAF loop, which needs a live
 * transport, an open drawer and an active tab before it ticks once. Driving it
 * through the component would test the drawer's lifecycle, not the rule. The
 * rule itself — "ask for the next window when the playhead enters the last
 * quarter, but only for a song that does not loop" — is a pure function of
 * (position, origin, span, looping), so it is written as one and pinned here.
 *
 * ⚠ THE COMPONENT MUST CALL THIS FUNCTION, not re-implement the comparison.
 * A copy of the arithmetic in the rAF loop would pass these arms while the
 * shipped view paged on a different boundary — the exact failure this file is
 * meant to prevent.
 */
import { describe, it, expect } from 'vitest'
import {
  PAGE_AHEAD_FRACTION,
  nextWindowOriginFor,
  clampSeekToWindow,
  isBeyondWindow,
  windowNotice,
  windowEndCycle,
} from '../windowPaging'


describe('the paging trigger rule (#1201)', () => {
  const span = 256

  it('does not ask while the playhead is early in the window', () => {
    expect(nextWindowOriginFor(0, 0, span, false)).toBeNull()
    expect(nextWindowOriginFor(100, 0, span, false)).toBeNull()
  })

  it('asks once the playhead enters the LAST QUARTER of the window', () => {
    // 0.75 * 256 = 192 — the first cycle that should trigger.
    expect(nextWindowOriginFor(191, 0, span, false)).toBeNull()
    expect(nextWindowOriginFor(192, 0, span, false)).toBe(256)
  })

  it('asks for the window that ABUTS this one — no gap, no overlap', () => {
    // Contiguity is the property that makes paging a page rather than a jump
    // to somewhere arbitrary.
    expect(nextWindowOriginFor(200, 0, span, false)).toBe(256)
    expect(nextWindowOriginFor(456, 256, span, false)).toBe(512)
    expect(nextWindowOriginFor(1000, 768, span, false)).toBe(1024)
  })

  it('NEVER asks for a song that loops — cycle 257 is already cycle 1', () => {
    // The decisive arm for the whole feature: paging exists only on the branch
    // where period detection failed. A looping song has nothing to the right,
    // and asking would re-analyse the same music forever.
    expect(nextWindowOriginFor(200, 0, span, true)).toBeNull()
    expect(nextWindowOriginFor(100_000, 0, span, true)).toBeNull()
  })

  it('is silent when the transport is stopped', () => {
    expect(nextWindowOriginFor(null, 0, span, false)).toBeNull()
  })

  it('refuses a nonsense span rather than asking for origin NaN', () => {
    expect(nextWindowOriginFor(200, 0, 0, false)).toBeNull()
    expect(nextWindowOriginFor(200, 0, Number.NaN, false)).toBeNull()
  })

  it('keeps asking for the SAME origin while the condition holds', () => {
    // The trigger fires every frame; idempotence is the owner's job, so the
    // rule must stay stable rather than advancing on each call.
    expect(nextWindowOriginFor(200, 0, span, false)).toBe(256)
    expect(nextWindowOriginFor(210, 0, span, false)).toBe(256)
    expect(nextWindowOriginFor(255, 0, span, false)).toBe(256)
  })

  it('states the fraction it pages at, so the constant cannot drift silently', () => {
    expect(PAGE_AHEAD_FRACTION).toBe(0.75)
  })
})

/**
 * ── ITEM 4, THE PART A UNIT TEST CAN CARRY ──────────────────────────────────
 * #1201 item 4 asks whether the clip edit path survives a non-zero origin, and
 * insists it be verified by BREAKING it, because at origin 0 a window-relative
 * frame and an absolute one coincide. The browser half of that lives in the
 * arrange specs. What belongs here is the arithmetic those specs depend on:
 * the two comparisons that were fixed in #1201's first half and had no
 * discriminating test, because `songOriginCycles` was a hardcoded 0.
 *
 * These are that discriminating test. Each asserts a value that is IDENTICAL
 * under the origin-blind form whenever the origin is 0, and different the
 * moment it is not.
 */
describe('what a non-zero origin discriminates (#1201 item 4)', () => {
  const span = 256
  const page1 = { originCycle: 0, spanCycles: span }
  const page2 = { originCycle: 256, spanCycles: span }

  it('the seek clamp is the window END, not the window WIDTH', () => {
    // Origin-blind, page 2 would clamp to 256 and send a click near the end of
    // the second page BACKWARDS into the first.
    expect(clampSeekToWindow(300, page1)).toBe(256) // page 1: unchanged — why it hid
    expect(clampSeekToWindow(300, page2)).toBe(300) // page 2: not clamped to 256
    expect(clampSeekToWindow(600, page2)).toBe(512) // page 2: clamped to its own end
  })

  it('"past the end" is measured from the window END, not its WIDTH', () => {
    expect(isBeyondWindow(255, page1)).toBe(false)
    expect(isBeyondWindow(256, page1)).toBe(true)
    // Origin-blind, cycle 300 would read as past the end while it is squarely
    // inside the window on screen.
    expect(isBeyondWindow(300, page2)).toBe(false)
    expect(isBeyondWindow(512, page2)).toBe(true)
  })

  it('the notice names the window the user is LOOKING at, not the first one', () => {
    // The same frame error inside a template string — invisible to the grep
    // recipe that catches it in a comparison, which is why it survived.
    expect(windowNotice(page1, false)).toBe('no repeat · showing first 256 cycles')
    expect(windowNotice(page2, false)).toBe('no repeat · showing cycles 256–512')
    expect(windowNotice(page2, true)).toBe('no repeat · playing past cycle 512')
  })

  it('the window END is the one value all three read', () => {
    expect(windowEndCycle(page1)).toBe(256)
    expect(windowEndCycle(page2)).toBe(512)
  })

  it('is STOPPED-safe — a null position is not "beyond" anything', () => {
    expect(isBeyondWindow(null, page2)).toBe(false)
  })
})
