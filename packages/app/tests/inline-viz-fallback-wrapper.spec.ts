/**
 * A viz zone whose RENDERER IS SWAPPED keeps its transform (#1444).
 *
 * WHY A BROWSER TEST. `applyLayout` wraps the canvas once and thereafter
 * transforms the wrapper. Nothing at unit level mounts a real zone, swaps the
 * renderer under it, and asks whether the wrapper still holds the canvas that is
 * actually on screen — and the failure is invisible to the eye, because a
 * `width:100%` canvas fills its container whether it is wrapped or not. What is
 * silently lost is the crop, the preset's aspect ratio, and a truthful zone
 * height. A screenshot would not catch it; the DOM relationship is the property.
 *
 * ⚠ THE SWAP IS INDUCED BY A SHADER THAT CANNOT COMPILE, and deliberately so.
 * `FallbackVizRenderer` hands the zone from the worker to the main thread on a
 * worker mount failure. The other trigger — a worker that never produces a frame
 * within probation — is a timeout, so it is neither fast nor deterministic. A
 * compile error is both, and the handover it drives is the same handover.
 *
 * ⚠ THE CONTROL PROBE COMES FIRST. Every assertion below is worthless unless the
 * fallback ACTUALLY happened: a green run could otherwise mean "the wrapper
 * survives a swap" or "no swap ever occurred". The console warning
 * `FallbackVizRenderer` emits on handover is the witness, and it is asserted
 * before the DOM is read at all.
 *
 * ⚠ AND THE HEALTHY ARM IS NOT DECORATION. Three of the four renderer/worker
 * combinations were already correct when this was filed, so a fix that broke the
 * ordinary path while repairing the swapped one would still satisfy the arm
 * above. The second test is what keeps that honest.
 */
import { test, expect, type Page } from '@playwright/test'
import { bootApp, seedCode, evalCode } from './_appBoot'

/** Fails to compile: the worker preamble declares no `gl_FragColor`. */
const BROKEN_GLSL = `void main(){ gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }`
/** Compiles and paints — the healthy control. */
const GOOD_HYDRA = `s.solid(1, 0, 0).out()`

async function registerViz(page: Page, id: string, renderer: string, code: string): Promise<boolean> {
  return page.evaluate(
    ([vid, r, c]) => {
      const w = window as unknown as { __staveRegisterViz?: (p: unknown) => boolean }
      if (!w.__staveRegisterViz) return false
      return w.__staveRegisterViz({
        id: vid, name: vid, renderer: r, code: c,
        requires: ['audio'], nativeSize: { w: 1100, h: 200 },
        createdAt: 1, updatedAt: 1,
      })
    },
    [id, renderer, code] as [string, string, string],
  )
}

/** The zone's wrapper, and whether the canvas on screen is inside it. */
async function wrapperState(page: Page) {
  return page.evaluate(() => {
    const zone = document.querySelector('[data-viz-zone]')
    if (!zone) return null
    const wrap = zone.querySelector('[data-viz-canvas-wrap]') as HTMLElement | null
    const canvas = zone.querySelector('canvas')
    const r = wrap?.getBoundingClientRect()
    return {
      hasWrapper: !!wrap,
      wrapperW: Math.round(r?.width ?? 0),
      wrapperH: Math.round(r?.height ?? 0),
      canvasInWrapper: !!canvas?.closest('[data-viz-canvas-wrap]'),
      transform: wrap?.style.transform ?? '',
    }
  })
}

async function mountZone(page: Page, id: string, renderer: string, code: string): Promise<void> {
  await bootApp(page, { e2eHooks: true })
  expect(await registerViz(page, id, renderer, code), 'the E2E viz-registration hook must be installed').toBe(true)
  await seedCode(page, `$: s("bd*4").viz("${id}")`)
  await evalCode(page)
  await page.locator('[data-viz-zone]').first().waitFor({ timeout: 20_000 })
}

test('a zone handed from the worker to the main thread keeps the live canvas wrapped', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (m) => { warnings.push(m.text()) })

  await mountZone(page, 'fallbackProbe', 'glsl', BROKEN_GLSL)

  // CONTROL PROBE — the induced state is real before anything else is asserted.
  await expect
    .poll(() => warnings.some((w) => w.includes('falling back to the main thread')), { timeout: 20_000 })
    .toBe(true)

  // The live canvas must be inside the wrapper the transform is applied to.
  // Ungated, the handover left the wrapper behind at 0x0 with the canvas as its
  // sibling — so crop and aspect were dropped while the zone still looked right.
  await expect.poll(() => wrapperState(page), { timeout: 10_000 }).toMatchObject({
    hasWrapper: true,
    canvasInWrapper: true,
  })
  const s = await wrapperState(page)
  expect(s!.wrapperW, 'the wrapper must have a real width, not the 0 of an empty shell').toBeGreaterThan(0)
  expect(s!.wrapperH, 'the wrapper must have a real height').toBeGreaterThan(0)
  expect(s!.transform, 'and it must actually carry a transform').toContain('scale(')
})

test('a zone whose renderer never changes is unaffected — the ordinary path still wraps', async ({ page }) => {
  await mountZone(page, 'healthyProbe', 'hydra', GOOD_HYDRA)

  await expect.poll(() => wrapperState(page), { timeout: 10_000 }).toMatchObject({
    hasWrapper: true,
    canvasInWrapper: true,
  })
  const s = await wrapperState(page)
  expect(s!.wrapperW).toBeGreaterThan(0)
  expect(s!.transform).toContain('scale(')
})
