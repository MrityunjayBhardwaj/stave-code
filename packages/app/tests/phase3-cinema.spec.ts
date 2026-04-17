/**
 * Phase 3 E2E — Cinema Mode (#43), code-surface blur (#39),
 * backdrop quality ladder (#41).
 *
 * Dispatches commands directly to the window-level keybinding
 * dispatcher (same path the useKeyboardCommands hook listens on in
 * Phase 1's hydra test). Monaco swallows chord-style shortcuts if
 * the test types through the focused element.
 */

import { test, expect } from '@playwright/test'

async function gotoApp(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.locator('[data-workspace-shell="root"]').waitFor({
    timeout: 15000,
  })
  await page.locator('.monaco-editor').waitFor({ timeout: 15000 })
}

async function openViewMenuCinema(page: import('@playwright/test').Page) {
  // View menu in the MenuBar — click the "View" button, then click
  // the Cinema Mode item.
  await page.getByRole('button', { name: /^View$/ }).click()
  await page
    .getByRole('button', { name: /Cinema Mode|Exit Cinema Mode/ })
    .click()
}

test.describe('Cinema Mode (#43)', () => {
  test('auto-pins a viz as backdrop and enters zen on entry', async ({
    page,
  }) => {
    await gotoApp(page)

    // No backdrop initially.
    await expect(
      page.locator('[data-workspace-background]'),
    ).toHaveCount(0)

    await openViewMenuCinema(page)

    // Zen flips on — MenuBar stays visible (per editor-fixes-2)
    // but the FileTree activity bar hides. Easiest observable:
    // backdrop layer appears (auto-pinned).
    const backdrop = page.locator('[data-workspace-background]').first()
    await expect(backdrop).toBeVisible({ timeout: 5000 })
    // The auto-pick prefers .hydra.
    const bgFileId = await backdrop.getAttribute(
      'data-background-file-id',
    )
    expect(bgFileId).toBeTruthy()
  })

  test('Esc exits Cinema and clears the auto-pinned backdrop', async ({
    page,
  }) => {
    await gotoApp(page)
    await openViewMenuCinema(page)
    await expect(
      page.locator('[data-workspace-background]').first(),
    ).toBeVisible({ timeout: 5000 })

    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // Backdrop gone — we auto-pinned and cleaned up on exit.
    await expect(
      page.locator('[data-workspace-background]'),
    ).toHaveCount(0)
  })
})

test.describe('Code surface blur (#39)', () => {
  test('data-stave-backdrop attr flips on + off with backdrop state', async ({
    page,
  }) => {
    await gotoApp(page)

    const panel = page
      .locator('[data-stave-code-panel="true"]')
      .first()
    await expect(panel).toHaveAttribute('data-stave-backdrop', 'off')

    // Activate the hydra tab so its chrome button is mounted, then
    // flip the backdrop on.
    const allTabs = page.locator('[data-workspace-tab]')
    const count = await allTabs.count()
    for (let i = 0; i < count; i++) {
      const text = await allTabs.nth(i).textContent()
      if (text && /\.hydra/.test(text)) {
        await allTabs.nth(i).click()
        break
      }
    }
    const btn = page
      .locator('[data-testid="viz-chrome-bg-toggle"]')
      .first()
    await btn.click()
    await expect(panel).toHaveAttribute('data-stave-backdrop', 'on', {
      timeout: 5000,
    })

    await btn.click()
  })

  test('--stave-backdrop-blur persists to localStorage', async ({ page }) => {
    await gotoApp(page)

    // Seed a value via page evaluate (simulates the settings
    // modal's write path without depending on its DOM shape).
    await page.evaluate(() => {
      window.localStorage.setItem('stave:backdropBlur', '16')
    })
    await page.reload()
    await page.locator('[data-workspace-shell="root"]').waitFor({
      timeout: 15000,
    })

    const value = await page.evaluate(
      () =>
        getComputedStyle(document.documentElement).getPropertyValue(
          '--stave-backdrop-blur',
        ),
    )
    expect(value.trim()).toBe('16px')
  })
})

test.describe('Backdrop quality ladder (#41)', () => {
  test('data-backdrop-quality reflects the stored setting', async ({ page }) => {
    // Seed quarter before visiting — backdrop mounts read the value
    // through onBackdropQualityChange subscription, which fires from
    // initial read at subscription time. Setting before load is the
    // most deterministic way to exercise the render path.
    await page.goto('/')
    await page.evaluate(() => {
      window.localStorage.setItem('stave:backdropQuality', 'quarter')
    })
    await page.reload()
    await page.locator('[data-workspace-shell="root"]').waitFor({
      timeout: 15000,
    })
    await page.locator('.monaco-editor').waitFor({ timeout: 15000 })

    // Pin a backdrop via the viz-chrome toggle to exercise the render.
    const allTabs = page.locator('[data-workspace-tab]')
    const count = await allTabs.count()
    for (let i = 0; i < count; i++) {
      const text = await allTabs.nth(i).textContent()
      if (text && /\.hydra/.test(text)) {
        await allTabs.nth(i).click()
        break
      }
    }
    const btn = page
      .locator('[data-testid="viz-chrome-bg-toggle"]')
      .first()
    await btn.click()

    const backdrop = page.locator('[data-workspace-background]').first()
    await expect(backdrop).toBeVisible({ timeout: 5000 })
    await expect(backdrop).toHaveAttribute(
      'data-backdrop-quality',
      'quarter',
    )

    await btn.click()
    await page.evaluate(() => {
      window.localStorage.removeItem('stave:backdropQuality')
    })
  })
})
