import { test, expect, type Page } from '@playwright/test'

/**
 * B-5 heavy-hydra cost test (#250) — does a BRUTAL hydra shader pipeline (multi-
 * pass: feedback src(o0) + voronoi + kaleid + modulatePixelate + nested modulates)
 * hold `trig/s` when rendered in the worker, and does it STARVE the scheduler on
 * the main thread? Settles empirically the "hydra is GPU-bound → modest perf"
 * question: run BOTH ways and read the delta (Lokāyata, not inference).
 *
 *   worker:   VIZ_WORKER=1 PERF_HYDRA=1 pnpm exec playwright test b5-hydra-heavy.spec.ts --timeout=300000
 *   baseline:             PERF_HYDRA=1 pnpm exec playwright test b5-hydra-heavy.spec.ts --timeout=300000
 *
 * Mirrors perf-matrix's measure protocol (PK19): stop → eval → settle → reset →
 * measure window → snapshot. Vary ONE thing (instance count) per rung.
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const SETTLE_MS = 2500
const MEASURE_MS = 7000

// A deliberately HEAVY hydra sketch — runs as `new Function('s','stave', code)`
// (s = synth, s.a.fft[] = master bins). Multi-pass GPU pipeline with FEEDBACK
// (src(o0)) + voronoi + kaleid + pixelate + nested modulates → the worst-case
// hydra fragment load, audio-reactive on every stage.
const HEAVY_HYDRA = String.raw`s.osc(40, 0.1, 1.5)
  .modulate(s.noise(12, 0.3), 0.5)
  .modulate(s.osc(30, 0.05, 0).kaleid(7), 0.3)
  .rotate(() => 0.2 + s.a.fft[0] * 3.14)
  .color(() => 0.5 + s.a.fft[0] * 2, () => 0.3 + s.a.fft[1], () => 0.8 + s.a.fft[2] * 2)
  .modulatePixelate(s.noise(30, 0.2), 200)
  .modulate(s.voronoi(25, 0.4, 0.3), 0.2)
  .diff(s.src(s.o0).scale(1.012).rotate(0.01))
  .modulate(s.src(s.o0).scale(0.98), () => 0.02 + s.a.fft[3] * 0.05)
  .kaleid(() => 3 + Math.floor(s.a.fft[1] * 8))
  .out(s.o0)`

const AUDIO = [
  `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909")`,
  `$: note("c2 eb2 g2 c3").s("sawtooth").lpf(700)`,
].join('\n')
const vizLine = `$: silence.viz('heavyhydra')`

async function setCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
    if (!e) return false
    e.getModel()?.setValue(c)
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(150)
}
async function stopCode(page: Page): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Period`)
  await page.waitForTimeout(600)
}
async function runCode(page: Page): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2500)
}
async function play(page: Page, code: string): Promise<void> {
  await stopCode(page)
  await setCode(page, code)
  await runCode(page)
}

interface Row {
  scenario: string
  vizP5: number
  vizHydra: number
  vizWorker: number
  minFps: number
  maxP95: number
  longtasks: number
  longtaskMax: number
  wkSampleP95: number
  wkWriteP95: number
  hydraDrawP95: number
  triggersPerSec: number
}

async function measure(page: Page, scenario: string): Promise<Row> {
  await page.waitForTimeout(SETTLE_MS)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).__stavePerf?.reset?.())
  await page.waitForTimeout(MEASURE_MS)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snap = await page.evaluate(() => (window as any).__stavePerf?.snapshot?.())
  const frameIds = Object.keys(snap.frames)
  const fpsList = frameIds.map((id) => snap.frames[id].fps).filter((f: number) => f > 0)
  const p95List = frameIds.map((id) => snap.frames[id].p95)
  const triggers = snap.counters['audio.triggers'] ?? 0
  return {
    scenario,
    vizP5: snap.gauges['viz.p5'] ?? 0,
    vizHydra: snap.gauges['viz.hydra'] ?? 0,
    vizWorker: snap.gauges['viz.worker'] ?? 0,
    minFps: fpsList.length ? Math.min(...fpsList) : 0,
    maxP95: p95List.length ? Math.max(...p95List) : 0,
    longtasks: snap.longtasks.count,
    longtaskMax: snap.longtasks.maxMs,
    wkSampleP95: snap.sections['viz.worker.sample']?.p95 ?? 0,
    wkWriteP95: snap.sections['viz.worker.write']?.p95 ?? 0,
    hydraDrawP95: snap.sections['hydra.draw']?.p95 ?? 0,
    triggersPerSec: snap.uptimeMs > 0 ? (triggers / snap.uptimeMs) * 1000 : 0,
  }
}

test.describe('B-5 heavy hydra — worker vs main cost', () => {
  test.beforeEach(async ({ page }) => {
    const vizWorker = !!process.env.VIZ_WORKER
    await page.addInitScript((useWorker) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_PERF__ = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_E2E__ = true
      try {
        localStorage.setItem('stave.viz.worker', useWorker ? '1' : '0')
      } catch {
        /* ignore */
      }
    }, vizWorker)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(1000)
    const reg = await page.evaluate((code) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__staveRegisterViz?.({
        id: 'b5-heavyhydra', name: 'heavyhydra', renderer: 'hydra', code,
        requires: ['streaming', 'queryable'], nativeSize: { w: 900, h: 600 },
        createdAt: 1, updatedAt: 1,
      }) ?? false
    }, HEAVY_HYDRA)
    // eslint-disable-next-line no-console
    console.log(`[setup] heavy hydra registered = ${reg} · VIZ_WORKER=${vizWorker}`)
  })

  test('heavy hydra cost ladder', async ({ page }) => {
    test.skip(!process.env.PERF_HYDRA, 'manual perf harness — set PERF_HYDRA=1')
    const rows: Row[] = []

    await play(page, AUDIO)
    rows.push(await measure(page, 'audio-only'))

    for (const n of [1, 2, 4]) {
      await play(page, [AUDIO, ...Array(n).fill(vizLine)].join('\n'))
      rows.push(await measure(page, `hydra-${n}`))
    }
    await page.screenshot({ path: `test-results/b5-heavy-hydra-${process.env.VIZ_WORKER ? 'worker' : 'main'}.png` })

    const pad = (s: string | number, n: number) => String(s).padEnd(n)
    const fix = (n: number, d = 1) => n.toFixed(d)
    // eslint-disable-next-line no-console
    console.log(`\n=== HEAVY HYDRA — ${process.env.VIZ_WORKER ? 'WORKER' : 'MAIN-THREAD'} ===`)
    // eslint-disable-next-line no-console
    console.log(
      pad('scenario', 12) + pad('p5/hy/wk', 10) + pad('minFps', 8) + pad('frameP95', 10) +
        pad('longtask(n/max)', 18) + pad('wkSample', 10) + pad('wkWrite', 9) + pad('hydraDraw', 11) + 'trig/s',
    )
    for (const r of rows) {
      // eslint-disable-next-line no-console
      console.log(
        pad(r.scenario, 12) + pad(`${r.vizP5}/${r.vizHydra}/${r.vizWorker}`, 10) +
          pad(fix(r.minFps), 8) + pad(fix(r.maxP95), 10) +
          pad(`${r.longtasks} / ${fix(r.longtaskMax)}`, 18) +
          pad(fix(r.wkSampleP95, 3), 10) + pad(fix(r.wkWriteP95, 3), 9) +
          pad(fix(r.hydraDrawP95, 2), 11) + fix(r.triggersPerSec),
      )
    }
    // eslint-disable-next-line no-console
    console.log('=== end ===\n')

    expect(rows.length).toBe(4)
    const h4 = rows.find((r) => r.scenario === 'hydra-4')!
    expect(h4.vizHydra + h4.vizWorker).toBeGreaterThanOrEqual(1) // at least one mounted
  })
})
