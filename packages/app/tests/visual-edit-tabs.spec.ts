/**
 * Visual-editing tab scaffold — #380, collapsed to one adaptive tab in #398,
 * rejoined by a peer Mixer console in #540.
 *
 * Observes that the CURSOR-SCOPED grids (Sequencer / Piano Roll) are gone as
 * separate tabs — collapsed into the one adaptive "Pattern" tab — that
 * activating Pattern reveals the adaptive panel (grid area + pinned Mixer), and
 * that its copy carries no IR jargon.
 *
 * "Mixer" is deliberately NOT in the gone list: #540 re-added it as a top-level
 * PEER of Pattern (`tabs.ts:52`), and it is a different surface from the trio's
 * old mixer. Pattern is cursor-scoped (one track — its grid + knobs); the Mixer
 * console is cursor-INDEPENDENT (every track as a channel strip). Asserting it
 * absent would demand we delete a shipped feature.
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
  test('seeds one Pattern tab + a peer Mixer alongside Timeline (the grids are gone)', async ({
    page,
  }) => {
    await clearDrawerStorage(page)
    await bootShell(page)
    const tablist = page.locator('[role="tablist"][aria-label="Bottom panel tabs"]')
    // Timeline, the one adaptive grid tab (#398), and the peer Mixer console (#540).
    for (const name of ['Timeline', 'Pattern', 'Mixer']) {
      await expect(tablist.locator(`role=tab[name="${name}"]`)).toHaveCount(1)
    }
    // the two separate GRID tabs were collapsed into "Pattern"
    for (const gone of ['Sequencer', 'Piano Roll']) {
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
