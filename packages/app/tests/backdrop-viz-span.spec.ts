import { test, expect, type Page } from '@playwright/test'

/**
 * #770 — backdrop "viz span": File (per-pane, default) vs Workspace (one
 * backdrop spanning every split pane).
 *
 * File mode: each pane paints its own `[data-workspace-background="<groupId>"]`.
 * Workspace mode: exactly ONE `[data-workspace-background="workspace"]` layer
 * rendered behind the whole groups container, and every pane's code panel goes
 * transparent (`data-stave-backdrop="on"`) so the single viz shows behind all of
 * them. Toggled live via the backdrop popover's new "viz span" select.
 */

// A STATIC, position-dependent p5 sketch (renders without playback via the
// backdrop's demo mode) so the screenshots show whether the viz is ONE
// continuous image across the seam (workspace) or restarts per pane (file):
// a left→right gradient + a bright vertical line at the exact horizontal centre
// + the canvas width printed. In workspace mode `width` = the whole editor area,
// so the centre line lands over the split seam; in file mode each pane draws its
// own centre line and its own (smaller) width.
const SKETCH = `
function setup() { createCanvas(stave.width, stave.height); colorMode(RGB) }
function draw() {
  for (let x = 0; x < width; x += 6) {
    stroke(map(x, 0, width, 20, 240), 60, map(x, 0, width, 240, 20)); line(x, 0, x, height)
  }
  stroke(255, 255, 0); strokeWeight(6); line(width / 2, 0, width / 2, height)
  noStroke(); fill(255); textSize(42); text('W=' + Math.round(width), 24, 64)
}`

async function gotoApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_E2E__ = true
    // Force MAIN-THREAD backdrop rendering so the compositor screenshot captures
    // the p5 output (the default OffscreenCanvas-worker canvas isn't reliably
    // composited into headless screenshots — PV90). Observation-only.
    try { localStorage.setItem('stave.viz.worker', '0') } catch { /* ignore */ }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 15000 })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(800)
  // Override the bundled `spectrum` viz with the distinctive static sketch.
  const overrode = await page.evaluate(
    (code) => (window as any).__staveOverrideVizFile?.('spectrum', code) ?? null, // eslint-disable-line @typescript-eslint/no-explicit-any
    SKETCH,
  )
  expect(overrode, 'bundled spectrum viz file should exist to override').toBeTruthy()
  await page.waitForTimeout(200)
}

async function pinBackdrop(page: Page): Promise<void> {
  await page.locator('[data-testid="strudel-chrome-bg-toggle"]').click()
  const popover = page.locator('[data-testid="backdrop-popover"]')
  await expect(popover).toBeVisible({ timeout: 4000 })
  const picker = popover.locator('[data-testid="backdrop-popover-picker"]')
  // Pin the (overridden) spectrum sketch so the backdrop shows visible content.
  await picker.selectOption({ label: 'spectrum' })
  await expect(page.locator('[data-workspace-background]').first()).toBeVisible({ timeout: 6000 })
  await page.locator('[data-workspace-background] canvas').first().waitFor({ timeout: 8000 })
  await page.waitForTimeout(700)
}

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

test('#770 — Workspace span renders one backdrop behind all panes; File keeps per-pane', async ({ page }) => {
  await gotoApp(page)
  await pinBackdrop(page)

  // Play so the backdrop worker starts ticking → the static sketch actually
  // paints (the worker viz loop only runs while the program plays).
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus()) // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2000)

  // File mode (default): a per-pane backdrop, and NO workspace-spanning layer.
  await expect(page.locator('[data-workspace-background="workspace"]')).toHaveCount(0)
  const perPaneCount = await page.locator('[data-workspace-background]').count()
  expect(perPaneCount, 'file mode paints per-pane backdrop(s)').toBeGreaterThanOrEqual(1)

  // Split right → a second pane. Still file mode → still no spanning layer.
  await page.locator('[data-testid^="group-split-"]').first().click()
  await page.waitForTimeout(500)
  expect(await page.locator('[data-workspace-group]').count()).toBe(2)
  await expect(page.locator('[data-workspace-background="workspace"]')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/vizspan-file-mode.png' })

  // GEOMETRY (the actual "span" claim): in file mode the per-pane backdrop is
  // bounded to its own pane — roughly half the groups container.
  const container = page.locator('[data-workspace-groups="container"]')
  const cbox = (await container.boundingBox())!
  const fileBg = (await page.locator('[data-workspace-background]').first().boundingBox())!
  expect(fileBg.width, 'file-mode backdrop is bounded to one pane').toBeLessThan(cbox.width * 0.75)

  // Switch to Workspace span via the popover (re-open on the left/original pane,
  // which owns the pattern + its bg toggle).
  await page.locator('[data-workspace-group]').first().click({ position: { x: 40, y: 200 } })
  await page.locator('[data-testid="strudel-chrome-bg-toggle"]').click()
  await expect(page.locator('[data-testid="backdrop-popover"]')).toBeVisible({ timeout: 4000 })
  await page.locator('[data-testid="backdrop-chrome-vizspan"]').selectOption('workspace')
  await page.keyboard.press('Escape') // close the popover

  // Workspace mode: exactly ONE spanning backdrop, and no per-pane ones.
  await expect(page.locator('[data-workspace-background="workspace"]')).toHaveCount(1, { timeout: 4000 })
  const spanning = page.locator('[data-workspace-background]')
  await expect(spanning).toHaveCount(1)
  await expect(spanning.first()).toBeVisible()
  // Every code panel is transparent so the single backdrop shows through.
  const codePanels = page.locator('[data-stave-code-panel]')
  const n = await codePanels.count()
  for (let i = 0; i < n; i++) {
    await expect(codePanels.nth(i)).toHaveAttribute('data-stave-backdrop', 'on')
  }
  await page.screenshot({ path: 'test-results/vizspan-workspace-mode.png' })

  // GEOMETRY: the single spanning backdrop covers the FULL groups container
  // (both panes), starting at its origin — this IS "one viz across all windows".
  const wsBox = (await page.locator('[data-workspace-background="workspace"]').boundingBox())!
  expect(wsBox.width, 'workspace backdrop spans the whole container').toBeGreaterThan(cbox.width * 0.95)
  expect(Math.abs(wsBox.x - cbox.x), 'spanning backdrop starts at container origin').toBeLessThan(4)

  // Back to File → the spanning layer is gone, per-pane returns.
  await page.locator('[data-workspace-group]').first().click({ position: { x: 40, y: 200 } })
  await page.locator('[data-testid="strudel-chrome-bg-toggle"]').click()
  await expect(page.locator('[data-testid="backdrop-popover"]')).toBeVisible({ timeout: 4000 })
  await page.locator('[data-testid="backdrop-chrome-vizspan"]').selectOption('file')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-workspace-background="workspace"]')).toHaveCount(0, { timeout: 4000 })
})
