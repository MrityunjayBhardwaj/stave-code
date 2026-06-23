/**
 * Mixer-as-inspector — #432 Slice 1.
 *
 * Real-browser proof that selecting a note/step in the grid populates the Mixer
 * inspector and that editing its fields writes back to the source:
 *   - Piano Roll: click a note → inspector shows pitch/velocity/position/length;
 *     pitch/position/length steppers + the velocity slider edit the note;
 *   - Sequencer: click a step → inspector shows sound/velocity/position;
 *     the velocity slider writes a `.gain`.
 * Note-part assertions are exact (independent of gain formatting); velocity is
 * verified by the read-back value (write → reseed → resolve loop).
 */
import { test, expect, type Page, type Locator } from '@playwright/test'

async function boot(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 15_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 15_000 },
  )
}

async function setStrudelCode(page: Page, code: string): Promise<void> {
  await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
      setPosition: (p: { lineNumber: number; column: number }) => void
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    target?.getModel()?.setValue(c)
    target?.setPosition({ lineNumber: 1, column: 6 }) // inside the pattern
    target?.focus()
  }, code)
  await page.waitForTimeout(200)
}

async function strudelValue(page: Page): Promise<string> {
  return page.evaluate(() => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; getValue: () => string } | null
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    return target?.getModel()?.getValue() ?? ''
  })
}

async function openPattern(page: Page): Promise<Locator> {
  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('[data-bottom-panel="toggle"]').click()
  await drawer.locator('role=tab[name="Pattern"]').click()
  await page.waitForTimeout(300)
  return drawer
}

/** set an <input type=range> value and fire React's onChange */
async function setRange(loc: Locator, value: number): Promise<void> {
  await loc.evaluate((el, v) => {
    const input = el as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, String(v))
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

test.describe('Mixer-as-inspector (#432)', () => {
  test('Piano Roll: select shows fields; velocity + pitch/position/length edit the note', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ ~ ~")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    const insp = drawer.locator('[data-mixer-inspector]')

    // select c3 → inspector populates
    await grid.locator('[data-roll-cell="48:0"]').click()
    await expect(insp).toBeVisible()
    await expect(insp.locator('[data-inspector-value="pitch"]')).toHaveText('c3')
    await expect(insp.locator('[data-inspector-value="position"]')).toHaveText('1')
    await expect(insp.locator('[data-inspector-value="length"]')).toHaveText('1')
    await expect(insp.locator('[data-inspector-value="velocity"]')).toHaveText('127')

    // velocity slider → writes a .gain; the value reads back through the loop
    await setRange(insp.locator('[data-inspector-velocity]'), 64)
    await page.waitForTimeout(120)
    await expect(insp.locator('[data-inspector-value="velocity"]')).toHaveText('64')
    expect(await strudelValue(page)).toContain('.gain(')

    // pitch up → c3 becomes c#3 (note part is exact regardless of the gain)
    await insp.locator('[data-inspector-step="pitch:up"]').click()
    await page.waitForTimeout(120)
    await expect(insp.locator('[data-inspector-value="pitch"]')).toHaveText('c#3')
    expect(await strudelValue(page)).toContain('note("c#3 ~ ~ ~")')

    // position up → move to step 2
    await insp.locator('[data-inspector-step="position:up"]').click()
    await page.waitForTimeout(120)
    await expect(insp.locator('[data-inspector-value="position"]')).toHaveText('2')
    expect(await strudelValue(page)).toContain('note("~ c#3 ~ ~")')

    // length up → duration 2 (`@2` hold)
    await insp.locator('[data-inspector-step="length:up"]').click()
    await page.waitForTimeout(120)
    await expect(insp.locator('[data-inspector-value="length"]')).toHaveText('2')
    expect(await strudelValue(page)).toContain('note("~ c#3@2 ~")')

    expect(errors).toEqual([])
  })

  test('Sequencer: select shows sound + position; velocity slider writes a .gain', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ sd ~")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    const insp = drawer.locator('[data-mixer-inspector]')

    await grid.locator('[data-seq-cell="0:0"]').click() // select bd step 0
    await expect(insp).toBeVisible()
    await expect(insp.locator('[data-inspector-value="sound"]')).toHaveText('bd')
    await expect(insp.locator('[data-inspector-value="position"]')).toHaveText('1')

    // the Snap division control is Piano-Roll only — the step grid is already
    // cell-quantized, so the Mixer shows no division picker here (#432 Slice 2).
    await expect(drawer.locator('[data-mixer-division-select]')).toHaveCount(0)

    await setRange(insp.locator('[data-inspector-velocity]'), 64)
    await page.waitForTimeout(120)
    await expect(insp.locator('[data-inspector-value="velocity"]')).toHaveText('64')
    expect(await strudelValue(page)).toContain('.gain(')

    expect(errors).toEqual([])
  })

  test('Piano Roll: the Snap division quantizes a move (#432 Slice 2)', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await boot(page)
    // 16-step bar: 1/4 → snap interval 4 columns; 1/8-triplet doesn't divide it.
    await setStrudelCode(page, '$: note("c3 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    const div = drawer.locator('[data-mixer-division-select]')

    // a division that doesn't divide this grid evenly is offered but disabled
    // (honest). `<option disabled>` reads via the attribute — toBeDisabled() is
    // unreliable on options, so assert the rendered attribute directly.
    await expect(div.locator('option[value="1/8T"]')).toHaveAttribute('disabled', '')
    await expect(div.locator('option[value="1/4"]')).not.toHaveAttribute('disabled', '')

    await div.selectOption('1/4')
    await page.waitForTimeout(80)

    // drag c3 (step 0) to step 5 → snaps to the nearest 1/4 line (step 4)
    const from = await grid.locator('[data-roll-cell="48:0"]').boundingBox()
    const to = await grid.locator('[data-roll-cell="48:5"]').boundingBox()
    if (!from || !to) throw new Error('missing cells')
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(120)

    // landed on step 4 (snapped), not 5 (raw); inspector follows it (1-indexed → 5)
    await expect(grid.locator('[data-roll-cell="48:4"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(grid.locator('[data-roll-cell="48:5"]')).toHaveAttribute('aria-pressed', 'false')
    await expect(grid.locator('[data-roll-cell="48:0"]')).toHaveAttribute('aria-pressed', 'false')
    await expect(
      drawer.locator('[data-mixer-inspector] [data-inspector-value="position"]'),
    ).toHaveText('5')

    expect(errors).toEqual([])
  })
})
