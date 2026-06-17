/**
 * Full-song view: a BARE (non-`$:`) pattern preceded by a prelude statement
 * (`setcps(…)`) must still produce timeline rows (#113).
 *
 * The bug: the staged parse pipeline that feeds the IR snapshot (`runRawStage`)
 * lifted the WHOLE source as one opaque Code node when there was no `$:` label,
 * so a leading `setcps(120/240)` made `s("bd hh sd")` parse as a trailing
 * fragment of one expression → zero events → an empty timeline (the pattern
 * still played audibly). `parseStrudel` already stripped the prelude; the staged
 * pipeline had diverged. This drives the issue's exact repro and asserts a lane
 * appears. A discriminating check (the row is absent before the fix) lives in the
 * editor stage parity sentinel + the git-stash gate in review.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function bootShell(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '340')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => ((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco?.editor?.getEditors?.()?.length ?? 0) > 0,
    { timeout: 20_000 },
  )
}

async function typeSongAndEval(page: Page, code: string): Promise<void> {
  await page.evaluate(() => {
    const eds = ((window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string } | null; focus: () => void }> } } }).monaco?.editor?.getEditors?.()) ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    t?.focus()
  })
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${MOD}+A`)
  await page.keyboard.press('Backspace')
  await page.keyboard.type(code, { delay: 8 })
  await page.waitForTimeout(400)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1800)
}

test('a bare pattern after a setcps prelude renders a timeline row', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  await typeSongAndEval(page, 'setcps(120/240)\nsound("bd hh sd")')

  await page.locator('[data-musical-timeline="view-toggle"]').click()

  // The fix: at least one lane row appears (before the fix the IR had zero
  // events → zero lanes → an empty timeline).
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
  const laneCount = await page.locator('[data-full-song-lane]').count()
  expect(laneCount).toBeGreaterThan(0)

  await page.screenshot({ path: 'test-results/bare-after-prelude.png' })
  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
