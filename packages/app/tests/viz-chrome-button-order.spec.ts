/**
 * Viz editor chrome: the bg + live toggles sit right after the source dropdown
 * (#733), grouped with the left controls instead of pushed to the far right by a
 * flex spacer. Asserts the DOM sibling order inside the chrome bar and captures a
 * screenshot for a visual check.
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

test('bg + live toggles render right after the source dropdown (#733)', async ({ page }) => {
  await openVizFile(page)
  const chrome = page.locator('[data-workspace-chrome="viz"]').first()

  // All present.
  await expect(chrome.locator('[data-testid="viz-chrome-source"]')).toHaveCount(1)
  await expect(chrome.locator('[data-testid="viz-chrome-bg-toggle"]')).toHaveCount(1)
  await expect(chrome.locator('[data-testid="viz-chrome-live-toggle"]')).toHaveCount(1)

  // DOM order: source → bg → live, and the flex spacer is AFTER live (so the
  // trio is left-grouped, not split to the right edge).
  const order = await chrome.evaluate((el) => {
    const kids = Array.from(el.children)
    const idxOf = (sel: string) => kids.findIndex((k) => (k as HTMLElement).matches(sel) || k.querySelector(sel) != null)
    const spacerIdx = kids.findIndex(
      (k) => (k as HTMLElement).style.flex === '1' || (k as HTMLElement).style.flexGrow === '1',
    )
    return {
      source: idxOf('[data-testid="viz-chrome-source"]'),
      bg: idxOf('[data-testid="viz-chrome-bg-toggle"]'),
      live: idxOf('[data-testid="viz-chrome-live-toggle"]'),
      spacer: spacerIdx,
    }
  })

  expect(order.source).toBeGreaterThanOrEqual(0)
  expect(order.bg).toBeGreaterThan(order.source)
  expect(order.live).toBeGreaterThan(order.bg)
  expect(order.spacer).toBeGreaterThan(order.live) // spacer trails the trio

  await page.screenshot({ path: `${SHOTS}/viz-chrome-order.png` })
})
