/**
 * PHASE C (#258) OBSERVATION — a worker viz that goes off-screen or whose tab is
 * hidden must actually PAUSE: the main-side `sample()` loop stops (so the worker
 * frame loop, fed by it, stops too). Lokāyata gate: the `viz.worker.sample`
 * section's `count` (total samples since reset — uncapped) must FREEZE while
 * paused and RESUME when visible again. The gauge alone can't show this (a paused
 * renderer stays mounted, viz.worker:1).
 *
 * Two triggers, both routing through the same `vizVisibility` → renderer.pause():
 *   1. tab hidden (document.visibilityState) — the background-tab path.
 *   2. scrolled off-screen — the IntersectionObserver path (collapsed/off-screen).
 *
 * Run: PHASE_C=1 pnpm --filter @stave/app exec playwright test phase-c-pause-observe.spec.ts --timeout=200000
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
/** Total `sample()` calls since reset (frozen ⟹ the rAF is paused). */
async function sampleCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).__stavePerf?.snapshot?.()
    return s?.sections?.['viz.worker.sample']?.count ?? -1
  })
}
async function gauges(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).__stavePerf?.snapshot?.()?.gauges ?? {}
  })
}
/** Did `viz.worker.sample` advance over `ms`? */
async function advancedOver(page: Page, ms: number): Promise<{ before: number; after: number; advanced: boolean }> {
  const before = await sampleCount(page)
  await page.waitForTimeout(ms)
  const after = await sampleCount(page)
  return { before, after, advanced: after > before }
}

test.describe('Phase C — off-screen / hidden viz pauses (#258)', () => {
  test.skip(!process.env.PHASE_C, 'observation — set PHASE_C=1')

  test('hidden tab pauses the worker sample loop; visible resumes it', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_PERF__ = true; (window as any).__STAVE_E2E__ = true
      try { localStorage.setItem('stave.viz.worker', '1') } catch { /* */ }
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
    await page.waitForTimeout(1500)

    await stop(page)
    await setCode(page, `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909").viz('scope')`)
    await run(page)

    expect((await gauges(page))['viz.worker'] ?? 0, 'worker viz mounted').toBeGreaterThan(0)

    // Running on-screen + visible → sample count advances.
    const live = await advancedOver(page, 1000)
    // eslint-disable-next-line no-console
    console.log(`[phase-c visible] sample ${live.before} → ${live.after} (advanced=${live.advanced})`)
    expect(live.advanced, 'sample loop runs while visible+on-screen').toBe(true)

    // Hide the tab (the bg-tab path) → vizVisibility pauses → sample loop stops.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(400)
    const hidden = await advancedOver(page, 1200)
    // eslint-disable-next-line no-console
    console.log(`[phase-c hidden] sample ${hidden.before} → ${hidden.after} (advanced=${hidden.advanced})`)
    expect(hidden.advanced, 'sample loop FROZEN while tab hidden').toBe(false)
    expect((await gauges(page))['viz.worker'] ?? 0, 'still mounted (paused, not destroyed)').toBeGreaterThan(0)

    // Show the tab → resume → sample loop advances again.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(400)
    const shown = await advancedOver(page, 1000)
    // eslint-disable-next-line no-console
    console.log(`[phase-c shown] sample ${shown.before} → ${shown.after} (advanced=${shown.advanced})`)
    expect(shown.advanced, 'sample loop RESUMES when tab visible').toBe(true)

    expect(errors.filter((e) => /worker|render|pause|resume/i.test(e))).toEqual([])
  })

  test('scrolling the inline viz off-screen pauses it; scrolling back resumes', async ({ page }) => {
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_PERF__ = true; (window as any).__STAVE_E2E__ = true
      try { localStorage.setItem('stave.viz.worker', '1') } catch { /* */ }
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
    await page.waitForTimeout(1500)

    // Pattern on line 1 (zone renders just below it), then many blank lines so the
    // editor scrolls and the zone can leave the viewport.
    const pad = '\n'.repeat(120)
    await stop(page)
    await setCode(page, `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909").viz('scope')${pad}`)
    await run(page)
    expect((await gauges(page))['viz.worker'] ?? 0).toBeGreaterThan(0)

    const live = await advancedOver(page, 1000)
    expect(live.advanced, 'runs while the zone is in view').toBe(true)

    // Scroll the editor down so the top zone leaves the viewport.
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
      e?.setScrollTop(4000)
    })
    await page.waitForTimeout(600)
    const off = await advancedOver(page, 1200)
    // eslint-disable-next-line no-console
    console.log(`[phase-c off-screen] sample ${off.before} → ${off.after} (advanced=${off.advanced})`)
    expect(off.advanced, 'sample loop FROZEN while the zone is scrolled off-screen').toBe(false)

    // Scroll back to the top → the zone re-enters the viewport → resume.
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
      e?.setScrollTop(0)
    })
    await page.waitForTimeout(600)
    const back = await advancedOver(page, 1000)
    // eslint-disable-next-line no-console
    console.log(`[phase-c back] sample ${back.before} → ${back.after} (advanced=${back.advanced})`)
    expect(back.advanced, 'sample loop RESUMES when the zone is back in view').toBe(true)
  })
})
