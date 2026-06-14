/**
 * Backdrop via viz-chrome toggle button (#37 reshaped).
 *
 * The Set-as-Background control lives in VizEditorChrome, between
 * the source dropdown and the live toggle — only visible when a viz
 * file tab is active. Pattern files get no such button.
 *
 * Covers:
 *   - Button absent on pattern tabs.
 *   - Button starts 'off' on viz tabs.
 *   - Click → backdrop layer mounts with the right fileId;
 *     button flips to 'on'.
 *   - Click again → backdrop layer removed; attribute back to 'off'.
 *   - Backdrop survives tab switches (file-pinned model).
 *   - Selection persists across page reload (#38 unchanged).
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
  // Try existing tabs first (persistence may have restored one).
  const allTabs = page.locator('[data-workspace-tab]')
  const count = await allTabs.count()
  for (let i = 0; i < count; i++) {
    const text = await allTabs.nth(i).textContent()
    if (text && /\.hydra/.test(text)) {
      await allTabs.nth(i).click()
      await page.waitForTimeout(300)
      return
    }
  }
  // Issue #175 — the default workspace now opens a single Strudel tab,
  // not the 11-tab wall. Open a hydra preset via the file tree. File-tree
  // items expose the fileId on `data-file-tree-item` and the visible name
  // on the row; bundled hydra fileIds contain "hydra" — match on that.
  const hydraItem = page
    .locator('[data-file-tree-item*="hydra"]')
    .first()
  if ((await hydraItem.count()) === 0) {
    throw new Error('no hydra preset file in default project')
  }
  await hydraItem.dblclick()
  await page.waitForTimeout(500)
}

test.describe('Backdrop viz-chrome toggle', () => {
  test('button is absent on pattern tabs', async ({ page }) => {
    await gotoApp(page)
    await page
      .locator('[data-workspace-tab]', { hasText: 'pattern.strudel' })
      .click()
    await expect(
      page.locator('[data-testid="viz-chrome-bg-toggle"]'),
    ).toHaveCount(0)
  })

  test('button appears on viz tabs and starts in off state', async ({ page }) => {
    await gotoApp(page)
    await clickHydraTab(page)
    const btn = page.locator('[data-testid="viz-chrome-bg-toggle"]').first()
    await expect(btn).toBeVisible()
    await expect(btn).toHaveAttribute('data-bg-mode', 'off')
  })

  test('click toggles backdrop on / off', async ({ page }) => {
    await gotoApp(page)
    await clickHydraTab(page)

    await expect(
      page.locator('[data-workspace-background]'),
    ).toHaveCount(0)

    const btn = page.locator('[data-testid="viz-chrome-bg-toggle"]').first()
    await btn.click()

    const backdrop = page.locator('[data-workspace-background]').first()
    await expect(backdrop).toBeVisible({ timeout: 5000 })
    await expect(btn).toHaveAttribute('data-bg-mode', 'on')
    const bgFileId = await backdrop.getAttribute('data-background-file-id')
    expect(bgFileId).toBeTruthy()

    await btn.click()
    await expect(
      page.locator('[data-workspace-background]'),
    ).toHaveCount(0)
    await expect(btn).toHaveAttribute('data-bg-mode', 'off')
  })

  test('backdrop is PER-TAB (#347) — clears on switch to a tab without one, restores on return', async ({
    page,
  }) => {
    // #347 reworked the backdrop from per-PANE ("survives tab switches") to
    // per-TAB: each tab carries its own backdrop, so switching to a tab that
    // has none clears the pane, and switching back restores it.
    await gotoApp(page)
    await clickHydraTab(page)

    const btn = page.locator('[data-testid="viz-chrome-bg-toggle"]').first()
    await btn.click()
    await expect(
      page.locator('[data-workspace-background]').first(),
    ).toBeVisible({ timeout: 5000 })

    // Switch to the pattern tab — it has no backdrop of its own → pane clears.
    await page
      .locator('[data-workspace-tab]', { hasText: 'pattern.strudel' })
      .click()
    await page.waitForTimeout(400)
    await expect(page.locator('[data-workspace-background]')).toHaveCount(0)

    // Back to the hydra tab → its own backdrop is restored.
    await clickHydraTab(page)
    await expect(
      page.locator('[data-workspace-background]').first(),
    ).toBeVisible({ timeout: 2000 })
  })

  test('selection persists across page reload (#38)', async ({ page }) => {
    await gotoApp(page)
    await clickHydraTab(page)

    const btn = page.locator('[data-testid="viz-chrome-bg-toggle"]').first()
    await btn.click()
    const backdrop = page.locator('[data-workspace-background]').first()
    await expect(backdrop).toBeVisible({ timeout: 5000 })
    const fileIdBefore = await backdrop.getAttribute(
      'data-background-file-id',
    )

    await page.reload()
    await page.locator('[data-workspace-shell="root"]').waitFor({
      timeout: 15000,
    })
    await page.locator('.monaco-editor').waitFor({ timeout: 15000 })

    const backdropAfter = page
      .locator('[data-workspace-background]')
      .first()
    await expect(backdropAfter).toBeVisible({ timeout: 5000 })
    const fileIdAfter = await backdropAfter.getAttribute(
      'data-background-file-id',
    )
    expect(fileIdAfter).toBe(fileIdBefore)

    await clickHydraTab(page)
    await page
      .locator('[data-testid="viz-chrome-bg-toggle"]')
      .first()
      .click()
  })
})
