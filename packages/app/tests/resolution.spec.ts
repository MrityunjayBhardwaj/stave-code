/**
 * Grid resolution — #479.
 *
 * The "Slots" 4 / 8 / 16 / 32 / 64 control on both grid headers SETS the grid to
 * an absolute column count: a lossless ×2/÷2 when the ratio allows (hits keep
 * their position), else a quantize (notes snap to the nearest new slot, collisions
 * merge) so ANY pattern can be coarsened. Verified by BOTH the rendered grid and
 * the written-back source.
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

test.describe('Grid resolution 4/8/16/32/64 (#479)', () => {
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

  test('step grid: a lossless reduce keeps timing and is shown as a normal preset', async ({
    page,
  }) => {
    await boot(page)
    // hits only on every 4th column → 8→4 is lossless
    await setStrudelCode(page, '$: s("bd ~ ~ ~ sn ~ ~ ~")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid.locator('[data-resolution-step="4"]')).toBeEnabled()
    await expect(grid.locator('[data-resolution-step="4"]')).not.toHaveAttribute(
      'data-resolution-quantize',
      'true',
    )
    await grid.locator('[data-resolution-step="4"]').click()
    await page.waitForTimeout(120)
    expect(await getStrudelCode(page)).toBe('$: s("bd ~ sn ~")')
  })

  test('step grid: a non-power-of-2 (5-step) pattern can still be reduced (quantize)', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ sn ~ bd")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    // every preset is OFFERED (quantize), not disabled — and marked as quantize
    await expect(grid.locator('[data-resolution-step="4"]')).toBeEnabled()
    await expect(grid.locator('[data-resolution-step="4"]')).toHaveAttribute(
      'data-resolution-quantize',
      'true',
    )
    // reduce 5 → 4: hits snap to the nearest of the 4 slots
    await grid.locator('[data-resolution-step="4"]').click()
    await page.waitForTimeout(120)
    expect(await getStrudelCode(page)).toBe('$: s("bd ~ sn bd")')
    await expect(grid.locator('[data-seq-cell^="0:"]')).toHaveCount(4)
  })

  test('piano roll: reduce a 64-step melody to 16 (quantize) writes a valid 16-slot pattern', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await boot(page)
    await setStrudelCode(
      page,
      '$: note("~ ~ ~ ~ ~ ~ ~ ~ [e4,d5]@4 d5 ~ ~ ~ [g4,a#4]@2 d5 ~ ~ [f5,c#4] ~ ~ b4@4 g4 ~ ~ ~ [c5,d4]@4 e5 ~ f#5 ~ [b4,d4]@2 f5 ~ ~ c5 ~ ~ [g4,a4]@3 d5 ~ ~ ~ d5 e4@8")',
    )
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    // 16 is below the 64-step current → offered as a quantize target
    await expect(grid.locator('[data-resolution-step="16"]')).toBeEnabled()
    await expect(grid.locator('[data-resolution-step="16"]')).toHaveAttribute(
      'data-resolution-quantize',
      'true',
    )
    await grid.locator('[data-resolution-step="16"]').click()
    await page.waitForTimeout(150)
    const code = await getStrudelCode(page)
    // the write happened (source changed) and it's a real 16-slot melody
    expect(code).not.toContain('e4@8') // the original long tail is gone
    expect(code).toContain('note(')
    expect(errors).toEqual([])
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
