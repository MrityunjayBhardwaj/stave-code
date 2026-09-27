import { test, expect, type Page, type Locator } from '@playwright/test'

/**
 * #1801 — the piano roll's keys are commands, driven through the real app:
 * listed in Settings → Keyboard Shortcuts under their own group, rebindable
 * (the rebind survives a reload AND reaches the roll, the old key stops),
 * offered by the palette only while a note is selected, and deaf to a modified
 * chord. The expected text of a keyboard delete is recorded by deleting the same
 * note with the mouse first, never predicted.
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const PATTERN = '$: note("c3 ~ ~ ~ ~ ~ ~ ~")'

async function boot(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await ready(page)
}

async function ready(page: Page): Promise<void> {
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () =>
      ((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco?.editor?.getEditors?.()
        ?.length ?? 0) > 0,
    { timeout: 20_000 },
  )
}

type Ed = {
  getModel: () => { getLanguageId?: () => string; getValue: () => string; setValue: (s: string) => void } | null
  focus: () => void
  setPosition: (p: { lineNumber: number; column: number }) => void
}

async function setCode(page: Page, code: string): Promise<void> {
  await page.evaluate((c) => {
    const eds = ((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco?.editor?.getEditors?.() ??
      []) as Ed[]
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    t?.getModel()?.setValue(c)
    t?.setPosition({ lineNumber: 1, column: 6 })
    t?.focus()
  }, code)
  await page.waitForTimeout(200)
}

function source(page: Page): Promise<string> {
  return page.evaluate(() => {
    const eds = ((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco?.editor?.getEditors?.() ??
      []) as Ed[]
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    return t?.getModel()?.getValue() ?? ''
  })
}

async function openRoll(page: Page): Promise<Locator> {
  const drawer = page.locator('[data-bottom-panel="root"]')
  if (!(await drawer.locator('role=tab[name="Pattern"]').isVisible())) {
    await drawer.locator('[data-bottom-panel="toggle"]').click()
  }
  await drawer.locator('role=tab[name="Pattern"]').click()
  const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
  await expect(grid.locator('[data-roll-cell="48:0"]')).toBeVisible({ timeout: 10_000 })
  return grid
}

/** ⌘-click selects a cell without editing it (#528). */
async function selectC3(page: Page, grid: Locator): Promise<void> {
  await grid.locator('[data-roll-cell="48:0"]').click({ modifiers: [MOD] })
  await expect(grid.locator('[data-roll-cell="48:0"]')).toHaveAttribute('data-roll-selected', 'true')
  expect(await source(page)).toBe(PATTERN)
}

/** What deleting the c3 with the MOUSE writes (a plain click on the note's head). */
async function mouseDelete(page: Page, grid: Locator): Promise<string> {
  await grid.locator('[data-roll-cell="48:0"]').click({ position: { x: 3, y: 5 } })
  await expect.poll(() => source(page), { timeout: 5_000 }).not.toBe(PATTERN)
  const want = await source(page)
  await setCode(page, PATTERN)
  return want
}

async function openKeys(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByText('Keyboard Shortcuts...').click()
  await expect(page.getByTestId('settings-shell')).toBeVisible({ timeout: 4000 })
}

async function unchanged(page: Page, want: string): Promise<void> {
  await page.waitForTimeout(700)
  expect(await source(page)).toBe(want)
}

test('the piano roll has its own group in Settings, with every key and where they work', async ({ page }) => {
  await boot(page)
  await openKeys(page)
  const section = page.getByTestId('keys-section-Piano roll')
  await expect(section).toBeVisible()
  // Delete / Copy / Paste (#1801), plus the toggle and eight cursor keys (#1802).
  await expect(section.locator('.kb-row')).toHaveCount(12)
  for (const title of [
    'Delete selected note',
    'Copy selected note',
    'Paste note at selected cell',
    'Add or remove a note at the cursor',
    'Move cursor right',
  ]) {
    await expect(section.getByText(title, { exact: true })).toBeVisible()
  }
  const del = page.getByTestId('chord-stave.pianoRoll.deleteNote')
  await expect(del).toContainText('Delete')
  await expect(del).toContainText('Backspace')
  await expect(page.getByTestId('when-stave.pianoRoll.deleteNote')).toHaveText(
    'In the piano roll, on the selected cell',
  )
})

test('the sequencer has its own group too, with its toggle, clear and cursor keys (#1802)', async ({ page }) => {
  await boot(page)
  await openKeys(page)
  const section = page.getByTestId('keys-section-Sequencer')
  await expect(section).toBeVisible()
  await expect(section.locator('.kb-row')).toHaveCount(10)
  const clear = page.getByTestId('chord-stave.sequencer.clearStep')
  await expect(clear).toContainText('Delete')
  await expect(clear).toContainText('Backspace')
  await expect(page.getByTestId('chord-stave.sequencer.cursorRight')).toContainText('→')
  await expect(page.getByTestId('chord-stave.sequencer.toggleStep')).toContainText("'")
})

test('a rebind survives a reload and reaches the roll; the old key stops working', async ({ page }) => {
  await boot(page)
  await openKeys(page)
  const chord = page.getByTestId('chord-stave.pianoRoll.deleteNote')
  await chord.click()
  await expect(chord).toContainText('Press keys')
  await page.keyboard.press('x')
  await expect(chord).toContainText('X')

  await page.reload({ waitUntil: 'domcontentloaded' })
  await ready(page)
  await openKeys(page)
  await expect(page.getByTestId('chord-stave.pianoRoll.deleteNote')).toContainText('X')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('settings-shell')).toHaveCount(0)

  await setCode(page, PATTERN)
  const grid = await openRoll(page)
  const want = await mouseDelete(page, grid)
  await selectC3(page, grid)
  await page.keyboard.press('Delete')
  await page.keyboard.press('Backspace')
  await unchanged(page, PATTERN)
  await page.keyboard.press('x')
  await expect.poll(() => source(page), { timeout: 5_000 }).toBe(want)
})

test('Delete writes what the mouse writes; a modified Delete does nothing', async ({ page }) => {
  await boot(page)
  await setCode(page, PATTERN)
  const grid = await openRoll(page)
  const want = await mouseDelete(page, grid)
  await selectC3(page, grid)
  await page.keyboard.press('Alt+Backspace')
  await page.keyboard.press(`${MOD}+Shift+C`)
  await unchanged(page, PATTERN)
  await page.keyboard.press('Backspace')
  await expect.poll(() => source(page), { timeout: 5_000 }).toBe(want)
})

test('the palette offers Delete selected note only while a note is selected, and runs it', async ({ page }) => {
  await boot(page)
  await setCode(page, PATTERN)
  const grid = await openRoll(page)
  const input = page.getByPlaceholder('Type a command...')
  const row = page.locator('[data-palette-row]', { hasText: 'Delete selected note' })

  // Nothing selected: not offered. No query, so an absent row is the command
  // withheld, not a filter. Asked BEFORE any click: a plain click moves the
  // roll's cursor (#1802), which selects.
  await grid.focus()
  await page.keyboard.press(`${MOD}+Shift+P`)
  await expect(input).toBeVisible()
  await expect(page.locator('[data-palette-row]').first()).toBeVisible()
  await expect(row).toHaveCount(0)
  await page.keyboard.press('Escape')

  const want = await mouseDelete(page, grid)

  await selectC3(page, grid)
  await page.keyboard.press(`${MOD}+Shift+P`)
  await input.fill('Delete selected note')
  await expect(row).toBeVisible()
  await page.keyboard.press('Enter')
  await expect.poll(() => source(page), { timeout: 5_000 }).toBe(want)
})
