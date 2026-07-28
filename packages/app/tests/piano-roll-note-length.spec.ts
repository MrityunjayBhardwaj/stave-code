/**
 * Piano roll — a fractional note is drawn, and drawn for the time it sounds (#1074).
 *
 * WHY A BROWSER TEST. The defect was invisibility: `noteAt` tested an INTEGER step against
 * `[start, start + duration)`, so `f4` at start 0.5 for 0.5 spans `[0.5, 1.0)`, contains no
 * integer, and was drawn in no column at all while sounding perfectly. A model-level test
 * would have gone green on it — the note is in `model.notes` the whole time. The claim is
 * about rendered geometry, so it is checked where the pixels are ([[PV245]]).
 *
 * The fixture is the corpus mini the sweep found it on, not a constructed case.
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
    target.setPosition({ lineNumber: 1, column: 1 })
    target.focus()
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(250)
}

async function openRoll(page: Page) {
  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('[data-bottom-panel="toggle"]').click()
  await drawer.locator('role=tab[name="Pattern"]').click()
  return drawer
}

test.describe('the roll draws a fractional note (#1074)', () => {
  test('a note starting mid-column is drawn at all, and in the right half of it', async ({ page }) => {
    await boot(page)
    // the corpus mini the sweep found this on: `f4` starts at column 0.5 for 0.5 columns
    await setStrudelCode(page, '$: note("[c5@0.5 f4@0.5 f5@3]")')
    await openRoll(page)

    const fills = page.locator('[data-roll-fill]')
    await expect(fills.first()).toBeVisible()

    // every drawn note, as {left, width} percentages off the rendered style
    const drawn = await fills.evaluateAll((els) =>
      els.map((el) => ({
        left: (el as HTMLElement).style.left,
        width: (el as HTMLElement).style.width,
      })),
    )
    console.log(`\n  roll fills: ${JSON.stringify(drawn)}`)

    // A note beginning halfway through its column must be drawn beginning halfway
    // through its box. Before the fix there was no such element at all — the note
    // was in the model, sounded, and had no pixels.
    const halfStarted = drawn.filter((d) => d.left.startsWith('50'))
    expect(halfStarted.length, 'a note starting mid-column must be drawn offset into it').toBeGreaterThan(0)

    // and it occupies half the column, not all of it
    expect(halfStarted.some((d) => d.width.startsWith('50'))).toBe(true)
  })

  test('an ordinary whole-column note is unchanged — full width, no offset', async ({ page }) => {
    // The control arm: the 4825 of 4842 corpus notes that needed nothing must still
    // look exactly as they did.
    await boot(page)
    await setStrudelCode(page, '$: note("c4 e4 g4 c5")')
    await openRoll(page)

    const fills = page.locator('[data-roll-fill]')
    await expect(fills.first()).toBeVisible()
    const drawn = await fills.evaluateAll((els) =>
      els.map((el) => `${(el as HTMLElement).style.left}|${(el as HTMLElement).style.width}`),
    )
    console.log(`  control fills: ${JSON.stringify(drawn)}`)
    expect(drawn.length).toBe(4)
    for (const d of drawn) expect(d).toBe('0%|100%')
  })

  test('a held note still reads as one note — head solid, carried columns dimmed', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c4@3 e4")')
    await openRoll(page)

    const fills = page.locator('[data-roll-fill]')
    await expect(fills.first()).toBeVisible()
    const sustains = await page.locator('[data-roll-fill][data-roll-sustain="true"]').count()
    console.log(`  held note: ${await fills.count()} fills, ${sustains} carried`)
    // c4 spans three columns: one head plus two carried, then e4's own head
    expect(sustains).toBe(2)

    const headOpacity = await fills.first().evaluate((el) => getComputedStyle(el).opacity)
    const heldOpacity = await page
      .locator('[data-roll-fill][data-roll-sustain="true"]')
      .first()
      .evaluate((el) => getComputedStyle(el).opacity)
    expect(Number(heldOpacity)).toBeLessThan(Number(headOpacity))
  })
})
