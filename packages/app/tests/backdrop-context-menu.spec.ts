/**
 * Backdrop context-menu E2E (issue #37).
 *
 * Right-clicking a `.hydra` file in the tree → "Set as Background"
 * → the shell pins that file as the group's backdrop. The backdrop
 * layer (`[data-workspace-background]`) appears with the correct
 * `data-background-file-id` attribute. Re-opening the menu shows
 * "Clear Background"; clicking it removes the backdrop layer.
 *
 * Only viz files (`.hydra`, `.p5`) should surface the menu item —
 * pattern files (`.strudel`, `.sonicpi`) should NOT.
 */

import { test, expect } from '@playwright/test'

async function gotoApp(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.locator('[data-workspace-shell="root"]').waitFor({
    timeout: 15000,
  })
  await page.locator('.monaco-editor').waitFor({ timeout: 15000 })
}

/**
 * Find a file-tree row by visible text. The tree renders rows as
 * clickable elements containing the filename; a substring match
 * tolerates wrapper chrome (icons, decorators).
 */
function treeRow(page: import('@playwright/test').Page, name: string) {
  // The file-tree panel label is "EXPLORER" in one of its panelHeader
  // divs; rows are inside the sidebar. Use hasText with name as the
  // filter so the locator resolves to the row (not the whole panel).
  return page
    .locator('[data-stave-file-tree-row], [data-file-tree-row]')
    .filter({ hasText: name })
    .first()
}

test.describe('Backdrop context menu', () => {
  test('pattern files do NOT show Set as Background', async ({ page }) => {
    await gotoApp(page)
    const strudelRow = page
      .locator('text=pattern.strudel')
      .first()
    await strudelRow.click({ button: 'right' })
    await expect(
      page.getByRole('button', { name: /Set as Background/i }),
    ).toHaveCount(0)
  })

  test('viz files DO show Set as Background', async ({ page }) => {
    await gotoApp(page)
    const hydraRow = page.locator('text=.hydra').first()
    await hydraRow.click({ button: 'right' })
    await expect(
      page.getByRole('button', { name: /Set as Background/i }),
    ).toHaveCount(1, { timeout: 2000 })
  })

  test('Set then Clear toggles the backdrop layer', async ({ page }) => {
    await gotoApp(page)

    // No backdrop present initially.
    await expect(
      page.locator('[data-workspace-background]'),
    ).toHaveCount(0)

    const hydraRow = page.locator('text=.hydra').first()
    await hydraRow.click({ button: 'right' })
    await page
      .getByRole('button', { name: /Set as Background/i })
      .click()

    // Backdrop layer appears with data-background-file-id set.
    const backdrop = page.locator('[data-workspace-background]').first()
    await expect(backdrop).toBeVisible({ timeout: 5000 })
    const bgFileId = await backdrop.getAttribute(
      'data-background-file-id',
    )
    expect(bgFileId).toBeTruthy()

    // Re-open menu on same file — label should now say Clear.
    await hydraRow.click({ button: 'right' })
    await expect(
      page.getByRole('button', { name: /Clear Background/i }),
    ).toHaveCount(1, { timeout: 2000 })
    await page
      .getByRole('button', { name: /Clear Background/i })
      .click()

    await expect(
      page.locator('[data-workspace-background]'),
    ).toHaveCount(0)
  })

  test('Backdrop survives tab switches (file-pinned, not tab-mirrored)', async ({
    page,
  }) => {
    await gotoApp(page)

    const hydraRow = page.locator('text=.hydra').first()
    await hydraRow.click({ button: 'right' })
    await page
      .getByRole('button', { name: /Set as Background/i })
      .click()

    // Confirm backdrop is up.
    await expect(
      page.locator('[data-workspace-background]').first(),
    ).toBeVisible({ timeout: 5000 })

    // Switch to the strudel tab.
    await page
      .locator('[data-workspace-tab]', { hasText: 'pattern.strudel' })
      .click()
    await page.waitForTimeout(400)

    // Backdrop should still be there — that's the whole point of the
    // file-pinned model (pre-fix behavior mirrored the active tab,
    // which meant the backdrop DISAPPEARED on switch to a non-viz
    // file). If this count is 0 the model has regressed.
    await expect(
      page.locator('[data-workspace-background]').first(),
    ).toBeVisible({ timeout: 2000 })
  })
})
