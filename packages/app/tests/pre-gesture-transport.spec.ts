/**
 * The transport must not run until the user asks for it (#1186).
 *
 * THE DEFECT. `LiveCodingRuntime.evaluateForTimeline()` exists to populate the
 * Song timeline's marks WITHOUT starting playback, and its docblock states that
 * contract plainly: "the scheduler start that produces sound lives in `play()`
 * (step 8), which this never reaches." The code never asked for that. It calls
 * `engine.evaluate(code)` → `StrudelEngine.ts:961` → `this.repl.evaluate(code)`
 * with ONE argument, and Strudel's signature is
 * `evaluate(code, autostart = true, …)` (@strudel/core/repl.mjs:222). The flag
 * rides through `setPattern` (repl.mjs:272 → :105-107) into
 * `cyclist.setPattern(pat, autostart)`, which starts the clock outright
 * (@strudel/core/cyclist.mjs:123-126). So merely MOUNTING the Song view starts
 * the transport, with no Play, no click, no keystroke.
 *
 * ⚠ WHY THIS ASSERTS A TRIGGER COUNT AND NOT THE UI. The defect is invisible on
 * screen. The position readout and the playhead gate on the runtime's own
 * play state, which is still false here — correctly, since `play()` was never
 * called — so pre-gesture the LCD prints `— —` and no playhead renders whether
 * the scheduler is running or not. That reading is compatible with both states
 * and can close nothing. `audio.triggers` (`StrudelEngine.ts:586`, incremented
 * inside the scheduler's own output trigger) counts note events actually being
 * emitted, which is the harm itself rather than a symbol of it.
 *
 * WHY THE COUNTER RATHER THAN AN ANALYSER. An analyser peak is a deviation from
 * the 128 midpoint: genuine silence reads ~0, but a buffer that was never
 * written is zero-filled and reads 128 — full scale. Absence and saturation
 * collide, so the number is confident and meaningless without a validated
 * silent control every single time. A counter has no such fold, it is already
 * permanent in the tree, and reading it changes no audio routing.
 *
 * THE THREE ARMS, and none of them is optional:
 *   1. POSITIVE CONTROL — play for real, and the counter must climb. Without
 *      this, a zero in arm 2 is equally well explained by a broken instrument.
 *      It runs FIRST so the instrument is known good before any zero is read.
 *   2. SUBJECT — Song view mounted at load, no gesture at all. The counter must
 *      stay at zero.
 *   3. ISOLATION — drawer closed, no gesture. Confirms the quiet reading in a
 *      configuration where nothing mounts the Song view, so arm 2's failure can
 *      be attributed to the mount rather than to page load in general. The arm
 *      asserts its own isolation held (the Song view really is absent) from the
 *      DOM rather than from the localStorage knob that was supposed to cause it.
 *
 * ⚠ NOTE ON SAMPLING TIME, because the sibling spec has the opposite rule.
 * `engine-init-race-playhead.spec.ts` must not wait before its gesture — every
 * millisecond there heals the race it measures. The rule does not transfer.
 * There is no gesture here to race, and waiting only gives the mount path MORE
 * opportunity to start the transport. Time therefore biases this spec toward
 * DETECTING the defect, never toward missing it, so the sampling window is
 * safe — and a passing run cannot be an artefact of having been too quick.
 *
 * MEASURED BEFORE THE FIX: see the PR. Written and watched failing against the
 * unfixed engine first — a test that has never failed is not a regression test.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

const STORAGE_KEYS = {
  height: 'stave:bottomPanel.height',
  open: 'stave:bottomPanel.open',
  activeTabId: 'stave:bottomPanel.activeTabId',
} as const

/** The profiler enables itself at module load on this flag, so it must precede mount. */
async function enableInstrument(page: Page): Promise<void> {
  await page.addInitScript(() => {
    ;(globalThis as unknown as { __STAVE_PERF__?: boolean }).__STAVE_PERF__ = true
  })
}

/**
 * Count real input events reaching the page, so a "no gesture" arm can PROVE it
 * was one.
 *
 * ⚠ The obvious field does not work, and it fails silently. `navigator
 * .userActivation.hasBeenActive` reads TRUE here before anything is clicked,
 * because Chrome grants activation for a BROWSER-INITIATED navigation and
 * `page.goto` is exactly that — the same grant a user gets for typing the URL.
 * Measured: true in every arm of this file, including the one that never
 * touches the page. An arm guarded by it would report "gesture detected" and
 * mask its real reading. Count the events instead; they are what the app can
 * actually respond to.
 */
