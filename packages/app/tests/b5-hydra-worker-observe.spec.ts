/**
 * B-5 (#250) OBSERVATION — does a USER `.hydra` viz actually RENDER in an
 * OffscreenCanvas worker, audio-reactive, with no worker errors AND without
 * falling back to the main thread? (Lokāyata: the gate is the rendered artifact +
 * the worker gauge, not "it compiled".)
 *
 * Build-level bundling (hydra-synth in the worker chunk) is verified by `next
 * build`; this is the RUNTIME gate — the B-3 i18n bug compiled fine yet threw at
 * import, so presence ≠ render. Confirms the hydra 2-condition worker shim + the
 * `new Hydra({canvas})` direct-render path work against the BUNDLED hydra-synth.
 *
 * Run: B5_OBS=1 pnpm --filter @stave/app exec playwright test b5-hydra-worker-observe.spec.ts --timeout=120000
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

// A small audio-reactive hydra sketch (runs as `new Function('s','stave', code)`):
// `s` = the hydra synth, `s.a.fft[]` = the master-mix bins the worker downsamples
// from the transported analyser bytes. Animates regardless of audio (time-driven
// osc) AND reacts to the bins — so a static frame ⟹ the feed is dead.
const HYDRA_CODE = `s.osc(20, 0.1, () => s.a.fft[0] * 6)
  .color(0.4, 0.7, 1.0)
  .rotate(() => s.a.fft[1] * 3.14)
  .modulate(s.noise(2, 0.5), () => 0.08 + s.a.fft[2] * 0.3)
  .out()`

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

test.describe('B-5 hydra worker render observation', () => {
  test('user .hydra viz renders in a worker, audio-reactive, no fallback', async ({ page }) => {
    test.skip(!process.env.B5_OBS, 'manual observation — set B5_OBS=1')

    const consoleErrors: string[] = []
    const workerDiag: string[] = []
    const fallbackWarnings: string[] = []
    page.on('console', (m) => {
      const t = m.text()
      if (m.type() === 'error') consoleErrors.push(t)
      if (t.includes('falling back to the main thread')) fallbackWarnings.push(t)
      if (t.includes('viz worker') || t.includes('mounted') || t.includes('hydra')) workerDiag.push(t)
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

    const isolated = await page.evaluate(() => self.crossOriginIsolated === true)
    // eslint-disable-next-line no-console
    console.log(`[obs] crossOriginIsolated = ${isolated}`)

    // Register a USER hydra viz (renderer:'hydra' → compilePreset → makeHydraRenderer).
    const registered = await page.evaluate((code) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__staveRegisterViz?.({
        id: 'b5-whydra', name: 'whydra', renderer: 'hydra', code,
        requires: ['audio'], nativeSize: { w: 600, h: 400 },
        createdAt: 1, updatedAt: 1,
      }) ?? false
    }, HYDRA_CODE)
    // eslint-disable-next-line no-console
    console.log(`[obs] hydra viz registered = ${registered}`)
    expect(registered).toBe(true)

    // Inline hydra on a live audio pattern (so a real analyser feeds s.a.fft).
    await stop(page)
    await setCode(page, `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909").viz('whydra')`)
    await run(page)
    await page.waitForTimeout(1500)

    const gauges = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (window as any).__stavePerf?.snapshot?.()
      return s?.gauges ?? {}
    })
    // eslint-disable-next-line no-console
    console.log(`[obs] gauges = ${JSON.stringify(gauges)}`)

    await page.screenshot({ path: 'test-results/b5-hydra-worker-1.png' })
    await page.waitForTimeout(1200)
    await page.screenshot({ path: 'test-results/b5-hydra-worker-2.png' })

    // eslint-disable-next-line no-console
    console.log(`[obs] worker diag:\n${workerDiag.join('\n')}`)
    // eslint-disable-next-line no-console
    console.log(`[obs] console errors (${consoleErrors.length}):\n${consoleErrors.slice(0, 20).join('\n')}`)
    // eslint-disable-next-line no-console
    console.log(`[obs] fallback warnings: ${fallbackWarnings.length}`)

    // Worker HYDRA path was taken (viz.worker gauge) and did NOT fall back to the
    // main-thread HydraVizRenderer (viz.hydra would be > 0 if it had).
    expect(gauges['viz.worker'] ?? 0, 'worker renderer must have mounted').toBeGreaterThan(0)
    expect(gauges['viz.hydra'] ?? 0, 'must NOT have fallen back to main-thread hydra').toBe(0)
    expect(fallbackWarnings, `unexpected fallback:\n${fallbackWarnings.join('\n')}`).toEqual([])
    const workerErrors = consoleErrors.filter((e) => /viz worker|OffscreenCanvas|hydra|worker/i.test(e))
    expect(workerErrors, `worker errors:\n${workerErrors.join('\n')}`).toEqual([])
  })

  test('BUILT-IN hydra preset renders in a worker, no fallback (#252)', async ({ page }) => {
    test.skip(!process.env.B5_OBS, 'manual observation — set B5_OBS=1')

    const consoleErrors: string[] = []
    const fallbackWarnings: string[] = []
    page.on('console', (m) => {
      const t = m.text()
      if (m.type() === 'error') consoleErrors.push(t)
      if (t.includes('falling back to the main thread')) fallbackWarnings.push(t)
    })
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_PERF__ = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_E2E__ = true
      try {
        localStorage.setItem('stave.viz.worker', '1')
      } catch {
        /* ignore */
      }
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('.monaco-editor').first().waitFor({ timeout: 20000 })
    await page.waitForTimeout(1500)

    // No registration — kaleidoscope:hydra is a BUILT-IN descriptor, now routed
    // through makeHydraRenderer (code-string, worker-capable) per #252.
    await stop(page)
    await setCode(page, `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909").viz('kaleidoscope:hydra')`)
    await run(page)
    await page.waitForTimeout(1500)

    const gauges = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (window as any).__stavePerf?.snapshot?.()
      return s?.gauges ?? {}
    })
    // eslint-disable-next-line no-console
    console.log(`[obs builtin] gauges = ${JSON.stringify(gauges)}`)
    await page.screenshot({ path: 'test-results/b5-builtin-kaleid-worker.png' })

    expect(gauges['viz.worker'] ?? 0, 'built-in hydra must mount in the worker').toBeGreaterThan(0)
    expect(gauges['viz.hydra'] ?? 0, 'must NOT have fallen back to main-thread hydra').toBe(0)
    expect(fallbackWarnings, `unexpected fallback:\n${fallbackWarnings.join('\n')}`).toEqual([])
    const workerErrors = consoleErrors.filter((e) => /viz worker|OffscreenCanvas|hydra|worker/i.test(e))
    expect(workerErrors, `worker errors:\n${workerErrors.join('\n')}`).toEqual([])
  })
})
