/**
 * #257 — a per-frame draw() throw in a WORKER viz must be SURFACED (throttled),
 * not silently swallowed. p5's redraw() is async, so a user-draw throw rejects a
 * promise the host's synchronous catch can't see; before the fix the canvas just
 * went blank with zero feedback. The host now forwards the throw as a worker
 * `diag` error (→ WorkerVizRenderer.diagHandler → console.error / onError),
 * throttled to once per unique error so a throw-every-frame sketch reports once.
 *
 * OBSERVATION (Lokāyata): drive a sketch that throws every frame, count the
 * surfaced errors over a multi-second window — must be ≥1 (surfaced) and small
 * (throttled, NOT one-per-frame), with NO fallback to main (post-ready, correct).
 *
 * Run: E2E_VERIFY=1 pnpm --filter @stave/app exec playwright test worker-draw-error.spec.ts --timeout=120000
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

// draw() throws every frame: `stave.fft` is undefined (the bus DSP is `sig.fft`),
// so `.length` is a TypeError — the exact wrong-namespace typo from the issue.
// background() runs first (one statement paints), then the throw aborts the rest.
const THROWING = `function setup(){ createCanvas(stave.width, stave.height) }
function draw(){
  background(20, 10, 30)
  const n = stave.fft.length // TypeError every frame — stave.fft is undefined
  circle(n, n, 10)
}`

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
async function press(page: Page, key: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(key)
}

test.describe('#257 worker viz draw() error surfacing', () => {
  test('a per-frame draw() throw is surfaced once (throttled), no silent blank', async ({ page }) => {
    test.skip(!process.env.E2E_VERIFY, 'acceptance gate — set E2E_VERIFY=1')

    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_PERF__ = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_E2E__ = true
      try {
        localStorage.setItem('stave.viz.worker', '1') // force the worker path
      } catch { /* ignore */ }
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
    await page.waitForTimeout(1200)
    await page.evaluate((code) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__staveRegisterViz?.({
        id: 'throwviz', name: 'throwviz', renderer: 'p5', code,
        requires: ['streaming'], nativeSize: { w: 600, h: 200 }, createdAt: 1, updatedAt: 1,
      })
    }, THROWING)

    await press(page, `${MOD}+Period`)
    await page.waitForTimeout(400)
    await setCode(page, `$: s("bd*4, hh*8").bank("RolandTR909").viz('throwviz')`)
    await press(page, `${MOD}+Enter`)
    // Let many frames run (the sketch throws on each) so an UNthrottled bug would
    // pile up dozens of errors and a SWALLOWED bug would log zero.
    await page.waitForTimeout(5000)

    const obs = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      const s = w.__stavePerf?.snapshot?.()
      const log: Array<{ level: string; runtime: string; message: string }> = w.__staveGetLog?.() ?? []
      const drawErrors = log.filter(
        (e) => e.level === 'error' && e.runtime === 'p5' && e.message.includes('draw('),
      )
      return {
        worker: s?.gauges?.['viz.worker'] ?? 0,
        p5: s?.gauges?.['viz.p5'] ?? 0,
        drawErrorCount: drawErrors.length,
        first: drawErrors[0]?.message ?? '',
        totalErrors: log.filter((e) => e.level === 'error').length,
      }
    })
    // eslint-disable-next-line no-console
    console.log(
      `\n[#257] p5 draw errors in engineLog=${obs.drawErrorCount} (total errors ${obs.totalErrors}) · ` +
      `viz.worker=${obs.worker} viz.p5=${obs.p5}\n[#257]   first: ${obs.first.slice(0, 120)}`,
    )

    // The worker path was taken and did NOT fall back (post-ready user error, PK23) —
    // re-emit goes to engineLog, NOT onError, so the worker viz is not torn down.
    expect(obs.worker, 'worker path taken').toBeGreaterThan(0)
    expect(obs.p5, 'no fallback to main (post-ready error surfaced, not fatal)').toBe(0)
    // SURFACED into the MAIN engineLog (the fix) — before #257 this was 0 (the
    // worker-local log was never wired to the main Console/issues panel).
    expect(obs.drawErrorCount, 'draw() throw surfaced in the main engineLog').toBeGreaterThanOrEqual(1)
    // THROTTLED — a single unique error, not one row per frame (5s × ≥15fps = 75+).
    expect(obs.drawErrorCount, 'deduped to ~once per unique error, not per-frame').toBeLessThanOrEqual(3)
  })
})
