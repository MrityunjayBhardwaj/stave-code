/**
 * Full-song view: DELETE a clip by selecting it + pressing Delete (#386 /
 * Phase 5c) — Playwright observation (AnviDev observe gate).
 *
 * The unit tests cover the substrate (editor arrange.test.ts: removeArm) and the
 * gesture (FullSongTimeline.test.tsx: select body + Delete → onDeleteClip). This
 * drives the REAL app end-to-end to prove the whole write-back loop works:
 *   click a clip body → select → Delete → remove-arm serializer → registry
 *   write-back → the editor SOURCE loses that arm → the debounced re-eval
 *   republishes the IR → the lane disappears.
 *
 * We TYPE the song (not setValue) so the onChange → file store → IR-snapshot
 * path fires (same reason as the trim spec).
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

// Two arms, period 2 + 2 = 4. Arm 0 (bd) spans cycles [0,2) → its body sits in
// the first half of the first lane. Bare patterns so the body isn't obscured.
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

test('selecting arm 0’s clip and pressing Delete removes the arm from the source', async ({ page }) => {
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

  // Click arm 0's body (the bd lane, first half = cycle ~1 of 4 → 0.25·W) to
  // select it — well clear of the edges at 0 and 0.5·W so it's a body, not a trim.
  const grid = page.locator('[data-full-song="grid"]')
  const box = await grid.boundingBox()
  if (!box) throw new Error('no grid box')
  const y = box.y + 8 // first (bd) lane row
  await page.mouse.click(box.x + box.width * 0.25, y)
  await expect(page.locator('[data-full-song="clip-selection"]')).toBeVisible({ timeout: 5_000 })

  // Delete the selected clip → the arm (and one separator) is removed.
  await page.keyboard.press('Delete')

  // The remove-arm edit applied to the model; the debounced re-eval follows.
  await expect.poll(() => strudelSource(page), { timeout: 8_000 }).toContain('arrange([2, s("hh")])')
  // arm 0 (bd) is gone entirely.
  expect(await strudelSource(page)).not.toContain('s("bd")')

  await page.screenshot({ path: 'test-results/arrange-delete.png' })
  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
