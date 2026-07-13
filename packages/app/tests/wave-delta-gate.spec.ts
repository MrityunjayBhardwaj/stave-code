/**
 * Phase 20-11 wave-δ — γ-7 gate Playwright spec (permanent regression).
 *
 * Closes the witness gap that wave-γ left open: the IR-level unit tests
 * in `packages/editor` don't observe Strudel's transpiler behavior,
 * which converts double-quoted strings to mini-notation Patterns at
 * eval time. The 20-11 `.p("name")` design assumed double quotes would
 * carry through to runtime — they don't. This spec is the human-in-
 * the-loop-replacement that catches that class of bug (P52 mount-path:
 * IR is correct, runtime breaks; only the live canvas observes it).
 *
 * 5 fixtures: A (duplicate $: → 2 rows), B (single-quote .p('kick')),
 * B2 (double-quote .p("kick") no-crash via wrapper guard), C
 * (synthetic d1 + Trap G probe), D (.color() precedence). Screenshots
 * land in test-results/wave-delta/.
 */

import { test, expect, type Page } from '@playwright/test'
import * as path from 'path'

const SCREENSHOT_DIR = 'test-results/wave-delta'
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function setupDrawer(page: Page): Promise<void> {
  await page.context().clearCookies()
  await page.addInitScript(() => {
    try {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith('stave:bottomPanel'))
        .forEach((k) => window.localStorage.removeItem(k))
      window.localStorage.setItem('stave:bottomPanel.height', '320')
      window.localStorage.setItem('stave:bottomPanel.open', 'true')
      window.localStorage.setItem(
        'stave:bottomPanel.activeTabId',
        'musical-timeline',
      )
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page
    .locator('[data-bottom-panel="root"]')
    .waitFor({ timeout: 15_000 })
  await page.locator('.monaco-editor').waitFor({ timeout: 15_000 })
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
  await page.waitForTimeout(200)
}

async function evalStrudel(page: Page): Promise<void> {
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2000)
}

async function stopStrudel(page: Page): Promise<void> {
  await page.keyboard.press(`${MOD}+.`)
  await page.waitForTimeout(300)
}

interface PageState {
  rowCount: number
  labels: string[]
  dotColors: string[]
  consoleErrors: string[]
}

/**
 * Read the Song Timeline's LANES.
 *
 * This used to read `[data-musical-timeline-track-row]` / `-track-label` / `-note` —
 * the DOM live-view that was RETIRED when the timeline became a canvas. Every one of
 * those selectors matched nothing, which is why the file had rotted into a gate that
 * guards nothing: two fixtures failed on the dead selectors, and three could not fail
 * at ALL (two had no `expect` — they `console.error`/`console.log`ed a mismatch and
 * passed anyway; the third asserted `rowCount <= 1`, which `0` satisfies).
 *
 * A lane's KEY is the track's identity — its label when it has one, `d{N}` when it
 * doesn't — which is exactly what the old `track-label` carried, so the fixtures'
 * claims survive the move. What does NOT survive is per-NOTE colour: notes are canvas
 * pixels now, with no DOM to read (see FIXTURE D).
 */
async function snapshotState(
  page: Page,
  consoleErrors: string[],
): Promise<PageState> {
  return await page.evaluate(
    (errors) => {
      const lanes = Array.from(document.querySelectorAll('[data-full-song-lane]'))
      const labels = lanes.map((el) => el.getAttribute('data-full-song-lane') ?? '')
      const dotColors = lanes.map((el) => {
        const d = el.querySelector('[data-full-song-lane-dot]') as HTMLElement | null
        return d ? window.getComputedStyle(d).backgroundColor : ''
      })

      return {
        rowCount: lanes.length,
        labels,
        dotColors,
        consoleErrors: errors.slice(),
      }
    },
    consoleErrors,
  )
}

test.describe('Phase 20-11 wave-δ — γ-7 gate', () => {
  test.beforeEach(async ({ page }) => {
    await setupDrawer(page)
  })

  test('FIXTURE A — duplicate $: → 2 rows + colors + dots', async ({
    page,
  }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => {
      consoleErrors.push(`pageerror: ${err.message}`)
    })

    const source = [
      '$: stack(s("hh*8").gain(0.3), s("bd [~ bd] ~ bd").gain(0.5), s("~ sd ~ [sd cp]").gain(0.4))',
      '$: stack(s("hh*8").gain(0.3), s("bd [~ bd] ~ bd").gain(0.5), s("~ sd ~ [sd cp]").gain(0.4))',
    ].join('\n')

    await setStrudelCode(page, source)
    await evalStrudel(page)
    await page.waitForTimeout(1500)

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'fixtureA.png'),
      fullPage: true,
    })

    const state = await snapshotState(page, consoleErrors)

    console.log('FIXTURE A state:', JSON.stringify(state, null, 2))

    expect(state.labels).toEqual(['d1', 'd2'])
    expect(state.rowCount).toBe(2)
    // Dot color assertion is conditional — 20-12 may collapse to a single
    // shared swatch element per the chrome refactor, so we only assert
    // distinct dots when there ARE 2+ swatches to compare.
    if (state.dotColors.length >= 2) {
      expect(state.dotColors[0]).not.toBe(state.dotColors[1])
    }
    // Check 5b — audio not exercised in probe; runtime warnings flagged below.

    await stopStrudel(page)
  })

  test('FIXTURE B — .p("kick") → single row labeled kick', async ({
    page,
  }) => {
    const consoleMessages: { type: string; text: string }[] = []
    page.on('console', (msg) => {
      consoleMessages.push({ type: msg.type(), text: msg.text() })
    })
    page.on('pageerror', (err) => {
      consoleMessages.push({ type: 'pageerror', text: err.message })
    })

    // Strudel transpiler converts double-quoted strings to mini-notation
    // Patterns. Single quotes keep them as plain strings.
    await setStrudelCode(page, "$: s(\"bd*4\").p('kick')")
    await evalStrudel(page)
    await page.waitForTimeout(1500)

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'fixtureB.png'),
      fullPage: true,
    })

    const state = await snapshotState(
      page,
      consoleMessages.map((m) => `[${m.type}] ${m.text}`),
    )
    console.log('FIXTURE B state:', JSON.stringify(state, null, 2))
    console.log(
      'FIXTURE B wave-δ debug logs:',
      consoleMessages.filter((m) => m.text.includes('wave-δ')),
    )
    console.log(
      'FIXTURE B all warnings/errors:',
      consoleMessages.filter((m) => m.type === 'warning' || m.type === 'error' || m.type === 'pageerror'),
    )

    // This used to `console.error` a mismatch and PASS regardless — there was no
    // assertion here at all, so the fixture could not fail.
    expect(state.labels).toEqual(['kick'])

    await stopStrudel(page)
  })

  test('FIXTURE C — synthetic d1 + Trap G probe', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => {
      consoleErrors.push(`pageerror: ${err.message}`)
    })

    await setStrudelCode(page, 's("bd*4")')
    await evalStrudel(page)
    await page.waitForTimeout(1500)

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'fixtureC.png'),
      fullPage: true,
    })

    const state = await snapshotState(page, consoleErrors)
    console.log('FIXTURE C state (Trap G probe):', JSON.stringify(state, null, 2))

    // Trap G blocking condition: a single bare expression must produce exactly ONE
    // lane, never more. (This asserted `rowCount <= 1` — which the dead selector
    // satisfied with 0, so it passed while measuring nothing. A bare expression is
    // wrapped as a track, so the honest expectation is exactly one lane, named `d1`.)
    expect(state.rowCount).toBe(1)
    expect(state.labels).toEqual(['d1'])

    await stopStrudel(page)
  })

  test('FIXTURE B2 — .p("kick") (double quotes) does NOT crash; IR row still labeled kick', async ({
    page,
  }) => {
    // Strudel transpiler turns "kick" into mini-notation (a Pattern).
    // Passing a Pattern to Strudel's `.p` used to crash with
    // `k.includes is not a function`. After wave-δ fix, our wrapper
    // no-ops on non-string ids so eval continues and the IR-side
    // Track wrap (which accepts both quote styles) gives the row
    // a `kick` label.
    const consoleMessages: { type: string; text: string }[] = []
    page.on('console', (msg) => {
      consoleMessages.push({ type: msg.type(), text: msg.text() })
    })
    page.on('pageerror', (err) => {
      consoleMessages.push({ type: 'pageerror', text: err.message })
    })

    await setStrudelCode(page, '$: s("bd*4").p("kick")')
    await evalStrudel(page)
    await page.waitForTimeout(1500)

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'fixtureB2-double-quotes.png'),
      fullPage: true,
    })

    const state = await snapshotState(page, [])
    console.log('FIXTURE B2 state (double quotes):', JSON.stringify(state, null, 2))

    const includesErrors = consoleMessages.filter(
      (m) => m.text.includes('k.includes is not a function'),
    )
    expect(includesErrors).toEqual([])
    expect(state.labels).toEqual(['kick'])

    await stopStrudel(page)
  })

  // FIXTURE D asserted that `.color("red")` beats the palette by reading each NOTE's
  // background off the DOM. Notes are canvas pixels now — there is no per-note DOM to
  // read, and no equivalent oracle short of pixel-sampling the canvas. Rather than
  // leave it "passing" (it computed `hasRed` and only console.logged it — it had no
  // assertion and could never fail), it is SKIPPED with its reason recorded: the
  // capability it guards is unverified, not proven. Same class as the note-level
  // click-to-source gap (#874) — a canvas view that lost its DOM oracle.
  test.skip('FIXTURE D — .color("red") preserved over palette', async ({ page }) => {
    await setStrudelCode(page, 's("c d e g").note().color("red")')
    await evalStrudel(page)
    await stopStrudel(page)
  })
})
