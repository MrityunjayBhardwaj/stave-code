/**
 * Snap / quantize division — #432 Slice 2.
 *
 * The Mixer's Snap picker (Piano Roll only) quantizes move/resize to a musical
 * division; divisions the grid can't represent are disabled.
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

async function openPattern(page: Page): Promise<Locator> {
  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('[data-bottom-panel="toggle"]').click()
  await drawer.locator('role=tab[name="Pattern"]').click()
  await page.waitForTimeout(300)
  return drawer
}

test.describe('Snap division (#432 Slice 2)', () => {
  test('the Snap division quantizes a move', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await boot(page)
    // 16-step bar: 1/4 → snap interval 4 columns; 1/8-triplet doesn't divide it.
    await setStrudelCode(page, '$: note("c3 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    const div = drawer.locator('[data-mixer-division-select]')

    // a division that doesn't divide this grid evenly is offered but disabled.
    await expect(div.locator('option[value="1/8T"]')).toHaveAttribute('disabled', '')
    await expect(div.locator('option[value="1/4"]')).not.toHaveAttribute('disabled', '')

    await div.selectOption('1/4')
    await page.waitForTimeout(80)

    // drag c3 (step 0) to step 5 → snaps to the nearest 1/4 line (step 4)
    const from = await grid.locator('[data-roll-cell="48:0"]').boundingBox()
    const to = await grid.locator('[data-roll-cell="48:5"]').boundingBox()
    if (!from || !to) throw new Error('missing cells')
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(120)

    await expect(grid.locator('[data-roll-cell="48:4"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(grid.locator('[data-roll-cell="48:5"]')).toHaveAttribute('aria-pressed', 'false')
    await expect(grid.locator('[data-roll-cell="48:0"]')).toHaveAttribute('aria-pressed', 'false')

    expect(errors).toEqual([])
  })

  test('the Snap picker is Piano-Roll only — absent on the step grid', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ sd ~")')
    const drawer = await openPattern(page)
    await expect(drawer.locator('[data-bottom-panel-tab="sequencer"]')).toHaveCount(1)
    await expect(drawer.locator('[data-mixer-division-select]')).toHaveCount(0)
  })
})
