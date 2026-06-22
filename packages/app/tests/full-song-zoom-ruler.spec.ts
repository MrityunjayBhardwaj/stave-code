/**
 * Full-song zoom + bars/beats ruler (#412) — Playwright observation spec.
 *
 * AnviDev observe gate: songAxis.test.ts covers the zoom/tick math and
 * FullSongTimeline.test.tsx covers the controls in jsdom; this drives the REAL
 * app to confirm the end-to-end behaviour against a real evaluated song —
 *   1. Zoom controls render (Fit / − / readout / +) in the song view.
 *   2. The + button widens the heatmap past the viewport (a horizontal
 *      scrollbar appears: scrollWidth > clientWidth) and the readout grows.
 *   3. Scrolling the grid drives the ruler content (shared scrollLeft).
 *   4. Fit returns to 100% and refits to the viewport.
 *   5. The CYCLES↔BARS toggle adds beat ticks (bars mode).
 *   6. No console / page errors throughout.
 *
 * ⌘/Ctrl+wheel zoom shares the same `applyZoom` path as the buttons (unit-
 * tested via scrollLeftForZoom); the buttons exercise it deterministically here.
 *
 * INPUT NOTE (same as full-song-timeline.spec.ts): the eval reads the file
 * store, so the analyzed song is the starter example — assertions are generic.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

const STORAGE_KEYS = {
  height: 'stave:bottomPanel.height',
  open: 'stave:bottomPanel.open',
  activeTabId: 'stave:bottomPanel.activeTabId',
} as const

async function preOpenDrawer(page: Page): Promise<void> {
  await page.addInitScript(
    ([heightKey, openKey, activeKey]: readonly string[]) => {
      try {
        window.localStorage.setItem(heightKey, '320')
        window.localStorage.setItem(openKey, 'true')
        window.localStorage.setItem(activeKey, 'musical-timeline')
      } catch {
        /* ignore */
      }
    },
    [STORAGE_KEYS.height, STORAGE_KEYS.open, STORAGE_KEYS.activeTabId],
  )
}

async function bootShell(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 20_000 },
  )
}

async function evalStrudel(page: Page): Promise<void> {
  await page.evaluate(() => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string } | null
      focus: () => void
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    target?.focus()
  })
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1800)
}

test('full-song view: zoom widens + scrolls, Fit refits, bars toggle adds beat ticks', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await preOpenDrawer(page)
  await bootShell(page)
  await evalStrudel(page)

  // Enter the full-song view.
  // Song canvas is the only timeline view now (#497/U5) -- wait for it.
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })

  const grid = page.locator('[data-full-song="grid"]')
  const zoomCluster = page.locator('[data-full-song-zoom]')

  // (1) Controls present at 100%, fit at the viewport (no horizontal overflow).
  expect(await zoomCluster.getAttribute('data-full-song-zoom')).toBe('100')
  const fitMetrics = await grid.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }))
  // At zoom 1 the content fits within ~1px of the viewport.
  expect(fitMetrics.scrollWidth).toBeLessThanOrEqual(fitMetrics.clientWidth + 1)

  // (2) Zoom in twice → readout grows and the content overflows the viewport.
  await page.locator('[data-full-song-zoom-in]').click()
  await page.locator('[data-full-song-zoom-in]').click()
  const zoomed = await zoomCluster.getAttribute('data-full-song-zoom')
  expect(Number(zoomed)).toBeGreaterThan(100) // 1.5×1.5 = 225
  const zoomedMetrics = await grid.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }))
  expect(zoomedMetrics.scrollWidth).toBeGreaterThan(zoomedMetrics.clientWidth + 10)

  // (3) Scrolling the grid drives the ruler content (shared scrollLeft).
  await grid.evaluate((el) => {
    el.scrollLeft = 80
    el.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await page.waitForTimeout(120)
  const rulerTransform = await page
    .locator('[data-full-song="ruler-content"]')
    .evaluate((el) => (el as HTMLElement).style.transform)
  expect(rulerTransform).toContain('translateX(-80px)')

  // (4) Fit returns to 100% and refits to the viewport.
  await page.locator('[data-full-song-zoom-fit]').click()
  expect(await zoomCluster.getAttribute('data-full-song-zoom')).toBe('100')
  const refit = await grid.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    scrollLeft: el.scrollLeft,
  }))
  expect(refit.scrollWidth).toBeLessThanOrEqual(refit.clientWidth + 1)
  expect(refit.scrollLeft).toBe(0)

  // (4b) ⌘/Ctrl + wheel zooms via the native non-passive listener (the unique
  //      glue the buttons don't exercise: preventDefault + cursor-x).
  const box = await grid.boundingBox()
  if (box) {
    await page.keyboard.down(MOD)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -120) // wheel up → zoom in
    await page.keyboard.up(MOD)
    await page.waitForTimeout(120)
    expect(Number(await zoomCluster.getAttribute('data-full-song-zoom'))).toBeGreaterThan(100)
    await page.locator('[data-full-song-zoom-fit]').click() // reset for the bars step
  }

  // (5) Bars toggle adds beat ticks (zoom in first so beats clear the px floor).
  await page.locator('[data-full-song-zoom-in]').click()
  await page.locator('[data-full-song-zoom-in]').click()
  const unitsToggle = page.locator('[data-full-song-units-toggle]')
  expect(await unitsToggle.textContent()).toBe('CYCLES')
  await unitsToggle.click()
  expect(await unitsToggle.textContent()).toBe('BARS')
  expect(await page.locator('[data-full-song-tick="beat"]').count()).toBeGreaterThan(0)

  // Visual evidence (observe, don't infer).
  await page.screenshot({ path: 'test-results/full-song-zoom-bars.png' })

  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
