/**
 * Timeline camera persistence (#501/U4) — Playwright observation spec.
 *
 * The Song view's zoom and expanded-lane state are persisted to localStorage
 * and restored on reload (between sessions). This drives the REAL app:
 *   1. Enter the Song view, zoom in, expand a lane.
 *   2. Reload the page.
 *   3. Re-enter the Song view → the zoom readout and the expanded lane are
 *      both restored from the persisted camera (no console error).
 *
 * Observe, don't infer: we read the live zoom readout + the lane's
 * data-expanded attribute after a real reload, not a unit fake.
 */
import { test, expect, type Page } from '@playwright/test'

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
  await waitForMonaco(page)
}

async function waitForMonaco(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 20_000 },
  )
  // Let the Strudel engine attach before we drive Cmd+Enter — a cold reload
  // can otherwise drop the keystroke (no playback → no snapshot).
  await page.waitForTimeout(800)
}

async function evalStarter(page: Page): Promise<void> {
  // Click the editor for real keyboard focus (the monaco .focus() API alone
  // can race a freshly reloaded page), then evaluate.
  await page.locator('.monaco-editor').first().click()
  await page.evaluate(() => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string } | null
      focus: () => void
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    target?.focus()
  })
  await page.keyboard.press(
    (process.platform === 'darwin' ? 'Meta' : 'Control') + '+Enter',
  )
  await page.waitForTimeout(2200)
}

async function enterSongView(page: Page): Promise<void> {
  const toggle = page.locator('[data-musical-timeline="view-toggle"]')
  await toggle.waitFor({ timeout: 10_000 })
  await toggle.click()
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
}

test('Song camera (zoom + expanded lane) persists across a reload (#501/U4)', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await preOpenDrawer(page)
  await bootShell(page)
  await evalStarter(page)
  await enterSongView(page)

  // (1) Zoom in twice → the readout grows past 100%.
  const zoomReadout = page.locator('[data-full-song-zoom]')
  await page.locator('[data-full-song-zoom-in]').click()
  await page.locator('[data-full-song-zoom-in]').click()
  const zoomedPct = Number(await zoomReadout.getAttribute('data-full-song-zoom'))
  expect(zoomedPct).toBeGreaterThan(100)

  // (2) Expand the first lane via its caret → data-expanded flips true.
  const firstExpand = page.locator('[data-full-song-lane-expand]').first()
  const laneKey = await firstExpand.getAttribute('data-full-song-lane-expand')
  await firstExpand.click()
  await expect(
    page.locator(`[data-full-song-lane-expand="${laneKey}"]`),
  ).toHaveAttribute('aria-pressed', 'true')

  // Let the persist effect flush to localStorage before we reload.
  await page.waitForTimeout(300)

  // (3) Reload — a fresh session reads the camera back from storage only.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await waitForMonaco(page)
  await evalStarter(page)
  await enterSongView(page)

  // (4) Zoom restored: the readout is back above 100% (the persisted value).
  const restoredPct = Number(
    await zoomReadout.getAttribute('data-full-song-zoom'),
  )
  expect(restoredPct).toBe(zoomedPct)

  // (5) Expanded lane restored: the same lane comes back expanded.
  await expect(
    page.locator(`[data-full-song-lane-expand="${laneKey}"]`),
  ).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 })

  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
