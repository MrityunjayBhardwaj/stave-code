/**
 * #1087 — the roll draws every note it carries.
 *
 * Observes (AnviDev: verify AND observe), in the running app, because the defect is
 * invisible to the unit suites by construction: the panel BOUND correctly, populated its
 * keyboard rows, its instrument, its Slots and its Snap, and then drew zero cells — no
 * error, no console warning, no standby message.
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
