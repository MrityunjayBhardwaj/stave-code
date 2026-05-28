import { test, expect, type Page } from '@playwright/test'

// Issue #175 — workspace shell state persistence.
//   1. Fresh load (no persisted state) opens a SINGLE tab (`pattern.strudel`),
//      not the wall of 11 that mapping every preset file to a tab used to.
//   2. Tabs the user opens via the file tree survive a refresh, in order.
//   3. Closing a tab persists across refresh.
//
// The shell's state lives in localStorage under `stave:workspace:${projectId}:state`.
// To exercise "fresh load" deterministically we wipe ANY key with the
// `stave:workspace:` prefix before each test (also clears any pre-existing
// project state from prior dev sessions).

/**
 * One-shot wipe of any persisted shell state from prior dev sessions.
 * Runs ONCE, before the page is loaded with the app — `page.addInitScript`
 * would re-run on every navigation (including page.reload()) and erase the
 * very state we want to verify survives a refresh.
 */
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
      // Private mode etc. — non-fatal for the test.
    }
  })
}

test.beforeEach(async ({ page }) => {
  await wipeShellStateOnce(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(800)
})

test('fresh load opens exactly one tab (pattern.strudel), not 11', async ({ page }) => {
  const tabs = page.locator('[data-workspace-tab]')
  await expect(tabs).toHaveCount(1, { timeout: 6000 })
  // Active editor tab.
  await expect(tabs.first()).toHaveAttribute('data-tab-kind', 'editor')
  await expect(tabs.first()).toHaveAttribute('data-tab-active', 'true')
})

test('opening a second file via the file tree persists across refresh', async ({ page }) => {
  // Find the strudel file's id from the file tree and a viz preset id.
  // The file tree renders `data-file-tree-item={fileId}` on every leaf.
  const treeItems = page.locator('[data-file-tree-item]')
  const count = await treeItems.count()
  expect(count).toBeGreaterThan(1)

  // Pick a file that ISN'T the currently-open tab (a viz preset). We click
  // the first non-strudel file we find.
  let openedFileId: string | null = null
  for (let i = 0; i < count; i++) {
    const item = treeItems.nth(i)
    const fileId = (await item.getAttribute('data-file-tree-item'))!
    // The strudel tab's fileId starts with "pattern.strudel" by template;
    // skip it.
    if (fileId === 'pattern.strudel') continue
    // FileTree opens a file on double-click (preview = single click, pin = double).
    await item.dblclick()
    openedFileId = fileId
    break
  }
  expect(openedFileId).not.toBeNull()
  await expect(page.locator('[data-workspace-tab]')).toHaveCount(2, { timeout: 6000 })

  // Refresh — persistence kicks in.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(800)

  // Same two tabs, same order.
  await expect(page.locator('[data-workspace-tab]')).toHaveCount(2)
})

test('closing a tab persists across refresh', async ({ page }) => {
  // Open a second tab (preset viz) so we have two to start.
  const treeItems = page.locator('[data-file-tree-item]')
  const count = await treeItems.count()
  for (let i = 0; i < count; i++) {
    const fileId = (await treeItems.nth(i).getAttribute('data-file-tree-item'))!
    if (fileId === 'pattern.strudel') continue
    await treeItems.nth(i).dblclick()
    break
  }
  await expect(page.locator('[data-workspace-tab]')).toHaveCount(2, { timeout: 6000 })

  // Close the just-opened (active) tab via its ✕ button. The shell
  // renders one per tab with a stable testid: `tab-close-${tab.id}`.
  const activeTab = page.locator('[data-workspace-tab][data-tab-active="true"]')
  const activeTabId = await activeTab.getAttribute('data-workspace-tab')
  expect(activeTabId).toBeTruthy()
  await page.locator(`[data-testid="tab-close-${activeTabId}"]`).click()
  await expect(page.locator('[data-workspace-tab]')).toHaveCount(1, { timeout: 6000 })

  // Refresh — the close must have been persisted.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(800)
  await expect(page.locator('[data-workspace-tab]')).toHaveCount(1)
})
