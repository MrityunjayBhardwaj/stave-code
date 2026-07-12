/**
 * Eval-backed lanes (#864 / P1b) — Playwright observation spec.
 *
 * AnviDev observe gate: the unit tests (collectNoteMarks / timelineScene) cover
 * the lane-synthesis logic against a mocked IR; this drives the REAL app to
 * confirm the end-to-end path — a track that emits NO static-IR events (a
 * sampled signal) still gets its own timeline lane from the evaluated haps,
 * instead of vanishing (or polluting a neighbouring lane).
 *
 * `toHaveCount` auto-retries, so this waits for the analysis + marks to settle
 * rather than racing a one-shot `count()` (the settle-race the older
 * full-song-timeline spec is prone to on a cold server).
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

test('a sampled-signal track (no static-IR events) gets its own eval-backed lane', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await boot(page)
  // Track 1: a normal drum pattern (produces static-IR events → an IR lane).
  // Track 2: a SAMPLED SIGNAL — `.segment` yields discrete haps but no static-IR
  // note events, so pre-P1b it had no lane and its haps fell to the drum lane.
  await evalCode(page, '$: s("bd sd hh")\n$: note(sine.range(48,72).segment(8))')

  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })

  // Both tracks now render a lane — the drum IR lane AND the signal eval lane.
  // `toHaveCount` retries until the analysis + marks settle.
  const lanes = page.locator('[data-full-song-lane]')
  await expect(lanes).toHaveCount(2, { timeout: 10_000 })

  // The signal track owns the positional `d2` row (source-order after the drums),
  // i.e. it is NOT folded into the drum lane.
  await expect(page.locator('[data-full-song-lane="d1"]')).toHaveCount(1)
  await expect(page.locator('[data-full-song-lane="d2"]')).toHaveCount(1)

  expect(errors).toEqual([])
})
