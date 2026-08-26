/**
 * Deleting a note is gated on whether the document reopens holding what is left (#1340).
 *
 * WHY A BROWSER TEST. The rule is swept at model level over the whole corpus, but no
 * model-level arm can see whether the PANEL passes the option at all — those arms call the
 * writer directly, so a delete that silently stayed on the cheap spelling rule would leave
 * every corpus arm green and the gesture still destructive.
 *
 * Delete has no cadence question: it is one gesture, so the check gates the write itself
 * rather than deferring to gesture commit the way a resize drag must.
 *
 * THE FIXTURE is a corpus mini, and the pair is TWO NOTES IN ONE COLUMN:
 *
 *     <g1, c1> - <c3, g4 - - >        9 columns, 3 bars
 *
 *   c3, column 2   accepted — the document loses only c3, spelling `<g4 c3 c3>`
 *   g4, column 2   refused  — ungated it wrote `<g1, c1> - <c3, ~ - - >`, which spells
 *                             and parses and reopens holding FEWER notes than the model
 *                             meant, because the rest lands inside the `,`-stack
 *
 * ⚠ THE PAIR IS THE POINT, and same-column adjacency is what makes it tight: "g4 wrote
 * nothing" cannot be read as "this column is not clickable" or "the roll never received the
 * gesture" when c3, in the same column in the same render, writes.
 */
import { test, expect, type Page } from '@playwright/test'
import { bootApp, seedCode, editorValue } from './_appBoot'

const CODE = '$: note("<g1, c1> - <c3, g4 - - >")'
/** the accepted delete — c3 goes, and the bar re-spells without it */
const ACCEPTED = '$: note("<g1, c1> - <g4 c3 c3>")'

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

/** Warnings the status bar has coalesced so far. Read as a DELTA — boot raises its own. */
async function warnCount(page: Page): Promise<number> {
  const title = await page
    .locator('[data-testid="statusbar-console-chip"]')
    .getAttribute('title')
  const m = /(\d+) warnings/.exec(title ?? '')
  return m ? Number(m[1]) : 0
}

test.describe('a note is only deleted where the document keeps the rest (#1340)', () => {
  test('the accepted note is deleted, and the document re-spells without it', async ({ page }) => {
    await openRoll(page, CODE)
    const at = await cell(page, '48:2')
    await page.mouse.click(at.x, at.y)
    await expect.poll(() => editorValue(page)).toBe(ACCEPTED)
  })

  test('the note in the same column, whose removal the document would not keep, writes nothing', async ({
    page,
  }) => {
    await openRoll(page, CODE)
    const at = await cell(page, '67:2')
    await page.mouse.click(at.x, at.y)
    // The document must be BYTE-IDENTICAL to what it was — a refusal leaves it alone.
    await expect
      .poll(() => editorValue(page), {
        message: 'a delete the document would not keep must not be written',
      })
      .toBe(CODE)
  })
})

test.describe('a refused delete is reported, not swallowed (#1340)', () => {
  test('the refused delete raises exactly one warning', async ({ page }) => {
    await openRoll(page, CODE)
    const before = await warnCount(page)

    const at = await cell(page, '67:2')
    await page.mouse.click(at.x, at.y)

    await expect
      .poll(() => warnCount(page), {
        message: 'a refused delete must tell the user it did not happen',
      })
      .toBe(before + 1)
  })

  test('the accepted delete raises none — the report tracks the refusal, not the click', async ({
    page,
  }) => {
    await openRoll(page, CODE)
    const before = await warnCount(page)

    const at = await cell(page, '48:2')
    await page.mouse.click(at.x, at.y)
    // PRECONDITION, not an independent pin: if the click never landed, "no warning was
    // raised" would be satisfied by a gesture that did nothing at all.
    await expect
      .poll(() => editorValue(page), { message: 'the accepted click must reach the writer' })
      .toBe(ACCEPTED)

    await expect
      .poll(() => warnCount(page), { message: 'an accepted delete must stay quiet' })
      .toBe(before)
  })
})
