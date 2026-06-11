/**
 * #314 — p5 `loadFont()` in the OffscreenCanvas worker.
 *
 * loadFont() does `document.fonts.add(face)` + `await document.fonts.ready`
 * (type/p5.Font.js:1005,1008). TWO worker gaps, both OBSERVED:
 *   (1) the shim doc had no `fonts` → `TypeError: …reading 'add'`;
 *   (2) the Worker's native FontFaceSet loads + adds a face fine, but its
 *       SET-LEVEL `ready` promise NEVER resolves off-main — so `await
 *       document.fonts.ready` hangs and loadFont's callback never fires.
 * The dom-shim now delegates `document.fonts` to the real `self.fonts` set but
 * resolves `ready` from the individual faces' own `.loaded` promises (which DO
 * resolve in the worker). Same PV95 class as #308/#313.
 *
 * Two checks, both reliable in-harness (a data: URL font sidesteps the fact that
 * Playwright can't route the dedicated viz-worker's fetch):
 *   (1) the worker now has a real `document.fonts` with `.add()`;
 *   (2) a real p5 `loadFont(data:font/ttf;…)` round-trips — the success callback
 *       fires, no font errors.
 *
 * Run: E2E_VERIFY=1 pnpm --filter @stave/app exec playwright test \
 *        viz-worker-font.spec.ts --workers=1
 */
import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const AUDIO = `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909")`
// Playwright runs with cwd = packages/app; codicon is an app dep. Embedded as a
// data: URL at runtime (NOT in the committed file) so the worker fetch needs no route.
const FONT_DATA_URL = `data:font/ttf;base64,${readFileSync(resolve(process.cwd(), 'node_modules/@vscode/codicons/dist/codicon.ttf')).toString('base64')}`

const HAS_FONTS = `function setup(){ createCanvas(stave.width, stave.height) }
function draw(){
  const ok = (typeof document !== 'undefined' && document.fonts && typeof document.fonts.add === 'function')
  background(ok ? 0 : 230, ok ? 200 : 0, ok ? 60 : 0)
}`

// Real p5 loadFont — paint by CALLBACK STATE: green = success cb fired (font
// registered + ready resolved), red = error cb, olive = stuck (the pre-fix hang).
const LOAD_FONT = (url: string) => `let loaded=false, failed=false
function setup(){ createCanvas(stave.width, stave.height); loadFont('${url}', () => { loaded=true }, () => { failed=true }) }
function draw(){ if (failed) background(230,0,0); else if (loaded) background(0,220,70); else background(70,70,0) }`

async function boot(page: Page, worker: boolean): Promise<void> {
  await page.addInitScript((w) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_E2E__ = true
    try { localStorage.setItem('stave.viz.worker', w ? '1' : '0') } catch { /* */ }
  }, worker)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1500)
}

async function runSketch(page: Page, id: string, code: string): Promise<void> {
  await page.evaluate(({ id, code }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__staveRegisterViz?.({
      id, name: id, renderer: 'p5', code,
      requires: ['streaming'], nativeSize: { w: 600, h: 300 }, createdAt: 1, updatedAt: 1,
    })
  }, { id, code })
  await page.evaluate((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.setValue(c)
  }, `${AUDIO}.viz('${id}')`)
  await page.waitForTimeout(200)
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).monaco?.editor?.getEditors?.()?.[0]?.focus()
  })
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(3000)
}

async function fontErrors(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const log = (window as any).__staveGetLog?.() ?? []
    return log
      .filter((e: { level?: string }) => e?.level === 'error')
      .map((e: { message?: string }) => String(e?.message ?? ''))
      .filter((m: string) => /font|FontFace|CSSFontFaceRule/i.test(m))
  })
}

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

test.describe('#314 — loadFont in the worker', () => {
  test.skip(!process.env.E2E_VERIFY, 'set E2E_VERIFY=1')

  test('worker has a real document.fonts FontFaceSet (the shim alias)', async ({ page }) => {
    await boot(page, true)
    await runSketch(page, 'hasfonts', HAS_FONTS)
    await page.waitForTimeout(1200)
    const [r, g] = await centerRGB(page)
    // eslint-disable-next-line no-console
    console.log(`[fonts-present worker] centerRGB=[${r},${g}]`)
    expect(g, 'document.fonts is a real FontFaceSet with .add() in the worker').toBeGreaterThan(r)
  })

  test('worker — real loadFont() round-trips (success cb fires, no errors)', async ({ page }) => {
    await boot(page, true)
    await runSketch(page, 'loadfont', LOAD_FONT(FONT_DATA_URL))
    await page.waitForTimeout(1500)
    const errs = await fontErrors(page)
    const [r, g] = await centerRGB(page)
    // eslint-disable-next-line no-console
    console.log(`[loadfont worker] centerRGB=[${r},${g}] font-errors=${JSON.stringify(errs.slice(0, 2))}`)
    expect(errs, 'no font/FontFace errors in the worker').toEqual([])
    // green = success cb fired; olive (70,70,0) = the pre-fix document.fonts.ready hang.
    expect(g, 'loadFont success callback fired (font loaded + ready resolved)').toBeGreaterThan(120)
  })

  test('main parity — loadFont round-trips', async ({ page }) => {
    await boot(page, false)
    await runSketch(page, 'loadfont', LOAD_FONT(FONT_DATA_URL))
    await page.waitForTimeout(1500)
    const [r, g] = await centerRGB(page)
    // eslint-disable-next-line no-console
    console.log(`[loadfont main] centerRGB=[${r},${g}]`)
    expect(g, 'loadFont round-trips on the main thread').toBeGreaterThan(120)
  })
})
