/**
 * The Song view PAGES, and the paged window draws itself completely
 * (#1201 item 4 / #1209) — Playwright observation.
 *
 * ── WHY THIS SPEC HAD TO EXIST BEFORE THE FEATURE COULD BE CALLED DONE ──────
 * Everything about a window is correct-by-coincidence at origin 0: the window
 * frame and the song-absolute frame coincide there, so an origin-blind
 * implementation and a correct one produce identical pixels. Every unit arm for
 * paging therefore has to construct a non-zero origin by hand — and #1209 was
 * a defect that survived exactly because nothing had ever DRIVEN one through
 * the real app. A view that pages was, until this file, unobserved.
 *
 * The route to a non-zero origin is the only one the app offers: play, then
 * seek past three quarters of the first window, which is the condition the
 * rAF trigger watches. No test hook, no forced state — the same gesture a user
 * makes by clicking the ruler.
 *
 * ⚠ THE FIXTURE MUST BE APERIODIC, and the spec asserts it. Paging exists only
 * on the branch where period detection FAILED: when a period was found, cycle
 * 257 genuinely is cycle 1 and there is nothing to the right to reach. If this
 * document ever resolves to a period, the trigger never fires and every
 * assertion below would be vacuous rather than failing — so the precondition
 * is checked, not assumed.
 */
import { test, expect, type Page } from '@playwright/test'

/**
 * Aperiodic by construction (an irrational-ratio slow LFO on a continuous
 * control makes every cycle differ), and ARRANGED so the window has clips as
 * well as marks. The two halves are both needed: the density heatmap followed
 * the window before #1209, the marks and clips did not.
 */
const APERIODIC_ARRANGE =
  '$: arrange([2, s("bd*4")], [2, s("hh*8")]).cutoff(sine.range(200,2000).slow(97.3))'

/** The analysis cap, and therefore the first window's width. */
const SPAN = 256

type MarksProbe = {
  laneCount: number
  byLane: Record<string, { count: number; onsets: number[] }>
}
type AnalysisProbe = { periodCycles: number | null; horizonCycles: number; lanes: unknown[] }

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '360')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
      // Marks are canvas-drawn, so the DOM cannot report them. This publishes
      // the per-lane onset cycles the view actually collected — which is the
      // one readout that can tell "no marks" from "marks in the wrong place".
      localStorage.setItem('stave:debug.timelineMarks', '1')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => {
      const m = (
        window as unknown as {
          monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getValue?: () => string } | null }> } }
        }
      ).monaco
      const eds = m?.editor?.getEditors?.() ?? []
      return eds.some((e) => (e.getModel()?.getValue?.()?.length ?? 0) > 0)
    },
    { timeout: 20_000 },
  )
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 15_000 })
}

/** setValue in one shot — typing character-by-character races the evaluator and
 *  is the catalogued flake class in this suite. */
async function evalCode(page: Page, code: string): Promise<void> {
  await page.evaluate(() => {
    delete (window as unknown as { __staveTimelineAnalysis?: unknown }).__staveTimelineAnalysis
  })
  await page.evaluate((c) => {
    const monaco = (
      window as unknown as {
        monaco?: {
          editor?: {
            getEditors?: () => Array<{
              getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
              focus: () => void
            }>
          }
        }
      }
    ).monaco
    const editors = monaco?.editor?.getEditors?.() ?? []
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    target?.getModel()?.setValue(c)
    target?.focus()
  }, code)
  await page.waitForTimeout(150)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter')
}

const marksOf = (page: Page): Promise<MarksProbe | null> =>
  page.evaluate(
    () => (window as unknown as { __staveTimelineMarks?: MarksProbe }).__staveTimelineMarks ?? null,
  )

const analysisOf = (page: Page): Promise<AnalysisProbe | null> =>
  page.evaluate(
    () =>
      (window as unknown as { __staveTimelineAnalysis?: AnalysisProbe }).__staveTimelineAnalysis ??
      null,
  )

/** Every onset cycle the view collected, across all lanes. */
function allOnsets(m: MarksProbe | null): number[] {
  if (!m) return []
  return Object.values(m.byLane).flatMap((l) => l.onsets)
}

/** Wait for an analysis whose period verdict has stopped moving. */
async function settledAnalysis(page: Page): Promise<AnalysisProbe> {
  await expect
    .poll(async () => (await analysisOf(page))?.lanes.length ?? 0, { timeout: 90_000 })
    .toBeGreaterThan(0)
  let prev = ''
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000)
    const a = await analysisOf(page)
    const cur = JSON.stringify([a?.periodCycles ?? null, a?.horizonCycles ?? null])
    if (cur === prev && i > 1) break
    prev = cur
  }
  const a = await analysisOf(page)
  expect(a, 'analysis probe never published').not.toBeNull()
  return a!
}

