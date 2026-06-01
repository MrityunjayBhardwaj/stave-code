import { test, expect, type Page } from '@playwright/test'

// Phase D (#193) observation — file-tree history-divergence badges:
//  - per-row dirty dot  [data-file-modified]      when a file ≠ current HEAD
//  - header branch chip [data-file-tree-branch]   when branch ≠ main

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
      } catch {
        /* private mode */
      }
      for (const db of [vizDb, snapDb]) {
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
})

test('editing a file shows the dirty dot in the file tree', async ({ page }) => {
  // clean tree: nothing modified vs the seed commit
  await expect(page.locator('[data-file-modified]')).toHaveCount(0)

  // a small edit to the active file (1 char — below the significance floor, so
  // no auto-commit fires and the dirty state persists for the assertion)
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.type('//x')
  // doc-update debounce (250ms) → modified set recomputes
  await page.waitForTimeout(600)

  const dot = page.locator('[data-file-modified]')
  await expect(dot.first()).toBeVisible()
  expect(await dot.count()).toBeGreaterThan(0)

  await page.screenshot({ path: '/tmp/file-tree-dirty.png' })
})

test('forking to a non-main branch shows the branch chip', async ({ page }) => {
  // no chip on main
  await expect(page.locator('[data-file-tree-branch]')).toHaveCount(0)

  // fork the seed commit → branch "experiment", which switchToBranch activates
  await page.locator('[data-activity-bar] [aria-label="Version History"]').click()
  await expect(page.locator('[data-history-commit-list]')).toBeVisible({ timeout: 5000 })
  await page.locator('[data-history-commit]').first().locator('[data-history-fork]').click()
  await page.locator('input[placeholder="branch name"]').fill('experiment')
  await page.getByRole('button', { name: 'Create' }).click()
  await page.waitForTimeout(600)

  // Explorer + Version History are sibling side panels (mutually exclusive),
  // so switch back to the file tree to see its header chip.
  await page.locator('[data-activity-bar] [aria-label="Explorer"]').click()
  const chip = page.locator('[data-file-tree-branch="experiment"]')
  await expect(chip).toBeVisible()
  await expect(chip).toContainText('experiment')

  await page.screenshot({ path: '/tmp/file-tree-branch.png' })
})
