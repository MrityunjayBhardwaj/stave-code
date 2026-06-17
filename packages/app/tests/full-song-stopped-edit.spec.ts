/**
 * Full-song view: the timeline tracks the SOURCE on a code edit that is NOT
 * re-evaluated (#457) — Playwright observation (AnviDev observe gate).
 *
 * The IR snapshot that the Song view analyzes was historically published only on
 * a successful eval (onEvaluateSuccess) or on song-view entry (#394). So editing
 * the code without pressing ⌘/Ctrl+Enter — which is every edit while stopped or
 * with live-mode off — left the timeline frozen at the last eval. The fix
 * subscribes to the active file's content and debounce-republishes the snapshot
 * when the runtime isn't live-evaluating.
 *
 * This drives the bug directly: eval a 2-track program (2 lanes), then RETYPE a
 * 3-track program WITHOUT evaluating, and assert a third lane appears.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function bootShell(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '340')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
    } catch { /* ignore */ }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => ((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco?.editor?.getEditors?.()?.length ?? 0) > 0,
    { timeout: 20_000 },
  )
}

async function focusEditor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const eds = ((window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string } | null; focus: () => void }> } } }).monaco?.editor?.getEditors?.()) ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    t?.focus()
  })
  await page.locator('.monaco-editor').first().click()
}

async function retype(page: Page, code: string): Promise<void> {
  await focusEditor(page)
  await page.keyboard.press(`${MOD}+A`)
  await page.keyboard.press('Backspace')
  await page.keyboard.type(code, { delay: 8 })
}

test('Song view re-analyzes a code edit that is never re-evaluated (#457)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })

  await bootShell(page)

  // Eval a 2-track program → 2 lanes.
  await retype(page, '$: s("bd*4")\n$: s("hh*8")')
  await page.waitForTimeout(300)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1500)

  await page.locator('[data-musical-timeline="view-toggle"]').click()
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
  await expect.poll(() => page.locator('[data-full-song-lane]').count(), { timeout: 8_000 }).toBe(2)

  // Now EDIT to a 3-track program, but DO NOT evaluate. The fix must republish
  // the snapshot from the edited source → the Song view gains a third lane.
  await retype(page, '$: s("bd*4")\n$: s("hh*8")\n$: s("cp*2")')
  // No ⌘/Ctrl+Enter here. Wait past the 300ms snapshot debounce + analysis.
  await expect.poll(() => page.locator('[data-full-song-lane]').count(), { timeout: 8_000 }).toBe(3)

  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
