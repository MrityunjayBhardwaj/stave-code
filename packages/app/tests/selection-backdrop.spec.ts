/**
 * Verifies that Monaco text selection highlight is visible when a
 * backdrop is active. Regression test for the blanket
 * `background-color: transparent !important` rule that was killing
 * `.selected-text` backgrounds.
 */
import { test, expect } from '@playwright/test'

test('selection highlight visible with backdrop active', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 15000 })
  await page.locator('.monaco-editor').waitFor({ timeout: 15000 })

  // Pin a hydra file as backdrop.
  const tabs = page.locator('[data-workspace-tab]')
  const count = await tabs.count()
  for (let i = 0; i < count; i++) {
    const t = await tabs.nth(i).textContent()
    if (t && /\.hydra/.test(t)) {
      await tabs.nth(i).click()
      break
    }
  }
  await page.waitForTimeout(200)
  await page.locator('[data-testid="viz-chrome-bg-toggle"]').first().click()
  await page.locator('[data-workspace-background]').first().waitFor({ timeout: 5000 })

  // Switch to strudel tab and select all text.
  await page
    .locator('[data-workspace-tab]', { hasText: 'pattern.strudel' })
    .click()
  await page.waitForTimeout(300)
  await page.locator('.monaco-editor').first().click()
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${mod}+A`)
  await page.waitForTimeout(300)

  // .selected-text elements should exist with a non-transparent bg.
  const selBg = await page.evaluate(() => {
    const els = document.querySelectorAll('.monaco-editor .selected-text')
    if (!els.length) return { count: 0, bg: 'none' }
    const cs = getComputedStyle(els[0])
    return { count: els.length, bg: cs.backgroundColor }
  })
  expect(selBg.count).toBeGreaterThan(0)
  // Must NOT be transparent — that was the bug.
  expect(selBg.bg).not.toBe('rgba(0, 0, 0, 0)')
  expect(selBg.bg).not.toBe('transparent')
})
