/**
 * IR Inspector debugger end-to-end (Phase 19-02 pass instrumentation).
 *
 * Verifies the full Strudel-debugger loop on real Chromium: open the
 * app, evaluate a known pattern, surface the IR Inspector, and assert
 * every observable contract — tab row + ARIA, IR tree shape, events
 * count, click-to-source, re-eval persistence, tree collapsibility,
 * and single-tab keyboard no-op.
 */

import { test, expect, type Page } from '@playwright/test'

const STRUDEL_PATTERN = 'note("c3 e3 g3 a3")'
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function setStrudelCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
    }>
    const target =
      editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    if (!target) return false
    target.getModel()?.setValue(c)
    target.focus()
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(150)
}

async function focusStrudelEditor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string } | null
      focus: () => void
    }>
    const target =
      editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    target?.focus()
  })
}

async function evalStrudel(page: Page): Promise<void> {
  await focusStrudelEditor(page)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1800) // engine init + parse + publish
}

async function openInspectorPanel(page: Page): Promise<void> {
  // Activity-bar button registers with aria-label "IR Inspector". The
  // panel region also exposes the same aria-label, but the button mounts
  // first; restrict the locator to <button> to disambiguate.
  const btn = page.locator('button[aria-label="IR Inspector"]').first()
  if (await btn.isVisible().catch(() => false)) {
    await btn.click()
  }
  await page.locator('[data-testid="ir-passes-tablist"]').waitFor({ timeout: 10_000 })
}

async function bootInspectorWithPattern(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('.monaco-editor').waitFor({ timeout: 15_000 })
  await setStrudelCode(page, STRUDEL_PATTERN)
  await evalStrudel(page)
  await openInspectorPanel(page)
}

test.describe('IR Inspector — Pass Instrumentation v1', () => {
  test('Parsed tab is the only tab and is selected by default', async ({ page }) => {
    await bootInspectorWithPattern(page)
    const tabs = page.locator('[data-testid="ir-passes-tablist"] [role="tab"]')
    await expect(tabs).toHaveCount(1)
    await expect(tabs.first()).toHaveText('Parsed')
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
    await expect(tabs.first()).toHaveAttribute('tabindex', '0')
    await expect(tabs.first()).toHaveAttribute('aria-controls', 'ir-tree-panel')
  })

  test('IR tree renders parsed PatternIR for the evaluated code', async ({ page }) => {
    await bootInspectorWithPattern(page)
    const tree = page.locator('[data-testid="ir-tree-section"]')
    // 4-note pattern under note("...") parses as a Seq of Play leaves.
    await expect(tree).toContainText('Seq')
    await expect(tree).toContainText('Play')
  })

  test('Events section reports a non-zero event count after eval', async ({ page }) => {
    await bootInspectorWithPattern(page)
    const heading = page.locator('[data-testid="ir-events-section"] summary').first()
    await expect(heading).toContainText(/Events \([1-9]\d*\)/)
  })

  test('clicking an event row jumps the editor cursor to the source line', async ({
    page,
  }) => {
    await bootInspectorWithPattern(page)
    const eventRow = page
      .locator('[data-testid="ir-events-section"] [role="button"]')
      .first()
    await expect(eventRow).toBeVisible()
    await expect(eventRow).toHaveAttribute('title', /jump to source/i)
    await eventRow.click()
    await page.waitForTimeout(400)
    const cursorLineHasNoteCall = await page.evaluate(() => {
      const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
        getModel: () => {
          getLanguageId?: () => string
          getLineContent: (n: number) => string
        } | null
        getPosition: () => { lineNumber: number } | null
      }>
      const target =
        editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
      if (!target) return false
      const pos = target.getPosition()
      const model = target.getModel()
      if (!pos || !model) return false
      return /note\(/.test(model.getLineContent(pos.lineNumber))
    })
    expect(cursorLineHasNoteCall).toBe(true)
  })

  test('Parsed tab stays selected across a re-eval of the same code', async ({
    page,
  }) => {
    await bootInspectorWithPattern(page)
    await evalStrudel(page) // re-eval
    const tab = page.locator('[data-testid="ir-pass-tab-Parsed"]')
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    // Tablist still has exactly one tab — schema didn't drift.
    const tabs = page.locator('[data-testid="ir-passes-tablist"] [role="tab"]')
    await expect(tabs).toHaveCount(1)
  })

  test('IR tree is collapsible via its <details> element', async ({ page }) => {
    await bootInspectorWithPattern(page)
    const details = page.locator('[data-testid="ir-tree-section"] > details').first()
    await expect(details).toHaveJSProperty('open', true)
    await details.locator('summary').first().click()
    await expect(details).toHaveJSProperty('open', false)
  })

  test('arrow keys on the single-tab strip do not change selection or surface errors', async ({
    page,
  }) => {
    const consoleErrors: string[] = []
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(`console: ${m.text()}`)
    })
    await bootInspectorWithPattern(page)
    const tab = page.locator('[data-testid="ir-pass-tab-Parsed"]')
    await tab.focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowLeft')
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    await expect(tab).toBeFocused()
    // Ignore noisy framework warnings; only react/runtime errors count.
    const real = consoleErrors.filter((l) => !/Warning:/i.test(l))
    expect(real).toEqual([])
  })

  test('Inspector before any eval shows the empty-state hint', async ({ page }) => {
    await page.goto('/')
    await page.locator('.monaco-editor').waitFor({ timeout: 15_000 })
    const btn = page.locator('button[aria-label="IR Inspector"]').first()
    await btn.click()
    const region = page.locator('[role="region"][aria-label="IR Inspector"]')
    await expect(region).toContainText(/Run a Strudel pattern/i)
    // Tab strip should not exist before a snapshot is published.
    await expect(page.locator('[data-testid="ir-passes-tablist"]')).toHaveCount(0)
  })
})
