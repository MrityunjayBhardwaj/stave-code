import { test, expect, type Page } from '@playwright/test'

/**
 * #365 (350c) — per-pane backdrop opacity/quality.
 *
 * The menubar backdrop popover now edits the ACTIVE pane's per-pane override
 * (not a single global), and the override persists on the group snapshot so it
 * survives reload. This exercises the real chain end-to-end:
 *   popover → shell handle (setBackdropOpacity/Quality) → group state →
 *   render (data-backdrop-quality + style.opacity) → persistence (reload).
 *
 * Per-pane ISOLATION (two panes, independent settings) is covered
 * deterministically by the WorkspaceShell unit test; here we verify the live
 * popover/persist wiring on a single pinned backdrop.
 */

async function gotoApp(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 15000 })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(800)
}

async function pinHydraBackdrop(page: Page): Promise<void> {
  // Open a bundled hydra viz tab via the file tree, then pin it as backdrop.
  const item = page.locator('[data-file-tree-item*="hydra"]').first()
  await item.dblclick()
  await page.waitForTimeout(400)
  const toggle = page.locator('[data-testid="viz-chrome-bg-toggle"]').first()
  await toggle.click()
  await expect(page.locator('[data-workspace-background]').first()).toBeVisible({ timeout: 6000 })
}

test('#365 — popover opacity/quality edit the pane backdrop and persist across reload', async ({ page }) => {
  await gotoApp(page)
  await pinHydraBackdrop(page)

  const backdrop = page.locator('[data-workspace-background]').first()
  // Default (global) quality is 'half'.
  await expect(backdrop).toHaveAttribute('data-backdrop-quality', 'half')

  // Open the menubar backdrop popover.
  await page.locator('[data-testid="menubar-bg-indicator"]').click()
  await expect(page.locator('[data-testid="backdrop-popover"]')).toBeVisible({ timeout: 4000 })

  // Change quality → 'quarter'. The render attribute reflects the pane override.
  await page.locator('[data-testid="backdrop-chrome-quality"]').selectOption('quarter')
  await expect(backdrop).toHaveAttribute('data-backdrop-quality', 'quarter', { timeout: 4000 })

  // Change opacity → 0.3 via the range slider (dispatch 'input' so React's
  // onChange fires).
  const slider = page.locator('[data-testid="backdrop-popover"] input[type="range"]')
  await slider.evaluate((el) => {
    const input = el as HTMLInputElement
    // React tracks the input value internally — set via the native setter so
    // React's onChange sees the new value (a plain `input.value =` is ignored).
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!
    setter.call(input, '0.3')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await expect.poll(async () => backdrop.evaluate((el) => (el as HTMLElement).style.opacity), {
    timeout: 4000,
  }).toBe('0.3')

  // Reload → the per-pane settings persist on the group snapshot.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 15000 })
  await page.waitForTimeout(1000)

  const after = page.locator('[data-workspace-background]').first()
  await expect(after).toBeVisible({ timeout: 8000 })
  await expect(after).toHaveAttribute('data-backdrop-quality', 'quarter')
  expect(await after.evaluate((el) => (el as HTMLElement).style.opacity)).toBe('0.3')
})
