/**
 * Eval-backed lanes sit in SOURCE order (#871) — Playwright observation spec.
 *
 * AnviDev observe gate: the unit tests pin the pure pieces (`declaredTracks`
 * off the IR, the scene's ranking); this drives the REAL app end-to-end.
 *
 * A track that emits no static-IR events — a sampled signal, a bare ref — has no
 * `analyzeSong` lane, so its marks come from the evaluated haps (#865) and the
 * scene could only APPEND its lane after the IR lanes. Written first, it then
 * rendered last: `$: <signal>` + `$: s("bd sd hh")` produced lanes ["d2","d1"] —
 * a lane labelled d2 above one labelled d1. Lane order is structure, and the IR
 * knows it (it carries a Track node per statement even with zero events), so the
 * scene now ranks IR-backed and eval-backed lanes together by the IR track list.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const SIGNAL = 'note(sine.range(48,72).segment(8))'

async function boot(page: Page): Promise<void> {
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
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 20_000 },
  )
  // #872 — the editor's content is a CONTROLLED value fed by the async project
  // file load. Seeding before that lands lets it overwrite our code, and the app
  // evaluates the STARTER example instead (silently: the spec still runs, just
  // against the wrong song). Wait for the load: the model goes empty → file.
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getValue?: () => string } | null }> } } }).monaco
      const eds = m?.editor?.getEditors?.() ?? []
      return eds.some((e) => (e.getModel()?.getValue?.()?.length ?? 0) > 0)
    },
    { timeout: 20_000 },
  )
}

async function evalCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    if (!target) return false
    target.getModel()?.setValue(c)
    target.focus()
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(150)
  await page.keyboard.press(`${MOD}+Enter`)
}

/** The rendered lane rows, top to bottom. */
async function laneOrder(page: Page): Promise<Array<string | null>> {
  const lanes = page.locator('[data-full-song-lane]')
  const n = await lanes.count()
  const out: Array<string | null> = []
  for (let i = 0; i < n; i++) out.push(await lanes.nth(i).getAttribute('data-full-song-lane'))
  return out
}

test('an eval-backed lane written FIRST renders first, not after the IR lanes', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await boot(page)
  await evalCode(page, `$: ${SIGNAL}\n$: s("bd sd hh")`)
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })
  await expect(page.locator('[data-full-song-lane]')).toHaveCount(2, { timeout: 10_000 })

  // The signal is track 1 (d1), the drums track 2 (d2) — and that is the order
  // they render in. Pre-fix this was ["d2","d1"].
  expect(await laneOrder(page)).toEqual(['d1', 'd2'])
  expect(errors).toEqual([])
})

test('the IR-first control is unchanged', async ({ page }) => {
  await boot(page)
  await evalCode(page, `$: s("bd sd hh")\n$: ${SIGNAL}`)
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })
  await expect(page.locator('[data-full-song-lane]')).toHaveCount(2, { timeout: 10_000 })

  expect(await laneOrder(page)).toEqual(['d1', 'd2'])
})

test('named tracks keep source order too (the lane key is the label)', async ({ page }) => {
  await boot(page)
  await evalCode(page, `sig: ${SIGNAL}\ndrums: s("bd sd hh")`)
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })
  await expect(page.locator('[data-full-song-lane]')).toHaveCount(2, { timeout: 10_000 })

  // Pre-fix: ["drums","sig"].
  expect(await laneOrder(page)).toEqual(['sig', 'drums'])
})
