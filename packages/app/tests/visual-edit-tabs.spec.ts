/**
 * Visual-editing tab scaffold — #380.
 *
 * Observes that the Sequencer / Mixer / Piano Roll tabs are seeded as siblings
 * of "Timeline" in the bottom panel, and that activating one reveals its
 * standby body. Each panel re-registers its id with a live UI in its own phase;
 * here we only assert the scaffold + standby state.
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

test.describe('Visual-editing tab scaffold (#380)', () => {
  test('seeds Sequencer / Mixer / Piano Roll alongside Timeline', async ({ page }) => {
    await clearDrawerStorage(page)
    await bootShell(page)
    const tablist = page.locator('[role="tablist"][aria-label="Bottom panel tabs"]')
    for (const name of ['Timeline', 'Sequencer', 'Mixer', 'Piano Roll']) {
      await expect(tablist.locator(`role=tab[name="${name}"]`)).toHaveCount(1)
    }
  })

  test('activating a panel reveals its standby body', async ({ page }) => {
    await clearDrawerStorage(page)
    await bootShell(page)
    const drawer = page.locator('[data-bottom-panel="root"]')
    await drawer.locator('[data-bottom-panel="toggle"]').click()
    // Switch to the Mixer tab and confirm its standby renders.
    await drawer.locator('role=tab[name="Mixer"]').click()
    const standby = drawer.locator('[data-bottom-panel-tab="mixer-standby"]')
    await expect(standby).toHaveCount(1)
    await expect(standby).toContainText('knobs')
  })

  test('standby copy carries no IR jargon', async ({ page }) => {
    await clearDrawerStorage(page)
    await bootShell(page)
    const drawer = page.locator('[data-bottom-panel="root"]')
    await drawer.locator('[data-bottom-panel="toggle"]').click()
    const jargon = /\b(IR|AST|chunk|mini-?notation|writeback)\b/i
    for (const name of ['Sequencer', 'Mixer', 'Piano Roll']) {
      await drawer.locator(`role=tab[name="${name}"]`).click()
      const body = drawer.locator('[data-bottom-panel="body"]')
      const text = (await body.textContent()) ?? ''
      expect(jargon.test(text), `${name} body: "${text}"`).toBe(false)
    }
  })
})
