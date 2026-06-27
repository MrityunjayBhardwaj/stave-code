/**
 * Per-track custom colour (Phase D, #581) — the user picks a colour for a track
 * and it OVERRIDES the deterministic palette in BOTH the Mixer and the Song
 * Timeline, consistently; it persists per file; and a rename carries it forward.
 *
 * AnviDev observe gate: unit tests cover the resolution (`trackIdentity` override,
 * `buildTimelineScene` override) + the store (`getTrackMetaMapSnapshot`); this
 * drives the REAL app end-to-end. Typed (not `setValue`) so the doc reaches the
 * file store both surfaces read.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function bootShell(page: Page, tab: 'musical-timeline' | 'mixer-console'): Promise<void> {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '360')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', t as string)
    } catch {
      /* ignore */
    }
  }, tab)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => ((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco?.editor?.getEditors?.()?.length ?? 0) > 0,
    { timeout: 20_000 },
  )
}

async function typeSongAndEval(page: Page, code: string): Promise<void> {
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${MOD}+A`)
  await page.keyboard.press('Backspace')
  await page.keyboard.type(code, { delay: 8 })
  await page.waitForTimeout(400)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2200)
}

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

/** A mixed doc: `bass:` (named → display `bass`/lane `d1`) + `$:` (anon → `d2`). */
const SONG = 'bass: s("bd*4")\n$: s("hh*8")'

async function openMixerTab(page: Page): Promise<void> {
  const root = page.locator('[data-bottom-panel="root"]')
  await root.locator('role=tab[name="Mixer"]').click()
  await root
    .locator('[data-bottom-panel-tab="mixer-console"] [data-mixer-strip-name]')
    .first()
    .waitFor({ timeout: 10_000 })
}

test('a custom colour overrides the palette in BOTH the Timeline and the Mixer (cross-view)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page, 'musical-timeline')
  await typeSongAndEval(page, SONG)

  // The named track's lane (identity stays d1; display name = `bass`).
  const laneDot = page.locator('[data-full-song-lane-dot="d1"]')
  await laneDot.waitFor({ timeout: 10_000 })
  const defaultRgb = await laneDot.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(defaultRgb).toMatch(/^rgb/)

  // Open the swatch and pick a palette colour DIFFERENT from the current default
  // (so we're proving the override, not a coincidental match).
  await laneDot.click()
  const popover = page.locator('[data-testid="track-swatch-popover"]')
  await popover.waitFor({ timeout: 5000 })
  const swatches = popover.locator('[data-musical-timeline="swatch-cell"]')
  const colors = await swatches.evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).getAttribute('data-color') ?? ''),
  )
  const chosenHex = colors.find((c) => hexToRgb(c) !== defaultRgb)!
  expect(chosenHex).toBeTruthy()
  const chosenRgb = hexToRgb(chosenHex)
  await popover.locator(`[data-color="${chosenHex}"]`).click()
  await page.waitForTimeout(600)

  // Timeline lane dot now shows the chosen colour …
  await expect
    .poll(() => laneDot.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe(chosenRgb)

  // … and an UNcoloured sibling (`d2`) still shows its deterministic palette colour.
  const d2Dot = page.locator('[data-full-song-lane-dot="d2"]')
  const d2Rgb = await d2Dot.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(d2Rgb).toMatch(/^rgb/)
  expect(d2Rgb).not.toBe(chosenRgb)

  // ── Cross-view: the Mixer strip for the same track shows the SAME colour.
  // Strips are keyed by name here (an anon strip's `id` is `#k`, NOT its display
  // `d2`); read every strip's {name, dot} and look up by display name.
  await openMixerTab(page)
  const mixer = page.locator('[data-bottom-panel-tab="mixer-console"]')
  const readStrips = (): Promise<Record<string, string>> =>
    mixer.locator('[data-mixer-strip-id]').evaluateAll((els) => {
      const out: Record<string, string> = {}
      for (const e of els) {
        const name = (e.querySelector('[data-mixer-strip-name]') as HTMLElement | null)?.textContent ?? ''
        const dot = e.querySelector('[data-mixer-strip-dot]') as HTMLElement | null
        if (name && dot) out[name] = getComputedStyle(dot).backgroundColor
      }
      return out
    })
  await expect.poll(async () => (await readStrips()).bass).toBe(chosenRgb)
  // The uncoloured strip stays on the palette (and equals its own lane colour).
  expect((await readStrips()).d2).toBe(d2Rgb)

  expect(errors, errors.join('\n')).toEqual([])
})

test('the custom colour persists across a reload (per-file Yjs)', async ({ page }) => {
  await bootShell(page, 'musical-timeline')
  await typeSongAndEval(page, SONG)

  const laneDot = page.locator('[data-full-song-lane-dot="d1"]')
  await laneDot.waitFor({ timeout: 10_000 })
  const defaultRgb = await laneDot.evaluate((el) => getComputedStyle(el).backgroundColor)

  await laneDot.click()
  const popover = page.locator('[data-testid="track-swatch-popover"]')
  await popover.waitFor({ timeout: 5000 })
  const colors = await popover
    .locator('[data-musical-timeline="swatch-cell"]')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).getAttribute('data-color') ?? ''))
  const chosenHex = colors.find((c) => hexToRgb(c) !== defaultRgb)!
  const chosenRgb = hexToRgb(chosenHex)
  await popover.locator(`[data-color="${chosenHex}"]`).click()
  await expect
    .poll(() => laneDot.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe(chosenRgb)

  // Reload — the doc + the override both live in the per-file Yjs doc (persisted
  // to IndexedDB). Re-eval so the timeline re-analyses, then the colour is back.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => ((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco?.editor?.getEditors?.()?.length ?? 0) > 0,
    { timeout: 20_000 },
  )
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2200)

  const laneDotAfter = page.locator('[data-full-song-lane-dot="d1"]')
  await laneDotAfter.waitFor({ timeout: 10_000 })
  await expect
    .poll(() => laneDotAfter.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe(chosenRgb)
})

test('renaming a coloured track carries the colour forward (override migrates)', async ({ page }) => {
  await bootShell(page, 'musical-timeline')
  await typeSongAndEval(page, SONG)

  const laneDot = page.locator('[data-full-song-lane-dot="d1"]')
  await laneDot.waitFor({ timeout: 10_000 })
  const defaultRgb = await laneDot.evaluate((el) => getComputedStyle(el).backgroundColor)

  // Colour the `bass` track.
  await laneDot.click()
  const popover = page.locator('[data-testid="track-swatch-popover"]')
  await popover.waitFor({ timeout: 5000 })
  const colors = await popover
    .locator('[data-musical-timeline="swatch-cell"]')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).getAttribute('data-color') ?? ''))
  const chosenHex = colors.find((c) => hexToRgb(c) !== defaultRgb)!
  const chosenRgb = hexToRgb(chosenHex)
  await popover.locator(`[data-color="${chosenHex}"]`).click()
  await expect
    .poll(() => laneDot.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe(chosenRgb)

  // Rename `bass` → `kick` from the Timeline lane.
  await page.locator('[data-full-song-lane="d1"] span').last().dblclick()
  const input = page.locator('[data-full-song-lane-rename="d1"]')
  await input.waitFor({ timeout: 5000 })
  await input.fill('kick')
  await input.press('Enter')
  await page.waitForTimeout(2000)

  // The lane is now `kick` AND keeps the chosen colour (migrated old→new key).
  await expect(page.locator('[data-full-song-lane="d1"] span').last()).toHaveText('kick')
  await expect
    .poll(() => laneDot.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe(chosenRgb)
})
