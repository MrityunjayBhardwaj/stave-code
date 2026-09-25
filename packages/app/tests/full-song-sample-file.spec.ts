import { test, expect, type Page } from '@playwright/test'

import { bootApp, seedCode, evalCode, stopCode } from './_appBoot'

/**
 * #1764 — a drum lane draws the file the engine plays.
 *
 * A sample lane draws each hit as the shape of its sample file. It used to look
 * that file up by the event's `s` alone, so `.bank("RolandTR909")` and a sample
 * number (`bd:3`) changed the sound and not the drawing: the lane kept the
 * default kit's first `bd`. Measured before the fix: both drew pixel-for-pixel
 * the same lane as plain `bd`, while the engine fetched a different file for
 * each.
 *
 * Each pattern is played (that is what loads its file), stopped, and the drum
 * lane's canvas is read back: per pixel column, how many pixels stand off the
 * band's median. Two drawings are compared by the summed column difference over
 * the first one's ink.
 *
 * Guards, so a pass cannot come from something else:
 *  - the same pattern drawn twice must read exactly the same (the noise floor);
 *  - the engine must have fetched the banked and the numbered file, so the
 *    shape the lane should draw really exists;
 *  - every lane must hold a drawn shape, not a plain bar, so "different" is
 *    never a failed load drawing nothing.
 */

const PATTERNS = {
  bd: 'setcps(0.5)\n$: s("bd")',
  banked: 'setcps(0.5)\n$: s("bd").bank("RolandTR909")',
  numbered: 'setcps(0.5)\n$: s("bd:3")',
} as const

/** Per column of the first lane's band: pixels standing off the band's median. */
async function inkColumns(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const row = document.querySelector('[data-full-song-lane]') as HTMLElement | null
    const canvas = document.querySelector('[data-full-song-canvas]') as HTMLCanvasElement | null
    if (!row || !canvas) return []
    const rr = row.getBoundingClientRect()
    const cr = canvas.getBoundingClientRect()
    const dpr = canvas.width / cr.width
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return []
    const y0 = Math.max(0, Math.round((rr.top - cr.top) * dpr))
    const h = Math.max(1, Math.round(rr.height * dpr))
    const d = ctx.getImageData(0, y0, canvas.width, h).data
    const luma = (i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
    const all: number[] = []
    for (let i = 0; i < d.length; i += 4) all.push(luma(i))
    const med = [...all].sort((a, b) => a - b)[Math.floor(all.length / 2)]
    const cols: number[] = []
    for (let x = 0; x < canvas.width; x++) {
      let n = 0
      for (let y = 0; y < h; y++) if (Math.abs(luma((y * canvas.width + x) * 4) - med) > 20) n++
      cols.push(n)
    }
    return cols
  })
}

function difference(a: number[], b: number[]): number {
  let diff = 0
  let ink = 0
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff += Math.abs((a[i] ?? 0) - (b[i] ?? 0))
    ink += a[i] ?? 0
  }
  return ink === 0 ? NaN : diff / ink
}

/** A drawn shape varies in height across its columns; a plain bar does not. */
function distinctHeights(cols: number[]): number {
  return new Set(cols.filter((c) => c > 0)).size
}

test('a drum lane draws the kit and the sample number it plays (#1764)', async ({ page }) => {
  test.setTimeout(180_000)
  const fetched: string[] = []
  page.on('request', (r) => {
    if (/\.(wav|mp3|ogg|flac)(\?|$)/i.test(r.url())) fetched.push(decodeURIComponent(r.url()).toLowerCase())
  })
  await bootApp(page, { drawer: { tabId: 'musical-timeline', height: 360 } })

  const drawn = async (code: string): Promise<number[]> => {
    await seedCode(page, code)
    await evalCode(page)
    await page.waitForTimeout(4500)
    await stopCode(page)
    await expect(page.locator('[data-full-song="playhead"]')).toHaveCount(0, { timeout: 10_000 })
    await page.waitForTimeout(2500)
    return inkColumns(page)
  }

  const bd = await drawn(PATTERNS.bd)
  const again = await drawn(PATTERNS.bd)
  const banked = await drawn(PATTERNS.banked)
  const numbered = await drawn(PATTERNS.numbered)

  const vsBd = { again: difference(again, bd), banked: difference(banked, bd), numbered: difference(numbered, bd) }
  console.log(
    `[#1764] vs plain bd: again ${vsBd.again} · banked ${vsBd.banked.toFixed(3)} · numbered ${vsBd.numbered.toFixed(3)} · ` +
      `shape heights bd ${distinctHeights(bd)} banked ${distinctHeights(banked)} numbered ${distinctHeights(numbered)} · ` +
      `fetched ${fetched.map((u) => u.split('/').slice(-2).join('/')).join(', ')}`,
  )

  // The noise floor: one pattern, drawn twice, is the same drawing.
  expect(vsBd.again).toBe(0)
  // The shapes the lane should draw exist: the engine fetched both files.
  expect(fetched.some((u) => u.includes('rolandtr909'))).toBe(true)
  expect(fetched.filter((u) => /\/bd\//.test(u)).length).toBeGreaterThanOrEqual(2)
  // Each lane holds a drawn shape, not a plain bar.
  for (const cols of [bd, banked, numbered]) expect(distinctHeights(cols)).toBeGreaterThan(3)
  // And the drawing follows the file: a different kit, a different number.
  expect(vsBd.banked).toBeGreaterThan(0.01)
  expect(vsBd.numbered).toBeGreaterThan(0.01)
})
