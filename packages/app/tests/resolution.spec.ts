/**
 * Grid resolution — #479.
 *
 * The "Slots" 4 / 8 / 16 / 32 control on both grid headers scales the grid to an
 * absolute column count by ratio-preserving ×2 / ÷2 (hits keep their position).
 * A target is enabled only when it's a lossless power-of-2 ratio of the current
 * count; non-power-of-2 patterns show every preset disabled. Verified by BOTH the
 * rendered grid and the written-back source.
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

test.describe('Grid resolution 4/8/16/32 (#479)', () => {
  test('step grid: choosing 8 doubles a 4-step grid and keeps timing', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ sn ~")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')

    // 4 columns before; "4" is the active preset
    await expect(grid.locator('[data-seq-cell^="0:"]')).toHaveCount(4)
    await expect(grid.locator('[data-resolution-step="4"]')).toHaveAttribute(
      'data-resolution-active',
      'true',
    )

    await grid.locator('[data-resolution-step="8"]').click()
    await page.waitForTimeout(120)

    await expect(grid.locator('[data-seq-cell^="0:"]')).toHaveCount(8)
    expect(await getStrudelCode(page)).toBe('$: s("bd ~ ~ ~ sn ~ ~ ~")')
    await expect(grid.locator('[data-resolution-step="8"]')).toHaveAttribute(
      'data-resolution-active',
      'true',
    )
    expect(errors).toEqual([])
  })

  test('step grid: a lower target is disabled when halving is lossy, enabled when lossless', async ({
    page,
  }) => {
    await boot(page)
    // every column filled → halving to 4 would drop hits → "4" disabled
    await setStrudelCode(page, '$: s("bd sd hh cp bd sd hh cp")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid.locator('[data-resolution-step="4"]')).toBeDisabled()
    await expect(grid.locator('[data-resolution-step="16"]')).toBeEnabled()

    // hits only on every 4th column → "4" lossless → enabled, merges down
    await setStrudelCode(page, '$: s("bd ~ ~ ~ sn ~ ~ ~")')
    await expect(grid.locator('[data-resolution-step="4"]')).toBeEnabled()
    await grid.locator('[data-resolution-step="4"]').click()
    await page.waitForTimeout(120)
    expect(await getStrudelCode(page)).toBe('$: s("bd ~ sn ~")')
  })

  test('step grid: a non-power-of-2 (5-step) pattern disables every preset', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ sn ~ bd")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    for (const n of ['4', '8', '16', '32']) {
      await expect(grid.locator(`[data-resolution-step="${n}"]`)).toBeDisabled()
    }
  })

  test('piano roll: 8 then 4 round-trips to the byte-identical source', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await boot(page)
    await setStrudelCode(page, '$: note("c3 e3 g3 a3")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    await expect(grid).toHaveCount(1)

    await grid.locator('[data-resolution-step="8"]').click()
    await page.waitForTimeout(120)
    expect(await getStrudelCode(page)).toBe('$: note("c3@2 e3@2 g3@2 a3@2")')

    await grid.locator('[data-resolution-step="4"]').click()
    await page.waitForTimeout(120)
    expect(await getStrudelCode(page)).toBe('$: note("c3 e3 g3 a3")')
    expect(errors).toEqual([])
  })
})
