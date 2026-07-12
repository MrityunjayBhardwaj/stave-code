/**
 * Seek does not move the song's note marks (#863) — Playwright observation spec.
 *
 * AnviDev observe gate: the engine unit test pins the seam (`getTimelineEvents`
 * reads the SONG-frame patterns, `getTrackSchedulers` keeps the shifted ones);
 * this drives the REAL app end-to-end through the REAL gesture.
 *
 * A seek re-evaluates with every captured pattern wrapped in
 * `.late(transportOffset)` so audio + the live playhead stay in one scheduler
 * frame. The STATIC marks have the opposite requirement — they're drawn on a
 * song-absolute axis inside lanes derived from the (unshifted) IR — so querying
 * the shifted patterns rotated the loop under the lanes: with `<c3 e3 g3 a3>`,
 * c3 slid from cycle 0 to cycle ~3.06 and every other note followed.
 *
 * The base canvas (`data-full-song-canvas`) draws the density + note marks ONLY
 * — the live overlay and the playhead are separate layers — so its pixels are a
 * direct readout of the marks. They must be IDENTICAL across a seek.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '320')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 20_000 },
  )
  // #872 — the editor's content is a CONTROLLED value fed by the async project
  // file load. Seeding before that lands lets it overwrite our code, and the app
  // evaluates the STARTER example instead (silently: the spec still runs, just
  // against the wrong song). Wait for the load: the model goes empty → file.
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getValue?: () => string } | null }> } } }).monaco
      const eds = m?.editor?.getEditors?.() ?? []
      return eds.some((e) => (e.getModel()?.getValue?.()?.length ?? 0) > 0)
    },
    { timeout: 20_000 },
  )
}

async function evalCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    if (!target) return false
    target.getModel()?.setValue(c)
    target.focus()
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(150)
  await page.keyboard.press(`${MOD}+Enter`)
}

/** The base canvas's pixels — the drawn density + note marks. */
const readCanvas = (page: Page) =>
  page.locator('[data-full-song-canvas]').evaluate((el) => (el as HTMLCanvasElement).toDataURL())

test('a seek leaves the song timeline marks where they are', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await boot(page)
  // One distinct pitch per cycle: any time-shift rotates the staircase, which
  // shows up as different canvas pixels.
  await evalCode(page, '$: note("<c3 e3 g3 a3>")')
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })
  await expect(page.locator('[data-full-song-lane]')).toHaveCount(1, { timeout: 10_000 })
  await page.waitForTimeout(2000)

  const before = await readCanvas(page)

  // REAL GESTURE — click the ruler at mid-song, which the timeline inverts to a
  // target cycle and hands to `runtime.seekTo` (offset + re-eval).
  const ruler = page.locator('[data-full-song="ruler-area"]')
  const box = await ruler.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height / 2)
  // Let the seek's re-eval land and the canvas redraw against it.
  await page.waitForTimeout(2500)

  const after = await readCanvas(page)

  // The marks are song-absolute: the seek moved the playhead, not the notes.
  expect(after).toBe(before)
  expect(errors).toEqual([])
})
