/**
 * Full-song clip ops — comprehensive end-to-end coverage of ALL FIVE operations
 * (delete / move / duplicate / split / trim) on a MULTI-track `$:` song, the
 * real-world case (#456 / #386 / #416 phase 4). Each op is its own test so a
 * failure localizes to one gesture. The arrange lives on the FIRST lane, with
 * two sibling tracks present — so these also prove the multi-track write-back
 * (#461) end-to-end, not just the standalone path the per-op specs cover.
 *
 * Every test asserts the d1 `arrange(...)` line is rewritten AND the two sibling
 * `$:` lines stay byte-identical (other tracks must never be touched).
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

// 8-cycle arrange (2+2+4) on the top lane + two sibling tracks below it.
const SIB1 = '$: s("bd*2, ~ sd, hh*8").bank("RolandTR909")'
const SIB2 = '$: note("c2 eb2 g2 c3").s("sawtooth").slow(2)'
const ARRANGE = '$: arrange([2, s("bd")], [2, s("hh")], [4, s("cp")])'
const SONG = [ARRANGE, SIB1, SIB2].join('\n')

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
  await page.locator('[data-musical-timeline="view-toggle"]').click()
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-canvas]').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(400)
}

async function gridBox(page: Page) {
  const grid = page.locator('[data-full-song="grid"]')
  const box = await grid.boundingBox()
  if (!box) throw new Error('no grid box')
  return { grid, box }
}

// Siblings must be byte-identical after every op.
async function expectSiblingsUntouched(page: Page): Promise<void> {
  const src = await strudelSource(page)
  expect(src, 'sibling track 1 must be untouched').toContain(SIB1)
  expect(src, 'sibling track 2 must be untouched').toContain(SIB2)
}

function setup(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })
  return errors
}

test.describe('full-song clip ops on a multi-track $: song', () => {
  test('SPLIT — select arm 0 (bd) + S slices it into two halves', async ({ page }) => {
    const errors = setup(page)
    await bootShell(page)
    await typeSongAndEval(page, SONG)
    await openSongView(page)

    const { grid, box } = await gridBox(page)
    await page.mouse.click(box.x + box.width * 0.08, box.y + 8) // arm 0, top lane
    await expect(page.locator('[data-full-song="clip-selection"]')).toBeVisible({ timeout: 5_000 })
    await grid.press('s')

    await expect.poll(() => strudelSource(page), { timeout: 8_000 }).toContain(
      'arrange([1, s("bd")], [1, s("bd")], [2, s("hh")], [4, s("cp")])',
    )
    await expectSiblingsUntouched(page)
    await page.screenshot({ path: 'test-results/clipop-split.png' })
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('DELETE — select arm 0 (bd) + Delete removes the arm', async ({ page }) => {
    const errors = setup(page)
    await bootShell(page)
    await typeSongAndEval(page, SONG)
    await openSongView(page)

    const { grid, box } = await gridBox(page)
    await page.mouse.click(box.x + box.width * 0.08, box.y + 8)
    await expect(page.locator('[data-full-song="clip-selection"]')).toBeVisible({ timeout: 5_000 })
    await grid.press('Delete')

    await expect.poll(() => strudelSource(page), { timeout: 8_000 }).toContain(
      'arrange([2, s("hh")], [4, s("cp")])',
    )
    await expectSiblingsUntouched(page)
    await page.screenshot({ path: 'test-results/clipop-delete.png' })
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('DUPLICATE — select arm 0 (bd) + ⌘D clones it after itself', async ({ page }) => {
    const errors = setup(page)
    await bootShell(page)
    await typeSongAndEval(page, SONG)
    await openSongView(page)

    const { grid, box } = await gridBox(page)
    await page.mouse.click(box.x + box.width * 0.08, box.y + 8)
    await expect(page.locator('[data-full-song="clip-selection"]')).toBeVisible({ timeout: 5_000 })
    await grid.press(`${MOD}+d`)

    await expect.poll(() => strudelSource(page), { timeout: 8_000 }).toContain(
      'arrange([2, s("bd")], [2, s("bd")], [2, s("hh")], [4, s("cp")])',
    )
    await expectSiblingsUntouched(page)
    await page.screenshot({ path: 'test-results/clipop-duplicate.png' })
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('MOVE (reorder) — drag arm 0 (bd) into arm 1 (hh) span swaps order', async ({ page }) => {
    const errors = setup(page)
    await bootShell(page)
    await typeSongAndEval(page, SONG)
    await openSongView(page)

    const { box } = await gridBox(page)
    const y = box.y + 8 // top (arrange) lane
    // arm 0 (bd) spans cycles [0,2) of 8 → first 25% of width. Drag it right into
    // arm 1 (hh) span (cycles [2,4) → ~0.375·W) to reorder bd after hh.
    await page.mouse.move(box.x + box.width * 0.1, y)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.28, y, { steps: 4 })
    await page.mouse.move(box.x + box.width * 0.36, y, { steps: 4 })
    await page.mouse.up()

    await expect.poll(() => strudelSource(page), { timeout: 8_000 }).toContain(
      'arrange([2, s("hh")], [2, s("bd")], [4, s("cp")])',
    )
    await expectSiblingsUntouched(page)
    await page.screenshot({ path: 'test-results/clipop-move-reorder.png' })
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('MOVE — dragging a BARE sibling track is a no-op (no combinator introduced) (#488)', async ({ page }) => {
    const errors = setup(page)
    await bootShell(page)
    // sibling 2 (note(...).slow(2)) is a 2-cycle BARE track. Its implicit clip
    // tiles every cycle identically, so dragging it must NOT rewrite it into an
    // arrange([…, silence], …) — that would invent a gap the source never had.
    await typeSongAndEval(page, SONG)
    await openSongView(page)

    const { box } = await gridBox(page)
    // The bare sibling sits on the 3rd lane. Use that lane element's absolute
    // vertical centre (lanes stack; the grid overlay aligns to them).
    const lane3 = page.locator('[data-full-song-lane]').nth(2)
    const lb = await lane3.boundingBox()
    if (!lb) throw new Error('no lane-3 box')
    const y = lb.y + lb.height / 2
    await page.mouse.move(box.x + box.width * 0.1, y)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.4, y, { steps: 4 })
    await page.mouse.move(box.x + box.width * 0.6, y, { steps: 4 })
    await page.mouse.up()

    // The whole program is byte-identical — no silence, no new arrange, every
    // track (the arrange + both siblings) untouched.
    await page.waitForTimeout(1000)
    const src = await strudelSource(page)
    expect(src, 'no leading silence introduced').not.toContain('silence')
    expect(src, 'the bare sibling stays bare').toContain(SIB2)
    expect(src, 'the arrange track must be untouched').toContain(ARRANGE)
    expect(src, 'sibling 1 must be untouched').toContain(SIB1)
    await page.screenshot({ path: 'test-results/clipop-move-bare-noop.png' })
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('TRIM — drag arm 0 (bd) right edge from 2 → 3 cycles', async ({ page }) => {
    const errors = setup(page)
    await bootShell(page)
    await typeSongAndEval(page, SONG)
    await openSongView(page)

    const { box } = await gridBox(page)
    const y = box.y + 8 // top (arrange) lane
    // arm 0 (bd) right edge sits at cycle 2 of 8 → 0.25·W. Grab 4px inside it and
    // drag to cycle 3 → 0.375·W. weight 2 → 3.
    const grabX = box.x + box.width * 0.25 - 4
    await page.mouse.move(grabX, y)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.31, y, { steps: 4 })
    await page.mouse.move(box.x + box.width * 0.375, y, { steps: 4 })
    await page.mouse.up()

    await expect.poll(() => strudelSource(page), { timeout: 8_000 }).toContain(
      'arrange([3, s("bd")], [2, s("hh")], [4, s("cp")])',
    )
    await expectSiblingsUntouched(page)
    await page.screenshot({ path: 'test-results/clipop-trim.png' })
    expect(errors, errors.join('\n')).toEqual([])
  })
})
