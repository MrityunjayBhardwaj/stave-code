/**
 * Solo writes the `_` mute markers into the code (#735): soloing a track mutes
 * every other track in the SOURCE and un-mutes the soloed one, and un-soloing
 * RESTORES the mutes that were set by hand before solo (so a pre-existing mute
 * survives the round-trip). Drives the real Mixer solo button and reads the
 * Strudel source back.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '360')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
    } catch { /* ignore */ }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => ((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco?.editor?.getEditors?.()?.length ?? 0) > 0,
    { timeout: 20_000 },
  )
}

async function typeSong(page: Page, code: string): Promise<void> {
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${MOD}+A`)
  await page.keyboard.press('Backspace')
  await page.keyboard.type(code, { delay: 6 })
  await page.waitForTimeout(300)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1200)
}

function source(page: Page): Promise<string> {
  return page.evaluate(() => {
    const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; getValue: () => string } | null }> } } }).monaco
    const eds = m?.editor?.getEditors?.() ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    return t?.getModel()?.getValue() ?? ''
  })
}

const root = (page: Page) => page.locator('[data-bottom-panel="root"]')
const openMixer = (page: Page) => root(page).locator('role=tab[name="Mixer"]').click()
const solo = (page: Page, id: string) =>
  root(page).locator(`[data-bottom-panel-tab="mixer-console"] [data-mixer-strip-id="${id}"] [data-mixer-strip-solo]`).click()

test('solo mutes the other tracks in code; un-solo restores; hand-set mute survives', async ({ page }) => {
  await boot(page)
  await typeSong(page, 'd1: s("bd*4")\nd2: s("hh*8")\nd3: s("cp*2")')
  await openMixer(page)

  // ── Solo d2 → the OTHER tracks get `_` in the source; d2 stays bare. ──
  await solo(page, 'd2')
  await page.waitForTimeout(400)
  expect((await source(page)).split('\n')).toEqual([
    '_d1: s("bd*4")',
    'd2: s("hh*8")',
    '_d3: s("cp*2")',
  ])

  // ── Un-solo → the markers are removed, back to the original. ──
  await solo(page, 'd2')
  await page.waitForTimeout(400)
  expect((await source(page)).split('\n')).toEqual([
    'd1: s("bd*4")',
    'd2: s("hh*8")',
    'd3: s("cp*2")',
  ])

  // ── Hand-set mute survives a solo round-trip. ──
  // Mute d1 by hand (its mute button), then solo d2, then un-solo d2.
  await root(page).locator('[data-bottom-panel-tab="mixer-console"] [data-mixer-strip-id="d1"] [data-mixer-strip-mute]').click()
  await page.waitForTimeout(300)
  expect((await source(page)).split('\n')[0]).toBe('_d1: s("bd*4")')

  await solo(page, 'd2') // solo: d1 already muted, d3 gets muted, d2 audible
  await page.waitForTimeout(400)
  expect((await source(page)).split('\n')).toEqual([
    '_d1: s("bd*4")',
    'd2: s("hh*8")',
    '_d3: s("cp*2")',
  ])

  await solo(page, 'd2') // un-solo: restore snapshot {d1} → d1 STAYS muted, d3 un-muted
  await page.waitForTimeout(400)
  expect((await source(page)).split('\n')).toEqual([
    '_d1: s("bd*4")',
    'd2: s("hh*8")',
    'd3: s("cp*2")',
  ])
})
