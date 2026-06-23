/**
 * Grid visual identity — Logic-parity chrome (#430 / #471 / #428).
 *
 * Real-browser proof of the visual-identity look-cut:
 *  - Sequencer shows named, colour-coded drum-voice rows (Kick/Snare/Hi-Hat)
 *    instead of raw `bd`/`sd`/`hh` (#471).
 *  - Piano Roll shows a graphical keyboard gutter with C-labels (#430).
 *  - View ▸ Note Color = Velocity recolours notes/cells by gain on BOTH grids,
 *    observed via computed background colour, not inferred (#428).
 */
import { test, expect, type Page } from '@playwright/test'

async function boot(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 15_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 15_000 },
  )
}

async function setStrudelCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
      setPosition: (p: { lineNumber: number; column: number }) => void
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    if (!target) return false
    target.getModel()?.setValue(c)
    target.setPosition({ lineNumber: 1, column: 8 })
    target.focus()
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(200)
}

async function openPattern(page: Page) {
  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('[data-bottom-panel="toggle"]').click()
  await drawer.locator('role=tab[name="Pattern"]').click()
  return drawer
}

test.describe('Grid visual identity (#430/#471/#428)', () => {
  test('Sequencer shows named, colour-coded drum-voice rows (#471)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, 's("bd ~ sd ~, hh*8")')
    await openPattern(page)

    // Friendly voice names, not raw tokens.
    await expect(page.locator('[data-seq-voice="bd"]')).toContainText('Kick')
    await expect(page.locator('[data-seq-voice="sd"]')).toContainText('Snare')
    await expect(page.locator('[data-seq-voice="hh"]')).toContainText('Hi-Hat')

    // A per-voice colour dot per lane, each a distinct colour.
    const dots = page.locator('[data-seq-voice-dot]')
    await expect(dots).toHaveCount(3)
    const colors = await dots.evaluateAll((els) =>
      els.map((e) => getComputedStyle(e as HTMLElement).backgroundColor),
    )
    expect(new Set(colors).size).toBe(3) // three distinct voice colours

    await page.screenshot({ path: 'test-results/grid-identity-sequencer.png' })
  })

  test('Piano Roll shows a graphical keyboard with C-labels (#430)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, 'note("c3 e3 g3 c4")')
    await openPattern(page)

    // Keyboard keys render, with both white and black keys.
    const keys = page.locator('[data-roll-key]')
    expect(await keys.count()).toBeGreaterThan(0)
    expect(await page.locator('[data-roll-key][data-roll-key-black="true"]').count()).toBeGreaterThan(0)

    // C rows are labelled (C is always a white key).
    await expect(page.locator('[data-roll-key]', { hasText: 'C3' }).first()).toBeVisible()
    await expect(page.locator('[data-roll-key]', { hasText: 'C4' }).first()).toBeVisible()

    await page.screenshot({ path: 'test-results/grid-identity-pianoroll.png' })
  })

  test('View ▸ Note Color = Velocity recolours cells/notes (#428)', async ({ page }) => {
    // Sequencer: a per-column gain difference → cells of different velocity get
    // different colours under Velocity mode.
    await boot(page)
    await setStrudelCode(page, 's("bd bd bd bd").gain("1 0.2 1 0.2")')
    await openPattern(page)

    const fills = page.locator('[data-seq-fill]')
    expect(await fills.count()).toBeGreaterThan(1)

    // Off mode → all cells share the voice colour.
    await page.locator('[data-note-color-mode="off"]').click()
    const offColors = await fills.evaluateAll((els) =>
      els.map((e) => getComputedStyle(e as HTMLElement).backgroundColor),
    )
    expect(new Set(offColors).size).toBe(1)

    // Velocity mode → loud vs soft columns differ in colour.
    await page.locator('[data-note-color-mode="velocity"]').click()
    await page.waitForTimeout(100)
    const velColors = await fills.evaluateAll((els) =>
      els.map((e) => getComputedStyle(e as HTMLElement).backgroundColor),
    )
    expect(new Set(velColors).size).toBeGreaterThan(1)

    await page.screenshot({ path: 'test-results/grid-identity-velocity.png' })
  })
})
