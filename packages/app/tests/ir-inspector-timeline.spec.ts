/**
 * IR Inspector — streaming timeline (Phase 19-08 PR-B).
 *
 * Verifies the capture-and-scrub UX, click-to-pin, J/K event step,
 * pin-by-reference contract under FIFO eviction, and inline-viz
 * orthogonality (PV19) when a pinned snapshot is rendered.
 *
 * Probes:
 *   (a) capture-and-grow: every eval pushes a tick.
 *   (b) FIFO eviction via the chrome trace-length input.
 *   (c) pin past snapshot reflects across the IR tree (PV27).
 *   (d) Unpin button returns tabs to live.
 *   (e) ESC unpins.
 *   (f) J/K step advances playhead and applies highlight.
 *   (g) pin-by-reference: held snapshot survives eviction.
 *   (h) inline-viz orthogonality: pinning does NOT drop view zones.
 */

import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function setStrudelCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
    }>
    const target =
      editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
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
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string } | null
      focus: () => void
    }>
    const target =
      editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    target?.focus()
  })
}

async function evalStrudel(page: Page): Promise<void> {
  await focusStrudelEditor(page)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1800)
}

/**
 * Force a fresh evaluate on a runtime that is already playing.
 *
 * Cmd+Enter is bound to a play/stop TOGGLE (StrudelEditorClient.tsx:504-506):
 * pressing it on a playing runtime calls `stop()`, which does NOT fire
 * `onEvaluateSuccess` and does NOT publish an IRSnapshot. To produce a
 * second capture, we must explicitly stop (Cmd+.) then play (Cmd+Enter).
 *
 * The boot eval inside `bootInspectorWithPattern` is a single Cmd+Enter
 * on a stopped runtime, which DOES fire fireEvaluateSuccess + publish.
 * Every subsequent capture in the same test must use this helper.
 *
 * Observed via debug spec: pressing Cmd+Enter twice yields exactly one
 * `[eval] code updated` log; using Cmd+./Cmd+Enter cycles yields one log
 * per cycle. Plain `evalStrudel` looks identical at the keyboard layer
 * but its runtime semantics differ depending on play state.
 */
async function reEvalStrudel(page: Page): Promise<void> {
  await focusStrudelEditor(page)
  await page.keyboard.press(`${MOD}+.`) // stop
  await page.waitForTimeout(400)
  await page.keyboard.press(`${MOD}+Enter`) // play → publishes IRSnapshot
  await page.waitForTimeout(1800)
}

async function openInspectorPanel(page: Page): Promise<void> {
  const btn = page.locator('button[aria-label="IR Inspector"]').first()
  if (await btn.isVisible().catch(() => false)) {
    await btn.click()
  }
  await page.locator('[data-testid="ir-passes-tablist"]').waitFor({ timeout: 10_000 })
}

async function bootInspectorWithPattern(page: Page, code: string): Promise<void> {
  await page.goto('/')
  await page.locator('.monaco-editor').waitFor({ timeout: 15_000 })
  await setStrudelCode(page, code)
  await evalStrudel(page)
  await openInspectorPanel(page)
}

/**
 * Reset the in-memory capture buffer between probes. The buffer is
 * module-level state in the editor package and persists across page
 * reloads only if the test reuses the same `page` (it doesn't —
 * each test gets a fresh page). However running the spec serially
 * within one worker means an earlier probe's evals can pollute a
 * later probe. Each probe boots a FRESH page (via bootInspector...)
 * so the capture buffer starts empty per Playwright's worker isolation.
 */

