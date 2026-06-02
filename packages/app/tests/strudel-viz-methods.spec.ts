import { test, expect, type Page } from '@playwright/test'

// Strudel-official viz methods (#174). Pasted Strudel viz code must work
// out of the gate, mirroring Strudel's inline-vs-fullscreen semantic:
//   - `._name()` (underscore) → inline viz zone
//   - `.name()`  (non-underscore) → Stave backdrop ("set bg") + UI update
// and NEVER strudel's own fullscreen `#test-canvas` (which Stave doesn't load).

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function setCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
    if (!e) return false
    e.getModel()?.setValue(c)
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(150)
}

async function runCode(page: Page): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2500)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(1000)
})

test('non-underscore .scope() pins the backdrop and updates the "set bg" indicator', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))

  await setCode(page, `$: note("c e g").s("sawtooth").scope()`)
  await runCode(page)

  const bgIndicator = page.locator('[data-pinned]')
  await expect(bgIndicator).toHaveAttribute('data-pinned', 'true', { timeout: 6000 })
  await expect(bgIndicator).toContainText(/bg:.*scope/i)
  await expect(page.locator('[data-workspace-background]')).toHaveCount(1)
  // strudel's own fullscreen canvas must NOT be injected
  expect(await page.locator('canvas#test-canvas').count()).toBe(0)
  expect(errors).toEqual([])
})

test('non-underscore .pianoroll() resolves to "Piano Roll.p5" via normalized basename', async ({ page }) => {
  await setCode(page, `$: note("c e g").s("sawtooth").pianoroll()`)
  await runCode(page)
  const bgIndicator = page.locator('[data-pinned]')
  await expect(bgIndicator).toHaveAttribute('data-pinned', 'true', { timeout: 6000 })
  await expect(bgIndicator).toContainText(/bg:.*piano/i)
})

test('removing the non-underscore method clears the backdrop (code is source of truth)', async ({ page }) => {
  await setCode(page, `$: note("c e g").s("sawtooth").scope()`)
  await runCode(page)
  await expect(page.locator('[data-pinned]')).toHaveAttribute('data-pinned', 'true', { timeout: 6000 })

  // Remove the .scope() call. Manual Ctrl+Enter while playing is a no-op
  // in this codebase (re-eval comes from live mode or stop+play), so force
  // a fresh evaluate via stop+play to verify the clear semantic.
  await setCode(page, `$: note("c e g").s("sawtooth")`)
  await page.keyboard.press(`${MOD}+.`) // stop
  await page.waitForTimeout(500)
  await runCode(page) // play → fresh eval
  await expect(page.locator('[data-pinned]')).toHaveAttribute('data-pinned', 'false', { timeout: 6000 })
})

test('underscore ._punchcard() and ._tscope() render inline with no error and no fullscreen canvas', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))

  await setCode(page, `$: note("c e g").s("sawtooth")._punchcard()\n$: s("hh*8")._tscope()`)
  await runCode(page)

  expect(await page.locator('canvas#test-canvas').count()).toBe(0)
  // underscore forms are inline only — they must NOT pin the backdrop
  await expect(page.locator('[data-pinned]')).toHaveAttribute('data-pinned', 'false')
  expect(errors).toEqual([])
})

test('inline pianoroll mounts at its taller 1.6:1 native, not the generic 2:1 (de-elongation, #214)', async ({ page }) => {
  // The bundled Piano Roll declares nativeSize 1200×750 (1.6:1) so pitch lanes
  // aren't squashed against the time axis. Regression guard against the
  // flushToPreset race that stripped nativeSize → fell back to 2:1.
  await setCode(page, `$: note("c3 e3 g3 c4").s("sawtooth")._pianoroll()`)
  await runCode(page)
  const zone = page.locator('[data-viz-zone-track]').first()
  await expect(zone).toBeVisible({ timeout: 6000 })
  const aspect = await zone.evaluate((z) => {
    const r = z.getBoundingClientRect()
    return r.width / r.height
  })
  // 1.6:1 ≈ 1.6; the old broken value was 2.0. Assert clearly under 1.8.
  expect(aspect).toBeGreaterThan(1.4)
  expect(aspect).toBeLessThan(1.8)
})

test('inline ._pianoroll(options) — the options object reaches the sketch and renders (no error) (#214)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))

  // labels / vertical / absolute-axis options all evaluate cleanly and produce
  // an inline viz-zone canvas. Asserts the engine→bag→stave.options plumbing,
  // not the pixels (those are observed manually).
  for (const opts of ['{ labels: 1 }', '{ vertical: 1 }', '{ fold: 0, minMidi: 36, maxMidi: 84 }']) {
    await setCode(page, `$: note("c3 e3 g3 c4").s("sawtooth")._pianoroll(${opts})`)
    await runCode(page)
    await expect(page.locator('[data-viz-zone-track] canvas').first()).toBeVisible({ timeout: 6000 })
    // options on the inline form must not pin a backdrop
    await expect(page.locator('[data-pinned]')).toHaveAttribute('data-pinned', 'false')
    await page.keyboard.press(`${MOD}+.`)
    await page.waitForTimeout(300)
  }
  expect(errors).toEqual([])
})
