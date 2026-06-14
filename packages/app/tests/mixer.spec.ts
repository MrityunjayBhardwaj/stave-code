/**
 * Mixer tab — #381. The first write-back panel, end-to-end proof of the spine.
 *
 * Observes (AnviDev: verify AND observe) that dragging a knob:
 *   - changes ONLY the numeric literal it targets (the mini-notation and the
 *     rest of the statement stay byte-identical — surgical text edit);
 *   - is a single undo step (one Ctrl-Z reverts the whole drag).
 *
 * Audio update on edit rides the existing live-mode re-eval (content change →
 * debounced evaluate) and is exercised manually, not asserted here.
 */
import { test, expect, type Page } from '@playwright/test'

async function boot(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 15_000 })
  // Wait for Monaco to mount a Strudel editor before driving it.
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } })
        .monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 15_000 },
  )
}

async function setStrudelCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } })
      .monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
      setPosition: (p: { lineNumber: number; column: number }) => void
    }>
    const target =
      editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    if (!target) return false
    target.getModel()?.setValue(c)
    target.setPosition({ lineNumber: 1, column: 1 })
    target.focus()
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(150)
}

async function strudelValue(page: Page): Promise<string> {
  return page.evaluate(() => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } })
      .monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; getValue: () => string } | null
    }>
    const target =
      editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    return target?.getModel()?.getValue() ?? ''
  })
}

async function undo(page: Page): Promise<void> {
  await page.evaluate(() => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } })
      .monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string } | null
      trigger: (source: string, id: string, payload: unknown) => void
    }>
    const target =
      editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    target?.trigger('test', 'undo', null)
  })
  await page.waitForTimeout(50)
}

async function openMixer(page: Page) {
  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('[data-bottom-panel="toggle"]').click()
  await drawer.locator('role=tab[name="Mixer"]').click()
  return drawer
}

test.describe('Mixer (#381)', () => {
  test('shows a knob per numeric chain arg', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd").gain(0.6).room(0.4)')
    const drawer = await openMixer(page)
    await expect(drawer.locator('[data-knob="gain"]')).toHaveCount(1)
    await expect(drawer.locator('[data-knob="room"]')).toHaveCount(1)
    await expect(drawer.locator('[data-knob="gain"] [role="slider"]')).toHaveAttribute(
      'aria-valuenow',
      '0.6',
    )
  })

  test('dragging a knob changes only the literal, in one undo step', async ({ page }) => {
    await boot(page)
    const original = '$: s("bd").gain(0.6)'
    await setStrudelCode(page, original)
    const drawer = await openMixer(page)
    const slider = drawer.locator('[data-knob="gain"] [role="slider"]')
    await expect(slider).toHaveCount(1)

    // Drag the dial upward → gain increases.
    const box = await slider.boundingBox()
    if (!box) throw new Error('no knob box')
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx, cy - 40, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(80)

    // Only the literal changed — everything around `gain(<n>)` is byte-identical.
    // (Assert on the document, not the slider's aria, which can lag a render
    // behind the final write.)
    const after = await strudelValue(page)
    const match = after.match(/^\$: s\("bd"\)\.gain\((\d*\.?\d+)\)$/)
    expect(match, `unexpected doc after drag: ${after}`).not.toBeNull()
    expect(Number(match![1])).toBeGreaterThan(0.6)

    // One undo reverts the WHOLE drag (not just the last increment).
    await undo(page)
    expect(await strudelValue(page)).toBe(original)
  })

  test('standby when the cursor is not in an editable chunk', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '// just a comment')
    const drawer = await openMixer(page)
    await expect(drawer.locator('[data-bottom-panel-tab="mixer-standby"]')).toHaveCount(1)
  })
})
