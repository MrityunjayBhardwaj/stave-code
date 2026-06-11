import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * #315 — save()/saveCanvas()/saveGif() in the OffscreenCanvas worker.
 *
 * p5's saveCanvas calls `htmlCanvas.toBlob(cb,...)` (OffscreenCanvas has only
 * `convertToBlob`) then `createElement('a').click()` (the shim anchor had no click).
 * OBSERVED before the shim fix: a `.viz()` sketch calling saveCanvas threw
 * `htmlCanvas.toBlob is not a function` every call (surfaced via the #257 draw-error
 * path) — it did NOT blank the viz (p5's per-frame catch keeps drawing), but spammed
 * a confusing error and never downloaded.
 *
 * The shim now bridges `toBlob`→`convertToBlob` + a no-op anchor `click()`, so save()
 * degrades to a CLEAN SILENT no-op. A true download from a worker is architecturally
 * impossible without postMessage→main (out of scope; authors don't download a live
 * backdrop). This gate asserts: save() in the worker neither blanks NOR errors.
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const AUDIO = `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909")`

// Non-uniform bright shape on dark bg (uniform fill reads 0 vs the corner baseline)
// + saveCanvas on frame 5. The shape must keep painting AND save() must not error.
const SAVE_SKETCH = `function setup(){ createCanvas(stave.width, stave.height); pixelDensity(1) }
function draw(){
  background(10,10,20); noStroke(); fill(0,220,0)
  ellipse(width/2, height/2, width*0.6, height*0.6)
  if (frameCount === 5) { saveCanvas('probe','png') }
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

async function vizErrors(page: Page): Promise<string[]> {
  return page.evaluate(() => ((window as any).__staveGetLog?.() ?? [])
    .filter((e: any) => e?.level === 'error').map((e: any) => String(e?.message ?? '')))
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

async function mountAndPeak(page: Page): Promise<{ peak: number; errs: string[] }> {
  await page.evaluate(() => {
    ;(window as any).__staveRegisterViz?.({
      id: 'savetest', name: 'savetest', renderer: 'p5', code: (window as any).__SAVE_CODE,
      requires: ['streaming'], nativeSize: { w: 600, h: 360 }, createdAt: 1, updatedAt: 1,
    })
  })
  await page.evaluate((c) => (window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.setValue(c), `${AUDIO}.viz('savetest')`)
  await page.waitForTimeout(200)
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(3000)
  let peak = 0
  for (let i = 0; i < 8; i++) { peak = Math.max(peak, await litFraction(page)); await page.waitForTimeout(200) }
  return { peak, errs: await vizErrors(page) }
}

test.describe('#315 — save() in the worker degrades to a clean no-op', () => {
  test.skip(!process.env.E2E_VERIFY, 'set E2E_VERIFY=1 to run (drives the live worker path)')

  test('worker — saveCanvas() sketch keeps painting AND raises no toBlob/click error', async ({ page }) => {
    await boot(page, true)
    await page.evaluate((c) => { (window as any).__SAVE_CODE = c }, SAVE_SKETCH)
    const { peak, errs } = await mountAndPeak(page)
    const saveErrs = errs.filter((e) => /toBlob|click|is not a function/i.test(e))
    // eslint-disable-next-line no-console
    console.log(`[save worker] litPeak=${peak.toFixed(4)} saveErrs=${JSON.stringify(saveErrs.slice(0, 3))}`)
    expect(saveErrs, 'no toBlob/click TypeError from save() in the worker').toEqual([])
    expect(peak, 'sketch keeps painting through the save() call (not blanked)').toBeGreaterThan(0.10)
  })
})
