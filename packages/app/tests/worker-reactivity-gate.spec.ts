/**
 * PHASE-B ACCEPTANCE GATE (PV75 / #261) — multi-instance worker reactivity.
 *
 * Phase B's single-viz gauge + single-screenshot + deterministic-parity checks
 * ALL passed while N concurrent worker viz rendered seconds-stale audio data
 * ("kinda static" — #261, blind spot P108). The cause: the main rAF produced
 * SignalFrames far faster (≈120fps) than a heavy-WEBGL worker could draw (≈20fps);
 * with no backpressure the surplus backlogged in the worker's postMessage queue
 * (≈660-frame / ≈5s lag observed) so the worker drew old data. Fixed by bounding
 * in-flight frames (WorkerVizRenderer MAX_FRAMES_IN_FLIGHT + worker `frameAck`).
 *
 * Reactivity is a TEMPORAL, MULTI-INSTANCE, LIVE-AUDIO property — invisible to a
 * gauge, one frame, or fixed-byte parity (P108). This gate measures it directly:
 * render ≥4 concurrent heavy WEBGL p5 sketches reading `u.fft` on a 4-track LIVE
 * pattern, screenshot each canvas 5× ~0.7s apart, count DISTINCT frames per zone.
 * A reactive viz changes every sample (→5 distinct); a stale/static one repeats.
 *
 * Gate: every worker zone must show ≥4/5 distinct frames (the bug produced 2-3),
 * AND worker must track the main-thread reference within 1 per zone (PV75 "≈main").
 * All zones are forced on-screen (tall viewport + scrollTop 0) so Phase C's
 * off-screen pause can't confound the count.
 *
 * Run: E2E_VERIFY=1 pnpm --filter @stave/app exec playwright test worker-reactivity-gate.spec.ts --timeout=240000 --workers=1
 */
import { test, expect, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

/** Heavy WEBGL sketch — p5's JS line-tessellation is the real (canvas-size-
 *  invariant) cost that makes the worker the bottleneck; reads `u.fft` so its
 *  output tracks the live audio frame-to-frame. */
const SYNTHWAVE = `function setup(){ createCanvas(stave.width, stave.height, WEBGL) }
function draw(){
  background(12,6,28)
  const W=width,H=height
  stroke(255,40,200); strokeWeight(2); noFill()
  const ROWS=40, COLS=70
  for(let r=0;r<ROWS;r++){
    const z=r/ROWS
    const y0=-H/2 + H*0.42 + z*z*(H*0.58)
    beginShape()
    for(let c=0;c<=COLS;c++){
      const x=-W/2 + (c/COLS)*W
      const fi=(c*3+r)%u.fft.length
      const h=(u.fft[fi]||0)*220*(1-z)
      vertex(x, y0-h)
    }
    endShape()
  }
}`

/** All-continuous audio (no sparse tracks) — every zone has constant spectral
 *  energy, so a healthy viz hits 5/5 distinct and a stale one is unambiguous. */
const PAT_CONT = [
  `$: note("c2 e2 g2 c3").s("sawtooth").viz('swr')`,
  `$: note("e2 g2 b2 e3").s("square").viz('swr')`,
  `$: s("hh*16").bank("RolandTR909").gain(1.2).viz('swr')`,
  `$: note("a1 c2 e2 a2").s("triangle").viz('swr')`,
].join('\n')

async function setCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
    if (!e) return false
    e.getModel()?.setValue(c)
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(300)
}
async function press(page: Page, key: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(key)
}

/** Per-zone distinct-frame counts (over 5 samples ~0.7s apart) for the wide viz
 *  canvases. Returns one count per on-screen viz zone. */
async function perZoneDistinct(page: Page): Promise<number[]> {
  const canvases = page.locator('.monaco-editor canvas')
  const n = await canvases.count()
  const big: number[] = []
  for (let i = 0; i < n; i++) {
    const box = await canvases.nth(i).boundingBox().catch(() => null)
    if (box && box.width > 200 && box.height > 80) big.push(i)
  }
  const series: string[][] = big.map(() => [])
  for (let s = 0; s < 5; s++) {
    for (let k = 0; k < big.length; k++) {
      const buf = await canvases.nth(big[k]).screenshot().catch(() => Buffer.from(''))
      series[k].push(createHash('md5').update(buf).digest('hex').slice(0, 8))
    }
    await page.waitForTimeout(700)
  }
  return series.map((hs) => new Set(hs).size)
}

async function measure(page: Page, worker: boolean): Promise<number[]> {
  await page.setViewportSize({ width: 1500, height: 1400 })
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
  await page.evaluate((code) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__staveRegisterViz?.({ id: 'swr', name: 'swr', renderer: 'p5', code, requires: ['streaming'], nativeSize: { w: 1100, h: 200 }, createdAt: 1, updatedAt: 1 })
  }, SYNTHWAVE)
  await press(page, `${MOD}+Period`)
  await page.waitForTimeout(600)
  await setCode(page, PAT_CONT)
  await press(page, `${MOD}+Enter`)
  await page.waitForTimeout(3000)
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).monaco?.editor?.getEditors?.()?.[0]?.setScrollTop(0)
  })
  await page.waitForTimeout(2000)
  // Confirm the worker/main path actually engaged (robust to count).
  const gauges = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).__stavePerf?.snapshot?.()?.gauges ?? {}
  })
  if (worker) expect(gauges['viz.worker'] ?? 0).toBeGreaterThanOrEqual(4)
  else expect(gauges['viz.p5'] ?? 0).toBeGreaterThanOrEqual(4)
  const distinct = await perZoneDistinct(page)
  // eslint-disable-next-line no-console
  console.log(`[react-gate ${worker ? 'worker' : 'main'}] perZoneDistinct(/5)=${JSON.stringify(distinct)}`)
  return distinct
}

test.describe('worker viz multi-instance reactivity (PV75 / #261)', () => {
  test.skip(!process.env.E2E_VERIFY && !process.env.REACT, 'gate — set E2E_VERIFY=1')

  test('4 concurrent heavy WEBGL worker viz stay audio-reactive (≈ main)', async ({ browser }) => {
    // Separate contexts so localStorage (worker on/off) is clean per measurement.
    const ctxW = await browser.newContext()
    const worker = await measure(await ctxW.newPage(), true)
    await ctxW.close()

    const ctxM = await browser.newContext()
    const main = await measure(await ctxM.newPage(), false)
    await ctxM.close()

    // Must have measured ≥4 concurrent zones on both paths (Phase C off-screen
    // pause would silently drop zones → false low counts).
    expect(worker.length).toBeGreaterThanOrEqual(4)
    expect(main.length).toBeGreaterThanOrEqual(4)

    // PV75: every worker zone reactive (≥4/5 — the #261 bug produced 2-3) AND
    // within 1 of the main-thread reference per zone (worker ≈ main).
    for (let i = 0; i < worker.length; i++) {
      expect(worker[i], `worker zone ${i} distinct frames`).toBeGreaterThanOrEqual(4)
      const ref = main[i] ?? 5
      expect(worker[i], `worker zone ${i} vs main ${ref}`).toBeGreaterThanOrEqual(ref - 1)
    }
  })
})
