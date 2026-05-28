import { test, expect, type Page } from '@playwright/test'

// Issue #177 — editor tab bar overflows off-screen with no scroll/overflow
// affordance. After the fix the bar should:
//   1. Keep the pinned group-action cluster (split / split-down / close)
//      visible when tabs overflow — they live OUTSIDE the scrollable strip.
//   2. Show a ▾ overflow menu button when tabs overflow; clicking it lists
//      every tab and clicking a list item jumps activation to that tab.
//   3. Scroll the active tab into view when activation changes.

async function wipeShellStateOnce(page: Page): Promise<void> {
  await page.goto('about:blank')
  await page.evaluate(() => {
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('stave:workspace:')) keys.push(k)
      }
      for (const k of keys) localStorage.removeItem(k)
    } catch {
      // private mode etc.
    }
  })
}

async function openManyTabs(page: Page, target: number): Promise<number> {
  const treeItems = page.locator('[data-file-tree-item]')
  const total = await treeItems.count()
  expect(total).toBeGreaterThan(1)
  // Walk the file tree, double-clicking each item to pin it as a tab.
  // Preview-mode tabs reuse the same slot, so double-click promotes them.
  for (let i = 0; i < total; i++) {
    const tabsNow = await page.locator('[data-workspace-tab]').count()
    if (tabsNow >= target) break
    await treeItems.nth(i).dblclick()
  }
  return page.locator('[data-workspace-tab]').count()
}

test.beforeEach(async ({ page }) => {
  await wipeShellStateOnce(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(600)
})

test('pinned group actions stay visible when tabs overflow', async ({ page }) => {
  await openManyTabs(page, 14)
  // At a typical viewport the strip should overflow with 10+ tabs.
  const splitBtn = page.locator('[data-testid^="group-split-"]').first()
  await expect(splitBtn).toBeVisible()
  // Confirm it is in the viewport horizontally (not scrolled off-screen).
  const box = await splitBtn.boundingBox()
  expect(box).not.toBeNull()
  const viewport = page.viewportSize()
  expect(viewport).not.toBeNull()
  if (box && viewport) {
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    expect(box.x).toBeGreaterThanOrEqual(0)
  }
})

test('overflow ▾ menu appears, lists all tabs, and click jumps activation', async ({ page }) => {
  await openManyTabs(page, 14)
  const menuBtn = page.locator('[data-testid^="tab-overflow-menu-"]').first()
  await expect(menuBtn).toBeVisible({ timeout: 4000 })
  await menuBtn.click()
  const list = page.locator('[data-testid^="tab-overflow-list-"]').first()
  await expect(list).toBeVisible()
  const items = list.locator('[data-testid^="tab-overflow-item-"]')
  const itemCount = await items.count()
  const tabCount = await page.locator('[data-workspace-tab]').count()
  expect(itemCount).toBe(tabCount)
  // Pick the last item so the activation must change.
  const lastItem = items.last()
  const itemTabId = await lastItem.getAttribute('data-testid')
  await lastItem.click()
  // Menu closes after pick.
  await expect(list).toBeHidden()
  // Activation jumps to the picked tab.
  const targetId = itemTabId?.replace('tab-overflow-item-', '') ?? ''
  await expect(
    page.locator(`[data-workspace-tab="${targetId}"]`),
  ).toHaveAttribute('data-tab-active', 'true')
})
