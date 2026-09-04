/**
 * #1433 Part 2 — the rendered zone height is DERIVED from the user's intent.
 *
 * A `.viz()` zone's canvas is width-bound: the cropped region fills the editor
 * column, so it can never draw taller than the fit-to-width height. Seven sites
 * used to assign a stored height straight to the zone anyway, while scaling the
 * canvas to fit inside it — so the canvas stopped growing and the zone didn't,
 * and the resize bar pinned to the zone's bottom edge floated off into empty
 * space. Observed at 180px (dragging past the fit height), 124px (narrowing the
 * editor afterwards) and 410px (switching to a viz with another aspect ratio).
 *
 * These arms are about the ARITHMETIC. The browser specs cover the gestures.
 * The property worth stating plainly, and the one every arm below is a case of:
 *
 *     the zone is as tall as the canvas, or as tall as MIN_ZONE_HEIGHT
 *
 * ⚠ The MIN floor is the one place a gap remains, and it is deliberate and
 * pre-existing — a very short crop is floored to 80px so it stays visible and
 * clickable. Pinned explicitly below so nobody "fixes" it by accident.
 */
import { describe, it, expect } from 'vitest'
import { layoutForIntent, MIN_ZONE_HEIGHT, MAX_ZONE_HEIGHT } from '../viewZones'

const FULL = { x: 0, y: 0, w: 1, h: 1 }
/** Wide and short: in a 1000px column this fits at 200px tall. */
const WIDE = { w: 1000, h: 200 }
/** Square: in a 1000px column this would be 1000px tall, past the clamp. */
const SQUARE = { w: 400, h: 400 }
const COL = 1000

/** The canvas's rendered height for a layout — what the zone must match. */
const canvasH = (
  l: { scale: number },
  native: { w: number; h: number },
  crop = FULL,
): number => crop.h * native.h * l.scale

describe('#1433 — layoutForIntent', () => {
  it('with no intent, is exactly the fit-to-width layout', () => {
    const l = layoutForIntent(COL, WIDE, FULL, undefined)
    expect(l.zoneH).toBeCloseTo(200, 5)
    expect(l.zoneH).toBeCloseTo(canvasH(l, WIDE), 5)
    // null and undefined both mean "no override stored".
    expect(layoutForIntent(COL, WIDE, FULL, null)).toEqual(l)
  })

  it('an intent SHORTER than the fit height is honoured exactly', () => {
    const l = layoutForIntent(COL, WIDE, FULL, 150)
    expect(l.zoneH).toBeCloseTo(150, 5)
    expect(l.zoneH, 'and the canvas fills it').toBeCloseTo(canvasH(l, WIDE), 5)
  })

  it('an intent TALLER than the fit height renders at the fit height, not the intent', () => {
    // The route-A case. 370 was the observed drag; the canvas stays at 200.
    const l = layoutForIntent(COL, WIDE, FULL, 370)
    expect(l.zoneH, 'the zone must stop where the canvas stops').toBeCloseTo(200, 5)
    expect(l.zoneH).toBeCloseTo(canvasH(l, WIDE), 5)
  })

  it('the same intent follows the column width in BOTH directions', () => {
    // The route-B case, and the reason the intent is stored rather than the
    // derived height. At 1000px the user picks 150. Narrowing re-fits; widening
    // must give the 150 back, which storing the derived height cannot do.
    const intent = 150
    const wide = layoutForIntent(1000, WIDE, FULL, intent)
    const narrow = layoutForIntent(400, WIDE, FULL, intent)
    const back = layoutForIntent(1000, WIDE, FULL, intent)

    expect(wide.zoneH).toBeCloseTo(150, 5)
    // At 400px the fit height is 80 — below the user's 150, so the width wins.
    expect(narrow.zoneH).toBeCloseTo(canvasH(narrow, WIDE), 5)
    expect(narrow.zoneH).toBeLessThan(wide.zoneH)
    expect(back.zoneH, 'widening restores the height the user chose').toBeCloseTo(150, 5)
  })

  it('is flush at every width across a sweep — the property, not a sample', () => {
    // One arm for the whole claim: for any width and any intent, the zone is the
    // canvas height unless the MIN floor lifted it. A single width could pass by
    // luck; a sweep across the crossover cannot.
    for (const contentW of [200, 400, 700, 1000, 1600, 2400]) {
      for (const intent of [80, 120, 200, 370, 600]) {
        for (const native of [WIDE, SQUARE]) {
          const l = layoutForIntent(contentW, native, FULL, intent)
          const c = canvasH(l, native)
          const flushOrFloored = Math.abs(l.zoneH - c) < 0.001 || l.zoneH === MIN_ZONE_HEIGHT
          expect(
            flushOrFloored,
            `w=${contentW} intent=${intent} native=${native.w}x${native.h}: zone ${l.zoneH} vs canvas ${c}`,
          ).toBe(true)
          expect(l.zoneH).toBeGreaterThanOrEqual(MIN_ZONE_HEIGHT)
          expect(l.zoneH).toBeLessThanOrEqual(MAX_ZONE_HEIGHT)
        }
      }
    }
  })

  it('never renders taller than the intent asked for', () => {
    // The other half of the min(). A short intent must not be inflated to fit.
    for (const intent of [90, 150, 300]) {
      const l = layoutForIntent(COL, SQUARE, FULL, intent)
      expect(l.zoneH).toBeLessThanOrEqual(intent + 0.001)
    }
  })

  it('respects MAX_ZONE_HEIGHT even when the fit height is far past it', () => {
    // A square in a 1000px column fits at 1000px tall; the clamp is 600.
    const noIntent = layoutForIntent(COL, SQUARE, FULL, undefined)
    expect(noIntent.zoneH).toBe(MAX_ZONE_HEIGHT)
    const tall = layoutForIntent(COL, SQUARE, FULL, 5000)
    expect(tall.zoneH, 'an absurd intent cannot exceed the clamp').toBe(MAX_ZONE_HEIGHT)
    expect(tall.zoneH).toBeCloseTo(canvasH(tall, SQUARE), 5)
  })

  it('floors at MIN_ZONE_HEIGHT, and that is the ONE place a gap survives', () => {
    // Deliberate and pre-existing: a sliver of a crop stays visible and
    // clickable. Pinned so the divergence is a decision, not a regression.
    const strip = { x: 0, y: 0, w: 1, h: 0.05 }
    const l = layoutForIntent(COL, WIDE, strip, 40)
    expect(l.zoneH).toBe(MIN_ZONE_HEIGHT)
    expect(canvasH(l, WIDE, strip), 'the canvas really is shorter than the zone here')
      .toBeLessThan(MIN_ZONE_HEIGHT)
  })

  it('offsets a crop by the same scale it renders at', () => {
    // tx/ty must move with the scale, or a cropped viz shows the wrong region.
    const crop = { x: 0.25, y: 0.5, w: 0.5, h: 0.5 }
    // 150 is deliberately clear of BOTH bounds — a half-crop of WIDE fits at
    // 200px here, and an intent of 60 would be lifted by the MIN floor, which
    // would make the flush assertion below pass for the wrong reason.
    const l = layoutForIntent(COL, WIDE, crop, 150)
    expect(l.tx).toBeCloseTo(-crop.x * WIDE.w * l.scale, 5)
    expect(l.ty).toBeCloseTo(-crop.y * WIDE.h * l.scale, 5)
    expect(l.zoneH).toBeCloseTo(canvasH(l, WIDE, crop), 5)
  })
})
