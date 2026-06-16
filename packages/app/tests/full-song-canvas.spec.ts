/**
 * Full-song view: canvas display rewrite (#419 / #416) — Playwright observation.
 *
 * AnviDev observe gate: timelineScene + drawTimeline unit tests cover the scene
 * merge and the coarsening switchover; FullSongTimeline.test mounts the canvas
 * in jsdom (which has no 2D context). This drives the REAL app to confirm the
 * canvas actually RENDERS against a real evaluated song —
 *   1. The canvas body mounts (the per-cell DOM heatmap is gone).
 *   2. Its backing store is DPR-sized and it draws CONTENT (not a blank fill) —
 *      read back pixels and assert variance beyond the background colour.
 *   3. Zoom + scroll + the #415 follow still drive it, no console errors.
 *   4. Screenshots: fit (coarse density) and zoomed-in (mini-note marks).
 *
 * INPUT NOTE (as the sibling specs): eval reads the FILE STORE, so the analyzed
 * song is the starter example — assertions are generic (canvas present, content
 * drawn, lanes ≥ 1), never a fixed pixel value.
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

/** True if the canvas has drawn content (pixels vary beyond a single flat fill). */
async function canvasHasContent(page: Page): Promise<boolean> {
  return page.locator('[data-full-song-canvas]').evaluate((el) => {
    const canvas = el as HTMLCanvasElement
    const ctx = canvas.getContext('2d')
    if (!ctx || canvas.width === 0 || canvas.height === 0) return false
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    // Sample for any pixel differing from the first — a blank/flat fill has none.
    const r0 = data[0]
    const g0 = data[1]
    const b0 = data[2]
    for (let i = 4; i < data.length; i += 4) {
      if (data[i] !== r0 || data[i + 1] !== g0 || data[i + 2] !== b0) return true
    }
    return false
  })
}

test('full-song view: canvas mounts, draws content, and zoom/scroll drive it', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await preOpenDrawer(page)
  await bootShell(page)
  await evalStrudel(page)

  // Enter the full-song view.
  const toggle = page.locator('[data-musical-timeline="view-toggle"]')
  await toggle.waitFor({ timeout: 10_000 })
  await toggle.click()
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })

  // (1) The canvas body mounted; the old per-cell DOM heatmap is gone.
  const canvas = page.locator('[data-full-song-canvas]')
  await canvas.waitFor({ timeout: 10_000 })
  expect(await page.locator('[data-full-song-cell]').count()).toBe(0)
  expect(await page.locator('[data-full-song-lane]').count()).toBeGreaterThanOrEqual(1)

  // (2) Backing store is DPR-sized and the canvas actually drew content.
  const backing = await canvas.evaluate((el) => ({
    w: (el as HTMLCanvasElement).width,
    h: (el as HTMLCanvasElement).height,
  }))
  expect(backing.w).toBeGreaterThan(0)
  expect(backing.h).toBeGreaterThan(0)
  await expect.poll(() => canvasHasContent(page), { timeout: 5000 }).toBe(true)

  // Screenshot — fit (coarse density across the whole song).
  await page.screenshot({ path: 'test-results/full-song-canvas-fit.png' })

  // (3) Zoom in hard → the canvas redraws (still content, no errors) and the
  //     content overflows the viewport (scrollbar appears).
  for (let i = 0; i < 6; i++) await page.locator('[data-full-song-zoom-in]').click()
  await page.waitForTimeout(120)
  const grid = page.locator('[data-full-song="grid"]')
  const overflow = await grid.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }))
  expect(overflow.sw).toBeGreaterThan(overflow.cw + 50)
  await expect.poll(() => canvasHasContent(page), { timeout: 5000 }).toBe(true)

  // Scroll the grid → canvas redraws the new slice (no error, still content).
  await grid.evaluate((el) => {
    el.scrollLeft = 200
    el.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await page.waitForTimeout(150)
  await expect.poll(() => canvasHasContent(page), { timeout: 5000 }).toBe(true)

  // Screenshot — zoomed in (mini-note marks where a cycle is wide).
  await page.screenshot({ path: 'test-results/full-song-canvas-zoomed.png' })

  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
