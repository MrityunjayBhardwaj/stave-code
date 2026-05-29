import { test, expect, type Page } from '@playwright/test'

// Phase G (#197) observation — the History bottom-panel surface.
// Clicking the [data-tab-id="history"] tab opens the drawer + selects History.

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

test('History panel opens and lists the seed commit', async ({ page }) => {
  await page.locator('[data-tab-id="history"]').click()
  const list = page.locator('[data-history-commit-list]')
  await expect(list).toBeVisible({ timeout: 5000 })
  // at least the seed commit (c0) is shown
  const commits = page.locator('[data-history-commit]')
  await expect(commits.first()).toBeVisible()
  expect(await commits.count()).toBeGreaterThan(0)
  // the seed renders with the 'initial' kind label
  await expect(page.locator('[data-bottom-panel-tab="history"]')).toContainText('initial')

  await page.screenshot({ path: '/tmp/history-panel.png' })
})

test('Fork from a commit creates a new branch and switches to it', async ({ page }) => {
  await page.locator('[data-tab-id="history"]').click()
  await expect(page.locator('[data-history-commit-list]')).toBeVisible({ timeout: 5000 })

  // fork the first (seed) commit
  const firstCommit = page.locator('[data-history-commit]').first()
  await firstCommit.locator('[data-history-fork]').click()
  await page.locator('input[placeholder="branch name"]').fill('experiment')
  await page.getByRole('button', { name: 'Create' }).click()
  await page.waitForTimeout(500)

  // the branch selector now offers + selects 'experiment'
  const select = page.locator('[data-history-branch-select]')
  await expect(select).toHaveValue('experiment')
  await expect(select.locator('option', { hasText: 'experiment' })).toHaveCount(1)
})
