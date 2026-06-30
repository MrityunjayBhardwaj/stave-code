/**
 * #641 — the Song Timeline highlights the lane whose track the editor caret sits
 * in. The caret is the single selection bus (V-mixer-18): moving it into a
 * track's code selects that lane; the matching Mixer strip selects too (#639).
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function bootShell(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '340')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => ((window as any).monaco?.editor?.getEditors?.()?.length ?? 0) > 0,
    { timeout: 20_000 },
  )
}

async function typeSongAndEval(page: Page, code: string): Promise<void> {
  await page.evaluate(() => {
    const eds = (window as any).monaco?.editor?.getEditors?.() ?? []
    const t = eds.find((e: any) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    t?.focus()
  })
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${MOD}+A`)
  await page.keyboard.press('Backspace')
  await page.keyboard.type(code, { delay: 8 })
  await page.waitForTimeout(400)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1800)
}

async function caretToLine(page: Page, line: number): Promise<void> {
  await page.evaluate((ln) => {
    const eds = (window as any).monaco?.editor?.getEditors?.() ?? []
    const t = eds.find((e: any) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    t?.focus()
    t?.setPosition({ lineNumber: ln, column: 1 })
  }, line)
  await page.waitForTimeout(150)
}

async function selectedLaneKey(page: Page): Promise<string | null> {
  const sel = page.locator('[data-full-song-lane-selected]')
  if ((await sel.count()) === 0) return null
  return sel.first().getAttribute('data-full-song-lane-selected')
}

const SONG = ['bass: s("bd*4")', 'lead: note("c e g")', '$: s("hh*8")'].join('\n')

test('the editor caret selects the matching Song Timeline lane', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  await typeSongAndEval(page, SONG)
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })

  // Caret in each track's line selects exactly that one lane. Named tracks keep
  // the positional laneKey d{N} (#579 STEP 2): bass=d1, lead=d2, hh=d3.
  await caretToLine(page, 1)
  expect(await page.locator('[data-full-song-lane-selected]').count()).toBe(1)
  expect(await selectedLaneKey(page)).toBe('d1')

  await caretToLine(page, 2)
  expect(await page.locator('[data-full-song-lane-selected]').count()).toBe(1)
  expect(await selectedLaneKey(page)).toBe('d2')

  await caretToLine(page, 3)
  expect(await selectedLaneKey(page)).toBe('d3')

  // The selected lane carries the accent vocabulary (left bar + faint fill).
  const box = await page
    .locator('[data-full-song-lane-selected]')
    .first()
    .evaluate((el) => getComputedStyle(el).boxShadow)
  expect(box).not.toBe('none')

  expect(errors).toEqual([])
})

test('clicking a timeline lane moves the caret, which selects that lane (bidirectional loop)', async ({ page }) => {
  await bootShell(page)
  await typeSongAndEval(page, SONG)
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })

  // Start with the caret on line 1 → d1 selected.
  await caretToLine(page, 1)
  expect(await selectedLaneKey(page)).toBe('d1')

  // Click the d3 lane header → #610 reveals its code (moves the caret) → the
  // caret-driven selection lands on d3.
  await page.locator('[data-full-song-lane-select="d3"]').click()
  await page.waitForTimeout(200)
  expect(await selectedLaneKey(page)).toBe('d3')
})
