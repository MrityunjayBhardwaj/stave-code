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

test('the checkout hover icon checks out, and the viewed row swaps to an exit icon (B)', async ({ page }) => {
  // a second commit so there is a non-HEAD target
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press('Meta+ArrowUp'); await page.keyboard.press('Home')
  await page.keyboard.type('// MARK\n')
  await page.waitForTimeout(300)
  await page.locator('[data-activity-bar] [aria-label="Version History"]').click()
  await page.waitForTimeout(300)
  await page.locator('[data-history-commit-now]').click()
  await page.locator('[data-history-commit-label]').fill('cp')
  await page.locator('[data-history-commit-save]').click()
  await page.waitForTimeout(500)

  // every row carries a discoverable checkout icon (the fix for B)
  expect(await page.locator('[data-history-checkout-btn]').count()).toBeGreaterThanOrEqual(2)

  // check out the seed via its hover icon
  const seed = page.locator('[data-history-commit]').last()
  await seed.hover()
  await seed.locator('[data-history-checkout-btn]').click()
  await page.waitForTimeout(800)
  await expect(page.locator('[data-editor-timetravel-banner]')).toBeVisible()
  // the viewed row now offers an EXIT icon, not checkout
  await expect(page.locator('[data-history-checkout-exit]')).toHaveCount(1)

  // the row's exit icon returns to live
  await page.locator('[data-history-checkout-exit]').click()
  await page.waitForTimeout(600)
  await expect(page.locator('[data-editor-timetravel-banner]')).toHaveCount(0)
  await expect(page.locator('[data-history-checkout-exit]')).toHaveCount(0)
})

async function commitSecond(page: import('@playwright/test').Page) {
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press('Meta+ArrowUp'); await page.keyboard.press('Home')
  await page.keyboard.type('// MARK\n')
  await page.waitForTimeout(300)
  await page.locator('[data-activity-bar] [aria-label="Version History"]').click()
  await page.waitForTimeout(300)
  await page.locator('[data-history-commit-now]').click()
  await page.locator('[data-history-commit-label]').fill('cp')
  await page.locator('[data-history-commit-save]').click()
  await page.waitForTimeout(500)
}

test('Fork to edit branches from the viewed commit and exits the view (A)', async ({ page }) => {
  await commitSecond(page)
  await page.locator('[data-history-commit]').last().locator('[data-history-checkout]').click()
  await page.waitForTimeout(800)
  await expect(page.locator('[data-editor-timetravel-fork]')).toBeVisible()
  await page.locator('[data-editor-timetravel-fork]').click()
  await page.waitForTimeout(800)
  // view exited and we are on a fresh edit-* branch
  await expect(page.locator('[data-editor-timetravel-banner]')).toHaveCount(0)
  expect(await page.locator('[data-history-branch-select]').inputValue()).toMatch(/^edit-/)
})

test('checkout is gated in File History mode (C)', async ({ page }) => {
  await commitSecond(page)
  await page.locator('[data-activity-bar] [aria-label="Explorer"]').click()
  await page.waitForTimeout(400)
  await page.locator('[data-sidebar]').getByText('pattern.strudel', { exact: true }).first().click({ button: 'right' })
  await page.waitForTimeout(200)
  await page.getByText('File History', { exact: true }).click()
  await page.waitForTimeout(500)
  await expect(page.locator('[data-history-file-mode]')).toBeVisible()
  await expect(page.locator('[data-history-checkout]')).toHaveCount(0)
  await expect(page.locator('[data-history-checkout-btn]')).toHaveCount(0)
  // file-scoped Restore is still offered
  expect(await page.locator('[data-history-restore]').count()).toBeGreaterThan(0)
})

test('mutating actions are gated while time-travelling (D)', async ({ page }) => {
  await commitSecond(page)
  await page.locator('[data-history-commit]').last().locator('[data-history-checkout]').click()
  await page.waitForTimeout(800)
  await expect(page.locator('[data-history-commit-now]')).toBeDisabled()
  await expect(page.locator('[data-history-branch-select]')).toBeDisabled()
  await expect(page.locator('[data-history-restore]').first()).toBeDisabled()
  await expect(page.locator('[data-history-fork]').first()).toBeDisabled()
  await page.locator('[data-editor-timetravel-exit]').click()
  await page.waitForTimeout(500)
  await expect(page.locator('[data-history-commit-now]')).toBeEnabled()
})
