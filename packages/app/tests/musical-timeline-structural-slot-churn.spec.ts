/**
 * MusicalTimeline structural slot churn (#485) — Playwright observation.
 *
 * Follow-up to #483 (which keyed Live-view rows by `$:` ORDINAL, killing the
 * content-edit churn). A residual remained for STRUCTURAL edits: a `$:` ordinal
 * is positional, so the bare→multi-`$:` transition (and ordinal renumbering)
 * leaves a STALE ghost slot whose remembered label is now shown by a LIVE row —
 * an "inheritance of another track's slot" → a duplicate/phantom row while
 * playing (heals only on stop+replay).
 *
 * Repro (observed): evaluate `s("bd hh cp bd")` (one `d1` row keyed by trackId),
 * then evaluate three `$:` lines (first keys by ordinal `$0`, label `d1`) WITHOUT
 * stopping → two live `d1` rows (the stale trackId-keyed `d1` mirrors the new
 * `$0` row's notes via the grid's trackId event lookup).
 *
 * Fix: drop a ghost slot (no events this render) whose label a LIVE row already
 * shows. A legit ghost (e.g. a commented track whose label is unique) is kept.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function bootShell(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '320')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 15_000 })
  await page.locator('.monaco-editor').waitFor({ timeout: 15_000 })
}

async function setCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const eds = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
    }>
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    if (!t) return false
    t.getModel()?.setValue(c)
    t.focus()
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(150)
}

async function evalStrudel(page: Page): Promise<void> {
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2000)
}
async function stopStrudel(page: Page): Promise<void> {
  await page.keyboard.press(`${MOD}+.`)
  await page.waitForTimeout(400)
}

/** Per ROW: trackId label + note-glyph count (0 = ghost/reserved). */
function rows(page: Page): Promise<{ id: string | null; notes: number }[]> {
  return page.locator('[data-musical-timeline-track-row]').evaluateAll((els) =>
    els.map((r) => ({
      id: r.getAttribute('data-musical-timeline-track-row'),
      notes: r.querySelectorAll('[data-musical-timeline-note]').length,
    })),
  )
}

test('bare → multi-$: transition does NOT leave a duplicate d1 row (#485)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  await setCode(page, 's("bd hh cp bd")')
  await evalStrudel(page)
  expect((await rows(page)).map((r) => r.id)).toEqual(['d1'])

  // Re-evaluate as three `$:` tracks WITHOUT stopping — the structural transition
  // that used to spawn a stale duplicate `d1` (the bare trackId-keyed slot ghost).
  await setCode(page, '$: s("bd*4")\n$: s("hh*8")\n$: s("cp*2")')
  await evalStrudel(page)
  await page.waitForTimeout(400)

  const after = await rows(page)
  // Exactly three rows, each a distinct orbit — NO duplicate d1.
  expect(after.map((r) => r.id)).toEqual(['d1', 'd2', 'd3'])
  expect(after.filter((r) => r.id === 'd1')).toHaveLength(1)

  await stopStrudel(page)
  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})

test('commenting a track still leaves exactly one labelled ghost — no churn (#485)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  await setCode(page, '$: s("bd*4")\n$: s("hh*8")\n$: s("cp*2")')
  await evalStrudel(page)
  expect((await rows(page)).map((r) => r.id)).toEqual(['d1', 'd2', 'd3'])

  // Comment the MIDDLE track while playing. The commented track ghosts (its label
  // is unique — kept), the others stay live; no label is duplicated.
  await setCode(page, '$: s("bd*4")\n// $: s("hh*8")\n$: s("cp*2")')
  await evalStrudel(page)
  await page.waitForTimeout(400)

  const after = await rows(page)
  const ids = after.map((r) => r.id)
  // No duplicate labels (no inheritance of another track's slot).
  expect(new Set(ids).size).toBe(ids.length)
  // The two uncommented tracks are live (have notes); any extra row is the
  // single commented-track ghost (0 notes).
  expect(after.filter((r) => r.notes > 0).length).toBe(2)

  await stopStrudel(page)
  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
