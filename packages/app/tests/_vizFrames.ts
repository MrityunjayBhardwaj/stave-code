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

// ───────────────────────────────────────────────────────────────────────────
// Compositor PIXEL stats (#875).
//
// A worker viz renders to a `transferControlToOffscreen()` canvas, so the main
// thread can NEVER read it: `canvas.getContext('2d')` THROWS
//   InvalidStateError: Cannot get context from a canvas that has transferred
//   its control to offscreen.
// Every probe that reached for `getContext` on a viz canvas has therefore been
// dead since the worker renderer became the default (#245) — 15 specs' worth,
// which is how a real bug (viz options never crossing the worker boundary) sat
// unobserved behind them.
//
// The legal readback is the same one `vizFrameHashes` uses: the COMPOSITOR
// (`page.screenshot`), decoded into a FRESH canvas (not a transferred one).
//
// LIMIT — the compositor is OPAQUE: it composites the canvas over whatever is
// behind it, so alpha is always 255. A claim about canvas TRANSPARENCY cannot be
// read here; it has to be re-expressed as "the surface behind shows through"
// (see the transparency spec) — the pixels are the truth, but they are the
// COMPOSITED pixels.
// ───────────────────────────────────────────────────────────────────────────

/** A colour predicate as plain DATA — it is evaluated inside the page, so it must
 *  be serializable (no closures crossing the boundary). Omitted bounds don't
 *  constrain. */
export interface PixelRange {
  rMin?: number
  rMax?: number
  gMin?: number
  gMax?: number
  bMin?: number
  bMax?: number
  /** Match when ANY channel exceeds this — the "painted, not background" test. */
  anyChannelMin?: number
}

export interface PixelStats {
  /** Pixels matching the range (0 when no range was given). */
  count: number
  total: number
  /** count / total — the fraction of the captured region matching. */
  frac: number
  /** Mean x of matching pixels, in canvas px; -1 when nothing matched. */
  meanX: number
  /** Vertical extent of matching pixels; -1 when nothing matched. */
  minY: number
  maxY: number
  /** Distinct colours over a sparse sample (capped at 9). 1 ⇒ a flat/blank
   *  surface; > 1 ⇒ something was drawn. */
  distinctColors: number
  w: number
  h: number
}

/**
 * Compositor pixel statistics for the first element matching `selector` — the
 * worker-safe replacement for `canvas.getContext('2d').getImageData(...)`.
 *
 * Captures the element's bounding box via the compositor (what the user actually
 * sees — the last PRESENTED frame), decodes it in a fresh main-thread canvas, and
 * reduces it to counts. Works identically for a main-thread canvas, a worker
 * (offscreen) canvas, and a WebGL canvas — none of which this can be fooled by.
 */
export async function vizPixelStats(
  page: Page,
  selector: string,
  range: PixelRange = {},
): Promise<PixelStats> {
  const empty: PixelStats = {
    count: 0, total: 0, frac: 0, meanX: -1, minY: -1, maxY: -1,
    distinctColors: 0, w: 0, h: 0,
  }
  const box = await page.locator(selector).first().boundingBox()
  if (!box || box.width < 1 || box.height < 1) return empty
  const b64 = (await page.screenshot({ clip: box })).toString('base64')

  return page.evaluate(
    async ({ data, r }) => {
      const img = new Image()
      await new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej(new Error('png decode failed'))
        img.src = 'data:image/png;base64,' + data
      })
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const d = ctx.getImageData(0, 0, c.width, c.height).data

      const seen = new Set<number>()
      let count = 0, total = 0, sumX = 0, minY = -1, maxY = -1
      for (let i = 0; i < d.length; i += 4) {
        const px = i / 4
        const x = px % c.width
        const y = Math.floor(px / c.width)
        const R = d[i], G = d[i + 1], B = d[i + 2]
        total++
        if (seen.size <= 9 && px % 40 === 0) seen.add((R << 16) | (G << 8) | B)
        const hit =
          (r.rMin === undefined || R >= r.rMin) &&
          (r.rMax === undefined || R <= r.rMax) &&
          (r.gMin === undefined || G >= r.gMin) &&
          (r.gMax === undefined || G <= r.gMax) &&
          (r.bMin === undefined || B >= r.bMin) &&
          (r.bMax === undefined || B <= r.bMax) &&
          (r.anyChannelMin === undefined ||
            R > r.anyChannelMin || G > r.anyChannelMin || B > r.anyChannelMin)
        const constrained = Object.keys(r).length > 0
        if (constrained && hit) {
          count++
          sumX += x
          if (minY < 0 || y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
      return {
        count,
        total,
        frac: total ? count / total : 0,
        meanX: count ? sumX / count : -1,
        minY,
        maxY,
        distinctColors: seen.size,
        w: c.width,
        h: c.height,
      }
    },
    { data: b64, r: range },
  )
}
