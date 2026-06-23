/**
 * Tool palette — #433 (Logic-parity Phase 1).
 *
 * Real-browser proof that selecting a tool changes the grids' edit mode:
 *   - Pencil → clicking an empty cell draws (places a note / step-on);
 *   - Eraser → clicking a filled cell removes it (note / step-off);
 *   - Pointer (default) leaves the existing smart gestures unchanged (the
 *     drag/move/resize regression lives in piano-roll.spec.ts / sequencer.spec.ts);
 *   - Phase-2 tools (Velocity/Scissors/Glue) are visible but disabled.
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

test.describe('Tool palette (#433)', () => {
  test('palette is visible with Pointer active; Phase-2 tools are disabled', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ ~ ~")')
    const drawer = await openPattern(page)
    const palette = drawer.locator('[data-tool-palette]')
    await expect(palette).toBeVisible()
    await expect(palette.locator('[data-tool="pointer"]')).toHaveAttribute('data-tool-active', 'true')
    await expect(palette.locator('[data-tool="scissors"]')).toHaveAttribute('disabled', '')
    await expect(palette.locator('[data-tool="glue"]')).toHaveAttribute('disabled', '')
    await expect(palette.locator('[data-tool="velocity"]')).toHaveAttribute('disabled', '')
  })

  test('Piano Roll: Pencil draws, Eraser removes', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ ~ ~")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')

    // Pencil → click empty cell places e3 at step 2
    await drawer.locator('[data-tool="pencil"]').click()
    await expect(drawer.locator('[data-tool="pencil"]')).toHaveAttribute('data-tool-active', 'true')
    await grid.locator('[data-roll-cell="52:2"]').click()
    await page.waitForTimeout(100)
    expect(await strudelValue(page)).toBe('$: note("c3 ~ e3 ~")')

    // Eraser → click c3 removes it (no select+Delete two-step)
    await drawer.locator('[data-tool="eraser"]').click()
    await grid.locator('[data-roll-cell="48:0"]').click()
    await page.waitForTimeout(100)
    expect(await strudelValue(page)).toBe('$: note("~ ~ e3 ~")')

    expect(errors).toEqual([])
  })

  test('Sequencer: Pencil paints on, Eraser paints off', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ ~ ~")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')

    // Pencil → click step 2 turns it on
    await drawer.locator('[data-tool="pencil"]').click()
    await grid.locator('[data-seq-cell="0:2"]').click()
    await page.waitForTimeout(100)
    expect(await strudelValue(page)).toBe('$: s("bd ~ bd ~")')

    // Eraser → click step 0 turns it off
    await drawer.locator('[data-tool="eraser"]').click()
    await grid.locator('[data-seq-cell="0:0"]').click()
    await page.waitForTimeout(100)
    expect(await strudelValue(page)).toBe('$: s("~ ~ bd ~")')

    expect(errors).toEqual([])
  })
})
