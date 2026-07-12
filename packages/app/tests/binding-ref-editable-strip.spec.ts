/**
 * Const-binding refs are editable (#866) — Playwright observation spec.
 *
 * chunkDetect (the classifier behind the Mixer/Pattern editability views AND
 * the edit-coverage harness oracle) now resolves a bare `const/let/var`
 * reference to the voice it names. This drives the REAL app to confirm the
 * end-to-end win: a whole-track binding `const bass = note(…)\n$: bass` renders
 * an EDITABLE Piano-Roll mixer strip, identical to the inlined `$: note(…)`,
 * instead of the pre-#866 "unknown" (code-only) strip.
 *
 * `toHaveAttribute` auto-retries, so this waits for the strip to settle rather
 * than racing a one-shot read.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '320')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'mixer-console')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 20_000 },
  )
}

async function evalCode(page: Page, code: string): Promise<void> {
  await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    target?.getModel()?.setValue(c)
    target?.focus()
  }, code)
  await page.waitForTimeout(150)
  await page.keyboard.press(`${MOD}+Enter`)
}

test('a whole-track const-binding renders an editable (roll) mixer strip', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await boot(page)
  // boot() opens the mixer tab via localStorage; click it too in case the
  // stored tab id drifts.
  await page.locator('[data-bottom-panel="root"]').locator('role=tab[name="Mixer"]').click()

  // A note voice bound to a const, referenced as a whole $: track. Pre-#866
  // chunkDetect saw a bare identifier → strip kind "unknown" (code-only).
  await evalCode(page, 'const bass = note("c2 e2 g2 e2")\n$: bass')

  const strip = page.locator(
    '[data-bottom-panel-tab="mixer-console"] [data-mixer-strip]',
  )
  // Resolved to the bound `note(...)` voice → an editable Piano-Roll strip.
  await expect(strip).toHaveCount(1, { timeout: 10_000 })
  await expect(strip.first()).toHaveAttribute('data-mixer-strip-kind', 'roll', {
    timeout: 10_000,
  })

  expect(errors).toEqual([])
})
