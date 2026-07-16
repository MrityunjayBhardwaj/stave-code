/**
 * #901 — `stack (…)` / `stack\n(…)` whitespace before the paren.
 *
 * AnviDev observe gate: the unit tests (stack-arg-offset) and the parity
 * corpus fixtures cover the parser in isolation; this drives the REAL app
 * to confirm the user-visible claim in the issue — a program whose only
 * sin is a SPACE between `stack` and its `(` rendered a BLANK timeline,
 * because the whole program dropped to the opaque Code fallback.
 *
 * Both real-world shapes are covered: `stack (` (hash 3qxt3B3hsNYv) and
 * `stack\n (` (hashes 36WbGIEN0uMZ / 3MLO1QCnluxT).
 *
 * `toHaveCount` auto-retries, so this waits for the analysis + marks to
 * settle rather than racing a one-shot `count()`.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '320')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
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
  // #872 — wait for the async project file load before seeding, else the
  // controlled editor value overwrites our code and the spec silently runs
  // against the starter example.
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getValue?: () => string } | null }> } } }).monaco
      const eds = m?.editor?.getEditors?.() ?? []
      return eds.some((e) => (e.getModel()?.getValue?.()?.length ?? 0) > 0)
    },
    { timeout: 20_000 },
  )
}

async function evalCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    if (!target) return false
    target.getModel()?.setValue(c)
    target.focus()
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(150)
  await page.keyboard.press(`${MOD}+Enter`)
}

// A BARE `stack(a, b)` is one source pattern (no `$:` labels), so it renders
// ONE lane whose args are voices within it — not one lane per arg. The tight
// form is therefore the control: the invariant under test is that whitespace
// before the paren changes NOTHING, so each variant must match it.
//
// Falsifiable both ways: reverting the parser makes the spaced/newline cases
// render 0 lanes (observed) while the tight control stays at 1.
const TIGHT = 'stack(\n  s("bd sd"),\n  s("hh*4")\n)'
const SPACE = 'stack (\n  s("bd sd"),\n  s("hh*4")\n)'
const NEWLINE = 'stack\n (\n  s("bd sd"),\n  s("hh*4")\n)'

async function laneKeys(page: Page, code: string): Promise<(string | null)[]> {
  await evalCode(page, code)
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })
  // Settle on the count first (auto-retrying) so the read below isn't racing
  // the analysis; the tight control fixes the expected count at 1.
  await expect(page.locator('[data-full-song-lane]')).toHaveCount(1, { timeout: 10_000 })
  return page
    .locator('[data-full-song-lane]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-full-song-lane')))
}

test('the tight control renders exactly one lane', async ({ page }) => {
  await boot(page)
  expect(await laneKeys(page, TIGHT)).toEqual(['d1'])
})

test('stack (…) with a SPACE before the paren renders the same as tight', async ({ page }) => {
  await boot(page)
  // The ONLY difference from the control is the space after `stack`.
  // Pre-#901 this rendered 0 lanes — the whole program fell back to opaque
  // Code and the timeline was blank.
  expect(await laneKeys(page, SPACE)).toEqual(['d1'])
})

test('stack\\n (…) with a NEWLINE before the paren renders the same as tight', async ({ page }) => {
  await boot(page)
  // The real-world shape from hashes 36WbGIEN0uMZ / 3MLO1QCnluxT: a newline
  // AND a leading space before the paren.
  expect(await laneKeys(page, NEWLINE)).toEqual(['d1'])
})
