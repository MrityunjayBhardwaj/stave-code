/**
 * Full-song view: the clip-selection and the caret lane-selection never light
 * two different rows at once (#649).
 *
 * Bug: the clip-selection (`selected`, #386) and the caret lane band
 * (`selectedLaneKey`, #642) are independent. Selecting a clip on lane A, then
 * moving the editor caret to lane B, left BOTH rows highlighted — the band on B
 * and the (full-row) clip rect on A.
 *
 * Fix: when the selected lane CHANGES to a lane other than the selected clip's,
 * the clip-selection is stale → it clears. A fresh clip click (which moves the
 * caret to the clip's own lane) is NOT cleared.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const CODE = `setcps(130/240)

$: stack(
  note("c4 e4 g4 b4 c5 b4 g4 e4").s("sawtooth").gain(0.3).lpf(2400).release(0.12),
  note("e3 g3 b3 e4").s("sine").gain(0.15).release(0.3)
).viz("pianoroll")

$: note("<c2 [g2 c2] f2 [g2 eb2]>").s("square").gain(0.4).lpf(500).release(0.2).viz("pitchwheel")

$: stack(
  s("hh*8").gain(0.3),
  s("bd [~ bd] ~ bd").gain(0.5),
  s("~ sd ~ [sd cp]").gain(0.4)
).viz("wordfall")
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

function clipCount(page: Page): Promise<number> {
  return page.locator('[data-full-song="clip-selection"]').count()
}

test('#649 — a clip stays selected on its own row, but clears when the caret moves to another lane', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })

  await boot(page)
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })

  const grid = page.locator('[data-full-song="grid"]')
  const gb = await grid.boundingBox()
  if (!gb) throw new Error('no grid box')

  // Click a clip on lane 2's row (≈ third 18px band) → it selects the clip AND
  // the caret jumps to that lane (band + clip on the SAME row).
  await page.mouse.click(gb.x + 220, gb.y + 45)
  await page.waitForTimeout(300)
  // A fresh clip click keeps its selection (NOT falsely cleared by the async
  // caret round-trip — the caret lands on the clip's own lane).
  expect(await clipCount(page)).toBe(1)

  // Now navigate to a DIFFERENT lane by clicking lane 0's header (sets the
  // selected lane to d1). The stale clip-selection on lane 2 must clear, leaving
  // exactly one highlighted row.
  await page.locator('[data-full-song-lane-select]').nth(0).click({ force: true })
  await expect
    .poll(() => clipCount(page), { timeout: 4_000, message: 'clip-selection should clear when the selected lane moves to another lane' })
    .toBe(0)

  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
