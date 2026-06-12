/**
 * END-TO-END A/B — 4 inline synthwave p5 sketches on a 4-track Strudel pattern,
 * measured in the REAL app with the perf additions ON (OffscreenCanvas worker —
 * Phase B + Phase C on this branch) vs OFF (the original main-thread renderer).
 *
 * The sketch is a heavy immediate-mode WEBGL-free terrain line-mesh (the
 * documented hot path: beginShape/vertex over thousands of segments per frame,
 * audio-reactive via sig.fft/sig.rms). Four of them serialized on the main rAF starve
 * both audio (trig/s) and the UI (fps/longtasks); in workers they run off-main.
 *
 * Measured over a fixed wall-clock window via __stavePerf (delta-based, no reset):
 *   - trig/s   = Δ counters['audio.triggers'] / window  (audio health; 8.4 = healthy)
 *   - minFps   = min per-instance frame fps              (UI smoothness)
 *   - longtask = Δ count + max ms                        (main-thread jank)
 *   - drawP95  = main p5 draw section p95 (OFF) / viz.worker.sample p95 (ON)
 *
 * Run: AB=1 pnpm --filter @stave/app exec playwright test synthwave-inline4-ab.spec.ts --timeout=300000
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

// Heavy synthwave terrain in WEBGL — strokeWeight lines force p5 v2 to
// quad-tessellate every thick segment in JS per frame (the documented CPU
// bottleneck; canvas-size-INVARIANT, so short zones keep the full cost). ROWS
// strips × COLS segments = ROWS*COLS segments/frame. Reactive ridge from sig.fft.
const ROWS = 60
const COLS = 100
const SYNTHWAVE = `function setup(){ createCanvas(stave.width, stave.height, WEBGL) }
function draw(){
  background(12, 6, 28)
  const W = width, H = height
  const horizon = -H/2 + H * 0.42
  stroke(255, 40, 200); strokeWeight(2); noFill()
  const ROWS = ${ROWS}, COLS = ${COLS}
  for (let r = 0; r < ROWS; r++){
    const z = r / ROWS
    const y0 = horizon + z * z * (H * 0.58)
    beginShape()
    for (let c = 0; c <= COLS; c++){
      const x = -W/2 + (c / COLS) * W
      const fi = (c * 3 + r) % sig.fft.length
      const h = (sig.fft[fi] || 0) * 130 * (1 - z)
      vertex(x, y0 - h)
    }
    endShape()
  }
}`

// 4 inline .viz() zones (one per track line) → the inline-4 scenario.
const PATTERN = [
  `$: s("bd*4").bank("RolandTR909").viz('synthwave')`,
  `$: s("hh*8").bank("RolandTR909").viz('synthwave')`,
  `$: note("c2 eb2 g2 c3").s("sawtooth").viz('synthwave')`,
  `$: s("~ sd ~ sd").bank("RolandTR909").viz('synthwave')`,
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
async function stop(page: Page): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Period`)
  await page.waitForTimeout(600)
}
async function run(page: Page): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(3000)
}

interface Metrics {
  mode: string
  trigPerSec: number
  minFps: number
  frameInstances: number
  longtaskCount: number
  longtaskMaxMs: number
  drawSection: string
  drawP95: number
  workerGauge: number
  mainP5Gauge: number
}

async function snap(page: Page) {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).__stavePerf?.snapshot?.()
    return {
      triggers: s?.counters?.['audio.triggers'] ?? 0,
      longCount: s?.longtasks?.count ?? 0,
      longMax: s?.longtasks?.maxMs ?? 0,
      frames: s?.frames ?? {},
      sections: s?.sections ?? {},
      gauges: s?.gauges ?? {},
    }
  })
}

/** Measure over `windowMs` of steady-state playback (delta-based). */
async function measure(page: Page, mode: string, windowMs: number): Promise<Metrics> {
  const t0 = await snap(page)
  await page.waitForTimeout(windowMs)
  const t1 = await snap(page)

  const secs = windowMs / 1000
  const trigPerSec = (t1.triggers - t0.triggers) / secs
  const fpsList = Object.values(t1.frames as Record<string, { fps: number }>)
    .map((f) => f.fps)
    .filter((f) => f > 0)
  const minFps = fpsList.length ? Math.min(...fpsList) : 0
  // ON → viz.worker.sample; OFF → the main p5 draw section (p5.bus / p5 draw).
  const sec = t1.sections as Record<string, { p95: number }>
  const drawSection =
    mode === 'ON' ? 'viz.worker.sample' : (sec['p5.draw'] ? 'p5.draw' : 'p5.bus')
  const drawP95 = sec[drawSection]?.p95 ?? 0
  return {
    mode,
    trigPerSec: Math.round(trigPerSec * 10) / 10,
    minFps: Math.round(minFps * 10) / 10,
    frameInstances: fpsList.length,
    longtaskCount: t1.longCount - t0.longCount,
    longtaskMaxMs: Math.round(t1.longMax),
    drawSection,
    drawP95: Math.round((sec[drawSection]?.p95 ?? 0) * 1000) / 1000,
    workerGauge: (t1.gauges as Record<string, number>)['viz.worker'] ?? 0,
    mainP5Gauge: (t1.gauges as Record<string, number>)['viz.p5'] ?? 0,
  }
}

async function bootAndMeasure(page: Page, worker: boolean): Promise<Metrics> {
  // Tall viewport + SHORT zones so ALL 4 inline zones are on-screen at once —
  // otherwise Phase C's visibility pausing (active in BOTH modes on this branch)
  // pauses the off-screen ones and we'd measure <4 sketches. This isolates the
  // worker-vs-main contrast, not the pausing.
  await page.setViewportSize({ width: 1500, height: 1400 })
  await page.addInitScript((w) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_PERF__ = true; (window as any).__STAVE_E2E__ = true
    try { localStorage.setItem('stave.viz.worker', w ? '1' : '0') } catch { /* */ }
  }, worker)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1500)

  // Register the synthwave sketch (SHORT zone so 4 stack within the viewport),
  // then drive 4 inline instances.
  const reg = await page.evaluate((code) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).__staveRegisterViz?.({
      id: 'synthwave', name: 'synthwave', renderer: 'p5', code,
      requires: ['streaming'], nativeSize: { w: 1200, h: 200 }, createdAt: 1, updatedAt: 1,
    }) ?? false
  }, SYNTHWAVE)
  expect(reg, '__staveRegisterViz present').toBe(true)

  await stop(page)
  await setCode(page, PATTERN)
  await run(page)
  // Keep the editor scrolled to the top so all 4 zones stay in view.
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).monaco?.editor?.getEditors?.()?.[0]?.setScrollTop(0)
  })
  await page.waitForTimeout(3500) // warm up to steady state

  const m = await measure(page, worker ? 'ON' : 'OFF', 6000)
  await page.screenshot({ path: `test-results/synthwave-inline4-${worker ? 'on' : 'off'}.png` })
  // eslint-disable-next-line no-console
  console.log(`[AB ${m.mode}] ${JSON.stringify(m)}`)
  return m
}

test.describe('synthwave inline-4 A/B (perf additions ON vs OFF)', () => {
  test.skip(!process.env.AB, 'A/B measurement — set AB=1')

  test('perf additions OFF — main-thread renderer', async ({ page }) => {
    await bootAndMeasure(page, false)
  })

  test('perf additions ON — OffscreenCanvas worker', async ({ page }) => {
    await bootAndMeasure(page, true)
  })
})
