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
  await page.getByRole('button', { name: 'File' }).click()
  await expect(page.getByText('Editor Settings...')).toBeVisible()
  await expect(page.getByText('Keyboard Shortcuts...')).toBeVisible()
  // It actually opens the settings modal (title is exactly "Editor Settings",
  // distinct from the "Editor Settings..." menu item which closes on click).
  await page.getByText('Editor Settings...').click()
  await expect(page.getByText('Editor Settings', { exact: true })).toBeVisible({ timeout: 4000 })
})

test('Help menu has Documentation + GitHub Repository', async ({ page }) => {
  await page.getByRole('button', { name: 'Help' }).click()
  await expect(page.getByText('Documentation')).toBeVisible()
  await expect(page.getByText('GitHub Repository')).toBeVisible()
})
