/**
 * Full-song view: selecting a clip with the MOUSE must take keyboard focus so
 * the clip-op shortcuts (S split / ⌘D duplicate / Delete) work (#488).
 *
 * The bug: `handleGridPointerDown`'s clip-select branch calls `preventDefault()`
 * (to suppress text-selection + the native drag image), which ALSO suppresses
 * the browser's default focus-on-pointerdown. The grid (tabIndex=0) never became
 * `document.activeElement`, so a human's keystroke after a click leaked to Monaco
 * / the last-focused control and nothing happened.
 *
 * Why the other arrange specs miss it: they drive the keystroke with Playwright's
 * `locator.press()` / `grid.press()`, which FOCUSES the target element first —
 * masking the real-world "click then type" flow. This spec deliberately uses
 * `page.keyboard.press()` (presses whatever currently holds focus, no auto-focus)
 * so it observes the real path.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
// One standalone arrange; arm 0 = [2, bd] of a 4-cycle song → first ~25% width.
const SONG = 'arrange([2, s("bd")], [2, s("hh")])'

async function bootShell(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '360')
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
    return t?.getModel?.()?.getValue?.() ?? ''
  })
}

test('clicking a clip takes keyboard focus so S splits it (real keyboard, no auto-focus) #488', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  await typeSongAndEval(page, SONG)
  // Song canvas is the only timeline view now (#497/U5) -- wait for it.
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-canvas]').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(400)

  // Focus Monaco first — this is the real-world starting state (the user was
  // editing), the state that made the keystroke leak there.
  await page.locator('.monaco-editor').first().click()

  const grid = page.locator('[data-full-song="grid"]')
  const box = await grid.boundingBox()
  if (!box) throw new Error('no grid box')

  // Select arm 0 (bd, cycles [0,2) of 4 → ~12% width) with the MOUSE.
  await page.mouse.click(box.x + box.width * 0.12, box.y + 10)
  await expect(page.locator('[data-full-song="clip-selection"]')).toBeVisible({ timeout: 5_000 })

  // The fix: the grid is now the active element (not Monaco / a button).
  const activeInGrid = await page.evaluate(() =>
    !!document.activeElement?.closest('[data-full-song="grid"]'),
  )
  expect(activeInGrid).toBe(true)

  // A REAL keystroke (no auto-focus) reaches handleGridKeyDown → arm 0 [2,bd]
  // splits into two [1,bd]. Monaco's value is untouched by the 's' (it would
  // have inserted a literal 's' if focus had leaked there).
  const before = await strudelSource(page)
  await page.keyboard.press('s')
  await expect
    .poll(async () => strudelSource(page), { timeout: 5_000 })
    .toBe('arrange([1, s("bd")], [1, s("bd")], [2, s("hh")])')

  expect(before).toBe(SONG) // sanity: it really changed FROM the original
  expect(errors, errors.join('\n')).toEqual([])
})
