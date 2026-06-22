/**
 * Full-song view — cold-eval gap (#394) Playwright observation spec.
 *
 * Regression for the bug where opening the Song view right after a fresh eval
 * showed an empty "press play" view for ~2.5s (the IR snapshot is published by
 * onEvaluateSuccess, which on a cold eval lags far behind the keypress). The
 * fix has MusicalTimeline ask the editor to capture a snapshot on song-mode
 * entry (onRequestSnapshot → captureAndPublishSnapshot), so the view populates
 * at once — no Live→Song round-trip and no multi-second wait.
 *
 * This drives the WORST case: toggle to Song almost immediately after eval and
 * assert lanes appear within a tight budget. Per the harness's INPUT NOTE
 * (setValue doesn't drive the eval pipeline — the analyzed song is the starter
 * content), assertions are generic (lanes present, no error), not a fixed
 * period. Audio is a manual check (design §10).
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
}

test('Song view populates right after a cold eval — no round-trip, no empty gap', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await preOpenDrawer(page)
  await bootShell(page)

  // Fresh eval, then open the Song view almost immediately (the cold path —
  // before onEvaluateSuccess would publish its snapshot on a slow first eval).
  await evalStrudel(page)
  await page.waitForTimeout(300)

  // Song canvas is the only timeline view now (#497/U5) -- wait for it.
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })

  // The eager on-entry capture means lanes appear quickly, WITHOUT toggling
  // back to Live first. A generous-but-bounded budget keeps this robust on CI
  // while still failing if the old multi-second empty gap regressed.
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 3_000 })
  expect(await page.locator('[data-full-song-lane]').count()).toBeGreaterThanOrEqual(1)
  // Activity is drawn on the canvas now (#419); assert the surface mounted.
  await page.locator('[data-full-song-canvas]').waitFor({ timeout: 3_000 })

  // A loop length / horizon is surfaced (not the misleading "press play").
  const period = await page
    .locator('[data-full-song-period]')
    .getAttribute('data-full-song-period')
  expect(period).toMatch(/loop \d+|\d+\+? cycles/)

  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
