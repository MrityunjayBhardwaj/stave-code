/**
 * #866 follow-up — editing a RESOLVED binding's dial writes back to the const
 * DEFINITION, end-to-end through the real app (not just the offset unit test).
 *
 * A note voice bound to a const and referenced as `$: bass` renders an editable
 * strip (chunkDetect resolution). Setting a custom range on its `room` dial must
 * rewrite `const bass = note(...).room(...)`, the single source of truth — NOT
 * the `$: bass` usage, and NOT a stale/duplicated site.
 */
import { test, expect, type Page } from '@playwright/test'

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '360')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'pattern')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 20_000 },
  )
}

async function setStrudelCode(page: Page, code: string): Promise<void> {
  await page.evaluate((c) => {
    const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null; focus: () => void }> } } }).monaco
    const eds = m?.editor?.getEditors?.() ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    t?.getModel()?.setValue(c)
    t?.focus()
  }, code)
  await page.waitForTimeout(200)
}

async function strudelValue(page: Page): Promise<string> {
  return page.evaluate(() => {
    const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; getValue: () => string } | null }> } } }).monaco
    const eds = m?.editor?.getEditors?.() ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    return t?.getModel()?.getValue() ?? ''
  })
}

test('a dial edit on a bound-ref track writes to the const definition', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  await boot(page)
  const root = page.locator('[data-bottom-panel="root"]')
  await root.locator('[data-bottom-panel="toggle"]').click().catch(() => {})
  await root.locator('role=tab[name="Pattern"]').click()

  // The voice is defined once and referenced by name.
  await setStrudelCode(page, 'const bass = note("c2 e2").room(0.4)\n$: bass')

  // Enlarge the drawer so the dial + its range popup have room to render.
  const handle = page.locator('[data-bottom-panel="resize-handle"]')
  const hb = await handle.boundingBox()
  if (hb) {
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
    await page.mouse.down()
    await page.mouse.move(hb.x + hb.width / 2, hb.y - 320, { steps: 8 })
    await page.mouse.up()
  }

  // Select the `$: bass` usage (line 2) — where the user clicks the track and
  // where detectChunk resolves the ref (the const line is a VariableDeclaration,
  // which yields no chunk).
  await page.evaluate(() => {
    const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string } | null; setPosition: (p: { lineNumber: number; column: number }) => void; focus: () => void }> } } }).monaco
    const eds = m?.editor?.getEditors?.() ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    t?.setPosition({ lineNumber: 2, column: 5 })
    t?.focus()
  })
  await page.waitForTimeout(500)

  // The resolved strip exposes the bound voice's room dial (proves the drawer
  // got the resolved chunk, not an opaque code strip).
  const slider = root.locator('[data-knob="room"] [role="slider"]').first()
  await expect(slider).toBeVisible({ timeout: 10_000 })

  // Set a custom range via the dial popup → the app writes .room(v, min, max).
  await slider.dblclick()
  const popup = page.locator('[data-knob-range-popup="room"]')
  await expect(popup).toBeVisible({ timeout: 5_000 })
  await popup.locator('[data-knob-range-input="min"]').fill('0')
  await popup.locator('[data-knob-range-input="max"]').fill('100')
  await popup.locator('[data-knob-range-apply]').click()

  // The write landed on the CONST definition; the `$: bass` usage is untouched.
  await expect
    .poll(() => strudelValue(page), { timeout: 10_000 })
    .toBe('const bass = note("c2 e2").room(0.4, 0, 100)\n$: bass')

  expect(errors).toEqual([])
})
