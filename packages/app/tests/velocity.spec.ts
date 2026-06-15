/**
 * Per-note velocity (#409) — vertical drag on a cell/note sets its `.gain`.
 *
 * Observes (AnviDev: verify AND observe):
 *   - dragging a Sequencer cell DOWN writes a parallel `.gain("…")` aligned to
 *     the columns, and the cell's fill height drops (a softer hit);
 *   - dragging it back to neutral removes the `.gain` method entirely;
 *   - the `.gain` round-trips: re-reading the code shows the same level.
 * The Piano Roll velocity test lives below once the shared path is extended.
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

async function openSequencer(page: Page): Promise<Locator> {
  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('[data-bottom-panel="toggle"]').click()
  await drawer.locator('role=tab[name="Pattern"]').click()
  return drawer
}

/** Press on a cell, drag vertically by `dy` px (down = positive = softer), release. */
async function dragVertical(page: Page, cell: Locator, dy: number): Promise<void> {
  const box = await cell.boundingBox()
  if (!box) throw new Error('cell has no box')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx, cy + dy, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(100)
}

test.describe('velocity — Sequencer (#409)', () => {
  test('dragging a cell down writes a column-aligned .gain and softens its fill', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd hh sn hh")')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid).toHaveCount(1)

    const hhLast = grid.locator('[data-seq-cell="1:3"]') // hh lane, last column
    await expect(hhLast).toHaveAttribute('aria-pressed', 'true')
    // neutral: no .gain yet
    expect(await strudelValue(page)).toBe('$: s("bd hh sn hh")')

    // drag the last column down ~40px → ~0.5 (VELOCITY_FULL_PX = 80)
    await dragVertical(page, hhLast, 40)

    const code = await strudelValue(page)
    // a parallel .gain appears, aligned to the 4 columns, last one softened
    expect(code).toMatch(/^\$: s\("bd hh sn hh"\)\.gain\("1 1 1 [\d.]+"\)$/)
    const softened = Number(code.match(/\.gain\("1 1 1 ([\d.]+)"\)/)![1])
    expect(softened).toBeGreaterThan(0)
    expect(softened).toBeLessThan(1)

    // OBSERVE the fill: the softened cell's fill is shorter than a neutral one
    const fillH = async (sel: string): Promise<number> => {
      const box = await grid.locator(`${sel} [data-seq-fill]`).boundingBox()
      return box?.height ?? -1
    }
    const softH = await fillH('[data-seq-cell="1:3"]')
    const fullH = await fillH('[data-seq-cell="1:1"]')
    expect(softH).toBeGreaterThan(0)
    expect(softH).toBeLessThan(fullH - 2)
  })

  test('dragging back to neutral removes the .gain method', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd hh sn hh")')
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    const hhLast = grid.locator('[data-seq-cell="1:3"]')

    await dragVertical(page, hhLast, 40) // soften
    expect(await strudelValue(page)).toMatch(/\.gain\(/)

    await dragVertical(page, hhLast, -60) // drag well past full → clamps to neutral
    expect(await strudelValue(page)).toBe('$: s("bd hh sn hh")') // .gain removed
  })

  test('reads an existing column .gain back onto the grid (round-trip)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd hh sn hh").gain("1 0.5 1 0.25")')
    await page.evaluate(() => {
      const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      const eds = (monaco?.editor?.getEditors?.() ?? []) as Array<{
        getModel: () => { getValue: () => string } | null
        focus: () => void
        setPosition: (p: { lineNumber: number; column: number }) => void
      }>
      const t = eds.find((e) => e.getModel()?.getValue?.().includes('bd hh sn hh')) ?? eds[0]
      t?.focus()
      t?.setPosition({ lineNumber: 1, column: 8 }) // inside the head mini
    })
    await page.waitForTimeout(120)
    const drawer = await openSequencer(page)
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    await expect(grid).toHaveCount(1)
    // the softened columns expose their level via data-gain
    await expect(grid.locator('[data-seq-cell="1:1"]')).toHaveAttribute('data-gain', '0.5')
    await expect(grid.locator('[data-seq-cell="1:3"]')).toHaveAttribute('data-gain', '0.25')
    await expect(grid.locator('[data-seq-cell="0:0"]')).toHaveAttribute('data-gain', '1')
  })
})
