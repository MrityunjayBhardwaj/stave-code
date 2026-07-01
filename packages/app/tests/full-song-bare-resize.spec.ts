/**
 * Full-song view: RESIZE a bare loop's displayed span (set-length, #662) —
 * Playwright observation (AnviDev observe gate).
 *
 * A bare loop (`$: s("bd*4")`, period 1) shows as ONE implicit clip floored to
 * MIN_BARE_SPAN (4 bars). #662 lets the user drag its right edge to choose how
 * many bars it shows — option B: a VIEW-ONLY display span (persisted to the
 * timeline camera), with NO code write-back. The source stays byte-identical;
 * only a real structural op (Split/Delete) writes code, now at the chosen span.
 *
 * The observation gate for option B is the byte-for-byte source check after a
 * resize: the whole point is that dragging the edge mutates NO code. We TYPE the
 * song (not setValue) so the onChange → file store → IR-snapshot path fires.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const BARE_SONG = 's("bd*4")'

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
  await waitForMonaco(page)
}

async function waitForMonaco(page: Page): Promise<void> {
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

async function waitForSongView(page: Page): Promise<void> {
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-canvas]').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(400)
}

const majorCount = (page: Page): Promise<number> =>
  page.locator('[data-full-song-tick="major"]').count()

test('extending a bare loop’s edge grows the display span and writes NO code, persisting across reload (#662)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  await typeSongAndEval(page, BARE_SONG)
  await waitForSongView(page)

  // At rest the bare loop is floored to 4 bars → 4 major ticks. The source is the
  // bare pattern verbatim.
  expect(await majorCount(page)).toBe(4)
  expect((await strudelSource(page)).trim()).toBe(BARE_SONG)

  // Grab the bare clip's right edge (the song end, at the wall) and HOLD in the
  // right-edge band so the rAF auto-scroll pulls more empty timeline in and the
  // edge follows — the same #487 mechanic, here growing the DISPLAY span.
  const grid = page.locator('[data-full-song="grid"]')
  const box = await grid.boundingBox()
  if (!box) throw new Error('no grid box')
  const bandX = box.x + box.width - 3
  const y = box.y + 8
  await page.mouse.move(box.x + box.width - 2, y)
  await page.mouse.down()
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(bandX, y)
    await page.waitForTimeout(50)
  }
  await page.mouse.up()
  await page.waitForTimeout(300)

  // The display span GREW (more bars than the 4-bar floor)…
  const grown = await majorCount(page)
  expect(grown).toBeGreaterThan(4)
  // …and the OBSERVATION GATE for option B: the source is byte-identical — the
  // resize wrote no code. Only Split/Delete write code.
  expect((await strudelSource(page)).trim()).toBe(BARE_SONG)

  // Persist + reload: the camera carries the resized span across a fresh session.
  await page.waitForTimeout(300)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await waitForMonaco(page)
  await typeSongAndEval(page, BARE_SONG)
  await waitForSongView(page)

  // The restored span matches the resized one (same override, same viewport).
  expect(await majorCount(page)).toBe(grown)

  await page.screenshot({ path: 'test-results/bare-resize-extend.png' })
  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})

test('shrinking a bare loop is clamped at 2 bars so Split stays possible (#662)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  await typeSongAndEval(page, BARE_SONG)
  await waitForSongView(page)
  expect(await majorCount(page)).toBe(4)

  // Drag the edge hard LEFT toward cycle 0. The bare clamp floors the span at 2 —
  // never below a splittable 2 bars. In-viewport, so no auto-scroll needed.
  const grid = page.locator('[data-full-song="grid"]')
  const box = await grid.boundingBox()
  if (!box) throw new Error('no grid box')
  const y = box.y + 8
  await page.mouse.move(box.x + box.width - 2, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.4, y)
  await page.mouse.move(box.x + 4, y)
  await page.mouse.up()
  await page.waitForTimeout(300)

  // Clamped to 2 bars, and still no code write-back.
  expect(await majorCount(page)).toBe(2)
  expect((await strudelSource(page)).trim()).toBe(BARE_SONG)

  await page.screenshot({ path: 'test-results/bare-resize-shrink.png' })
  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})

test('Split after an extend materializes the arrange at the CHOSEN span, not the 4-bar floor (#662)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  await typeSongAndEval(page, BARE_SONG)
  await waitForSongView(page)
  expect(await majorCount(page)).toBe(4)

  const grid = page.locator('[data-full-song="grid"]')
  const box = await grid.boundingBox()
  if (!box) throw new Error('no grid box')
  const y = box.y + 8
  // Extend the span past 4 bars (hold in the right-edge band).
  await page.mouse.move(box.x + box.width - 2, y)
  await page.mouse.down()
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(box.x + box.width - 3, y)
    await page.waitForTimeout(50)
  }
  await page.mouse.up()
  await page.waitForTimeout(300)
  const span = await majorCount(page)
  expect(span).toBeGreaterThan(4)

  // Select the bare clip (a click that doesn't drag) and Split it.
  await page.mouse.click(box.x + box.width * 0.25, y)
  await expect(page.locator('[data-full-song="clip-selection"]')).toBeVisible({ timeout: 5_000 })
  await grid.press('s')

  // The materialized arrange splits the CHOSEN span: two `s("bd*4")` arms whose
  // weights sum to the resized bar count (> 4) — not the default floor of 4.
  await expect.poll(() => strudelSource(page), { timeout: 8_000 }).toContain('arrange(')
  const src = await strudelSource(page)
  const arms = [...src.matchAll(/\[(\d+),\s*s\("bd\*4"\)\]/g)].map((m) => Number(m[1]))
  expect(arms.length).toBe(2)
  expect(arms[0] + arms[1]).toBe(span)
  expect(arms[0] + arms[1]).toBeGreaterThan(4)

  await page.screenshot({ path: 'test-results/bare-resize-split.png' })
  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
