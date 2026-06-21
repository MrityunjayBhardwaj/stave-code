/**
 * Full-song LIVE overlay (#500 / U3, timeline unification #497) — Playwright
 * observation spec. Run SOLO (--workers=1): the full-song specs share the GPU
 * and flake in batch (P122/P130), pass solo.
 *
 * AnviDev observe gate: the unit tests cover the pure lit-set logic
 * (drawLiveOverlay.test); this drives the REAL app to confirm the end-to-end
 * path — a real evaluated song, the live hap stream, a following playhead —
 * actually lights the canvas scene marks:
 *   1. The overlay canvas mounts over the base Song canvas.
 *   2. While PLAYING, the overlay paints lit marks (alpha-channel readback > 0)
 *      — the hap stream → firing-sig set → drawLiveOverlay path works live.
 *   3. STOPPING clears the overlay (no playhead → nothing lit).
 *   4. No console / page errors throughout.
 *
 * The lit MARKS are positioned over their base marks by shared geometry (unit-
 * tested for pixel alignment); the per-note temporal/degrade gating is unit-
 * tested deterministically. Here we confirm the wiring lights up for real.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('stave:bottomPanel.height', '360')
      window.localStorage.setItem('stave:bottomPanel.open', 'true')
      window.localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 20_000 },
  )
}

/** Count overlay pixels with a non-transparent alpha — the lit marks. Direct
 *  element readback is sound here: the overlay is a MAIN-THREAD 2D canvas we
 *  draw ourselves (the PV90 worker/OffscreenCanvas caveat doesn't apply). */
async function litPixelCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.querySelector('[data-full-song-overlay]') as HTMLCanvasElement | null
    if (!c) return -1
    const ctx = c.getContext('2d')
    if (!ctx || c.width === 0) return -1
    const data = ctx.getImageData(0, 0, c.width, c.height).data
    let lit = 0
    for (let i = 3; i < data.length; i += 4) if (data[i] > 10) lit++
    return lit
  })
}

test('live overlay lights scene marks while playing, clears when stopped', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await boot(page)

  // Evaluate + play the starter song (multi-track $: synths + drum stack).
  await page.evaluate(() => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string } | null; focus: () => void }> } } }).monaco
    const eds = monaco?.editor?.getEditors?.() ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    t?.focus()
  })
  await page.keyboard.press(`${MOD}+Enter`)

  // Switch to the full-song view; the base + overlay canvases mount.
  const toggle = page.locator('[data-musical-timeline="view-toggle"]')
  await toggle.waitFor({ timeout: 10_000 })
  await toggle.click()
  await page.locator('[data-full-song-canvas]').waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-overlay]').waitFor({ timeout: 10_000 })

  // (2) While playing, the overlay paints lit marks. Poll briefly — lighting is
  //     per-frame and depends on a hap landing under the playhead.
  await expect
    .poll(() => litPixelCount(page), {
      timeout: 8_000,
      message: 'overlay never lit any marks while playing',
    })
    .toBeGreaterThan(0)

  // Visual evidence (observe, don't infer): compositor capture (PV90) of the lit
  // marks under the playhead, overlay included.
  await page.screenshot({ path: 'test-results/full-song-live-overlay.png' })

  // (3) Stopping clears the overlay — no playhead → nothing lit. Focus the
  //     editor first so the transport stop shortcut lands (the timeline grid
  //     had focus from the toggle/seek gestures).
  await page.evaluate(() => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string } | null; focus: () => void }> } } }).monaco
    const eds = monaco?.editor?.getEditors?.() ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    t?.focus()
  })
  await page.keyboard.press(`${MOD}+Period`)
  await expect
    .poll(() => litPixelCount(page), {
      timeout: 6_000,
      message: 'overlay did not clear after stop',
    })
    .toBe(0)

  // (4) No errors throughout.
  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
