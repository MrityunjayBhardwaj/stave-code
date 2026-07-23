/**
 * Consumer 4 (#980) — the collect→queryArc split applied to `analyzeSong`.
 *
 * The Song timeline's lane/period/section analysis must read onsets from EVAL
 * haps (queryArc), not the `collect` interpreter. The verdict move, adjudicated
 * at browser fidelity:
 *
 *  A signal-only track — `note(sine.range(48,72).segment(8))` — produces ZERO
 *  onsets under `collect` (it can't evaluate `sine`), so collect-backed analysis
 *  has NO lane for it. Eval resolves 8 discrete onsets, so eval-backed analysis
 *  gains a second lane. Observed via the `__staveTimelineAnalysis` debug probe
 *  (analysis feeds coarse density/period, not per-mark DOM).
 *
 * REACH: an invalid mid-edit tune must not wipe the analysis (last-valid eval +
 * resilient structure), same property the marks gate proves.
 */
import { test, expect, type Page } from '@playwright/test'

type AnalysisProbe = {
  periodCycles: number | null
  horizonCycles: number
  lanes: Array<{ laneKey: string; onsets: number }>
}

function readAnalysis(page: Page): Promise<AnalysisProbe | null> {
  return page.evaluate(
    () => (window as unknown as { __staveTimelineAnalysis?: AnalysisProbe }).__staveTimelineAnalysis ?? null,
  )
}

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '320')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
      localStorage.setItem('stave:debug.timelineMarks', '1')
    } catch { /* ignore */ }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getValue?: () => string } | null }> } } }).monaco
      const eds = m?.editor?.getEditors?.() ?? []
      return eds.some((e) => (e.getModel()?.getValue?.()?.length ?? 0) > 0)
    },
    { timeout: 20_000 },
  )
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 15_000 })
}

async function editCode(page: Page, code: string): Promise<void> {
  await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null; focus: () => void }> } } }).monaco
    const editors = monaco?.editor?.getEditors?.() ?? []
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    target?.getModel()?.setValue(c)
    target?.focus()
  }, code)
}

test('a signal-only track gains an analysis lane (collect cannot onset it)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  await boot(page)

  // Drum + a signal track. Under `collect` the signal produces ZERO onsets → one
  // analysis lane. Under eval it resolves 8 onsets → a SECOND analysis lane.
  await editCode(page, '$: s("bd sd hh")\n$: note(sine.range(48,72).segment(8))')

  await expect
    .poll(async () => (await readAnalysis(page))?.lanes.length ?? 0, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(2)

  const a = await readAnalysis(page)
  // Both lanes carry onsets (the signal lane could ONLY come from eval).
  expect(a!.lanes.every((l) => l.onsets > 0)).toBe(true)
  expect(errors).toEqual([])
})

test('REACH — invalid mid-edit code does not wipe the analysis', async ({ page }) => {
  await boot(page)
  await editCode(page, '$: s("bd sd")\n$: s("hh*4")')
  await expect
    .poll(async () => (await readAnalysis(page))?.lanes.length ?? 0, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(2)

  // Break it mid-edit (unclosed string). evaluate returns an error without
  // throwing and songPatterns keeps the last valid haps, so the analysis stays.
  await editCode(page, '$: s("bd sd")\n$: s("hh*4"')
  // Analysis must NOT collapse to empty.
  await page.waitForTimeout(1500)
  const a = await readAnalysis(page)
  expect(a!.lanes.length).toBeGreaterThanOrEqual(1)
})
