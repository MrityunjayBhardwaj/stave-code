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

/** The accent token (`--accent`) resolved to an `rgb(...)` string. */
async function accent(page: Page): Promise<string> {
  return page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.color = 'var(--accent, #6ea8fe)'
    document.body.appendChild(probe)
    const c = getComputedStyle(probe).color
    probe.remove()
    return c
  })
}

/** The wrapper group div for a strip id, scoped to the console panel. */
function groupFor(panel: ReturnType<Page['locator']>, stripId: string) {
  return panel.locator(`[data-mixer-strip-group]:has([data-mixer-strip-id="${stripId}"])`)
}

test('the selected strip is highlighted by a single accent ring on its wrapper; exclusive (#639)', async ({ page }) => {
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
  const accentRgb = await accent(page)

  // Nothing selected on first open — and the strip FACE border is the neutral
  // one (the highlight is NOT on the face; it's the wrapper's ring).
  await expect(panel.locator('[data-mixer-strip-group-selected]')).toHaveCount(0)
  expect(await rgb(page, strips.first())).not.toBe(accentRgb)

  // Click the first strip → its WRAPPER gets the accent ring (box-shadow); the
  // face border itself stays neutral.
  await strips.first().click()
  const id0 = (await strips.first().getAttribute('data-mixer-strip-id')) as string
  await expect(groupFor(panel, id0)).toHaveAttribute('data-mixer-strip-group-selected', '')
  expect(await groupFor(panel, id0).evaluate((el) => getComputedStyle(el as HTMLElement).boxShadow)).toContain(accentRgb)
  expect(await rgb(page, strips.first())).not.toBe(accentRgb) // face border still neutral

  // Click the second strip → the ring moves (exactly one wrapper highlighted).
  await strips.nth(1).click()
  const id1 = (await strips.nth(1).getAttribute('data-mixer-strip-id')) as string
  await expect(groupFor(panel, id1)).toHaveAttribute('data-mixer-strip-group-selected', '')
  await expect(panel.locator('[data-mixer-strip-group-selected]')).toHaveCount(1)
  expect(await groupFor(panel, id1).evaluate((el) => getComputedStyle(el as HTMLElement).boxShadow)).toContain(accentRgb)

  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})

test('the wrapper ring encapsulates the expanded drawer — one highlight around the whole unit (#639)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await boot(page)
  const panel = await openMixer(page)
  const strips = panel.locator('[data-mixer-strip-id]')
  await strips.first().waitFor({ timeout: 10_000 })
  const accentRgb = await accent(page)

  // Select the first strip, then expand it via its ▸ disclosure toggle.
  await strips.first().click()
  const stripId = (await strips.first().getAttribute('data-mixer-strip-id')) as string
  await strips.first().locator('[data-mixer-strip-expand]').click()

  const drawer = panel.locator(`[data-mixer-expand-for="${stripId}"]`)
  await expect(drawer).toHaveCount(1)

  // The wrapper ring is ONE accent box-shadow that now bounds BOTH the face and
  // the drawer (the group contains both), so it automatically grew to wrap the
  // drawer when expanded. The drawer keeps its OWN neutral border + translucent
  // bg (it is not separately highlighted).
  const group = groupFor(panel, stripId)
  expect(await group.evaluate((el) => getComputedStyle(el as HTMLElement).boxShadow)).toContain(accentRgb)
  const groupBox = await group.boundingBox()
  const drawerBox = await drawer.boundingBox()
  // the drawer lies inside the highlighted group's bounds (the ring wraps it)
  expect(drawerBox!.x + drawerBox!.width).toBeLessThanOrEqual(groupBox!.x + groupBox!.width + 2)
  // the drawer's own border is NOT accent (highlight isn't on the drawer)
  expect(await rgb(page, drawer)).not.toBe(accentRgb)

  // The (here EMPTY — no effect knobs) drawer is the SAME height as the strip
  // face: it stretches to the face-tall group (#639 height parity).
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
