import { test, expect, type Page } from '@playwright/test'

// #739 — the unified settings shell. Both File-menu items open ONE window on
// the right tab; the Settings surface has a section nav + search; a toggle
// survives reload (persistence is the editorRegistry's, exercised end-to-end).

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 15000 })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
})

async function openViaFile(page: Page, item: string) {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByText(item).click()
  await expect(page.getByTestId('settings-shell')).toBeVisible({ timeout: 4000 })
}

test('File → Editor Settings opens the Settings tab; Keyboard Shortcuts opens the Keys tab', async ({ page }) => {
  await openViaFile(page, 'Editor Settings...')
  await expect(page.getByTestId('settings-tab-settings')).toHaveAttribute('aria-selected', 'true')
  // Same window, switch to the Keyboard Shortcuts tab.
  await page.getByTestId('settings-tab-keys').click()
  await expect(page.getByTestId('settings-tab-keys')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('keys-content')).toBeVisible()
  // Close, then open the Keyboard Shortcuts menu item → same shell, Keys tab.
  await page.getByRole('button', { name: 'Close' }).click()
  await openViaFile(page, 'Keyboard Shortcuts...')
  await expect(page.getByTestId('settings-tab-keys')).toHaveAttribute('aria-selected', 'true')
})

test('section nav switches the visible group', async ({ page }) => {
  await openViaFile(page, 'Editor Settings...')
  // Appearance shows by default.
  await expect(page.getByTestId('settings-section-appearance')).toBeVisible()
  await expect(page.getByTestId('settings-section-perf')).toHaveCount(0)
  // Click Performance in the nav.
  await page.getByTestId('settings-nav-perf').click()
  await expect(page.getByTestId('settings-section-perf')).toBeVisible()
  await expect(page.getByTestId('settings-section-appearance')).toHaveCount(0)
})

test('search filters rows across sections', async ({ page }) => {
  await openViaFile(page, 'Editor Settings...')
  await page.getByTestId('settings-search').fill('minimap')
  // The Appearance section (which holds Minimap) is shown; Performance is not.
  await expect(page.getByTestId('settings-section-appearance')).toBeVisible()
  await expect(page.getByTestId('settings-section-perf')).toHaveCount(0)
  await expect(page.getByText('Minimap', { exact: true })).toBeVisible()
})

test('a toggle survives a reload (real gesture, real persistence)', async ({ page }) => {
  await openViaFile(page, 'Editor Settings...')
  const minimap = page.getByTestId('setting-minimap')
  const before = await minimap.isChecked()
  await minimap.click()
  await expect(minimap).toBeChecked({ checked: !before })
  // Reload and reopen — the editorRegistry persisted the change.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await openViaFile(page, 'Editor Settings...')
  await expect(page.getByTestId('setting-minimap')).toBeChecked({ checked: !before })
})
