/**
 * Full-song view: silencing a track DIMS its canvas band, not just the gutter
 * (#731). The DOM-attribute spec (`full-song-solo-mute-fade`) proves the join;
 * this reads the canvas backing store directly (getImageData) to prove the
 * `drawTimeline` scrim actually darkens the drawn marks — the primary visual —
 * rather than inferring it from a style. Solo d2 → d1's band luminance must drop
 * clearly (the scrim is ~0.55 background over the lane).
 */
import { test, expect, type Page } from '@playwright/test'

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '360')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
    } catch { /* ignore */ }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => ((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco?.editor?.getEditors?.()?.length ?? 0) > 0,
    { timeout: 20_000 },
  )
}

const root = (page: Page) => page.locator('[data-bottom-panel="root"]')
const switchTab = (page: Page, name: string) => root(page).locator(`role=tab[name="${name}"]`).click()

/** Mean luminance of the canvas band covering lane row `laneKey`'s vertical span,
 *  over the first ~1 cycle (where marks live). Reads the canvas backing store —
 *  a DIRECT observation of what was drawn, not the DOM. */
async function laneBandLuma(page: Page, laneKey: string): Promise<number> {
  return page.evaluate((key) => {
    const row = document.querySelector(`[data-full-song-lane="${key}"]`) as HTMLElement | null
    const canvas = document.querySelector('[data-full-song-canvas]') as HTMLCanvasElement | null
    if (!row || !canvas) return -1
    const rr = row.getBoundingClientRect()
    const cr = canvas.getBoundingClientRect()
    const dpr = canvas.width / cr.width
    const ctx = canvas.getContext('2d')
    if (!ctx) return -1
    // Row's vertical span in backing-store px; sample the left third (marks region).
    const y0 = Math.max(0, Math.round((rr.top - cr.top) * dpr))
    const h = Math.max(1, Math.round(rr.height * dpr))
    const x0 = 0
    const w = Math.min(canvas.width, Math.round(canvas.width / 3))
    const data = ctx.getImageData(x0, y0, w, h).data
    let sum = 0, n = 0
    for (let i = 0; i < data.length; i += 4) {
      // luminance; ignore fully-transparent (shouldn't happen on opaque canvas)
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      n++
    }
    return n ? sum / n : -1
  }, laneKey)
}

test('canvas band dims when a lane is silenced', async ({ page }) => {
  const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
  await boot(page)
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${MOD}+A`); await page.keyboard.press('Backspace')
  await page.keyboard.type('d1: s("bd*8")\nd2: s("hh*8")', { delay: 6 })
  await page.waitForTimeout(300)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1600)

  const before = await laneBandLuma(page, 'd1')

  // Solo d2 → d1 becomes silenced (faded).
  await switchTab(page, 'Mixer')
  await root(page).locator('[data-bottom-panel-tab="mixer-console"] [data-mixer-strip-id="d2"] [data-mixer-strip-solo]').click()
  await page.waitForTimeout(400)
  await switchTab(page, 'Timeline')
  await page.waitForTimeout(500)
  // laneKey for d1 stays 'd1' (solo doesn't touch source), so the same selector holds.
  const after = await laneBandLuma(page, 'd1')

  console.log(`d1 band luma  before=${before.toFixed(2)}  after(silenced)=${after.toFixed(2)}  ratio=${(after / before).toFixed(3)}`)
  expect(before).toBeGreaterThan(0)
  expect(after).toBeGreaterThan(0)
  // The scrim must visibly darken the band — expect a clear drop (well below 0.85×).
  expect(after).toBeLessThan(before * 0.85)
})
