/**
 * Full-song timeline + scrub (#385 / #384) — Playwright observation spec.
 *
 * AnviDev observe gate: unit/component tests cover the analyze math and the
 * axis; this drives the REAL app to confirm the end-to-end path works —
 *   1. The "Song / Live" toggle switches the timeline into full-song mode.
 *   2. analyzeSong runs on the REAL evaluated IR → lane rows + onset cells +
 *      section chips render (proves the IR-snapshot → analyzeSong wiring).
 *   3. A loop length is detected and shown ("loop N cycles" / "N cycles").
 *   4. Clicking the song ruler fires a seek (runtime.seekTo) with NO console
 *      error and the view stays coherent (the DV-10 relaxation).
 *
 * INPUT NOTE: this harness evaluates the starter file's content — programmatic
 * Monaco `setValue` updates the model but does NOT drive the eval pipeline
 * (the eval reads the file store), so the analyzed song is the starter example,
 * not an injected pattern. Period CORRECTNESS for specific patterns is covered
 * by songAnalysis.test.ts (isolated); this spec verifies the integration wiring
 * on whatever real multi-track song is playing. Assertions are deliberately
 * generic (lane count, a detected period) rather than a fixed period value.
 *
 * AUDIO NOTE: the audible jump is NOT observable in this harness (no audio
 * capture). This spec observes structure + no-error; the audio half is a
 * manual user check (design §10).
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

const STORAGE_KEYS = {
  height: 'stave:bottomPanel.height',
  open: 'stave:bottomPanel.open',
  activeTabId: 'stave:bottomPanel.activeTabId',
} as const

async function preOpenDrawer(page: Page): Promise<void> {
  await page.addInitScript(
    ([heightKey, openKey, activeKey]: readonly string[]) => {
      try {
        window.localStorage.setItem(heightKey, '320')
        window.localStorage.setItem(openKey, 'true')
        window.localStorage.setItem(activeKey, 'musical-timeline')
      } catch {
        /* ignore */
      }
    },
    [STORAGE_KEYS.height, STORAGE_KEYS.open, STORAGE_KEYS.activeTabId],
  )
}

async function bootShell(page: Page): Promise<void> {
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

async function setStrudelCode(page: Page, code: string): Promise<void> {
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
}

async function evalStrudel(page: Page): Promise<void> {
  await page.evaluate(() => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string } | null
      focus: () => void
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    target?.focus()
  })
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1800)
}

test('full-song view: analysis renders, loop detected, ruler seek fires without error', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await preOpenDrawer(page)
  await bootShell(page)

  // Evaluate the starter file (a multi-track example). We also push a pattern
  // into the model for good measure, but the eval pipeline reads the file
  // store, so the analyzed song is the starter content regardless (see INPUT
  // NOTE). Either way a real multi-track song is what the song view analyzes.
  await setStrudelCode(page, 'stack(s("bd hh bd hh"), s("~ cp"))')
  await evalStrudel(page)

  // Switch to the full-song view.
  const toggle = page.locator('[data-musical-timeline="view-toggle"]')
  await toggle.waitFor({ timeout: 10_000 })
  await toggle.click()

  // (1) Analysis renders lane rows from the real evaluated IR.
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
  const laneCount = await page.locator('[data-full-song-lane]').count()
  expect(laneCount).toBeGreaterThanOrEqual(2)

  // (2) Onset cells render.
  const cellCount = await page.locator('[data-full-song-cell]').count()
  expect(cellCount).toBeGreaterThan(0)

  // (3) A loop length is detected and surfaced.
  const period = await page
    .locator('[data-full-song-period]')
    .getAttribute('data-full-song-period')
  expect(period).toMatch(/loop \d+|\d+\+? cycles/)

  // (3b) The scrubbable playhead is present while playing — proves the
  //      getSongPosition accessor chain (StrudelEditorClient → runtime →
  //      engine clock) resolves end-to-end, not just in unit fakes.
  await page.locator('[data-full-song="playhead"]').waitFor({ timeout: 8_000 })

  // Visual evidence (observe, don't infer): capture the rendered song view.
  await page.screenshot({ path: 'test-results/full-song-view.png' })

  // (4) Clicking the song ruler fires a seek with no console error and the
  //     view stays coherent. (Audio jump is a manual check — design §10.)
  const rulerArea = page.locator('[data-full-song="ruler-area"]')
  await rulerArea.click({ position: { x: 40, y: 10 } })
  await page.waitForTimeout(800)

  // Still coherent after the seek/re-eval.
  expect(await page.locator('[data-full-song-lane]').count()).toBeGreaterThanOrEqual(2)
  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])

  // Toggle back to the live window — round-trips cleanly.
  await toggle.click()
  await page.locator('[data-musical-timeline="ruler"]').waitFor({ timeout: 5_000 })
})
