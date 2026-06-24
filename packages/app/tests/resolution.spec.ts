/**
 * Grid resolution — #479.
 *
 * The ×2 / ÷2 "Slots" control on both grid headers is ratio-preserving
 * mini-notation sugar: ×2 splits each column in two (hits keep their position),
 * ÷2 merges pairs back and is disabled when halving would be lossy. Verified by
 * BOTH the rendered grid and the written-back source.
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

async function getStrudelCode(page: Page): Promise<string> {
  return page.evaluate(() => {
    const monaco = (window as unknown as {
      monaco?: { editor?: { getEditors?: () => unknown[] } }
    }).monaco
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

test.describe('Grid resolution ×2 / ÷2 (#479)', () => {
  test('step grid: ×2 doubles the columns and keeps timing', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ sn ~ bd")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')

    // 5 columns before — lane 0 (bd) has cells 0:0..0:4
    await expect(grid.locator('[data-seq-cell^="0:"]')).toHaveCount(5)

    await grid.locator('[data-resolution-double]').click()
    await page.waitForTimeout(120)

    // 10 columns after, the source expands ratio-preserving
    await expect(grid.locator('[data-seq-cell^="0:"]')).toHaveCount(10)
    expect(await getStrudelCode(page)).toBe('$: s("bd ~ ~ ~ sn ~ ~ ~ bd ~")')
    expect(errors).toEqual([])
  })

  test('step grid: ÷2 is disabled when an odd column carries a hit, enabled when lossless', async ({
    page,
  }) => {
    await boot(page)
    // bd on col 0, sn on col 1 (odd) → halving would drop sn → ÷2 disabled
    await setStrudelCode(page, '$: s("bd sn")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid.locator('[data-resolution-halve]')).toBeDisabled()

    // every odd column empty → ÷2 enabled and merges pairs back
    await setStrudelCode(page, '$: s("bd ~ sn ~")')
    await expect(grid.locator('[data-resolution-halve]')).toBeEnabled()
    await grid.locator('[data-resolution-halve]').click()
    await page.waitForTimeout(120)
    expect(await getStrudelCode(page)).toBe('$: s("bd sn")')
  })

  test('piano roll: ×2 then ÷2 round-trips to the byte-identical source', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await boot(page)
    await setStrudelCode(page, '$: note("c3 e3 g3")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    await expect(grid).toHaveCount(1)

    await grid.locator('[data-resolution-double]').click()
    await page.waitForTimeout(120)
    expect(await getStrudelCode(page)).toBe('$: note("c3@2 e3@2 g3@2")')

    await grid.locator('[data-resolution-halve]').click()
    await page.waitForTimeout(120)
    expect(await getStrudelCode(page)).toBe('$: note("c3 e3 g3")')
    expect(errors).toEqual([])
  })
})
