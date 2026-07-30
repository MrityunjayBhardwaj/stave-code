/**
 * full-song-late-track — #1107.
 *
 * A track that first sounds AFTER the display period the other tracks establish
 * used to vanish from the analysis entirely. `accumulateLanes(events, period)`
 * creates a lane only for an onset inside the window, so the track did not go
 * empty — it ceased to exist ([[P405]]). Its row still drew, rebuilt from the
 * document's track set (#1098), but with no content and WITHOUT the silenced
 * treatment a muted track gets: a track playing hundreds of notes rendered
 * pixel-identical to one playing none, and strictly less legible than a muted
 * one, because at least the muted row is faded.
 *
 * The fixture is `0/-Hx1rNCmeyD8`'s shape in miniature — a drum loop that repeats
 * every cycle beside a hat part that enters halfway through a 16-cycle
 * arrangement. Before the fix the analysis confirmed period 1 at horizon 8, where
 * the hats had not sounded once, and shipped a ONE-cycle view of a 16-cycle song
 * with one of its two tracks erased.
 *
 * The control arm is what makes the positive one mean anything: a song whose
 * tracks all sound from cycle 0 must keep its bounded period. The clauses refuse
 * an implausible span; they must not refuse a plausible one.
 */
import { test, expect, type Page } from '@playwright/test'

type AnalysisProbe = {
  periodCycles: number | null
  horizonCycles: number
  lanes: Array<{ laneKey: string; onsets: number }>
}

/** Two tracks, the second entering at cycle 8 of a 16-cycle arrangement. */
const LATE_ENTRY = '$: s("bd*4")\n$: s("hh*8").mask("<0!8 1!8>")'
/** Both tracks sounding from cycle 0 — the control. */
const BOTH_FROM_ZERO = '$: s("bd*4")\n$: s("hh*8")'
/**
 * A MUTED track beside a playing one. A muted track emits no haps BY DESIGN —
 * Strudel refuses to register a `_`-prefixed id (`@strudel/core/repl.mjs:172-175`)
 * and our capture hook mirrors that deliberately — so it can never be "heard",
 * and if the expected set were the DECLARED tracks rather than the REGISTERED
 * patterns, every document with a muted track would wait for it forever.
 *
 * ⚠ MEASURED, and it corrects the obvious guess: that would NOT produce a wrong
 * span. Injecting a permanently-unheard id leaves this document's period intact,
 * because the clause lifts at the cap and the period is found there anyway — the
 * same bound that makes the six corpus documents with a silent registered track
 * verdict-neutral. The cost would be analysis WORK (256 cycles instead of 8), not
 * correctness. So this arm is a smoke check, not a proof: it cannot be reddened
 * by that mistake, and saying so is more useful than implying it can.
 */
const ONE_MUTED = '$: s("bd*4")\n_$: s("hh*8")'

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

/**
 * Wait for an analysis whose verdict has settled — CLEARED first by `editCode`,
 * then required NON-EMPTY, then required to stop changing ([[P406]]). Each of
 * the three matters: the previous document's analysis already satisfies "has
 * lanes", and an un-evaluated page reports `horizonCycles: 0` stably from the
 * first read, which settles instantly and looks exactly like a dead feature.
 */
async function settledAnalysis(page: Page): Promise<AnalysisProbe> {
  await expect.poll(async () => (await analysisOf(page))?.lanes.length ?? 0, { timeout: 60_000 }).toBeGreaterThan(0)
  let prev = ''
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000)
    const a = await analysisOf(page)
    if ((a?.horizonCycles ?? 0) === 0) { prev = ''; continue }
    const cur = JSON.stringify([a?.periodCycles ?? null, a?.horizonCycles ?? null, a?.lanes.length ?? 0])
    if (cur === prev && i > 1) break
    prev = cur
  }
  const a = await analysisOf(page)
  expect(a).not.toBeNull()
  expect(a!.horizonCycles).toBeGreaterThan(0)
  return a!
}

test('a track entering after the other tracks loop is not erased from the view', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await boot(page)
  await editCode(page, LATE_ENTRY)

  const a = await settledAnalysis(page)

  // Both tracks are present AND both carry onsets. The count catches the
  // erasure, the onsets catch a row that is present but empty — the two ways
  // this defect shows, and the reason the row looked like silence.
  expect(a.lanes.length).toBe(2)
  for (const lane of a.lanes) expect(lane.onsets).toBeGreaterThan(0)

  // And the span grew to hold the arrangement instead of the one cycle the
  // drums alone repeat on. Asserted as a bound, not a constant: what is
  // load-bearing is that it reaches the late track's entry at cycle 8.
  expect(a.periodCycles === null || a.periodCycles > 8).toBe(true)
  expect(errors).toEqual([])
})

test('CONTROL — a song whose tracks all sound from the start keeps its period', async ({ page }) => {
  test.setTimeout(240_000)
  await boot(page)
  await editCode(page, BOTH_FROM_ZERO)

  const a = await settledAnalysis(page)
  // A plausible span must still be accepted: the clauses refuse spans that hide
  // a track, and must not push an ordinary loop to the 256-cycle cap.
  expect(a.periodCycles).not.toBeNull()
  expect(a.lanes.length).toBe(2)
})

test('CONTROL — a muted track is not a track waiting to be heard', async ({ page }) => {
  test.setTimeout(240_000)
  await boot(page)
  await editCode(page, ONE_MUTED)

  const a = await settledAnalysis(page)
  // A muted track must not change what the view shows: one drawn lane for the
  // one track that plays, on its own bounded loop.
  expect(a.periodCycles).not.toBeNull()
  expect(a.lanes.length).toBe(1)
})
