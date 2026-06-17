/**
 * #240 — viz pop-out (Cmd+K W) end-to-end.
 *
 * The command `workspace.openPreviewInWindow` was registered but unwired —
 * `shell.openPopoutPreview` was never implemented by the app, so Cmd+K W
 * silently no-op'd. This verifies the wiring: with a viz tab active, the
 * chord opens a real pop-out browser window whose title is `Viz: <name>`.
 *
 * We assert the WINDOW opens (proves command → shell action → app host →
 * usePopoutPreview → window.open), not that the sketch renders — headless
 * WebGL/p5 mount is out of scope and the title is set before the mount.
 */

import { test, expect } from '@playwright/test'

async function gotoApp(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 15000 })
  await page.locator('.monaco-editor').waitFor({ timeout: 15000 })
}

// #175 — the default workspace opens a single Strudel tab, so open a hydra
// viz tab via the file tree (its bundled fileId contains "hydra").
async function openHydraTab(page: import('@playwright/test').Page) {
  const item = page.locator('[data-file-tree-item*="hydra"]').first()
  if ((await item.count()) === 0) throw new Error('no hydra preset in default project')
  await item.dblclick()
  // The viz tab's chrome (Open Preview button) confirms the editor tab is active.
  await page
    .locator('[data-testid="viz-chrome-open-preview"]')
    .first()
    .waitFor({ timeout: 5000 })
}

test('#240 — Cmd+K W opens a viz pop-out window for a viz tab', async ({ page }) => {
  await gotoApp(page)
  await openHydraTab(page)

  // Click the active viz tab so focus is on a neutral element (not Monaco,
  // which has its own Cmd+K chords) before firing the global chord.
  await page
    .locator('[data-workspace-tab]', { hasText: /\.hydra/ })
    .first()
    .click()

  const popupPromise = page.waitForEvent('popup', { timeout: 10000 })
  // Cmd+K then W (the workspace command chord).
  await page.keyboard.press('Meta+k')
  await page.keyboard.press('w')

  // A popup event firing proves the full chain (command → shell.openPopoutPreview
  // → app host → usePopoutPreview → window.open) — that's the #240 fix.
  await popupPromise

  // React StrictMode (dev) double-invokes the open effect: the first popup is
  // opened then immediately closed and a second opened. So assert against the
  // LIVE popup — poll the context for a surviving page whose imperatively-set
  // document.title is `Viz: <name>`.
  await expect
    .poll(
      async () => {
        for (const p of page.context().pages()) {
          if (p === page || p.isClosed()) continue
          const t = await p.evaluate(() => document.title).catch(() => '')
          if (t.includes('Viz')) return true
        }
        return false
      },
      { timeout: 8000 },
    )
    .toBe(true)
})
