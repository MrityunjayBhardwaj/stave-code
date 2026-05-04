/**
 * IR Inspector — IR-mode toggle UX probes (Phase 19-06).
 *
 * Verifies the toggle button itself: visibility, ARIA state, click-flip,
 * localStorage persistence across reload, addInitScript timing
 * (RESEARCH NEW pre-mortem #12), and state independence from the
 * pass-tab selection (CONTEXT pre-mortem #6).
 *
 * Companion to ir-inspector-tier4.spec.ts (which exercises the toggle
 * via tree-content assertions). This file isolates the toggle UX so a
 * regression in the button alone is detected at the lowest level.
 */

import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const LOCALSTORAGE_KEY = 'stave:inspector.irMode'

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
  await page.waitForTimeout(1800)
}

async function openInspectorPanel(page: Page): Promise<void> {
  const btn = page.locator('button[aria-label="IR Inspector"]').first()
  if (await btn.isVisible().catch(() => false)) {
    await btn.click()
  }
  await page.locator('[data-testid="ir-passes-tablist"]').waitFor({ timeout: 10_000 })
}

async function bootWithPattern(page: Page, code: string): Promise<void> {
  await page.goto('/')
  await page.locator('.monaco-editor').waitFor({ timeout: 15_000 })
  await setStrudelCode(page, code)
  await evalStrudel(page)
  await openInspectorPanel(page)
}

test.describe('IR Inspector — IR-mode toggle UX', () => {
  test('toggle button visible by default with aria-pressed=false', async ({ page }) => {
    await bootWithPattern(page, '$: s("bd hh")')
    const toggle = page.locator('[data-testid="ir-mode-toggle"]')
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  test('clicking the toggle flips aria-pressed', async ({ page }) => {
    await bootWithPattern(page, '$: s("bd hh")')
    const toggle = page.locator('[data-testid="ir-mode-toggle"]')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  test('reload preserves pressed state via localStorage', async ({ page }) => {
    await bootWithPattern(page, '$: s("bd hh")')
    const toggle = page.locator('[data-testid="ir-mode-toggle"]')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await page.reload()
    // Reload resets the Inspector panel; need a fresh eval for the
    // snapshot to publish before passes-tablist + toggle button render.
    await page.locator('.monaco-editor').waitFor({ timeout: 15_000 })
    await setStrudelCode(page, '$: s("bd hh")')
    await evalStrudel(page)
    await openInspectorPanel(page)
    const toggleAfter = page.locator('[data-testid="ir-mode-toggle"]')
    await expect(toggleAfter).toHaveAttribute('aria-pressed', 'true')
  })

  test('initial state honors pre-set localStorage (addInitScript timing probe)', async ({ page }) => {
    // RESEARCH NEW pre-mortem #12 — verify that addInitScript populates
    // localStorage BEFORE React's useState lazy initializer runs.
    await page.addInitScript((key) => {
      window.localStorage.setItem(key, 'true')
    }, LOCALSTORAGE_KEY)
    await bootWithPattern(page, '$: s("bd hh")')
    const toggle = page.locator('[data-testid="ir-mode-toggle"]')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  test('toggle does not change pass-tab selection (state independence)', async ({ page }) => {
    // CONTEXT pre-mortem #6 — IR-mode and pass-tab are independent state slots.
    await bootWithPattern(page, '$: s("bd hh")')
    const tabs = page.locator('[data-testid="ir-passes-tablist"] button[role="tab"]')
    const initiallySelected = await tabs.first().getAttribute('aria-selected')

    const toggle = page.locator('[data-testid="ir-mode-toggle"]')
    await toggle.click()
    await toggle.click()

    const stillSelected = await tabs.first().getAttribute('aria-selected')
    expect(stillSelected).toBe(initiallySelected)
  })
})
