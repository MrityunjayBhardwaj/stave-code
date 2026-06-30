/**
 * Mixer: the selected channel strip shows a thin accent border (#639), unified
 * with the editor caret.
 *
 * Selection is DERIVED from the cursor: the strip whose statement holds the caret
 * is selected and gets the `--accent` border (the same purple the Song-timeline
 * clip-selection uses). Clicking a strip moves the caret to that track, so the
 * two directions stay in lockstep:
 *   - click a strip → caret jumps to its code → that strip selected (exclusive);
 *   - move the caret into a track's code → that track's strip selected.
 * Playwright observation — the border colour is read from the live computed
 * style, not inferred.
 */
import { test, expect, type Page } from '@playwright/test'

const EDFN =
  `(()=>{const eds=(window.monaco?.editor?.getEditors?.())??[];` +
  `return eds.find(e=>e.getModel()?.getLanguageId?.()==='strudel')??eds[0]})()`

async function boot(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 15_000 })
  await page.waitForFunction(
    () => ((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco?.editor?.getEditors?.()?.length ?? 0) > 0,
    { timeout: 15_000 },
  )
}

async function openMixer(page: Page) {
  const root = page.locator('[data-bottom-panel="root"]')
  await root.locator('[data-bottom-panel="toggle"]').click()
  await root.locator('role=tab[name="Mixer"]').click()
  return root.locator('[data-bottom-panel-tab="mixer-console"]')
}

const rgb = (page: Page, el: ReturnType<Page['locator']>) =>
  el.evaluate((n) => getComputedStyle(n as HTMLElement).borderTopColor)

/** Set the strudel source + evaluate it (so a known multi-track doc backs the
 *  strips, one track per line → the caret line maps 1:1 to a strip). */
async function setCodeAndEval(page: Page, code: string): Promise<void> {
  await page.evaluate(
    ({ c, EDFN }) => {
      const e = eval(EDFN)
      e.getModel()?.setValue(c)
      e.setPosition({ lineNumber: 1, column: 1 })
      e.focus()
    },
    { c: code, EDFN },
  )
  await page.waitForTimeout(200)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter')
  await page.waitForTimeout(1500)
}

/** Move the editor caret to a (line, column) and focus the editor. */
async function caretTo(page: Page, line: number, column: number): Promise<void> {
  await page.evaluate(
    ({ line, column, EDFN }) => {
      const e = eval(EDFN)
      e.setPosition({ lineNumber: line, column })
      e.focus()
    },
    { line, column, EDFN },
  )
}

test('the selected strip shows a thin accent border; selection is exclusive (#639)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await boot(page)
  const panel = await openMixer(page)
  const strips = panel.locator('[data-mixer-strip-id]')
  await strips.first().waitFor({ timeout: 10_000 })
  expect(await strips.count()).toBeGreaterThanOrEqual(2)

  // The accent token the timeline-select uses; the selected strip must match it.
  const accentRgb = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.color = 'var(--accent, #6ea8fe)'
    document.body.appendChild(probe)
    const c = getComputedStyle(probe).color
    probe.remove()
    return c
  })

  // Nothing selected on first open.
  await expect(panel.locator('[data-mixer-strip-selected]')).toHaveCount(0)
  const idleBorder = await rgb(page, strips.first())

  // Click the first strip → it selects and its border becomes the accent.
  await strips.first().click()
  await expect(strips.first()).toHaveAttribute('data-mixer-strip-selected', '')
  expect(await rgb(page, strips.first())).toBe(accentRgb)
  expect(await rgb(page, strips.first())).not.toBe(idleBorder)

  // Click the second strip → selection moves (exclusive).
  await strips.nth(1).click()
  await expect(strips.nth(1)).toHaveAttribute('data-mixer-strip-selected', '')
  await expect(panel.locator('[data-mixer-strip-selected]')).toHaveCount(1)
  expect(await rgb(page, strips.nth(1))).toBe(accentRgb)

  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})

test("the selected strip's expand drawer also shows the accent border (#639)", async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await boot(page)
  const panel = await openMixer(page)
  const strips = panel.locator('[data-mixer-strip-id]')
  await strips.first().waitFor({ timeout: 10_000 })

  const accentRgb = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.color = 'var(--accent, #6ea8fe)'
    document.body.appendChild(probe)
    const c = getComputedStyle(probe).color
    probe.remove()
    return c
  })

  // Select the first strip, then expand it via its ▸ disclosure toggle.
  await strips.first().click()
  const stripId = await strips.first().getAttribute('data-mixer-strip-id')
  await strips.first().locator('[data-mixer-strip-expand]').click()

  // The drawer for THIS strip mounts and adopts the accent border, matching the
  // face — the selected strip + its drawer read as one purple-outlined unit.
  const drawer = panel.locator(`[data-mixer-expand-for="${stripId}"]`)
  await expect(drawer).toHaveCount(1)
  await expect(drawer).toHaveAttribute('data-mixer-expand-selected', '')
  // The OUTER edges (top/right) are accent…
  expect(await rgb(page, drawer)).toBe(accentRgb)
  expect(await rgb(page, strips.first())).toBe(accentRgb)

  // …and the internal seam (the drawer's LEFT border) is DROPPED when selected,
  // so the purple is ONE continuous outline around the whole strip+drawer unit
  // with no divider down the middle — a single unified highlight, not two boxes.
  const seamStyle = await drawer.evaluate((el) => getComputedStyle(el as HTMLElement).borderLeftStyle)
  expect(seamStyle).toBe('none')

  // The (here EMPTY — no effect knobs) drawer is the SAME height as the strip
  // face: it stretches to the face-tall group, so an empty drawer doesn't sit
  // ~150px short of the face (#639).
  await expect(drawer.locator('[data-knob]')).toHaveCount(0)
  const faceH = await strips.first().evaluate((el) => (el as HTMLElement).getBoundingClientRect().height)
  const drawerH = await drawer.evaluate((el) => (el as HTMLElement).getBoundingClientRect().height)
  expect(Math.abs(faceH - drawerH)).toBeLessThanOrEqual(1)

  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})

test('selection is unified with the editor caret — both directions (#639)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await boot(page)
  // One track per line, so a caret line maps 1:1 to a strip.
  await setCodeAndEval(page, 'bass: s("bd*4")\nlead: note("c e g")\nhh: s("hh*8")')
  const panel = await openMixer(page)
  const strips = panel.locator('[data-mixer-strip-id]')
  await strips.first().waitFor({ timeout: 10_000 })
  await expect(strips).toHaveCount(3)

  const sel = () => panel.locator('[data-mixer-strip-selected]')

  // Direction 1 — click the `lead` strip → caret jumps to its line (2) AND the
  // `lead` strip is the (only) selected one.
  await strips.nth(1).click()
  await expect(sel()).toHaveCount(1)
  await expect(sel()).toHaveAttribute('data-mixer-strip-id', 'lead')
  expect(await page.evaluate((EDFN) => eval(EDFN)?.getPosition()?.lineNumber ?? 0, EDFN)).toBe(2)

  // Direction 2 — move the caret into `bass` (line 1) FROM the editor → the
  // `bass` strip becomes the selected one (cursor → strip).
  await caretTo(page, 1, 3)
  await expect(sel()).toHaveCount(1)
  await expect(sel()).toHaveAttribute('data-mixer-strip-id', 'bass')

  // …and into `hh` (line 3) → selection follows again.
  await caretTo(page, 3, 3)
  await expect(sel()).toHaveAttribute('data-mixer-strip-id', 'hh')

  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
