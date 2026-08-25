/**
 * Placing a note is gated on whether the document keeps it (#1333).
 *
 * WHY A BROWSER TEST. The rule is swept at model level over the whole corpus, but what no
 * model-level check can see is whether the PANEL passes the option at all. A placement that
 * silently stayed on the cheap rule would leave every corpus arm green and the click still
 * broken, because the arms call the writer directly.
 *
 * Unlike resize, placement has no cadence question to get wrong — it is one click, so the
 * check gates the write itself rather than deferring to gesture commit.
 *
 * THE FIXTURE is a corpus mini, and the pair is ADJACENT CELLS ON ONE ROW:
 *
 *     <c2*2 g2*5 [a g]>        30 columns, 3 bars, 9 notes
 *
 *   c2 column 10   accepted — the document gains the note, spelled `[g2,c2]@2`
 *   c2 column 11   refused  — ungated it wrote `<c2*2 [g2@2 g2@2 g2@2 g2@2 g2@2] [a g]>`,
 *                             which parses, re-spells `g2*5` for nothing, and does NOT
 *                             contain the note the click just made
 *
 * ⚠ THE PAIR IS THE POINT, and same-row adjacency is what makes it tight: "column 11 wrote
 * nothing" cannot be read as "this row is not clickable" or "the roll never received the
 * gesture" when column 10, one cell away on the same row in the same render, writes.
 */
import { test, expect, type Page } from '@playwright/test'
import { bootApp, seedCode, editorValue } from './_appBoot'

const CODE = '$: note("<c2*2 g2*5 [a g]>")'
/** the accepted click — c2 joins the first g2 pair as a chord */
const ACCEPTED = '$: note("<c2*2 [[g2,c2]@2 g2@2 g2@2 g2@2 g2@2] [a g]>")'

async function openRoll(page: Page, code: string) {
  await bootApp(page, { drawer: { tabId: 'pattern', height: 520 } })
  await seedCode(page, code)
  const grid = page.locator('[data-bottom-panel-tab="piano-roll"]')
  await expect(grid, `the roll must open for ${code}`).toHaveCount(1)
  return grid
}

/** Centre of a roll cell. Fails loudly — an un-addressable cell means the fixture moved. */
async function cell(page: Page, key: string): Promise<{ x: number; y: number }> {
  const loc = page.locator(`[data-bottom-panel-tab="piano-roll"] [data-roll-cell="${key}"]`)
  await expect(loc, `roll cell ${key} must be drawn`).toHaveCount(1)
  const b = await loc.boundingBox()
  if (!b) throw new Error(`roll cell ${key} has no box`)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

test.describe('a placed note is only written where the document keeps it (#1333)', () => {
  test('the accepted cell places the note, and the document holds it', async ({ page }) => {
    await openRoll(page, CODE)
    const at = await cell(page, '36:10')
    await page.mouse.click(at.x, at.y)
    await expect.poll(() => editorValue(page)).toBe(ACCEPTED)
  })

  test('the adjacent cell, whose note the document would not keep, writes nothing at all', async ({
    page,
  }) => {
    await openRoll(page, CODE)

    // The positive half FIRST, in this same render: the row takes a click one cell away.
    // Without it the assertion below is satisfied by any broken gesture.
    const ok = await cell(page, '36:10')
    await page.mouse.click(ok.x, ok.y)
    await expect
      .poll(() => editorValue(page), { message: 'the row must accept a click at column 10' })
      .toBe(ACCEPTED)

    // Back to the original, so the refusal is measured against a known document.
    await seedCode(page, CODE)
    await expect.poll(() => editorValue(page)).toBe(CODE)

    const refused = await cell(page, '36:11')
    await page.mouse.click(refused.x, refused.y)

    // Ungated this wrote a re-spelled pattern that does not contain the placed note.
    // Gated, the click leaves the document byte-identical rather than damaging it.
    await expect
      .poll(() => editorValue(page), {
        message: 'a placement the document would not keep must not be written',
      })
      .toBe(CODE)
  })
})
