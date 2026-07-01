/**
 * #666 (resolved as "already supported") — a whole-string `<a b c>` is ONE atomic
 * bare clip; the existing bare clip ops (split #488, delete-gap #489) materialize
 * it into `arrange` arms whose pattern is the WHOLE `<a b c>`, NOT a per-arm (a/b/c)
 * decomposition. `<a b c>` behaves like any other clip on the Song Timeline.
 *
 * Regression lock: the arm content (`<a b c>`) is NEVER split apart by a clip op —
 * per-note editing is the Pattern tab's job. Guards against re-introducing a
 * per-arm `armIndex` decomposition of mini `<…>` in the collect walk.
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

async function selectFirstClip(page: Page) {
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-canvas]').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(400)
  const grid = page.locator('[data-full-song="grid"]')
  const box = await grid.boundingBox()
  if (!box) throw new Error('no grid box')
  await page.mouse.click(box.x + box.width * 0.25, box.y + 8)
  await expect(page.locator('[data-full-song="clip-selection"]')).toBeVisible({ timeout: 5_000 })
  return grid
}

test('a bare `<a b c>` clip splits into atomic arrange spans (whole pattern per arm, #666)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })

  await bootShell(page)
  await typeSongAndEval(page, 's("<a b c>")')
  const grid = await selectFirstClip(page)

  await grid.press('s')
  // Split materializes the WHOLE `<a b c>` as two atomic 2-cycle-span arms — the
  // same bare→arrange path uniform loops use, NOT a per-arm (a/b/c) decomposition.
  await expect.poll(() => strudelSource(page), { timeout: 8_000 }).toBe(
    'arrange([2, s("<a b c>")], [2, s("<a b c>")])',
  )
  expect(errors, `errors:\n${errors.join('\n')}`).toEqual([])
})

test('deleting a bar of a bare `<a b c>` clip carves a gap around the whole pattern (#666)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })

  await bootShell(page)
  await typeSongAndEval(page, 's("<a b c>")')
  const grid = await selectFirstClip(page)

  await grid.press('Delete')
  // Delete carves a silent gap AROUND the whole `<a b c>` (bare→arrange #489),
  // never touching the arms.
  await expect.poll(() => strudelSource(page), { timeout: 8_000 }).toBe(
    'arrange([1, s("<a b c>")], [1, silence], [2, s("<a b c>")])',
  )
  expect(errors, `errors:\n${errors.join('\n')}`).toEqual([])
})
