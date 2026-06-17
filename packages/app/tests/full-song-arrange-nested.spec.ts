/**
 * Full-song view: edit a NESTED combinator arm (#451) — Playwright observation
 * (AnviDev observe gate).
 *
 * `arrange([2, cat(s("bd"), s("sd"))], [1, s("hh")]).p('drums')`: arm 0's pattern
 * is itself a `cat`. The song timeline must treat that as ONE outer clip (the cat
 * block, cycles [0,2)) and edit the OUTER arrange — NOT the inner cat (which
 * previously made trim/split silent no-ops). This drives the REAL app end-to-end:
 * splitting the cat block slices the OUTER arm `[2, cat(...)]` into two halves,
 * the inner cat preserved verbatim in each.
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

async function typeSongAndEval(page: Page, code: string): Promise<void> {
  const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
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

test('splitting a nested cat-block clip slices the OUTER arrange arm, inner cat preserved', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  // `.p('drums')` names the whole arrange ONE track → one lane, so the cat block
  // is a single clip (arm 0, cycles [0,2)); period = 2 + 1 = 3.
  await typeSongAndEval(page, "arrange([2, cat(s(\"bd\"), s(\"sd\"))], [1, s(\"hh\")]).p('drums')")

  await page.locator('[data-musical-timeline="view-toggle"]').click()
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-canvas]').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(400)

  // Select the cat block (arm 0, cycle ~0.5 = 0.5/3 ≈ 0.17·W), then press S.
  const grid = page.locator('[data-full-song="grid"]')
  const box = await grid.boundingBox()
  if (!box) throw new Error('no grid box')
  await page.mouse.click(box.x + box.width * 0.17, box.y + 8)
  await expect(page.locator('[data-full-song="clip-selection"]')).toBeVisible({ timeout: 5_000 })
  await grid.press('s')

  // OUTER arm 0 `[2, cat(...)]` slices at its midpoint into two weight-1 arms,
  // each keeping the inner cat verbatim. (Before #451 this was a silent no-op.)
  await expect.poll(() => strudelSource(page), { timeout: 8_000 }).toContain(
    "arrange([1, cat(s(\"bd\"), s(\"sd\"))], [1, cat(s(\"bd\"), s(\"sd\"))], [1, s(\"hh\")]).p('drums')",
  )

  await page.screenshot({ path: 'test-results/arrange-nested-split.png' })
  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
