/**
 * Full-song view: muted (`_`) tracks keep their own lane (#737).
 *
 * Mute is a `_` prefix on the statement label (`$:`→`_$:`). The marker is a
 * DISPLAY concern, orthogonal to a track's identity — but the lane-identity
 * deriver used to bake it into the `trackId`, so every muted anon `_$:` collapsed
 * onto the single id `_$` and the whole group rendered as ONE lane. #737 strips
 * the marker before deriving identity (mirroring the display deriver), so a muted
 * track keeps its positional slot and just reads as silenced.
 *
 * This spec drives the REAL flow — load source carrying `_` markers (exactly what
 * a Mixer mute / a #736 solo writes), eval, read the rendered lane headers — and
 * asserts THREE distinct lanes survive. Pre-fix the muted pair collapse to one.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const STORAGE_KEYS = {
  height: 'stave:bottomPanel.height',
  open: 'stave:bottomPanel.open',
  activeTabId: 'stave:bottomPanel.activeTabId',
} as const

// Three anon `$:` tracks; the middle two carry the `_` mute marker. Pre-fix all
// three (well, the two muted) collapse to a single `_$` lane.
const CODE = `setcps(130/240)

$: s("bd*4").gain(0.5)

_$: s("hh*8").gain(0.3)

_$: s("~ cp ~ cp").gain(0.4)
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

test('#737 — two muted `_$:` tracks stay as separate lanes (no collapse)', async ({ page }) => {
  await preOpenDrawer(page)
  await bootShell(page)
  await loadCode(page, CODE)
  await page.waitForTimeout(600)
  await evalStrudel(page)
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })

  const headers = page.locator('[data-full-song-lane-select]')
  // Three source tracks → three lanes; the two muted ones must NOT merge.
  await expect(headers).toHaveCount(3)

  const keys = await headers.evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-full-song-lane-select')),
  )
  // Every lane key is distinct — the `_` marker is stripped so the muted pair
  // fall on positional `d2`/`d3` rather than a shared `_$`.
  expect(new Set(keys).size).toBe(3)
})
