/**
 * Sequencer tab — #382. Drum/step grid over a sound pattern's mini-notation.
 *
 * Observes (AnviDev: verify AND observe):
 *   - a sound pattern renders one lane per sound, cells reflecting the mini;
 *   - toggling a cell round-trips: the mini-notation updates and stays a sound
 *     pattern (surgical replace of the mini range only);
 *   - a pattern outside the grid subset falls back to standby (code-only).
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

async function openSequencer(page: Page) {
  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('[data-bottom-panel="toggle"]').click()
  await drawer.locator('role=tab[name="Sequencer"]').click()
  return drawer
}

test.describe('Sequencer (#382)', () => {
  test('renders one lane per sound with cells from the mini', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ sn ~")')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid).toHaveCount(1)
    // bd lane: on at step 0, off at 1, etc. (data-seq-cell="lane:step")
    await expect(grid.locator('[data-seq-cell="0:0"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(grid.locator('[data-seq-cell="0:1"]')).toHaveAttribute('aria-pressed', 'false')
  })

  test('toggling a cell round-trips the mini-notation', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ ~ ~")')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    // turn step 2 of the bd lane on
    await grid.locator('[data-seq-cell="0:2"]').click()
    await page.waitForTimeout(80)
    const after = await strudelValue(page)
    expect(after).toBe('$: s("bd ~ bd ~")')
    // the grid reflects it
    await expect(grid.locator('[data-seq-cell="0:2"]')).toHaveAttribute('aria-pressed', 'true')
  })

  test('highlights the playing step during playback (#391)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd hh sn hh")') // focuses the editor
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${mod}+Enter`) // play (editor is focused)
    await page.waitForTimeout(300)
    const drawer = await openSequencer(page) // playback continues across tab open
    // a step cell becomes "playing" as the transport clock advances
    await expect(
      drawer.locator('[data-seq-cell][data-playing="true"]').first(),
    ).toBeVisible({ timeout: 5000 })
  })

  test('non-grid pattern falls back to standby', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd*<2 3>")')
    const drawer = await openSequencer(page)
    await expect(drawer.locator('[data-bottom-panel-tab="sequencer-standby"]')).toHaveCount(1)
  })
})
