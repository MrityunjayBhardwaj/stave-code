/**
 * Full-song view honors the shared "timeline row height" editor setting (#459) —
 * Playwright observation (AnviDev observe gate).
 *
 * The Live view already reads getMusicalTimelineSubRowHeight(); the Song view used
 * to hardcode a 22px lane height. The fix wires the same setting into
 * FullSongTimeline → computeLaneLayout (collapsed lane + per-voice sub-row). This
 * seeds the setting (localStorage) to a distinctive value and asserts the Song
 * lane box measures that height — discriminates the fix (without it, height is a
 * fixed 22 regardless of the setting).
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const ROW_KEY = 'stave:musicalTimeline.subRowHeight'
const ROW_VALUE = 40 // within the clamp (12–48), clearly != the old 22 default

async function bootShell(page: Page): Promise<void> {
  await page.addInitScript(
    ([rowKey, rowVal]: [string, number]) => {
      try {
        localStorage.setItem('stave:bottomPanel.height', '360')
        localStorage.setItem('stave:bottomPanel.open', 'true')
        localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
        localStorage.setItem(rowKey, String(rowVal))
      } catch { /* ignore */ }
    },
    [ROW_KEY, ROW_VALUE] as [string, number],
  )
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => ((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco?.editor?.getEditors?.()?.length ?? 0) > 0,
    { timeout: 20_000 },
  )
}

async function typeAndEval(page: Page, code: string): Promise<void> {
  await page.evaluate(() => {
    const eds = ((window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string } | null; focus: () => void }> } } }).monaco?.editor?.getEditors?.()) ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    t?.focus()
  })
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${MOD}+A`)
  await page.keyboard.press('Backspace')
  await page.keyboard.type(code, { delay: 8 })
  await page.waitForTimeout(300)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1500)
}

test('Song view lane height follows the timeline row-height setting (#459)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })

  await bootShell(page)
  await typeAndEval(page, '$: s("bd*4")\n$: s("hh*8")')

  await page.locator('[data-musical-timeline="view-toggle"]').click()
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })

  const box = await page.locator('[data-full-song-lane]').first().boundingBox()
  if (!box) throw new Error('no lane box')
  // The lane row's height is set directly from the layout (box.height = rowH).
  // Allow a small slack for sub-pixel rounding / borders, but it must clearly
  // track 40 and NOT the old fixed 22.
  expect(box.height, `lane height should follow the setting (${ROW_VALUE})`).toBeGreaterThanOrEqual(36)
  expect(box.height).toBeLessThanOrEqual(44)

  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
