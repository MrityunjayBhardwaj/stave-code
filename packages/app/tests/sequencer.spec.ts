/**
 * Sequencer tab — #382. Drum/step grid over a sound pattern's mini-notation.
 *
 * Observes (AnviDev: verify AND observe):
 *   - a sound pattern renders one lane per sound, cells reflecting the mini;
 *   - toggling a cell round-trips: the mini-notation updates and stays a sound
 *     pattern (surgical replace of the mini range only);
 *   - a pattern outside the grid subset falls back to standby (code-only).
 */
import { test, expect, type Page } from '@playwright/test'

async function boot(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 15_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } })
        .monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 15_000 },
  )
}

async function setStrudelCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } })
      .monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
      setPosition: (p: { lineNumber: number; column: number }) => void
    }>
    const target =
      editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    if (!target) return false
    target.getModel()?.setValue(c)
    target.setPosition({ lineNumber: 1, column: 1 })
    target.focus()
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(150)
}

async function strudelValue(page: Page): Promise<string> {
  return page.evaluate(() => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } })
      .monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; getValue: () => string } | null
    }>
    const target =
      editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    return target?.getModel()?.getValue() ?? ''
  })
}

async function openSequencer(page: Page) {
  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('[data-bottom-panel="toggle"]').click()
  await drawer.locator('role=tab[name="Pattern"]').click()
  return drawer
}

/** Put the cursor on the first occurrence of `needle` in the strudel model. */
async function placeCursorOn(page: Page, needle: string): Promise<void> {
  const ok = await page.evaluate((needle) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } })
      .monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => {
        getLanguageId?: () => string
        getValue: () => string
        getLineCount: () => number
        getLineContent: (n: number) => string
      } | null
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
  await page.waitForTimeout(120)
}

