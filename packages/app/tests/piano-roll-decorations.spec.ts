/**
 * Piano roll — a note's DECORATIONS belong to the note, not to its column
 * (#1078), and its selection is said as well as drawn (#1080).
 *
 * WHY A BROWSER TEST. Both claims are about rendered geometry and rendered
 * attributes on the real element. The name and the handle were in the DOM the
 * whole time, with correct content and correct handlers — they were simply drawn
 * somewhere the note was not, which no model-level test can see ([[PV245]]).
 *
 * WHY EACH CLAIM GETS ITS OWN `it`. A test body stops at its first failure, so an
 * assertion placed after a failing one is evidence for nothing — and it is the
 * MECHANISM assertion that ends up unevidenced under exactly the break the gate
 * was written for ([[PV248]], which this boundary hit twice in one session). Each
 * test below states one claim and is independently falsifiable.
 *
 * The fixture is the corpus mini the sweep found this on, not a constructed case:
 * in `[c5@0.5 f4@0.5 f5@3]`, `c5` ENDS mid-column (its handle was drawn past the
 * bar) and `f4` BEGINS mid-column (its name was drawn beside the bar). `f5`
 * covers whole columns and is the in-fixture control.
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

interface CellGeom {
  cell: string
  /** cell box */
  cx: number
  cw: number
  /** the bar */
  fx: number
  fw: number
  /** the name, when this cell draws one */
  nx?: number
  /** the handle, when this cell draws one */
  hx?: number
  hw?: number
}

/**
 * Every cell that draws a bar, with the boxes of the bar and of whichever
 * decorations sit in it — read as real pixel rects rather than off the style
 * strings, because the claim is where these things END UP, not what was typed.
 *
 * THE COLUMN IS THE CELL'S PADDING BOX, NOT ITS BORDER BOX. The cell is a button
 * with a 1px border, and an absolutely-positioned child lays out against the
 * padding box — the same border-box/padding-box split that decided which of the
 * roll's decorations survived #1076 ([[P385]]). Measured: a whole-column cell's
 * border box is 44px wide and its padding box and its bar are both 42px. Taking
 * the border box as the column makes every bar look 2px short of its column, so
 * a "does this bar fill its column?" filter admits every cell in the fixture —
 * an unnamed population restriction that would have put whole-column notes in
 * the partial-note arm ([[P345]]). This gate was written that way first, and the
 * control arm below is what caught it.
 */
async function geometry(page: Page): Promise<CellGeom[]> {
  return page.evaluate(() => {
    const out: CellGeom[] = []
    document.querySelectorAll('[data-roll-cell]').forEach((el) => {
      const fill = el.querySelector('[data-roll-fill]')
      if (!fill) return
      const box = el.getBoundingClientRect()
      const c = {
        x: box.x + (el as HTMLElement).clientLeft,
        width: (el as HTMLElement).clientWidth,
      }
      const f = fill.getBoundingClientRect()
      const name = el.querySelector('[data-roll-note-name]')
      const handle = el.querySelector('[data-roll-resize]')
      const g: CellGeom = {
        cell: el.getAttribute('data-roll-cell') ?? '?',
        cx: c.x,
        cw: c.width,
        fx: f.x,
        fw: f.width,
      }
      if (name) g.nx = name.getBoundingClientRect().x
      if (handle) {
        const h = handle.getBoundingClientRect()
        g.hx = h.x
        g.hw = h.width
      }
      out.push(g)
    })
    return out
  })
}

const FIXTURE = '$: note("[c5@0.5 f4@0.5 f5@3]")'
/** the same shape with a bar narrower than the handle's own width — 5.3px, measured */
const NARROW = '$: note("[c5@0.125 f4@0.875 f5@3]")'
/** the handle's unclamped width, mirrored from `PianoRollGrid.tsx` */
const RESIZE_ZONE_PX = 8

