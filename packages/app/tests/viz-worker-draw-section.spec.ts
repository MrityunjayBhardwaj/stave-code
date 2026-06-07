/**
 * PHASE-F PROFILER BRIDGE GATE (#230) — the worker draw cost reaches the main
 * profiler snapshot.
 *
 * The default viz path is the OffscreenCanvas WORKER, whose bundle never imported
 * `perf` — so the worker's `s.draw()` cost was a profiler BLIND SPOT (only the
 * main-side frame interval + sample/write sections were visible). Phase F bridges
 * it: the worker times each draw and piggybacks the duration on the next
 * `frameAck`; the main `WorkerVizRenderer` records it as the `viz.worker.draw`
 * section. This gate OBSERVES that the section actually populates from a live
 * worker viz (not inference).
 *
 * Run: E2E_VERIFY=1 pnpm --filter @stave/app exec playwright test viz-worker-draw-section.spec.ts --timeout=120000 --workers=1
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

// A non-trivial WEBGL sketch so the draw time is comfortably measurable (> noise).
const SKETCH = `function setup(){ createCanvas(stave.width, stave.height, WEBGL) }
function draw(){
  background(8,8,18)
  stroke(180,120,255); strokeWeight(1.5); noFill()
  for(let r=0;r<40;r++){ beginShape()
    for(let c=0;c<=90;c++){ const fi=(c*3+r)%u.fft.length
      vertex(-width/2+(c/90)*width, -height/2+r*8 - (u.fft[fi]||0)*120) }
    endShape() }
}`

const PAT = `$: s("hh*16").bank("RolandTR909").gain(0.9).viz('wdraw')`

async function press(page: Page, key: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(key)
}

test.describe('Phase F — worker draw cost reaches the main profiler (#230)', () => {
  test.skip(!process.env.E2E_VERIFY && !process.env.FPROF, 'gate — set E2E_VERIFY=1')

  test('viz.worker.draw section populates from a live worker viz', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_PERF__ = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_E2E__ = true
      try { localStorage.setItem('stave.viz.worker', '1') } catch { /* */ }
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
    await page.waitForTimeout(1500)

    await page.evaluate((code) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__staveRegisterViz?.({ id: 'wdraw', name: 'wdraw', renderer: 'p5', code, requires: ['streaming'], nativeSize: { w: 900, h: 200 }, createdAt: 1, updatedAt: 1 })
    }, SKETCH)

    await press(page, `${MOD}+Period`)
    await page.waitForTimeout(400)
    await page.evaluate((c) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.setValue(c)
    }, PAT)
    await page.waitForTimeout(300)
    await press(page, `${MOD}+Enter`)
    await page.waitForTimeout(3000)
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).monaco?.editor?.getEditors?.()?.[0]?.setScrollTop(0)
    })

    // Clean measurement window, then read the snapshot.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.evaluate(() => (window as any).__stavePerf?.reset?.())
    await page.waitForTimeout(3000)
    const snap = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (window as any).__stavePerf?.snapshot?.()
      return {
        workerGauge: s?.gauges?.['viz.worker'] ?? 0,
        draw: s?.sections?.['viz.worker.draw'] ?? null,
      }
    })
    await ctx.close()

    // eslint-disable-next-line no-console
    console.log(`[worker-draw] gauge=${snap.workerGauge} viz.worker.draw=${JSON.stringify(snap.draw)}`)

    expect(snap.workerGauge, 'a worker viz must be live').toBeGreaterThanOrEqual(1)
    // THE BRIDGE: the worker's draw cost reached the main snapshot as a section.
    expect(snap.draw, 'viz.worker.draw section must exist (the bridge fired)').not.toBeNull()
    expect(snap.draw.count, 'draw samples recorded from the worker').toBeGreaterThan(0)
    expect(snap.draw.p95, 'a sensible non-negative draw time').toBeGreaterThanOrEqual(0)
  })
})
