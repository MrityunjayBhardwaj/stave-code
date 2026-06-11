import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * #325 Phase-1 SPIKE — p5 owns the transferred display canvas (Tier A; direct render,
 * no blit). The PERMANENT fix for the #306/#316/P126/PV96 transfer-clear class: instead
 * of p5 drawing into a private worker-local canvas that we `transferToImageBitmap()`
 * (which CLEARS it every frame), p5 renders STRAIGHT into `msg.canvas` (the transferred
 * on-screen OffscreenCanvas), exactly like hydra/glsl. No transfer → the canvas persists
 * frame-to-frame → `getImageData` readback and skip-`background()` trails just work.
 *
 * Gated behind `localStorage['stave.viz.p5direct']='1'` (main side: WorkerVizRenderer
 * sets `MountMessage.p5DirectCanvas`) so ONE build A/Bs the blit path vs the direct path.
 *
 * SPIKE EXIT PROOF (the gate): a `getImageData` readback sketch AND a skip-`background()`
 * trail sketch each PAINT in the worker under the direct flag — the SAME sketches that
 * BLANK on the blit path (viz-worker-readback.spec.ts) — plus a WEBGL sketch renders
 * (proving p5 adopts msg.canvas with a `webgl2` context directly, no bitmaprenderer
 * conflict). Three arms per the P135 control discipline:
 *   - MAIN (control)         → the fixture is a genuine readback/trail sketch (paints).
 *   - WORKER + DIRECT (SUT)  → paints == main (the spike claim).
 *   - WORKER + BLIT (isolation) → readback BLANKS (proves the flag is the variable, not
 *     the harness — the exact #316 limitation the direct path removes).
 *
 * Verdict = COMPOSITOR pixels (`page.screenshot` clip, PV90/PV93), never the mount gauge.
 * PASS → wire direct as the p5 present path, delete the blit, supersede #324 (Phase 2).
 * FAIL → fall back to #324 (latch) or Tier B (non-destructive copy present).
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const AUDIO = `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909")`

// (a) Raw MAIN-canvas readback waterfall (the #316 fixture): shift left via getImageData/
// putImageData, stamp a full-height bar at the right edge. Accumulates a FILLED field IFF
// the canvas persists across frames (direct path) — blanks on the blit path (cleared).
const READBACK_P2D = `function setup(){ createCanvas(stave.width, stave.height); pixelDensity(1); background(8,8,16) }
function draw(){
  const img = drawingContext.getImageData(4,0,width-4,height)
  drawingContext.putImageData(img,0,0)
  noStroke(); fill(0,230,0); rect(width-6, 0, 6, height)
}`

// (b) Skip-background() TRAIL: never clears; stamps a moving dot every frame. A persistent
// canvas accumulates a Lissajous trail of dots; a cleared canvas (blit) shows only the LAST
// dot (~1 dot ≈ 0.0007 lit). pixelDensity(1) so the readback math is 1:1.
const TRAIL_P2D = `function setup(){ createCanvas(stave.width, stave.height); pixelDensity(1); background(8,8,16) }
function draw(){
  noStroke(); fill(0,230,0);
  const t = frameCount*0.13;
  circle(width/2 + Math.cos(t)*width*0.32, height/2 + Math.sin(t*1.31)*height*0.32, 16);
}`

// (c) WEBGL render — proves p5 adopts msg.canvas with a webgl2 context DIRECTLY (no
// bitmaprenderer conflict; point 2/6). A spinning green box on a dark field.
const WEBGL_BOX = `function setup(){ createCanvas(stave.width, stave.height, WEBGL); pixelDensity(1) }
function draw(){
  background(8,8,16); noStroke(); fill(0,230,0);
  rotateZ(frameCount*0.02); rotateX(frameCount*0.013); box(width*0.32);
}`

// (d) createGraphics() feedback under the direct flag — proves point 4: the OWNED buffer
// still mints a SEPARATE OffscreenCanvas (createGraphics → new p5.Graphics, NOT createCanvas,
// so the canvas-adopter never touches it) AND the main canvas (now msg.canvas) presents it.
// Accumulate trails in the buffer, then image() it onto the main canvas each frame.
const CREATEGRAPHICS_DIRECT = `let g;
function setup(){ createCanvas(stave.width, stave.height); pixelDensity(1); g = createGraphics(stave.width, stave.height); g.background(8,8,16) }
function draw(){
  g.noStroke(); g.fill(0,230,0);
  const t = frameCount*0.13;
  g.circle(width/2 + Math.cos(t)*width*0.32, height/2 + Math.sin(t*1.31)*height*0.32, 16);
  image(g, 0, 0);
}`

async function boot(page: Page, opts: { worker: boolean; direct: boolean }) {
  await page.addInitScript((o) => {
    ;(window as any).__STAVE_PERF__ = true
    ;(window as any).__STAVE_E2E__ = true
    try {
      localStorage.setItem('stave.viz.worker', o.worker ? '1' : '0')
      localStorage.setItem('stave.viz.p5direct', o.direct ? '1' : '0')
    } catch {}
  }, opts)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1500)
}

async function gauges(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => (window as any).__stavePerf?.snapshot?.()?.gauges ?? {})
}

// Compositor pixel coverage (PV90): screenshot the viz canvas's bounding box (what the
// user actually sees), count pixels that differ from the top-left background pixel.
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

