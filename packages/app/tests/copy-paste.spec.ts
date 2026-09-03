/**
 * Copy / paste notes — #528.
 *
 * The simple model: ⌘/Ctrl-click selects a cell, ⌘/Ctrl-C copies the note there,
 * ⌘/Ctrl-click a target cell, ⌘/Ctrl-V stamps the copied note's shape (duration
 * + velocity) at the target, replacing whatever's there. ⌘-click is select-only
 * (no add/delete — that's plain click).
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
  test('⌘-click selects (no edit); ⌘C + ⌘-click target + ⌘V pastes there', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ ~ ~ ~ ~ ~ ~")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')

    // ⌘-click c3 → SELECTS it (does NOT delete — that's plain click)
    await grid.locator('[data-roll-cell="48:0"]').click({ modifiers: ['Meta'] })
    await expect(grid.locator('[data-roll-cell="48:0"]')).toHaveAttribute('data-roll-selected', 'true')
    expect(await strudelValue(page)).toBe('$: note("c3 ~ ~ ~ ~ ~ ~ ~")') // unchanged

    // ⌘C, then ⌘-click an empty target cell (c3 row, step 3), then ⌘V → paste there
    await page.keyboard.press('Meta+c')
    await grid.locator('[data-roll-cell="48:3"]').click({ modifiers: ['Meta'] })
    await expect(grid.locator('[data-roll-cell="48:3"]')).toHaveAttribute('data-roll-selected', 'true')
    await page.keyboard.press('Meta+v')
    await page.waitForTimeout(120)
    expect(await strudelValue(page)).toBe('$: note("c3 ~ ~ c3 ~ ~ ~ ~")')

    expect(errors).toEqual([])
  })

  test('paste carries the copied velocity', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ ~ ~").gain("0.5 ~ ~ ~")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')

    // copy the soft c3, ⌘-click an empty c3-row target (step 2), ⌘V → c3 @ 0.5
    await grid.locator('[data-roll-cell="48:0"]').click({ modifiers: ['Meta'] })
    await page.keyboard.press('Meta+c')
    await grid.locator('[data-roll-cell="48:2"]').click({ modifiers: ['Meta'] })
    await page.keyboard.press('Meta+v')
    await page.waitForTimeout(120)
    const src = await strudelValue(page)
    expect(src).toContain('note("c3 ~ c3 ~")')
    expect(src).toContain('0.5') // the pasted note carries the copied 0.5 velocity
  })

  test('⌘⇧C / ⌘⇧V do NOT copy or paste — those chords belong to the browser (#1425)', async ({
    page,
  }) => {
    // `e.key` is the produced character, so Shift+c IS 'C'. Without a shift
    // guard the handler answered to ⌘⇧C / ⌘⇧V as well, `preventDefault()` and
    // all — and those chords are the platform's: ⌘⇧C is Chrome's element
    // picker, ⌘⇧V is paste-without-formatting nearly everywhere. Reaching for
    // either silently edited the pattern instead.
    await boot(page)
    const DOC = '$: note("c3 ~ ~ ~ ~ ~ ~ ~")'
    await setStrudelCode(page, DOC)
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')

    await grid.locator('[data-roll-cell="48:0"]').click({ modifiers: ['Meta'] })
    await expect(grid.locator('[data-roll-cell="48:0"]')).toHaveAttribute(
      'data-roll-selected',
      'true',
    )
    await page.keyboard.press('Meta+Shift+c')
    await grid.locator('[data-roll-cell="48:5"]').click({ modifiers: ['Meta'] })
    await page.keyboard.press('Meta+Shift+v')
    await page.waitForTimeout(300)
    expect(await strudelValue(page), 'the shifted chords must not touch the document').toBe(DOC)

    // ⚠ THE CONTROL, AND IT IS NOT OPTIONAL. The assertion above is a silence,
    // and a silence also passes when the handler is broken outright, when the
    // selection was lost, or when the roll never mounted. Doing the same thing
    // with the UNSHIFTED chord is what tells those apart.
    // ⚠ Re-select the NOTE first: the shifted attempt above left the selection
    // on the empty target cell, and copying THAT would prove nothing.
    await grid.locator('[data-roll-cell="48:0"]').click({ modifiers: ['Meta'] })
    await page.keyboard.press('Meta+c')
    await grid.locator('[data-roll-cell="48:3"]').click({ modifiers: ['Meta'] })
    await page.keyboard.press('Meta+v')
    await page.waitForTimeout(300)
    expect(await strudelValue(page), 'the unshifted chord still works').toBe(
      '$: note("c3 ~ ~ c3 ~ ~ ~ ~")',
    )
  })
})
