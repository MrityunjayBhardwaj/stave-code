/**
 * Full-song view: object-form pickRestart song renders SECTION CONTENT
 * (#463 Stage 1) — Playwright observation / AnviDev observe gate.
 *
 * Before Stage 1, `"<…>".pickRestart({verse:…, chorus:…})` parsed to an opaque
 * Code node whose collect walked the CONTROL string — so the timeline showed
 * the literal labels `verse`/`chorus`, never the section patterns. After Stage 1
 * it parses to a structured NamedPick and collect plays the section content, so
 * the expanded lane's voice labels are the section's samples (bd/sd/cp/hh/oh),
 * NOT the control labels.
 *
 * We TYPE the song (not Monaco setValue) so the editor onChange → file store →
 * eval path runs (sibling arrange specs do the same).
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

// One bare track: rest 2 cyc, then a drum verse (bd/sd/cp), then a chorus (hh/oh).
const SONG = '"<~@2 verse@2 chorus@2>".pickRestart({verse: s("bd sd cp"), chorus: s("hh oh")})'

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

test('pickRestart song renders section content (not the control labels)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  await typeSongAndEval(page, SONG)

  // Verify Monaco actually holds the intended song (auto-close can corrupt typing).
  const typed = await page.evaluate(() => {
    const eds = ((window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; getValue?: () => string } | null }> } } }).monaco?.editor?.getEditors?.()) ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    return t?.getModel()?.getValue?.() ?? ''
  })
  expect(typed).toContain('pickRestart')

  // Enter the full-song view; one lane (the d1 track) renders — it was the
  // opaque-Code label timeline before, now real content.
  // Song canvas is the only timeline view now (#497/U5) -- wait for it.
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
  expect(await page.locator('[data-full-song-lane]').count()).toBeGreaterThanOrEqual(1)

  // Expand the lane → its per-voice sub-rows (#424) carry the section's sample
  // names. Read the gutter label text.
  await page.locator('[data-full-song-lane-expand]').first().click()
  await page.waitForTimeout(200)
  const labelText = (await page.locator('[data-full-song="lane-labels"]').innerText()).toLowerCase()

  // DISCRIMINATOR: section content present, control labels absent.
  expect(labelText).toMatch(/\b(bd|sd|cp|hh|oh)\b/)
  expect(labelText).not.toContain('verse')
  expect(labelText).not.toContain('chorus')

  await page.screenshot({ path: 'test-results/full-song-pickrestart.png' })

  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
