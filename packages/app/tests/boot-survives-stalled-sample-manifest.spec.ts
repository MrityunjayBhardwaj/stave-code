/**
 * boot-survives-stalled-sample-manifest.spec.ts — REGRESSION GUARD for #1214.
 *
 * THE DEFECT. `StrudelEngine.initInternal` loaded sample manifests over the
 * network with no deadline — the Dirt-Samples index from raw.githubusercontent.com
 * among them — and the loader underneath (`superdough/sampler.mjs`) issues its
 * fetches with no AbortController, no signal and no timeout. When one of those
 * requests stalled, the await never settled, so engine init never finished.
 *
 * Three properties turned that into a dead app rather than a slow one:
 *   1. the await was unbounded;
 *   2. `init()` memoises its in-flight promise, so every later caller joined the
 *      same never-settling promise instead of retrying — pressing the eval
 *      shortcut again recovered nothing;
 *   3. the promise never REJECTED, so no catch anywhere could see it.
 * The user saw a blank Song timeline, no error, and no way back but a reload.
 * It hit roughly one page load in ten.
 *
 * ── WHY THIS TEST IS SHAPED THIS WAY ────────────────────────────────────────
 * The bug is triggered by a third party being slow, so it cannot be caught by
 * sampling. Four 40-trial runs of the unfixed build on one quiet machine
 * returned 2, 15, 0 and 0 failures — eighty consecutive clean trials on code
 * that was definitely broken. Any "run it N times and count" criterion would
 * have passed the unfixed build.
 *
 * So the trigger is SUMMONED rather than sampled: the manifest request is held
 * open and never answered, which is exactly what a stalled connection looks
 * like to the page, and which reproduces the failure 100% of the time. That
 * makes this a regression test that genuinely failed before the fix — verified
 * against the unfixed tree, where it times out with zero lanes.
 *
 * ⚠ `routeHits` is asserted. An interception that silently never matched would
 * make this test pass for the wrong reason, and a guard that cannot tell "the
 * app survived the stall" from "there was no stall" guards nothing.
 */
import { test, expect, type Page } from '@playwright/test'

/** The one request held open. Matches the Dirt-Samples index wherever it is served from. */
const DIRT_SAMPLES_GLOB = '**/tidalcycles/Dirt-Samples/**'

/** Two bars of two different sounds — enough that a working analysis draws lanes. */
const SONG = 'arrange([2, s("bd")], [2, s("hh")])'

async function bootWithTimelineOpen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '340')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
    } catch {
      /* private-mode storage refusal is not this test's subject */
    }
  })
  await page.goto('/')
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } })
        .monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 20_000 },
  )
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 20_000 })
}

async function evaluateSong(page: Page): Promise<void> {
  await page.evaluate((code) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } })
      .monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    target?.getModel()?.setValue(code)
    target?.focus()
  }, SONG)
  await page.waitForTimeout(150)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter')
}

test.describe('engine boot survives a stalled sample manifest (#1214)', () => {
  test('the timeline still draws when the Dirt-Samples manifest never answers', async ({
    page,
  }) => {
    let routeHits = 0
    // Held open: never fulfilled, never aborted. Every other request is
    // untouched, so this isolates the one stall rather than breaking the page.
    await page.route(DIRT_SAMPLES_GLOB, () => {
      routeHits += 1
      /* deliberately never settled — this IS the defect's trigger */
    })

    await bootWithTimelineOpen(page)
    await evaluateSong(page)

    // The assertion that matters: the app is alive and the song was analysed.
    // On the unfixed build this times out with zero lanes.
    await expect(page.locator('[data-full-song-lane]').first()).toBeVisible({
      timeout: 25_000,
    })

    // Non-vacuity: if the glob never matched, the test above proved nothing.
    expect(routeHits, 'the manifest request was never intercepted').toBeGreaterThan(0)
  })

  test('control: the same flow with the manifest served normally', async ({ page }) => {
    await bootWithTimelineOpen(page)
    await evaluateSong(page)
    await expect(page.locator('[data-full-song-lane]').first()).toBeVisible({
      timeout: 25_000,
    })
  })
})
