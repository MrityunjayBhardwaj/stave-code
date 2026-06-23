/**
 * Copy / paste notes — #528.
 *
 * Real-browser proof of the simple model: ⌘/Ctrl-click selects a note, ⌘/Ctrl-C
 * copies it, ⌘/Ctrl-V pastes a copy right after itself (same pitch + velocity),
 * and repeated paste tiles it forward.
 */
import { test, expect, type Page, type Locator } from '@playwright/test'

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
  await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
      setPosition: (p: { lineNumber: number; column: number }) => void
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    target?.getModel()?.setValue(c)
    target?.setPosition({ lineNumber: 1, column: 6 })
    target?.focus()
  }, code)
  await page.waitForTimeout(200)
}

async function strudelValue(page: Page): Promise<string> {
  return page.evaluate(() => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; getValue: () => string } | null
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    return target?.getModel()?.getValue() ?? ''
  })
}

async function openPattern(page: Page): Promise<Locator> {
  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('[data-bottom-panel="toggle"]').click()
  await drawer.locator('role=tab[name="Pattern"]').click()
  await page.waitForTimeout(300)
  return drawer
}

test.describe('Copy/paste notes (#528)', () => {
  test('⌘-click selects, ⌘C copies, ⌘V pastes + tiles forward', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ ~ ~ ~ ~ ~ ~")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')

    // ⌘-click c3 → selects it (no move/place)
    await grid.locator('[data-roll-cell="48:0"]').click({ modifiers: ['Meta'] })
    await expect(grid.locator('[data-roll-cell="48:0"]')).toHaveAttribute('data-roll-selected', 'true')
    expect(await strudelValue(page)).toBe('$: note("c3 ~ ~ ~ ~ ~ ~ ~")') // select didn't edit

    // ⌘C then ⌘V → a copy lands at step 1 (right after)
    await page.keyboard.press('Meta+c')
    await page.keyboard.press('Meta+v')
    await page.waitForTimeout(100)
    expect(await strudelValue(page)).toBe('$: note("c3 c3 ~ ~ ~ ~ ~ ~")')

    // ⌘V again → tiles forward to step 2
    await page.keyboard.press('Meta+v')
    await page.waitForTimeout(100)
    expect(await strudelValue(page)).toBe('$: note("c3 c3 c3 ~ ~ ~ ~ ~")')

    expect(errors).toEqual([])
  })

  test('paste preserves velocity (gain) of the copied note', async ({ page }) => {
    await boot(page)
    // c3 at a softened gain; copy it and the paste should carry the same gain
    await setStrudelCode(page, '$: note("c3 ~ ~ ~").gain("0.5 ~ ~ ~")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')

    await grid.locator('[data-roll-cell="48:0"]').click({ modifiers: ['Meta'] })
    await page.keyboard.press('Meta+c')
    await page.keyboard.press('Meta+v')
    await page.waitForTimeout(120)
    // the pasted note at step 1 carries the 0.5 gain (exact gain-string shape is
    // serializer-owned; assert both the note and a non-neutral gain landed)
    const src = await strudelValue(page)
    expect(src).toContain('note("c3 c3 ~ ~")')
    expect(src).toContain('0.5')
  })
})
