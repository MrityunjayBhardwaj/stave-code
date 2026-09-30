/**
 * Exact grid mode (#1855): each `,`-part drawn at its own steps.
 *
 * `<[bd ~ bd ~] [bd ~ ~ bd]>, ~ sd ~ sd, hh*8` writes the kick and snare in 4 steps a bar
 * and the hats in 8. LCM cuts every row to 8 cells a bar, so a snare step is 2 cells and
 * a click on an empty one would paint half of it — those 8 cells are locked (#1853). Exact
 * draws the snare as 4 boxes a bar, each 2 hat-cells wide, and a click fills a whole box.
 * It is a view: the text a click writes is what the part's own reading spells.
 *
 * WHY A BROWSER TEST. The unit tests pin the layout and the write; only the panel shows
 * that a box sits over exactly the columns it stands for, that the click on it writes the
 * whole step, and that the setting redraws a grid that is already open.
 */
import { test, expect, type Locator, type Page } from '@playwright/test'
import { bootApp, seedCode, editorValue } from './_appBoot'

const KICK = '<[bd ~ bd ~] [bd ~ ~ bd]>'
const BEAT = `$: s("${KICK}, ~ sd ~ sd, hh*8")`

async function open(page: Page, code: string, gridMode?: 'exact' | 'lcm'): Promise<Locator> {
  await bootApp(page, { drawer: { tabId: 'pattern', height: 460 }, gridMode })
  await seedCode(page, code)
  const seq = page.locator('[data-bottom-panel-tab="sequencer"]')
  await expect(seq, `the sequencer must open for ${code}`).toHaveCount(1)
  return seq
}
const cell = (seq: Locator, label: string): Locator => seq.locator(`[data-seq-cell][aria-label="${label}"]`)

/** Settings › Pattern & Timeline › Grid, through the real modal (see grid-visual-identity) */
async function setGridMode(page: Page, mode: 'exact' | 'lcm'): Promise<string> {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByText('Editor Settings...').click()
  await page.getByTestId('settings-shell').waitFor({ timeout: 5000 })
  await page.getByTestId('settings-nav-pattern').click()
  const select = page.getByTestId('setting-gridMode')
  await select.waitFor({ timeout: 5000 })
  const before = await select.inputValue()
  await select.selectOption(mode)
  await page.getByTestId('settings-shell').getByRole('button', { name: 'Close', exact: true }).click()
  return before
}

test.describe('Exact grid mode (#1855)', () => {
  test('is the default: each part at its own steps, every box editable', async ({ page }) => {
    const seq = await open(page, BEAT)
    // kick 2 bars × 4, snare 2 × 4, hats 2 × 8 — against LCM's 48 cells, 8 of them locked
    await expect(seq.locator('[data-seq-cell]')).toHaveCount(32)
    await expect(seq.locator('[data-seq-cell][data-seq-box-width="2"]')).toHaveCount(16)
    await expect(seq.locator('[data-seq-cell-inert="true"]')).toHaveCount(0)
    await expect(cell(seq, 'sd step 2')).toHaveAttribute('aria-pressed', 'true')
    await expect(cell(seq, 'sd step 3')).toHaveAttribute('aria-pressed', 'false')

    // a snare box stands over exactly the two hat cells of its step
    const box = await cell(seq, 'sd step 2').boundingBox()
    const h3 = await cell(seq, 'hh step 3').boundingBox()
    const h4 = await cell(seq, 'hh step 4').boundingBox()
    expect(Math.abs(box!.x - h3!.x)).toBeLessThan(1)
    expect(Math.abs(box!.x + box!.width - (h4!.x + h4!.width))).toBeLessThan(1)
  })

  test('a click on an empty own step writes the whole step, in that bar only', async ({ page }) => {
    const seq = await open(page, BEAT)
    await cell(seq, 'sd step 1').click()
    await expect.poll(() => editorValue(page)).toBe(`$: s("${KICK}, <[sd sd ~ sd] [~ sd ~ sd]>, hh*8")`)
    await expect(cell(seq, 'sd step 1')).toHaveAttribute('aria-pressed', 'true')
    await expect(cell(seq, 'sd step 5')).toHaveAttribute('aria-pressed', 'false')
    // and off again: the pattern as it was
    await cell(seq, 'sd step 1').click()
    await expect.poll(() => editorValue(page)).toBe(BEAT)
  })

  test('a kick box: the step LCM locked', async ({ page }) => {
    const seq = await open(page, BEAT)
    await cell(seq, 'bd step 2').click()
    await expect.poll(() => editorValue(page)).toBe('$: s("<[bd bd bd ~] [bd ~ ~ bd]>, ~ sd ~ sd, hh*8")')
  })

  test('rows that do not nest: bd*3 against hh*4 draws 3 and 4', async ({ page }) => {
    const seq = await open(page, '$: s("bd*3, hh*4")')
    await expect(seq.locator('[data-seq-cell][aria-label^="bd "]')).toHaveCount(3)
    await expect(seq.locator('[data-seq-cell][aria-label^="hh "]')).toHaveCount(4)
    await cell(seq, 'bd step 2').click()
    await expect.poll(() => editorValue(page)).toBe('$: s("[bd ~ bd], hh*4")')
  })

  test('keys step over a whole box and act on it', async ({ page }) => {
    const seq = await open(page, BEAT)
    await cell(seq, 'sd step 1').focus()
    await page.keyboard.press('ArrowRight')
    await expect(seq.locator('[role="gridcell"][aria-selected="true"] > [data-seq-cell]')).toHaveAttribute(
      'aria-label',
      'sd step 2',
    )
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await expect.poll(() => editorValue(page)).toBe(`$: s("${KICK}, <[~ sd sd sd] [~ sd ~ sd]>, hh*8")`)
  })

  test('the setting redraws an open grid, both ways', async ({ page }) => {
    const seq = await open(page, BEAT)
    await expect(seq.locator('[data-seq-cell]')).toHaveCount(32)
    expect(await setGridMode(page, 'lcm')).toBe('exact')
    await expect(seq.locator('[data-seq-cell]')).toHaveCount(48)
    await expect(seq.locator('[data-seq-cell-inert="true"]')).toHaveCount(8)
    expect(await setGridMode(page, 'exact')).toBe('lcm')
    await expect(seq.locator('[data-seq-cell]')).toHaveCount(32)
    await expect(seq.locator('[data-seq-cell-inert="true"]')).toHaveCount(0)
  })

  test('CONTROL: LCM draws and writes as it always did', async ({ page }) => {
    const seq = await open(page, BEAT, 'lcm')
    await expect(seq.locator('[data-seq-cell]')).toHaveCount(48)
    await expect(seq.locator('[data-seq-cell-inert="true"]')).toHaveCount(8)
    await cell(seq, 'sd step 15').click()
    await expect.poll(() => editorValue(page)).toBe(`$: s("${KICK}, <[~ sd ~ sd] [~ sd ~ ~]>, hh*8")`)
  })

  test('CONTROL: a pattern whose parts share one grid looks the same in both modes', async ({ page }) => {
    const seq = await open(page, '$: s("bd [~ bd] sd ~, hh*8")')
    await expect(seq.locator('[data-seq-cell]')).toHaveCount(24)
    await expect(seq.locator('[data-seq-box-width]')).toHaveCount(0)
  })
})
