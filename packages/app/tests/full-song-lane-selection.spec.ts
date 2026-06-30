/**
 * Full-song view: caret/click-selected lane highlight (#641 + #642).
 *
 * #641 lit the lane the editor caret sits in. #642 fixed the bug where the
 * highlight was IMPERCEPTIBLE: it painted only the 88px label gutter with a
 * near-invisible `rgba(110,168,254,0.12)` fill, so on the canvas — where the
 * user actually looks — clicking a different lane appeared to do nothing
 * ("original stays lit"). The selection DATA was always correct (proven by live
 * instrumentation + a Playwright render probe); the defect was purely visual.
 *
 * This spec guards the VISUAL property a data-attr-only assertion would mask
 * (the P217/P219 lesson): a FULL-WIDTH band element must exist over the grid at
 * the selected lane, and clicking a different header must MOVE that band off the
 * old lane onto the clicked one. A regression to a gutter-only / absent band
 * fails here even though `isSelected` still flips.
 *
 * Loads all-anonymous `$:` lanes — the exact shape that triggered #642 — so the
 * fix's `(labelOffset ?? sourceOffset)` anchor match is exercised on lanes with
 * no statement label.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const STORAGE_KEYS = {
  height: 'stave:bottomPanel.height',
  open: 'stave:bottomPanel.open',
  activeTabId: 'stave:bottomPanel.activeTabId',
} as const

const CODE = `setcps(130/240)

$: stack(
  note("c4 e4 g4 b4 c5 b4 g4 e4")
    .s("sawtooth").gain(0.3).lpf(2400).release(0.12),
  note("e3 g3 b3 e4")
    .s("sine").gain(0.15).release(0.3)
).viz("pianoroll")

$: note("<c2 [g2 c2] f2 [g2 eb2]>")
  .s("square").gain(0.4).lpf(500).release(0.2)
  .viz("pitchwheel")

$: stack(
  s("hh*8").gain(0.3),
  s("bd [~ bd] ~ bd").gain(0.5),
  s("~ sd ~ [sd cp]").gain(0.4)
).viz("wordfall")
`

async function preOpenDrawer(page: Page): Promise<void> {
  await page.addInitScript(
    ([heightKey, openKey, activeKey]: readonly string[]) => {
      try {
        window.localStorage.setItem(heightKey, '340')
        window.localStorage.setItem(openKey, 'true')
        window.localStorage.setItem(activeKey, 'musical-timeline')
      } catch {
        /* ignore */
      }
    },
    [STORAGE_KEYS.height, STORAGE_KEYS.open, STORAGE_KEYS.activeTabId],
  )
}

async function bootShell(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () =>
      ((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco?.editor?.getEditors?.()?.length ?? 0) > 0,
    { timeout: 20_000 },
  )
}

async function loadCode(page: Page, src: string): Promise<void> {
  await page.evaluate((code) => {
    const eds = ((window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; setValue?: (v: string) => void } | null; focus: () => void }> } } }).monaco?.editor?.getEditors?.()) ?? []
    const ed = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    ed?.focus()
    ed?.getModel()?.setValue?.(code)
  }, src)
}

async function evalStrudel(page: Page): Promise<void> {
  await page.evaluate(() => {
    const eds = ((window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string } | null; focus: () => void }> } } }).monaco?.editor?.getEditors?.()) ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    t?.focus()
  })
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1800)
}

test('#642 — selecting a lane shows a FULL-WIDTH band that MOVES to the clicked lane', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await preOpenDrawer(page)
  await bootShell(page)
  await loadCode(page, CODE)
  await page.waitForTimeout(600)
  await evalStrudel(page)
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })

  const headers = page.locator('[data-full-song-lane-select]')
  await expect(headers).toHaveCount(3)
  const firstKey = await headers.nth(0).getAttribute('data-full-song-lane-select')
  const lastKey = await headers.nth(2).getAttribute('data-full-song-lane-select')
  expect(firstKey).toBeTruthy()
  expect(lastKey).toBeTruthy()
  expect(firstKey).not.toBe(lastKey)

  const band = page.locator('[data-full-song-lane-selection]')
  const gridBox = await page.locator('[data-full-song="grid"]').boundingBox()
  if (!gridBox) throw new Error('no grid box')

  // Click the FIRST lane header → exactly one band, on that lane, spanning the
  // full grid width (NOT the ~88px gutter — that gutter-only highlight was the
  // #642 bug). Capture its Y so we can prove the move later.
  await headers.nth(0).click()
  await page.waitForTimeout(200)
  await expect(band).toHaveCount(1)
  await expect(band).toHaveAttribute('data-full-song-lane-selection', firstKey!)
  const firstBandBox = await band.boundingBox()
  if (!firstBandBox) throw new Error('no band box after first click')
  // Full-width: the band covers most of the grid, far wider than the gutter.
  expect(firstBandBox.width).toBeGreaterThan(gridBox.width * 0.6)

  // Click the LAST lane header → the band MOVES: it now reports the new lane,
  // there is no band left on the first lane, and its Y shifted to a lower row.
  await headers.nth(2).click()
  await page.waitForTimeout(200)
  await expect(band).toHaveCount(1)
  await expect(band).toHaveAttribute('data-full-song-lane-selection', lastKey!)
  await expect(page.locator(`[data-full-song-lane-selection="${firstKey}"]`)).toHaveCount(0)
  const lastBandBox = await band.boundingBox()
  if (!lastBandBox) throw new Error('no band box after last click')
  expect(lastBandBox.width).toBeGreaterThan(gridBox.width * 0.6)
  // The clicked lane sits below the first → the band's top edge moved down.
  expect(lastBandBox.y).toBeGreaterThan(firstBandBox.y + 1)

  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
