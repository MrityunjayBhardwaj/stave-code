/**
 * full-song-aperiodic-notice — #1105.
 *
 * A song with no repeat is drawn on the analysis CAP (256 cycles), which is the
 * point where period detection gave up rather than the song's length. Two things
 * must be true of that view, and neither was before this change:
 *
 *  1. It SAYS the span is a stopping point, not a loop. Nothing said so —
 *     `periodLabel` is written to a `display:none` attribute for Playwright and
 *     rendered nowhere.
 *  2. The playhead does not WRAP at the span. `wrapSongPosition`'s modulo is
 *     true for a loop and false here; past the span the playhead is withheld and
 *     the notice says playback has gone beyond the view.
 *
 * The negative arm matters as much as the positive one: a periodic song must
 * gain NO notice. Without it this spec would pass on a build that always shows
 * the message.
 */
import { test, expect, type Page } from '@playwright/test'

type AnalysisProbe = {
  periodCycles: number | null
  horizonCycles: number
  lanes: Array<{ laneKey: string; onsets: number }>
}

/** Aperiodic by construction: an irrational-ratio slow LFO on a continuous
 *  control makes every cycle differ, so no period exists within the cap. This is
 *  the shape the corpus documents have (`.cutoff(sine.slow(...))` dominates the
 *  16 that #1102 moved), written small enough to eval fast. */
const APERIODIC = '$: s("bd*4").cutoff(sine.range(200,2000).slow(97.3))'
/** A plain 2-cycle loop — the control arm. */
const PERIODIC = '$: s("<bd sd>")'

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '360')
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

/** setValue in one shot — typing character-by-character races the evaluator and
 *  is the catalogued flake class in this suite. */
async function editCode(page: Page, code: string): Promise<void> {
  await page.evaluate(() => {
    delete (window as unknown as { __staveTimelineAnalysis?: unknown }).__staveTimelineAnalysis
  })
  await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null; focus: () => void }> } } }).monaco
    const editors = monaco?.editor?.getEditors?.() ?? []
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    target?.getModel()?.setValue(c)
    target?.focus()
  }, code)
}

function analysisOf(page: Page): Promise<AnalysisProbe | null> {
  return page.evaluate(
    () => (window as unknown as { __staveTimelineAnalysis?: AnalysisProbe }).__staveTimelineAnalysis ?? null,
  )
}

/** Wait for an analysis whose period verdict has settled. */
async function settledAnalysis(page: Page): Promise<AnalysisProbe> {
  await expect.poll(async () => (await analysisOf(page))?.lanes.length ?? 0, { timeout: 60_000 }).toBeGreaterThan(0)
  let prev = ''
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000)
    const a = await analysisOf(page)
    const cur = JSON.stringify([a?.periodCycles ?? null, a?.horizonCycles ?? null])
    if (cur === prev && i > 1) break
    prev = cur
  }
  const a = await analysisOf(page)
  expect(a).not.toBeNull()
  return a!
}

test('a song with no repeat says its span is a stopping point, not a loop', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await boot(page)
  await editCode(page, APERIODIC)

  const a = await settledAnalysis(page)
  // Precondition: this document really is the aperiodic case. If period detection
  // ever resolves it, the assertions below would be vacuous rather than failing.
  expect(a.periodCycles).toBeNull()

  const notice = page.locator('[data-full-song-fallback-notice]')
  await expect(notice).toBeVisible({ timeout: 15_000 })
  const text = (await notice.textContent()) ?? ''
  expect(text).toContain('no repeat')
  // It names the span it is actually showing, not a hardcoded number.
  expect(text).toContain(String(a.horizonCycles))
  expect(errors).toEqual([])
})

test('CONTROL — a song that does loop gains no notice', async ({ page }) => {
  test.setTimeout(240_000)
  await boot(page)
  await editCode(page, PERIODIC)

  const a = await settledAnalysis(page)
  expect(a.periodCycles).not.toBeNull()

  // The notice must be absent, not merely different — otherwise the positive arm
  // above proves nothing about when the message appears.
  await expect(page.locator('[data-full-song-fallback-notice]')).toHaveCount(0)
})
