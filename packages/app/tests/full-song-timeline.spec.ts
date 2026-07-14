/**
 * Full-song timeline + scrub (#385 / #384) — Playwright observation spec.
 *
 * AnviDev observe gate: unit/component tests cover the analyze math and the
 * axis; this drives the REAL app to confirm the end-to-end path works —
 *   1. The full-song canvas is the timeline's only view (#497/U5).
 *   2. analyzeSong runs on the REAL evaluated IR → lane rows + onset cells +
 *      section chips render (proves the IR-snapshot → analyzeSong wiring).
 *   3. A loop length is detected and shown ("loop N cycles" / "N cycles").
 *   4. Clicking the song ruler fires a seek (runtime.seekTo) with NO console
 *      error and the view stays coherent (the DV-10 relaxation).
 *
 * INPUT NOTE: the seeded code IS what gets analyzed. The old note here claimed the
 * opposite — that `setValue` never reaches the eval pipeline, so the starter file
 * was always the analyzed song — and the spec leaned on that: its fixture was a
 * bare `stack(s("bd hh bd hh"), s("~ cp"))`, which is ONE track (a single
 * anonymous statement whose voices become sub-rows), yet it asserted 2+ LANES.
 * It only ever passed because the async file load raced ahead of the seed and the
 * app evaluated the 3-track STARTER instead (#872). It was green for a song it
 * never chose. Observed: seeded bare stack → 1 lane (`d1`), stable; the same music
 * as two `$:` statements → 2 lanes.
 *
 * So the fixture is now two explicit `$:` TRACKS — lanes are per-track, and that
 * is the thing under test. Period CORRECTNESS for specific patterns is covered by
 * songAnalysis.test.ts (isolated); this spec verifies the integration wiring on a
 * real multi-track song. Assertions stay generic (lane count, a detected period)
 * rather than a fixed period value.
 *
 * AUDIO NOTE: the audible jump is NOT observable in this harness (no audio
 * capture). This spec observes structure + no-error; the audio half is a
 * manual user check (design §10).
 */
import { test, expect } from '@playwright/test'
import { bootApp, seedCode, evalCode } from './_appBoot'

/**
 * Boot / seed / eval come from the SHARED helper (#872). The local copies this file
 * used to carry waited only for Monaco to EXIST — so the seed raced the project file
 * load, and when it lost, the app analyzed the 3-track STARTER instead. `bootApp`
 * waits for the file to LAND and `seedCode` proves the model holds the fixture.
 */

test('full-song view: analysis renders, loop detected, ruler seek fires without error', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootApp(page, { drawer: { tabId: 'musical-timeline', height: 320 } })

  // Two explicit `$:` TRACKS — lanes are per-track, so this is a genuinely
  // multi-track song. (A bare `stack(a, b)` is a single anonymous track whose
  // voices render as sub-rows, not as lanes — see INPUT NOTE.)
  await seedCode(page, '$: s("bd hh bd hh")\n$: s("~ cp")')
  await evalCode(page)
  await page.waitForTimeout(1800)

  // The full-song canvas is the only timeline view now (#497/U5).
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })

  // (1) Analysis renders lane rows from the real evaluated IR — EXACTLY the two
  //     tracks this spec seeded, identified by key.
  //
  //     The oracle is deliberately exact. `>= 2` was satisfiable by the 3-track
  //     STARTER, so it could not tell its own fixture from the song the app
  //     evaluates when a seed loses the #872 race — which is precisely how this
  //     spec stayed green for years while never testing its own input. An
  //     assertion that the fallback content also satisfies is not an oracle.
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
  const laneKeys = await page
    .locator('[data-full-song-lane]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-full-song-lane')))
  expect(laneKeys, 'the two seeded anonymous tracks, and only those').toEqual(['d1', 'd2'])

  // (2) The lane activity is drawn on the canvas (the per-cell DOM heatmap was
  //     replaced by SongTimelineCanvas in #419). Detailed canvas content/zoom
  //     observation lives in full-song-canvas.spec.ts; here just assert the
  //     surface mounted and the old DOM cells are gone.
  await page.locator('[data-full-song-canvas]').waitFor({ timeout: 10_000 })
  expect(await page.locator('[data-full-song-cell]').count()).toBe(0)

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
  expect(await page.locator('[data-full-song-lane]').count()).toBe(2)
  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
