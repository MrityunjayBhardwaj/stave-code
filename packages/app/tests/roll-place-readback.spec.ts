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

/**
 * AND THE REFUSAL SAYS SO (#1336).
 *
 * #1322 removed the invisible decline from this surface by gating the length handle, so
 * the gesture was never offered where it could not write. The readback gate reinstated the
 * same experience through a different door: the affordance is legitimately offered, the
 * writer accepts the gesture, and then the document declines to keep it — silently.
 *
 * ⚠ WHY REPORTING RATHER THAN GATING THE AFFORDANCE, measured rather than preferred. There
 * is no per-cell admissibility seam on this panel at all (`viewPlacesNotes` once per view,
 * `overlapAt` per cell), and building one costs p99 8,482ms with readback in it — against
 * the p99 21.7ms at which #1072 already declined a per-cell map here. The per-column lever
 * #1072 suggested is sound (2 of 7,984 columns are mixed) and still lands at p99 546ms,
 * the figure that made #1324 unshippable, recomputed every drag frame. Both gates are off
 * the table for different reasons, and resize could not be gated at offer time regardless
 * — its refusal depends on the length the drag ends at.
 *
 * ⚠ THE COUNT IS READ AS A DELTA, never as an absolute. Boot emits its own warnings (a
 * slow sample manifest will add more), so pinning "1 warning" would be pinning the
 * environment. The pair of arms is what makes the delta mean something: the refused click
 * adds one, and the accepted click on the same fixture adds none.
 */
const warnCount = async (page: Page): Promise<number> => {
  const title = await page
    .locator('[data-testid="statusbar-console-chip"]')
    .getAttribute('title')
  const m = /(\d+) warnings/.exec(title ?? '')
  return m ? Number(m[1]) : 0
}

test.describe('a refused roll gesture is reported, not swallowed (#1336)', () => {
  test('the refused placement raises exactly one warning', async ({ page }) => {
    await openRoll(page, CODE)
    const before = await warnCount(page)

    const refused = await cell(page, '36:11')
    await page.mouse.click(refused.x, refused.y)

    await expect
      .poll(() => warnCount(page), {
        message: 'a refused placement must tell the user it did not happen',
      })
      .toBe(before + 1)
  })

  test('the accepted placement raises none — the report tracks the refusal, not the click', async ({
    page,
  }) => {
    await openRoll(page, CODE)
    const before = await warnCount(page)

    const ok = await cell(page, '36:10')
    await page.mouse.click(ok.x, ok.y)
    // PRECONDITION, not an independent pin: if the click never landed, "no warning was
    // raised" would be satisfied by a gesture that did nothing at all.
    await expect
      .poll(() => editorValue(page), { message: 'the accepted click must reach the writer' })
      .toBe(ACCEPTED)

    await expect
      .poll(() => warnCount(page), {
        message: 'an accepted placement must stay quiet',
      })
      .toBe(before)
  })
})
