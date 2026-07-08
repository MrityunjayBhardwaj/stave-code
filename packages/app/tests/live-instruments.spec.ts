/**
 * Live instrument enumeration (#514 / PV141 #6).
 *
 * Real-browser proof that the Mixer's instrument picker enumerates the engine's
 * LIVE superdough `soundMap` (synths / soundfonts / samples) rather than the
 * curated `soundCatalog.ts` shortlist. After the engine inits and samples load,
 * the picker holds far more than the curated count and is grouped by the live
 * registration type. Observed via the rendered <option> set, not inferred.
 *
 * Network-dependent (CDN sample manifests) so it allows generous settle time.
 */
import { test, expect, type Page } from '@playwright/test'

test.setTimeout(90_000)

async function boot(page: Page): Promise<void> {
  await page.goto('/', { timeout: 60_000 })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 45_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 45_000 },
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
    target?.setPosition({ lineNumber: 1, column: 8 })
    target?.focus()
  }, code)
  await page.waitForTimeout(250)
}

test('Mixer instrument picker enumerates the live soundMap (#514)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await boot(page)
  await setStrudelCode(page, 'note("c3 e3 g3")')
  // play → engine init + CDN sample load → soundMap populates
  await page.locator('button:has-text("Play")').first().click().catch(() => {})
  await page.waitForTimeout(7_000)

  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('[data-bottom-panel="toggle"]').click()
  await drawer.locator('role=tab[name="Pattern"]').click()
  await page.waitForTimeout(1_500)

  // Open the searchable popover (#827) and read its rendered option set.
  await drawer.locator('[data-mixer-sound-trigger="instrument"]').click()
  const menu = page.locator('[data-mixer-sound-menu="instrument"]')
  await menu.waitFor({ state: 'visible' })
  const info = await menu.evaluate((el) => {
    const values = Array.from(el.querySelectorAll('[data-mixer-sound-option]')).map(
      (o) => o.getAttribute('data-mixer-sound-option'),
    )
    const cats = Array.from(el.querySelectorAll('[data-mixer-sound-category]')).map(
      (c) => c.getAttribute('data-mixer-sound-category'),
    )
    return { count: values.length, cats, hasSawtooth: values.includes('sawtooth'), hasSoundfont: values.some((v) => v?.startsWith('gm_')) }
  })

  // Far more than the curated shortlist (~30) → the live registry is in play.
  expect(info.count).toBeGreaterThan(100)
  // Category tags reflect the live registration types.
  expect(info.cats).toContain('Synths')
  expect(info.cats).toContain('Soundfonts')
  // Concrete live members present.
  expect(info.hasSawtooth).toBe(true)
  expect(info.hasSoundfont).toBe(true)
  expect(errors).toEqual([])
})
