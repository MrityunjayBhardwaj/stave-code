/**
 * Full-song view: selecting a row must NOT draw the browser focus ring around
 * the bars area (#651).
 *
 * The grid is `tabIndex=0` so it can route clip-op keys to the selected clip,
 * and selecting a row focuses it programmatically. The browser's default
 * `outline: auto` then bordered the WHOLE grid — a stray box competing with the
 * lane band. The grid style now sets `outline: none`; this guards it.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const CODE = `setcps(130/240)

$: stack(note("c4 e4 g4 b4").s("sawtooth"), note("e3 g3 b3 e4").s("sine")).viz("pianoroll")
$: note("<c2 g2 f2 eb2>").s("square").viz("pitchwheel")
$: stack(s("hh*8"), s("bd ~ bd ~")).viz("wordfall")
`

async function boot(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '420')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
    } catch {}
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => (((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco?.editor?.getEditors?.()?.length) ?? 0) > 0,
    { timeout: 20_000 },
  )
  await page.evaluate((c) => {
    const eds = ((window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; setValue?: (v: string) => void } | null; focus: () => void }> } } }).monaco?.editor?.getEditors?.()) ?? []
    const ed = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    ed?.focus()
    ed?.getModel()?.setValue?.(c)
  }, CODE)
  await page.waitForTimeout(500)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1500)
}

test('#651 — selecting a row focuses the grid but draws no focus-ring outline', async ({ page }) => {
  await boot(page)
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })

  const grid = page.locator('[data-full-song="grid"]')
  const gb = await grid.boundingBox()
  if (!gb) throw new Error('no grid box')

  // Click a lane ROW → selects it AND focuses the grid (so clip-op keys work).
  await page.mouse.click(gb.x + 200, gb.y + 30)
  await page.waitForTimeout(250)

  const state = await page.evaluate(() => {
    const g = document.querySelector('[data-full-song="grid"]') as HTMLElement
    const cs = getComputedStyle(g)
    return {
      gridIsFocused: document.activeElement === g,
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
    }
  })

  // The grid is the focus target (so the clip-op keys still route here)…
  expect(state.gridIsFocused).toBe(true)
  // …but the browser focus RING is suppressed — no border around the bars area.
  expect(state.outlineStyle).toBe('none')
})
