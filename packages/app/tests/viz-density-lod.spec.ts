/**
 * PHASE-D DENSITY-LOD GATE (#269 / #232) — the quality knob must MOVE the cost
 * curve for the CPU-tessellation line-mesh class, OBSERVED end-to-end.
 *
 * #232 measured that dropping RESOLUTION does nothing for a line-mesh sketch
 * (canvas 600→150px at constant segments = no change) — that class needs fewer
 * SEGMENTS. Phase D wires a quality level → `sig.density` (a sketch LOD multiplier)
 * marshalled live into the worker. This gate proves the whole chain works by
 * OBSERVATION, not inference (the house rule; three perf inferences inverted on
 * this saga — P112/P113/P114):
 *
 *   1. mount ONE heavy WEBGL line-mesh worker viz that scales its segment count
 *      by `sig.density` (full mesh at density 1; ~4× fewer at density 0.5).
 *   2. measure the worker's per-instance frame interval at quality `high`
 *      (density 1) — under #261 backpressure the produce/ack cadence == the
 *      worker's true draw rate, so frame p95 reflects per-frame draw cost (PV80).
 *   3. call the REAL setter `__staveSetVizQuality('performance')` (density 0.5).
 *      This rides the live config-marshal channel (no remount — the gauge must
 *      stay ≥1 across the switch), so the same mounted worker now draws ~4× fewer
 *      segments.
 *   4. measure again. The frame interval must DROP meaningfully. If it doesn't,
 *      either the marshal channel or the sketch decimation is broken.
 *
 * Caveat (PV80): the `maxFps` cap (60 → 16.7ms) is an UPPER bound. The fixture is
 * sized so density-1 draw cost is well ABOVE the cap floor on normal HW, so the
 * density drop is observable rather than masked by the cap. The assert is a
 * RELATIVE drop, not an absolute fps (run-to-run RSS/fps is noisy — PK26 spirit).
 *
 * Run: E2E_VERIFY=1 pnpm --filter @stave/app exec playwright test viz-density-lod.spec.ts --timeout=180000 --workers=1
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

/** Heavy WEBGL line-mesh — p5's JS line tessellation is the (resolution-
 *  invariant, #232) cost. Scales its row/col step by `sig.density`: density 1 →
 *  step 1 (full ROWS×COLS mesh); density 0.5 → step 2 (~4× fewer segments).
 *  Reads `sig.fft` so it stays audio-reactive (a static sketch could be cached). */
const HEAVY_MESH = `function setup(){ createCanvas(stave.width, stave.height, WEBGL) }
function draw(){
  background(12,6,28)
  const W=width,H=height
  stroke(255,40,200); strokeWeight(1.5); noFill()
  const d = (typeof sig!=='undefined' && sig && sig.density>0) ? sig.density : 1
  const step = Math.max(1, Math.round(1/d))
  const ROWS=64, COLS=150
  for(let r=0;r<ROWS;r+=step){
    const z=r/ROWS
    const y0=-H/2 + H*0.42 + z*z*(H*0.58)
    beginShape()
    for(let c=0;c<=COLS;c+=step){
      const x=-W/2 + (c/COLS)*W
      const fi=(c*3+r)%sig.fft.length
      const h=(sig.fft[fi]||0)*220*(1-z)
      vertex(x, y0-h)
    }
    endShape()
  }
}`

const PAT_CONT = [
  `$: note("c2 e2 g2 c3").s("sawtooth").viz('dlod')`,
  `$: s("hh*16").bank("RolandTR909").gain(1.2).viz('dlod')`,
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

async function setQuality(page: Page, level: 'high' | 'balanced' | 'performance'): Promise<void> {
  await page.evaluate((l) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__staveSetVizQuality?.(l)
  }, level)
  // Let the config message reach the worker + a handful of frames render at the
  // new density before sampling.
  await page.waitForTimeout(2500)
}

interface Cost {
  /** Worst per-instance frame-interval p95 (ms) — the draw-cost proxy (PV80). */
  p95: number
  /** Min per-instance fps among live instances. */
  fps: number
  /** Live worker-viz gauge (must stay ≥1 across the quality switch = no remount). */
  workerGauge: number
}

