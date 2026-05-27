import { test, expect, type Page } from '@playwright/test'

// Model B — viz single source of truth (#183, P73 / PV56).
//
// Inline `.viz("pianoroll")` and the `.pianoroll()` backdrop must render the
// SAME editable preset (`Piano Roll.p5`). Before the normalized-lookup fix,
// inline resolved the id "pianoroll" → named-registry miss (preset is named
// "Piano Roll") → fell through to the divergent built-in `PianorollSketch`.
//
// The prior naive "register Piano Roll under the id pianoroll" attempt blanked
// BOTH surfaces, so the load-bearing assertion here is NON-BLANK: the inline
// canvas must actually draw notes, not sit empty.

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

/**
 * Count distinct RGBA colors in a 2D canvas. A blank viz paints one (the
 * background); a rendering viz paints many. Returns 0 if the element isn't a
 * 2D canvas we can read.
 */
async function distinctColors(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const canvas = document.querySelector<HTMLCanvasElement>(sel)
    if (!canvas) return -1
    const ctx = canvas.getContext('2d')
    if (!ctx) return -2 // WEBGL / unreadable
    const { width, height } = canvas
    if (width === 0 || height === 0) return -3
    const data = ctx.getImageData(0, 0, width, height).data
    const seen = new Set<number>()
    // Sample every 40th pixel — enough to distinguish blank from drawn.
    for (let i = 0; i < data.length; i += 4 * 40) {
      seen.add((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3])
      if (seen.size > 8) break
    }
    return seen.size
  }, selector)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(1000)
})

test('inline .viz("pianoroll") mounts a non-blank zone (resolves to the preset, not the built-in)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))

  await setCode(page, `setcps(1)\n$: note("c e g a c5 g4 e4 c4").s("piano").viz("pianoroll")`)
  await runCode(page)
  // Let several p5 frames run so the buffered scheduler fills with haps.
  await page.waitForTimeout(2000)

  const zone = page.locator('[data-viz-zone][data-viz-zone-id="pianoroll"]')
  await expect(zone).toHaveCount(1, { timeout: 6000 })
  const canvas = zone.locator('canvas')
  await expect(canvas).toHaveCount(1)

  const colors = await distinctColors(page, '[data-viz-zone][data-viz-zone-id="pianoroll"] canvas')
  // > 1 distinct color ⇒ the sketch drew notes, not just the background.
  expect(colors).toBeGreaterThan(1)

  await zone.screenshot({ path: 'test-results/inline-pianoroll.png' })
  expect(errors).toEqual([])
})

test('.pianoroll() backdrop renders a non-blank canvas', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))

  await setCode(page, `setcps(1)\n$: note("c e g a c5 g4 e4 c4").s("piano").pianoroll()`)
  await runCode(page)
  await page.waitForTimeout(2000)

  const bg = page.locator('[data-workspace-background]')
  await expect(bg).toHaveCount(1, { timeout: 6000 })

  const colors = await distinctColors(page, '[data-workspace-background] canvas')
  expect(colors).toBeGreaterThan(1)

  await bg.screenshot({ path: 'test-results/backdrop-pianoroll.png' })
  expect(errors).toEqual([])
})
