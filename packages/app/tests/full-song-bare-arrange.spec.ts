/**
 * Full-song view: a BARE loop is a single selectable clip spanning the song, and
 * SPLITTING it MATERIALIZES the `arrange` combinator (#489) — Playwright
 * observation (AnviDev observe gate).
 *
 * A bare loop (`$: s("bd*4")`, period 1) is shown as ONE clip spanning a floored
 * arrangement span (MIN_BARE_SPAN = 4 bars, D3) so it has room to split. Clicking
 * it selects (it was non-selectable before #489); pressing S materializes
 * `arrange([2, s("bd*4")], [2, s("bd*4")])` — sonically identical, two addressable
 * arms. This is the split-first entry-point that replaced drag-to-wrap (#488).
 *
 * Unit + haps substrate: editor arrange.test.ts (materializeBareSplit) and
 * arrange-materialize-haps.test.ts (the split is [4,4,4,4] — no gap).
 */
import { test, expect, type Page } from '@playwright/test'

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

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

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

test('a bare loop is selectable and pressing S materializes the arrange', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  await typeSongAndEval(page, 's("bd*4")')

  // Song canvas is the only timeline view now (#497/U5) -- wait for it.
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-canvas]').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(400)

  // The bare loop is ONE clip across the floored 4-bar span. Click its body to
  // select (pre-#489 this was a no-op — bare clips weren't selectable).
  const grid = page.locator('[data-full-song="grid"]')
  const box = await grid.boundingBox()
  if (!box) throw new Error('no grid box')
  await page.mouse.click(box.x + box.width * 0.25, box.y + 8)
  await expect(page.locator('[data-full-song="clip-selection"]')).toBeVisible({ timeout: 5_000 })

  // S splits the 4-bar bare clip at its midpoint → materialize the combinator.
  await grid.press('s')
  await expect.poll(() => strudelSource(page), { timeout: 8_000 }).toContain(
    'arrange([2, s("bd*4")], [2, s("bd*4")])',
  )

  await page.screenshot({ path: 'test-results/bare-arrange.png' })
  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