test.describe('roll decorations follow the note, not the column (#1078)', () => {
  test('the name of a note beginning mid-column starts at the BAR, not at the cell', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, FIXTURE)
    await openRoll(page)
    await expect(page.locator('[data-roll-fill]').first()).toBeVisible()

    const geom = await geometry(page)
    // the subject: a bar that starts partway into its column and carries a name
    const offset = geom.filter((g) => g.nx !== undefined && g.fx > g.cx + 1)
    console.log(`\n  offset-start named bars: ${JSON.stringify(offset)}`)
    expect(offset.length, 'the fixture must contain a named note beginning mid-column').toBeGreaterThan(0)

    // THE CLAIM. Before the fix the name was `inset: 0` on the cell, so it began
    // at the cell's left edge — on empty background, beside the bar it names.
    for (const g of offset) {
      expect(Math.abs(g.nx! - g.fx), `${g.cell}: the name must begin at the bar`).toBeLessThanOrEqual(1)
      expect(g.nx!, `${g.cell}: and therefore not at the cell's left edge`).toBeGreaterThan(g.cx + 1)
    }
  })

  test("the handle of a note ending mid-column sits at the BAR's trailing edge", async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, FIXTURE)
    await openRoll(page)
    await expect(page.locator('[data-roll-fill]').first()).toBeVisible()

    const geom = await geometry(page)
    // THE POPULATION IS "ENDS mid-column", which is not the same as "partial".
    // `f4` occupies the second half of its column: a partial bar whose trailing
    // edge IS the column's edge, so it belongs in the name arm above and not
    // here. Filtering on `partial` put it in this arm and the assertion rightly
    // refused it — the population has to be the one the claim names ([[P345]]).
    const short = geom.filter((g) => g.hx !== undefined && g.fx + g.fw < g.cx + g.cw - 0.5)
    console.log(`\n  bars ending mid-column, with a handle: ${JSON.stringify(short)}`)
    expect(short.length, 'the fixture must contain a handled note ending mid-column').toBeGreaterThan(0)

    // THE CLAIM. Before the fix the handle was `right: 0` on the cell, so it
    // floated past the end of the bar it resizes, in empty background.
    for (const g of short) {
      expect(
        Math.abs(g.hx! + g.hw! - (g.fx + g.fw)),
        `${g.cell}: the handle must end where the bar ends`,
      ).toBeLessThanOrEqual(1)
      expect(
        g.hx! + g.hw!,
        `${g.cell}: and therefore short of the cell's right edge`,
      ).toBeLessThan(g.cx + g.cw - 1)
    }
  })

  test('the handle is never wider than the bar it resizes', async ({ page }) => {
    // The design call this issue carried: a short enough note is a bar narrower
    // than the handle's own 8px, and a fixed-width handle would be wider than the
    // note it resizes — overhanging backwards past its own start.
    //
    // THIS ARM NEEDS ITS OWN FIXTURE. On the `@0.5` fixture every bar is ~21px and
    // the handle 8px, so `8 <= 21` holds however the code is written: the arm went
    // green under BOTH handle breaks, which makes it a gate that cannot fail
    // ([[P370]]). `c5@0.125` in a 42px column is a 5.3px bar, which is the only
    // shape that exercises the clamp at all.
    await boot(page)
    await setStrudelCode(page, NARROW)
    await openRoll(page)
    await expect(page.locator('[data-roll-fill]').first()).toBeVisible()

    const geom = await geometry(page)
    const handled = geom.filter((g) => g.hx !== undefined)
    // the subject must exist, and it must be narrower than the handle would be
    const tiny = handled.filter((g) => g.fw < RESIZE_ZONE_PX)
    console.log(`\n  sub-handle-width bars: ${JSON.stringify(tiny)}`)
    expect(tiny.length, 'the fixture must contain a bar narrower than the handle').toBeGreaterThan(0)

    for (const g of handled) {
      expect(g.hw!, `${g.cell}: handle wider than its bar`).toBeLessThanOrEqual(g.fw + 0.5)
    }
  })

  test('CONTROL — a whole-column note is untouched: name at the cell, handle at its edge', async ({
    page,
  }) => {
    // The arm that must NOT move. Whole-column notes are all but 12/18 of the
    // 4842 the corpus draws, and for them the bar IS the cell — so every figure
    // here is what it was before #1078, which is what makes the change above
    // attributable to the partial bars rather than to the geometry generally.
    await boot(page)
    await setStrudelCode(page, '$: note("c4 e4 g4 c5")')
    await openRoll(page)
    await expect(page.locator('[data-roll-fill]').first()).toBeVisible()

    const geom = await geometry(page)
    console.log(`\n  control geometry: ${JSON.stringify(geom)}`)
    expect(geom.length).toBe(4)
    for (const g of geom) {
      expect(Math.abs(g.fx - g.cx), `${g.cell}: bar fills its column`).toBeLessThanOrEqual(1)
      expect(Math.abs(g.fw - g.cw), `${g.cell}: bar fills its column`).toBeLessThanOrEqual(1)
      expect(Math.abs(g.nx! - g.cx), `${g.cell}: name still at the cell's left`).toBeLessThanOrEqual(1)
      expect(
        Math.abs(g.hx! + g.hw! - (g.cx + g.cw)),
        `${g.cell}: handle still at the cell's right`,
      ).toBeLessThanOrEqual(1)
    }
  })
})

test.describe('the roll says which cell is selected (#1080)', () => {
  test('the selected cell carries aria-current', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c4 e4 g4 c5")')
    await openRoll(page)

    const target = page.locator('[data-roll-cell]').first()
    await target.click({ modifiers: ['Meta'] })
    // the pre-existing signal still holds — this is the precondition, not the claim
    await expect(target).toHaveAttribute('data-roll-selected', 'true')
    // THE CLAIM: selection reaches assistive tech, not only pixels and a data attribute
    await expect(target).toHaveAttribute('aria-current', 'true')
  })

  test('CONTROL — an unselected cell carries no aria-current', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c4 e4 g4 c5")')
    await openRoll(page)

    const cells = page.locator('[data-roll-cell]')
    await cells.first().click({ modifiers: ['Meta'] })
    await expect(cells.first()).toHaveAttribute('aria-current', 'true')
    // if every cell claimed to be current, the attribute would say nothing
    await expect(cells.nth(1)).not.toHaveAttribute('aria-current', 'true')
  })
})
