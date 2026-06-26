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
  test('shows a knob per numeric chain arg; gain/pan are strip-owned (#575)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd").gain(0.6).pan(0.2).lpf(800).room(0.4)')
    const drawer = await openMixer(page)
    await expect(drawer.locator('[data-knob="lpf"]')).toHaveCount(1)
    await expect(drawer.locator('[data-knob="room"]')).toHaveCount(1)
    // gain + pan live on the strip fader / pan row — never an auto-knob here.
    await expect(drawer.locator('[data-knob="gain"]')).toHaveCount(0)
    await expect(drawer.locator('[data-knob="pan"]')).toHaveCount(0)
  })

  test('dragging a knob changes only the literal, in one undo step', async ({ page }) => {
    await boot(page)
    const original = '$: s("bd").room(0.4)'
    await setStrudelCode(page, original)
    const drawer = await openMixer(page)
    const slider = drawer.locator('[data-knob="room"] [role="slider"]')
    await expect(slider).toHaveCount(1)

    // Drag the dial upward → room increases.
    const box = await slider.boundingBox()
    if (!box) throw new Error('no knob box')
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx, cy - 40, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(80)

    // Only the literal changed — everything around `room(<n>)` is byte-identical.
    // (Assert on the document, not the slider's aria, which can lag a render
    // behind the final write.)
    const after = await strudelValue(page)
    const match = after.match(/^\$: s\("bd"\)\.room\((\d*\.?\d+)\)$/)
    expect(match, `unexpected doc after drag: ${after}`).not.toBeNull()
    expect(Number(match![1])).toBeGreaterThan(0.4)
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

  test('gain never surfaces a drawer knob — the strip fader owns it (scalar/per-column/signal) (#575)', async ({
    page,
  }) => {
    await boot(page)
    const drawer = await openMixer(page)
    // scalar
    await setStrudelCode(page, '$: s("bd").gain(0.5)')
    await expect(drawer.locator('[data-knob="gain"]')).toHaveCount(0)
    // per-column managed (what a cell drag writes) — the strip fader rescales it
    // proportionally (mixer-strips.spec covers the fader); the drawer shows nothing.
    await setStrudelCode(page, '$: s("bd*8").gain("1 1 1 1 0.625 1 1 1")')
    await expect(drawer.locator('[data-knob="gain"]')).toHaveCount(0)
    // signal
    await setStrudelCode(page, '$: s("bd*8").gain(sine)')
    await expect(drawer.locator('[data-knob="gain"]')).toHaveCount(0)
  })

  test('＋More menu adds an effect; search filters (#575)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd")')
    const drawer = await openMixer(page)
    await drawer.locator('[data-mixer-add-effect]').click()
    // the popover is portaled to <body> (escapes the drawer's overflow clip)
    const menu = page.locator('[data-mixer-add-effect-menu]')
    await expect(menu).toBeVisible()
    // search narrows to the bitcrush entry; reverb (room) drops out
    await menu.locator('[data-mixer-add-effect-search]').fill('crush')
    await expect(menu.locator('[data-mixer-add-effect-item="crush"]')).toBeVisible()
    await expect(menu.locator('[data-mixer-add-effect-item="room"]')).toHaveCount(0)
    await menu.locator('[data-mixer-add-effect-item="crush"]').click()
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: s("bd").crush(8)')
    await expect(drawer.locator('[data-knob="crush"]')).toHaveCount(1)
  })

  test('the menu marks an aliased call active (.cutoff → Low-pass) (#575)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd").cutoff(900)')
    const drawer = await openMixer(page)
    await drawer.locator('[data-mixer-add-effect]').click()
    await expect(
      page.locator('[data-mixer-add-effect-menu] [data-mixer-add-effect-item="lpf"]'),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  test('the × on a knob removes that effect; sibling byte-identical (#575)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd").lpf(800).room(0.4)')
    const drawer = await openMixer(page)
    await expect(drawer.locator('[data-knob="lpf"]')).toHaveCount(1)
    await drawer.locator('[data-knob="lpf"] [data-knob-remove="lpf"]').click()
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: s("bd").room(0.4)')
    await expect(drawer.locator('[data-knob="lpf"]')).toHaveCount(0)
  })

  test('standby when the cursor is not in an editable chunk', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '// just a comment')
    const drawer = await openMixer(page)
    await expect(drawer.locator('[data-bottom-panel-tab="mixer-standby"]')).toHaveCount(1)
  })
})