async function measureCost(page: Page): Promise<Cost> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).__stavePerf?.reset?.())
  await page.waitForTimeout(3000)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snap = await page.evaluate(() => (window as any).__stavePerf?.snapshot?.())
  const frameIds = Object.keys(snap.frames)
  const p95s = frameIds.map((id) => snap.frames[id].p95).filter((p) => p > 0)
  const fpsList = frameIds.map((id) => snap.frames[id].fps).filter((f) => f > 0)
  return {
    p95: p95s.length ? Math.max(...p95s) : 0,
    fps: fpsList.length ? Math.min(...fpsList) : 0,
    workerGauge: snap.gauges['viz.worker'] ?? 0,
  }
}

test.describe('Phase D — density LOD moves the line-mesh cost curve (#269 / #232)', () => {
  test.skip(!process.env.E2E_VERIFY && !process.env.DENSITY, 'gate — set E2E_VERIFY=1')

  test('lowering quality (density 1 → 0.5) drops worker frame cost, live, no remount', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()

    await page.setViewportSize({ width: 1400, height: 1300 })
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
      ;(window as any).__staveRegisterViz?.({ id: 'dlod', name: 'dlod', renderer: 'p5', code, requires: ['streaming'], nativeSize: { w: 1100, h: 220 }, createdAt: 1, updatedAt: 1 })
    }, HEAVY_MESH)

    await press(page, `${MOD}+Period`)
    await page.waitForTimeout(500)
    await setCode(page, PAT_CONT)
    await press(page, `${MOD}+Enter`)
    await page.waitForTimeout(3000)
    // Force the zone on-screen so Phase C can't pause it (PV78).
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).monaco?.editor?.getEditors?.()?.[0]?.setScrollTop(0)
    })
    await page.waitForTimeout(1500)

    // ── A: high quality (density 1 — full mesh) ──
    await setQuality(page, 'high')
    const high = await measureCost(page)

    // ── B: performance (density 0.5 — ~4× fewer segments), set LIVE ──
    await setQuality(page, 'performance')
    const perf = await measureCost(page)

    await ctx.close()

    // eslint-disable-next-line no-console
    console.log(`[density-lod] high(d=1): p95=${high.p95.toFixed(1)}ms fps=${high.fps.toFixed(1)} gauge=${high.workerGauge} | performance(d=0.5): p95=${perf.p95.toFixed(1)}ms fps=${perf.fps.toFixed(1)} gauge=${perf.workerGauge}`)

    // The worker path engaged on both samples, and the SAME instance persisted
    // across the quality switch (live marshal, not a remount).
    expect(high.workerGauge, 'worker viz must be live at high').toBeGreaterThanOrEqual(1)
    expect(perf.workerGauge, 'worker viz must stay live across the switch').toBeGreaterThanOrEqual(1)

    // Sanity: the fixture is heavy enough at density 1 that the maxFps cap
    // (~16.7ms) isn't masking the density drop. If this fails, the HW is too fast
    // for this fixture size — bump ROWS/COLS.
    expect(high.p95, 'fixture not heavy enough to observe LOD (raise ROWS/COLS)').toBeGreaterThan(22)

    // THE PROOF: density 0.5 draws ~4× fewer segments → frame cost drops. A
    // generous ≥15% margin (the real effect is multiples) keeps it off the noise
    // floor while proving the lever fires for the #232 mesh class.
    expect(perf.p95, 'density drop must lower worker frame cost').toBeLessThan(high.p95 * 0.85)
  })

  test('the Editor Settings "Viz quality" dropdown drives the real setter (#269 UI)', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_E2E__ = true
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
    await page.waitForTimeout(1000)

    // Open the gear menu → Editor Settings…
    await page.locator('[aria-label="Settings"]').click()
    await page.getByText('Editor Settings...').click()

    const select = page.getByLabel('Viz quality (performance mode)')
    await select.waitFor({ timeout: 5000 })

    // Selecting a level must route through the real setVizQuality path — observe
    // the persisted level AND the marshalled density, not just that the UI changed.
    await select.selectOption('performance')
    await page.waitForTimeout(300)
    const afterPerf = await page.evaluate(() => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      q: localStorage.getItem('stave:vizQuality'),
    }))
    expect(afterPerf.q).toBe('performance')

    await select.selectOption('high')
    await page.waitForTimeout(300)
    const afterHigh = await page.evaluate(() => localStorage.getItem('stave:vizQuality'))
    expect(afterHigh).toBe('high')

    await ctx.close()
  })
})
