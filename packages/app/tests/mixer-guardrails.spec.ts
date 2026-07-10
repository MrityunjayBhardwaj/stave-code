/**
 * Guardrails (#847): code the Mixer doesn't model stays INERT — no phantom
 * dials, no broken controls. Observed live in the real app.
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

test.describe('Mixer guardrails — unsupported code stays inert (#847)', () => {
  test('an unsupported control with extra args shows ONE dial, not phantom dials', async ({ page }) => {
    await boot(page)
    // chorus is a real (unary) Strudel control, absent from the effect catalog.
    await setStrudelCode(page, '$: s("bd").chorus(0.5, 0, 100)')
    const drawer = await openMixer(page)
    await expect(drawer.locator('[data-knob="chorus"]')).toHaveCount(1)
    await expect(drawer.locator('[data-knob="chorus 1"]')).toHaveCount(0)
    await expect(drawer.locator('[data-knob="chorus 2"]')).toHaveCount(0)
  })

  test('a signal in a range slot is not range-editable (double-click does nothing)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd").room(0.4, sine, 100)')
    const drawer = await openMixer(page)
    const slider = drawer.locator('[data-knob="room"] [role="slider"]')
    await expect(slider).toHaveCount(1)
    await slider.dblclick()
    // No popup — we won't clobber code we can't model.
    await expect(page.locator('[data-knob-range-popup="room"]')).toHaveCount(0)
    // And the code is untouched by the interaction.
    const after = await page.evaluate(() => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getValue: () => string } | null }> } } }).monaco
      return m?.editor?.getEditors?.()?.[0]?.getModel?.()?.getValue?.() ?? ''
    })
    expect(after).toContain('room(0.4, sine, 100)')
  })
})
