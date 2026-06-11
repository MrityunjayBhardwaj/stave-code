import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * #316 → #325 — raw MAIN-canvas readback (getImageData/putImageData) in the worker.
 *
 * HISTORY: this was the remaining member of the #306/P126 worker-readback class — a USER
 * `.viz()` sketch building a scrolling waterfall / trails by reading back the MAIN p5
 * canvas (`drawingContext.getImageData` + `putImageData`) went BLANK in the worker,
 * because the Tier-2 blit `transferToImageBitmap()`d (and CLEARED) the main canvas every
 * frame → nothing to read back, no signal (gauge stayed `viz.worker:1`). #316 shipped
 * docs + this gate asserting the worker BLANK.
 *
 * NOW FIXED at the root by #325 Tier A: p5 renders DIRECTLY into the transferred display
 * canvas (like hydra/glsl), so there is no transfer/clear and the canvas persists — raw
 * main-canvas readback WORKS in the worker, worker == main (proven end-to-end by
 * viz-worker-p5-direct.spec.ts). This gate's worker arm therefore now asserts the SAME
 * readback PAINTS in the worker (it used to assert blank). The main-thread arm still
 * guards that the fixture is a genuine readback sketch (so the worker assertion can't pass
 * trivially). The escape-hatch (`stave.viz.p5direct='0'` → old blit path) reverts to blank.
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const AUDIO = `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909")`

// Raw MAIN-canvas readback waterfall: shift the canvas left via getImageData/putImageData,
// stamp a full-height bar at the right edge. Accumulates a filled field IF readback works.
const MAIN_READBACK = `function setup(){ createCanvas(stave.width, stave.height); pixelDensity(1); background(8,8,16) }
function draw(){
  const img = drawingContext.getImageData(4,0,width-4,height)
  drawingContext.putImageData(img,0,0)
  noStroke(); fill(0,230,0); rect(width-6, 0, 6, height)
}`

async function boot(page: Page, worker: boolean) {
  await page.addInitScript((w) => {
    ;(window as any).__STAVE_PERF__ = true
    ;(window as any).__STAVE_E2E__ = true
    try { localStorage.setItem('stave.viz.worker', w ? '1' : '0') } catch {}
  }, worker)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1500)
}

async function gauges(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => (window as any).__stavePerf?.snapshot?.()?.gauges ?? {})
}

async function litFraction(page: Page): Promise<number> {
  const box = await page.locator('[data-viz-zone] canvas').first().boundingBox()
  if (!box) return 0
  const clip = { x: box.x + 4, y: box.y + 4, width: Math.max(20, box.width - 8), height: Math.max(20, box.height - 8) }
  const png = await page.screenshot({ clip }).catch(() => Buffer.from([]))
  if (!png.length) return 0
  return page.evaluate(async (data) => {
    const img = new Image()
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); img.src = `data:image/png;base64,${data}` })
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    const r0 = d[0], g0 = d[1], b0 = d[2]
    let lit = 0, n = 0
    for (let i = 0; i < d.length; i += 4) { n++; if (Math.abs(d[i]-r0)+Math.abs(d[i+1]-g0)+Math.abs(d[i+2]-b0) > 48) lit++ }
    return n ? lit / n : 0
  }, png.toString('base64'))
}

async function mountAndPeak(page: Page): Promise<number> {
  await page.evaluate(() => {
    ;(window as any).__staveRegisterViz?.({ id: 'rbtest', name: 'rbtest', renderer: 'p5', code: (window as any).__RB_CODE,
      requires: ['streaming'], nativeSize: { w: 600, h: 360 }, createdAt: 1, updatedAt: 1 })
  })
  await page.evaluate((c) => (window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.setValue(c), `${AUDIO}.viz('rbtest')`)
  await page.waitForTimeout(200)
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(3500)
  let peak = 0
  for (let i = 0; i < 10; i++) { peak = Math.max(peak, await litFraction(page)); await page.waitForTimeout(200) }
  return peak
}

test.describe('#316 → #325 — raw main-canvas readback (now works in worker == main)', () => {
  test.skip(!process.env.E2E_VERIFY, 'set E2E_VERIFY=1 to run (drives the live worker path)')

  test('main thread — getImageData/putImageData waterfall fills the canvas (control)', async ({ page }) => {
    await boot(page, false)
    await page.evaluate((c) => { (window as any).__RB_CODE = c }, MAIN_READBACK)
    const peak = await mountAndPeak(page)
    // eslint-disable-next-line no-console
    console.log(`[readback main] litPeak=${peak.toFixed(4)}`)
    expect(peak, 'raw main-canvas readback accumulates a filled waterfall on the main thread').toBeGreaterThan(0.5)
  })

  test('worker — the SAME readback now PAINTS (#325 Tier A: p5 owns the display canvas)', async ({ page }) => {
    await boot(page, true)
    await page.evaluate((c) => { (window as any).__RB_CODE = c }, MAIN_READBACK)
    const peak = await mountAndPeak(page)
    const g = await gauges(page)
    // eslint-disable-next-line no-console
    console.log(`[readback worker] litPeak=${peak.toFixed(4)} gauges=${JSON.stringify(g)}`)
    expect(g['viz.worker'], 'mounted in the worker (no fallback)').toBeGreaterThanOrEqual(1)
    // #325: p5 renders direct into the transferred canvas → it persists → readback fills,
    // worker == main. If this ever drops back to blank, the direct path regressed (or the
    // escape hatch is forcing the old blit) — re-verify against viz-worker-p5-direct.spec.ts.
    expect(peak, 'raw main-canvas readback fills in the worker (#325 — no longer the transfer-clear limitation)').toBeGreaterThan(0.5)
  })
})
