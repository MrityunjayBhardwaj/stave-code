import { test, expect, type Page } from '@playwright/test'

// #739 Phase B — the finished keyboard-shortcuts editor: rebinds persist
// across reload, conflicts are flagged, editor-owned Monaco keys are shown
// read-only, and reset (per-binding + global) restores defaults.

test.beforeEach(async ({ page }) => {
  // Each test gets a fresh browser context (empty localStorage), so no
  // clearing is needed — and clearing via addInitScript would re-fire on the
  // reload inside the persistence test and wipe the very override under test.
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 15000 })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
})

async function openKeys(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByText('Keyboard Shortcuts...').click()
  await expect(page.getByTestId('settings-shell')).toBeVisible({ timeout: 4000 })
  await expect(page.getByTestId('settings-tab-keys')).toHaveAttribute('aria-selected', 'true')
}

// Enter capture and wait for the "Press keys…" state (proof the capture
// listener is attached) before dispatching, so the press can't race the
// React effect that installs it.
async function rebind(page: Page, id: string, keys: string) {
  const chord = page.getByTestId(`chord-${id}`)
  await chord.click()
  await expect(chord).toContainText('Press keys')
  await page.keyboard.press(keys)
}

test('a rebind persists across reload', async ({ page }) => {
  await openKeys(page)
  // Rebind "Quick Open (Go to File)" (stave.quickOpen, default ⌘P) to ⌘J.
  await rebind(page, 'stave.quickOpen', 'Meta+J')
  await expect(page.getByTestId('chord-stave.quickOpen')).toContainText('J')
  // Reload, reopen — override survived.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await openKeys(page)
  await expect(page.getByTestId('chord-stave.quickOpen')).toContainText('J')
})

test('assigning an in-use chord flags a conflict', async ({ page }) => {
  await openKeys(page)
  // Rebind quickOpen onto the command palette's ⌘⇧P (in use).
  await rebind(page, 'stave.quickOpen', 'Meta+Shift+P')
  // A conflict badge appears on the rebent row.
  await expect(page.getByTestId('conflict-stave.quickOpen')).toBeVisible()
  await expect(page.getByTestId('conflict-stave.quickOpen')).toContainText('Also bound to')
})

test('editor-owned keys are read-only System rows', async ({ page }) => {
  await openKeys(page)
  // The "all" view already renders the read-only Editor section.
  const runRow = page.getByTestId('system-Run / Evaluate')
  await expect(runRow).toBeVisible()
  // System chord is a <span>, not a rebindable <button> — no chord-* testid.
  await expect(page.locator('[data-testid="chord-Run / Evaluate"]')).toHaveCount(0)
  await expect(page.getByText('Owned by the code editor')).toBeVisible()
})

test('per-binding reset only appears after an override, and restores the default', async ({ page }) => {
  await openKeys(page)
  // No reset button before overriding.
  await expect(page.getByTestId('reset-stave.quickOpen')).toHaveCount(0)
  await rebind(page, 'stave.quickOpen', 'Meta+J')
  const reset = page.getByTestId('reset-stave.quickOpen')
  await expect(reset).toBeVisible()
  await reset.click()
  // Back to the default ⌘P; reset button gone.
  await expect(page.getByTestId('chord-stave.quickOpen')).toContainText('P')
  await expect(page.getByTestId('reset-stave.quickOpen')).toHaveCount(0)
})

test('global reset-all clears every override', async ({ page }) => {
  await openKeys(page)
  await rebind(page, 'stave.quickOpen', 'Meta+J')
  const resetAll = page.getByTestId('reset-all-keybindings')
  await expect(resetAll).toBeVisible()
  await resetAll.click()
  await expect(page.getByTestId('chord-stave.quickOpen')).toContainText('P')
  await expect(page.getByTestId('reset-all-keybindings')).toHaveCount(0)
})
