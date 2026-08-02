/**
 * Grid resolution — #479, relocated to the Pattern inspector by #601.
 *
 * The "Slots" 4 / 8 / 16 / 32 / 64 control SETS the grid to an absolute column
 * count: a lossless ×2/÷2 when the ratio allows (hits keep their position), else
 * a quantize (notes snap to the nearest new slot, collisions merge) so ANY
 * pattern can be coarsened. It used to sit in each grid header; #601 moved it
 * into the Pattern inspector (`[data-mixer-body]`), lifted from the active grid
 * which still owns the model + write-back. Verified by BOTH the rendered grid
 * and the written-back source, and that the buttons live in the inspector, not
 * the grid.
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
  await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
      setPosition: (p: { lineNumber: number; column: number }) => void
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    target?.getModel()?.setValue(c)
    target?.setPosition({ lineNumber: 1, column: 6 })
    target?.focus()
  }, code)
  await page.waitForTimeout(200)
}

async function getStrudelCode(page: Page): Promise<string> {
  return page.evaluate(() => {
    const monaco = (window as unknown as {
      monaco?: { editor?: { getEditors?: () => unknown[] } }
    }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; getValue: () => string } | null
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    return target?.getModel()?.getValue() ?? ''
  })
}

async function openPattern(page: Page): Promise<Locator> {
  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('[data-bottom-panel="toggle"]').click()
  await drawer.locator('role=tab[name="Pattern"]').click()
  await page.waitForTimeout(300)
  return drawer
}

/** The "Slots" control now lives in the Pattern inspector (#601), not the grid. */
function slotsControl(drawer: Locator): Locator {
  return drawer.locator('[data-mixer-body]')
}

/**
 * #1059 — THE ABSOLUTE PRESETS NOW LIVE BEHIND THE READOUT'S DOUBLE-CLICK.
 *
 * The control's resting shape is `÷2 [16] ×2`; the 4/8/16/32/64 list is a dropdown
 * the readout opens. So a spec that targets a preset has to open it first. Opening
 * is idempotent — the dropdown stays open until a preset is chosen, Escape, or a
 * press outside — so this is safe to call before every interaction, including
 * consecutive ones.
 */
async function preset(slots: Locator, n: number): Promise<Locator> {
  if ((await slots.locator('[data-resolution-presets]').count()) === 0) {
    await slots.locator('[data-resolution-current]').dblclick()
  }
  return slots.locator(`[data-resolution-step="${n}"]`)
}

