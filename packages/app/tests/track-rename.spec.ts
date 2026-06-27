/**
 * Track rename (#580, Phase C) — inline rename writes the `name:` label into the
 * code, from BOTH the Mixer strip and the Song Timeline lane. Observe gate:
 * unit tests cover `renameEdit`; this drives the REAL app — double-click → type
 * → the source relabels and the views re-resolve the new name.
 *
 * Typed (not setValue) so the doc reaches the file store both surfaces read.
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
  await page.waitForTimeout(2000)
}

function strudelSource(page: Page): Promise<string> {
  return page.evaluate(() => {
    const eds = ((window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; getValue: () => string } | null }> } } }).monaco?.editor?.getEditors?.()) ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    return t?.getModel()?.getValue() ?? ''
  })
}

test('Mixer: rename an anonymous $: strip inserts a name: label into the code', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page, 'mixer-console')
  await typeSongAndEval(page, '$: s("bd*4")\n$: s("hh*8")')

  const root = page.locator('[data-bottom-panel="root"]')
  const mixer = root.locator('[data-bottom-panel-tab="mixer-console"]')
  const firstName = mixer.locator('[data-mixer-strip-name]').first()
  await expect(firstName).toHaveText('d1') // anonymous → positional d{N}

  await firstName.dblclick()
  const input = mixer.locator('[data-mixer-strip-rename]')
  await input.waitFor({ timeout: 5000 })
  await input.fill('drums')
  await input.press('Enter')
  await page.waitForTimeout(1500)

  // The code now carries the label …
  expect(await strudelSource(page)).toContain('drums: s("bd*4")')
  // … and the strip re-resolves to it.
  await expect(mixer.locator('[data-mixer-strip-name]').first()).toHaveText('drums')
  expect(errors, errors.join('\n')).toEqual([])
})

test('Timeline: rename a named lane replaces the label and updates the view', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page, 'musical-timeline')
  await typeSongAndEval(page, 'bass: s("bd*4")\n$: s("hh*8")')

  const lane = page.locator('[data-full-song-lane="d1"]')
  await lane.waitFor({ timeout: 10_000 })
  await expect(lane.locator('span').last()).toHaveText('bass')

  await lane.locator('span').last().dblclick()
  const input = page.locator('[data-full-song-lane-rename="d1"]')
  await input.waitFor({ timeout: 5000 })
  await input.fill('kick')
  await input.press('Enter')
  await page.waitForTimeout(1800)

  expect(await strudelSource(page)).toContain('kick: s("bd*4")')
  await expect(page.locator('[data-full-song-lane="d1"] span').last()).toHaveText('kick')
  expect(errors, errors.join('\n')).toEqual([])
})

test('an invalid name is rejected — the code is unchanged', async ({ page }) => {
  await bootShell(page, 'mixer-console')
  await typeSongAndEval(page, '$: s("bd*4")')

  const mixer = page.locator('[data-bottom-panel-tab="mixer-console"]')
  await mixer.locator('[data-mixer-strip-name]').first().dblclick()
  const input = mixer.locator('[data-mixer-strip-rename]')
  await input.waitFor({ timeout: 5000 })
  await input.fill('2bad name')
  await input.press('Enter')
  await page.waitForTimeout(800)

  const src = await strudelSource(page)
  expect(src).toBe('$: s("bd*4")') // no write — still anonymous
})
