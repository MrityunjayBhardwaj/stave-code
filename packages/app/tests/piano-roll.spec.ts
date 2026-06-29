/**
 * Piano Roll tab — #383. Note grid over a `note(...)` pattern's mini-notation.
 *
 * Observes:
 *   - a melody renders notes on the right pitch rows / step columns;
 *   - clicking an empty cell places a note that round-trips the mini-notation;
 *   - clicking a note selects it; Delete removes it (#432 — was click-removes);
 *   - a sound pattern (not a melody) falls back to standby.
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

async function openRoll(page: Page) {
  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('[data-bottom-panel="toggle"]').click()
  await drawer.locator('role=tab[name="Pattern"]').click()
  return drawer
}

/** Drag the drawer taller so the whole roll (rows + the velocity lane) is
 *  on-screen. In the short default drawer a low note can sit below the fold; a
 *  raw-mouse drag (unlike `.click()`) doesn't auto-scroll, so enlarge first. */
async function enlargeDrawer(page: Page): Promise<void> {
  const handle = page.locator('[data-bottom-panel="resize-handle"]')
  const hb = await handle.boundingBox()
  if (!hb) return
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + hb.width / 2, hb.y - 320, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(200)
}

// midi: c3=48, e3=52, g3=55
test.describe('Piano Roll (#383)', () => {
  test('renders notes on the right pitch rows and steps', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ e3 g3")')
    const drawer = await openRoll(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    await expect(grid).toHaveCount(1)
    await expect(grid.locator('[data-roll-cell="48:0"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(grid.locator('[data-roll-cell="52:2"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(grid.locator('[data-roll-cell="55:3"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(grid.locator('[data-roll-cell="48:1"]')).toHaveAttribute('aria-pressed', 'false')
  })

  test('shows the note name inside each note bar (#605)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ e3 g3")')
    const drawer = await openRoll(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    // the head cell of each note carries its name (uppercase letter)
    await expect(grid.locator('[data-roll-cell="48:0"] [data-roll-note-name]')).toHaveText('C3')
    await expect(grid.locator('[data-roll-cell="52:2"] [data-roll-note-name]')).toHaveText('E3')
    await expect(grid.locator('[data-roll-cell="55:3"] [data-roll-note-name]')).toHaveText('G3')
    // an empty cell has no name label
    await expect(grid.locator('[data-roll-cell="48:1"] [data-roll-note-name]')).toHaveCount(0)
  })

  test('placing a note round-trips the mini-notation', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ ~ ~")')
    const drawer = await openRoll(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    await grid.locator('[data-roll-cell="52:2"]').click() // place e3 at step 2
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: note("c3 ~ e3 ~")')
  })

  test('clicking a note deletes it (click-toggle)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ ~ ~")')
    const drawer = await openRoll(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    await grid.locator('[data-roll-cell="48:0"]').click() // click a note → removes it
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: note("~ ~ ~ ~")')
  })

  test('dragging a note moves it in pitch and time (#391)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ ~ ~")')
    const drawer = await openRoll(page)
    await enlargeDrawer(page) // a low note can sit below the fold in the short drawer; show it first
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    const from = await grid.locator('[data-roll-cell="48:0"]').boundingBox() // c3 step0
    const to = await grid.locator('[data-roll-cell="52:2"]').boundingBox() // e3 step2
    if (!from || !to) throw new Error('missing cells')
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: note("~ ~ e3 ~")')
  })

  test('dragging the right-edge handle resizes a note duration to `@n` (#391/#405)', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ ~ ~")')
    const drawer = await openRoll(page)
    await enlargeDrawer(page) // a low note can sit below the fold in the short drawer; show it first
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    // grab c3's right-edge resize handle and drag right to step 2 (→ duration 3)
    const handle = await grid.locator('[data-roll-resize="48:0"]').boundingBox()
    const to = await grid.locator('[data-roll-cell="48:2"]').boundingBox()
    if (!handle || !to) throw new Error('missing handle/cell')
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: note("c3@3 ~")')
    // the note now spans steps 0–2 (head + sustained tail cells on)
    await expect(grid.locator('[data-roll-cell="48:2"]')).toHaveAttribute('aria-pressed', 'true')
  })

  test('a near-miss on the right edge resizes (not deletes) the note (#530)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ ~ ~")')
    const drawer = await openRoll(page)
    await enlargeDrawer(page) // a low note can sit below the fold in the short drawer; show it first
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    const cell = await grid.locator('[data-roll-cell="48:0"]').boundingBox()
    const to = await grid.locator('[data-roll-cell="48:2"]').boundingBox()
    if (!cell || !to) throw new Error('missing cells')
    // grab the right edge but land ~6px short of it — a realistic miss inside the
    // note body. Before #530 this started a move and a no-move release DELETED
    // the note; now the right grab zone treats it as resize intent.
    const x = cell.x + cell.width - 6
    const y = cell.y + cell.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, y, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: note("c3@3 ~")')
    await expect(grid.locator('[data-roll-cell="48:2"]')).toHaveAttribute('aria-pressed', 'true')
  })

  test('a near-miss press with no drag does not delete the note (#530)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ ~ ~")')
    const drawer = await openRoll(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    const cell = await grid.locator('[data-roll-cell="48:0"]').boundingBox()
    if (!cell) throw new Error('missing cell')
    // press in the right grab zone, release without moving → resize intent, a
    // no-move resize is a no-op (NOT a delete).
    await page.mouse.move(cell.x + cell.width - 6, cell.y + cell.height / 2)
    await page.mouse.down()
    await page.mouse.up()
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: note("c3 ~ ~ ~")')
  })

  test('pitch range stays put when a note is removed (#391)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c5 ~ ~ ~")') // c5 = midi 72
    const drawer = await openRoll(page)
    const grid = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    await expect(grid.locator('[data-roll-cell="72:0"]')).toHaveCount(1)
    await grid.locator('[data-roll-cell="72:0"]').click() // click c5 → removes it
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toBe('$: note("~ ~ ~ ~")')
    // the c5 row is still rendered (range didn't collapse to the default octave)
    await expect(grid.locator('[data-roll-cell="72:0"]')).toHaveCount(1)
  })

  test('a sound pattern adaptively shows the Sequencer, not the Piano Roll (#398)', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ sn ~")')
    const drawer = await openRoll(page)
    // the Pattern tab switches the grid by pattern kind: a drum pattern gets the
    // Sequencer step grid — the Piano Roll is not shown.
    await expect(drawer.locator('[data-bottom-panel-tab="sequencer"]')).toHaveCount(1)
    await expect(drawer.locator('[data-bottom-panel-tab="piano-roll"]')).toHaveCount(0)
  })

  test('a melody adaptively shows the Piano Roll (#398)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c3 ~ e3 g3")')
    const drawer = await openRoll(page)
    await expect(drawer.locator('[data-bottom-panel-tab="piano-roll"]')).toHaveCount(1)
    await expect(drawer.locator('[data-bottom-panel-tab="sequencer"]')).toHaveCount(0)
  })

  test('the velocity lane scrolls into view inside the grid scroll area (reverted #604/#624)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c1 c6")') // ~5 octaves → rows overflow the panel
    const drawer = await openRoll(page)
    const panel = drawer.locator('[data-bottom-panel-tab="piano-roll"]')
    const scroller = panel.locator('[data-pattern-scroll]')
    const lane = panel.locator('[data-roll-velocity-lane]')
    await expect(lane).toHaveCount(1)
    // The lane is the LAST child INSIDE the scroll area — no longer pinned (#604
    // sticky) or pulled out as a footer (#624). A tall pitch range pushes it
    // below the fold; scrolling the area to the bottom brings it into view (the
    // always-visible scrollbar is how you reach it).
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    await page.waitForTimeout(80)
    await expect(lane).toBeInViewport()
  })

  test('the grid scroll area opts into the always-visible scrollbar (W3)', async ({ page }) => {
    // Cross-package wiring guard: the editor marks the scroll container with
    // `data-pattern-scroll`, and the app's globals.css styles its webkit
    // scrollbar so it's always visible (non-overlay) when the grid overflows.
    // The actual scrollbar paint can't be asserted headless (headless Chromium
    // renders 0-width overlay bars regardless of CSS), so guard the wiring: the
    // attribute is present AND a matching stylesheet rule is loaded.
    await boot(page)
    await setStrudelCode(page, '$: note("c1 c6")')
    const drawer = await openRoll(page)
    const scroller = drawer.locator('[data-bottom-panel-tab="piano-roll"] [data-pattern-scroll]')
    await expect(scroller).toHaveCount(1)
    await expect(scroller).toHaveCSS('overflow-y', 'auto') // visible only when overflowing
    const ruleLoaded = await page.evaluate(() => {
      for (const ss of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(ss.cssRules)) {
            if ((rule as CSSStyleRule).selectorText?.includes('data-pattern-scroll') &&
                (rule as CSSStyleRule).selectorText?.includes('-webkit-scrollbar')) return true
          }
        } catch {
          /* cross-origin sheet — skip */
        }
      }
      return false
    })
    expect(ruleLoaded).toBe(true)
  })
})
