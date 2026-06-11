/**
 * Compositor-capture frame hashing for WORKER viz (PV90 — the corrected
 * visual-animation gate).
 *
 * Worker viz renders in a Web Worker to a `transferControlToOffscreen()` canvas
 * with `preserveDrawingBuffer:false`. Playwright's element-level
 * `locator.screenshot()` forces a readback of that drawing buffer at an arbitrary
 * time — OUTSIDE a paint (and especially right after a re-mount) it returns
 * inconsistent bytes, so even a DEAD-STATIC shader reads as "animating". That
 * artifact is what misdiagnosed P121 as a hot-reload bug across ~8 runs.
 *
 * The fix: capture via the COMPOSITOR (`page.screenshot({ clip })`), which is the
 * last PRESENTED frame — exactly what the user sees. SECOND trap: if the clip
 * overlaps the live perf overlay (top-right when `__STAVE_PERF__` is on), its
 * ticking numbers inflate the distinct count — so clip a viz-only sub-region away
 * from the overlay (bottom-left).
 *
 * Verify the method itself with BOTH controls in any spec that uses it: a
 * genuinely-animated viz must read distinct > 1, and a known-static shader must
 * read distinct === 1.
 */
import { type Page } from '@playwright/test'
import { createHash } from 'node:crypto'

/**
 * Hash `n` compositor frames of the first element matching `selector`, sampling a
 * viz-only sub-region (bottom-left, overlay-excluded). Returns the short md5
 * hashes; use `distinct()` to count unique frames.
 */
export async function vizFrameHashes(
  page: Page,
  selector: string,
  n: number,
  gapMs: number,
): Promise<string[]> {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) return []
  // Bottom-left sub-region of the canvas — clear of the top-right perf overlay.
  const sub = {
    x: box.x + 10,
    y: box.y + Math.max(0, box.height - 220),
    width: Math.min(260, Math.max(40, box.width - 20)),
    height: Math.min(200, Math.max(40, box.height - 20)),
  }
  const hashes: string[] = []
  for (let i = 0; i < n; i++) {
    const buf = await page.screenshot({ clip: sub }).catch(() => Buffer.from([]))
    hashes.push(createHash('md5').update(buf).digest('hex').slice(0, 8))
    if (i < n - 1) await page.waitForTimeout(gapMs)
  }
  return hashes
}

/** Number of unique frames in a hash list. distinct === 1 ⇒ static; > 1 ⇒ animating. */
export function distinct(hashes: string[]): number {
  return new Set(hashes).size
}
