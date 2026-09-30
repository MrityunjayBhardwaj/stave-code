/**
 * A `,`-pattern whose parts are written over different numbers of bars (#1849).
 *
 * `<[bd ~ bd ~] [bd ~ ~ bd]>, ~ sd ~ sd, hh*8` plays two bars: the kick is written over
 * two, the snare and hats over one and played again in bar 2. The step grid used to read
 * it leaf by leaf and lock 44 of its 48 cells. Now each part keeps its own reading: bar 2
 * of the snare and hats is drawn as a REPEAT, and a click there edits the one bar that is
 * written — the text changes once and every repeat follows, in the text AND on screen.
 *
 * WHY A BROWSER TEST. The unit tests pin the writer; only the panel can show that the
 * grid on screen agrees with the text after the click (a panel that kept its own edited
 * model drew bar 1 unchanged while the text had removed it), and that a repeat is marked.
 */
import { test, expect, type Locator, type Page } from '@playwright/test'
import { bootApp, seedCode, editorValue } from './_appBoot'

const BEAT = '$: s("<[bd ~ bd ~] [bd ~ ~ bd]>, ~ sd ~ sd, hh*8")'

async function open(page: Page, code: string): Promise<Locator> {
  await bootApp(page, { drawer: { tabId: 'pattern', height: 460 } })
  await seedCode(page, code)
  const seq = page.locator('[data-bottom-panel-tab="sequencer"]')
  await expect(seq, `the sequencer must open for ${code}`).toHaveCount(1)
  return seq
}
const cell = (seq: Locator, label: string): Locator => seq.locator(`[data-seq-cell][aria-label="${label}"]`)

test.describe('a comma pattern with a `<…>` part (#1849)', () => {
  test('opens editable, with the one-bar parts drawn as repeats in bar 2', async ({ page }) => {
    const seq = await open(page, BEAT)
    // 48 cells; the 8 still locked are adds ON a coarser part's own column, which the
    // one-bar `bd sd, hh*4` refuses the same way — not this pattern's shape
    await expect(seq.locator('[data-seq-cell]')).toHaveCount(48)
    await expect(seq.locator('[data-seq-cell-inert="true"]')).toHaveCount(8)
    // bar 2 of the snare and the hats: 8 + 8 repeat cells; the kick is written there
    await expect(seq.locator('[data-seq-repeat]')).toHaveCount(16)
    await expect(cell(seq, 'sd step 11')).toHaveAttribute('data-seq-repeat', '1')
    await expect(cell(seq, 'bd step 11')).not.toHaveAttribute('data-seq-repeat', /.*/)
  })

  test('a click in a repeat edits the written bar: the text changes once, both bars follow', async ({
    page,
  }) => {
    const seq = await open(page, BEAT)
    await expect(cell(seq, 'sd step 3')).toHaveAttribute('aria-pressed', 'true')
    await cell(seq, 'sd step 11').click()
    await expect.poll(() => editorValue(page)).toBe('$: s("<[bd ~ bd ~] [bd ~ ~ bd]>, ~ ~ ~ sd, hh*8")')
    // the grid agrees with the text: bar 1's snare went too, not only the one clicked
    await expect(cell(seq, 'sd step 11')).toHaveAttribute('aria-pressed', 'false')
    await expect(cell(seq, 'sd step 3')).toHaveAttribute('aria-pressed', 'false')
    await expect(cell(seq, 'sd step 7')).toHaveAttribute('aria-pressed', 'true')
  })

  test('an edit to the part written over two bars changes that bar only', async ({ page }) => {
    const seq = await open(page, BEAT)
    await cell(seq, 'bd step 12').click()
    await expect
      .poll(() => editorValue(page))
      .toBe('$: s("<[bd ~ bd ~] [bd _ ~ bd ~ ~ bd _]>, ~ sd ~ sd, hh*8")')
    await expect(cell(seq, 'bd step 4')).toHaveAttribute('aria-pressed', 'false')
  })

  test('CONTROL: a comma pattern that plays one bar has no repeats', async ({ page }) => {
    const seq = await open(page, '$: s("bd sd, hh*4")')
    await expect(seq.locator('[data-seq-cell]')).toHaveCount(12)
    await expect(seq.locator('[data-seq-repeat]')).toHaveCount(0)
  })
})
