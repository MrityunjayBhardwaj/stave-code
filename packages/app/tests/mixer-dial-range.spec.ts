/**
 * Custom dial range (#844/#845) — the double-click range popup, end to end in
 * the real app: double-click a control dial → an in-place popup → Apply writes
 * `.control(value, min, max)`; editing that code moves the dial (bidirectional).
 * The popup is portaled to <body> so the `overflow:hidden` drawer can't clip it.
 */
import { test, expect, type Page } from '@playwright/test'

async function boot(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 15_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 15_000 },
  )
}

async function setStrudelCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
      setPosition: (p: { lineNumber: number; column: number }) => void
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    if (!target) return false
    target.getModel()?.setValue(c)
    target.setPosition({ lineNumber: 1, column: 1 })
    target.focus()
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(150)
}

async function openMixer(page: Page) {
  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('[data-bottom-panel="toggle"]').click()
  await drawer.locator('role=tab[name="Pattern"]').click()
  return drawer
}

async function enlargeDrawer(page: Page): Promise<void> {
  const handle = page.locator('[data-bottom-panel="resize-handle"]')
  const hb = await handle.boundingBox()
  if (!hb) return
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + hb.width / 2, hb.y - 320, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(150)
}

async function strudelValue(page: Page): Promise<string> {
  return page.evaluate(() => {
    const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; getValue: () => string } | null }> } } }).monaco
    const eds = m?.editor?.getEditors?.() ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    return t?.getModel()?.getValue() ?? ''
  })
}

test.describe('Mixer custom dial range (#844/#845)', () => {
  test('double-click → set range → writes .room(v, min, max); code edits move the dial', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd").room(0.4)')
    const drawer = await openMixer(page)
    await enlargeDrawer(page)

    const slider = drawer.locator('[data-knob="room"] [role="slider"]')
    await expect(slider).toHaveCount(1)

    // Double-click the dial → the (portaled) popup opens.
    await slider.dblclick()
    const popup = page.locator('[data-knob-range-popup="room"]')
    await expect(popup).toBeVisible()

    // Set start/end and apply.
    await popup.locator('[data-knob-range-input="min"]').fill('0')
    await popup.locator('[data-knob-range-input="max"]').fill('100')
    await page.screenshot({ path: 'test-results/mixer-dial-range-popup.png' })
    await popup.locator('[data-knob-range-apply]').click()

    // Code carries the range, and only the range slots were added.
    await expect.poll(() => strudelValue(page)).toBe('$: s("bd").room(0.4, 0, 100)')

    // The dial re-ranged to the authored bounds.
    await expect(slider).toHaveAttribute('aria-valuemin', '0')
    await expect(slider).toHaveAttribute('aria-valuemax', '100')

    // Bidirectional: editing the range in code moves the dial's bounds.
    await setStrudelCode(page, '$: s("bd").room(0.4, 10, 90)')
    await expect(slider).toHaveAttribute('aria-valuemin', '10')
    await expect(slider).toHaveAttribute('aria-valuemax', '90')
  })
})