test.describe('IR Inspector — streaming timeline (Phase 19-08)', () => {
  test('(a) capture-and-grow: ticks render per eval', async ({ page }) => {
    await bootInspectorWithPattern(page, 'note("c3 e3 g3 a3")')
    // bootInspectorWithPattern already does one eval (Cmd+Enter on a
    // stopped runtime → publishes). Two more re-evals via stop+play
    // cycles to force fresh fireEvaluateSuccess fan-outs.
    await reEvalStrudel(page)
    await reEvalStrudel(page)
    const ticks = page.locator('[data-testid^=ir-timeline-tick-]')
    await expect(ticks).toHaveCount(3, { timeout: 5000 })
  })

  test('(b) FIFO eviction via capacity input', async ({ page }) => {
    await bootInspectorWithPattern(page, 'note("c3 e3 g3 a3")')
    // Set capacity to 2 BEFORE adding more entries; the existing 1 entry
    // stays (slice(-2) on a length-1 array is the same array).
    const cap = page.locator('[data-testid=ir-timeline-capacity-input]')
    await cap.fill('2')
    // Two more re-evals — buffer holds at most 2.
    await reEvalStrudel(page)
    await reEvalStrudel(page)
    const ticks = page.locator('[data-testid^=ir-timeline-tick-]')
    await expect(ticks).toHaveCount(2)
  })

  test('(c) pin past snapshot reflects in IR tree (PV27)', async ({ page }) => {
    await bootInspectorWithPattern(page, 'note("c3 e3 g3 a3")')
    // Tick 0: c3-e3-g3-a3
    await setStrudelCode(page, 'note("d4 f4 a4 b4")')
    await reEvalStrudel(page) // tick 1: d4-f4-a4-b4
    // Click oldest tick (the c3 entry).
    await page.locator('[data-testid=ir-timeline-tick-0]').click()
    const tree = page.locator('[data-testid="ir-tree-section"]')
    // Pinned tree contains the older notes; events count reflects pinned.
    await expect(tree).toContainText('c3')
    await expect(tree).not.toContainText('d4')
  })

  test('(d) Unpin button returns tabs to live', async ({ page }) => {
    await bootInspectorWithPattern(page, 'note("c3 e3 g3 a3")')
    await setStrudelCode(page, 'note("d4 f4 a4 b4")')
    await reEvalStrudel(page)
    await page.locator('[data-testid=ir-timeline-tick-0]').click()
    // Confirm pinned first.
    const tree = page.locator('[data-testid="ir-tree-section"]')
    await expect(tree).toContainText('c3')
    // Unpin via the button.
    await page.locator('[data-testid=ir-timeline-unpin]').click()
    await expect(tree).toContainText('d4')
    await expect(tree).not.toContainText('c3')
  })

  test('(e) ESC unpins', async ({ page }) => {
    await bootInspectorWithPattern(page, 'note("c3 e3 g3 a3")')
    await setStrudelCode(page, 'note("d4 f4 a4 b4")')
    await reEvalStrudel(page)
    await page.locator('[data-testid=ir-timeline-tick-0]').click()
    const tree = page.locator('[data-testid="ir-tree-section"]')
    await expect(tree).toContainText('c3')
    // Focus the panel container and press Escape.
    const panel = page.locator('[role="region"][aria-label="IR Inspector"]')
    await panel.focus()
    await page.keyboard.press('Escape')
    await expect(tree).toContainText('d4')
    await expect(tree).not.toContainText('c3')
  })

  test('(f) J/K step advances playhead and applies highlight', async ({ page }) => {
    // 4-event pattern → events[] has 4 entries to step through.
    await bootInspectorWithPattern(page, 'note("c3 e3 g3 a3")')
    // Pin the only tick (the just-evaled snapshot).
    await page.locator('[data-testid^=ir-timeline-tick-]').last().click()
    // Focus the panel so keydown events route to it.
    const panel = page.locator('[role="region"][aria-label="IR Inspector"]')
    await panel.focus()
    // Press J twice — playhead moves to events[2].
    await page.keyboard.press('j')
    await page.keyboard.press('j')
    // Some IR row gets data-ir-node-highlight="true".
    const highlighted = page.locator('[data-ir-node-highlight="true"]')
    await expect(highlighted.first()).toBeVisible({ timeout: 3000 })
    // Press K once — playhead retreats. Highlight is still present (now
    // at events[1]). The exact node may differ; we only assert that
    // SOME highlight remains.
    await page.keyboard.press('k')
    await expect(page.locator('[data-ir-node-highlight="true"]').first()).toBeVisible()
  })

  test('(g) pin-by-reference: held snapshot survives eviction', async ({ page }) => {
    await bootInspectorWithPattern(page, 'note("c3 e3 g3 a3")')
    // Set capacity to 2 — small enough to evict quickly.
    await page.locator('[data-testid=ir-timeline-capacity-input]').fill('2')
    // Pin the only entry (the c3 snapshot).
    await page.locator('[data-testid=ir-timeline-tick-0]').click()
    // Push 3 more re-evals (capacity 2; with 1 existing + 3 new ⇒ original
    // entry evicts on push #3 once the buffer holds {original, push-1};
    // push-2 then push-3 each evict the oldest).
    await setStrudelCode(page, 'note("d4 f4 a4 b4")')
    for (let i = 0; i < 3; i++) {
      await reEvalStrudel(page)
    }
    // Pinned tree still renders the c3 snapshot — pin-by-reference contract.
    const tree = page.locator('[data-testid="ir-tree-section"]')
    await expect(tree).toContainText('c3')
    // Ghost marker present (pinned snapshot is no longer in the live buffer).
    await expect(page.locator('[data-testid=ir-timeline-ghost]')).toBeVisible()
  })

  test('(h) inline-viz orthogonality: pinning does not break Monaco view zones', async ({ page }) => {
    // .viz() pattern uses an existing registered viz (scope is core).
    await bootInspectorWithPattern(page, 'note("c3 e3 g3 a3").viz("scope")')
    // The inline viz zone may or may not have a deterministic data-testid;
    // assert that the eval produced no console errors before AND after pin.
    const consoleErrors: string[] = []
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(`console: ${m.text()}`)
    })
    await reEvalStrudel(page)
    // Pin the latest tick.
    await page.locator('[data-testid^=ir-timeline-tick-]').last().click()
    // Wait for any post-pin re-render to settle.
    await page.waitForTimeout(400)
    // Filter framework noise.
    const real = consoleErrors.filter(
      (l) => !/Warning:/i.test(l) && !/DevTools/i.test(l),
    )
    expect(real).toEqual([])
    // The IR tree still renders (pin worked).
    await expect(page.locator('[data-testid="ir-tree-section"]')).toBeVisible()
  })
})
