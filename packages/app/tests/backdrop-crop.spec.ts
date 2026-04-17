/**
 * Backdrop crop E2E.
 *
 *   - Popover shows no action controls until a backdrop is pinned.
 *   - Pinning a backdrop surfaces crop/quality/clear inside the popover.
 *   - Clicking crop opens the CropPopup with the backdrop adapter
 *     (title includes "Backdrop").
 *   - Saving a crop writes transform on the inner backdrop wrapper.
 *   - Reload restores the crop.
 *   - Clicking clear unpins the backdrop.
 */

import { test, expect } from '@playwright/test'

async function gotoApp(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.locator('[data-workspace-shell="root"]').waitFor({
    timeout: 15000,
  })
  await page.locator('.monaco-editor').waitFor({ timeout: 15000 })
}

async function pinHydraBackdrop(page: import('@playwright/test').Page) {
  const tabs = page.locator('[data-workspace-tab]')
  const count = await tabs.count()
  for (let i = 0; i < count; i++) {
    const t = await tabs.nth(i).textContent()
    if (t && /\.hydra/.test(t)) {
      await tabs.nth(i).click()
      break
    }
  }
  await page.waitForTimeout(200)
  await page
    .locator('[data-testid="viz-chrome-bg-toggle"]')
    .first()
    .click()
  await page
    .locator('[data-workspace-background]')
    .first()
    .waitFor({ timeout: 5000 })
}

/** Click the menubar bg indicator to open the backdrop popover. */
async function openPopover(page: import('@playwright/test').Page) {
  await page.locator('[data-testid="menubar-bg-indicator"]').click()
  await page
    .locator('[data-testid="backdrop-popover"]')
    .waitFor({ timeout: 2000 })
}

test.describe('Backdrop crop', () => {
  test('popover shows no action controls when unpinned', async ({ page }) => {
    await gotoApp(page)
    // Indicator is visible (viz files exist) but no backdrop is pinned.
    await expect(
      page.locator('[data-testid="menubar-bg-indicator"]'),
    ).toBeVisible()
    await openPopover(page)
    // Popover opens in unpinned state — no action buttons.
    await expect(
      page.locator('[data-testid="backdrop-popover"][data-pinned="false"]'),
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="backdrop-chrome-crop"]'),
    ).toHaveCount(0)
    await expect(
      page.locator('[data-testid="backdrop-chrome-quality"]'),
    ).toHaveCount(0)
    await expect(
      page.locator('[data-testid="backdrop-chrome-clear"]'),
    ).toHaveCount(0)
    // Close popover.
    await page.keyboard.press('Escape')
  })

  test('pinning a backdrop surfaces controls inside the popover', async ({
    page,
  }) => {
    await gotoApp(page)
    await pinHydraBackdrop(page)
    await openPopover(page)
    await expect(
      page.locator('[data-testid="backdrop-popover"][data-pinned="true"]'),
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="backdrop-chrome-crop"]'),
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="backdrop-chrome-quality"]'),
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="backdrop-chrome-clear"]'),
    ).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('crop button opens popup with backdrop adapter title', async ({
    page,
  }) => {
    await gotoApp(page)
    await pinHydraBackdrop(page)
    await openPopover(page)
    await page.locator('[data-testid="backdrop-chrome-crop"]').click()
    await expect(
      page.getByText(/Crop — Backdrop:/i),
    ).toBeVisible({ timeout: 3000 })
    // Close via Esc.
    await page.keyboard.press('Escape')
  })

  test('saving a crop applies a transform to the backdrop wrapper', async ({
    page,
  }) => {
    await gotoApp(page)
    await pinHydraBackdrop(page)

    // Baseline transform.
    const inner = page
      .locator('[data-workspace-background] > div')
      .first()
    const before = await inner.evaluate(
      (el) => getComputedStyle(el).transform,
    )

    await openPopover(page)
    await page.locator('[data-testid="backdrop-chrome-crop"]').click()
    await expect(page.getByText(/Crop — Backdrop:/i)).toBeVisible()

    // Proximity-gated handles: move cursor near the east handle to arm
    // pointer-events, then drag inward.
    const eastHandle = page.locator('[data-testid="crop-handle-e"]')
    await eastHandle.waitFor({ state: 'attached', timeout: 2000 })
    const box = await eastHandle.boundingBox()
    if (!box) throw new Error('east handle not found')
    const startX = box.x + box.width / 2
    const startY = box.y + box.height / 2
    await page.mouse.move(startX - 4, startY)
    await page.waitForTimeout(60)
    await page.mouse.move(startX, startY)
    await page.waitForTimeout(40)
    await page.mouse.down()
    await page.mouse.move(startX - 30, startY)
    await page.mouse.move(startX - 90, startY)
    await page.mouse.move(startX - 180, startY)
    await page.mouse.up()
    await page.waitForTimeout(200)

    await page.getByRole('button', { name: /Save Crop/i }).click()
    await page.waitForTimeout(500)

    const after = await inner.evaluate(
      (el) => getComputedStyle(el).transform,
    )
    expect(after).not.toBe(before)
    const m = after.match(/matrix\(([^)]+)\)/)
    expect(m).toBeTruthy()
    if (m) {
      const [a, , , d] = m[1].split(',').map((v) => parseFloat(v.trim()))
      expect(a).toBeGreaterThan(d)
    }
  })

  test('clear button unpins backdrop', async ({
    page,
  }) => {
    await gotoApp(page)
    await pinHydraBackdrop(page)
    await openPopover(page)
    await page.locator('[data-testid="backdrop-chrome-clear"]').click()
    // Popover closes on clear; backdrop removed.
    await expect(
      page.locator('[data-workspace-background]'),
    ).toHaveCount(0)
    // Indicator reverts to unpinned state.
    await expect(
      page.locator('[data-testid="menubar-bg-indicator"][data-pinned="false"]'),
    ).toBeVisible()
  })
})
