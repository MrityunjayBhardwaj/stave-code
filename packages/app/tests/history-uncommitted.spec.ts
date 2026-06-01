import { test, expect, type Page } from '@playwright/test'

// #211 — VS Code SCM parity Tier 1.1 + 1.2. The "Uncommitted Changes" section
// at the top of the Version History panel lists files dirty vs HEAD, with a
// live↔HEAD diff, per-row Discard, and selective-file commit (checkboxes).

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

async function openHistory(page: Page): Promise<void> {
  await page.locator('[data-activity-bar] [aria-label="Version History"]').click()
  await page.waitForTimeout(300)
}

async function editLine1(page: Page, text: string): Promise<void> {
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press('Meta+ArrowUp')
  await page.keyboard.press('Home')
  await page.keyboard.type(text)
  await page.waitForTimeout(400) // > the panel's 250ms doc-update debounce
}

test.beforeEach(async ({ page }) => {
  await wipe(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(2000)
})

test('empty state, then a dirty file appears with a count badge, then commit clears it', async ({ page }) => {
  await openHistory(page)

  // clean working tree on first load
  await expect(page.locator('[data-history-uncommitted-empty]')).toBeVisible()
  await expect(page.locator('[data-history-uncommitted-count]')).toHaveCount(0)

  // edit pattern.strudel → it shows up as uncommitted with a count of 1
  await editLine1(page, '// UNCOMMITTED_MARKER_1\n')
  await expect(page.locator('[data-history-uncommitted-list] li')).toHaveCount(1)
  await expect(page.locator('[data-history-uncommitted-count]')).toHaveText('1')
  await expect(page.locator('[data-history-uncommitted-empty]')).toHaveCount(0)

  // commit it (all checked by default) → section returns to empty
  await page.locator('[data-history-commit-now]').click()
  await page.locator('[data-history-commit-label]').fill('captured marker')
  await page.locator('[data-history-commit-save]').click()
  await page.waitForTimeout(600)
  await expect(page.locator('[data-history-uncommitted-empty]')).toBeVisible()
  await expect(page.locator('[data-history-uncommitted-count]')).toHaveCount(0)
})

test('Discard reverts the working file to HEAD without adding a commit', async ({ page }) => {
  await openHistory(page)
  const commitsBefore = await page.locator('[data-history-commit]').count()

  await editLine1(page, '// DISCARD_ME\n')
  expect(await page.locator('.monaco-editor').first().innerText()).toContain('DISCARD_ME')
  const row = page.locator('[data-history-uncommitted-list] li').first()
  await expect(row).toBeVisible()

  // Discard → editor reverts, section empties, NO new commit appended
  await row.locator('[data-history-uncommitted-discard]').click()
  await page.waitForTimeout(600)
  expect(await page.locator('.monaco-editor').first().innerText()).not.toContain('DISCARD_ME')
  await expect(page.locator('[data-history-uncommitted-empty]')).toBeVisible()
  expect(await page.locator('[data-history-commit]').count()).toBe(commitsBefore)
})

test('selective commit: an unchecked file is NOT committed and stays dirty', async ({ page }) => {
  await openHistory(page)

  await editLine1(page, '// SELECTIVE_MARKER\n')
  const row = page.locator('[data-history-uncommitted-list] li').first()
  await expect(row).toBeVisible()

  // uncheck the file, then commit a label-only anchor
  await row.locator('[data-history-uncommitted-check]').uncheck()
  await page.locator('[data-history-commit-now]').click()
  await page.locator('[data-history-commit-label]').fill('anchor without the file')
  await page.locator('[data-history-commit-save]').click()
  await page.waitForTimeout(600)

  // the unchecked file was NOT committed → still in the uncommitted list
  await expect(page.locator('[data-history-uncommitted-list] li')).toHaveCount(1)
  await expect(page.locator('[data-history-uncommitted-count]')).toHaveText('1')
})

test('open diff launches a main-editor tab in "vs current" (live↔HEAD) mode', async ({ page }) => {
  await openHistory(page)
  await editLine1(page, '// DIFF_MARKER\n')
  const row = page.locator('[data-history-uncommitted-list] li').first()
  await row.locator('[data-history-uncommitted-diff]').click()
  await page.waitForTimeout(600)

  // the diff overlay renders in the main editor area, defaulted to "vs current"
  // (its header reads "<head> → current"); the live edit is on the right side.
  const overlay = page.locator('[data-history-diff-overlay]')
  await expect(overlay).toBeVisible()
  await expect(overlay).toContainText('→ current')
  await expect(overlay).toContainText('DIFF_MARKER')
})

test('the uncommitted section is hidden in File History mode', async ({ page }) => {
  await openHistory(page)
  // open a file's history via the file-tree context menu
  await page.locator('[data-activity-bar] [aria-label="Explorer"]').click()
  await page.waitForTimeout(200)
  const fileRow = page.locator('[data-file-tree-item]').first()
  await fileRow.click({ button: 'right' })
  await page.waitForTimeout(150)
  const fileHistory = page.locator('text=File History').first()
  if (await fileHistory.count()) {
    await fileHistory.click()
    await page.waitForTimeout(300)
    await expect(page.locator('[data-history-file-mode]')).toBeVisible()
    await expect(page.locator('[data-history-uncommitted]')).toHaveCount(0)
  }
})
