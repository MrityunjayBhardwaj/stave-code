import { test, expect, type Page } from '@playwright/test'

/**
 * #1368 — the status bar is gone, and the one thing in it that wasn't a
 * duplicate moved to the activity bar.
 *
 * The bar's project name, file path, transport readout and undo/redo pictures
 * were all second copies of something already on screen. Its console chip was
 * not: errors also raise a toast that auto-dismisses in ~4s, but a WARNING has
 * no transient surface at all, so the unread count is the only standing signal
 * a warning ever gets.
 *
 * The count is driven by a REAL evaluation failure rather than a seeded store —
 * a badge that only lights when a test pushes a number into it proves nothing
 * about whether the engine's own errors reach it.
 */

test.use({ viewport: { width: 1400, height: 1000 } })

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    ;(window as any).__STAVE_E2E__ = true // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      localStorage.setItem('stave:bottomPanel.open', 'false')
      localStorage.setItem('stave.viz.worker', '0')
    } catch { /* private mode */ }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 20000 })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(800)
}

const consoleBadge = (page: Page) => page.locator('[data-panel-badge="console"]')

test.beforeEach(async ({ page }) => {
  await boot(page)
})

test('the status bar is gone', async ({ page }) => {
  await expect(page.locator('[data-stave-statusbar]')).toHaveCount(0)
  // ...and the shell it used to sit under still renders.
  await expect(page.locator('[data-workspace-shell="root"]')).toBeVisible()
  await expect(page.locator('[data-activity-bar]')).toBeVisible()
})

test('an engine error raises the Console badge, and opening the Console clears it', async ({ page }) => {
  await expect(consoleBadge(page), 'no unread work on a clean boot').toHaveCount(0)

  // A real failure: a method that does not exist throws during evaluation.
  await page.evaluate(() => {
    ;(window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()  // eslint-disable-line @typescript-eslint/no-explicit-any
      ?.setValue('s("bd").thisMethodDoesNotExist()')
  })
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${MOD}+Enter`)

  await expect(consoleBadge(page)).toBeVisible({ timeout: 15000 })
  const count = Number(await consoleBadge(page).innerText())
  expect(count).toBeGreaterThan(0)
  // An error outranks warnings, so the badge must read as a failure.
  await expect(consoleBadge(page)).toHaveAttribute('data-badge-tone', 'danger')
  // The button's own tooltip says what is waiting.
  await expect(page.locator('[data-activity-bar] [data-panel-id="console"]'))
    .toHaveAttribute('title', /error/)

  // Opening the panel is what marks the work as seen.
  await page.locator('[data-activity-bar] [data-panel-id="console"]').click()
  await expect(page.locator('[data-testid="console-panel"]')).toBeVisible()
  await expect(consoleBadge(page)).toHaveCount(0)
})
