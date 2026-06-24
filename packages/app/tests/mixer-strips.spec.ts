/**
 * Mixer channel-strip row — S0 (#540). Read-only projection: one strip per
 * top-level statement, cursor-independent, with name / source / pan / gain
 * readouts derived purely from the document.
 *
 * The strip band shares the Pattern ▸ Mixer column with the #381 param panel,
 * which keeps priority in a short drawer — so these assert the strips' presence
 * and content in the DOM (always rendered, scrollable) rather than fixed screen
 * coordinates.
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
  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('[data-bottom-panel="toggle"]').click()
  await drawer.locator('role=tab[name="Pattern"]').click()
  return drawer
}

test.describe('Mixer strip row (#540 / S0)', () => {
  test('renders one strip per top-level statement, in source order', async ({ page }) => {
    await boot(page)
    await setStrudelCode(
      page,
      ['$: s("bd sn")', 'd1: note("c e g").sound("piano")', '$: s("hh*4")'].join('\n'),
    )
    const drawer = await openMixer(page)
    const strips = drawer.locator('[data-mixer-strip]')
    await expect(strips).toHaveCount(3)
    // names: anonymous $: fall back to head/source; the named track keeps its label
    await expect(strips.nth(1).locator('[data-mixer-strip-name]')).toHaveText('d1')
    await expect(strips.nth(1).locator('[data-mixer-strip-source]')).toContainText('note("c e g")')
    // kinds projected from the head fn
    await expect(strips.nth(0)).toHaveAttribute('data-mixer-strip-kind', 'step')
    await expect(strips.nth(1)).toHaveAttribute('data-mixer-strip-kind', 'roll')
  })

  test('reads gain as a dB fader readout, pan as L/C/R', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd").gain(1).pan(0.8)')
    const drawer = await openMixer(page)
    const strip = drawer.locator('[data-mixer-strip]').first()
    await expect(strip.locator('[data-mixer-strip-db]')).toHaveText('0.0') // gain 1 = 0 dB
    await expect(strip.locator('[data-mixer-strip-pan]')).toHaveText('R60') // 0.8 → R60
  })

  test('hands off a signal gain (fader disabled, shown as "sig")', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd").gain(sine)')
    const drawer = await openMixer(page)
    const strip = drawer.locator('[data-mixer-strip]').first()
    await expect(strip.locator('[data-mixer-strip-gain]')).toHaveText('sig')
  })

  test('re-derives the strip list when the document changes (pure projection)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd")')
    const drawer = await openMixer(page)
    await expect(drawer.locator('[data-mixer-strip]')).toHaveCount(1)
    await setStrudelCode(page, '$: s("bd")\n$: s("hh")\nd1: note("c e")')
    await expect(drawer.locator('[data-mixer-strip]')).toHaveCount(3)
  })
})
