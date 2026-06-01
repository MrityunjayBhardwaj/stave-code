import { test, expect, type Page } from '@playwright/test'

// Phase G (#197) observation — the History bottom-panel surface.
// Clicking the [data-activity-bar] [aria-label="Version History"] tab opens the drawer + selects History.

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
  await page.locator('[data-activity-bar] [aria-label="Version History"]').click()
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

test('Commit now creates a labelled manual checkpoint (allowEmpty anchor)', async ({ page }) => {
  await page.locator('[data-activity-bar] [aria-label="Version History"]').click()
  await expect(page.locator('[data-history-commit-list]')).toBeVisible({ timeout: 5000 })

  const before = await page.locator('[data-history-commit]').count()

  // open the inline label input; Save is disabled until a non-empty label
  await page.locator('[data-history-commit-now]').click()
  const label = page.locator('[data-history-commit-label]')
  await expect(label).toBeVisible()
  await expect(page.locator('[data-history-commit-save]')).toBeDisabled()

  // no edits made since seed — this exercises the allowEmpty named-anchor path
  await label.fill('v1 demo state')
  await page.locator('[data-history-commit-save]').click()
  await page.waitForTimeout(500)

  // a new commit row appears, rendered as a 'saved' (manual) checkpoint
  const after = page.locator('[data-history-commit]')
  expect(await after.count()).toBe(before + 1)
  const panel = page.locator('[data-bottom-panel-tab="history"]')
  await expect(panel).toContainText('v1 demo state')
  await expect(panel).toContainText('saved')

  await page.screenshot({ path: '/tmp/history-manual-commit.png' })
})

test('manual-checkpoint nudge appears past the threshold and dismisses (#207)', async ({ page }) => {
  // lower the soft-nudge threshold to 1 so two checkpoints trip it
  await page.evaluate(() => localStorage.setItem('stave:manualNudgeThreshold', '1'))

  await page.locator('[data-activity-bar] [aria-label="Version History"]').click()
  await expect(page.locator('[data-history-commit-list]')).toBeVisible({ timeout: 5000 })
  await expect(page.locator('[data-history-manual-nudge]')).toHaveCount(0)

  // create two manual checkpoints (allowEmpty anchors — no edits needed)
  for (const label of ['checkpoint a', 'checkpoint b']) {
    await page.locator('[data-history-commit-now]').click()
    await page.locator('[data-history-commit-label]').fill(label)
    await page.locator('[data-history-commit-save]').click()
    await page.waitForTimeout(300)
  }

  // count (2) > threshold (1) → the no-evict nudge surfaces
  const nudge = page.locator('[data-history-manual-nudge]')
  await expect(nudge).toBeVisible({ timeout: 5000 })
  await expect(nudge).toContainText('2 saved checkpoints')
  await expect(nudge).toContainText('never auto-pruned')
  await page.screenshot({ path: '/tmp/history-manual-nudge.png' })

  // dismiss is non-destructive — banner gone, commits remain
  await page.locator('[data-history-nudge-dismiss]').click()
  await expect(nudge).toHaveCount(0)
  expect(await page.locator('[data-history-commit]').count()).toBeGreaterThanOrEqual(3) // seed + 2
})

test('Fork from a commit creates a new branch and switches to it', async ({ page }) => {
  await page.locator('[data-activity-bar] [aria-label="Version History"]').click()
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
