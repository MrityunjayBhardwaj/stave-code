import { test, expect, type Page } from '@playwright/test'

// Phase β subset (#204) observation — the read-only "time-travel" reader.
// Clicking View on a commit opens a read-only Monaco editor of the project as
// it was at that commit, with a "⏱ Viewing <id>" frame + Exit.

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

test('View opens a read-only time-travel reader and Exit closes it', async ({ page }) => {
  await page.locator('[data-activity-bar] [aria-label="Version History"]').click()
  await expect(page.locator('[data-history-commit-list]')).toBeVisible({ timeout: 5000 })

  // View the seed (Initial) commit — shows the project at commit 0
  await page.locator('[data-history-commit]').first().locator('[data-history-view]').click()

  const overlay = page.locator('[data-history-view-overlay]')
  await expect(overlay).toBeVisible({ timeout: 5000 })
  await expect(overlay).toContainText('Viewing')
  // a read-only Monaco editor renders the historical content (first line of the
  // seed file is in the viewport)
  await expect(overlay.locator('.monaco-editor')).toBeVisible({ timeout: 5000 })
  await expect(overlay).toContainText('Strudel', { timeout: 5000 })
  // the file picker lists files alive at the commit
  await expect(overlay.locator('[data-history-view-file]')).toBeVisible()

  await page.screenshot({ path: '/tmp/history-view-timetravel.png' })

  // Exit returns to the commit list
  await page.locator('[data-history-view-exit]').click()
  await expect(overlay).toHaveCount(0)
  await expect(page.locator('[data-history-commit-list]')).toBeVisible()
})
