/**
 * Piano Roll tab — #383. Note grid over a `note(...)` pattern's mini-notation.
 *
 * Observes:
 *   - a melody renders notes on the right pitch rows / step columns;
 *   - clicking an empty cell places a note that round-trips the mini-notation;
 *   - clicking a note removes it;
 *   - a sound pattern (not a melody) falls back to standby.
 */
import { test, expect, type Page } from '@playwright/test'

async function boot(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 15_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } })
        .monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 15_000 },
  )
}

async function setStrudelCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } })
      .monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
      setPosition: (p: { lineNumber: number; column: number }) => void
    }>
    const target =
      editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    if (!target) return false
    target.getModel()?.setValue(c)
    target.setPosition({ lineNumber: 1, column: 1 })
    target.focus()
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(150)
}

async function strudelValue(page: Page): Promise<string> {
  return page.evaluate(() => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } })
      .monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; getValue: () => string } | null
    }>
    const target =
      editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    return target?.getModel()?.getValue() ?? ''
  })
}

async function openRoll(page: Page) {
  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('[data-bottom-panel="toggle"]').click()
  await drawer.locator('role=tab[name="Piano Roll"]').click()
  return drawer
}

// midi: c3=48, e3=52, g3=55
test.describe('Piano Roll (#383)', () => {
  test('renders notes on the right pitch rows and steps', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ e3 g3")')
    const drawer = await openRoll(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    await expect(grid).toHaveCount(1)
    await expect(grid.locator('[data-roll-cell="48:0"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(grid.locator('[data-roll-cell="52:2"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(grid.locator('[data-roll-cell="55:3"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(grid.locator('[data-roll-cell="48:1"]')).toHaveAttribute('aria-pressed', 'false')
  })

  test('placing a note round-trips the mini-notation', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ ~ ~")')
    const drawer = await openRoll(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    await grid.locator('[data-roll-cell="52:2"]').click() // place e3 at step 2
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: note("c3 ~ e3 ~")')
  })

  test('clicking a note removes it', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ ~ ~")')
    const drawer = await openRoll(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    await grid.locator('[data-roll-cell="48:0"]').click() // remove c3
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: note("~ ~ ~ ~")')
  })

  test('a sound pattern falls back to standby', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ sn ~")')
    const drawer = await openRoll(page)
    await expect(drawer.locator('[data-bottom-panel-tab="piano-roll-standby"]')).toHaveCount(1)
  })
})
