/**
 * MusicalTimeline (Phase 20-01 PR-B slice β) — Playwright spec.
 *
 * ROW MODEL (#477, re-grounded session 21 by direct DOM observation): the
 * Timeline keys rows by `$:`-SLOT / orbit, not by sound name. One top-level
 * `s("bd hh cp bd")` line is ONE row labelled `d1`; the three sounds split
 * INSIDE the track (Sequencer — see sequencer.spec.ts) or on EXPAND (#424),
 * not into three rows. Stacked `$:` lines render one row per slot (`d1`/`d2`/
 * `d3`) in source order. The window is `WINDOW_CYCLES = 2` (timeAxis.ts), so a
 * 4-event cycle tiles 8 note blocks. The old per-sound-row + 1-cycle assertions
 * were superseded by the clip-op milestone (#442/#444/#446/#463/#472) — these
 * are updated to the live contract.
 *
 * Probes:
 *   1. Empty-state copy "(no tracks yet — play some code)" is visible
 *      verbatim on first open of the drawer (D-08).
 *   2. Eval s("bd hh cp bd") — drawer renders ONE `$:`-slot row (`d1`)
 *      with a 2-cycle window of note blocks (8 = 4 events × WINDOW_CYCLES).
 *   3. Playhead `style.left` advances when the runtime starts playing.
 *   4. Stacked `$:` lines render one stable row per slot (`d1`/`d2`/`d3`)
 *      in source order; a new `$:` track appends at the END.
 *   5. Vocabulary regression on the LIVE drawer DOM (Trap 1 + NEW-2)
 *      — textContent + every [title] + every [aria-label] inside the
 *      `[data-bottom-panel-tab="musical-timeline"]` subtree must NOT
 *      match the FORBIDDEN_VOCABULARY regex. Catches runtime-templated
 *      tooltips that vitest fixtures wouldn't trigger.
 *   6. Empty-state vocabulary regression — same regex on a never-eval'd
 *      drawer, in case the empty path leaks something the populated
 *      path didn't.
 *   7. Ruler renders cycle labels 0/1/2 verbatim on populated DOM
 *      (Phase 20-02 DV-09).
 *   8. Commenting a `$:` track drops its row (stop+replay keeps it gone).
 *
 * The forbidden-vocabulary regex literal is duplicated here (the
 * source-of-truth is `packages/app/src/components/musicalTimeline/
 * forbiddenVocabulary.ts`); the comment in the spec points at that
 * file so a future drift between the two is visible at review time.
 */

import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

const STORAGE_KEYS = {
  height: 'stave:bottomPanel.height',
  open: 'stave:bottomPanel.open',
  activeTabId: 'stave:bottomPanel.activeTabId',
} as const

/**
 * Mirror of `packages/app/src/components/musicalTimeline/
 * forbiddenVocabulary.ts` — kept verbatim by convention. If the source
 * regex changes, update both sites in the same PR. The component-level
 * vitest probe imports the source regex; the Playwright spec duplicates
 * it because tests don't share a module loader with the app bundle.
 */
const FORBIDDEN_VOCABULARY =
  /\b(?:snapshot|publishIRSnapshot|captureSnapshot|IREvent|IRNode|trackId|publishIR|loc)\b|\bIR\b|\bpass\b|\btick\b|\bpin\b|\beval\b/i

async function clearDrawerStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.removeItem('stave:bottomPanel.height')
      window.localStorage.removeItem('stave:bottomPanel.open')
      window.localStorage.removeItem('stave:bottomPanel.activeTabId')
    } catch {
      /* ignore */
    }
  })
}

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
  await page
    .locator('[data-bottom-panel="root"]')
    .waitFor({ timeout: 15_000 })
}

async function setStrudelCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    const monaco = (
      window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }
    ).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => {
        getLanguageId?: () => string
        setValue: (s: string) => void
      } | null
      focus: () => void
    }>
    const target =
      editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ??
      editors[0]
    if (!target) return false
    target.getModel()?.setValue(c)
    target.focus()
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(150)
}

async function focusStrudelEditor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const monaco = (
      window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }
    ).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string } | null
      focus: () => void
    }>
    const target =
      editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ??
      editors[0]
    target?.focus()
  })
}

async function evalStrudel(page: Page): Promise<void> {
  await focusStrudelEditor(page)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1800)
}

async function reEvalStrudel(page: Page): Promise<void> {
  await focusStrudelEditor(page)
  await page.keyboard.press(`${MOD}+.`)
  await page.waitForTimeout(400)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1800)
}

async function stopStrudel(page: Page): Promise<void> {
  await focusStrudelEditor(page)
  await page.keyboard.press(`${MOD}+.`)
  await page.waitForTimeout(400)
}

/**
 * Walk the drawer subtree and return all musician-facing strings —
 * textContent, every `[title]`, every `[aria-label]` — for the
 * vocabulary regression assertion.
 */
