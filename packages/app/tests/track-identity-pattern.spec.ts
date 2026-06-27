/**
 * Track identity in the Pattern tab (#589, Phase E).
 *
 * The pianoroll/sequencer edit ONE track (the chunk under the cursor). This
 * proves the identity chip shows that track's name + colour — the SAME values
 * the Mixer/Timeline show — and offers the same recolour + rename affordances:
 *   - chip shows the bound track's name in BOTH the sequencer and the pianoroll;
 *   - recolour from the chip shows up in the Mixer console (cross-view);
 *   - rename from the chip writes the `name:` label into the code;
 *   - the sequencer no longer renders per-voice colour dots.
 */
import { test, expect, type Page } from '@playwright/test'

// A named drum track (→ sequencer) + a named melodic track (→ pianoroll).
const SONG = 'bass: s("bd sd hh")\nlead: note("c e g")'

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

async function bootPattern(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '360')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'pattern')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => ((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco?.editor?.getEditors?.()?.length ?? 0) > 0,
    { timeout: 20_000 },
  )
}

async function setStrudelCode(page: Page, code: string): Promise<void> {
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
  await page.waitForTimeout(200)
}

async function strudelValue(page: Page): Promise<string> {
  return page.evaluate(() => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; getValue: () => string } | null
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    return target?.getModel()?.getValue() ?? ''
  })
}

/** Put the cursor on the first occurrence of `needle` in the strudel model. */
async function placeCursorOn(page: Page, needle: string): Promise<void> {
  const ok = await page.evaluate((needle) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getValue: () => string; getLineCount: () => number; getLineContent: (n: number) => string } | null
      focus: () => void
      setPosition: (p: { lineNumber: number; column: number }) => void
    }>
    const t = editors.find((e) => e.getModel()?.getValue?.().includes(needle)) ?? editors[0]
    const m = t?.getModel()
    if (!m) return false
    for (let ln = 1; ln <= m.getLineCount(); ln++) {
      const idx = m.getLineContent(ln).indexOf(needle)
      if (idx >= 0) {
        t.focus()
        t.setPosition({ lineNumber: ln, column: idx + 2 })
        return true
      }
    }
    return false
  }, needle)
  expect(ok).toBe(true)
  await page.waitForTimeout(150)
}

const chip = (page: Page) => page.locator('[data-pattern-track-chip]')

test('the identity chip shows the bound track name in both the sequencer and the pianoroll', async ({ page }) => {
  await bootPattern(page)
  await setStrudelCode(page, SONG)

  // Cursor in the drum track → sequencer → chip reads "bass".
  await placeCursorOn(page, 'bass')
  await expect(page.locator('[data-bottom-panel-tab="sequencer"]')).toBeVisible()
  await expect(chip(page).locator('[data-pattern-track-name]')).toHaveText('bass')
  const dotRgb = await chip(page).locator('[data-pattern-track-dot]').evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(dotRgb).toMatch(/^rgb/)

  // Cursor in the melodic track → pianoroll → chip reads "lead".
  await placeCursorOn(page, 'lead')
  await expect(page.locator('[data-bottom-panel-tab="piano-roll"]')).toBeVisible()
  await expect(chip(page).locator('[data-pattern-track-name]')).toHaveText('lead')
})

test('recolouring from the chip shows the same colour on the Mixer strip (cross-view)', async ({ page }) => {
  await bootPattern(page)
  await setStrudelCode(page, SONG)
  await placeCursorOn(page, 'bass')

  const dot = chip(page).locator('[data-pattern-track-dot]')
  const defaultRgb = await dot.evaluate((el) => getComputedStyle(el).backgroundColor)

  await dot.click()
  const popover = page.locator('[data-mixer-strip-color-popover]')
  await popover.waitFor({ timeout: 5000 })
  const colors = await popover
    .locator('[data-mixer-strip-swatch]')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).getAttribute('data-color') ?? ''))
  const chosenHex = colors.find((c) => hexToRgb(c) !== defaultRgb)!
  const chosenRgb = hexToRgb(chosenHex)
  await popover.locator(`[data-mixer-strip-swatch][data-color="${chosenHex}"]`).click()
  await expect.poll(() => dot.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(chosenRgb)

  // Cross-view: the Mixer console strip for the same track shows the same colour.
  const root = page.locator('[data-bottom-panel="root"]')
  await root.locator('role=tab[name="Mixer"]').click()
  const mixer = page.locator('[data-bottom-panel-tab="mixer-console"]')
  const readBass = (): Promise<string | undefined> =>
    mixer.locator('[data-mixer-strip-id]').evaluateAll((els) => {
      for (const e of els) {
        const name = (e.querySelector('[data-mixer-strip-name]') as HTMLElement | null)?.textContent ?? ''
        const d = e.querySelector('[data-mixer-strip-dot]') as HTMLElement | null
        if (name === 'bass' && d) return getComputedStyle(d).backgroundColor
      }
      return undefined
    })
  await expect.poll(readBass).toBe(chosenRgb)
})

test('renaming from the chip writes the name: label into the code', async ({ page }) => {
  await bootPattern(page)
  await setStrudelCode(page, SONG)
  await placeCursorOn(page, 'bass')

  await chip(page).locator('[data-pattern-track-name]').dblclick()
  const input = chip(page).locator('[data-pattern-track-rename]')
  await input.waitFor({ timeout: 5000 })
  await input.fill('kick')
  await input.press('Enter')
  await page.waitForTimeout(400)

  expect(await strudelValue(page)).toContain('kick:')
  await expect(chip(page).locator('[data-pattern-track-name]')).toHaveText('kick')
})

test('the sequencer no longer renders per-voice colour dots', async ({ page }) => {
  await bootPattern(page)
  await setStrudelCode(page, SONG)
  await placeCursorOn(page, 'bass')
  await expect(page.locator('[data-bottom-panel-tab="sequencer"]')).toBeVisible()
  // Voice labels remain (you must tell the rows apart) …
  await expect(page.locator('[data-seq-voice]').first()).toBeVisible()
  // … but the per-voice colour dots are gone (#589).
  await expect(page.locator('[data-seq-voice-dot]')).toHaveCount(0)
})
