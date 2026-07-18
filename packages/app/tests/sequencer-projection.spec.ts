/**
 * Behaviour-projection for the Sequencer grid — #922.
 *
 * A pattern whose note string the two-level Step→Slot model can't represent
 * (elongation `@n`, nested groups `[a [b c]]`) used to fall to code-only. The
 * projection reads what the pattern PLAYS (haps) and shows an ordinary grid, and
 * tiles the write-back to krill's top-level element spans so an edit stays local
 * (span surgery) — the unedited notation is copied back byte-for-byte.
 *
 * Observes the REAL app + REAL document:
 *   - a refused-by-syntax pattern now OPENS an editable Sequencer grid;
 *   - the projected cells match what Strudel plays;
 *   - toggling one cell writes back a hap-faithful document, and unrelated
 *     notation (a nested group) rides back verbatim.
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
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
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
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    return target?.getModel()?.getValue() ?? ''
  })
}

async function openSequencer(page: Page) {
  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('[data-bottom-panel="toggle"]').click()
  await drawer.locator('role=tab[name="Pattern"]').click()
  return drawer
}

test.describe('Sequencer behaviour-projection (#922)', () => {
  test('an `@n` elongation pattern opens an editable grid and edits locally', async ({ page }) => {
    // `bd@2 hh` has no place in the two-level model (elongation isn't a grid
    // concept) but plays [bd ~ hh]. The projection shows that grid.
    await boot(page)
    await setStrudelCode(page, '$: s("bd@2 hh")')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid).toHaveCount(1)
    // projected onset columns: bd at 0 (held over col 1), hh at 2
    await expect(grid.locator('[data-seq-cell="0:0"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(grid.locator('[data-seq-cell="0:1"]')).toHaveAttribute('aria-pressed', 'false')
    await expect(grid.locator('[data-seq-cell="1:2"]')).toHaveAttribute('aria-pressed', 'true')
    // toggle bd off → hap-faithful re-emit (the @2 hold becomes two rests)
    await grid.locator('[data-seq-cell="0:0"]').click()
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: s("~ ~ hh")')
  })

  test('a nested group opens and an unrelated edit copies the group back verbatim', async ({
    page,
  }) => {
    // `bd [hh [hh hh]] sd` — a two-level-deep group the model can't hold, but it
    // plays a plain 12-step grid. Editing the bd must leave the nested group
    // untouched byte-for-byte (span surgery), never a flat rebuild.
    await boot(page)
    await setStrudelCode(page, '$: s("bd [hh [hh hh]] sd")')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid).toHaveCount(1)
    await expect(grid.locator('[data-seq-cell="0:0"]')).toHaveAttribute('aria-pressed', 'true')
    // toggle the leading bd off; the nested group + sd ride back unchanged
    await grid.locator('[data-seq-cell="0:0"]').click()
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: s("~ [hh [hh hh]] sd")')
  })

  test('a per-cycle-varying pattern still falls back to code (projection declines)', async ({
    page,
  }) => {
    // `bd?` degrades per cycle — not a static grid. The projection declines and
    // the syntactic refusal stands: the Sequencer shows standby, not a false grid.
    await boot(page)
    await setStrudelCode(page, '$: s("bd? hh sd cp")')
    const drawer = await openSequencer(page)
    // standby (not an editable grid) — the pattern is code-editable only
    await expect(drawer.locator('[data-bottom-panel-tab="sequencer"] [data-seq-cell]')).toHaveCount(
      0,
    )
  })
})
