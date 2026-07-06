/**
 * Backdrop via the ⚙ viz-settings popover (#773, reshaped from #37/#771).
 *
 * The viz chrome's backdrop control is now the ⚙ gear → viz-settings popover,
 * whose `preview: [off | side | backdrop]` segment places this viz. Only viz
 * file tabs show the gear; pattern files get none.
 *
 * Covers:
 *   - Gear absent on pattern tabs, present + 'off' on viz tabs.
 *   - preview=backdrop mounts the backdrop layer with the right fileId; the
 *     gear reports data-preview-mode="backdrop"; backdrop controls appear;
 *     preview=off clears it.
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

// #773 — set THIS viz file as the group backdrop via the ⚙ viz-settings
// popover: open the gear, pick preview=backdrop.
async function setBackdrop(page: import('@playwright/test').Page) {
  await page.locator('[data-testid="viz-chrome-settings"]').first().click()
  await page.locator('[data-testid="viz-settings-popover"]').waitFor({
    timeout: 2000,
  })
  await page.locator('[data-testid="viz-preview-mode-backdrop"]').first().click()
}

test.describe('Backdrop via viz-settings popover (#773)', () => {
  test('settings gear absent on pattern tabs, present on viz tabs', async ({ page }) => {
    await gotoApp(page)
    await page
      .locator('[data-workspace-tab]', { hasText: 'pattern.strudel' })
      .click()
    await expect(
      page.locator('[data-testid="viz-chrome-settings"]'),
    ).toHaveCount(0)

    await clickHydraTab(page)
    const gear = page.locator('[data-testid="viz-chrome-settings"]').first()
    await expect(gear).toBeVisible()
    await expect(gear).toHaveAttribute('data-preview-mode', 'off')
  })

  test('preview=backdrop mounts the backdrop; controls appear; preview=off clears it', async ({ page }) => {
    await gotoApp(page)
    await clickHydraTab(page)

    await expect(page.locator('[data-workspace-background]')).toHaveCount(0)

    await setBackdrop(page)

    const backdrop = page.locator('[data-workspace-background]').first()
    await expect(backdrop).toBeVisible({ timeout: 5000 })
    const gear = page.locator('[data-testid="viz-chrome-settings"]').first()
    await expect(gear).toHaveAttribute('data-preview-mode', 'backdrop')
    const bgFileId = await backdrop.getAttribute('data-background-file-id')
    expect(bgFileId).toBeTruthy()

    // Backdrop controls surface in the popover while in backdrop mode.
    const popover = page.locator('[data-testid="viz-settings-popover"]')
    await expect(popover.locator('[data-testid="viz-settings-quality"]')).toBeVisible()
    await expect(popover.locator('[data-testid="viz-settings-vizspan"]')).toBeVisible()

    // preview=off clears the backdrop.
    await popover.locator('[data-testid="viz-preview-mode-off"]').click()
    await expect(page.locator('[data-workspace-background]')).toHaveCount(0)
    await expect(gear).toHaveAttribute('data-preview-mode', 'off')
  })

  test('play/pause button pauses + resumes the BACKDROP (#781)', async ({ page }) => {
    await gotoApp(page)
    await clickHydraTab(page)
    await setBackdrop(page)

    const backdrop = page.locator('[data-workspace-background]').first()
    await expect(backdrop).toBeVisible({ timeout: 5000 })
    // Live by default.
    await expect(backdrop).toHaveAttribute('data-backdrop-live', 'true')

    // The play/pause button shows in backdrop mode (before the ⚙ gear).
    const transport = page.locator('[data-testid="viz-chrome-open-preview"]').first()
    await expect(transport).toBeVisible()
    await expect(transport).toHaveAttribute('data-preview-mode', 'backdrop')
    await expect(transport).toContainText('Pause')

    // Pause → backdrop freezes (data-backdrop-live flips to false).
    await transport.click()
    await expect(backdrop).toHaveAttribute('data-backdrop-live', 'false')
    await expect(transport).toContainText('Play')

    // Play → resumes.
    await transport.click()
    await expect(backdrop).toHaveAttribute('data-backdrop-live', 'true')
    await expect(transport).toContainText('Pause')
  })

  test('backdrop is PER-TAB (#347) — clears on switch to a tab without one, restores on return', async ({
    page,
  }) => {
    await gotoApp(page)
    await clickHydraTab(page)

    await setBackdrop(page)
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

    await setBackdrop(page)
    const backdrop = page.locator('[data-workspace-background]').first()
    await expect(backdrop).toBeVisible({ timeout: 5000 })
    const fileIdBefore = await backdrop.getAttribute('data-background-file-id')

    await page.reload()
    await page.locator('[data-workspace-shell="root"]').waitFor({
      timeout: 15000,
    })
    await page.locator('.monaco-editor').waitFor({ timeout: 15000 })

    const backdropAfter = page.locator('[data-workspace-background]').first()
    await expect(backdropAfter).toBeVisible({ timeout: 5000 })
    const fileIdAfter = await backdropAfter.getAttribute(
      'data-background-file-id',
    )
    expect(fileIdAfter).toBe(fileIdBefore)
  })

  // #782 — #772 stripped the always-visible primary button; a fresh viz file
  // had NO open affordance. Restored: "▶ Preview" opens a side preview.
  test('fresh viz file shows "▶ Preview" primary that opens a side preview (#782)', async ({
    page,
  }) => {
    await gotoApp(page)
    await clickHydraTab(page)

    const primary = page.locator('[data-testid="viz-chrome-open-preview"]').first()
    await expect(primary).toBeVisible()
    await expect(primary).toHaveAttribute('data-button-state', 'closed')
    await expect(primary).toHaveAttribute('data-preview-mode', 'off')
    await expect(primary).toContainText('Preview')

    // Clicking it opens a side preview → a preview pane mounts, button flips to
    // the pause transport ('running' / "⏸ Pause").
    await primary.click()
    await expect(primary).toHaveAttribute('data-preview-mode', 'side')
    await expect(primary).toContainText('Pause')
  })

  // #782 — backdrop controls used to vanish entirely off backdrop mode. Now
  // they're always rendered, disabled/greyed until preview=backdrop.
  test('⚙ popover shows backdrop controls disabled in off mode, enabled in backdrop (#782)', async ({
    page,
  }) => {
    await gotoApp(page)
    await clickHydraTab(page)

    // Open the popover in the default 'off' mode.
    await page.locator('[data-testid="viz-chrome-settings"]').first().click()
    const popover = page.locator('[data-testid="viz-settings-popover"]')
    await popover.waitFor({ timeout: 2000 })
    await expect(popover).toHaveAttribute('data-mode', 'off')

    // Controls PRESENT but disabled (data-disabled="true").
    for (const tid of [
      'viz-settings-opacity',
      'viz-settings-quality',
      'viz-settings-crop',
      'viz-settings-reveal',
      'viz-settings-vizspan',
    ]) {
      const el = popover.locator(`[data-testid="${tid}"]`)
      await expect(el).toBeVisible()
      await expect(el).toHaveAttribute('data-disabled', 'true')
      await expect(el).toBeDisabled()
    }

    // Switch to backdrop → the same controls enable.
    await popover.locator('[data-testid="viz-preview-mode-backdrop"]').click()
    await expect(popover).toHaveAttribute('data-mode', 'backdrop')
    for (const tid of [
      'viz-settings-opacity',
      'viz-settings-quality',
      'viz-settings-crop',
      'viz-settings-reveal',
      'viz-settings-vizspan',
    ]) {
      const el = popover.locator(`[data-testid="${tid}"]`)
      await expect(el).toHaveAttribute('data-disabled', 'false')
      await expect(el).toBeEnabled()
    }
  })
})
