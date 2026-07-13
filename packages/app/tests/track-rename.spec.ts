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

  // Assert the WHOLE document, never a substring (#877). `toContain('drums: …')`
  // was TRUE of a document in which the rename had ALSO duplicated this track and
  // doubled the next one's label — so the assertion could not fail on the exact
  // corruption an edit path is most likely to produce. One gesture = one write,
  // to one track, and every other byte untouched.
  expect(await strudelSource(page)).toBe('drums: s("bd*4")\n$: s("hh*8")')
  // … and the strip re-resolves to it, the sibling keeping its own identity.
  await expect(mixer.locator('[data-mixer-strip-name]')).toHaveText(['drums', 'd2'])
  expect(errors, errors.join('\n')).toEqual([])
})

test('Mixer: a rename commits ONCE — blur after Enter must not write again (#877)', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page, 'mixer-console')
  await typeSongAndEval(page, '$: s("bd*4")\n$: s("hh*8")')

  const mixer = page.locator('[data-bottom-panel-tab="mixer-console"]')
  await mixer.locator('[data-mixer-strip-name]').first().dblclick()
  const input = mixer.locator('[data-mixer-strip-rename]')
  await input.waitFor({ timeout: 5000 })
  await input.fill('drums')
  await input.press('Enter')
  // Click away as well: Enter already settled the gesture, so this must NOT commit
  // a second time. A second write would resolve the now-stale strip id (`#0`) onto
  // the OTHER anonymous track — renaming it too — and the doc would carry two
  // `drums:` labels.
  await page.locator('.monaco-editor').first().click()
  await page.waitForTimeout(1500)

  expect(await strudelSource(page)).toBe('drums: s("bd*4")\n$: s("hh*8")')
  expect(errors, errors.join('\n')).toEqual([])
})

test('Mixer: Escape abandons the rename — no write, even after the field blurs', async ({
  page,
}) => {
  await bootShell(page, 'mixer-console')
  await typeSongAndEval(page, '$: s("bd*4")\n$: s("hh*8")')

  const mixer = page.locator('[data-bottom-panel-tab="mixer-console"]')
  await mixer.locator('[data-mixer-strip-name]').first().dblclick()
  const input = mixer.locator('[data-mixer-strip-rename]')
  await input.waitFor({ timeout: 5000 })
  await input.fill('drums')
  await input.press('Escape')
  await page.locator('.monaco-editor').first().click()
  await page.waitForTimeout(1000)

  expect(await strudelSource(page)).toBe('$: s("bd*4")\n$: s("hh*8")') // untouched
})

test('Timeline: rename a named lane replaces the label and updates the view', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page, 'musical-timeline')
  await typeSongAndEval(page, 'bass: s("bd*4")\n$: s("hh*8")')

  // A NAMED track's lane is keyed by its label; only an anonymous one is keyed
  // positionally (`d{N}`). The spec used to address this lane as `d1` and so could
  // never find it — a stale locator that hid the rename path from the gate.
  const lane = page.locator('[data-full-song-lane="bass"]')
  await lane.waitFor({ timeout: 10_000 })
  await expect(lane.locator('span').last()).toHaveText('bass')

  await lane.locator('span').last().dblclick()
  const input = page.locator('[data-full-song-lane-rename="bass"]')
  await input.waitFor({ timeout: 5000 })
  await input.fill('kick')
  await input.press('Enter')
  await page.waitForTimeout(1800)

  // Whole document (#877) — a substring assertion cannot fail on a duplicated
  // statement or a doubled sibling label.
  expect(await strudelSource(page)).toBe('kick: s("bd*4")\n$: s("hh*8")')
  await expect(page.locator('[data-full-song-lane="kick"] span').last()).toHaveText('kick')
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

test('Mixer: renaming to a name another track already uses is rejected (#585)', async ({ page }) => {
  await bootShell(page, 'mixer-console')
  await typeSongAndEval(page, 'bass: s("bd*4")\nlead: s("hh*8")')

  const mixer = page.locator('[data-bottom-panel-tab="mixer-console"]')
  const firstName = mixer.locator('[data-mixer-strip-name]').first()
  await expect(firstName).toHaveText('bass')

  await firstName.dblclick()
  const input = mixer.locator('[data-mixer-strip-rename]')
  await input.waitFor({ timeout: 5000 })
  await input.fill('lead') // collides with the existing lead: track
  await input.press('Enter')
  await page.waitForTimeout(1000)

  // No write — the duplicate is rejected, the code keeps both distinct labels …
  expect(await strudelSource(page)).toBe('bass: s("bd*4")\nlead: s("hh*8")')
  // … and the strip still reads its original name.
  await expect(mixer.locator('[data-mixer-strip-name]').first()).toHaveText('bass')
})

test('Timeline: renaming a lane to a sibling lane’s name is rejected (#585)', async ({ page }) => {
  await bootShell(page, 'musical-timeline')
  await typeSongAndEval(page, 'bass: s("bd*4")\nlead: s("hh*8")')

  const lane = page.locator('[data-full-song-lane="bass"]') // named → keyed by label
  await lane.waitFor({ timeout: 10_000 })
  await expect(lane.locator('span').last()).toHaveText('bass')

  await lane.locator('span').last().dblclick()
  const input = page.locator('[data-full-song-lane-rename="bass"]')
  await input.waitFor({ timeout: 5000 })
  await input.fill('lead') // collides with the existing lead: lane
  await input.press('Enter')
  await page.waitForTimeout(1500)

  expect(await strudelSource(page)).toBe('bass: s("bd*4")\nlead: s("hh*8")') // unchanged
  await expect(page.locator('[data-full-song-lane="bass"] span').last()).toHaveText('bass')
})
