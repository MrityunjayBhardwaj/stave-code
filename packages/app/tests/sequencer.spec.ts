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
  await drawer.locator('role=tab[name="Pattern"]').click()
  return drawer
}

/** Put the cursor on the first occurrence of `needle` in the strudel model. */
async function placeCursorOn(page: Page, needle: string): Promise<void> {
  const ok = await page.evaluate((needle) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } })
      .monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => {
        getLanguageId?: () => string
        getValue: () => string
        getLineCount: () => number
        getLineContent: (n: number) => string
      } | null
      focus: () => void
      setPosition: (p: { lineNumber: number; column: number }) => void
    }>
    const t = editors.find((e) => e.getModel()?.getValue?.().includes(needle)) ?? editors[0]
    const m = t?.getModel()
    if (!m) return false
    for (let ln = 1; ln <= m.getLineCount(); ln++) {
      const idx = m.getLineContent(ln).indexOf(needle)
      if (idx >= 0) {
        t.focus()
        t.setPosition({ lineNumber: ln, column: idx + 2 })
        return true
      }
    }
    return false
  }, needle)
  expect(ok).toBe(true)
  await page.waitForTimeout(120)
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

  test('binds a drum track nested inside stack(...) and round-trips it (#395)', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(
      page,
      '$: stack(\n  s("bd ~ ~ ~").gain(0.5),\n  s("hh*4")\n).slow(2)',
    )
    // Cursor on the FIRST drum track, which lives inside stack(...).
    await placeCursorOn(page, 'bd ~ ~ ~')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid).toHaveCount(1) // bound, not standby
    await expect(grid.locator('[data-seq-cell="0:0"]')).toHaveAttribute('aria-pressed', 'true')

    // Toggle step 2 on — the write-back must hit ONLY the inner mini, leaving
    // the sibling track, the .gain() and the outer .slow(2) byte-identical.
    await grid.locator('[data-seq-cell="0:2"]').click()
    await page.waitForTimeout(100)
    expect(await strudelValue(page)).toBe(
      '$: stack(\n  s("bd ~ bd ~").gain(0.5),\n  s("hh*4")\n).slow(2)',
    )
  })

  test('binds `hh*8` as an 8-step lane and expands the sugar on toggle (#396)', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("hh*8")')
    await placeCursorOn(page, 'hh*8')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid).toHaveCount(1) // bound, not standby
    // `*8` expands to 8 columns, all on for the single hh lane
    for (let s = 0; s < 8; s++) {
      await expect(grid.locator(`[data-seq-cell="0:${s}"]`)).toHaveAttribute('aria-pressed', 'true')
    }
    await expect(grid.locator('[data-seq-cell="0:8"]')).toHaveCount(0) // no 9th column

    // turning one step off expands the `*8` sugar into the canonical sequence
    await grid.locator('[data-seq-cell="0:3"]').click()
    await page.waitForTimeout(100)
    expect(await strudelValue(page)).toBe('$: s("hh hh hh ~ hh hh hh hh")')
    await expect(grid.locator('[data-seq-cell="0:3"]')).toHaveAttribute('aria-pressed', 'false')
  })

  test('binds `bd(3,8)` euclid as an 8-step lane with 3 hits and expands on toggle (#399)', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd(3,8)")')
    await placeCursorOn(page, 'bd(3,8)')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid).toHaveCount(1) // bound, not standby
    // Bjørklund(3,8) = x . . x . . x . — hits at steps 0, 3, 6
    const on = [0, 3, 6]
    for (let s = 0; s < 8; s++) {
      await expect(grid.locator(`[data-seq-cell="0:${s}"]`)).toHaveAttribute(
        'aria-pressed',
        on.includes(s) ? 'true' : 'false',
      )
    }
    await expect(grid.locator('[data-seq-cell="0:8"]')).toHaveCount(0) // no 9th column

    // turning step 1 on expands the euclid sugar into the canonical sequence
    await grid.locator('[data-seq-cell="0:1"]').click()
    await page.waitForTimeout(100)
    expect(await strudelValue(page)).toBe('$: s("bd bd ~ bd ~ ~ bd ~")')
    await expect(grid.locator('[data-seq-cell="0:1"]')).toHaveAttribute('aria-pressed', 'true')
  })

  test('binds `bd!3` replicate as a 3-step lane and expands the sugar on toggle (#407)', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd!3")')
    await placeCursorOn(page, 'bd!3')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid).toHaveCount(1) // bound, not standby
    // `!3` = three separate beats, all on
    for (let s = 0; s < 3; s++) {
      await expect(grid.locator(`[data-seq-cell="0:${s}"]`)).toHaveAttribute('aria-pressed', 'true')
    }
    await expect(grid.locator('[data-seq-cell="0:3"]')).toHaveCount(0) // no 4th column

    // turning step 1 off expands the `!3` sugar into the canonical sequence
    await grid.locator('[data-seq-cell="0:1"]').click()
    await page.waitForTimeout(100)
    expect(await strudelValue(page)).toBe('$: s("bd ~ bd")')
    await expect(grid.locator('[data-seq-cell="0:1"]')).toHaveAttribute('aria-pressed', 'false')
  })
})
