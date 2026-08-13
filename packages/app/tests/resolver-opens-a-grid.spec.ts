/**
 * The resolver opens a real grid in the real app (#1240) — Playwright observation.
 *
 * Every other gate for this change asks a MODEL a question: does `chunkDetect`
 * name a span, does `routeSurface` pick a surface, does the coverage harness
 * score it. All of them run against `editor/src`. The browser runs
 * `editor/dist`, mounts `PatternPanel`, and is the only place that can answer
 * "does the musician actually get a grid" — which is the entire claim of the
 * issue and the one thing no vitest arm reaches, because nothing mounts the
 * panel.
 *
 * THE FIXTURE IS THE POINT. `s(drums)` carries no string literal of its own:
 * pre-#1240 the first-literal walk found nothing, `patternKind` returned null,
 * and the Pattern tab showed its standby hint. The content lives two statements
 * up, so this also exercises the cross-statement span whose freshness guard is
 * the riskiest part of the change.
 *
 * The CONTROL arm is what makes the win attributable: an identical document
 * whose head owns its literal inline was already editable before this change,
 * so it must be editable now too. A run where both arms fail is a broken
 * harness, not a broken feature — and one where only the control passes is the
 * pre-#1240 tree.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '320')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'pattern')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 20_000 },
  )
}

/** set the document, evaluate it, then put the cursor on `caret` */
async function typeAndPoint(page: Page, code: string, caret: string): Promise<void> {
  await page.evaluate(
    ({ c, needle }) => {
      const monaco = (window as unknown as {
        monaco?: { editor?: { getEditors?: () => unknown[] } }
      }).monaco
      const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
        getModel: () => {
          getLanguageId?: () => string
          setValue: (s: string) => void
          getPositionAt: (o: number) => unknown
        } | null
        setPosition: (p: unknown) => void
        focus: () => void
      }>
      const target =
        editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
      const model = target?.getModel()
      model?.setValue(c)
      target?.focus()
      const at = c.indexOf(needle)
      if (model && at >= 0) target.setPosition(model.getPositionAt(at + 1))
    },
    { c: code, needle: caret },
  )
  await page.waitForTimeout(150)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(250)
  // The panel binds to the cursor, and ⌘↵ can move focus — re-assert it.
  await page.evaluate(
    ({ c, needle }) => {
      const monaco = (window as unknown as {
        monaco?: { editor?: { getEditors?: () => unknown[] } }
      }).monaco
      const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
        getModel: () => { getLanguageId?: () => string; getPositionAt: (o: number) => unknown } | null
        setPosition: (p: unknown) => void
        focus: () => void
      }>
      const target =
        editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
      const model = target?.getModel()
      target?.focus()
      const at = c.indexOf(needle)
      if (model && at >= 0) target.setPosition(model.getPositionAt(at + 1))
    },
    { c: code, needle: caret },
  )
}

const grid = '[data-bottom-panel-tab="pattern"]'

test.describe('#1240 — a resolver-named span opens a grid in the real app', () => {
  test('CONTROL: an inline literal still opens the step grid', async ({ page }) => {
    await boot(page)
    await typeAndPoint(page, '$: s("bd sd hh cp").lpf(400)', '.lpf')
    await expect(page.locator(`${grid} [data-seq-cell]`).first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test('a BOUND reference opens the step grid, where it used to show standby', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
    })

    await boot(page)
    // No literal on the head call. The span lives in the declaration above.
    await typeAndPoint(page, 'const drums = "bd sd hh cp"\n$: s(drums).lpf(400)', '.lpf')

    const cells = page.locator(`${grid} [data-seq-cell]`)
    await expect(cells.first()).toBeVisible({ timeout: 15_000 })
    // Four steps × four lanes — the content of the DECLARATION, not of the
    // statement the cursor is in.
    expect(await cells.count()).toBeGreaterThanOrEqual(16)

    expect(errors).toEqual([])
  })

  test('a bound MELODY opens the piano roll, not the grid', async ({ page }) => {
    await boot(page)
    await typeAndPoint(page, 'const mel = "c3 e3 g3"\n$: note(mel).room(2)', '.room')
    await expect(page.locator(`${grid} [data-roll-cell]`).first()).toBeVisible({
      timeout: 15_000,
    })
    // The two surfaces are exclusive: seeing roll cells must mean no grid cells.
    expect(await page.locator(`${grid} [data-seq-cell]`).count()).toBe(0)
  })
})