async function mountAndPeak(page: Page, code: string): Promise<number> {
  await page.evaluate((c) => { (window as any).__P5D_CODE = c }, code)
  await page.evaluate(() => {
    ;(window as any).__staveRegisterViz?.({ id: 'p5dtest', name: 'p5dtest', renderer: 'p5', code: (window as any).__P5D_CODE,
      requires: ['streaming'], nativeSize: { w: 600, h: 360 }, createdAt: 1, updatedAt: 1 })
  })
  await page.evaluate((c) => (window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.setValue(c), `${AUDIO}.viz('p5dtest')`)
  await page.waitForTimeout(200)
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(3500)
  let peak = 0
  for (let i = 0; i < 10; i++) { peak = Math.max(peak, await litFraction(page)); await page.waitForTimeout(200) }
  return peak
}

test.describe('#325 Phase-1 spike — p5 owns the display canvas (direct render, no blit)', () => {
  test.skip(!process.env.E2E_VERIFY, 'set E2E_VERIFY=1 to run (drives the live worker path)')

  test('MAIN control — getImageData readback PAINTS (genuine fixture; fresh page)', async ({ page }) => {
    await boot(page, { worker: false, direct: false })
    const rb = await mountAndPeak(page, READBACK_P2D)
    // eslint-disable-next-line no-console
    console.log(`[p5direct MAIN readback] litPeak=${rb.toFixed(4)}`)
    expect(rb, 'readback waterfall fills on the main thread (control)').toBeGreaterThan(0.5)
  })

  test('MAIN control — skip-background trail accumulates (genuine fixture; fresh page)', async ({ page }) => {
    await boot(page, { worker: false, direct: false })
    const tr = await mountAndPeak(page, TRAIL_P2D)
    // eslint-disable-next-line no-console
    console.log(`[p5direct MAIN trail] litPeak=${tr.toFixed(4)}`)
    expect(tr, 'skip-background trail accumulates on the main thread (control)').toBeGreaterThan(0.03)
  })

  test('WORKER + DIRECT — readback PAINTS in the worker (== main; the spike claim)', async ({ page }) => {
    await boot(page, { worker: true, direct: true })
    const rb = await mountAndPeak(page, READBACK_P2D)
    const g = await gauges(page)
    // eslint-disable-next-line no-console
    console.log(`[p5direct WORKER+DIRECT readback] litPeak=${rb.toFixed(4)} gauges=${JSON.stringify(g)}`)
    expect(g['viz.worker'], 'mounted in the worker (no fallback)').toBeGreaterThanOrEqual(1)
    expect(rb, 'readback PAINTS under the direct path (canvas persists — the #316 limitation removed)').toBeGreaterThan(0.5)
  })

  test('WORKER + DIRECT — skip-background trail PAINTS in the worker (== main)', async ({ page }) => {
    await boot(page, { worker: true, direct: true })
    const tr = await mountAndPeak(page, TRAIL_P2D)
    const g = await gauges(page)
    // eslint-disable-next-line no-console
    console.log(`[p5direct WORKER+DIRECT trail] litPeak=${tr.toFixed(4)} gauges=${JSON.stringify(g)}`)
    expect(g['viz.worker'], 'mounted in the worker (no fallback)').toBeGreaterThanOrEqual(1)
    expect(tr, 'trail accumulates under the direct path (>> 1 dot)').toBeGreaterThan(0.03)
  })

  test('WORKER + DIRECT — WEBGL sketch renders (p5 adopts msg.canvas with webgl2)', async ({ page }) => {
    await boot(page, { worker: true, direct: true })
    const w = await mountAndPeak(page, WEBGL_BOX)
    const g = await gauges(page)
    // eslint-disable-next-line no-console
    console.log(`[p5direct WORKER+DIRECT webgl] litPeak=${w.toFixed(4)} gauges=${JSON.stringify(g)}`)
    expect(g['viz.worker'], 'mounted in the worker (no fallback)').toBeGreaterThanOrEqual(1)
    expect(g['viz.glctx'], 'a webgl2 context was taken directly on msg.canvas (no bitmaprenderer conflict)').toBeGreaterThanOrEqual(1)
    expect(w, 'WEBGL box renders under the direct path').toBeGreaterThan(0.1)
  })

  test('WORKER + DIRECT — createGraphics() still mints a SEPARATE buffer (point 4)', async ({ page }) => {
    await boot(page, { worker: true, direct: true })
    const cg = await mountAndPeak(page, CREATEGRAPHICS_DIRECT)
    const g = await gauges(page)
    // eslint-disable-next-line no-console
    console.log(`[p5direct WORKER+DIRECT createGraphics] litPeak=${cg.toFixed(4)} gauges=${JSON.stringify(g)}`)
    expect(g['viz.worker'], 'mounted in the worker (no fallback)').toBeGreaterThanOrEqual(1)
    // If the buffer wrongly adopted msg.canvas, image(g) would composite the canvas onto
    // itself (feedback explosion or blank); a separate buffer accumulates a clean trail.
    expect(cg, 'createGraphics buffer accumulates + presents via the adopted main canvas').toBeGreaterThan(0.03)
  })

  test('WORKER + BLIT isolation — the SAME readback BLANKS (proves the flag is the variable, P135)', async ({ page }) => {
    await boot(page, { worker: true, direct: false })
    const rb = await mountAndPeak(page, READBACK_P2D)
    const g = await gauges(page)
    // eslint-disable-next-line no-console
    console.log(`[p5direct WORKER+BLIT readback] litPeak=${rb.toFixed(4)} gauges=${JSON.stringify(g)}`)
    expect(g['viz.worker'], 'mounted in the worker (no fallback)').toBeGreaterThanOrEqual(1)
    expect(rb, 'blit path still blanks (transfer-clear) — the direct path is what flips it').toBeLessThan(0.05)
  })
})
