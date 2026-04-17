/**
 * MenuBar backdrop (BG) indicator E2E.
 *
 *   - Visible as "set bg" when viz files exist but none pinned.
 *   - Shows "bg: name" after pinning a backdrop.
 *   - Click opens the popover; "reveal in editor" switches the active tab.
 */

import { test, expect } from '@playwright/test'

async function gotoApp(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.locator('[data-workspace-shell="root"]').waitFor({
    timeout: 15000,
  })
  await page.locator('.monaco-editor').waitFor({ timeout: 15000 })
}

async function clickHydraTab(page: import('@playwright/test').Page) {
  const tabs = page.locator('[data-workspace-tab]')
  const count = await tabs.count()
  for (let i = 0; i < count; i++) {
    const t = await tabs.nth(i).textContent()
    if (t && /\.hydra/.test(t)) {
      await tabs.nth(i).click()
      await page.waitForTimeout(300)
      return
    }
  }
  throw new Error('no hydra tab')
}

test.describe('MenuBar BG indicator', () => {
  test('visible as "set bg" when viz files exist but none pinned', async ({
    page,
  }) => {
    await gotoApp(page)
    const ind = page.locator('[data-testid="menubar-bg-indicator"]')
    await expect(ind).toBeVisible()
    await expect(ind).toHaveAttribute('data-pinned', 'false')
    await expect(ind).toContainText(/set bg/i)
  })

  test('shows pinned file name after pinning; reveal switches to viz tab', async ({
    page,
  }) => {
    await gotoApp(page)

    // Pin hydra file as backdrop via viz-chrome toggle.
    await clickHydraTab(page)
    await page
      .locator('[data-testid="viz-chrome-bg-toggle"]')
      .first()
      .click()
    await expect(
      page.locator('[data-workspace-background]').first(),
    ).toBeVisible({ timeout: 5000 })

    // Indicator now visible with the filename.
    const ind = page.locator('[data-testid="menubar-bg-indicator"]')
    await expect(ind).toBeVisible()
    await expect(ind).toHaveAttribute('data-pinned', 'true')
    await expect(ind).toContainText(/bg:/i)
    await expect(ind).toContainText(/hydra|piano/i)

    // Switch away from the hydra tab to the strudel tab.
    await page
      .locator('[data-workspace-tab]', { hasText: 'pattern.strudel' })
      .click()
    await page.waitForTimeout(200)

    // Click indicator → popover → "reveal in editor" → tab switches.
    await ind.click()
    await page
      .locator('[data-testid="backdrop-popover"]')
      .waitFor({ timeout: 2000 })
    await page
      .locator('[data-testid="backdrop-popover-reveal"]')
      .click()
    await page.waitForTimeout(300)

    // Monaco shows hydra code now (the .hydra default has `osc`).
    const editorContent = page.locator('.monaco-editor .view-lines').first()
    await expect(editorContent).toContainText(/osc|stave/i, {
      timeout: 3000,
    })

    // Cleanup — unpin via popover.
    await ind.click()
    await page
      .locator('[data-testid="backdrop-popover"]')
      .waitFor({ timeout: 2000 })
    await page.locator('[data-testid="backdrop-chrome-clear"]').click()
    await expect(
      page.locator('[data-testid="menubar-bg-indicator"][data-pinned="false"]'),
    ).toBeVisible()
  })
})
