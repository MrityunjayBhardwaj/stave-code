/**
 * Full-song view: a clip op on an `arrange(...)` lane must write back when the
 * arrange lives inside a MULTI-track (`$:`) program, not only standalone (#456).
 *
 * The sibling arrange specs all use a single standalone `arrange(...)`. The bug:
 * with sibling `$:` tracks present, `collect` appends a Track-WRAPPER loc (the
 * whole `$:` line) whose start precedes the combinator, so the per-lane clip
 * anchor (`arrangeByLane`, timelineMarks.ts) used to pick that wrapper offset →
 * `detectArrangeAt` resolved null → the edit silently no-op'd while the clip
 * still highlighted (selection is display-side, write-back is source-side).
 *
 * This drives the issue's exact reproduction: a 3-track file, select the d1
 * arrange clip, press S, and assert the d1 line's arrange is rewritten while the
 * two sibling track lines stay byte-identical.
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

function strudelSource(page: Page): Promise<string> {
  return page.evaluate(() => {
    const eds = ((window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; getValue: () => string } | null }> } } }).monaco?.editor?.getEditors?.()) ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    return t?.getModel()?.getValue() ?? ''
  })
}

const SONG = [
  '$: arrange([2, s("bd")], [2, s("hh")], [4, s("cp")])',
  '$: s("bd*2, ~ sd, hh*8").bank("RolandTR909")',
  '$: note("c2 eb2 g2 c3").s("sawtooth").slow(2)',
].join('\n')

test('split a clip on the arrange lane of a multi-track song rewrites that $: line only', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  await typeSongAndEval(page, SONG)

  await page.locator('[data-musical-timeline="view-toggle"]').click()
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-canvas]').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(400)

  // The arrange (d1) is the first lane. Arm 0 = bd, weight 2 of the 8-cycle
  // song → the first ~25% of the width. Click near the start (cycle <2) to land
  // in arm 0, on the top lane.
  const grid = page.locator('[data-full-song="grid"]')
  const box = await grid.boundingBox()
  if (!box) throw new Error('no grid box')
  await page.mouse.click(box.x + box.width * 0.08, box.y + 8)
  await expect(page.locator('[data-full-song="clip-selection"]')).toBeVisible({ timeout: 5_000 })
  await grid.press('s')

  // The d1 arrange's arm 0 `[2, s("bd")]` is sliced into two `[1, s("bd")]`.
  await expect.poll(() => strudelSource(page), { timeout: 8_000 }).toContain(
    'arrange([1, s("bd")], [1, s("bd")], [2, s("hh")], [4, s("cp")])',
  )

  // The two sibling track lines must be byte-untouched.
  const src = await strudelSource(page)
  expect(src).toContain('$: s("bd*2, ~ sd, hh*8").bank("RolandTR909")')
  expect(src).toContain('$: note("c2 eb2 g2 c3").s("sawtooth").slow(2)')

  await page.screenshot({ path: 'test-results/arrange-multitrack-split.png' })
  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
