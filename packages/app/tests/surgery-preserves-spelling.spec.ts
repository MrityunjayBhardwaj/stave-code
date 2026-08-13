/**
 * surgery-preserves-spelling.spec.ts — the byte-surgery rung, observed in the real app
 * on the CORE-opened half (#1233).
 *
 * Everything #1233 was judged by is a corpus sweep: 775 grid byte changes, churn
 * 14,980 → 1,715, a routing census, an editor suite. Not one of them is a person
 * deleting a note and looking at their document. This is that, and it is the only place
 * the change is observed through a real gesture.
 *
 * WHAT A USER SEES WITHOUT IT. The element writer re-emits the whole element it touched,
 * at the grid's own resolution — so removing one note from a two-note group blows the
 * group open into as many columns as the bar has, and the author's `[sd hh]` comes back
 * as `[~ ~ ~ hh _ _]`. Nothing is broken: it plays identically, it re-parses, every
 * spelling assertion elsewhere still holds. It is simply not what they wrote, and it is
 * the destruction class this whole arc exists to stop.
 *
 * ⚠ THE FIXTURES ARE CHOSEN, NOT INVENTED. Both are CORE-opened (`parseStepGridCore`
 * accepts them), which is what makes them #1233's population rather than P4d's — the
 * derived half shipped at #1229 and would pass these arms on its own. They were found by
 * sweeping the corpus for core-opened deletes whose bytes differ with the overlay
 * stripped: 444 of them, of which these two are the shortest legible shapes. A fixture
 * where the two writers agree would pass with the attachment entirely unwired.
 *
 * ⚠ EXPECTED VALUES ARE THE WRITER'S, NOT MINE. Each `toBe` below is what the shipping
 * writer produces today; the comment beside it records what the ELEMENT writer produces
 * for the same gesture, which is what these arms redden to when the overlay is removed
 * from production. Verified by doing exactly that — see the break note in the issue.
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

test.describe('byte surgery keeps the user’s own spelling (#1233)', () => {
  /**
   * `<bd*3 [sd hh]>` — two branches, so the bar is 6 columns wide (3 from `bd*3`,
   * 2 from `[sd hh]`, lcm 6). Deleting the `sd` touches only the `[sd hh]` group.
   */
  test('deleting one note of a group does not blow the group open', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("<bd*3 [sd hh]>")')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid).toHaveCount(1)

    // lane 1 is `sd`, and in bar 1 it occupies the first half of the bar — column 6
    await expect(grid.locator('[data-seq-cell="1:6"]')).toHaveAttribute('aria-pressed', 'true')
    await grid.locator('[data-seq-cell="1:6"]').click()
    await page.waitForTimeout(120)

    // the element writer's answer for this gesture is `<bd*3 [~ ~ ~ hh _ _]>`
    expect(await strudelValue(page)).toBe('$: s("<bd*3 [~ hh]>")')
  })

  /**
   * A stack inside an alternation. Here the loss is the CHORD: re-emitting `[bd,hh]`
   * with one voice gone drops the brackets entirely and leaves a bare `hh`, so the
   * user's two-voice slot silently stops looking like one.
   */
  test('deleting one voice of a chord keeps the chord’s brackets', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("<[bd,hh] [sd,cp]>")')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid).toHaveCount(1)

    await expect(grid.locator('[data-seq-cell="0:0"]')).toHaveAttribute('aria-pressed', 'true')
    await grid.locator('[data-seq-cell="0:0"]').click()
    await page.waitForTimeout(120)

    // the element writer's answer for this gesture is `<hh [sd,cp]>` — brackets gone
    expect(await strudelValue(page)).toBe('$: s("<[~,hh] [sd,cp]>")')
  })

  /**
   * CONTROL. Opening a pattern and clicking nothing must leave the document byte-for-byte
   * alone — otherwise an arm above could pass because the panel rewrote on mount rather
   * than because the gesture wrote well.
   */
  test('CONTROL: opening these patterns writes nothing', async ({ page }) => {
    await boot(page)
    for (const src of ['$: s("<bd*3 [sd hh]>")', '$: s("<[bd,hh] [sd,cp]>")']) {
      await setStrudelCode(page, src)
      const drawer = await openSequencer(page)
      await expect(drawer.locator('[data-bottom-panel-tab="sequencer"]')).toHaveCount(1)
      await page.waitForTimeout(150)
      expect(await strudelValue(page)).toBe(src)
    }
  })
})
