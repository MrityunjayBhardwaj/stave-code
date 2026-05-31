import { test, expect, type Page } from '@playwright/test'

// #204 — checkout / runtime-follow time-travel. Clicking a commit's graph dot
// time-travels the editor + runtime to that commit's whole-project snapshot,
// read-only and non-destructively; Exit restores HEAD authority.

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
})

test('clicking a commit dot time-travels the editor (read-only) and Exit restores live', async ({ page }) => {
  // edit pattern.strudel and commit so HEAD differs from the seed. Insert
  // the marker at line 1 so it's always inside Monaco's rendered viewport
  // (the editor virtualizes — a bottom-of-file marker can scroll out of the
  // scraped innerText even when it's in the model).
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press('Meta+ArrowUp')
  await page.keyboard.press('Home')
  await page.keyboard.type('// CHECKOUT_MARKER_7\n')
  await page.waitForTimeout(400)

  await page.locator('[data-activity-bar] [aria-label="Version History"]').click()
  await page.waitForTimeout(300)
  await page.locator('[data-history-commit-now]').click()
  await page.locator('[data-history-commit-label]').fill('with marker')
  await page.locator('[data-history-commit-save]').click()
  await page.waitForTimeout(600)

  // live editor shows the marker
  expect((await page.locator('.monaco-editor').first().innerText())).toContain('CHECKOUT_MARKER_7')

  // check out the seed (oldest row) — its content predates the marker
  await page.locator('[data-history-commit]').last().locator('[data-history-checkout]').click()
  await page.waitForTimeout(900)

  // banner appears; editor shows the historical (marker-free) content, read-only
  await expect(page.locator('[data-editor-timetravel-banner]')).toBeVisible()
  const viewing = await page.locator('.monaco-editor').first().innerText()
  expect(viewing).not.toContain('CHECKOUT_MARKER_7')
  // the checked-out dot is marked
  await expect(page.locator('[data-history-checkout]').last()).toBeVisible()

  // editing is suppressed while viewing (read-only) — type and confirm no write
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press('Meta+ArrowUp')
  await page.keyboard.type('SHOULD_NOT_PERSIST')
  await page.waitForTimeout(300)

  // Exit → banner gone, back to live (line-1 marker present again)
  await page.locator('[data-editor-timetravel-exit]').click()
  await page.waitForTimeout(700)
  await expect(page.locator('[data-editor-timetravel-banner]')).toHaveCount(0)
  const restored = await page.locator('.monaco-editor').first().innerText()
  expect(restored).toContain('CHECKOUT_MARKER_7')
  // the read-only typing never persisted
  expect(restored).not.toContain('SHOULD_NOT_PERSIST')
})