test.describe('Sequencer (#382)', () => {
  test('renders one lane per sound with cells from the mini', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ sn ~")')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid).toHaveCount(1)
    // bd lane: on at step 0, off at 1, etc. (data-seq-cell="lane:step")
    await expect(grid.locator('[data-seq-cell="0:0"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(grid.locator('[data-seq-cell="0:1"]')).toHaveAttribute('aria-pressed', 'false')
  })

  test('toggling a cell round-trips the mini-notation', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ ~ ~")')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    // turn step 2 of the bd lane on
    await grid.locator('[data-seq-cell="0:2"]').click()
    await page.waitForTimeout(80)
    const after = await strudelValue(page)
    expect(after).toBe('$: s("bd ~ bd ~")')
    // the grid reflects it
    await expect(grid.locator('[data-seq-cell="0:2"]')).toHaveAttribute('aria-pressed', 'true')
  })

  /**
   * #913 — an edit must not be collateral. `bd hh*2 sd cp` shows an 8-column
   * grid; the cell clicked here is in the `bd`'s own half, nowhere near the
   * `hh*2`. Before span surgery the whole line came back rebuilt from the grid
   * as `bd bd hh hh sd ~ cp ~` and the `*2` was simply gone.
   *
   * Driven through the real gesture on the real document rather than a forced
   * model: the writer's caller replaces the WHOLE mini range, so a unit test on
   * the serializer alone cannot see what actually lands in the user's file.
   */
  test('an edit keeps the notation it did not touch (#913)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd hh*2 sd cp")')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    // the bd lane spans columns 0-1; turn on column 1 — inside `bd`, not `hh*2`
    await grid.locator('[data-seq-cell="0:1"]').click()
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: s("[bd bd] hh*2 sd cp")')
  })

  /**
   * #920 — a `<...>` alternation used as a sequence element. `bd <sd hh>` opens as
   * a 2-bar grid: `bd` static across both bars, the `<sd hh>` slot alternating.
   * Editing the alternation's bar-1 slot writes back `bd <sd ~>` — the leading
   * `bd` untouched — never a whole-cycle `<[bd sd] [bd ~]>` rebuild.
   */
  test('opens and edits a <...>-as-element pattern (#920)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd <sd hh>")')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid).toHaveCount(1)
    // 2 bars × 2 columns; bd (lane 0) on cols 0 & 2, sd (lane 1) col 1, hh (lane 2) col 3
    await expect(grid.locator('[data-seq-cell="0:0"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(grid.locator('[data-seq-cell="0:2"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(grid.locator('[data-seq-cell="2:3"]')).toHaveAttribute('aria-pressed', 'true')
    // turn off hh in bar 1 → the alternation's second slot empties
    await grid.locator('[data-seq-cell="2:3"]').click()
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: s("bd <sd ~>")')
  })

  /** #913 — opening a pattern and clicking nothing must not touch the document. */
  test('opening a euclid pattern leaves the source alone (#913)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd(3,8)")')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid.locator('[data-seq-cell="0:0"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(grid.locator('[data-seq-cell="0:3"]')).toHaveAttribute('aria-pressed', 'true')
    expect(await strudelValue(page)).toBe('$: s("bd(3,8)")')
  })

  test('highlights the playing step during playback (#391)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd hh sn hh")') // focuses the editor
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${mod}+Enter`) // play (editor is focused)
    await page.waitForTimeout(300)
    const drawer = await openSequencer(page) // playback continues across tab open
    // a step cell becomes "playing" as the transport clock advances
    await expect(
      drawer.locator('[data-seq-cell][data-playing="true"]').first(),
    ).toBeVisible({ timeout: 5000 })
  })

  // The standby element is `data-bottom-panel-tab={`${panel}-standby`}` (a
  // template literal in VisualEditStandby), and the panel is now `pattern`, not
  // `sequencer`. The old id never matched, so this assertion was 0-vs-1 for ANY
  // input — it had stopped testing the fallback and was only testing itself.
  //
  // The example moved too. `s("bd*<2 3>")` used to be non-griddable; behaviour
  // projection now bar-expands it into a correct 12-cell grid (2 bars × LCM(2,3):
  // hits at 0,3 then 6,8,10). What still reaches standby is a pattern with no
  // discrete onsets at all — a continuous signal has nothing to put in a cell.
  test('a pattern with no discrete onsets falls back to standby', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note(sine.range(40,80))')
    const drawer = await openSequencer(page)
    await expect(drawer.locator('[data-bottom-panel-tab="pattern-standby"]')).toHaveCount(1)
    await expect(drawer.locator('[data-seq-cell]')).toHaveCount(0)
  })

  // The other half of the pair: the pattern the case above used to cover is now
  // editable, and that is the behaviour worth pinning. Without this, a
  // regression that re-broke bar expansion would only show up as the standby
  // test going green again — which reads like a pass.
  test('a bar-varying multiplier bar-expands into a grid (#930)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd*<2 3>")')
    const drawer = await openSequencer(page)
    await expect(drawer.locator('[data-bottom-panel-tab="pattern-standby"]')).toHaveCount(0)
    // 2 bars × LCM(2,3) = 12 columns; bar 1 fires twice, bar 2 three times.
    await expect(drawer.locator('[data-seq-cell]')).toHaveCount(12)
  })

  // #904 — an underscore inside a sound NAME is not mini-notation syntax.
  // Every General MIDI sound is `gm_*`, so this whole family used to land in
  // standby, reported as "uses mini-notation features beyond the editable
  // subset" though no such feature is present.
  test('binds a General MIDI sound whose name contains an underscore (#904)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("gm_agogo ~ LinnDrum_bd ~")')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid).toHaveCount(1) // bound, NOT standby (was standby pre-#904)
    await expect(drawer.locator('[data-bottom-panel-tab="sequencer-standby"]')).toHaveCount(0)
    // one lane per underscore-named sound, cells read from the mini
    await expect(grid.locator('[data-seq-cell="0:0"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(grid.locator('[data-seq-cell="0:1"]')).toHaveAttribute('aria-pressed', 'false')

    // The write-back keeps the underscore names intact — toggle gm_agogo into
    // the empty column 2; only the mini is rewritten.
    await grid.locator('[data-seq-cell="0:1"]').click()
    expect(await strudelValue(page)).toBe('$: s("gm_agogo gm_agogo LinnDrum_bd ~")')
  })

  test('binds a drum track nested inside stack(...) and round-trips it (#395)', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(
      page,
      '$: stack(\n  s("bd ~ ~ ~").gain(0.5),\n  s("hh*4")\n).slow(2)',
    )
    // Cursor on the FIRST drum track, which lives inside stack(...).
    await placeCursorOn(page, 'bd ~ ~ ~')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid).toHaveCount(1) // bound, not standby
    await expect(grid.locator('[data-seq-cell="0:0"]')).toHaveAttribute('aria-pressed', 'true')

    // Toggle step 2 on — the write-back must hit ONLY the inner mini, leaving
    // the sibling track, the .gain() and the outer .slow(2) byte-identical.
    await grid.locator('[data-seq-cell="0:2"]').click()
    await page.waitForTimeout(100)
    expect(await strudelValue(page)).toBe(
      '$: stack(\n  s("bd ~ bd ~").gain(0.5),\n  s("hh*4")\n).slow(2)',
    )
  })

  test('binds `hh*8` as an 8-step lane and expands the sugar on toggle (#396)', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("hh*8")')
    await placeCursorOn(page, 'hh*8')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid).toHaveCount(1) // bound, not standby
    // `*8` expands to 8 columns, all on for the single hh lane
    for (let s = 0; s < 8; s++) {
      await expect(grid.locator(`[data-seq-cell="0:${s}"]`)).toHaveAttribute('aria-pressed', 'true')
    }
    await expect(grid.locator('[data-seq-cell="0:8"]')).toHaveCount(0) // no 9th column

    // turning one step off (select + Delete, #432) expands the `*8` sugar
    await grid.locator('[data-seq-cell="0:3"]').click() // select (no longer toggles off)
    await page.keyboard.press('Delete') // turn off
    await page.waitForTimeout(100)
    expect(await strudelValue(page)).toBe('$: s("hh hh hh ~ hh hh hh hh")')
    await expect(grid.locator('[data-seq-cell="0:3"]')).toHaveAttribute('aria-pressed', 'false')
  })

  test('binds `bd(3,8)` euclid as an 8-step lane with 3 hits and expands on toggle (#399)', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd(3,8)")')
    await placeCursorOn(page, 'bd(3,8)')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid).toHaveCount(1) // bound, not standby
    // Bjørklund(3,8) = x . . x . . x . — hits at steps 0, 3, 6
    const on = [0, 3, 6]
    for (let s = 0; s < 8; s++) {
      await expect(grid.locator(`[data-seq-cell="0:${s}"]`)).toHaveAttribute(
        'aria-pressed',
        on.includes(s) ? 'true' : 'false',
      )
    }
    await expect(grid.locator('[data-seq-cell="0:8"]')).toHaveCount(0) // no 9th column

    // turning step 1 on expands the euclid sugar into the canonical sequence
    await grid.locator('[data-seq-cell="0:1"]').click()
    await page.waitForTimeout(100)
    expect(await strudelValue(page)).toBe('$: s("bd bd ~ bd ~ ~ bd ~")')
    await expect(grid.locator('[data-seq-cell="0:1"]')).toHaveAttribute('aria-pressed', 'true')
  })

  test('binds `bd!3` replicate as a 3-step lane and expands the sugar on toggle (#407)', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd!3")')
    await placeCursorOn(page, 'bd!3')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid).toHaveCount(1) // bound, not standby
    // `!3` = three separate beats, all on
    for (let s = 0; s < 3; s++) {
      await expect(grid.locator(`[data-seq-cell="0:${s}"]`)).toHaveAttribute('aria-pressed', 'true')
    }
    await expect(grid.locator('[data-seq-cell="0:3"]')).toHaveCount(0) // no 4th column

    // turning step 1 off (select + Delete, #432) expands the `!3` sugar
    await grid.locator('[data-seq-cell="0:1"]').click() // select
    await page.keyboard.press('Delete') // turn off
    await page.waitForTimeout(100)
    expect(await strudelValue(page)).toBe('$: s("bd ~ bd")')
    await expect(grid.locator('[data-seq-cell="0:1"]')).toHaveAttribute('aria-pressed', 'false')
  })

  /**
   * #1070 — A LEAF-ANCHORED GRID SAYS WHAT IT CANNOT DO, once.
   *
   * `<bd - - ->*2` is written by byte surgery at each note's own span, and no
   * span the writer can reach covers the clicked column — so it can change and
   * delete the notes it holds and creates nothing. Before this, the grid opened
   * looking completely normal and swallowed every click on an empty cell — no
   * write, no toggle, no message. Corpus-wide that was 3,584 of 3,584 grid
   * placements and 18,386 of 18,386 roll placements.
   *
   * ⚠ THE VIEW-LEVEL MESSAGE IS NOW A MEASUREMENT, NOT A PATH VERDICT (#1154).
   * `viewPlacesNotes` asks the op instead of reading `leafSource`, because rest
   * columns became writable and 3,584 refused is now 3,336. THIS fixture is one
   * of the 65 leaf grids that still refuse everything, which is what keeps the
   * banner on it — so if the rest index ever reaches these columns, this test
   * goes red and it is right to. The test below it holds the opposite case, on a
   * leaf grid where the banner is correctly absent and the click writes.
   *
   * Observed through the REAL gesture on the REAL document, because the whole
   * defect was that the model and the document stayed untouched — which is
   * exactly what a forced-state check cannot distinguish from success.
   */
  test('a leaf-anchored grid states it takes no new note, and still deletes (#1070)', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("<bd - - ->*2")')
    await placeCursorOn(page, 'bd')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid).toHaveCount(1) // it still OPENS — reach is unaffected

    // ONE statement for the view, not a cell-by-cell greying.
    await expect(grid.locator('[data-seq-no-placement]')).toHaveCount(1)

    // an empty cell is inert AND says why, instead of silently eating the click
    const empty = grid.locator('[data-seq-cell="0:1"]')
    await expect(empty).toHaveAttribute('aria-pressed', 'false')
    await expect(empty).toHaveAttribute('data-seq-cell-inert', 'true')
    await expect(empty).toHaveAttribute('aria-disabled', 'true')

    // The affordance is genuinely gone, not merely styled: an ordinary click
    // cannot reach it at all.
    await expect(empty).toBeDisabled()

    // AND the op refuses underneath it — forced past the affordance, the
    // document is still untouched. Both layers, because the panel's guard is a
    // courtesy and the op's refusal is the guarantee.
    const before = await strudelValue(page)
    await empty.click({ force: true })
    await page.waitForTimeout(100)
    expect(await strudelValue(page), 'a refused placement leaves the document alone').toBe(before)
    await expect(empty).toHaveAttribute('aria-pressed', 'false')

    // and the half the decision KEPT: the notes that are here still delete.
    const held = grid.locator('[data-seq-cell="0:0"]')
    await expect(held).toHaveAttribute('aria-pressed', 'true')
    await expect(held).not.toHaveAttribute('data-seq-cell-inert', 'true')
    await held.click()
    await page.waitForTimeout(100)
    expect(await strudelValue(page), 'delete still writes on a leaf view').not.toBe(before)
  })

  /**
   * #1154 — THE SAME PATH, THE OTHER ANSWER: a leaf grid that DOES take a note.
   *
   * `<~ oh ~@2 oh ~@3 oh>` is leaf-anchored exactly like the fixture above, and
   * the path rule greyed it out for that reason alone. Its first column holds a
   * `~` whose span the writer can reach, so the placement is real — no banner, a
   * live cell, and a click that writes `<oh oh ~@2 oh ~@3 oh>`.
   *
   * OBSERVED THROUGH THE REAL GESTURE, on the real document, for the same reason
   * the test above is: the whole defect class here is a click that changes
   * nothing, which is indistinguishable from success unless the document is read
   * back. And this is the arm the widening needs — the corpus sweeps count 248
   * such cells, but only this says a user can reach one.
   */
  test('a leaf grid whose rest column is writable takes the note (#1154)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("<~ oh ~@2 oh ~@3 oh>")')
    await placeCursorOn(page, 'oh')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid).toHaveCount(1)

    // no view-level refusal: this leaf grid is not creation-incapable
    await expect(grid.locator('[data-seq-no-placement]')).toHaveCount(0)

    const rest = grid.locator('[data-seq-cell="0:0"]')
    await expect(rest).toHaveAttribute('aria-pressed', 'false')
    await expect(rest).not.toHaveAttribute('data-seq-cell-inert', 'true')
    await rest.click()
    await page.waitForTimeout(120)
    expect(await strudelValue(page), "the rest's bytes become a note, the rest of the notation untouched").toBe(
      '$: s("<oh oh ~@2 oh ~@3 oh>")',
    )
    await expect(rest).toHaveAttribute('aria-pressed', 'true')
  })

  /**
   * The other half, on the ordinary write path: a grid that CAN take notes must
   * not have been narrowed by any of this. No view-level message, no inert
   * cells, and the placement lands.
   */
  test('an ordinary grid is unchanged — no message, no inert cells (#1064)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ ~ ~")')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid.locator('[data-seq-no-placement]')).toHaveCount(0)
    await expect(grid.locator('[data-seq-cell-inert]')).toHaveCount(0)
    await grid.locator('[data-seq-cell="0:2"]').click()
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: s("bd ~ bd ~")')
  })
})
