import { test, expect } from '@playwright/test'

// #348/#347 menubar restructure: the backdrop bg-indicator and the top-right
// corner icons (Docs / GitHub / Sign in) + settings gear are removed. Editor
// Settings + Keyboard Shortcuts move under File; a new Help menu carries
// Documentation + GitHub Repository.

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 15000 })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
})

test('top-right icons and the bg-indicator are gone', async ({ page }) => {
  await expect(page.locator('[data-stave-corner-item]')).toHaveCount(0)
  await expect(page.locator('[data-stave-corner]')).toHaveCount(0)
  await expect(page.locator('[data-testid="menubar-bg-indicator"]')).toHaveCount(0)
})

test('Editor Settings + Keyboard Shortcuts live under the File menu', async ({ page }) => {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await expect(page.getByText('Editor Settings...')).toBeVisible()
  await expect(page.getByText('Keyboard Shortcuts...')).toBeVisible()
  // It opens the unified settings shell (#739) on the Settings tab.
  await page.getByText('Editor Settings...').click()
  await expect(page.getByTestId('settings-shell')).toBeVisible({ timeout: 4000 })
  await expect(page.getByTestId('settings-tab-settings')).toHaveAttribute('aria-selected', 'true')
})

test('Help menu has Documentation + GitHub Repository', async ({ page }) => {
  await page.getByRole('button', { name: 'Help' }).click()
  await expect(page.getByText('Documentation')).toBeVisible()
  await expect(page.getByText('GitHub Repository')).toBeVisible()
})
