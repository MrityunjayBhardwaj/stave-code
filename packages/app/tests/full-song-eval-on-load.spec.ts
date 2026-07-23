/**
 * Eval-on-load (#977) — the marks-verdict half of the collect→queryArc split.
 *
 * The Song timeline's PRE-PLAY marks must come from EVAL haps (Strudel's own
 * resolved output), not the hand-written `collect` interpreter — WITHOUT the
 * user ever pressing Play. This is a browser-fidelity gate: pre-play, an
 * evaluate populates `songPatterns`, `getTimelineEvents` reads it, and the
 * timeline's marks memo re-queries.
 *
 * Two arms:
 *  A. VERDICT — pre-play marks are eval-backed, and a signal-only track (whose
 *     onsets `collect` CANNOT compute) draws its eval marks. Adjudicated at
 *     browser fidelity via the debug marks probe (marks are canvas-drawn, so
 *     there is no DOM per-mark to read — the probe publishes the computed marks
 *     when `stave:debug.timelineMarks` is set).
 *  B. REACH — invalid mid-edit code makes eval throw; marks fall back to
 *     collect and the lanes still render (the structural walk is resilient).
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

type MarksProbe = {
  evalBacked: boolean
  eventCount: number
  laneCount: number
  byLane: Record<string, { count: number; onsets: number[]; pitches: Array<number | null> }>
}

function readProbe(page: Page): Promise<MarksProbe | null> {
  return page.evaluate(
    () => (window as unknown as { __staveTimelineMarks?: MarksProbe }).__staveTimelineMarks ?? null,
  )
}

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '320')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
      localStorage.setItem('stave:debug.timelineMarks', '1')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getValue?: () => string } | null }> } } }).monaco
      const eds = m?.editor?.getEditors?.() ?? []
      return eds.some((e) => (e.getModel()?.getValue?.()?.length ?? 0) > 0)
    },
    { timeout: 20_000 },
  )
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 15_000 })
}

/** Type code into the Strudel editor via a real edit (NOT Cmd+Enter → no Play). */
async function editCode(page: Page, code: string): Promise<void> {
  await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null; focus: () => void }> } } }).monaco
    const editors = monaco?.editor?.getEditors?.() ?? []
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    target?.getModel()?.setValue(c)
    target?.focus()
  }, code)
}

test('ARM A — pre-play song marks are eval-backed, no Play pressed', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  await boot(page)

  // Eval-on-load populates songPatterns pre-play → the probe flips evalBacked.
  // Without eval-on-load this stays false forever (marks stay collect-computed).
  await expect
    .poll(async () => (await readProbe(page))?.evalBacked ?? false, { timeout: 20_000 })
    .toBe(true)

  const probe = await readProbe(page)
  expect(probe).not.toBeNull()
  expect(probe!.eventCount).toBeGreaterThan(0)
  expect(errors).toEqual([])
})

test('ARM A — a signal-only track shows its eval marks pre-play (collect cannot)', async ({ page }) => {
  await boot(page)
  await expect
    .poll(async () => (await readProbe(page))?.evalBacked ?? false, { timeout: 20_000 })
    .toBe(true)

  // Track 2 is a SIGNAL fed through segment(8): `collect` produces ZERO note
  // events for it (it can't evaluate `sine`), so pre-eval its lane is empty.
  // Eval resolves 8 discrete pitched onsets. An edit (no Cmd+Enter) drives
  // eval-on-load for the new code.
  await editCode(page, '$: s("bd sd hh")\n$: note(sine.range(48,72).segment(8))')

  // The signal lane (d2) must gain eval marks — the verdict move. `collect`
  // produces ZERO note events for a `sine` signal, so its marks can ONLY come
  // from eval. Adjudicated on a discriminator unique to THIS tune's eval: every
  // resolved onset pitch lands in the `sine.range(48,72)` band. (Polling on mere
  // count>0 would race the previous tune's marks; the pitch band cannot.)
  const inBand = (p: number | null): boolean => typeof p === 'number' && p >= 47 && p <= 73
  await expect
    .poll(
      async () => {
        const pr = await readProbe(page)
        const d2 = pr?.byLane?.['d2']
        return !!d2 && d2.count > 0 && d2.pitches.every(inBand)
      },
      { timeout: 20_000 },
    )
    .toBe(true)

  const probe = await readProbe(page)
  expect(probe!.evalBacked).toBe(true)
})

test('ARM B — invalid mid-edit code keeps the timeline populated, never blank', async ({ page }) => {
  await boot(page)
  await expect
    .poll(async () => (await readProbe(page))?.evalBacked ?? false, { timeout: 20_000 })
    .toBe(true)

  // First a valid multi-track tune so we have known lanes…
  await editCode(page, '$: s("bd sd")\n$: s("hh*4")')
  await expect(page.locator('[data-full-song-lane]')).toHaveCount(2, { timeout: 15_000 })

  // …then break it mid-edit (unclosed string). `engine.evaluate` returns an
  // error WITHOUT throwing and leaves songPatterns holding the last valid haps,
  // so the marks stay eval-backed (last-valid) while the resilient structural
  // walk keeps the lanes — the timeline must NOT go blank. (This is the reach
  // property: eval is all-or-nothing per evaluate, but a bad keystroke never
  // wipes the view. Pre-first-eval the same slot falls back to collect.)
  await editCode(page, '$: s("bd sd")\n$: s("hh*4"')
  // Lanes survive the broken edit (structural skeleton still drawn).
  await expect(page.locator('[data-full-song-lane]')).toHaveCount(2, { timeout: 8_000 })
  // And marks are still present — not a blank timeline.
  await expect
    .poll(async () => {
      const p = await readProbe(page)
      return p ? Object.values(p.byLane).reduce((n, l) => n + l.count, 0) : 0
    }, { timeout: 8_000 })
    .toBeGreaterThan(0)
})
