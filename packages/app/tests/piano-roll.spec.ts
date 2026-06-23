/**
 * Piano Roll tab — #383. Note grid over a `note(...)` pattern's mini-notation.
 *
 * Observes:
 *   - a melody renders notes on the right pitch rows / step columns;
 *   - clicking an empty cell places a note that round-trips the mini-notation;
 *   - clicking a note selects it; Delete removes it (#432 — was click-removes);
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
  await drawer.locator('role=tab[name="Pattern"]').click()
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

  test('clicking a note deletes it (click-toggle)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ ~ ~")')
    const drawer = await openRoll(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    await grid.locator('[data-roll-cell="48:0"]').click() // click a note → removes it
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: note("~ ~ ~ ~")')
  })

  test('dragging a note moves it in pitch and time (#391)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ ~ ~")')
    const drawer = await openRoll(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    const from = await grid.locator('[data-roll-cell="48:0"]').boundingBox() // c3 step0
    const to = await grid.locator('[data-roll-cell="52:2"]').boundingBox() // e3 step2
    if (!from || !to) throw new Error('missing cells')
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: note("~ ~ e3 ~")')
  })

  test('dragging the right-edge handle resizes a note duration to `@n` (#391/#405)', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ ~ ~")')
    const drawer = await openRoll(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    // grab c3's right-edge resize handle and drag right to step 2 (→ duration 3)
    const handle = await grid.locator('[data-roll-resize="48:0"]').boundingBox()
    const to = await grid.locator('[data-roll-cell="48:2"]').boundingBox()
    if (!handle || !to) throw new Error('missing handle/cell')
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: note("c3@3 ~")')
    // the note now spans steps 0–2 (head + sustained tail cells on)
    await expect(grid.locator('[data-roll-cell="48:2"]')).toHaveAttribute('aria-pressed', 'true')
  })

  test('pitch range stays put when a note is removed (#391)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c5 ~ ~ ~")') // c5 = midi 72
    const drawer = await openRoll(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    await expect(grid.locator('[data-roll-cell="72:0"]')).toHaveCount(1)
    await grid.locator('[data-roll-cell="72:0"]').click() // click c5 → removes it
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: note("~ ~ ~ ~")')
    // the c5 row is still rendered (range didn't collapse to the default octave)
    await expect(grid.locator('[data-roll-cell="72:0"]')).toHaveCount(1)
  })

  test('a sound pattern adaptively shows the Sequencer, not the Piano Roll (#398)', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ sn ~")')
    const drawer = await openRoll(page)
    // the Pattern tab switches the grid by pattern kind: a drum pattern gets the
    // Sequencer step grid — the Piano Roll is not shown.
    await expect(drawer.locator('[data-bottom-panel-tab="sequencer"]')).toHaveCount(1)
    await expect(drawer.locator('[data-bottom-panel-tab="piano-roll"]')).toHaveCount(0)
  })

  test('a melody adaptively shows the Piano Roll (#398)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ e3 g3")')
    const drawer = await openRoll(page)
    await expect(drawer.locator('[data-bottom-panel-tab="piano-roll"]')).toHaveCount(1)
    await expect(drawer.locator('[data-bottom-panel-tab="sequencer"]')).toHaveCount(0)
  })
})
