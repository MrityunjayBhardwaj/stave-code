/**
 * Live drum-bank enumeration (#515 / #520 / PV141 #6).
 *
 * Real-browser proof that the Mixer's Kit picker enumerates the LIVE drum banks
 * derived from the `tidal-drum-machines` manifest (71 banks) rather than the
 * curated `soundCatalog.ts` shortlist (~30). The cursor is placed on a step
 * pattern (`s(...)`) so the Kit picker renders. Observed via the rendered
 * <option> set, not inferred.
 *
 * Network-dependent (the app fetches the CDN manifest) so it allows settle time.
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
    target?.setPosition({ lineNumber: 1, column: 5 }) // inside the s("…") string
    target?.focus()
  }, code)
  await page.waitForTimeout(250)
}

test('Mixer Kit picker enumerates live drum banks from the manifest (#515)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await boot(page)
  await setStrudelCode(page, 's("bd sd hh sd")')
  // The manifest fetch fires on mount; allow generous settle for the CDN.
  await page.waitForTimeout(7_000)

  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('[data-bottom-panel="toggle"]').click()
  await drawer.locator('role=tab[name="Pattern"]').click()
  await page.waitForTimeout(1_500)

  const select = drawer.locator('[data-mixer-sound-select="kit"]')
  const info = await select.evaluate((el) => {
    const s = el as HTMLSelectElement
    const groups = Array.from(s.querySelectorAll('optgroup')).map((g) => (g as HTMLOptGroupElement).label)
    const values = Array.from(s.querySelectorAll('option')).map((o) => (o as HTMLOptionElement).value)
    return {
      count: values.length,
      groups,
      hasTR909: values.includes('RolandTR909'),
      // A bank present in the live manifest but NOT in the curated shortlist —
      // proves the live list is in play, not the fallback.
      hasLiveOnly: values.includes('KorgM1'),
    }
  })

  // Far more than the curated shortlist (~30) → the live manifest is in play.
  expect(info.count).toBeGreaterThan(50)
  // Grouped by manufacturer.
  expect(info.groups).toContain('Roland')
  expect(info.groups).toContain('Yamaha')
  // Concrete live members present (one curated, one live-only).
  expect(info.hasTR909).toBe(true)
  expect(info.hasLiveOnly).toBe(true)
  expect(errors).toEqual([])
})
