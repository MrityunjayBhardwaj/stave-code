/**
 * Mixer console zoom bar (#759). A `[-] % [+]` cluster pins to the top of the
 * Mixer console and uniformly scales every channel strip (CSS `zoom`, so the
 * scale is aspect-exact and the fader/pan delta-drags stay intact). "100%" maps
 * to the historical 1.5x console baseline; clicks step ±10%, clamped 50%–200%.
 *
 * These drive the real buttons and MEASURE a strip's rendered box before/after —
 * so they prove the scale actually reaches the DOM (not just the readout) and
 * that width + height grow by the SAME factor (aspect ratio preserved).
 */
import { test, expect, type Page } from '@playwright/test'

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
  const ok = await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
      setPosition: (p: { lineNumber: number; column: number }) => void
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    if (!target) return false
    target.getModel()?.setValue(c)
    target.setPosition({ lineNumber: 1, column: 1 })
    target.focus()
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(150)
}

async function openMixer(page: Page) {
  const root = page.locator('[data-bottom-panel="root"]')
  await root.locator('[data-bottom-panel="toggle"]').click()
  await root.locator('role=tab[name="Mixer"]').click()
  return root.locator('[data-bottom-panel-tab="mixer-console"]')
}

/** the console zoom readout as a number (e.g. 100). */
async function readPercent(drawer: ReturnType<Page['locator']>): Promise<number> {
  const raw = await drawer.locator('[data-mixer-zoom]').getAttribute('data-mixer-zoom')
  return Number(raw)
}

/** the rendered box of the first strip (accounts for CSS `zoom`). */
async function firstStripBox(drawer: ReturnType<Page['locator']>) {
  const box = await drawer.locator('[data-mixer-strip]').first().boundingBox()
  if (!box) throw new Error('no strip box')
  return box
}

test.describe('Mixer console zoom bar (#759)', () => {
  test('starts at 100% and [+] scales every strip up, aspect ratio preserved', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd sn")\nd1: note("c e g").sound("piano")')
    const drawer = await openMixer(page)

    // the bar exists and reads the 1.5x baseline as 100%.
    await expect(drawer.locator('[data-mixer-zoom]')).toHaveCount(1)
    expect(await readPercent(drawer)).toBe(100)
    const before = await firstStripBox(drawer)

    // two +10% clicks → 120%, and the strip's rendered box grows ~1.2x on BOTH
    // axes (aspect ratio held).
    await drawer.locator('[data-mixer-zoom-in]').click()
    await drawer.locator('[data-mixer-zoom-in]').click()
    expect(await readPercent(drawer)).toBe(120)

    const after = await firstStripBox(drawer)
    const wRatio = after.width / before.width
    const hRatio = after.height / before.height
    expect(wRatio).toBeGreaterThan(1.15)
    expect(wRatio).toBeLessThan(1.25)
    // same factor on both axes = natural (aspect-locked) scaling.
    expect(Math.abs(wRatio - hRatio)).toBeLessThan(0.03)
  })

  test('[-] scales back down and the readout tracks; clamps at the 50%–200% bounds', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd sn")')
    const drawer = await openMixer(page)
    const base = await firstStripBox(drawer)

    // up then back down returns to the baseline size.
    await drawer.locator('[data-mixer-zoom-in]').click()
    expect(await readPercent(drawer)).toBe(110)
    await drawer.locator('[data-mixer-zoom-out]').click()
    expect(await readPercent(drawer)).toBe(100)
    const back = await firstStripBox(drawer)
    expect(Math.abs(back.width - base.width)).toBeLessThan(1)

    // step [-] to the floor → 50%; the button disables AT the clamp, so click
    // only while it's still enabled (a disabled-button click would hang).
    const out = drawer.locator('[data-mixer-zoom-out]')
    for (let i = 0; i < 12 && !(await out.isDisabled()); i++) await out.click()
    expect(await readPercent(drawer)).toBe(50)
    await expect(out).toBeDisabled()

    // step [+] to the ceiling → 200%; that button disables at the top.
    const zin = drawer.locator('[data-mixer-zoom-in]')
    for (let i = 0; i < 20 && !(await zin.isDisabled()); i++) await zin.click()
    expect(await readPercent(drawer)).toBe(200)
    await expect(zin).toBeDisabled()
  })

  test('the expand drawer content scales with the zoom, in lockstep with the face (#763)', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, 'd1: note("c e g").lpf(800).room(0.5)')
    const drawer = await openMixer(page)

    // expand d1 so its knob chain (the drawer content) is on screen.
    await drawer.locator('[data-mixer-strip-id="d1"] [data-mixer-strip-expand]').click()
    const knob = drawer.locator('[data-mixer-expand-for="d1"] [data-knob]').first()
    const knob100 = await knob.boundingBox()
    if (!knob100) throw new Error('no drawer knob at 100%')

    // zoom to 200% — the face doubles; the drawer knob must double TOO (before
    // #763 it stayed frozen at 1×, dwarfed in a stretched-tall empty column).
    for (let i = 0; i < 12 && !(await drawer.locator('[data-mixer-zoom-in]').isDisabled()); i++) {
      await drawer.locator('[data-mixer-zoom-in]').click()
    }
    expect(await readPercent(drawer)).toBe(200)
    const knob200 = await knob.boundingBox()
    if (!knob200) throw new Error('no drawer knob at 200%')

    // ~2× on both axes (100% → 200% is a doubling of the user scale).
    expect(knob200.width / knob100.width).toBeGreaterThan(1.8)
    expect(knob200.width / knob100.width).toBeLessThan(2.2)
    expect(knob200.height / knob100.height).toBeGreaterThan(1.8)
    expect(knob200.height / knob100.height).toBeLessThan(2.2)
  })
})
