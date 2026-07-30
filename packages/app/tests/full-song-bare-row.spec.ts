/**
 * A BARE pattern draws a Song row (#1094) — Playwright observation.
 *
 * Strudel plays the document's last expression when nothing called `.p()`, and
 * the stack of registered patterns when something did. Every capture in
 * `StrudelEngine` hung off the `.p()` wrapper, so the first branch produced no
 * captured pattern — and since every timeline row is now built from eval haps, a
 * plainly audible bare loop drew nothing at all: "No song to map yet — press play."
 *
 * This gate is the row itself, plus the two controls that say the fix is a fix
 * and not a "capture something, anything": the LABELLED path must be untouched,
 * and a document Strudel does NOT play must still draw nothing.
 *
 * Read through `__staveTimelineMarks` (the `stave:debug.timelineMarks` flag) as
 * well as the DOM, because a row can exist with no marks in it — the two
 * failures look identical in the lane count alone.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

interface MarksProbe {
  evalBacked: boolean
  eventCount: number
  laneCount: number
  byLane: Record<string, { count: number; onsets: number[] }>
}

async function bootShell(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '340')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
      localStorage.setItem('stave:debug.timelineMarks', '1')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () =>
      ((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
        ?.editor?.getEditors?.()?.length ?? 0) > 0,
    { timeout: 20_000 },
  )
}

async function typeSongAndEval(page: Page, code: string): Promise<void> {
  await page.evaluate(() => {
    const eds =
      (
        window as unknown as {
          monaco?: {
            editor?: {
              getEditors?: () => Array<{
                getModel: () => { getLanguageId?: () => string } | null
                focus: () => void
              }>
            }
          }
        }
      ).monaco?.editor?.getEditors?.() ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    t?.focus()
  })
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${MOD}+A`)
  await page.keyboard.press('Backspace')
  await page.keyboard.type(code, { delay: 8 })
  await page.waitForTimeout(400)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2000)
}

const marksProbe = (page: Page): Promise<MarksProbe | null> =>
  page.evaluate(
    () =>
      ((window as unknown as { __staveTimelineMarks?: MarksProbe }).__staveTimelineMarks ??
        null) as MarksProbe | null,
  )

test('a bare loop draws a Song row, with eval-backed marks on it (#1094)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  await typeSongAndEval(page, 's("bd*4")')

  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })

  // The row exists — and it is the ONE row the IR produces for a bare statement,
  // not a second eval-only row grown beside it.
  await expect(page.locator('[data-full-song-lane]')).toHaveCount(1)

  const marks = await marksProbe(page)
  expect(marks, 'the marks probe should be published under the debug flag').not.toBeNull()
  expect(marks!.evalBacked, 'the row is drawn from evaluated haps, not the IR').toBe(true)
  expect(Object.keys(marks!.byLane)).toEqual(['d1'])
  // `s("bd*4")` is four onsets per cycle, drawn across the 4-bar bare floor.
  const onsets = marks!.byLane.d1.onsets
  expect(onsets.slice(0, 4)).toEqual([0, 0.25, 0.5, 0.75])
  expect(onsets.length).toBe(16)

  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})

test('CONTROL — a labelled `$:` document is unchanged (#1094)', async ({ page }) => {
  await bootShell(page)
  await typeSongAndEval(page, '$: s("bd*4")')

  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
  await expect(page.locator('[data-full-song-lane]')).toHaveCount(1)

  const marks = await marksProbe(page)
  expect(marks!.evalBacked).toBe(true)
  expect(Object.keys(marks!.byLane)).toEqual(['d1'])
  expect(marks!.byLane.d1.onsets.slice(0, 4)).toEqual([0, 0.25, 0.5, 0.75])
})

test('CONTROL — a document Strudel does not play still draws nothing (#1094)', async ({ page }) => {
  await bootShell(page)
  // `_$:` MUTES the track: Strudel refuses the registration, so nothing enters
  // its registry — and the value the document leaves behind is not a pattern.
  // The bare-capture guard asks for a queryable pattern precisely so this case
  // stays empty rather than capturing whatever the repl handed back.
  await typeSongAndEval(page, '_$: s("bd*4")')

  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })
  await expect(page.locator('[data-full-song-lane]')).toHaveCount(0)

  const marks = await marksProbe(page)
  expect(marks!.eventCount).toBe(0)
})
