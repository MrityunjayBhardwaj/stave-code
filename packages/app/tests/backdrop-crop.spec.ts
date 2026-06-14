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

/**
 * Open the backdrop popover from the pattern bar's "set bg" dropdown (#347 —
 * the menubar indicator was removed). Idempotent: if it's already open, no-op.
 */
async function openPopover(page: import('@playwright/test').Page) {
  if ((await page.locator('[data-testid="backdrop-popover"]').count()) === 0) {
    await page.locator('[data-testid="strudel-chrome-bg-toggle"]').click()
  }
  await page
    .locator('[data-testid="backdrop-popover"]')
    .waitFor({ timeout: 2000 })
}

async function pinBackdropFromPatternBar(page: import('@playwright/test').Page) {
  // Pick a viz in the popover → pins it as the active pattern tab's backdrop,
  // leaving the popover open in its pinned (controls) state.
  await openPopover(page)
  const picker = page.locator('[data-testid="backdrop-popover-picker"]')
  const value = await picker.locator('option').nth(1).getAttribute('value')
  await picker.selectOption(value!)
  await page
    .locator('[data-workspace-background]')
    .first()
    .waitFor({ timeout: 5000 })
}

test.describe('Backdrop crop', () => {
  test('popover shows no action controls when unpinned', async ({ page }) => {
    await gotoApp(page)
    // Open the popover from the pattern bar with no backdrop pinned yet.
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
    await pinBackdropFromPatternBar(page)
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
    await pinBackdropFromPatternBar(page)
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
    await pinBackdropFromPatternBar(page)

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
    await pinBackdropFromPatternBar(page)
    await openPopover(page)
    await page.locator('[data-testid="backdrop-chrome-clear"]').click()
    // Popover closes on clear; backdrop removed.
    await expect(
      page.locator('[data-workspace-background]'),
    ).toHaveCount(0)
  })
})
