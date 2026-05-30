import { test, expect, type Page } from '@playwright/test'

// #210 — Diff / time-travel View open as tabs in the MAIN editor area (not a
// cramped sidebar overlay). They reuse a single italic preview slot (swapped
// by the next open) and promote to a pinned tab on double-click — the same UX
// as opening a file in preview.

const VIZ_DB = 'stave-viz-presets'
const SNAP_DB = 'stave-snapshots'

async function wipe(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    async ({ vizDb, snapDb }) => {
      try {
        const keys: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (k && k.startsWith('stave:')) keys.push(k)
        }
        for (const k of keys) localStorage.removeItem(k)
      } catch { /* private mode */ }
      for (const db of [vizDb, snapDb, 'stave-projects']) {
        await new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(db)
          req.onsuccess = req.onerror = req.onblocked = () => resolve()
        })
      }
    },
    { vizDb: VIZ_DB, snapDb: SNAP_DB },
  )
}

test.beforeEach(async ({ page }) => {
  await wipe(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(2000)
  await page.locator('[data-activity-bar] [aria-label="Version History"]').click()
  await page.locator('[data-history-commit-list]').waitFor({ timeout: 5000 })
  // expand the seed so its changed files are listed
  await page.locator('[data-history-commit-toggle]').first().click()
  await page.locator('[data-history-commit-files] [data-history-file-diff]').first().waitFor()
})

const histTab = '[data-workspace-tab][data-tab-kind="history"]'

test('clicking a file in a commit opens a Diff tab in the main editor', async ({ page }) => {
  await page.locator('[data-history-commit-files] [data-history-file-diff]').first().click()
  const tab = page.locator(histTab)
  await expect(tab).toHaveCount(1)
  // it's a preview (italic) slot, and the diff renders in the main editor area
  await expect(tab).toHaveAttribute('data-tab-preview', 'true')
  await expect(page.locator('[data-history-diff-overlay]')).toBeVisible()
})

test('a second file reuses the same slot (swaps) instead of stacking tabs', async ({ page }) => {
  const files = page.locator('[data-history-commit-files] [data-history-file-diff]')
  await files.nth(0).click()
  await page.waitForTimeout(400)
  const before = await page.locator('[data-history-diff-file]').inputValue()
  await files.nth(1).click()
  await page.waitForTimeout(500)
  // still ONE history tab, but the diff now targets a different file
  await expect(page.locator(histTab)).toHaveCount(1)
  const after = await page.locator('[data-history-diff-file]').inputValue()
  expect(after).not.toBe(before)
})

test('double-clicking the history tab promotes it (pinned); a new diff then opens a second tab', async ({ page }) => {
  const files = page.locator('[data-history-commit-files] [data-history-file-diff]')
  await files.nth(0).click()
  const tab = page.locator(histTab)
  await expect(tab).toHaveAttribute('data-tab-preview', 'true')
  await tab.dblclick()
  await expect(tab).toHaveAttribute('data-tab-preview', 'false')
  // a diff of another file opens a NEW preview tab — the pinned diff survives
  await files.nth(1).click()
  await expect(page.locator(histTab)).toHaveCount(2)
})
