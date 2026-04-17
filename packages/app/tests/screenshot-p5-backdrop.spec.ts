import { test } from '@playwright/test'

/**
 * Ad-hoc visual check — activates the backdrop with the .p5 Piano
 * Roll sketch and grabs a screenshot.
 *
 * Sequence:
 *   1. Open strudel tab, press Ctrl+Enter to evaluate + play so the
 *      scheduler starts publishing haps on the audio bus.
 *   2. Switch to .p5 tab and pin as backdrop via viz-chrome toggle.
 *   3. Wait a beat for the sketch to render a few frames + capture.
 *
 * Without step 1 the default Piano Roll.p5 sketch draws only a
 * background wash (its `if (stave.scheduler) { ... }` branch gates
 * note rendering on a publishing pattern) so the viewer sees a dark
 * panel rather than actual note bars.
 */
test('screenshot: p5 sketch as backdrop', async ({ page }) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto('/')
  await page.locator('[data-workspace-shell="root"]').waitFor({
    timeout: 15000,
  })
  await page.locator('.monaco-editor').waitFor({ timeout: 15000 })

  // Step 1 — switch to p5 and overwrite the sketch with one that
  // draws BIG visible shapes even without a playing pattern, since
  // headless chromium won't start audio without a trusted gesture.
  // This verifies the backdrop render pipeline independently of the
  // scheduler wiring (which has its own E2E coverage).
  const tabs = page.locator('[data-workspace-tab]')
  const count = await tabs.count()
  for (let i = 0; i < count; i++) {
    const t = await tabs.nth(i).textContent()
    if (t && /\.p5/.test(t)) {
      await tabs.nth(i).click()
      break
    }
  }
  await page.waitForTimeout(400)

  const bigSketch = `// Bright sketch so the backdrop is visibly distinguishable
// through the code-panel wash.
function setup() {
  createCanvas(stave.width, stave.height)
  colorMode(HSB, 360, 100, 100, 1)
  noStroke()
}
function draw() {
  // Hue-shifting full-bright bg so the viz is obviously present.
  background((millis() * 0.02) % 360, 70, 60)
  const t = millis() * 0.001
  for (let i = 0; i < 14; i++) {
    const x = (width / 14) * i + sin(t + i) * 40
    const y = height * 0.5 + sin(t * 1.3 + i * 0.5) * (height * 0.35)
    const r = 120 + sin(t + i) * 50
    fill(((i * 25 + t * 30) % 360), 90, 100, 0.9)
    ellipse(x, y, r, r)
  }
}`

  // Replace the Monaco content via Cmd+A / Delete / type. Same
  // pattern as the hydra-stave-bag E2E — robust across runs because
  // it routes through the editor's own input handling instead of
  // depending on a `window.monaco` handle the app doesn't expose.
  await page.locator('.monaco-editor').first().click()
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${mod}+A`)
  await page.keyboard.press('Delete')
  await page.keyboard.type(bigSketch, { delay: 0 })
  // Debounced provider reload kicks in at 300ms; give it a beat.
  await page.waitForTimeout(600)

  // Step 2 — pin as backdrop.
  await page
    .locator('[data-testid="viz-chrome-bg-toggle"]')
    .first()
    .click()

  // Step 3 — let the backdrop render a few frames.
  await page
    .locator('[data-workspace-background]')
    .first()
    .waitFor({ timeout: 5000 })
  await page.waitForTimeout(2000)

  await page.screenshot({
    path: 'test-results/p5-backdrop.png',
    fullPage: false,
  })

  await page
    .locator('[data-workspace-group-content]')
    .first()
    .screenshot({
      path: 'test-results/p5-backdrop-content-area.png',
    })
})
