/**
 * MusicalTimeline (Phase 20-01 PR-B slice β) — Playwright spec.
 *
 * Probes:
 *   1. Empty-state copy "(no tracks yet — play some code)" is visible
 *      verbatim on first open of the drawer (D-08).
 *   2. Eval s("bd hh cp bd") — drawer renders 3 track rows (bd/hh/cp)
 *      and 4 note blocks distributed across them (D-04 / PV28 / Trap 4).
 *   3. Playhead `style.left` advances when the runtime starts playing.
 *   4. Stable track order across re-evals (Trap 5) — disappeared
 *      track keeps its row reserved and empty.
 *   5. Vocabulary regression on the LIVE drawer DOM (Trap 1 + NEW-2)
 *      — textContent + every [title] + every [aria-label] inside the
 *      `[data-bottom-panel-tab="musical-timeline"]` subtree must NOT
 *      match the FORBIDDEN_VOCABULARY regex. Catches runtime-templated
 *      tooltips that vitest fixtures wouldn't trigger.
 *   6. Empty-state vocabulary regression — same regex on a never-eval'd
 *      drawer, in case the empty path leaks something the populated
 *      path didn't.
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

  test('s("bd hh cp bd") renders 3 track rows + 4 note blocks (D-04 / PV28)', async ({
    page,
  }) => {
    await clearDrawerStorage(page)
    await preOpenDrawer(page)
    await bootShell(page)
    await page.locator('.monaco-editor').waitFor({ timeout: 15_000 })

    await setStrudelCode(page, 's("bd hh cp bd")')
    await evalStrudel(page)

    // Wait for at least one track row to render — snapshot fan-out is
    // sync with onEvaluateSuccess so the row appears within ~50ms of
    // the publish.
    const rows = page.locator('[data-musical-timeline-track-row]')
    await expect(rows).toHaveCount(3, { timeout: 5000 })

    const blocks = page.locator('[data-musical-timeline-note]')
    await expect(blocks).toHaveCount(4)

    // bd row carries 2 hits; hh and cp carry 1 each.
    const bdBlocks = page.locator(
      '[data-musical-timeline-track-row="bd"] [data-musical-timeline-note]',
    )
    await expect(bdBlocks).toHaveCount(2)
    await expect(
      page.locator(
        '[data-musical-timeline-track-row="hh"] [data-musical-timeline-note]',
      ),
    ).toHaveCount(1)
    await expect(
      page.locator(
        '[data-musical-timeline-track-row="cp"] [data-musical-timeline-note]',
      ),
    ).toHaveCount(1)

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

  test('stable track order across re-evals (Trap 5)', async ({ page }) => {
    await clearDrawerStorage(page)
    await preOpenDrawer(page)
    await bootShell(page)
    await page.locator('.monaco-editor').waitFor({ timeout: 15_000 })

    await setStrudelCode(page, 's("bd hh cp")')
    await evalStrudel(page)
    await expect(
      page.locator('[data-musical-timeline-track-row]'),
    ).toHaveCount(3, { timeout: 5000 })

    // Stop + re-eval with hh missing; row should still be reserved.
    await setStrudelCode(page, 's("bd cp")')
    await reEvalStrudel(page)
    await expect(
      page.locator('[data-musical-timeline-track-row]'),
    ).toHaveCount(3)
    await expect(
      page.locator(
        '[data-musical-timeline-track-row="hh"] [data-musical-timeline-note]',
      ),
    ).toHaveCount(0)

    // Add a new track — sn should append at slot 3, not in the middle.
    await setStrudelCode(page, 's("bd hh sn cp")')
    await reEvalStrudel(page)
    const labels = await page
      .locator('[data-musical-timeline-track-label]')
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute('data-musical-timeline-track-label')),
      )
    expect(labels).toEqual(['bd', 'hh', 'cp', 'sn'])

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

    // Wait for note blocks to settle so tooltip strings exist.
    await expect(
      page.locator('[data-musical-timeline-note]'),
    ).toHaveCount(4, { timeout: 5000 })

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
})
