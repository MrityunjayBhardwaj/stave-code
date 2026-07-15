/**
 * Hydra `stave.options` end-to-end (#883).
 *
 * The unit tests prove the wiring; this proves the PRODUCT. That distinction is
 * not academic here — #880 is the precedent: p5 options had unit tests and a
 * green main-thread path, and were still silently dead in the WORKER, which is
 * the default renderer (#245). Everything below therefore runs on the default
 * path, and reads pixels through the compositor — a worker canvas is transferred
 * to offscreen, so `getContext('2d')` on it THROWS and every probe that used it
 * was dead code (#875).
 *
 * The probe PAINTS the option values it receives into colour channels rather than
 * handing them back on a global: hydra runs in the worker, where `globalThis` is
 * the worker scope and any `window.__x` channel is unreachable from the page.
 */

import { test, expect, type Page } from '@playwright/test'
import { bootApp, seedCode, evalCode } from './_appBoot'
import { vizPixelStats } from './_vizFrames'

// Paints exactly the r/g/b it reads from `stave.options`. If the bag never
// arrives, `o` is `{}`, every channel is 0, and the canvas paints BLACK — which
// is precisely the silent failure this guards: a sketch drawing its default.
const PROBE = `// E2E — paint whatever stave.options carries.
const o = (typeof stave !== 'undefined' && stave.options) ? stave.options : {}
s.solid(o.r ?? 0, o.g ?? 0, o.b ?? 0).out()`

const SEL = '[data-viz-zone] canvas'
const RED = { rMin: 121, gMax: 79, bMax: 89 }
const GREEN = { gMin: 121, rMax: 79, bMax: 89 }

async function registerProbe(page: Page): Promise<boolean> {
  return page.evaluate((code) => {
    const w = window as unknown as { __staveRegisterViz?: (p: unknown) => boolean }
    if (!w.__staveRegisterViz) return false
    return w.__staveRegisterViz({
      id: 'optprobe',
      name: 'optprobe',
      renderer: 'hydra',
      code,
      requires: ['audio'],
      nativeSize: { w: 600, h: 400 },
      createdAt: 1,
      updatedAt: 1,
    })
  }, PROBE)
}

const code = (r: number, g: number, b: number) =>
  `$: note("c4 e4").s("sawtooth").viz("optprobe", { r: ${r}, g: ${g}, b: ${b} })`

test.describe('hydra stave.options (#883)', () => {
  test('a hydra sketch reads the options bag from its .viz() call', async ({ page }) => {
    await bootApp(page, { e2eHooks: true })
    expect(await registerProbe(page), 'the E2E viz-registration hook must be installed').toBe(true)

    await seedCode(page, code(1, 0, 0))
    await evalCode(page)
    await page.locator(SEL).first().waitFor({ timeout: 8000 })

    // Pre-fix this painted BLACK: the bag reached HydraVizRenderer and was dropped.
    await expect
      .poll(async () => (await vizPixelStats(page, SEL, RED)).frac, { timeout: 8000 })
      .toBeGreaterThan(0.4)
  })

  test('editing an option value and re-evaluating applies the NEW value', async ({ page }) => {
    // The live-read half: the bag is built once per mount and the options slot is
    // REPLACED on every publish. A captured value would pin red forever here.
    await bootApp(page, { e2eHooks: true })
    expect(await registerProbe(page)).toBe(true)

    await seedCode(page, code(1, 0, 0))
    await evalCode(page)
    await page.locator(SEL).first().waitFor({ timeout: 8000 })
    await expect
      .poll(async () => (await vizPixelStats(page, SEL, RED)).frac, { timeout: 8000 })
      .toBeGreaterThan(0.4)

    // Ctrl+Enter re-evaluates while playing (#180) — the gesture a user actually
    // makes while tweaking a value.
    await seedCode(page, code(0, 1, 0))
    await evalCode(page)

    await expect
      .poll(async () => (await vizPixelStats(page, SEL, GREEN)).frac, { timeout: 8000 })
      .toBeGreaterThan(0.4)
    expect((await vizPixelStats(page, SEL, RED)).frac).toBeLessThan(0.05)
  })
})
