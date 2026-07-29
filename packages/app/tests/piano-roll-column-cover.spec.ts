/**
 * #1087 — the roll draws every note it carries.
 * #1089 — the velocity lane offers a drag only where the gain writer accepts it.
 *
 * Observes (AnviDev: verify AND observe), in the running app, because both defects are
 * invisible to the unit suites by construction: #1087 was a panel that BOUND correctly,
 * populated its keyboard rows, its instrument, its Slots and its Snap, and then drew zero
 * cells — no error, no console warning, no standby message. #1089 was a cursor and a
 * pointer handler on a write the serializer always declined, which leaves every test
 * green because nothing throws; only the document says the drag did nothing.
 */
import { test, expect, type Page, type Locator } from '@playwright/test'

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

async function strudelValue(page: Page): Promise<string> {
  return page.evaluate(() => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } })
      .monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; getValue: () => string } | null
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    return target?.getModel()?.getValue() ?? ''
  })
}

async function openRoll(page: Page): Promise<Locator> {
  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('[data-bottom-panel="toggle"]').click()
  await drawer.locator('role=tab[name="Pattern"]').click()
  return drawer
}

/** how many roll cells exist in the first pitch row — i.e. the drawn column count */
async function drawnColumns(drawer: Locator): Promise<number> {
  const cells = drawer.locator('[data-roll-cell]')
  const n = await cells.count()
  if (n === 0) return 0
  const rows = new Set<string>()
  const cols = new Set<string>()
  for (const v of await cells.evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-roll-cell') ?? ''),
  )) {
    const [row, col] = v.split(':')
    rows.add(row)
    cols.add(col)
  }
  return cols.size
}

test.describe('#1087 — the roll draws every note it carries', () => {
  test('a fractional @n weight no longer empties the panel', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await boot(page)
    // the exact reproduction from #1087: five weights summing to 0.9999999999999998
    await setStrudelCode(page, '$: note("c4@0.2 e4@0.2 g4@0.2 b4@0.2 c5@0.2").sound("piano")')
    const drawer = await openRoll(page)

    // BEFORE the fix this was 0 — the panel bound and drew nothing at all
    const cols = await drawnColumns(drawer)
    expect(cols).toBe(1)

    // and every note is drawn in it: five fills, one per note, in the one column
    const fills = drawer.locator('[data-roll-cell] [data-roll-fill]')
    expect(await fills.count()).toBeGreaterThanOrEqual(5)
    expect(errors).toEqual([])
  })

  test('a note sounding in the partial tail column is drawn', async ({ page }) => {
    await boot(page)
    // 2.7 columns long — the panel drew 2 and the third note was drawn nowhere
    await setStrudelCode(page, '$: note("c4@1.5 e4 g4@0.2").sound("piano")')
    const drawer = await openRoll(page)
    expect(await drawnColumns(drawer)).toBe(3)
    // the code is untouched by merely looking at it
    expect(await strudelValue(page)).toBe('$: note("c4@1.5 e4 g4@0.2").sound("piano")')
  })

  test('CONTROL — a whole-numbered pattern draws exactly what it always did', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c4 e4 g4 b4 c5").sound("piano")')
    const drawer = await openRoll(page)
    expect(await drawnColumns(drawer)).toBe(5)
  })
})

test.describe('#1089 — the velocity lane offers a drag only where it can write', () => {
  test('a pattern the gain writer declines gets a read-only lane', async ({ page }) => {
    await boot(page)
    // `serializeRollGain` skips this: a note beginning mid-column has no gain slot
    await setStrudelCode(page, '$: note("[c5@0.5 f4@0.5 f5@3]")')
    const drawer = await openRoll(page)

    const lane = drawer.locator('[data-roll-velocity-lane]')
    await expect(lane).toHaveCount(1) // it still RENDERS — the bars carry real gains
    const bars = lane.locator('[data-vel-bar]')
    expect(await bars.count()).toBeGreaterThan(0)

    // …but every column says so, and none offers the resize cursor
    const cols = lane.locator('[data-vel-col]')
    const n = await cols.count()
    expect(n).toBeGreaterThan(0)
    for (let i = 0; i < n; i++) {
      await expect(cols.nth(i)).toHaveAttribute('data-vel-readonly', 'true')
    }
    const cursors = await cols.evaluateAll((els) => els.map((e) => getComputedStyle(e).cursor))
    expect(cursors.every((c) => c !== 'ns-resize')).toBe(true)

    // …and the reason is stated where the pointer goes, not only on the lane's label.
    // The panel's other refusal is about PLACEMENT and does not cover velocity.
    await expect(cols.first()).toHaveAttribute('title', /velocities.*code view/)

    // THE OBSERVATION THAT MATTERS: the drag is now refused up front rather than
    // accepted and silently dropped. The document is unchanged either way — what
    // changed is that nothing promised otherwise.
    const before = await strudelValue(page)
    const box = await cols.first().boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.down()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 - 40, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(150)
    expect(await strudelValue(page)).toBe(before)
  })

  test('CONTROL — a pattern the writer accepts keeps its drag, and it writes', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c3 e3 g3 c4")')
    const drawer = await openRoll(page)

    const cols = drawer.locator('[data-roll-velocity-lane] [data-vel-col]')
    expect(await cols.count()).toBe(4)
    // no column is marked read-only here
    expect(await cols.evaluateAll((els) => els.filter((e) => e.hasAttribute('data-vel-readonly')).length)).toBe(0)

    const first = cols.first()
    await first.scrollIntoViewIfNeeded()
    const box = await first.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.down()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 + 40, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(200)

    // the gate did not cost the gesture: this one still writes
    expect(await strudelValue(page)).toMatch(/\.gain\("/)
  })
})
