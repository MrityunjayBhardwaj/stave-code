import { test, expect, Page } from '@playwright/test'

/**
 * #571 — an inline `.viz()` must render even when it is NOT the terminal call in
 * the chain. The request is tagged on the returned Pattern instance, but Strudel
 * patterns are immutable, so any method AFTER `.viz()` (`.gain()`, `.sound()`, …)
 * returns a fresh instance that drops the tag and the transpiler-appended `.p()`
 * sees nothing. The engine keeps an eval-scoped fallback so the request survives.
 *
 * Zones mount from the engine's capture (vizRequests), not audio playback, so
 * this runs headless with no audio/WebGL dependency — it asserts only that the
 * `[data-viz-zone]` containers exist with the right `data-viz-zone-id`.
 */
async function evalZones(page: Page, code: string) {
  await page.evaluate((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.setValue(c)
  }, code)
  await page.waitForTimeout(200)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press((process.platform === 'darwin' ? 'Meta' : 'Control') + '+Enter')
  await page.waitForTimeout(3000)
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-viz-zone]')).map((z) => ({
      track: z.getAttribute('data-viz-zone-track'),
      viz: z.getAttribute('data-viz-zone-id'),
    })),
  )
}

test('inline .viz() renders whether or not it is the terminal chain call (#571)', async ({ page }) => {
  await page.goto('/')
  await page.locator('.monaco-editor').waitFor({ timeout: 15000 })
  const code = [
    `$: note("c e g").s("sawtooth").viz('Prism')`,            // terminal
    `$: note("c e g").viz('Prism').gain(0.3)`,                // .viz() + 1 trailing method
    `$: note("c e g").viz('Prism').s("sawtooth").gain(0.3)`,  // .viz() + 2 trailing methods
  ].join('\n') + '\n'
  const zones = await evalZones(page, code)
  // Pre-#571 only the terminal line rendered → 1 zone. All three must render now.
  expect(zones.length).toBe(3)
})

test('a mid-chain track recovers the LATEST .viz() name in its chain (#571)', async ({ page }) => {
  await page.goto('/')
  await page.locator('.monaco-editor').waitFor({ timeout: 15000 })
  const code = [
    `$: note("c e g").viz("Prism").lpf(178).viz("pianoroll").gain(0.8).sound('sin')`, // mid-chain, two viz → latest
    `$: note("c4 e4").s("sawtooth").viz('Prism')`,                                     // terminal control
  ].join('\n') + '\n'
  const zones = await evalZones(page, code)
  expect(zones.length).toBe(2)
  // "last viz in the chain wins" — the mid-chain track resolves to pianoroll, not Prism.
  expect(zones.map((z) => z.viz)).toContain('pianoroll')
  expect(zones.map((z) => z.viz)).toContain('Prism')
})
