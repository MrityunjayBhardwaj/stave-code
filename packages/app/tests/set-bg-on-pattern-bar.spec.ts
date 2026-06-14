import { test, expect } from '@playwright/test'

// #347 — "set bg" DROPDOWN on the pattern (Strudel) chrome bar, next to the
// live toggle. Mirrors the menubar bg-indicator: clicking opens the SAME
// BackdropPopover (viz-file picker → opacity/quality/crop/reveal/clear when
// pinned), anchored to the button and scoped to this pane. A `.strudel` file
// can't be a backdrop itself, so the picker lists viz files; selecting one pins
// it as this pane's sticky (no audio/eval needed — the picker sets it directly).

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(1000)
})

test('set-bg dropdown lives on the pattern chrome bar, next to the live toggle', async ({ page }) => {
  const bar = page.locator('[data-strudel-runtime-chrome="root"]')
  await expect(bar).toHaveCount(1)
  const btn = bar.locator('[data-testid="strudel-chrome-bg-toggle"]')
  await expect(btn).toHaveCount(1)
  await expect(bar.locator('[data-testid="strudel-chrome-live-toggle"]')).toHaveCount(1)
  // Fresh load: nothing pinned yet.
  await expect(btn).toHaveAttribute('data-pinned', 'false')
  await expect(btn).toContainText('set bg')
})

test('clicking opens the BackdropPopover; picking a viz pins it, clearing removes it', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  const btn = page.locator('[data-testid="strudel-chrome-bg-toggle"]')

  // Click → the same popover the menubar uses opens.
  await btn.click()
  const popover = page.locator('[data-testid="backdrop-popover"]')
  await expect(popover).toBeVisible()
  await expect(popover).toHaveAttribute('data-pinned', 'false')

  // Pick the first real viz file from the picker → pins it as this pane's bg.
  const picker = popover.locator('[data-testid="backdrop-popover-picker"]')
  const value = await picker.locator('option').nth(1).getAttribute('value')
  expect(value).toBeTruthy()
  await picker.selectOption(value!)

  // Now pinned: a backdrop is mounted, the button reflects it, and the popover
  // switches to its pinned controls (clear button present).
  await expect(page.locator('[data-workspace-background]')).toHaveCount(1)
  await expect(btn).toHaveAttribute('data-pinned', 'true')
  await expect(popover).toHaveAttribute('data-pinned', 'true')
  const clearBtn = popover.locator('[data-testid="backdrop-chrome-clear"]')
  await expect(clearBtn).toBeVisible()

  // Clear → backdrop removed, popover closes, button back to unpinned.
  await clearBtn.click()
  await expect(page.locator('[data-workspace-background]')).toHaveCount(0)
  await expect(btn).toHaveAttribute('data-pinned', 'false')

  expect(errors).toEqual([])
})

test('backdrop is PER-TAB — switching tabs swaps/clears it, switching back restores', async ({ page }) => {
  const btn = page.locator('[data-testid="strudel-chrome-bg-toggle"]')

  // Pin a backdrop on the pattern tab.
  await btn.click()
  const picker = page.locator('[data-testid="backdrop-popover-picker"]')
  const value = await picker.locator('option').nth(1).getAttribute('value')
  await picker.selectOption(value!)
  await expect(page.locator('[data-workspace-background]')).toHaveCount(1)
  await expect(btn).toHaveAttribute('data-pinned', 'true')
  // Close the popover.
  await page.keyboard.press('Escape')

  // Open a second tab (a viz file) — it has no backdrop of its own, so the
  // pane's backdrop must CLEAR (it does not bleed from the pattern tab).
  await page.locator('[data-file-tree-item*="hydra"]').first().dblclick()
  await expect(page.locator('[data-workspace-background]')).toHaveCount(0)

  // Switch back to the pattern tab → its own backdrop is restored.
  await page.locator('[data-workspace-tab]', { hasText: 'pattern' }).first().click()
  await expect(page.locator('[data-workspace-background]')).toHaveCount(1)
  await expect(btn).toHaveAttribute('data-pinned', 'true')
})
