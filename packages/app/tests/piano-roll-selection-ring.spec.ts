/**
 * Piano roll — selecting a note must LOOK different (#1077).
 *
 * WHY A PIXEL COMPARISON AND NOT AN ATTRIBUTE CHECK. The ring broke while every existing
 * assertion about it stayed green, because those assertions ask the DOM: `copy-paste.spec`
 * checks `data-roll-selected="true"`, which was true the whole time. The ring was an inset
 * `box-shadow` on the cell; #1074 moved the note into a child span, and a child paints
 * above an inset shadow — so the flag, the computed style and the gesture were all correct
 * and the user saw nothing. The only statement that can fail on that is one about pixels.
 *
 * The comparison is a cell against ITSELF, selected and not, so it needs no reference
 * image and no image library: two screenshots of the same box either differ or they do
 * not.
 *
 * THE CONTROL ARM. An EMPTY selected cell was never broken — its ring was always visible
 * because there is no note to cover it. It is asserted here too, and it is the arm that
 * shows the method can see a ring at all: if the note test ever fails while this one still
 * passes, that is the #1077 shape returning, not a broken harness.
 */
import { test, expect, type Page, type Locator } from '@playwright/test'

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
  await page.waitForTimeout(300)
}

async function openRoll(page: Page): Promise<Locator> {
  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('[data-bottom-panel="toggle"]').click()
  await drawer.locator('role=tab[name="Pattern"]').click()
  await page.waitForTimeout(300)
  return drawer
}

/** does selecting this cell change what is drawn in it? */
async function looksDifferentWhenSelected(page: Page, cell: string): Promise<boolean> {
  const target = page.locator(`[data-roll-cell="${cell}"]`)
  await expect(target).toBeVisible()
  const before = await target.screenshot()
  // ⌘/Ctrl-click selects without editing — the real gesture (#528)
  await target.click({ modifiers: ['Meta'] })
  await expect(target).toHaveAttribute('data-roll-selected', 'true')
  const after = await target.screenshot()
  return !before.equals(after)
}

test.describe('the selection ring is visible on a note (#1077)', () => {
  // Each claim gets its own test rather than sharing one body: a failing assertion ends
  // the test, so a second assertion after it is never evidence for anything. Breaking the
  // fix must be able to redden BOTH, and both were confirmed to.
  test('a selected note is drawn differently from the same note unselected', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c4 e4 g4 c5")')
    await openRoll(page)

    // e4 at column 1 — an ordinary whole-column note, i.e. the 4825-of-4842 case
    expect(
      await looksDifferentWhenSelected(page, '64:1'),
      'selecting a note must change what the cell looks like',
    ).toBe(true)
  })

  test('the ring paints above the note fill — it is the cell last child', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c4 e4 g4 c5")')
    await openRoll(page)

    await page.locator('[data-roll-cell="64:1"]').click({ modifiers: ['Meta'] })
    await expect(page.locator('[data-roll-cell="64:1"]')).toHaveAttribute('data-roll-selected', 'true')

    // This is the mechanism, stated separately from the appearance: paint order inside a
    // cell is DOM order, so the ring being last is what keeps it above the note.
    const isLast = await page.evaluate(() => {
      const c = document.querySelector('[data-roll-cell="64:1"]')
      return c?.lastElementChild?.hasAttribute('data-roll-selection') ?? false
    })
    expect(isLast, 'the ring must paint above the note fill, not under it').toBe(true)
  })

  test('control: a selected EMPTY cell was never broken and still reads as selected', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c4 e4 g4 c5")')
    await openRoll(page)

    // 64:3 holds no note, so nothing has ever covered its ring
    expect(
      await looksDifferentWhenSelected(page, '64:3'),
      'the empty-cell arm must pass — if it fails the harness is broken, not the ring',
    ).toBe(true)
  })
})