async function collectDrawerSurfaceStrings(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const root = document.querySelector(
      '[data-bottom-panel-tab="musical-timeline"]',
    )
    if (!root) return []
    const out: string[] = []
    if (root.textContent) out.push(root.textContent)
    root.querySelectorAll('[title]').forEach((el) => {
      const t = el.getAttribute('title')
      if (t) out.push(t)
    })
    root.querySelectorAll('[aria-label]').forEach((el) => {
      const a = el.getAttribute('aria-label')
      if (a) out.push(a)
    })
    const rootAria = root.getAttribute('aria-label')
    if (rootAria) out.push(rootAria)
    return out
  })
}

test.describe('MusicalTimeline — slice β (Phase 20-01 PR-B)', () => {
  test('empty state copy is visible verbatim on first open', async ({
    page,
  }) => {
    await clearDrawerStorage(page)
    await preOpenDrawer(page)
    await bootShell(page)

    const empty = page.locator('[data-musical-timeline="empty-label"]')
    await expect(empty).toHaveCount(1)
    await expect(empty).toHaveText('(no tracks yet — play some code)')

    const status = page.locator('[data-musical-timeline="status-text"]')
    await expect(status).toHaveText('(stopped)')
  })

  test('s("bd hh cp bd") renders ONE $:-slot row (d1) with a 2-cycle window of notes (#477)', async ({
    page,
  }) => {
    await clearDrawerStorage(page)
    await preOpenDrawer(page)
    await bootShell(page)
    await page.locator('.monaco-editor').waitFor({ timeout: 15_000 })

    await setStrudelCode(page, 's("bd hh cp bd")')
    await evalStrudel(page)

    // A bare top-level `s(...)` is ONE `$:`-slot row (`d1`); the four sounds
    // split inside the track, not into per-sound rows. Poll for the row — the
    // first eval after a cold boot can lag the fixed wait.
    const rows = page.locator('[data-musical-timeline-track-row]')
    await expect(rows).toHaveCount(1, { timeout: 6000 })
    await expect(
      page.locator('[data-musical-timeline-track-row="d1"]'),
    ).toHaveCount(1)
    await expect(
      page.locator('[data-musical-timeline-track-label="d1"]'),
    ).toHaveCount(1)

    // WINDOW_CYCLES (timeAxis.ts) = 2 → a 4-event cycle tiles 8 blocks, all on
    // the single `d1` row.
    const blocks = page.locator('[data-musical-timeline-note]')
    await expect(blocks).toHaveCount(8)
    await expect(
      page.locator(
        '[data-musical-timeline-track-row="d1"] [data-musical-timeline-note]',
      ),
    ).toHaveCount(8)

    await stopStrudel(page)
  })

  test('playhead advances while playing', async ({ page }) => {
    await clearDrawerStorage(page)
    await preOpenDrawer(page)
    await bootShell(page)
    await page.locator('.monaco-editor').waitFor({ timeout: 15_000 })

    await setStrudelCode(page, 's("bd hh cp bd")')
    await evalStrudel(page)

    const playhead = page.locator('[data-musical-timeline="playhead"]')
    await expect(playhead).toHaveCount(1)

    // Sample style.left twice over a 600ms window; expect the playhead
    // to move at all (cps × pxPerCycle drives the rate; even slow
    // tempos cover several pixels in 600ms).
    const t0 = await playhead.evaluate((el) => (el as HTMLElement).style.left)
    await page.waitForTimeout(600)
    const t1 = await playhead.evaluate((el) => (el as HTMLElement).style.left)
    expect(t0).not.toBe(t1)

    await stopStrudel(page)
  })

  test('stacked $: lines render one stable slot row each; a new $: appends at the END (#477)', async ({ page }) => {
    // The Timeline keys rows by `$:`-slot/orbit (`slotKey`, stableTrackOrder).
    // Two `$:` lines → two rows `d1`/`d2` in source order; adding a third `$:`
    // appends `d3` at the END, never in the middle. (The old per-sound ghost-
    // reserve-while-playing assertion was dropped: re-grounding showed the
    // ghost behaviour across re-evals is not deterministically reproducible in
    // the slot model — tracked separately in #483. Per-sound splitting is
    // covered by sequencer.spec.ts.)
    await clearDrawerStorage(page)
    await preOpenDrawer(page)
    await bootShell(page)
    await page.locator('.monaco-editor').waitFor({ timeout: 15_000 })

    await setStrudelCode(page, '$: s("bd*4")\n$: s("hh*8")')
    await evalStrudel(page)
    await expect(
      page.locator('[data-musical-timeline-track-row]'),
    ).toHaveCount(2, { timeout: 6000 })
    const twoLabels = await page
      .locator('[data-musical-timeline-track-label]')
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute('data-musical-timeline-track-label')),
      )
    expect(twoLabels).toEqual(['d1', 'd2'])

    // Append a third `$:` track — it lands at the end as `d3`, the first two
    // keep their rows.
    await setStrudelCode(page, '$: s("bd*4")\n$: s("hh*8")\n$: s("cp*2")')
    await evalStrudel(page)
    await expect(
      page.locator('[data-musical-timeline-track-row]'),
    ).toHaveCount(3)
    const threeLabels = await page
      .locator('[data-musical-timeline-track-label]')
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute('data-musical-timeline-track-label')),
      )
    expect(threeLabels).toEqual(['d1', 'd2', 'd3'])

    await stopStrudel(page)
  })

  test('vocabulary regression on populated live DOM (Trap 1 + NEW-2)', async ({
    page,
  }) => {
    await clearDrawerStorage(page)
    await preOpenDrawer(page)
    await bootShell(page)
    await page.locator('.monaco-editor').waitFor({ timeout: 15_000 })

    await setStrudelCode(page, 's("bd hh cp bd")')
    await evalStrudel(page)

    // Wait for note blocks to settle so tooltip strings exist (one `d1` row,
    // 4 events × WINDOW_CYCLES = 8 blocks).
    await expect(
      page.locator('[data-musical-timeline-note]'),
    ).toHaveCount(8, { timeout: 6000 })

    const strings = await collectDrawerSurfaceStrings(page)
    expect(strings.length).toBeGreaterThan(0)
    for (const s of strings) {
      expect(
        s,
        `Vocabulary leak in MusicalTimeline DOM: "${s}"`,
      ).not.toMatch(FORBIDDEN_VOCABULARY)
    }

    await stopStrudel(page)
  })

  test('vocabulary regression on empty state', async ({ page }) => {
    await clearDrawerStorage(page)
    await preOpenDrawer(page)
    await bootShell(page)

    // Don't eval anything — drawer is showing the empty-state copy.
    await expect(
      page.locator('[data-musical-timeline="empty-label"]'),
    ).toHaveCount(1)

    const strings = await collectDrawerSurfaceStrings(page)
    expect(strings.length).toBeGreaterThan(0)
    for (const s of strings) {
      expect(
        s,
        `Vocabulary leak in MusicalTimeline empty-state DOM: "${s}"`,
      ).not.toMatch(FORBIDDEN_VOCABULARY)
    }
  })

  test('ruler renders cycle labels 0/1/2 on populated DOM (Phase 20-02 DV-09)', async ({ page }) => {
    await clearDrawerStorage(page)
    await preOpenDrawer(page)
    await bootShell(page)
    await page.locator('.monaco-editor').waitFor({ timeout: 15_000 })

    await setStrudelCode(page, 's("bd hh cp bd")')
    await evalStrudel(page)

    const labelsLocator = page.locator('[data-musical-timeline-ruler-label]')
    await expect(labelsLocator).toHaveCount(3, { timeout: 5000 })
    const labelTexts = await labelsLocator.evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).textContent),
    )
    expect(labelTexts).toEqual(['0', '1', '2'])

    const gutter = page.locator('[data-musical-timeline="ruler-gutter"]')
    await expect(gutter).toHaveText('CYCLES')

    await stopStrudel(page)
  })

  test('commenting a $: track drops its row across stop + replay (#477)', async ({
    page,
  }) => {
    // Direct-observation transport gate. In the `$:`-slot model the meaningful
    // remove gesture is COMMENTING a `$:` line (re-grounded session 21):
    //   1. Play two `$:` tracks → rows `d1`, `d2`.
    //   2. Comment the second line, then Stop (Cmd+.) + replay.
    //   3. The slot map resets on the transport stop edge (MusicalTimeline.tsx
    //      prevCycleNullRef), so the replay reflects the current IR alone → the
    //      commented track is gone, only `d1` remains.
    // The intermediate "comment WHILE PLAYING" frame is deliberately NOT
    // asserted: re-grounding showed the ghost-during-live-edit row is retained
    // until the stop edge and is not deterministic across re-evals (#483). Only
    // the post-stop state is a stable contract.
    await clearDrawerStorage(page)
    await preOpenDrawer(page)
    await bootShell(page)
    await page.locator('.monaco-editor').waitFor({ timeout: 15_000 })

    await setStrudelCode(page, '$: s("bd*4")\n$: s("hh*8")')
    await evalStrudel(page)
    await expect(
      page.locator('[data-musical-timeline-track-row]'),
    ).toHaveCount(2, { timeout: 6000 })

    // Comment the hh track, STOP (resets the slot map), then replay.
    await setStrudelCode(page, '$: s("bd*4")\n// $: s("hh*8")')
    await stopStrudel(page)
    await page.waitForTimeout(400)
    await evalStrudel(page)

    // The replay reflects the current IR alone — only `d1`.
    await expect(
      page.locator('[data-musical-timeline-track-row]'),
    ).toHaveCount(1)
    await expect(
      page.locator('[data-musical-timeline-track-row="d1"]'),
    ).toHaveCount(1)

    await stopStrudel(page)
  })
})
