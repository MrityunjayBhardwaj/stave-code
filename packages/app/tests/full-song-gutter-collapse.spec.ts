/**
 * Full-song view: the gutter (lane labels) must collapse IDENTICALLY to the
 * track-row canvas on the right (#645).
 *
 * Bug: the gutter is a flex column; its `laneRow` children had no
 * `flex-shrink: 0`, so when the drawer was shrunk below the content height,
 * flexbox SQUISHED every label row to fit (gutter `scrollHeight` clamped to the
 * viewport) while the grid kept true lane heights and CLIPPED (`overflowY:
 * hidden`, content stays at the real total). The two sides no longer lined up.
 *
 * Fix: `laneRow { flex-shrink: 0 }` (keep true heights) + gutter `overflow:
 * clip` (clip like the grid, and — unlike `hidden` — NOT a scroll container, so
 * focusing an expand button can't scroll the gutter out of step with the grid).
 *
 * Guard (the property a screenshot-free assertion can still verify): at a short
 * drawer height where the lanes overflow, the gutter's content height equals the
 * grid's content height, and the gutter has no independent scroll offset.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const K = {
  height: 'stave:bottomPanel.height',
  open: 'stave:bottomPanel.open',
  activeTabId: 'stave:bottomPanel.activeTabId',
}
// Three lanes — even collapsed they exceed the short drawer's body height, so
// the collapse behaviour is exercised without needing to expand anything.
const CODE = `setcps(130/240)

$: note("c4 e4 g4 b4").s("sawtooth").gain(0.3).viz("pianoroll")

$: note("<c2 g2 f2 eb2>").s("square").gain(0.4).viz("pitchwheel")

$: stack(
  s("hh*8").gain(0.3),
  s("bd [~ bd] ~ bd").gain(0.5)
).viz("wordfall")
`

async function boot(page: Page, height: number) {
  await page.addInitScript(
    ([h, o, a, hv]: string[]) => {
      try {
        window.localStorage.setItem(h, hv)
        window.localStorage.setItem(o, 'true')
        window.localStorage.setItem(a, 'musical-timeline')
      } catch {}
    },
    [K.height, K.open, K.activeTabId, String(height)],
  )
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => (((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco?.editor?.getEditors?.()?.length) ?? 0) > 0,
    { timeout: 20_000 },
  )
  await page.evaluate((code) => {
    const eds = ((window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; setValue?: (v: string) => void } | null; focus: () => void }> } } }).monaco?.editor?.getEditors?.()) ?? []
    const ed = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    ed?.focus()
    ed?.getModel()?.setValue?.(code)
  }, CODE)
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    const eds = ((window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string } | null; focus: () => void }> } } }).monaco?.editor?.getEditors?.()) ?? []
    const ed = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    ed?.focus()
  })
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1500)
}

test('#645 — the gutter collapses identically to the track rows (no squish, no drift)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })

  await boot(page, 150) // short — the body ends up well under the 3-lane content height
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })

  const m = await page.evaluate(() => {
    const labels = document.querySelector('[data-full-song="lane-labels"]') as HTMLElement | null
    const grid = document.querySelector('[data-full-song="grid"]') as HTMLElement | null
    return {
      labelsScrollH: labels?.scrollHeight ?? -1,
      labelsClientH: labels?.clientHeight ?? -1,
      labelsScrollTop: labels?.scrollTop ?? -1,
      gridScrollH: grid?.scrollHeight ?? -1,
      gridScrollTop: grid?.scrollTop ?? -1,
    }
  })

  // The scenario is only meaningful if the content actually overflows.
  expect(m.gridScrollH).toBeGreaterThan(m.labelsClientH)
  // The gutter keeps the SAME true content height as the grid (no squish): both
  // honour the lane heights from LaneLayout.
  expect(m.labelsScrollH).toBe(m.gridScrollH)
  // …and the gutter is pinned to the grid — no independent scroll offset (the
  // `overflow: clip` guarantee; `hidden` allowed a focus-driven drift).
  expect(m.labelsScrollTop).toBe(0)
  expect(m.gridScrollTop).toBe(0)

  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
