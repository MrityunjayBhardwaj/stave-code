/**
 * The transport display wraps to the song's length with the drawer closed
 * (#1726) — Playwright observation spec.
 *
 * #1725 made the display show the bar the playhead is on, wrapped to the song,
 * with a pass number. The song's length came from the Song timeline's analysis,
 * which lived inside the drawer, so with the drawer closed the display fell back
 * to the unwrapped song position and a dash for the pass. Now the analysis runs
 * whether or not the timeline is drawn.
 *
 * With the drawer closed there is no playhead to read against, so each arm
 * samples the display over more than one pass and checks that every reading is
 * inside the song and that the pass counts up. A display that does not wrap,
 * or wraps to a stale length, leaves the song within a pass.
 */
import { test, expect, type Page } from '@playwright/test'

import { bootApp, evalCode, seedCode } from './_appBoot'

/** Boot with the drawer open on the Song timeline, or closed. The shared boot
 *  waits for the project file to land before anything is seeded (#872). */
async function boot(page: Page, drawerOpen: boolean): Promise<void> {
  if (drawerOpen) {
    await bootApp(page, { drawer: { tabId: 'musical-timeline', height: 320 } })
    return
  }
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.open', 'false')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
    } catch {
      /* private mode */
    }
  })
  await bootApp(page)
}

/** Every song here is at 1 cps and the starter song is not: an evaluation that
 *  played the starter instead (#872) fails here rather than reading as a pass. */
async function expectPlayingOurSong(page: Page): Promise<void> {
  const lcd = page.locator('[data-stave-transport-lcd]')
  await expect(lcd).toContainText('PLAY', { timeout: 10_000 })
  await expect(lcd).toContainText('1.00', { timeout: 10_000 })
}

/** Seed, evaluate and play, driven as a user does (the shared helpers). */
async function evaluate(page: Page, code: string): Promise<void> {
  await seedCode(page, code)
  await evalCode(page)
  await expectPlayingOurSong(page)
}

interface Reading {
  readonly cycle: number | null
  readonly pass: number | null
  readonly drawn: boolean
  readonly text: string
}

const read = (page: Page): Promise<Reading> =>
  page.evaluate(() => {
    const pos = (document.querySelector('[data-stave-lcd-pos]') as HTMLElement | null)?.innerText.trim() ?? ''
    const pass = (document.querySelector('[data-stave-lcd-pass]') as HTMLElement | null)?.innerText.trim() ?? ''
    const cycle = /^\d+\.\d$/.test(pos) ? Number(pos) : null
    return {
      cycle,
      pass: /^\d+$/.test(pass) ? Number(pass) : null,
      drawn: document.querySelector('[data-full-song="grid"]') != null,
      text: `${pos} pass ${pass}`,
    }
  })

/** Read the display `n` times, `everyMs` apart. */
async function sample(page: Page, n: number, everyMs: number): Promise<Reading[]> {
  const out: Reading[] = []
  for (let i = 0; i < n; i++) {
    out.push(await read(page))
    await page.waitForTimeout(everyMs)
  }
  return out
}

/** Every reading inside `[0, bars]` (the display rounds to one decimal), a pass
 *  shown for each, and the display reaching the song's last bar before it wraps:
 *  a frame from a shorter song would wrap early and pass everything else. */
function expectWrapped(readings: Reading[], bars: number, label: string): void {
  console.log(`[#1726] ${label}: ${readings.map((r) => r.text).join(' · ')}`)
  for (const r of readings) {
    expect(r.cycle, `${label}: "${r.text}" is a cycle`).not.toBeNull()
    expect(r.cycle!, `${label}: "${r.text}" is inside the ${bars}-bar song`).toBeLessThanOrEqual(bars)
    expect(r.pass, `${label}: "${r.text}" names a pass`).not.toBeNull()
  }
  expect(Math.max(...readings.map((r) => r.cycle!)), `${label}: reaches the last bar`).toBeGreaterThan(bars - 1)
  // Across more than one pass the count goes up, one at a time.
  const passes = readings.map((r) => r.pass!)
  expect(Math.max(...passes), `${label}: the pass counts up`).toBeGreaterThan(Math.min(...passes))
  for (let i = 1; i < passes.length; i++) expect(passes[i] - passes[i - 1]).toBeGreaterThanOrEqual(0)
}

