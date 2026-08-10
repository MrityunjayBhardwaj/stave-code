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

/** The other manifest host — the eight b-cdn banks and the drum-machine alias table. */
const B_CDN_GLOB = '**/strudel.b-cdn.net/**'

/**
 * What the rest of the app allows for "the song has drawn" (#1217).
 *
 * This is deliberately the CONSUMERS' number and not a padded one of our own.
 * The first draft of the #1214 fix bounded each fetch at 8s, which left the
 * stalled path at 9.8s end to end — inside this test's own 25s allowance, and
 * therefore green, while every real 10s wait in the app had been quietly turned
 * into a coin flip. A test that grants itself a bigger budget than production
 * can confirm a deadline is finite but can never audit the number, so the
 * number gets asserted here against the budget it actually has to fit.
 */
const SONG_DRAWN_BUDGET_MS = 10_000

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

/**
 * Boot, evaluate, wait for lanes — and return how long the whole path took.
 *
 * The wait is still allowed 25s while the ASSERTION is 10s, and the gap is on
 * purpose: it buys a failure message that distinguishes "took 12s" from "never
 * drew at all". Collapsing the two would give back the diagnostic that made
 * #1214 findable in the first place.
 */
async function timeToLanes(page: Page): Promise<number> {
  const startedAt = Date.now()
  await bootWithTimelineOpen(page)
  await evaluateSong(page)
  await expect(page.locator('[data-full-song-lane]').first()).toBeVisible({
    timeout: 25_000,
  })
  return Date.now() - startedAt
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

    const skipped: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('did not load; continuing without it')) skipped.push(text)
    })

    // The assertion that matters: the app is alive and the song was analysed.
    // On the unfixed build this times out with zero lanes.
    const elapsed = await timeToLanes(page)

    // Non-vacuity: if the glob never matched, the test above proved nothing.
    expect(routeHits, 'the manifest request was never intercepted').toBeGreaterThan(0)

    // The stalled host is the one that degrades, and ONLY it (#1217). Boot's
    // manifest budget is now shared, which raises the obvious risk that the
    // first stall spends all of it and the reachable banks behind it are
    // skipped too — costing the user the piano and the drum machines, silently,
    // to save a few hundred milliseconds. What prevents that is the gap between
    // the per-call ceiling and the whole-phase budget: one stall always leaves
    // enough for a healthy host to answer. That is a relationship between two
    // constants, invisible at either one of them, so it is asserted here.
    expect(
      skipped.some((t) => t.includes('"Dirt-Samples"')),
      'the stalled manifest should have reported itself skipped',
    ).toBe(true)
    expect(
      skipped.filter((t) => !t.includes('"Dirt-Samples"')),
      'a reachable manifest was skipped because a DIFFERENT host stalled',
    ).toEqual([])
    expect(
      elapsed,
      `one stalled manifest cost ${elapsed}ms end to end, past the ${SONG_DRAWN_BUDGET_MS}ms every downstream wait allows`,
    ).toBeLessThan(SONG_DRAWN_BUDGET_MS)
  })

  /**
   * The compounding case (#1217), measured as a PAIRED comparison.
   *
   * One stalled host costs one deadline, which the arm above pins. But the
   * manifest loads run in sequence — the Dirt-Samples index, then the b-cdn
   * banks, then the alias table — so when EVERY host is unreachable (offline, a
   * blocked network, a captive portal, a CDN outage) per-call ceilings stack.
   * Bounding each fetch individually does not bound boot; only a budget over
   * the whole phase does.
   *
   * ⚠ WHY IT IS SHAPED AS A RATIO AND NOT A THRESHOLD. The obvious version
   * asserts the outage path finishes inside the 10s budget — and that version
   * PASSES on code with the defect, because three stacked 3s ceilings land at
   * 9.7s, i.e. 300ms inside the bar. It would have reported "deadlines do not
   * stack" about code where they measurably do, and flaked under any load. So
   * the arm measures the quantity the fix actually controls: the overhead a
   * total outage adds versus the overhead ONE stall adds. If the phase is
   * bounded once, those two are the same wait and the ratio is ~1; if each call
   * carries its own ceiling, the ratio grows with the number of stages.
   *
   * All three legs run on one page in one test on purpose. Boot cost varies
   * with machine load, so an overhead computed against a control measured in a
   * different test — or on a different day — is not a measurement of anything.
   */
  test('the deadlines do not STACK when every manifest host is unreachable (#1217)', async ({
    page,
  }) => {
    // Three boots at up to ~10s each on unfixed code, and the point is to fail
    // on the assertion with its numbers rather than on a harness timeout.
    test.setTimeout(120_000)

    let dirtHits = 0
    let cdnHits = 0

    const healthy = await timeToLanes(page)

    // Routes are added progressively, so each leg is the previous one plus one
    // more unreachable host — nothing is un-routed and no leg re-boots clean.
    await page.route(DIRT_SAMPLES_GLOB, () => {
      dirtHits += 1
    })
    const oneStalled = await timeToLanes(page)

    await page.route(B_CDN_GLOB, () => {
      cdnHits += 1
    })
    const allStalled = await timeToLanes(page)

    // Non-vacuity on BOTH hosts: without this the arm can measure a healthy
    // boot three times and call the last one a survived outage.
    expect(dirtHits, 'the Dirt-Samples request was never intercepted').toBeGreaterThan(0)
    expect(cdnHits, 'the b-cdn requests were never intercepted').toBeGreaterThan(0)

    const oneOverhead = oneStalled - healthy
    const allOverhead = allStalled - healthy
    // eslint-disable-next-line no-console
    console.log(
      `[#1217] healthy ${healthy}ms · one host stalled ${oneStalled}ms (+${oneOverhead}) · ` +
        `all hosts stalled ${allStalled}ms (+${allOverhead})`,
    )

    // The property: a second and third unreachable host must not each buy
    // another full wait. Half again over a single stall is slack for scheduling
    // noise, not room for another ceiling.
    expect(
      allOverhead,
      `a total outage added ${allOverhead}ms where one stalled host added ${oneOverhead}ms — the per-call deadlines are stacking instead of sharing one budget`,
    ).toBeLessThan(oneOverhead * 1.5 + 1_000)

    // And the whole path still has to fit what downstream waits allow.
    expect(
      allStalled,
      `a total manifest outage cost ${allStalled}ms end to end, past the ${SONG_DRAWN_BUDGET_MS}ms every downstream wait allows`,
    ).toBeLessThan(SONG_DRAWN_BUDGET_MS)
  })

  test('control: the same flow with the manifest served normally', async ({ page }) => {
    const elapsed = await timeToLanes(page)
    // Not a budget check — a scale check. It records what the path costs with
    // nothing stalled, so the two numbers above can be read as the deadline's
    // cost rather than as the cost of booting the app at all.
    // eslint-disable-next-line no-console
    console.log(`[#1214 control] boot → lanes with every manifest healthy: ${elapsed}ms`)
    expect(elapsed).toBeLessThan(SONG_DRAWN_BUDGET_MS)
  })
})