test('the Song view pages past the first window, and the paged window keeps its note marks', async ({
  page,
}) => {
  test.setTimeout(300_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  await boot(page)
  await evalCode(page, APERIODIC_ARRANGE)

  // ── PRECONDITION: this really is the branch that can page ────────────────
  const a = await settledAnalysis(page)
  expect(a.periodCycles, 'fixture must be aperiodic or the trigger never fires').toBeNull()
  expect(a.horizonCycles).toBe(SPAN)

  // ── The FIRST window, for comparison. Marks exist and all lie inside it. ──
  await expect.poll(async () => allOnsets(await marksOf(page)).length, { timeout: 60_000 }).toBeGreaterThan(0)
  const first = allOnsets(await marksOf(page))
  expect(Math.min(...first)).toBeGreaterThanOrEqual(0)
  expect(Math.max(...first)).toBeLessThan(SPAN)

  const notice = page.locator('[data-full-song-fallback-notice]')
  await expect(notice).toBeVisible({ timeout: 15_000 })
  expect(await notice.textContent()).toContain(`showing first ${SPAN} cycles`)

  // ── THE GESTURE: play, then seek past three quarters of the window ───────
  // The trigger watches the transport's position, so the view must actually be
  // playing — a seek while stopped reports no position and pages nothing.
  await page.locator('[data-full-song="grid"]').click({ position: { x: 4, y: 4 } })
  await page.keyboard.press('Space')
  const ruler = page.locator('[data-full-song="ruler-area"]')
  const box = await ruler.boundingBox()
  expect(box, 'no ruler box').not.toBeNull()
  // 0.78 of a 256-cycle window is ~200 — past the 192 the trigger waits for,
  // and comfortably short of the end so this is a page-AHEAD, not a rescue.
  await page.mouse.click(box!.x + box!.width * 0.78, box!.y + box!.height / 2)

  // ── OBSERVATION 1: the view pages, and SAYS which cycles it is showing ────
  // The notice's paged wording is its own site — a template string, which is
  // why the frame-mismatch grep written for comparisons could not find it.
  await expect(notice).toHaveText(new RegExp(`showing cycles ${SPAN}[^0-9]+${SPAN * 2}`), {
    timeout: 90_000,
  })

  // ── OBSERVATION 2: the paged window still HAS marks, and they are ITS ─────
  // This is #1209 exactly. Before it, the marks were re-collected over
  // `[0, span)` at every origin; being song-absolute they then mapped to
  // negative x and were culled, so this window drew no note marks at all.
  // The two assertions are different claims and both are needed: a non-empty
  // count alone would pass on marks belonging to the first window.
  await expect
    .poll(async () => Math.min(...allOnsets(await marksOf(page)), Infinity), { timeout: 60_000 })
    .toBeGreaterThanOrEqual(SPAN)
  const paged = allOnsets(await marksOf(page))
  expect(paged.length, 'a paged window must still draw note marks').toBeGreaterThan(0)
  expect(Math.max(...paged)).toBeLessThan(SPAN * 2)

  await page.screenshot({ path: 'test-results/window-paging-origin-256.png' })
  expect(errors, `unexpected page errors:\n${errors.join('\n')}`).toEqual([])
})

/**
 * Wide arms (64 cycles each) so a clip in the SECOND window is a quarter of the
 * grid rather than a few pixels, and still aperiodic for the same reason — the
 * LFO, not the arrangement, is what defeats period detection. At origin 256 the
 * window shows two full periods: arm 0 over [256, 320), arm 1 over [320, 384),
 * and so on.
 */
const WIDE_APERIODIC_ARRANGE =
  '$: arrange([64, s("bd*4")], [64, s("hh*8")]).cutoff(sine.range(200,2000).slow(97.3))'

const strudelSource = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const monaco = (
      window as unknown as {
        monaco?: {
          editor?: {
            getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; getValue: () => string } | null }>
          }
        }
      }
    ).monaco
    const eds = monaco?.editor?.getEditors?.() ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    return t?.getModel()?.getValue() ?? ''
  })

test('a clip edited from the SECOND window writes back to the bar the user is looking at', async ({
  page,
}) => {
  test.setTimeout(300_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  await boot(page)
  await evalCode(page, WIDE_APERIODIC_ARRANGE)

  const a = await settledAnalysis(page)
  expect(a.periodCycles, 'fixture must be aperiodic or the trigger never fires').toBeNull()

  // Page to [256, 512) by the same real gesture: play, then seek past 192.
  await page.locator('[data-full-song="grid"]').click({ position: { x: 4, y: 4 } })
  await page.keyboard.press('Space')
  const ruler = page.locator('[data-full-song="ruler-area"]')
  const rbox = await ruler.boundingBox()
  expect(rbox).not.toBeNull()
  await page.mouse.click(rbox!.x + rbox!.width * 0.78, rbox!.y + rbox!.height / 2)
  await expect(page.locator('[data-full-song-fallback-notice]')).toHaveText(
    new RegExp(`showing cycles ${SPAN}[^0-9]+${SPAN * 2}`),
    { timeout: 90_000 },
  )

  // ── THE GESTURE, entirely inside the second window ───────────────────────
  // An eighth of the way across is song cycle 256 + 32 = 288, which lies in
  // arm 0's clip [256, 320). Select it and split it there.
  const grid = page.locator('[data-full-song="grid"]')
  const gbox = await grid.boundingBox()
  expect(gbox).not.toBeNull()
  await page.mouse.click(gbox!.x + gbox!.width * 0.125, gbox!.y + 8)
  await expect(page.locator('[data-full-song="clip-selection"]')).toBeVisible({ timeout: 8_000 })
  await grid.press('s')

  // ── OBSERVATION: the split lands where the user clicked ──────────────────
  // 288 is 32 cycles into a 64-cycle arm, so the arm halves into 32 + 32. This
  // is the assertion the whole window origin exists to make true: the scene's
  // clip cycles are song-ABSOLUTE, so `288 − 256` is what reaches the edit path.
  // Were they window-relative, the clip would start at 0 while the cursor still
  // read 288, and the split would be written 288 cycles into a 64-cycle arm.
  await expect
    .poll(() => strudelSource(page), { timeout: 15_000 })
    .toContain('arrange([32, s("bd*4")], [32, s("bd*4")], [64, s("hh*8")])')

  await page.screenshot({ path: 'test-results/window-paging-split-origin-256.png' })
  expect(errors, `unexpected page errors:\n${errors.join('\n')}`).toEqual([])
})
