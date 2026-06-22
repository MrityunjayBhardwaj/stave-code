/**
 * Full-song view: MOVE a clip by dragging its body (#386 / Phase 5c) —
 * Playwright observation (AnviDev observe gate).
 *   - reorder: drag a REAL arm's clip into another arm's time-span → reorderArm.
 *   - bare clip: NOT movable (#488). A uniform pattern tiles every cycle
 *     identically, so a drag would swap identical content; injecting a leading
 *     `silence` to "place" it invents a gap the source never had. The drag is a
 *     no-op (the old wrap-to-arrange gesture was removed).
 *
 * Unit tests cover the reorder substrate (editor arrange.test.ts: reorderArm).
 * This drives the REAL app end-to-end.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

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

async function openSongView(page: Page): Promise<void> {
  // Song canvas is the only timeline view now (#497/U5) -- wait for it.
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-canvas]').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(400)
}

test('reorder: dragging arm 0’s clip into arm 1’s span swaps the arm order', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  await typeSongAndEval(page, 'arrange([2, s("bd")], [2, s("hh")])')
  await openSongView(page)
  expect(await strudelSource(page)).toContain('arrange([2, s("bd")], [2, s("hh")])')

  // bd lane (first) holds arm 0 over cycles [0,2). Grab its body (cycle ~1 =
  // 0.25·W) and drag right into arm 1's span (cycle ~2.5 = 0.625·W) → reorder.
  const grid = page.locator('[data-full-song="grid"]')
  const box = await grid.boundingBox()
  if (!box) throw new Error('no grid box')
  const y = box.y + 8
  await page.mouse.move(box.x + box.width * 0.25, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.45, y, { steps: 4 })
  await page.mouse.move(box.x + box.width * 0.625, y, { steps: 4 })
  await page.mouse.up()

  await expect.poll(() => strudelSource(page), { timeout: 8_000 }).toContain(
    'arrange([2, s("hh")], [2, s("bd")])',
  )
  await page.screenshot({ path: 'test-results/arrange-move-reorder.png' })
  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})

test('a bare track’s clip is NOT movable — dragging it leaves the source untouched (#488)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  // A bare, multi-cycle track. Its implicit clip tiles every cycle identically,
  // so a drag would swap identical content (an identity); injecting a leading
  // `silence` to "place" it would invent a gap the source never had (#488).
  const SRC = 's("bd hh cp sd").slow(4)'
  await typeSongAndEval(page, SRC)
  await openSongView(page)

  const grid = page.locator('[data-full-song="grid"]')
  const box = await grid.boundingBox()
  if (!box) throw new Error('no grid box')
  const y = box.y + 8
  // Drag the implicit clip's body well to the right — this must NOT rewrite the
  // pattern into an `arrange([…, silence], …)`.
  await page.mouse.move(box.x + box.width * 0.2, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.5, y, { steps: 4 })
  await page.mouse.move(box.x + box.width * 0.7, y, { steps: 4 })
  await page.mouse.up()

  // Settle, then assert the source is byte-for-byte unchanged — no arrange, no silence.
  await page.waitForTimeout(1000)
  const after = await strudelSource(page)
  expect(after).toBe(SRC)
  expect(after).not.toContain('silence')
  expect(after).not.toContain('arrange(')
  await page.screenshot({ path: 'test-results/arrange-move-bare-noop.png' })
  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
