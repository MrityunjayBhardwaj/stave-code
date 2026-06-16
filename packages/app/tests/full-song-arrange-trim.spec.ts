/**
 * Full-song view: TRIM a clip by dragging its edge (#437 / Phase 5b) —
 * Playwright observation (AnviDev observe gate).
 *
 * The unit tests cover the substrate (editor arrange.test.ts: parse + each
 * surgical op + parity) and the gesture geometry (FullSongTimeline.test.tsx:
 * pointer drag → onTrimClip). This drives the REAL app end-to-end to prove the
 * whole write-back loop works in the browser:
 *   drag arm 0's right edge → set-weight serializer → registry write-back →
 *   the editor SOURCE gains the new weight → the debounced re-eval republishes
 *   the IR → the clip's extent moves.
 *
 * We TYPE the song (not setValue) so the onChange → file store → IR-snapshot
 * path fires (same reason as the read-only clips spec).
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

// Two equal arms, period 2 + 2 = 4. Arm 0's right edge is at cycle 2 of 4 →
// x ≈ 0.5·W. Bare patterns so the edge grip isn't obscured by note marks.
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

function strudelSource(page: Page): Promise<string> {
  return page.evaluate(() => {
    const eds = ((window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; getValue: () => string } | null }> } } }).monaco?.editor?.getEditors?.()) ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    return t?.getModel()?.getValue() ?? ''
  })
}

test('dragging arm 0’s right edge rewrites its weight in the source', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  await typeSongAndEval(page, ARRANGE_SONG)

  await page.locator('[data-musical-timeline="view-toggle"]').click()
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-canvas]').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(400)

  expect(await strudelSource(page)).toContain('arrange([2, s("bd")]')

  // Drag arm 0's right edge (cycle 2 of 4 → 0.5·W) to cycle 3 (0.75·W). At the
  // default zoom contentWidth == the grid width and scrollLeft is 0, so a client
  // x of `left + frac·width` maps to `frac·4` cycles. Grab 4px INSIDE the edge
  // (the boundary pixel itself belongs to arm 1).
  const grid = page.locator('[data-full-song="grid"]')
  const box = await grid.boundingBox()
  if (!box) throw new Error('no grid box')
  const y = box.y + 8 // the single (bd) lane row
  const grabX = box.x + box.width * 0.5 - 4
  const dropX = box.x + box.width * 0.75
  await page.mouse.move(grabX, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 4 })
  await page.mouse.move(dropX, y, { steps: 4 })
  await page.mouse.up()

  // The set-weight edit applied to the model; the debounced re-eval follows.
  await expect.poll(() => strudelSource(page), { timeout: 8_000 }).toContain('arrange([3, s("bd")]')
  // arm 1 untouched — only arm 0's weight digit changed (byte-fidelity).
  expect(await strudelSource(page)).toContain('[2, s("hh")]')

  await page.screenshot({ path: 'test-results/arrange-trim.png' })
  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
