/**
 * The piano roll opens on its notes, not on its top row (#1850).
 *
 * The roll's rows are the notes' range plus two rows each side, at least 13, and the
 * default drawer shows 9 — so a roll left at its top row opened with its lowest note
 * out of view. Every roll in the corpus did; a bass line showed only its one high note.
 * Now, once per statement: the notes are centred when they fit, and when they do not
 * the lowest note sits at the bottom. An edit never moves the view.
 *
 * WHY A BROWSER TEST. Whether a row is in view is a fact about the laid-out panel —
 * its height comes from the drawer, not the window — and one arm is only reachable by
 * the real order of events: the pattern is read while the drawer is still closed.
 */
import { test, expect, type Locator, type Page } from '@playwright/test'
import { bootApp, seedCode } from './_appBoot'

const roll = (page: Page) => page.locator('[data-bottom-panel-tab="piano-roll"]')

/** each lit note cell's key, with ' HIDDEN' when its box is not wholly inside the scroll area */
async function noteView(panel: Locator): Promise<string[]> {
  return panel.evaluate((grid) => {
    const box = grid.querySelector('[data-pattern-scroll]')!.getBoundingClientRect()
    return [...grid.querySelectorAll<HTMLElement>('[data-roll-cell][aria-pressed="true"]')].map((c) => {
      const b = c.getBoundingClientRect()
      const seen = b.top >= box.top - 0.5 && b.bottom <= box.bottom + 0.5
      return c.dataset.rollCell + (seen ? '' : ' HIDDEN')
    })
  })
}
/** where a note cell sits on screen, measured from the top of the scroll area */
const screenY = (panel: Locator, key: string) =>
  panel.evaluate((grid, k) => {
    const box = grid.querySelector('[data-pattern-scroll]')!.getBoundingClientRect()
    return grid.querySelector(`[data-roll-cell="${k}"]`)!.getBoundingClientRect().top - box.top
  }, key)

/** put the editor cursor on a line, as clicking there would */
async function cursorTo(page: Page, lineNumber: number): Promise<void> {
  await page.evaluate((line) => {
    const eds = (window as any).monaco.editor.getEditors()
    const ed = eds.find((e: any) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    ed.setPosition({ lineNumber: line, column: 6 })
    ed.focus()
  }, lineNumber)
}

test.describe('the piano roll opens on its notes (#1850)', () => {
  test('a bass line that fits shows every note', async ({ page }) => {
    // no height: the drawer's own default, which is what a user first sees
    await bootApp(page, { drawer: { tabId: 'pattern' } })
    await seedCode(page, '$: note("a1 a1 e2 a1")')
    await expect(roll(page)).toHaveCount(1)
    await expect.poll(() => noteView(roll(page))).toEqual(['40:2', '33:0', '33:1', '33:3'])
  })

  test('a span too tall for the view puts the lowest note at the bottom', async ({ page }) => {
    await bootApp(page, { drawer: { tabId: 'pattern' } })
    await seedCode(page, '$: note("c2 g2 c3 g3 c4 g4")')
    await expect(roll(page)).toHaveCount(1)
    await expect.poll(async () => (await noteView(roll(page))).filter((k) => !k.endsWith('HIDDEN'))).toEqual(['43:1', '36:0'])
  })

  test('a pattern read while the drawer was closed still opens on its notes', async ({ page }) => {
    await bootApp(page)
    await seedCode(page, '$: note("a1 a1 e2 a1")')
    await cursorTo(page, 1)
    const drawer = page.locator('[data-bottom-panel="root"]')
    await drawer.locator('[data-bottom-panel="toggle"]').click()
    await drawer.locator('role=tab[name="Pattern"]').click()
    await expect(roll(page)).toHaveCount(1)
    await expect.poll(() => noteView(roll(page))).toEqual(['40:2', '33:0', '33:1', '33:3'])
  })

  test('an edit leaves the view where it is; a new statement opens on its own notes', async ({ page }) => {
    await bootApp(page, { drawer: { tabId: 'pattern' } })
    await seedCode(page, '$: note("a1 a1 e2 a1")\n$: note("c5 e5 g5 e5")')
    await cursorTo(page, 1)
    await expect.poll(() => noteView(roll(page))).toEqual(['40:2', '33:0', '33:1', '33:3'])
    // ON SCREEN, not scrollTop: the edit below grows the sticky range by rows ABOVE, and
    // the browser's scroll anchoring raises scrollTop to keep the notes where they were.
    // What must not move is what the user sees.
    const before = await screenY(roll(page), '33:0')

    // the same statement, its top note raised (the notes' centre moves): the view must not
    await seedCode(page, '$: note("a1 a1 e2 g2")\n$: note("c5 e5 g5 e5")')
    await cursorTo(page, 1)
    await expect.poll(async () => (await noteView(roll(page))).some((k) => k.startsWith("43:3"))).toBe(true)
    expect(await screenY(roll(page), '33:0')).toBeCloseTo(before, 0)

    // another statement: its notes, not the old view
    await cursorTo(page, 2)
    await expect.poll(async () => (await noteView(roll(page))).filter((k) => k.endsWith('HIDDEN'))).toEqual([])
    await expect.poll(() => noteView(roll(page))).toContain("79:2")
  })
})
