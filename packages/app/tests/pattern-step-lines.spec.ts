/**
 * The Pattern tab draws the steps AS WRITTEN, and a ruler that counts them (#1841).
 *
 * Stage 1 of the pattern-grid epic (#1832), visuals only: the lines and labels come from
 * the regions the parser already records for the writers, re-expressed in drawn columns.
 * `bd [~ bd] sd ~` is eight columns and four written steps, and used to look like eight.
 *
 * WHY A BROWSER TEST. `writtenSteps.test.ts` pins the columns; only a rendered panel can
 * show that a line is actually drawn in the gap before its cell (and not before a plain
 * column), that the ruler's labels sit over the right cells, and that the ruler follows
 * the row the cursor is on when `,`-parts split the bar differently.
 */
import { test, expect, type Locator, type Page } from '@playwright/test'
import { bootApp, seedCode } from './_appBoot'

async function open(page: Page, code: string, tab: 'sequencer' | 'piano-roll'): Promise<Locator> {
  await bootApp(page, { drawer: { tabId: 'pattern', height: 460 } })
  await seedCode(page, code)
  const panel = page.locator(`[data-bottom-panel-tab="${tab}"]`)
  await expect(panel, `the ${tab} must open for ${code}`).toHaveCount(1)
  return panel
}

/** the ruler's labels, as `column=text` */
async function ruler(panel: Locator, attr: string): Promise<string[]> {
  return panel
    .locator(`[${attr}]`)
    .evaluateAll((els, a) => els.map((e) => `${e.getAttribute(a)}=${e.textContent}`), attr)
}

/** the drawn line in the gap before a cell: its box-shadow, or 'none' */
async function lineBefore(cell: Locator): Promise<string> {
  return cell.evaluate((e) => getComputedStyle(e).boxShadow)
}

test.describe('sequencer: step lines and a step ruler (#1841)', () => {
  test('a group inside a step: four written steps over eight columns', async ({ page }) => {
    const seq = await open(page, '$: s("bd [~ bd] sd ~")', 'sequencer')
    expect(await ruler(seq, 'data-seq-ruler-label')).toEqual(['0=1', '2=1.2', '4=1.3', '6=1.4'])

    // a line in the gap before each written step, in every row, and none before a plain column
    const starts = await seq
      .locator('[role="gridcell"][data-seq-step-start="true"] > [data-seq-cell]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-seq-cell')))
    expect(starts).toEqual(['0:2', '0:4', '0:6', '1:2', '1:4', '1:6'])
    const cellBox = (key: string) => seq.locator(`[role="gridcell"]:has(> [data-seq-cell="${key}"])`)
    expect(await lineBefore(cellBox('0:2'))).not.toBe('none')
    expect(await lineBefore(cellBox('0:1'))).toBe('none')
  })

  test('rows from different parts draw their own lines, and the ruler follows the cursor row', async ({
    page,
  }) => {
    // `bd sd` splits the bar in two, `hh hh hh` in three: 6 shared columns
    const seq = await open(page, '$: s("bd sd, hh hh hh")', 'sequencer')
    const starts = await seq
      .locator('[role="gridcell"][data-seq-step-start="true"] > [data-seq-cell]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-seq-cell')))
    // rows: bd (part 0), sd (part 0), hh (part 1)
    expect(starts).toEqual(['0:3', '1:3', '2:2', '2:4'])

    // no cursor yet: the first row's steps
    expect(await ruler(seq, 'data-seq-ruler-label')).toEqual(['0=1', '3=1.2'])
    // move the cursor to the hh row with the real keys
    await seq.locator('[data-seq-cell="1:0"]').focus()
    await page.keyboard.press('ArrowDown')
    await expect(seq.locator('[role="gridcell"][aria-selected="true"] > [data-seq-cell="2:0"]')).toHaveCount(1)
    await expect.poll(() => ruler(seq, 'data-seq-ruler-label')).toEqual(['0=1', '2=1.2', '4=1.3'])
  })

  test('`@` counts as steps the way Strudel does: `bd@3 sd` is four (#1845)', async ({ page }) => {
    const seq = await open(page, '$: s("bd@3 sd")', 'sequencer')
    expect(await ruler(seq, 'data-seq-ruler-label')).toEqual(['0=1', '1=1.2', '2=1.3', '3=1.4'])
    // a step line inside the held kick, as well as before the snare
    const starts = await seq
      .locator('[role="gridcell"][data-seq-step-start="true"] > [data-seq-cell]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-seq-cell')))
    expect(starts).toEqual(['0:1', '0:2', '0:3', '1:1', '1:2', '1:3'])
  })

  test('a leaf-read pattern has no written-step regions: bar numbers only, no step lines', async ({ page }) => {
    const seq = await open(page, '$: s("<bd [~ bd]>@2 hh@2 bd <bd ~> [hh bd] [~ hh]")', 'sequencer')
    expect(await ruler(seq, 'data-seq-ruler-label')).toEqual(['0=1', '16=2'])
    await expect(seq.locator('[data-seq-step-start]')).toHaveCount(0)
  })
})

test.describe('piano roll: step lines and a step ruler (#1841)', () => {
  test('a melody with groups: the ruler counts its written steps and the lines sit before them', async ({
    page,
  }) => {
    const roll = await open(page, '$: note("c4 [e4 g4] a4 [b4 c5 d5]").s("piano")', 'piano-roll')
    expect(await ruler(roll, 'data-roll-ruler-label')).toEqual(['0=1', '6=1.2', '12=1.3', '18=1.4'])
    const cols = await roll
      .locator('[role="gridcell"][data-roll-step-start="true"] > [data-roll-cell]')
      .evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-roll-cell')!.split(':')[1]))])
    expect(cols).toEqual(['6', '12', '18'])
  })

  test('a bar line and a written-step line are drawn differently; a plain column has none', async ({ page }) => {
    // two bars (the `< >` step alternates), each with four written steps
    const roll = await open(page, '$: note("c4 [e4 g4] <a4 b4> c5").s("piano")', 'piano-roll')
    const labels = await ruler(roll, 'data-roll-ruler-label')
    const colOf = (text: string) => labels.find((l) => l.endsWith(`=${text}`))!.split('=')[0]
    const cellAt = (col: string) => roll.locator(`[role="gridcell"]:has(> [data-roll-cell$=":${col}"])`).first()
    const bar = await lineBefore(cellAt(colOf('2')))
    const step = await lineBefore(cellAt(colOf('1.2')))
    const plain = await lineBefore(cellAt(String(Number(colOf('1.2')) + 1)))
    expect(bar).not.toBe('none')
    expect(step).not.toBe('none')
    expect(bar, 'the bar line must be stronger than a step line, not the same line').not.toBe(step)
    expect(plain).toBe('none')
  })
})
