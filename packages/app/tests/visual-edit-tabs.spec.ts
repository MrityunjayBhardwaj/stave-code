/**
 * Visual-editing tab scaffold — #380, collapsed to one adaptive tab in #398.
 *
 * Observes that a SINGLE "Pattern" tab is seeded alongside "Timeline" (the old
 * Sequencer / Mixer / Piano Roll trio is gone), that activating it reveals the
 * adaptive panel (grid area + pinned Mixer), and that its copy carries no IR
 * jargon.
 */
import { test, expect, type Page } from '@playwright/test'

async function clearDrawerStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.removeItem('stave:bottomPanel.height')
      window.localStorage.removeItem('stave:bottomPanel.open')
      window.localStorage.removeItem('stave:bottomPanel.activeTabId')
    } catch {
      /* ignore */
    }
  })
}

async function bootShell(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 15_000 })
}

test.describe('Visual-editing tab scaffold (#398)', () => {
  test('seeds a single Pattern tab alongside Timeline (old trio gone)', async ({ page }) => {
    await clearDrawerStorage(page)
    await bootShell(page)
    const tablist = page.locator('[role="tablist"][aria-label="Bottom panel tabs"]')
    for (const name of ['Timeline', 'Pattern']) {
      await expect(tablist.locator(`role=tab[name="${name}"]`)).toHaveCount(1)
    }
    // the three separate tabs were collapsed into "Pattern"
    for (const gone of ['Sequencer', 'Mixer', 'Piano Roll']) {
      await expect(tablist.locator(`role=tab[name="${gone}"]`)).toHaveCount(0)
    }
  })

  test('activating Pattern reveals the adaptive panel with a pinned Mixer', async ({ page }) => {
    await clearDrawerStorage(page)
    await bootShell(page)
    const drawer = page.locator('[data-bottom-panel="root"]')
    await drawer.locator('[data-bottom-panel="toggle"]').click()
    await drawer.locator('role=tab[name="Pattern"]').click()
    // the composed panel renders: an adaptive grid area + the Mixer pinned right
    await expect(drawer.locator('[data-bottom-panel-tab="pattern"]')).toHaveCount(1)
    await expect(drawer.locator('[data-pattern-grid]')).toHaveCount(1)
    await expect(drawer.locator('[data-pattern-mixer]')).toHaveCount(1)
  })

  test('panel copy carries no IR jargon', async ({ page }) => {
    await clearDrawerStorage(page)
    await bootShell(page)
    const drawer = page.locator('[data-bottom-panel="root"]')
    await drawer.locator('[data-bottom-panel="toggle"]').click()
    await drawer.locator('role=tab[name="Pattern"]').click()
    const jargon = /\b(IR|AST|chunk|mini-?notation|writeback)\b/i
    const body = drawer.locator('[data-bottom-panel="body"]')
    const text = (await body.textContent()) ?? ''
    expect(jargon.test(text), `Pattern body: "${text}"`).toBe(false)
  })
})