async function countInputEvents(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __staveInputEvents?: number }
    w.__staveInputEvents = 0
    for (const type of ['pointerdown', 'mousedown', 'keydown', 'touchstart', 'click']) {
      window.addEventListener(type, () => { w.__staveInputEvents = (w.__staveInputEvents ?? 0) + 1 }, {
        capture: true,
        passive: true,
      })
    }
  })
}

/** How many user input events the page has seen. */
async function inputEvents(page: Page): Promise<number | null> {
  return page.evaluate(
    () => (window as unknown as { __staveInputEvents?: number }).__staveInputEvents ?? null,
  )
}

/** Seed the drawer state so the Song view mounts (or does not) with NO click. */
async function seedDrawer(page: Page, open: boolean): Promise<void> {
  await page.addInitScript(
    ([heightKey, openKey, activeKey, isOpen]: [string, string, string, boolean]) => {
      try {
        window.localStorage.setItem(heightKey, '320')
        window.localStorage.setItem(openKey, isOpen ? 'true' : 'false')
        window.localStorage.setItem(activeKey, 'musical-timeline')
      } catch {
        /* private mode — the drawer just starts closed */
      }
    },
    [STORAGE_KEYS.height, STORAGE_KEYS.open, STORAGE_KEYS.activeTabId, open] as [
      string,
      string,
      string,
      boolean,
    ],
  )
}

async function bootShell(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } })
        .monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 20_000 },
  )
}

/**
 * Cumulative scheduler trigger count, or `null` when the profiler is not there
 * at all. The distinction is the whole point: a missing instrument must never
 * be readable as silence.
 */
async function triggers(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const perf = (
      window as unknown as {
        __stavePerf?: { snapshot?: () => { counters?: Record<string, number> } }
      }
    ).__stavePerf
    const snap = perf?.snapshot?.()
    if (!snap) return null
    return snap.counters?.['audio.triggers'] ?? 0
  })
}

/** Sample the counter over `ms`, returning the highest reading seen. */
async function peakTriggers(page: Page, ms: number): Promise<number | null> {
  const deadline = Date.now() + ms
  let best: number | null = null
  for (;;) {
    const n = await triggers(page)
    if (n === null) return null
    best = best === null ? n : Math.max(best, n)
    if (Date.now() >= deadline) return best
    await page.waitForTimeout(250)
  }
}

test.describe('the transport waits for the user (#1186)', () => {
  test('POSITIVE CONTROL: a real Play makes the trigger counter climb', async ({ page }) => {
    await enableInstrument(page)
    await countInputEvents(page)
    await seedDrawer(page, true)
    await bootShell(page)

    const before = await triggers(page)
    expect(before, 'profiler absent — every other arm in this file is unreadable').not.toBeNull()

    await page.locator('.monaco-editor').first().click()
    await page.keyboard.press(`${MOD}+Enter`)

    await expect
      .poll(async () => (await triggers(page)) ?? -1, {
        timeout: 20_000,
        message:
          'no scheduler triggers after a real Play — the instrument cannot report sound, so a zero elsewhere in this file means nothing',
      })
      .toBeGreaterThan(before ?? 0)
  })

  test('SUBJECT: mounting the Song view must not start the transport', async ({ page }) => {
    await enableInstrument(page)
    await countInputEvents(page)
    await seedDrawer(page, true)
    await bootShell(page)

    // The arm is the one we think it is: the Song view really did mount.
    await expect(page.locator('[data-full-song="root"]')).toBeVisible({ timeout: 15_000 })

    const fired = await peakTriggers(page, 3_000)
    expect(fired, 'profiler absent — this arm cannot distinguish silence from a dead instrument')
      .not.toBeNull()

    // Read AFTER the sampling window: an input arriving late would invalidate
    // the reading just as surely as one arriving early.
    expect(
      await inputEvents(page),
      'an input event reached the page — this arm never tested the gesture-free case',
    ).toBe(0)

    expect(
      fired,
      'the scheduler emitted note events with no Play, no click and no keystroke',
    ).toBe(0)
  })

  test('ISOLATION: with the Song view unmounted the page is quiet', async ({ page }) => {
    await enableInstrument(page)
    await countInputEvents(page)
    await seedDrawer(page, false)
    await bootShell(page)

    // Assert the isolation from the DOM, not from the localStorage knob that was
    // supposed to produce it — an arm that failed to isolate reads exactly like
    // one that did.
    await expect(page.locator('[data-full-song="root"]')).toHaveCount(0)

    const fired = await peakTriggers(page, 3_000)
    expect(fired, 'profiler absent — this arm cannot distinguish silence from a dead instrument')
      .not.toBeNull()
    expect(await inputEvents(page), 'an input event reached the page').toBe(0)
    expect(fired, 'the page emitted note events on load with the Song view unmounted').toBe(0)
  })
})
