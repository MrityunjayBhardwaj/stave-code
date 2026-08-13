/**
 * A chord chart reaches the grid, and the grid says it is one (#1241, #1243).
 *
 * TWO CHANGES, AND NEITHER IS VISIBLE TO A vitest ARM.
 *
 *   #1243 ROUTING — `note(chordProgression)` used to be refused by the roll on
 *   vocabulary and fall to code. It now routes to the step grid when, and only
 *   when, the roll declined on CONTENT and every lane is a chord symbol.
 *
 *   #1241 CHROME — a step grid whose lanes are chords says so, and withdraws
 *   the drum-voice picker, which would otherwise offer Kick and Snare as things
 *   to add to a progression.
 *
 * The editor package pins both rules directly and the corpus pins what they do
 * to 207 documents. Neither can see the seam: `chunkSurface`'s only production
 * caller is `PatternPanel`, which no vitest arm mounts, and the caption and the
 * picker exist only once the panel is on screen. That is the identical blind
 * spot that let #1240's surface half ship inert and become #1250 — so the arms
 * that matter are here, in the browser, against `editor/dist`.
 *
 * ── WHY EACH CONTROL IS PRESENT ──────────────────────────────────────────
 * The chord rule is a NARROWING of two much wider rules that were rejected on
 * measurement, and each control is the case that would have broken under the
 * wider version:
 *
 *   MELODY control — "the head's own surface declined, so ask the other one"
 *   was the rule the issue proposed. Seven of twelve declined melodies in the
 *   corpora would fall through under it and be drawn as drum grids. This arm
 *   keeps an ordinary melody on the roll.
 *
 *   DRUM control — the chrome could have been routed on the head ("the head
 *   did not say `s`, so these are not sounds"), which would relabel seven real
 *   drum grids. This arm holds a drum grid to its drum chrome: no caption, and
 *   the picker still there.
 *
 * Both would pass against a hard-wired router, which is why they come in a pair
 * with the positive arms rather than alone.
 *
 * ⚠ THIS FILE IS ALSO THE ONLY CHECK THAT THE NEW DEPENDENCY LOADS. The chord
 * grammar (`@tonaljs/chord`) stays an EXTERNAL import in `editor/dist` rather
 * than being bundled, so the app's bundler has to resolve and interop it. Both
 * vitest environments already link it; the browser is a third and no other arm
 * goes near it. Every arm below fails the run on a page error for that reason.
 *
 * BREAK SIGNATURES, sorted for containment rather than assumed disjoint:
 *   drop the `note`-head chord clause -> the ROUTING arm only
 *   drop the `isChordChart` chrome    -> both CAPTION arms, routing still green
 *   make `chordLanes` always true     -> the DRUM control only
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const panel = '[data-bottom-panel-tab="pattern"]'

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '320')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'pattern')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 20_000 },
  )
}

/** put `code` in the editor, evaluate it, and leave the cursor on `caret` */
async function typeAndPoint(page: Page, code: string, caret: string): Promise<void> {
  const place = ({ c, needle }: { c: string; needle: string }): void => {
    const monaco = (window as unknown as {
      monaco?: { editor?: { getEditors?: () => unknown[] } }
    }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => {
        getLanguageId?: () => string
        setValue?: (s: string) => void
        getPositionAt: (o: number) => unknown
      } | null
      setPosition: (p: unknown) => void
      focus: () => void
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    const model = target?.getModel()
    model?.setValue?.(c)
    target?.focus()
    const at = c.indexOf(needle)
    if (model && at >= 0) target.setPosition(model.getPositionAt(at + 1))
  }
  await page.evaluate(place, { c: code, needle: caret })
  await page.waitForTimeout(150)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(250)
  // ⌘↵ can move focus, and the panel binds to the cursor — re-assert it.
  await page.evaluate(place, { c: code, needle: caret })
}

/** page errors are a failure of every arm here — see the dependency note above */
function watchForErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })
  return errors
}

test.describe('#1243 — a chord chart under note() reaches the grid', () => {
  test('note(<chords>) opens the step grid and calls itself a chord chart', async ({ page }) => {
    const errors = watchForErrors(page)
    await boot(page)
    // The head says `note`, so the roll is asked first and declines on
    // vocabulary — these are chord symbols, not pitches. Before #1243 that was
    // the end of it and the user got code.
    await typeAndPoint(page, 'const harm = "<Gsus G7 Em7 D7>"\n$: note(harm).s("piano")', '.s(')

    const cells = page.locator(`${panel} [data-seq-cell]`)
    await expect(cells.first()).toBeVisible({ timeout: 15_000 })
    // Four chords, one lane each, four steps.
    expect(await cells.count()).toBeGreaterThanOrEqual(16)
    // Exclusive: a router that opened both surfaces satisfies the line above
    // and has decided nothing.
    expect(await page.locator(`${panel} [data-roll-cell]`).count()).toBe(0)

    // #1241 — the panel says what it is holding, and does not offer a drum kit.
    await expect(page.locator(`${panel} [data-seq-chord-chart]`)).toBeVisible()
    expect(await page.locator(`${panel} [data-seq-add-voice]`).count()).toBe(0)

    expect(errors).toEqual([])
  })

  test('CONTROL: an ordinary melody stays on the piano roll', async ({ page }) => {
    await boot(page)
    // The rule this arm bounds: "the head's surface declined, so ask the other
    // one" would send declined melodies to the grid. This one is not even
    // declined, and must never move.
    await typeAndPoint(page, 'const mel = "c3 e3 g3"\n$: note(mel).room(2)', '.room')
    await expect(page.locator(`${panel} [data-roll-cell]`).first()).toBeVisible({ timeout: 15_000 })
    expect(await page.locator(`${panel} [data-seq-cell]`).count()).toBe(0)
  })
})

test.describe('#1241 — the grid drops its drum chrome only for a chord chart', () => {
  test('a SILENT head carrying chords gets the chord caption too', async ({ page }) => {
    const errors = watchForErrors(page)
    await boot(page)
    // This is #1241's own population — the shape measured in
    // `bakery-150-eq-continuation`, where the progression is bound and the head
    // says nothing. It reached the grid before this change; what it lacked was
    // any sign the grid knew what it was holding.
    await typeAndPoint(page, 'const harm = "<Gsus G7 Em7 D7>"\n$: seq(harm).room(2)', '.room')

    await expect(page.locator(`${panel} [data-seq-cell]`).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator(`${panel} [data-seq-chord-chart]`)).toBeVisible()
    expect(await page.locator(`${panel} [data-seq-add-voice]`).count()).toBe(0)

    expect(errors).toEqual([])
  })

  test('CONTROL: a drum grid keeps its voice picker and gets no caption', async ({ page }) => {
    await boot(page)
    // The 319 units that reach this grid with real sample names must be
    // untouched. This is the arm that reddens if the predicate is widened into
    // "anything the head did not vouch for".
    await typeAndPoint(page, '$: s("bd sd hh cp").lpf(400)', '.lpf')

    await expect(page.locator(`${panel} [data-seq-cell]`).first()).toBeVisible({ timeout: 15_000 })
    expect(await page.locator(`${panel} [data-seq-chord-chart]`).count()).toBe(0)
    await expect(page.locator(`${panel} [data-seq-add-voice]`)).toBeVisible()
  })
})