// 8 bars at 1 cps: one pass is 8 s. 4 bars: one pass is 4 s.
const EIGHT = 'setcps(1)\ndrums: arrange([4, s("bd*4")], [4, s("hh*8")])'
const FOUR = 'setcps(1)\ndrums: arrange([2, s("bd*4")], [2, s("hh*8")])'

test('closing the drawer mid-song keeps the display wrapped', async ({ page }) => {
  test.setTimeout(90_000)
  await boot(page, true)
  await evaluate(page, EIGHT)
  await page.waitForTimeout(2000)
  await page.locator('[data-bottom-panel="toggle"]').click()
  await expect.poll(async () => (await read(page)).drawn).toBe(false)
  expectWrapped(await sample(page, 20, 500), 8, 'drawer closed')
})

test('a song played with the drawer never opened wraps too', async ({ page }) => {
  test.setTimeout(90_000)
  await boot(page, false)
  await evaluate(page, EIGHT)
  const readings = await sample(page, 24, 500)
  expect(readings.every((r) => !r.drawn), 'the timeline was never drawn').toBe(true)
  // The first reading can come before the analysis lands; from the second on it must hold.
  expectWrapped(readings.slice(2), 8, 'drawer never opened')
})

test('evaluating a shorter song with the drawer closed wraps to the new length', async ({ page }) => {
  test.setTimeout(90_000)
  await boot(page, true)
  await evaluate(page, EIGHT)
  await page.waitForTimeout(2000)
  await page.locator('[data-bottom-panel="toggle"]').click()
  await expect.poll(async () => (await read(page)).drawn).toBe(false)
  await evaluate(page, FOUR)
  await page.waitForTimeout(1500)
  // Over 10 s the 8-bar song's frame would read past 4 for half of each pass.
  expectWrapped(await sample(page, 20, 500), 4, 'shorter song, drawer closed')
  // Reopened, the display agrees with what the timeline draws: still inside 4 bars.
  await page.locator('[data-bottom-panel="toggle"]').click()
  await expect.poll(async () => (await read(page)).drawn).toBe(true)
  expectWrapped(await sample(page, 12, 500), 4, 'reopened')
})

test('another file evaluated with the drawer closed wraps to its own length', async ({ page }) => {
  test.setTimeout(90_000)
  await boot(page, false)
  await evaluate(page, EIGHT)
  // A second file, created and opened the way a user does.
  await page.getByRole('button', { name: 'New file' }).first().click()
  await page.locator('input[placeholder="sketch.strudel"]').fill('second.strudel')
  await page.getByRole('button', { name: 'Create' }).click()
  const tab = page.locator('[data-workspace-tab]', { hasText: 'second.strudel' })
  if (!(await tab.isVisible().catch(() => false))) await page.locator('[data-file-tree-item*="second.strudel"]').first().dblclick()
  await expect(tab).toBeVisible()
  // Two bars: the 8-bar song's frame would read past 2 for most of each pass.
  // The new file's model is the empty one; seed it and prove it holds the song.
  const SECOND = 'setcps(1)\nsecond: arrange([1, s("bd*4")], [1, s("hh*8")])'
  await page.evaluate((code) => {
    const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getValue: () => string; setValue: (v: string) => void } | null }> } } }).monaco
    ;(m?.editor?.getEditors?.() ?? []).find((e) => e.getModel()?.getValue() === '')?.getModel()?.setValue(code)
  }, SECOND)
  await expect
    .poll(() =>
      page.evaluate((code) => {
        const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getValue: () => string } | null }> } } }).monaco
        return (m?.editor?.getEditors?.() ?? []).some((e) => e.getModel()?.getValue() === code)
      }, SECOND),
    )
    .toBe(true)
  await page.locator('.monaco-editor:visible').first().click()
  await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+Enter`)
  await expectPlayingOurSong(page)
  expectWrapped(await sample(page, 12, 500), 2, 'second file, drawer closed')
  // Back on the first file, which stopped when the second one played: nothing
  // plays there, so there is no position, and none of the second song's shows.
  await page.locator('[data-workspace-tab]', { hasText: 'pattern.strudel' }).click()
  await page.waitForTimeout(500)
  const back = await sample(page, 4, 300)
  console.log(`[#1726] back on the first file: ${back.map((r) => r.text).join(' · ')}`)
  for (const r of back) expect(r.cycle, `"${r.text}" shows no position`).toBeNull()
})
