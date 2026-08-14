/**
 * What a "structurally editable" unit actually looks like on screen (#1256).
 *
 * WHY THIS EXISTS. Invariant 3 counts a unit when a view opens and the string
 * round-trips. Measured on the 150-tune corpus, 154 of the 591 units it counts
 * draw a view with one cell, one note, or nothing at all — a quarter of the
 * number. That measurement is made through the harness oracle, and the whole
 * recent history of this seam is the harness and the product disagreeing:
 * #1240's surface half was scored green by every gate while the grid it
 * promised drew nothing for any user (#1250). So the claim "these views are
 * empty" is not allowed to rest on a parse result. It has to be looked at.
 *
 * These arms make no assertion about whether an empty view is ACCEPTABLE — that
 * is the product call #1256 exists to put in front of someone. They pin what is
 * on screen, so the call is made against the thing rather than against a count.
 *
 * ⚠ ONE OF THESE IS A DEFECT AND IS FILED SEPARATELY (#1257). A shaker line
 * captions itself as a chord chart because the chord grammar reads a trailing
 * octave digit as a chord quality. The arm is written to pass on TODAY's wrong
 * behaviour and says so, so that it records the defect instead of hiding it;
 * when #1257 lands, this arm is what should redden.
 *
 * Run (single invocation, per the population runner's contract):
 *   STAVE_E2E_PORT=3123 pnpm --filter @stave/app exec playwright test \
 *     tests/counted-but-empty-views.spec.ts --project=chromium --workers=1
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
  await page.evaluate(place, { c: code, needle: caret })
}

test.describe('#1256 — what the counted-but-empty views look like', () => {
  test('a single timbre name counts as structurally editable and draws ONE cell', async ({ page }) => {
    await boot(page)
    // 72 units of the 150-tune corpus are this shape — `s("piano")`,
    // `s("crackle")`, `s("loopAmen02")`. The harness calls each of them a unit
    // with a meaningful editable surface.
    await typeAndPoint(page, '$: s("piano").lpf(400)', '.lpf')

    const cells = page.locator(`${panel} [data-seq-cell]`)
    await expect(cells.first()).toBeVisible({ timeout: 15_000 })
    const n = await cells.count()
    // eslint-disable-next-line no-console
    console.log(`  s("piano") → ${n} cell(s) on screen`)
    // ONE cell. The only edit available is deleting the sound entirely, which is
    // what "round-trips perfectly and is useless" means in the census's words.
    expect(n).toBe(1)
    await page.screenshot({ path: 'test-results/1256-one-cell-grid.png' })
  })

  test('CONTROL: a real drum pattern draws a grid worth the name', async ({ page }) => {
    await boot(page)
    // Same route, same panel, same head — the ONLY difference is that the mini
    // has structure. Without this the arm above is a claim about the panel
    // rather than about the population.
    await typeAndPoint(page, '$: s("bd sd hh cp").lpf(400)', '.lpf')
    const cells = page.locator(`${panel} [data-seq-cell]`)
    await expect(cells.first()).toBeVisible({ timeout: 15_000 })
    const n = await cells.count()
    // eslint-disable-next-line no-console
    console.log(`  s("bd sd hh cp") → ${n} cell(s) on screen`)
    expect(n).toBeGreaterThan(4)
    await page.screenshot({ path: 'test-results/1256-real-grid.png' })
  })

  test('a one-note roll counts too, and draws a single note in an empty grid', async ({ page }) => {
    await boot(page)
    // The roll half of the same finding — 76 units are a single note or none.
    //
    // ⚠ THE FIRST DRAFT OF THIS ARM COUNTED THE WRONG THING and the run is what
    // caught it. `[data-roll-cell]` is the roll's ASK-SPACE — every pitch row ×
    // column it will accept a click in — and it read 13 for a one-note pattern,
    // which reads exactly like a populated roll. `[data-roll-fill]` is a note
    // that is actually drawn. Counting the surface instead of its contents is
    // the same mistake as counting a view as editable because it opened.
    await typeAndPoint(page, '$: note("C3").room(2)', '.room')
    const cells = page.locator(`${panel} [data-roll-cell]`)
    const drawn = page.locator(`${panel} [data-roll-fill]`)
    await expect(cells.first()).toBeVisible({ timeout: 15_000 })
    const nCells = await cells.count()
    const nDrawn = await drawn.count()
    // eslint-disable-next-line no-console
    console.log(`  note("C3") → ${nDrawn} note(s) drawn in ${nCells} clickable cell(s)`)
    expect(nDrawn).toBe(1)
    await page.screenshot({ path: 'test-results/1256-one-note-roll.png' })
  })

  test('CONTROL: a real melody draws a roll worth the name', async ({ page }) => {
    await boot(page)
    // Same surface, same head — only the content differs, so the arm above is
    // about the population and not about the roll.
    await typeAndPoint(page, '$: note("c3 e3 g3 c4").room(2)', '.room')
    const drawn = page.locator(`${panel} [data-roll-fill]`)
    await expect(drawn.first()).toBeVisible({ timeout: 15_000 })
    const nDrawn = await drawn.count()
    // eslint-disable-next-line no-console
    console.log(`  note("c3 e3 g3 c4") → ${nDrawn} note(s) drawn`)
    expect(nDrawn).toBeGreaterThan(1)
    await page.screenshot({ path: 'test-results/1256-real-roll.png' })
  })

  test('⚠ DEFECT #1257 — a shaker line calls itself a chord chart', async ({ page }) => {
    await boot(page)
    // `a4` is a legal chord symbol (A dominant-ish quality on a trailing 4), so
    // every lane passes the chord test and the grid captions itself. This is a
    // real line from the corpus, not a constructed one.
    await typeAndPoint(page, '$: sound("a4 a4 a4 a4").sound("shaker_large")', '.sound("shaker')

    await expect(page.locator(`${panel} [data-seq-cell]`).first()).toBeVisible({ timeout: 15_000 })
    const caption = page.locator(`${panel} [data-seq-chord-chart]`)
    const captioned = await caption.count()
    const picker = await page.locator(`${panel} [data-seq-add-voice]`).count()
    // eslint-disable-next-line no-console
    console.log(`  shaker line → chord caption present: ${captioned}, drum picker present: ${picker}`)
    // ⚠ ASSERTS THE DEFECT, DELIBERATELY. Today the caption appears and the
    // picker is withdrawn. Recorded as the current behaviour so #1257 has a
    // failing arm to flip rather than a paragraph to re-derive.
    expect(captioned).toBe(1)
    expect(picker).toBe(0)
    await page.screenshot({ path: 'test-results/1257-shaker-as-chord-chart.png' })
  })

  test('CONTROL: the same shape an octave lower is NOT captioned', async ({ page }) => {
    await boot(page)
    // `a3` is not a chord symbol; `a4` is. Same music, one octave apart. This is
    // the arm that shows the caption is keyed on the octave digit rather than on
    // anything musical — and it is what makes #1257 a mechanism rather than an
    // anecdote.
    await typeAndPoint(page, '$: sound("a3 a3 a3 a3").sound("shaker_large")', '.sound("shaker')
    await expect(page.locator(`${panel} [data-seq-cell]`).first()).toBeVisible({ timeout: 15_000 })
    const captioned = await page.locator(`${panel} [data-seq-chord-chart]`).count()
    // eslint-disable-next-line no-console
    console.log(`  same line at octave 3 → chord caption present: ${captioned}`)
    expect(captioned).toBe(0)
  })
})
