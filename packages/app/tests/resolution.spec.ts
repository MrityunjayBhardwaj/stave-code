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

test.describe('Grid resolution 4/8/16/32/64 (#479, in the inspector #601)', () => {
  test('the Slots control is in the inspector, not the grid header', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ sn ~")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    // moved out of the grid…
    await expect(grid.locator('[data-resolution-step]')).toHaveCount(0)
    // …and into the inspector
    await expect(slotsControl(drawer).locator('[data-resolution-step]')).toHaveCount(5)
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
    await expect(slots.locator('[data-resolution-step="4"]')).toHaveAttribute(
      'data-resolution-active',
      'true',
    )
    // …and 8 announces itself as a VIEW before it is pressed, so a user can tell
    // that it is safe without having to press it and read their file afterwards.
    await expect(slots.locator('[data-resolution-step="8"]')).toHaveAttribute(
      'data-resolution-view',
      'true',
    )

    await slots.locator('[data-resolution-step="8"]').click()
    await page.waitForTimeout(120)

    // THE GRID REFINES…
    await expect(grid.locator('[data-seq-cell^="0:"]')).toHaveCount(8)
    await expect(slots.locator('[data-resolution-step="8"]')).toHaveAttribute(
      'data-resolution-active',
      'true',
    )
    // …AND THE DOCUMENT IS BYTE-IDENTICAL. This assertion used to read
    // `'$: s("bd ~ ~ ~ sn ~ ~ ~")'` — the spec encoded the very defect #1057 was
    // filed against, which is why it had to be changed rather than kept green.
    expect(await getStrudelCode(page)).toBe('$: s("bd ~ sn ~")')

    // and it is reversible the same way it was entered — still without a write
    await slots.locator('[data-resolution-step="4"]').click()
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

    await slots.locator('[data-resolution-step="8"]').click()
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
    await expect(slots.locator('[data-resolution-step="8"]')).toHaveAttribute(
      'data-resolution-active',
      'true',
    )
    expect(errors).toEqual([])
  })

  test('step grid: a lossless reduce keeps timing and is shown as a normal preset', async ({
    page,
  }) => {
    await boot(page)
    // hits only on every 4th column → 8→4 is lossless
    await setStrudelCode(page, '$: s("bd ~ ~ ~ sn ~ ~ ~")')
    const drawer = await openPattern(page)
    const slots = slotsControl(drawer)
    await expect(slots.locator('[data-resolution-step="4"]')).toBeEnabled()
    await expect(slots.locator('[data-resolution-step="4"]')).not.toHaveAttribute(
      'data-resolution-quantize',
      'true',
    )
    await slots.locator('[data-resolution-step="4"]').click()
    await page.waitForTimeout(120)
    expect(await getStrudelCode(page)).toBe('$: s("bd ~ sn ~")')
  })

  test('step grid: a non-power-of-2 (5-step) pattern can still be reduced (quantize)', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ sn ~ bd")')
    const drawer = await openPattern(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    const slots = slotsControl(drawer)
    // every preset is OFFERED (quantize), not disabled — and marked as quantize
    await expect(slots.locator('[data-resolution-step="4"]')).toBeEnabled()
    await expect(slots.locator('[data-resolution-step="4"]')).toHaveAttribute(
      'data-resolution-quantize',
      'true',
    )
    // reduce 5 → 4: hits snap to the nearest of the 4 slots
    await slots.locator('[data-resolution-step="4"]').click()
    await page.waitForTimeout(120)
    expect(await getStrudelCode(page)).toBe('$: s("bd ~ sn bd")')
    await expect(grid.locator('[data-seq-cell^="0:"]')).toHaveCount(4)
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
    await expect(slots.locator('[data-resolution-step="16"]')).toBeEnabled()
    await expect(slots.locator('[data-resolution-step="16"]')).toHaveAttribute(
      'data-resolution-quantize',
      'true',
    )
    await slots.locator('[data-resolution-step="16"]').click()
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
    await expect(slots.locator('[data-resolution-step="8"]')).toHaveAttribute(
      'data-resolution-view',
      'true',
    )
    await slots.locator('[data-resolution-step="8"]').click()
    await page.waitForTimeout(120)
    expect(await getStrudelCode(page)).toBe('$: note("c3 e3 g3 a3")')

    // 8 → 4 returns to the document's own resolution — also a view, also no write.
    await slots.locator('[data-resolution-step="4"]').click()
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
    await slots.locator('[data-resolution-step="8"]').click()
    await page.waitForTimeout(120)
    expect(await getStrudelCode(page)).toBe(src)
  })
})
