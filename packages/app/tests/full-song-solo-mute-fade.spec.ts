/**
 * Full-song view: a solo/mute in the Mixer FADES the matching Timeline lane
 * (#731). The two views share the track's DISPLAY NAME as the join key, so the
 * Mixer's "inactive" state (mute button / solo-dim) reads identically as a faded
 * lane in the Timeline (PV155). Both tab bodies stay mounted, so a click in the
 * Mixer lights the fade live; switching to the Timeline tab just reveals it.
 *
 * Asserts the deterministic gutter marker (`data-full-song-lane-silenced`) for
 * the exact tracks the rule silences, and captures before/after screenshots so
 * the canvas-band fade can be eyeballed too.
 */
import { test, expect, type Page } from '@playwright/test'

const SHOTS = process.env.FADE_SHOTS_DIR ?? '/tmp'

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '360')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () =>
      ((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco?.editor?.getEditors?.()?.length ?? 0) > 0,
    { timeout: 20_000 },
  )
}

async function typeAndEval(page: Page, code: string): Promise<void> {
  const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${MOD}+A`)
  await page.keyboard.press('Backspace')
  await page.keyboard.type(code, { delay: 6 })
  await page.waitForTimeout(300)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1600)
}

const root = (page: Page) => page.locator('[data-bottom-panel="root"]')
const switchTab = (page: Page, name: string) => root(page).locator(`role=tab[name="${name}"]`).click()

test('a solo/mute in the Mixer fades the matching Timeline lane (#731)', async ({ page }) => {
  await boot(page)
  // Three NAMED tracks → strip id === display name === lane key (d1/d2/d3), the
  // cleanest join to assert on.
  await typeAndEval(page, 'd1: s("bd*4")\nd2: s("hh*8")\nd3: s("cp*2")')

  const timeline = root(page).locator('[data-bottom-panel-tab="musical-timeline"]')
  // Baseline: no lane silenced.
  await expect(timeline.locator('[data-full-song-lane-silenced]')).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/fade-0-before.png` })

  // ── MUTE d1 in the Mixer ──
  await switchTab(page, 'Mixer')
  const mixer = root(page).locator('[data-bottom-panel-tab="mixer-console"]')
  await mixer.locator('[data-mixer-strip-id="d1"] [data-mixer-strip-mute]').click()
  await page.waitForTimeout(400)
  await switchTab(page, 'Timeline')
  await page.waitForTimeout(300)
  // Only d1's lane is faded.
  await expect(timeline.locator('[data-full-song-lane-silenced="d1"]')).toHaveCount(1)
  await expect(timeline.locator('[data-full-song-lane-silenced="d2"]')).toHaveCount(0)
  await expect(timeline.locator('[data-full-song-lane-silenced="d3"]')).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/fade-1-mute-d1.png` })

  // Un-mute → the fade clears.
  await switchTab(page, 'Mixer')
  await mixer.locator('[data-mixer-strip-id="d1"] [data-mixer-strip-mute]').click()
  await page.waitForTimeout(400)
  await switchTab(page, 'Timeline')
  await expect(timeline.locator('[data-full-song-lane-silenced]')).toHaveCount(0)

  // ── SOLO d2 in the Mixer → every OTHER lane fades ──
  await switchTab(page, 'Mixer')
  await mixer.locator('[data-mixer-strip-id="d2"] [data-mixer-strip-solo]').click()
  await page.waitForTimeout(400)
  await switchTab(page, 'Timeline')
  await page.waitForTimeout(300)
  await expect(timeline.locator('[data-full-song-lane-silenced="d1"]')).toHaveCount(1)
  await expect(timeline.locator('[data-full-song-lane-silenced="d3"]')).toHaveCount(1)
  await expect(timeline.locator('[data-full-song-lane-silenced="d2"]')).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/fade-2-solo-d2.png` })
})
