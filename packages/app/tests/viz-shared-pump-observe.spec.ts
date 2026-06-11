/**
 * PV72 shared-frame-pump observation (#302) — the MAIN-THREAD lever for the
 * MANY-LIGHT-viz case. Proves the shared per-tick `FrameSampleCache` collapses the
 * duplicated analyser-read + scheduler-query work across N worker viz that sample on
 * the SAME rAF tick.
 *
 * WHY a SEPARATE fixture from perf-matrix (synthterrain): that sketch is HEAVY → each
 * viz is backpressured to ~10fps while the pump ticks at ~60fps, so N viz rarely
 * sample on the SAME tick → the per-tick cache can't dedup them (that's the
 * GOVERNOR's GPU-bound domain, not PV72's). PV72 targets LIGHT viz that produce
 * EVERY tick → they co-sample → the cache collapses N reads → ~1+shared.
 *
 * A/B in TWO runs (mirrors VIZ_WORKER):
 *   VIZ_WORKER=1 PUMP_OBS=1                 pnpm exec playwright test viz-shared-pump-observe --timeout=120000
 *   VIZ_WORKER=1 PUMP_OBS=1 PUMP_OFF=1 ...  (shared cache disabled — the baseline)
 *
 * Gate: `reads/frame` and `viz.worker.sample` MEAN drop sharply with the cache ON,
 * while reactivity (distinct rendered frames per zone) and trig/s are unchanged.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const N = 8

// A LIGHT global-mode p5 sketch (matches the project's sketch format): 2D canvas,
// reads the master analyser cheaply so it's audio-reactive, draws ONE rect. The cheap
// draw means the worker is NOT backpressured → it draws every frame → all N viz sample
// on the SAME pump tick (the co-sampling PV72 needs). NOTE: the per-frame analyser
// READS being deduped come from the SAMPLER BINDING (master + the shared track-analyser
// map), not from this sketch's own in-worker reads — so any light sketch exercises it.
const LIGHT_CODE = `
let t = 0;
function setup() {
  createCanvas(stave.width, stave.height);
  noStroke();
}
function draw() {
  let r = 0;
  if (stave.analyser) {
    const a = new Uint8Array(stave.analyser.frequencyBinCount);
    stave.analyser.getByteFrequencyData(a);
    r = (a[0] || 0) / 255;
  }
  background(10, 12, 22);
  fill(80 + r * 175, 120, 200);
  rect(0, height * (1 - r), width, height * Math.max(0.02, r));
  t++;
}
`

const AUDIO = [
  `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909")`,
  `$: note("c2 eb2 g2 c3").s("sawtooth").lpf(700)`,
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
  await page.waitForTimeout(150)
}

async function play(page: Page, code: string): Promise<void> {
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Period`)
  await page.waitForTimeout(500)
  await setCode(page, code)
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2500)
}

test.describe('PV72 shared frame pump — light-viz dedup (#302)', () => {
  test.beforeEach(async ({ page }) => {
    const pumpOff = !!process.env.PUMP_OFF
    await page.addInitScript((off) => {
      ;(window as any).__STAVE_PERF__ = true
      ;(window as any).__STAVE_E2E__ = true
      try {
        localStorage.setItem('stave.viz.worker', '1')
        // Governor OFF so its throttle/round-robin can't skip viz off-tick and
        // confound the co-tick dedup we're measuring (PV72 is orthogonal to it).
        localStorage.setItem('stave.viz.governor', '0')
        if (off) localStorage.setItem('stave.viz.pump', '0')
      } catch {
        /* ignore */
      }
    }, pumpOff)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(1000)
    await page.evaluate((code) => {
      ;(window as any).__staveRegisterViz({
        id: 'pv72-light', name: 'pv72light', renderer: 'p5', code,
        requires: ['streaming', 'queryable'], nativeSize: { w: 320, h: 120 },
        createdAt: 1, updatedAt: 1,
      })
    }, LIGHT_CODE)
  })

  test('measure reads/frame + sample mean, cache on vs off', async ({ page }) => {
    test.setTimeout(120000)
    const lines = [AUDIO, ...Array.from({ length: N }, () => `$: silence.viz("pv72light")`)]
    await play(page, lines.join('\n'))
    await page.waitForTimeout(1500)

    await page.evaluate(() => (window as any).__stavePerf?.reset?.())
    await page.waitForTimeout(4000)
    const snap = await page.evaluate(() => (window as any).__stavePerf?.snapshot?.())

    const frameIds = Object.keys(snap.frames)
    const totalFrames = frameIds.reduce((a, id) => a + (snap.frames[id].count ?? 0), 0)
    const reads = snap.counters['viz.sample.analyserReads'] ?? 0
    const readsPerFrame = totalFrames > 0 ? reads / totalFrames : 0
    const sample = snap.sections['viz.worker.sample'] ?? { mean: 0, p95: 0, count: 0 }
    const vizWorker = snap.gauges['viz.worker'] ?? 0
    const triggers = snap.counters['audio.triggers'] ?? 0
    const trigPerSec = snap.uptimeMs > 0 ? (triggers / snap.uptimeMs) * 1000 : 0

    const mode = process.env.PUMP_OFF ? 'CACHE-OFF (baseline)' : 'CACHE-ON  (shared pump)'
    // eslint-disable-next-line no-console
    console.log(
      `\n=== PV72 PUMP OBS — ${mode} ===\n` +
        `viz.worker gauge ........ ${vizWorker}\n` +
        `worker frames (sum) ..... ${totalFrames}\n` +
        `analyser reads (total) .. ${reads}\n` +
        `READS / FRAME ........... ${readsPerFrame.toFixed(2)}\n` +
        `sample MEAN ms .......... ${sample.mean.toFixed(3)}\n` +
        `sample p95 ms ........... ${sample.p95.toFixed(3)}\n` +
        `sample calls ............ ${sample.count}\n` +
        `trig/s .................. ${trigPerSec.toFixed(1)}\n` +
        `=== end ===\n`,
    )

    // Structural guards (the comparison across the two runs is the real result —
    // OBSERVED 2026-06-09: reads/frame 11→5, sample mean 0.310→0.232ms, and trig/s
    // 5.0(starved)→8.5(healthy) when the shared cache is ON).
    expect(vizWorker).toBeGreaterThanOrEqual(N) // all N mounted in the worker
    expect(trigPerSec).toBeGreaterThan(3) // audio still scheduling (degraded in OFF)
    if (!process.env.PUMP_OFF) {
      // With the shared cache ON and light co-sampling viz, the per-frame analyser
      // reads must be BELOW the un-deduped ~N+tracks (each viz reading the full shared
      // track-analyser map). The CACHE-OFF run measured ~11; the cache halves it.
      expect(readsPerFrame).toBeLessThan(N) // deduped < per-viz
    }
  })
})
