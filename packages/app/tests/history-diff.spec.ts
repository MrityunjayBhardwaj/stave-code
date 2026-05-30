import { test, expect, type Page } from '@playwright/test'

// Phase H (#198) observation — the Monaco diff overlay launched from the
// History panel. Edit → manual commit → Diff that commit (vs previous / vs
// current) and assert the changed line renders in the diff editor.

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

test('Diff overlay shows the changed line for a commit', async ({ page }) => {
  // replace the whole file with a one-line marker. select-all + type is
  // deterministic and keeps the marker at line 1 (Monaco virtualizes off-screen
  // rows, so an edit lower down wouldn't be in the rendered diff DOM)
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('// DIFFMARKER_XYZ')

  // capture it as a manual commit
  await page.locator('[data-tab-id="history"]').click()
  await expect(page.locator('[data-history-commit-list]')).toBeVisible({ timeout: 5000 })
  await page.locator('[data-history-commit-now]').click()
  await page.locator('[data-history-commit-label]').fill('after marker edit')
  await page.locator('[data-history-commit-save]').click()
  await page.waitForTimeout(500)

  // the newest commit (the manual one) is first; open its Diff
  await page.locator('[data-history-commit]').first().locator('[data-history-diff]').click()

  const overlay = page.locator('[data-history-diff-overlay]')
  await expect(overlay).toBeVisible({ timeout: 5000 })
  // the diff editor mounts, the added marker renders on the modified side, and
  // Monaco draws an inserted-line decoration for it
  await expect(overlay.locator('.monaco-diff-editor')).toBeVisible({ timeout: 5000 })
  await expect(overlay).toContainText('DIFFMARKER_XYZ', { timeout: 5000 })
  await expect(overlay.locator('.line-insert').first()).toBeVisible({ timeout: 5000 })

  await page.screenshot({ path: '/tmp/history-diff-previous.png' })

  // switch to "vs current" — still renders (the commit == current now, so no
  // added/removed lines, but the editor stays mounted and visible)
  await page.locator('[data-history-diff-mode="current"]').click()
  await page.waitForTimeout(400)
  await expect(overlay.locator('.monaco-diff-editor')).toBeVisible()

  // close returns to the commit list
  await page.locator('[data-history-diff-close]').click()
  await expect(overlay).toHaveCount(0)
  await expect(page.locator('[data-history-commit-list]')).toBeVisible()
})
