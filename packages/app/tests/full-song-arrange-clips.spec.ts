/**
 * Full-song view: read-only arrangement CLIPS (#386 / Phase 5a) — Playwright
 * observation (AnviDev observe gate).
 *
 * The unit tests cover the IR (editor arrange.test.ts: parse + collect + parity
 * with real Strudel haps), the clip derivation (timelineScene.test.ts), and the
 * clip rendering (drawTimeline.test.ts). This drives the REAL app end-to-end to
 * prove the whole pipeline works in the browser:
 *   1. An `arrange(...)` song (previously OPAQUE → blank timeline) now analyses
 *      into ONE lane (the synthetic d1 track) and the canvas draws content.
 *      This is the arrange=blank fix.
 *   2. The two arms render as two clips: the brightest vertical line on the
 *      canvas — the clip border — sits at the arm boundary (cycle 2 of 4),
 *      confirming arm→clip attribution flows through the real collect path
 *      (the leaf-bridge lesson, PV120/#424: observe, don't infer).
 *   3. No console / page errors from the new `Arrange` IR tag flowing through
 *      the app's exhaustive IR consumers.
 *
 * NOTE: we TYPE the song (not Monaco setValue) so the editor onChange → file
 * store → IR-snapshot path fires — the snapshot parses the FILE STORE content
 * (StrudelEditorClient.captureAndPublishSnapshot), which a programmatic
 * setValue does not update.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

// Two arms, no marks inside (bare `s("bd")`/`s("hh")`) so the clip fill/border
// is unobstructed by note marks for the readback. Period = 2 + 2 = 4 cycles.
const ARRANGE_SONG = 'arrange([2, s("bd")], [2, s("hh")])'

async function bootShell(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '340')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => ((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco?.editor?.getEditors?.()?.length ?? 0) > 0,
    { timeout: 20_000 },
  )
}

async function typeSongAndEval(page: Page, code: string): Promise<void> {
  await page.evaluate(() => {
    const eds = ((window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string } | null; focus: () => void }> } } }).monaco?.editor?.getEditors?.()) ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    t?.focus()
  })
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${MOD}+A`)
  await page.keyboard.press('Backspace')
  await page.keyboard.type(code, { delay: 8 })
  await page.waitForTimeout(400)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1800)
}

test('arrange song renders one lane split into read-only clips (no longer blank)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  await typeSongAndEval(page, ARRANGE_SONG)

  await page.locator('[data-musical-timeline="view-toggle"]').click()
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })

  // (1) One lane (the d1 track) — the arrange produced events at all (it was
  //     blank before — opaque Builder → collect returned []).
  expect(await page.locator('[data-full-song-lane]').count()).toBe(1)
  await page.locator('[data-full-song-canvas]').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(400)

  // (2) The arm boundary renders as a clip border — the brightest vertical line
  //     in the lane band sits at cycle 2 of 4 (x ≈ 0.5·W). This proves the
  //     two arms became two clips through the real collect → scene → draw path.
  const borderFrac = await page.locator('[data-full-song-canvas]').evaluate((el) => {
    const c = el as HTMLCanvasElement
    const ctx = c.getContext('2d')!
    const W = c.width
    const yBand = Math.max(1, Math.floor(c.height * 0.12)) // the top (only) lane band
    const img = ctx.getImageData(0, 0, W, yBand).data
    let best = -1
    let bestX = -1
    for (let x = 2; x < W - 2; x++) {
      let sum = 0
      for (let y = 0; y < yBand; y++) {
        const i = (y * W + x) * 4
        sum += img[i] + img[i + 1] + img[i + 2]
      }
      if (sum > best) {
        best = sum
        bestX = x
      }
    }
    return bestX / W
  })
  // Cycle 2 of 4 = 0.5; allow a small tolerance for the 1px line + DPR rounding.
  expect(borderFrac).toBeGreaterThan(0.47)
  expect(borderFrac).toBeLessThan(0.53)

  await page.screenshot({ path: 'test-results/arrange-clips.png' })

  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
