/**
 * Full-song view: pick* section CLIPS are editable (#463 Stage 2) — observe gate.
 *
 * A `"<…@w …>".pickRestart({…})` track's clips are the weighted arms of its
 * control string. Before Stage 2 the clip ops no-op'd on a pick* track (P186 —
 * the arrange detector doesn't recognise it). Now selecting a section clip and
 * pressing Delete edits the `<…@w …>` control directly (string-surgery), leaving
 * the section patterns + the pickRestart object byte-verbatim.
 *
 * What Delete MEANS follows the arrange spelling (#1462): a plain Delete leaves a
 * gap — the section's arm becomes a rest of the same width, so later sections keep
 * their place in time — and the ripple chord (Cmd/Ctrl+Shift+Delete, #1460)
 * removes the arm and closes the gap. One arm per gesture below.
 *
 * Discriminating: the source MUST change in the way the gesture names.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

// verse @ cycles 0-1, chorus @ cycles 2-3 (period 4 → clean clip x-positions).
const SONG = '"<verse@2 chorus@2>".pickRestart({verse: s("bd"), chorus: s("hh")})'

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

async function selectVerseClip(page: Page): Promise<ReturnType<Page['locator']>> {
  await bootShell(page)
  await typeSongAndEval(page, SONG)
  expect(await strudelSource(page)).toContain('<verse@2 chorus@2>')

  // Song canvas is the only timeline view now (#497/U5) -- wait for it.
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-canvas]').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(400)

  // Click the verse clip body (cycles 0-1 of 4 → center x ≈ 0.25·W) in the lane band.
  const grid = page.locator('[data-full-song="grid"]')
  const box = await grid.boundingBox()
  if (!box) throw new Error('no grid box')
  await page.mouse.click(box.x + box.width * 0.25, box.y + 8)
  await expect(page.locator('[data-full-song="clip-selection"]')).toBeVisible({ timeout: 5_000 })
  return grid
}

test('selecting a pickRestart section clip and pressing Delete leaves a gap in the <…@w> control', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  const grid = await selectVerseClip(page)

  // Delete the selected section → silenceArm rewrites verse@2 to a rest of the
  // same width, so chorus stays at cycle 2.
  await grid.press('Delete')

  await expect.poll(() => strudelSource(page), { timeout: 8_000 }).toContain('<~@2 chorus@2>')
  const after = await strudelSource(page)
  // The verse arm is a rest now, not removed...
  expect(after).not.toContain('<verse@2 chorus@2>')
  expect(after).not.toContain('"<chorus@2>"')
  // ...and the section patterns + pickRestart object stay byte-verbatim.
  expect(after).toContain('.pickRestart({verse: s("bd"), chorus: s("hh")})')

  await page.screenshot({ path: 'test-results/full-song-pickrestart-clips.png' })
  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})

test('the ripple chord on a pickRestart section clip removes its arm and closes the gap', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  const grid = await selectVerseClip(page)

  // Ripple delete → removeArm drops the verse arm, so chorus moves to cycle 0.
  await grid.press(`${MOD}+Shift+Delete`)

  await expect.poll(() => strudelSource(page), { timeout: 8_000 }).toContain('"<chorus@2>"')
  const after = await strudelSource(page)
  expect(after).not.toContain('~@2')
  expect(after).toContain('.pickRestart({verse: s("bd"), chorus: s("hh")})')

  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
