/**
 * WORKER-VIZ PIXEL COVERAGE GATE (#306) — the gap phase-b-verify left open.
 *
 * phase-b-verify asserts the `viz.worker:1` GAUGE (the renderer ATTACHED) + that
 * the compositor frames are DISTINCT (it ANIMATES). Neither catches a viz that
 * mounts, animates, yet paints almost nothing — exactly the spectrum.p5 worker
 * bug (#306): its scrolling waterfall reads back its own previous frame via
 * `getImageData`/`putImageData`, but the Tier-2 blit's `transferToImageBitmap()`
 * RESETS the source OffscreenCanvas to transparent each frame, so the history
 * never accumulates — only a thin moving 2px sliver survives. That sliver still
 * makes frames DISTINCT, so a distinctness gate would FALSE-PASS.
 *
 * This gate measures actual non-background PIXEL COVERAGE from the COMPOSITOR
 * (PV90/PV93 — never the worker canvas buffer), sampled over a full musical cycle
 * (P125 — instantaneous viz are flat between transients; take the MAX over time).
 * Decode path: `page.screenshot` → base64 → the browser's OWN PNG decoder →
 * getImageData → count pixels differing from the corner background. The worker
 * canvas buffer is never read back (that path false-positives — P121/P125).
 *
 * Run (server auto-starts; reap .next first per P83 for fresh COOP headers):
 *   E2E_VERIFY=1 pnpm --filter @stave/app exec playwright test viz-worker-pixels.spec.ts --timeout=300000
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const AUDIO = `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909")`

async function boot(page: Page, worker: boolean): Promise<void> {
  await page.addInitScript((w) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_PERF__ = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_E2E__ = true
    try {
      localStorage.setItem('stave.viz.worker', w ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, worker)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1500)
}

async function setCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
    if (!e) return false
    e.getModel()?.setValue(c)
    return true
  }, code)
  expect(ok, 'monaco editor present').toBe(true)
  await page.waitForTimeout(200)
}

async function run(page: Page): Promise<void> {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).monaco?.editor?.getEditors?.()?.[0]?.focus()
  })
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2500)
}

async function gauges(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).__stavePerf?.snapshot?.()
    return s?.gauges ?? {}
  })
}

/**
 * Fraction (0..1) of clip pixels that differ from the top-left-corner background
 * colour by more than `thresh` (sum of |ΔR|+|ΔG|+|ΔB|). Decoded via the browser's
 * PNG decoder from a COMPOSITOR screenshot — never a worker-canvas readback.
 */
async function litFraction(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
  thresh = 48,
): Promise<number> {
  const png = await page.screenshot({ clip }).catch(() => Buffer.from([]))
  if (png.length === 0) return 0
  const b64 = png.toString('base64')
  return page.evaluate(
    async ({ data, threshold }) => {
      const img = new Image()
      await new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej(new Error('decode failed'))
        img.src = `data:image/png;base64,${data}`
      })
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const px = ctx.getImageData(0, 0, c.width, c.height).data
      const br = px[0]
      const bg = px[1]
      const bb = px[2]
      let lit = 0
      const total = c.width * c.height
      for (let i = 0; i < px.length; i += 4) {
        const d = Math.abs(px[i] - br) + Math.abs(px[i + 1] - bg) + Math.abs(px[i + 2] - bb)
        if (d > threshold) lit++
      }
      return total === 0 ? 0 : lit / total
    },
    { data: b64, threshold: thresh },
  )
}

// Clip the LEFT 60% of the canvas — the waterfall fills uniformly left→right, and
// this keeps clear of the top-right perf overlay (its ticking numbers would inflate
// the "lit" count). A WORKING waterfall lights a large fraction here; the broken
// transfer-cleared sliver lights almost nothing.
async function canvasLeftClip(page: Page) {
  const box = await page.locator('[data-viz-zone] canvas').first().boundingBox()
  if (!box) return null
  return {
    x: box.x + 4,
    y: box.y + 4,
    width: Math.max(20, box.width * 0.6 - 8),
    height: Math.max(20, box.height - 8),
  }
}

/** Peak lit fraction over `n` compositor frames spanning > one musical cycle. */
async function peakLit(page: Page, n: number, gapMs: number): Promise<number> {
  const clip = await canvasLeftClip(page)
  if (!clip) return 0
  let peak = 0
  for (let i = 0; i < n; i++) {
    peak = Math.max(peak, await litFraction(page, clip))
    if (i < n - 1) await page.waitForTimeout(gapMs)
  }
  return peak
}

test.describe('worker-viz pixel coverage (#306)', () => {
  test.skip(!process.env.E2E_VERIFY, 'set E2E_VERIFY=1 to run (drives the live worker path)')

  test('worker ON — spectrum.p5 fills the waterfall (not a transfer-cleared sliver)', async ({
    page,
  }) => {
    await boot(page, true)
    await setCode(page, `${AUDIO}.viz('spectrum')`)
    await run(page)
    // settle so the waterfall has time to accumulate a full screen of history
    await page.waitForTimeout(2500)

    const g = await gauges(page)
    // eslint-disable-next-line no-console
    console.log(`[pixels spectrum worker] gauges=${JSON.stringify(g)}`)
    expect(g['viz.worker'], 'spectrum mounted in the worker (no fallback)').toBeGreaterThanOrEqual(1)

    const peak = await peakLit(page, 12, 250)
    // eslint-disable-next-line no-console
    console.log(`[pixels spectrum worker] peakLitFraction=${peak.toFixed(4)}`)
    // A filled scrolling waterfall lights a large area; the #306 transfer-clear bug
    // left only a ~2px right-edge sliver → ~0 in this left-60% clip. Floor is
    // conservative for machine variance.
    expect(
      peak,
      'spectrum waterfall paints a meaningful area (worker blit picks up the owned buffer)',
    ).toBeGreaterThan(0.05)
  })

  // Parity guard: the fix swapped the drawing surface from the p5 canvas to an
  // owned OffscreenCanvas. Main thread must render identically (regression guard).
  test('worker OFF — spectrum.p5 fills the waterfall on the main thread (parity)', async ({
    page,
  }) => {
    await boot(page, false)
    await setCode(page, `${AUDIO}.viz('spectrum')`)
    await run(page)
    await page.waitForTimeout(2500)

    const g = await gauges(page)
    // eslint-disable-next-line no-console
    console.log(`[pixels spectrum main] gauges=${JSON.stringify(g)}`)
    expect(g['viz.p5'], 'spectrum mounted on the main thread').toBeGreaterThanOrEqual(1)

    const peak = await peakLit(page, 12, 250)
    // eslint-disable-next-line no-console
    console.log(`[pixels spectrum main] peakLitFraction=${peak.toFixed(4)}`)
    expect(peak, 'spectrum waterfall paints a meaningful area on main').toBeGreaterThan(0.05)
  })
})
