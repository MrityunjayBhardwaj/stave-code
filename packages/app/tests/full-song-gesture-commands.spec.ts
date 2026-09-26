import { test, expect, type Page } from '@playwright/test'

/**
 * #1562 — the Song timeline's clip gestures are commands, driven through the
 * real app with a real keyboard and mouse: listed in Settings → Keyboard
 * Shortcuts, rebindable (and the rebind survives a reload AND reaches the
 * timeline), offered by the palette while a section is selected, never fired
 * from outside the focused timeline, and deaf to a modified chord.
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
// arm 0 = [2, bd] of a 4-cycle song → the first ~25% of the width.
const SONG = 'arrange([2, s("bd")], [2, s("hh")])'
const SPLIT = 'arrange([1, s("bd")], [1, s("bd")], [2, s("hh")])'
const DUPLICATED = 'arrange([2, s("bd")], [2, s("bd")], [2, s("hh")])'

async function boot(page: Page): Promise<void> {
  // Only on the FIRST load: an init script runs on every navigation, and the
  // persistence arm reloads — re-seeding then would be harmless here, but the
  // guard keeps the arm about the app's storage, not the fixture's.
  await page.addInitScript(() => {
    try {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('stave:bottomPanel.height', '360')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
    } catch {
      /* ignore */
    }
  })
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

function source(page: Page): Promise<string> {
  return page.evaluate(() => {
    const eds =
      (window as unknown as {
        monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; getValue: () => string } | null }> } }
      }).monaco?.editor?.getEditors?.() ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    return t?.getModel?.()?.getValue?.() ?? ''
  })
}

async function playSong(page: Page): Promise<void> {
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${MOD}+A`)
  await page.keyboard.press('Backspace')
  await page.keyboard.type(SONG, { delay: 8 })
  await page.waitForTimeout(400)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-canvas]').waitFor({ timeout: 10_000 })
  await expect.poll(() => source(page)).toBe(SONG)
  await page.waitForTimeout(400)
}

async function selectFirstSection(page: Page): Promise<void> {
  const box = await page.locator('[data-full-song="grid"]').boundingBox()
  if (!box) throw new Error('no grid box')
  await page.mouse.click(box.x + box.width * 0.12, box.y + 10)
  await expect(page.locator('[data-full-song="clip-selection"]')).toBeVisible({ timeout: 5_000 })
}

async function openKeys(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByText('Keyboard Shortcuts...').click()
  await expect(page.getByTestId('settings-shell')).toBeVisible({ timeout: 4000 })
}

async function closeSettings(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('settings-shell')).toHaveCount(0)
}

/** Nothing changes for a moment — long enough for an edit to have landed. */
async function unchanged(page: Page, want: string): Promise<void> {
  await page.waitForTimeout(700)
  expect(await source(page)).toBe(want)
}

test('the seven are listed under Song timeline, with every key and where they work', async ({ page }) => {
  await boot(page)
  await openKeys(page)
  const section = page.getByTestId('keys-section-Song timeline')
  await expect(section).toBeVisible()
  await expect(section.locator('.kb-row')).toHaveCount(7)
  for (const title of [
    'Duplicate section',
    'Split section in two',
    'Delete section (leave a gap)',
    'Ripple delete section (the song gets shorter)',
    'Insert an empty section after',
    'Rename section',
    'Point section at a different part',
  ]) {
    await expect(section.getByText(title, { exact: true })).toBeVisible()
  }
  // Both keys a delete answers to are shown — a Mac's delete key sends Backspace.
  const del = page.getByTestId('chord-stave.timeline.deleteSection')
  await expect(del).toContainText('Delete')
  await expect(del).toContainText('or')
  await expect(del).toContainText('Backspace')
  await expect(page.getByTestId('when-stave.timeline.deleteSection')).toHaveText(
    'On the Song timeline, with a section selected',
  )
})

test('a rebind survives a reload and reaches the timeline; the old key stops working', async ({ page }) => {
  await boot(page)
  await openKeys(page)
  const chord = page.getByTestId('chord-stave.timeline.splitSection')
  await chord.click()
  await expect(chord).toContainText('Press keys')
  await page.keyboard.press('x')
  await expect(chord).toContainText('X')

  await page.reload({ waitUntil: 'domcontentloaded' })
  await ready(page)
  await openKeys(page)
  await expect(page.getByTestId('chord-stave.timeline.splitSection')).toContainText('X')
  await closeSettings(page)

  await playSong(page)
  await selectFirstSection(page)
  await page.keyboard.press('s')
  await unchanged(page, SONG)
  await page.keyboard.press('x')
  await expect.poll(() => source(page), { timeout: 5_000 }).toBe(SPLIT)
})

test('a modified chord does nothing, and the plain one on the same selection acts', async ({ page }) => {
  await boot(page)
  await playSong(page)
  await selectFirstSection(page)
  await page.keyboard.press('Alt+Backspace')
  await unchanged(page, SONG)
  // ⌘⇧D is not the timeline's: it goes to the command that owns it (Docs
  // search), and the section is not duplicated behind it (#1421).
  await page.keyboard.press(`${MOD}+Shift+D`)
  await expect(page.getByRole('dialog', { name: 'Search documentation' })).toBeVisible()
  await unchanged(page, SONG)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Search documentation' })).toHaveCount(0)
  await expect(page.locator('[data-full-song="clip-selection"]')).toBeVisible()
  await page.locator('[data-full-song="grid"]').focus()
  await page.keyboard.press(`${MOD}+D`)
  await expect.poll(() => source(page), { timeout: 5_000 }).toBe(DUPLICATED)
})

test('a gesture key pressed outside the timeline does nothing, even with a section selected', async ({ page }) => {
  await boot(page)
  await playSong(page)
  await selectFirstSection(page)
  // Move focus off the grid without touching the selection.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
  await expect(page.locator('[data-full-song="clip-selection"]')).toBeVisible()
  await page.keyboard.press('s')
  await page.keyboard.press(`${MOD}+D`)
  await unchanged(page, SONG)
  // Control: the same keystroke with the grid focused does act.
  await page.locator('[data-full-song="grid"]').focus()
  await page.keyboard.press('s')
  await expect.poll(() => source(page), { timeout: 5_000 }).toBe(SPLIT)
})

test('the palette offers a gesture while a section is selected, and runs it', async ({ page }) => {
  await boot(page)
  await playSong(page)
  const input = page.getByPlaceholder('Type a command...')
  const row = page.locator('[data-palette-row]', { hasText: 'Duplicate section' })

  // Nothing selected yet: not offered. No query, so the palette lists every
  // command it offers — an absent row is the command withheld, not a filter or
  // a palette that never rendered.
  await page.keyboard.press(`${MOD}+Shift+P`)
  await expect(input).toBeVisible()
  await expect(page.locator('[data-palette-row]').first()).toBeVisible()
  await expect(row).toHaveCount(0)
  await page.keyboard.press('Escape')

  await selectFirstSection(page)
  await page.keyboard.press(`${MOD}+Shift+P`)
  await input.fill('Duplicate section')
  await expect(row).toBeVisible()
  await page.keyboard.press('Enter')
  await expect.poll(() => source(page), { timeout: 5_000 }).toBe(DUPLICATED)
})
