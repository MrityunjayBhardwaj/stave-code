/**
 * B-3 (#245) OBSERVATION — does a p5 viz actually RENDER in an OffscreenCanvas
 * worker, in the real app, audio-reactive, with no worker errors? (Lokāyata: the
 * gate is the rendered artifact + trig/s, not "it didn't throw".)
 *
 * Opt-in (set B3_OBS=1) so it doesn't run in normal e2e. Captures worker `diag`
 * errors via the page console (WorkerVizRenderer forwards them through onError →
 * engineLog → console), screenshots the live viz for visual inspection, and
 * checks the `viz.worker` gauge to confirm the worker path was taken.
 *
 * Run: B3_OBS=1 pnpm --filter @stave/app exec playwright test b3-worker-observe.spec.ts --timeout=120000
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function setCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
    if (!e) return false
    e.getModel()?.setValue(c)
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(200)
}

async function stop(page: Page): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Period`)
  await page.waitForTimeout(500)
}

async function run(page: Page): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2500)
}

test.describe('B-3 worker render observation', () => {
  test('p5 viz renders in a worker, audio-reactive', async ({ page }) => {
    test.skip(!process.env.B3_OBS, 'manual observation — set B3_OBS=1')

    const consoleErrors: string[] = []
    const workerDiag: string[] = []
    page.on('console', (m) => {
      const t = m.text()
      if (m.type() === 'error') consoleErrors.push(t)
      if (t.includes('viz worker') || t.includes('[setup]') || t.includes('mounted')) workerDiag.push(t)
    })
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_PERF__ = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_E2E__ = true
      try {
        localStorage.setItem('stave.viz.worker', '1') // force worker rendering
      } catch {
        /* ignore */
      }
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('.monaco-editor').first().waitFor({ timeout: 20000 })
    await page.waitForTimeout(1500)

    // crossOriginIsolated must be true (COOP/COEP) for the worker transport tier.
    const isolated = await page.evaluate(() => self.crossOriginIsolated === true)
    // eslint-disable-next-line no-console
    console.log(`[obs] crossOriginIsolated = ${isolated}`)

    // ── audio + inline scope (raw stave.analyser path — same family as the
    // synthterrain matrix gate) ──
    await stop(page)
    await setCode(page, `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909").viz("scope")`)
    await run(page)

    // The worker path was taken iff the viz.worker gauge is > 0.
    const gauges = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (window as any).__stavePerf?.snapshot?.()
      return s?.gauges ?? {}
    })
    // eslint-disable-next-line no-console
    console.log(`[obs] gauges = ${JSON.stringify(gauges)}`)

    // Screenshot #1, wait, screenshot #2 — different bytes ⟹ animating/reactive.
    await page.screenshot({ path: 'test-results/b3-scope-worker-1.png' })
    await page.waitForTimeout(1200)
    await page.screenshot({ path: 'test-results/b3-scope-worker-2.png' })

    // ── pianoroll (wide stave.scheduler.query window path) ──
    await stop(page)
    await setCode(page, `$: note("c2 eb2 g2 c3 d3 f3").s("sawtooth").viz("pianoroll")`)
    await run(page)
    await page.screenshot({ path: 'test-results/b3-pianoroll-worker.png' })

    // ── Signals (Spectrum) — the BUS path (sig.kick / sig.rms / sig('bd').fft). This is
    // the deferred B-2 live-parity observation: a REAL worker bus driving visible
    // geometry. If the worker bus were wrong, the bars/circle would be static. ──
    await stop(page)
    // SINGLE quotes for the viz id — the transpiler reifies DOUBLE-quoted strings
    // to mini patterns, and "(Spectrum)" then hits a mini parse error (P62).
    await setCode(page, `$: s("bd*4, hh*8").bank("RolandTR909").viz('Signals (Spectrum)')`)
    await run(page)
    await page.screenshot({ path: 'test-results/b3-signals-worker-1.png' })
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'test-results/b3-signals-worker-2.png' })

    // ── fscope (raw getFloatFrequencyData — byte→dB reconstruction path) ──
    await stop(page)
    await setCode(page, `$: s("bd*4, hh*8, ~ sd").bank("RolandTR909").viz("fscope")`)
    await run(page)
    await page.screenshot({ path: 'test-results/b3-fscope-worker.png' })

    // eslint-disable-next-line no-console
    console.log(`[obs] worker diag lines:\n${workerDiag.join('\n')}`)
    // eslint-disable-next-line no-console
    console.log(`[obs] console errors (${consoleErrors.length}):\n${consoleErrors.slice(0, 20).join('\n')}`)

    // Hard assertions: worker path taken, no worker-originated errors.
    expect(gauges['viz.worker'] ?? 0).toBeGreaterThan(0)
    const workerErrors = consoleErrors.filter((e) => /viz worker|OffscreenCanvas|transferControl|worker/i.test(e))
    expect(workerErrors, `worker errors:\n${workerErrors.join('\n')}`).toEqual([])
  })
})
