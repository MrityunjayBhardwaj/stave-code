/**
 * Full-song view: EXTEND the LAST clip past the song end (#487) — Playwright
 * observation (AnviDev observe gate).
 *
 * The original bug: at zoom 1 (fit-to-view) the last clip's right edge sits at
 * the viewport wall with no empty timeline to drag into, so it couldn't be
 * extended. The fix renders NO permanent trailing blank (the rest span is
 * exactly the song); instead, dragging the last edge into the right-edge band
 * GROWS the visual span at a constant px/cycle and AUTO-SCROLLS empty timeline
 * into view (Logic/Ableton feel), so the edge can keep going. On release the
 * view refits — the committed re-eval grows the period to fill it.
 *
 * This drives the whole loop end-to-end in the browser:
 *   grab the last edge → hold in the right-edge band (rAF auto-scroll) →
 *   set-weight serializer → registry write-back → the editor SOURCE gains a
 *   LARGER weight → the debounced re-eval republishes the IR.
 *
 * We TYPE the song (not setValue) so the onChange → file store → IR-snapshot
 * path fires (same reason as the read-only clips spec).
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

// Two equal arms, period 2 + 2 = 4. Arm 1 (`s("hh")`) is the LAST clip; its
// right edge is the song end (cycle 4), which at zoom 1 sits at the wall.
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

/** The `hh` arm's whole-cycle weight in the current source, or null. */
function hhWeight(src: string): number | null {
  const m = src.match(/\[(\d+),\s*s\("hh"\)\]/)
  return m ? Number(m[1]) : null
}

test('holding the LAST clip’s edge in the right-edge band extends it (#487)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  await typeSongAndEval(page, ARRANGE_SONG)

  // Song canvas is the only timeline view now (#497/U5) -- wait for it.
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-canvas]').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(400)

  expect(hhWeight(await strudelSource(page))).toBe(2)
  // No permanent trailing blank: the rest span is exactly the song (period 4),
  // so the ruler shows 4 major ticks, NOT a padded count.
  expect(await page.locator('[data-full-song-tick="major"]').count()).toBe(4)

  const grid = page.locator('[data-full-song="grid"]')
  const box = await grid.boundingBox()
  if (!box) throw new Error('no grid box')
  // The last clip's right edge sits at the wall (x = grid right). Grab 3px inside
  // it, in the first lane row, then HOLD in the right-edge band: each move keeps
  // the cursor there while the rAF auto-scroll pulls empty timeline in and the
  // edge follows, growing the weight. ~10 holds ≈ 500ms of scrolling.
  const bandX = box.x + box.width - 3
  const y = box.y + 8
  await page.mouse.move(box.x + box.width - 2, y)
  await page.mouse.down()
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(bandX, y)
    await page.waitForTimeout(50)
  }
  await page.mouse.up()

  // The set-weight edit applied; the debounced re-eval follows. The hh weight is
  // now strictly greater than its original 2 — the last clip extended.
  await expect
    .poll(async () => hhWeight(await strudelSource(page)), { timeout: 8_000 })
    .toBeGreaterThan(2)
  const finalSrc = await strudelSource(page)
  expect(hhWeight(finalSrc)).toBeGreaterThan(2)
  // arm 0 (bd) untouched — only the hh arm's weight changed.
  expect(finalSrc).toContain('[2, s("bd")]')

  await page.screenshot({ path: 'test-results/arrange-extend.png' })
  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
