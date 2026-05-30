import { test, expect, type Page } from '@playwright/test'

// Phase 2 — "File History" action: right-click a file → its commit history in
// the Version History panel (a focused mode, not a panel toggle), with a back
// affordance to the project graph.

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

test('File History action focuses the panel on one file and back returns to the project graph', async ({ page }) => {
  // right-click a file in the tree (Explorer is the default panel)
  const row = page.locator('[data-sidebar]').getByText('pattern.strudel', { exact: true }).first()
  await row.click({ button: 'right' })
  await page.getByText('File History', { exact: true }).click()
  await page.waitForTimeout(400)

  // panel switched to Version History, focused on the file (no project controls)
  const fileMode = page.locator('[data-history-file-mode]')
  await expect(fileMode).toBeVisible({ timeout: 5000 })
  await expect(fileMode).toContainText('pattern.strudel')
  await expect(page.locator('[data-history-branch-select]')).toHaveCount(0)
  // the file's history lists at least the seed (which created the file)
  await expect(page.locator('[data-history-commit]').first()).toBeVisible()

  // back → project graph (branch selector returns, file header gone)
  await page.locator('[data-history-file-back]').click()
  await expect(page.locator('[data-history-branch-select]')).toBeVisible()
  await expect(page.locator('[data-history-file-mode]')).toHaveCount(0)
})
