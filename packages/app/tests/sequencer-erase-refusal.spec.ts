/**
 * Removing a hit the grid cannot remove must SAY so, never silently do nothing (#1836).
 *
 * WHY A BROWSER TEST. `toggleCell` already refuses these erases correctly — the corpus
 * sweep counts 285 of the 5,707 erase clicks the sequencer offers. What went wrong was the
 * PANEL: it treated every lit cell as clickable (`canPlace = on || …`) and never looked at
 * whether the toggle came back unchanged. No model-level arm can see that, because none of
 * them render a cell or read the Console.
 *
 * The panel has two honest answers, and each fixture pins one:
 *
 *   1. SAID BEFORE THE CLICK — a refused lit cell with nothing else to offer is inert
 *      (`aria-disabled`) and titled with the reason, exactly as a refused EMPTY cell has
 *      been since #1070. Fixture: the two-bar leaf grid the issue was observed on, where
 *      10 of the 13 lit cells refuse and velocity is out of scope (more than one bar).
 *
 *   2. SAID AT THE CLICK — a refused lit cell that still takes a velocity drag stays
 *      pressable, so a plain click reaches the op and must be reported as a `stave` warn
 *      row, the roll's `reportRefusal` shape. Fixture: a one-bar leaf grid from the
 *      corpus, where the `sd` hits are one token drawn twice (`[- sd]*2`); 38 of the 285
 *      corpus refusals are of this kind.
 *
 * ⚠ EACH REFUSED ARM HAS A TWIN ON THE SAME GRID that erases normally, so "nothing
 * happened" cannot be read as "the click never landed", and "one warning" cannot be
 * satisfied by reporting that is always on.
 */
import { test, expect, type Page } from '@playwright/test'
import { bootApp, seedCode, editorValue } from './_appBoot'
import { expectRefusalReported, expectNoRefusalReported } from './_console'

/** Two bars (the `< >` entries) — velocity is out of scope, so refusals are pre-announced. */
const TWO_BARS = '$: s("<bd [~ bd]>@2 hh@2 bd <bd ~> [hh bd] [~ hh]")'
/** `hh@2` sits outside every `< >`, so it is drawn once per bar over ONE span — refused */
const TWO_BARS_REFUSED = '0:8'
/** the first `bd` is inside `< >`, one bar's own token — accepted */
const TWO_BARS_ACCEPTED = '0:0'
const TWO_BARS_AFTER = '$: s("<~ [~ bd]>@2 hh@2 bd <bd ~> [hh bd] [~ hh]")'

/** One bar, one part — velocity is in scope, so a refused lit cell stays pressable. */
const ONE_BAR = '$: s("[bd - [- bd] -], [- sd]*2")'

async function openSequencer(page: Page, code: string) {
  await bootApp(page, { drawer: { tabId: 'pattern', height: 520 } })
  await seedCode(page, code)
  const grid = page.locator('[data-bottom-panel-tab="sequencer"]')
  await expect(grid, `the sequencer must open for ${code}`).toHaveCount(1)
  return grid
}

/** A lit cell, located and centred. Fails loudly if the fixture moved. */
async function litCell(page: Page, key: string) {
  const loc = page.locator(`[data-bottom-panel-tab="sequencer"] [data-seq-cell="${key}"]`)
  await expect(loc, `cell ${key} must be drawn`).toHaveCount(1)
  await expect(loc, `cell ${key} must be lit`).toHaveAttribute('aria-pressed', 'true')
  const b = await loc.boundingBox()
  if (!b) throw new Error(`cell ${key} has no box`)
  return { loc, x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

/** The lit cells of the open grid, by key, and which of them are marked inert. */
async function litKeys(page: Page): Promise<{ key: string; inert: boolean; title: string | null }[]> {
  return page
    .locator('[data-bottom-panel-tab="sequencer"] [data-seq-cell][aria-pressed="true"]')
    .evaluateAll((els) =>
      els.map((e) => ({
        key: e.getAttribute('data-seq-cell')!,
        inert: e.getAttribute('aria-disabled') === 'true',
        title: e.getAttribute('title'),
      })),
    )
}

test.describe('a refused erase is said before the click where nothing else is offered (#1836)', () => {
  test('the refused lit cell is inert and titled; a click leaves the code alone and raises nothing', async ({
    page,
  }) => {
    await openSequencer(page, TWO_BARS)
    const cell = await litCell(page, TWO_BARS_REFUSED)
    await expect(cell.loc, 'a lit cell whose erase is refused must be marked inert').toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await expect(cell.loc).toHaveAttribute('title', /plays in more than one box/)

    await page.mouse.click(cell.x, cell.y)
    // Give a write the time it would take to land, then require the bytes unchanged.
    await page.waitForTimeout(700)
    expect(await editorValue(page)).toBe(TWO_BARS)
    // Announced up front, like a refused placement — so the click itself is quiet.
    await expectNoRefusalReported(page)
  })

  test('the removable lit cell on the same grid is not inert, and its click erases', async ({ page }) => {
    await openSequencer(page, TWO_BARS)
    const cell = await litCell(page, TWO_BARS_ACCEPTED)
    await expect(cell.loc).not.toHaveAttribute('aria-disabled', 'true')
    await expect(cell.loc).not.toHaveAttribute('title', /.+/)

    await page.mouse.click(cell.x, cell.y)
    await expect.poll(() => editorValue(page), { message: 'the accepted erase must write' }).toBe(TWO_BARS_AFTER)
    await expectNoRefusalReported(page)
  })

  test('every lit cell tells the truth: inert exactly where the erase is refused (10 of 13)', async ({
    page,
  }) => {
    await openSequencer(page, TWO_BARS)
    const lit = await litKeys(page)
    expect(lit.length, 'the fixture draws 13 hits').toBe(13)
    // The model-level answer for this grid, from `canToggleCell(model, l, s, false)`:
    // only the three tokens inside `< >` accept an erase.
    const removable = ['0:0', '0:10', '0:18']
    expect(lit.filter((c) => !c.inert).map((c) => c.key)).toEqual(removable)
    for (const c of lit.filter((c) => c.inert)) expect(c.title, `${c.key} must say why`).toBeTruthy()
  })
})

test.describe('a refused erase is reported at the click where the cell stays pressable (#1836)', () => {
  test('the refused hit keeps its velocity drag, and a plain click is reported, not swallowed', async ({
    page,
  }) => {
    await openSequencer(page, ONE_BAR)
    const sd = (await litKeys(page)).filter((c) => c.key.startsWith('1:'))
    expect(sd.length, 'the `sd` lane draws two hits from one token').toBe(2)
    const cell = await litCell(page, sd[0].key)
    // Pressable (velocity is in scope) and still titled with why the click cannot erase.
    await expect(cell.loc).not.toHaveAttribute('aria-disabled', 'true')
    await expect(cell.loc).toHaveAttribute('title', /plays in more than one box/)

    await page.mouse.click(cell.x, cell.y)
    await page.waitForTimeout(700)
    expect(await editorValue(page), 'a refused erase must not write').toBe(ONE_BAR)
    await expectRefusalReported(page, "Couldn't remove that hit")
  })

  test('the removable hit on the same grid erases and stays quiet', async ({ page }) => {
    await openSequencer(page, ONE_BAR)
    const cell = await litCell(page, '0:0')
    await expect(cell.loc).not.toHaveAttribute('title', /.+/)

    await page.mouse.click(cell.x, cell.y)
    await expect
      .poll(() => editorValue(page), { message: 'the accepted erase must write' })
      .not.toBe(ONE_BAR)
    await expectNoRefusalReported(page)
  })
})
