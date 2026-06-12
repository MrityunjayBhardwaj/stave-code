/**
 * #317 — verify p5 `createGraphics(…, WEBGL)` + `createFramebuffer()` render in the
 * OffscreenCanvas worker. The #308 audit READ these as worker-safe (pure WebGL;
 * p5.Framebuffer is DOM-free; an OffscreenCanvas backs a 2nd WebGL2 context) but
 * did NOT run them — and that audit's `text()` claim was a false positive (P130),
 * so this closes the loop by OBSERVATION.
 *
 * createGraphics(WEBGL) mints a SECOND OffscreenCanvas + WebGL2 context off-main;
 * createFramebuffer is an FBO on the main canvas's context. Both are judged by
 * COMPOSITOR pixel coverage over a musical cycle (PV90/PV94), worker-vs-main.
 *
 * Run: E2E_VERIFY=1 pnpm --filter @stave/app exec playwright test \
 *        viz-worker-webgl.spec.ts --workers=1
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const AUDIO = `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909")`

// createGraphics(WEBGL): spin a ring of boxes into an off-screen WEBGL buffer, blit
// it to the main WEBGL canvas. The 2nd GL context is the thing under test.
const CG_WEBGL = `let pg
function setup(){ createCanvas(stave.width, stave.height, WEBGL); pg = createGraphics(width, height, WEBGL) }
function draw(){
  background(8, 8, 16)
  pg.background(8, 8, 18)
  pg.noStroke(); pg.ambientLight(80); pg.directionalLight(180,140,255, 0,0,-1)
  pg.push(); pg.rotateZ(frameCount*0.02 + (sig.kick||0))
  for(let i=0;i<8;i++){ pg.push(); pg.rotateZ(i*PI/4); pg.translate(min(width,height)*0.22, 0); pg.fill(120,200,255); pg.box(30 + (sig.rms||0)*40); pg.pop() }
  pg.pop()
  image(pg, -width/2, -height/2)
}`

// createFramebuffer: render a spinning box into an FBO, draw the FBO as a texture.
const FBO = `let fb
function setup(){ createCanvas(stave.width, stave.height, WEBGL); fb = createFramebuffer() }
function draw(){
  fb.begin()
  clear(); background(8, 8, 18); ambientLight(90); directionalLight(200,160,255, 0,0,-1)
  rotateY(frameCount*0.02); rotateX(frameCount*0.013); fill(120,200,255); box(min(width,height)*0.3)
  fb.end()
  background(8, 8, 16); texture(fb); noStroke(); plane(width, height)
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
  await page.waitForTimeout(2500)
}

async function snap(page: Page): Promise<{ gauges: Record<string, number>; errors: string[] }> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const g = w.__stavePerf?.snapshot?.()?.gauges ?? {}
    const errors = (w.__staveGetLog?.() ?? [])
      .filter((e: { level?: string }) => e?.level === 'error')
      .map((e: { message?: string }) => String(e?.message ?? ''))
    return { gauges: g, errors }
  })
}

async function litFraction(page: Page): Promise<number> {
  const box = await page.locator('[data-viz-zone] canvas').first().boundingBox()
  if (!box) return 0
  const clip = { x: box.x + 4, y: box.y + 4, width: Math.max(20, box.width - 8), height: Math.max(20, box.height - 8) }
  const png = await page.screenshot({ clip }).catch(() => Buffer.from([]))
  if (png.length === 0) return 0
  return page.evaluate(async ({ data }) => {
    const img = new Image()
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('decode')); img.src = `data:image/png;base64,${data}` })
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0)
    const px = ctx.getImageData(0, 0, c.width, c.height).data
    const br = px[0], bg = px[1], bb = px[2]; let lit = 0
    for (let i = 0; i < px.length; i += 4) { if (Math.abs(px[i]-br)+Math.abs(px[i+1]-bg)+Math.abs(px[i+2]-bb) > 48) lit++ }
    return (c.width*c.height) === 0 ? 0 : lit / (c.width*c.height)
  }, { data: png.toString('base64') })
}

async function peakLit(page: Page, n: number, gapMs: number): Promise<number> {
  let peak = 0
  for (let i = 0; i < n; i++) { peak = Math.max(peak, await litFraction(page)); if (i < n - 1) await page.waitForTimeout(gapMs) }
  return peak
}

for (const { name, id, code, gauge } of [
  { name: 'createGraphics(WEBGL)', id: 'cgwebgl', code: CG_WEBGL, gauge: 'viz.worker' },
  { name: 'createFramebuffer', id: 'fbo', code: FBO, gauge: 'viz.worker' },
]) {
  test.describe(`#317 — ${name} in the worker`, () => {
    test.skip(!process.env.E2E_VERIFY, 'set E2E_VERIFY=1')

    test(`worker renders ${name} (no errors)`, async ({ page }) => {
      await boot(page, true)
      await runSketch(page, id, code)
      await page.waitForTimeout(1500)
      const s = await snap(page)
      const peak = await peakLit(page, 10, 220)
      // eslint-disable-next-line no-console
      console.log(`[${id} worker] peak=${peak.toFixed(4)} gauges=${JSON.stringify(s.gauges)} errs=${JSON.stringify(s.errors.slice(0,3))}`)
      expect(s.gauges[gauge], `${name} mounted in the worker`).toBeGreaterThanOrEqual(1)
      // The strongest WEBGL signal: a live GL context came up off-main (a 2nd
      // OffscreenCanvas context for createGraphics(WEBGL); the FBO's context).
      expect(s.gauges['viz.glctx'], `${name} acquired a worker WebGL context`).toBeGreaterThanOrEqual(1)
      expect(s.errors, `${name} ran clean in the worker`).toEqual([])
      // Renders non-blank. NOTE: litFraction is corner-referenced, so a full-bleed
      // 3D plane reads low (the corner IS the content) — 0.02 cleanly separates a
      // real render (~0.04–0.13 observed) from blank (~0.005); glctx is the real proof.
      expect(peak, `${name} paints in the worker (not blank)`).toBeGreaterThan(0.02)
    })

    test(`main parity — ${name} renders`, async ({ page }) => {
      await boot(page, false)
      await runSketch(page, id, code)
      await page.waitForTimeout(1500)
      const peak = await peakLit(page, 10, 220)
      // eslint-disable-next-line no-console
      console.log(`[${id} main] peak=${peak.toFixed(4)}`)
      expect(peak, `${name} paints on the main thread`).toBeGreaterThan(0.02)
    })
  })
}
