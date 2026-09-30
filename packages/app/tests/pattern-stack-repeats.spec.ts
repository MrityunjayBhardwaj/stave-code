/**
 * A `,`-pattern whose parts are written over different numbers of bars (#1849).
 *
 * `<[bd ~ bd ~] [bd ~ ~ bd]>, ~ sd ~ sd, hh*8` plays two bars: the kick is written over
 * two, the snare and hats over one and played again in bar 2. The step grid used to read
 * it leaf by leaf and lock 44 of its 48 cells. Now every bar is its own: a click in bar 2
 * changes bar 2 only, the edited part is written `<bar1 bar2>`, and it goes back to one
 * bar when the two agree again.
 *
 * WHY A BROWSER TEST. The unit tests pin the writer; only the panel can show that the
 * grid on screen agrees with the text after the click — so every click here is followed
 * by a look at the OTHER bar, not only the cell that was clicked.
 */
import { test, expect, type Locator, type Page } from '@playwright/test'
import { bootApp, seedCode, editorValue } from './_appBoot'

const KICK = '<[bd ~ bd ~] [bd ~ ~ bd]>'
const BEAT = `$: s("${KICK}, ~ sd ~ sd, hh*8")`

async function open(page: Page, code: string): Promise<Locator> {
  await bootApp(page, { drawer: { tabId: 'pattern', height: 460 }, gridMode: 'lcm' })
  await seedCode(page, code)
  const seq = page.locator('[data-bottom-panel-tab="sequencer"]')
  await expect(seq, `the sequencer must open for ${code}`).toHaveCount(1)
  return seq
}
const cell = (seq: Locator, label: string): Locator => seq.locator(`[data-seq-cell][aria-label="${label}"]`)

test.describe('a comma pattern with a `<…>` part (#1849)', () => {
  test('opens editable, every bar drawn alike', async ({ page }) => {
    const seq = await open(page, BEAT)
    // 48 cells; the 8 still locked are adds ON a coarser part's own column, which the
    // one-bar `bd sd, hh*4` refuses the same way (#1853) — not this pattern's shape
    await expect(seq.locator('[data-seq-cell]')).toHaveCount(48)
    await expect(seq.locator('[data-seq-cell-inert="true"]')).toHaveCount(8)
    await expect(cell(seq, 'sd step 15')).toHaveAttribute('aria-pressed', 'true')
    await expect(cell(seq, 'sd step 15')).not.toHaveAttribute('title', /.*/)
  })

  test('a click in bar 2 of the snare changes bar 2 only', async ({ page }) => {
    const seq = await open(page, BEAT)
    await cell(seq, 'sd step 15').click()
    await expect.poll(() => editorValue(page)).toBe(`$: s("${KICK}, <[~ sd ~ sd] [~ sd ~ ~]>, hh*8")`)
    await expect(cell(seq, 'sd step 15')).toHaveAttribute('aria-pressed', 'false')
    // bar 1 kept its snare, on screen as in the text
    await expect(cell(seq, 'sd step 7')).toHaveAttribute('aria-pressed', 'true')
    await expect(cell(seq, 'sd step 11')).toHaveAttribute('aria-pressed', 'true')
  })

  test('a hat removed in bar 2 and put back: <hh*8 […]>, then hh*8 again', async ({ page }) => {
    const seq = await open(page, BEAT)
    await cell(seq, 'hh step 12').click()
    await expect
      .poll(() => editorValue(page))
      .toBe(`$: s("${KICK}, ~ sd ~ sd, <hh*8 [hh hh hh ~ hh hh hh hh]>")`)
    await expect(cell(seq, 'hh step 4')).toHaveAttribute('aria-pressed', 'true')
    await cell(seq, 'hh step 12').click()
    await expect.poll(() => editorValue(page)).toBe(BEAT)
    await expect(cell(seq, 'hh step 12')).toHaveAttribute('aria-pressed', 'true')
  })

  test('an edit to the part written over two bars changes that bar only', async ({ page }) => {
    const seq = await open(page, BEAT)
    await cell(seq, 'bd step 12').click()
    await expect
      .poll(() => editorValue(page))
      .toBe('$: s("<[bd ~ bd ~] [bd _ ~ bd ~ ~ bd _]>, ~ sd ~ sd, hh*8")')
    await expect(cell(seq, 'bd step 4')).toHaveAttribute('aria-pressed', 'false')
  })

  test('CONTROL: a comma pattern that plays one bar is edited as before', async ({ page }) => {
    const seq = await open(page, '$: s("bd sd, hh*4")')
    await expect(seq.locator('[data-seq-cell]')).toHaveCount(12)
    await cell(seq, 'hh step 2').click()
    await expect.poll(() => editorValue(page)).toBe('$: s("bd sd, [hh ~ hh hh]")')
  })
})
