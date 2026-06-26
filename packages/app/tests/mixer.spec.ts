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
  await drawer.locator('role=tab[name="Pattern"]').click()
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
    // The knob readout reconciles with the literal it wrote (no one-step lag).
    await expect(slider).toHaveAttribute('aria-valuenow', match![1])

    // One undo reverts the WHOLE drag (not just the last increment).
    await undo(page)
    expect(await strudelValue(page)).toBe(original)
  })

  test('quick-transform toggles an effect on, then off, surfacing/removing its knob (#390)', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd")')
    const drawer = await openMixer(page)
    const room = drawer.locator('[data-mixer-transform="room"]')
    // a bare pattern shows the transform row even with no knobs yet
    await expect(room).toHaveCount(1)

    // click ON: appends the effect, surfaces its knob, marks the toggle pressed
    await room.click()
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: s("bd").room(0.4)')
    await expect(drawer.locator('[data-knob="room"]')).toHaveCount(1)
    await expect(room).toHaveAttribute('aria-pressed', 'true')

    // click OFF (#390 toggle): removes the call AND its knob; doc back to bare
    await room.click()
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: s("bd")')
    await expect(drawer.locator('[data-knob="room"]')).toHaveCount(0)
    await expect(room).toHaveAttribute('aria-pressed', 'false')
  })

  test('per-column .gain("…") surfaces a master knob that rescales every column (#478)', async ({
    page,
  }) => {
    await boot(page)
    // A per-step velocity (what a cell drag writes). Before #478 this fell to a
    // dead state: no knob (string arg) + `+ gain` disabled (gain present).
    await setStrudelCode(page, '$: s("bd*8").gain("1 1 1 1 0.625 1 1 1")')
    const drawer = await openMixer(page)

    const slider = drawer.locator('[data-knob="gain"] [role="slider"]')
    await expect(drawer.locator('[data-knob="gain"]')).toHaveCount(1) // the fix
    await expect(slider).toHaveAttribute('aria-valuenow', '1') // ceiling = loudest column

    // Drag the master knob DOWN → every column rescales proportionally.
    const box = await slider.boundingBox()
    if (!box) throw new Error('no knob box')
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx, cy + 60, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(120)

    const after = await strudelValue(page)
    const m = after.match(/^\$: s\("bd\*8"\)\.gain\("([^"]+)"\)$/)
    expect(m, `unexpected doc after drag: ${after}`).not.toBeNull()
    const cols = m![1].split(' ').map(Number)
    expect(cols).toHaveLength(8) // mini + column count intact
    const ceiling = Math.max(...cols)
    expect(ceiling).toBeLessThan(1) // dragged down
    // the softened column (index 4) stays the lowest, at the original 0.625 ratio
    expect(cols[4]).toBeLessThan(ceiling)
    expect(cols[4] / ceiling).toBeCloseTo(0.625, 2)
  })

  test('a signal .gain still shows no knob — only managed numeric gains scale (#478)', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd*8").gain(sine)')
    const drawer = await openMixer(page)
    await expect(drawer.locator('[data-knob="gain"]')).toHaveCount(0)
  })

  test('standby when the cursor is not in an editable chunk', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '// just a comment')
    const drawer = await openMixer(page)
    await expect(drawer.locator('[data-bottom-panel-tab="mixer-standby"]')).toHaveCount(1)
  })
})
