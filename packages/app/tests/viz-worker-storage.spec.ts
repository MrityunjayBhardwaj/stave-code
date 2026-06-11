/**
 * #308 FOLLOW-UP GATE — p5 `storeItem`/`getItem` in the OffscreenCanvas worker.
 *
 * p5's storage API references the bare global `localStorage` (absent in a Worker)
 * raw, so storeItem()/getItem() raised "localStorage is not defined" every frame
 * off-main (same PV95 class as the createGraphics/HTMLCanvasElement bug, milder:
 * error-spam + dead persistence rather than a full blank). The dom-shim now
 * provides an in-memory Storage. This gate observes BOTH halves: (1) no
 * localStorage errors reach the engine log, and (2) storage actually round-trips —
 * the sketch stores 42, reads it back, paints GREEN on success / RED on failure,
 * so the center pixel proves correctness, not just absence of error.
 *
 * Run: E2E_VERIFY=1 pnpm --filter @stave/app exec playwright test \
 *        viz-worker-storage.spec.ts --workers=1
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const AUDIO = `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909")`

// storeItem in setup, getItem in draw → GREEN if the value round-trips, RED if not.
// Before the shim: "localStorage is not defined" thrown on both calls.
const STORE_SKETCH = `function setup(){ createCanvas(stave.width, stave.height); pixelDensity(1); storeItem('rt', 42) }
function draw(){
  const ok = (getItem('rt') == 42)
  background(ok ? 0 : 230, ok ? 200 : 0, ok ? 60 : 0)
}`

async function boot(page: Page, worker: boolean): Promise<void> {
  await page.addInitScript((w) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_PERF__ = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_E2E__ = true
    try { localStorage.setItem('stave.viz.worker', w ? '1' : '0') } catch { /* */ }
  }, worker)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1500)
}

async function runSketch(page: Page): Promise<void> {
  await page.evaluate((code) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__staveRegisterViz?.({
      id: 'storeprobe', name: 'storeprobe', renderer: 'p5', code,
      requires: ['streaming'], nativeSize: { w: 600, h: 300 }, createdAt: 1, updatedAt: 1,
    })
  }, STORE_SKETCH)
  await page.evaluate((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.setValue(c)
  }, `${AUDIO}.viz('storeprobe')`)
  await page.waitForTimeout(200)
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).monaco?.editor?.getEditors?.()?.[0]?.focus()
  })
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2500)
}

async function lsErrors(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const log = (window as any).__staveGetLog?.() ?? []
    return log
      .filter((e: { level?: string }) => e?.level === 'error')
      .map((e: { message?: string }) => String(e?.message ?? ''))
      .filter((m: string) => /localStorage/i.test(m))
  })
}

/** Center-pixel RGB of the viz canvas, decoded from a compositor screenshot. */
async function centerRGB(page: Page): Promise<[number, number, number]> {
  const box = await page.locator('[data-viz-zone] canvas').first().boundingBox()
  if (!box) return [0, 0, 0]
  const clip = { x: box.x + box.width / 2 - 4, y: box.y + box.height / 2 - 4, width: 8, height: 8 }
  const png = await page.screenshot({ clip }).catch(() => Buffer.from([]))
  if (png.length === 0) return [0, 0, 0]
  return page.evaluate(async ({ data }) => {
    const img = new Image()
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('decode')); img.src = `data:image/png;base64,${data}` })
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0)
    const px = ctx.getImageData(0, 0, c.width, c.height).data
    return [px[0], px[1], px[2]] as [number, number, number]
  }, { data: png.toString('base64') })
}

test.describe('#308 follow-up — storeItem/getItem in the worker', () => {
  test.skip(!process.env.E2E_VERIFY, 'set E2E_VERIFY=1')

  test('worker — no localStorage errors AND storage round-trips (green)', async ({ page }) => {
    await boot(page, true)
    await runSketch(page)
    await page.waitForTimeout(1500)
    const errs = await lsErrors(page)
    const [r, g] = await centerRGB(page)
    // eslint-disable-next-line no-console
    console.log(`[store worker] localStorage-errors=${JSON.stringify(errs.slice(0, 2))} centerRGB=[${r},${g}]`)
    expect(errs, 'no "localStorage is not defined" errors in the worker').toEqual([])
    expect(g, 'storage round-trips → green (getItem returned the stored 42)').toBeGreaterThan(r)
  })

  test('main — parity (round-trips green, no errors)', async ({ page }) => {
    await boot(page, false)
    await runSketch(page)
    await page.waitForTimeout(1500)
    const errs = await lsErrors(page)
    const [r, g] = await centerRGB(page)
    // eslint-disable-next-line no-console
    console.log(`[store main] localStorage-errors=${JSON.stringify(errs.slice(0, 2))} centerRGB=[${r},${g}]`)
    expect(g, 'storage round-trips on main → green').toBeGreaterThan(r)
  })
})