test.describe('Grid resolution 4/8/16/32/64 (#479, in the inspector #601)', () => {
  test('the Slots control is in the inspector, not the grid header', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ sn ~")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    const slots = slotsControl(drawer)
    // moved out of the grid…
    await expect(grid.locator('[data-resolution-step]')).toHaveCount(0)
    await expect(grid.locator('[data-resolution-current]')).toHaveCount(0)
    // …and into the inspector, whose resting shape is `÷2 [n] ×2` (#1059)
    await expect(slots.locator('[data-resolution-current]')).toHaveCount(1)
    await expect(slots.locator('[data-resolution-halve]')).toHaveCount(1)
    await expect(slots.locator('[data-resolution-double]')).toHaveCount(1)
    // the presets are BEHIND the readout now — none in the DOM until it is opened,
    // which is the gesture itself and so worth asserting rather than assuming
    await expect(slots.locator('[data-resolution-step]')).toHaveCount(0)
    await slots.locator('[data-resolution-current]').dblclick()
    await expect(slots.locator('[data-resolution-step]')).toHaveCount(5)
  })

  test('step grid: choosing 8 draws 8 columns and leaves the document alone (#1057)', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ sn ~")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    const slots = slotsControl(drawer)

    // 4 columns before; "4" is the active preset
    await expect(grid.locator('[data-seq-cell^="0:"]')).toHaveCount(4)
    await expect((await preset(slots, 4))).toHaveAttribute(
      'data-resolution-active',
      'true',
    )
    // …and 8 announces itself as a VIEW before it is pressed, so a user can tell
    // that it is safe without having to press it and read their file afterwards.
    await expect((await preset(slots, 8))).toHaveAttribute(
      'data-resolution-view',
      'true',
    )

    await (await preset(slots, 8)).click()
    await page.waitForTimeout(120)

    // THE GRID REFINES…
    await expect(grid.locator('[data-seq-cell^="0:"]')).toHaveCount(8)
    await expect((await preset(slots, 8))).toHaveAttribute(
      'data-resolution-active',
      'true',
    )
    // …AND THE DOCUMENT IS BYTE-IDENTICAL. This assertion used to read
    // `'$: s("bd ~ ~ ~ sn ~ ~ ~")'` — the spec encoded the very defect #1057 was
    // filed against, which is why it had to be changed rather than kept green.
    expect(await getStrudelCode(page)).toBe('$: s("bd ~ sn ~")')

    // and it is reversible the same way it was entered — still without a write
    await (await preset(slots, 4)).click()
    await page.waitForTimeout(120)
    await expect(grid.locator('[data-seq-cell^="0:"]')).toHaveCount(4)
    expect(await getStrudelCode(page)).toBe('$: s("bd ~ sn ~")')
    expect(errors).toEqual([])
  })

  test('step grid: a refined view writes only once you actually place a note (#1057)', async ({
    page,
  }) => {
    // The other half of the rule. Refining must not write — but the finer grid has
    // to be REAL, and the only proof of that is placing a note the document could
    // not previously express and seeing it land where it was clicked.
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ sn ~")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    const slots = slotsControl(drawer)

    await (await preset(slots, 8)).click()
    await page.waitForTimeout(120)
    expect(await getStrudelCode(page)).toBe('$: s("bd ~ sn ~")') // still untouched

    // column 1 exists only at the refined resolution — it is between the source's
    // own columns 0 and 1, so this is a note the document could not previously hold
    await grid.locator('[data-seq-cell="0:1"]').click()
    await page.waitForTimeout(150)

    const after = await getStrudelCode(page)
    expect(after).not.toBe('$: s("bd ~ sn ~")') // NOW it writes
    // ⚠ OBSERVED, and not what a flattening prediction would say. The writer does NOT
    // respell the pattern as eight columns — it edits the ONE region the user touched
    // and leaves `~ sn ~` byte-identical, spelling the new subdivision as a group.
    // That is the element writer's locality promise doing its job, and the two are the
    // same music: `[bd bd]` occupies the first quarter, so the onsets are 0 and 1/8,
    // exactly where `bd bd ~ ~ …` at eight columns would put them. The minimal edit is
    // the better answer, and the phase did not have to ask for it.
    expect(after).toBe('$: s("[bd bd] ~ sn ~")')
    // The refinement is absorbed, and the view stays at eight columns WITHOUT a view
    // scale — the document now genuinely expresses eighth-note resolution, so the
    // reader derives eight columns from the onsets themselves.
    await expect(grid.locator('[data-seq-cell^="0:"]')).toHaveCount(8)
    await expect((await preset(slots, 8))).toHaveAttribute(
      'data-resolution-active',
      'true',
    )
    expect(errors).toEqual([])
  })

  /**
   * ── THE TWO COARSENING ARMS, RE-BASED (#1061) ────────────────────────────────
   *
   * Both of these used to assert that the grid would coarsen: 8→4 as a lossless
   * reduce, and 5→4 as a quantize. Neither is the shipped contract any more, and
   * the change that ended them was P4c (#1047) rather than anything in #1052 —
   * since the printer preserves a note's LENGTH, a note lasting one column of an
   * 8-column grid lasts half a column of a 4-column one, and the grid has no
   * notation for half a column. So the writer declines, the op returns its input
   * unchanged, and an honest control draws the target as unavailable.
   *
   * That is why these two sat red for so long: P4c's own gates measure the ops and
   * the printer, and this is the layer above both. Re-based here against what the
   * ops actually do rather than by accepting whatever the button now happens to
   * report — the unit pins in `resolution.test.ts` assert the same refusal from the
   * other side, and `quantizeStepGridTo` returning its own input is what both rest on.
   *
   * ⚠ EACH ARM CARRIES A CONTROL: a test that only asserts "disabled" would pass just
   * as happily if the control broke and disabled EVERYTHING. So each also names a
   * target on the same pattern that must still be live, which is what makes the
   * refusal specific rather than blanket.
   *
   * Coverage is not lost by this: quantize coarsening is still exercised on the roll
   * below (64→16), where it remains live — 329 offers over 185 units, against 0 on
   * the grid — and the `lossless` state keeps its unit arm in ResolutionControl.test.tsx.
   */
  test('step grid: a target below the document is refused — half a column has no spelling', async ({
    page,
  }) => {
    await boot(page)
    // hits on every 4th column, so 8→4 loses no timing — and is STILL refused, because
    // what it would lose is each note's LENGTH, not its position.
    await setStrudelCode(page, '$: s("bd ~ ~ ~ sn ~ ~ ~")')
    const drawer = await openPattern(page)
    const slots = slotsControl(drawer)

    await expect((await preset(slots, 4))).toBeDisabled()
    await expect((await preset(slots, 4))).toHaveAttribute(
      'title',
      '4 slots — unavailable',
    )
    // CONTROL: the control is alive, and refining the same pattern is free. If this
    // ever goes disabled too, the arm above stops meaning "coarsening is refused".
    await expect((await preset(slots, 16))).toBeEnabled()
    await expect((await preset(slots, 16))).toHaveAttribute(
      'data-resolution-view',
      'true',
    )
    // and the refusal writes nothing at all
    expect(await getStrudelCode(page)).toBe('$: s("bd ~ ~ ~ sn ~ ~ ~")')
  })

  test('step grid: a 5-step pattern is refused the same coarsening, but still refines', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ sn ~ bd")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    const slots = slotsControl(drawer)

    // 4 is below the document's own 5 → refused, for the same length reason
    await expect((await preset(slots, 4))).toBeDisabled()

    // CONTROL, and the half of the old test that survives: 5 has no whole multiple
    // among the presets, so every refine it is offered is a genuine rewrite — cued as
    // one, and it still works. The refusal is specific to going BELOW the document.
    await expect((await preset(slots, 8))).toBeEnabled()
    await expect((await preset(slots, 8))).toHaveAttribute(
      'data-resolution-quantize',
      'true',
    )
    await (await preset(slots, 8)).click()
    await page.waitForTimeout(150)
    expect(await getStrudelCode(page)).toBe('$: s("bd ~ ~ sn ~ ~ bd ~")')
    await expect(grid.locator('[data-seq-cell^="0:"]')).toHaveCount(8)
  })

  /**
   * #1140 — THE ÷2 / ×2 BUTTONS, THROUGH THE BROWSER.
   *
   * #1059 made the relative steps the control's primary gesture and demoted the
   * presets to a dropdown, but every browser arm above still reaches the control
   * through that dropdown. So the gesture a user actually makes was verified only
   * by unit tests driving `ResolutionControl` with a stub `slotState` — which
   * cannot see the wiring between the button and the real model, and that wiring is
   * where the enabled-but-inert class has landed every previous time (#1010 P4c:
   * 483 grid + 123 roll dead targets, whole suite green).
   */
  test('step grid: the ×2 / ÷2 walk refines and returns without ever writing (#1059)', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ sn ~")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    const slots = slotsControl(drawer)
    const up = slots.locator('[data-resolution-double]')
    const down = slots.locator('[data-resolution-halve]')
    const readout = slots.locator('[data-resolution-current]')

    // the document's own resolution, and the readout is the only thing telling the
    // user where they are now that the presets are hidden
    await expect(grid.locator('[data-seq-cell^="0:"]')).toHaveCount(4)
    await expect(readout).toHaveText('4')
    // ×2 announces itself as free BEFORE it is pressed, and carries no write cue
    await expect(up).toHaveAttribute('data-resolution-view', 'true')
    await expect(up).not.toHaveAttribute('data-resolution-writes', 'true')

    // ── climb ──────────────────────────────────────────────────────────────
    await up.click()
    await page.waitForTimeout(120)
    await expect(grid.locator('[data-seq-cell^="0:"]')).toHaveCount(8)
    await expect(readout).toHaveText('8')
    expect(await getStrudelCode(page)).toBe('$: s("bd ~ sn ~")')

    await up.click()
    await page.waitForTimeout(120)
    await expect(grid.locator('[data-seq-cell^="0:"]')).toHaveCount(16)
    await expect(readout).toHaveText('16')
    expect(await getStrudelCode(page)).toBe('$: s("bd ~ sn ~")')

    // ── and back down, which is the half the free zone is easiest to get wrong
    // on: descending through a refined view is a VIEW change all the way to the
    // document's own count (2613 grid standings measured, not one write), and only
    // BELOW that count does it become an edit.
    await down.click()
    await page.waitForTimeout(120)
    await expect(grid.locator('[data-seq-cell^="0:"]')).toHaveCount(8)
    await expect(readout).toHaveText('8')
    expect(await getStrudelCode(page)).toBe('$: s("bd ~ sn ~")')

    await down.click()
    await page.waitForTimeout(120)
    await expect(grid.locator('[data-seq-cell^="0:"]')).toHaveCount(4)
    await expect(readout).toHaveText('4')
    // the whole walk, and the file is the bytes the user typed
    expect(await getStrudelCode(page)).toBe('$: s("bd ~ sn ~")')
    expect(errors).toEqual([])
  })

  test('step grid: ÷2 stops at the document\'s own count rather than quietly editing (#1059)', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ sn ~")')
    const drawer = await openPattern(page)
    const slots = slotsControl(drawer)
    const down = slots.locator('[data-resolution-halve]')

    // At the document's own resolution, ÷2 would go BELOW it — a real coarsening,
    // which the writer declines because P4c preserves note length and half a column
    // has no spelling. Measured over the corpus: 546 of 546 such grid targets are
    // disabled. The control must say so rather than offer a press that does nothing.
    await expect(down).toBeDisabled()
    await expect(down).not.toHaveAttribute('data-resolution-view', 'true')

    // …and after refining, the SAME button becomes free, because now it descends
    // INTO the free zone instead of out of it. One button, two zones, and the
    // difference is where the document's own count sits — not which way it points.
    await slots.locator('[data-resolution-double]').click()
    await page.waitForTimeout(120)
    await expect(down).toBeEnabled()
    await expect(down).toHaveAttribute('data-resolution-view', 'true')
    expect(await getStrudelCode(page)).toBe('$: s("bd ~ sn ~")')
  })

  test('piano roll: reduce a 64-step melody to 16 (quantize) writes a valid 16-slot pattern', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await boot(page)
    await setStrudelCode(
      page,
      '$: note("~ ~ ~ ~ ~ ~ ~ ~ [e4,d5]@4 d5 ~ ~ ~ [g4,a#4]@2 d5 ~ ~ [f5,c#4] ~ ~ b4@4 g4 ~ ~ ~ [c5,d4]@4 e5 ~ f#5 ~ [b4,d4]@2 f5 ~ ~ c5 ~ ~ [g4,a4]@3 d5 ~ ~ ~ d5 e4@8")',
    )
    const drawer = await openPattern(page)
    const slots = slotsControl(drawer)
    // 16 is below the 64-step current → offered as a quantize target
    await expect((await preset(slots, 16))).toBeEnabled()
    await expect((await preset(slots, 16))).toHaveAttribute(
      'data-resolution-quantize',
      'true',
    )
    await (await preset(slots, 16)).click()
    await page.waitForTimeout(150)
    const code = await getStrudelCode(page)
    // the write happened (source changed) and it's a real 16-slot melody
    expect(code).not.toContain('e4@8') // the original long tail is gone
    expect(code).toContain('note(')
    expect(errors).toEqual([])
  })

  test('piano roll: adding slots keeps notes single-slot, and 8→4 round-trips (#607)', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await boot(page)
    await setStrudelCode(page, '$: note("c3 e3 g3 a3")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    const slots = slotsControl(drawer)
    await expect(grid).toHaveCount(1)

    // 4 → 8 is a whole multiple, so it is a VIEW (#1057): the roll draws twice as
    // finely and the document is untouched. This used to assert
    // `'$: note("c3 ~ e3 ~ g3 ~ a3 ~")'` — the rewrite the phase removed.
    await expect((await preset(slots, 8))).toHaveAttribute(
      'data-resolution-view',
      'true',
    )
    await (await preset(slots, 8)).click()
    await page.waitForTimeout(120)
    expect(await getStrudelCode(page)).toBe('$: note("c3 e3 g3 a3")')

    // 8 → 4 returns to the document's own resolution — also a view, also no write.
    await (await preset(slots, 4)).click()
    await page.waitForTimeout(120)
    expect(await getStrudelCode(page)).toBe('$: note("c3 e3 g3 a3")')
    expect(errors).toEqual([])
  })

  test('piano roll: a refined view leaves BOTH the notes and the .gain alone (#1057)', async ({
    page,
  }) => {
    // This was #607's browser coverage for "velocities re-align when slots are
    // added". A whole-multiple target no longer adds slots to the document at all,
    // so the gesture cannot reach that rule any more — and the coordinated write is
    // exactly what must NOT happen here. `.gain` is the second write-back range, so
    // it is the sharper of the two assertions: a view that quietly rewrote only the
    // gain mini would still look right in the roll.
    //
    // #607's re-alignment rule is unchanged and still governs `quantizePianoRollTo`
    // when slots really are added; its coverage is the op-level `#607` cases in
    // `packages/editor/src/visualEdit/notation/__tests__/resolution.test.ts`.
    await boot(page)
    const src = '$: note("c3 e3 g3 a3").gain("1 0.8 0.6 0.4")'
    await setStrudelCode(page, src)
    const drawer = await openPattern(page)
    const slots = slotsControl(drawer)
    await (await preset(slots, 8)).click()
    await page.waitForTimeout(120)
    expect(await getStrudelCode(page)).toBe(src)
  })
})
