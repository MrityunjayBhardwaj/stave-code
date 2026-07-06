/**
 * Viz editor chrome bar layout (#773). The bar was consolidated: the ⚙ viz-
 * settings gear replaced the set-bg pill, and the source dropdown moved OFF the
 * bar into the popover. Remaining bar order: ⚙ settings → ↻ live → spacer.
 */
import { test, expect, type Page } from '@playwright/test'

const SHOTS = process.env.CHROME_SHOTS_DIR ?? '/tmp'

async function openVizFile(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 15000 })
  await page.locator('.monaco-editor').waitFor({ timeout: 15000 })
  // Open a bundled .p5 preset via the file tree (bundled p5 fileIds contain "p5").
  const item = page.locator('[data-file-tree-item*="p5"]').first()
  await item.waitFor({ timeout: 10000 })
  await item.dblclick()
  await page.locator('[data-workspace-chrome="viz"]').first().waitFor({ timeout: 10000 })
}

test('bar shows ⚙ settings + ↻ live; source is off the bar (#773)', async ({ page }) => {
  await openVizFile(page)
  const chrome = page.locator('[data-workspace-chrome="viz"]').first()

  // Gear + live present on the bar.
  await expect(chrome.locator('[data-testid="viz-chrome-settings"]')).toHaveCount(1)
  await expect(chrome.locator('[data-testid="viz-chrome-live-toggle"]')).toHaveCount(1)
  // Source dropdown is NOT on the bar anymore (it lives in the popover).
  await expect(chrome.locator('[data-testid="viz-chrome-source"]')).toHaveCount(0)

  // DOM order: settings → live, with the flex spacer trailing (left-aligned).
  const order = await chrome.evaluate((el) => {
    const kids = Array.from(el.children)
    const idxOf = (sel: string) => kids.findIndex((k) => (k as HTMLElement).matches(sel) || k.querySelector(sel) != null)
    const spacerIdx = kids.findIndex(
      (k) => (k as HTMLElement).style.flex === '1' || (k as HTMLElement).style.flexGrow === '1',
    )
    return {
      settings: idxOf('[data-testid="viz-chrome-settings"]'),
      live: idxOf('[data-testid="viz-chrome-live-toggle"]'),
      spacer: spacerIdx,
    }
  })

  expect(order.settings).toBeGreaterThanOrEqual(0)
  expect(order.live).toBeGreaterThan(order.settings)
  expect(order.spacer).toBeGreaterThan(order.live)

  await page.screenshot({ path: `${SHOTS}/viz-chrome-order.png` })
})
