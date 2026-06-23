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

    await setRange(insp.locator('[data-inspector-velocity]'), 64)
    await page.waitForTimeout(120)
    await expect(insp.locator('[data-inspector-value="velocity"]')).toHaveText('64')
    expect(await strudelValue(page)).toContain('.gain(')

    expect(errors).toEqual([])
  })
})
