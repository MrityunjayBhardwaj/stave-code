/**
 * GLSL PER-TRACK SIGNALS (#297) — the GLSL analog of p5/hydra `u.track(id)`.
 *
 * A GLSL shader gets the per-track signal bus via injected uniforms + a
 * `staveTrack(int i)` helper (glslShaderSource): `uTrackCount` is how many tracks
 * are live, `staveTrack(i)` reads track `i`'s scalars (env/velocity/rms/...). The
 * per-track block is read from the SAME `SignalBus` on both threads (`readGLSLTracks`
 * in GLSLVizRenderer.loop AND the worker mountGLSL.draw — the two mount seams, PV64/PV74).
 *
 * This is the LOKĀYATA gate: a PURE per-track shader (no iTime, no iChannel0 — its
 * ONLY input is `staveTrack(i).env`). A two-track program drives it; if the canvas
 * changes frame-to-frame, that change can ONLY come from per-track signals reaching
 * the shader. PV60: pre-fix the shader references undeclared `staveTrack`/`uTrackCount`
 * → fails to COMPILE → FallbackVizRenderer → `worker===0 / glsl>0`, so the control
 * probe (`worker>0 && glsl===0`) goes red. PV90: animation measured via COMPOSITOR
 * capture (`page.screenshot` clip), never element `canvas.screenshot()`.
 *
 * Run HEADED on real GPU (P108) with per-test context isolation (PV84), OR headless
 * (SwiftShader renders worker viz fine + is more stable for logic checks):
 *   E2E_VERIFY=1 pnpm --filter @stave/app exec playwright test glsl-per-track.spec.ts --timeout=180000 --workers=1
 */
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { vizFrameHashes, distinct } from './_vizFrames'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

/** PURE per-track shader: NO iTime, NO iChannel0. Sums every live track's env →
 *  brightness. Frame-to-frame change ⟹ `staveTrack(i).env` (a per-track signal) is
 *  reaching the shader AND `uTrackCount > 0`. A dead feed → constant black (distinct 1). */
const GLSL_TRACK_OK = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  float e = 0.0;
  for (int i = 0; i < uTrackCount; i++) {
    e += staveTrack(i).env;
  }
  fragColor = vec4(vec3(clamp(e, 0.0, 1.0)), 1.0);
}`

async function open(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.addInitScript(() => {
    ;(window as { __STAVE_PERF__?: boolean }).__STAVE_PERF__ = true
    ;(window as { __STAVE_E2E__?: boolean }).__STAVE_E2E__ = true
    try {
      localStorage.setItem('stave.viz.worker', '1') // force the worker path
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1500)
  return { ctx, page }
}

async function registerGLSL(page: Page, id: string, code: string): Promise<void> {
  const ok = await page.evaluate(
    ({ id, code }) =>
      (
        window as unknown as { __staveRegisterViz?: (d: unknown) => boolean }
      ).__staveRegisterViz?.({
        id,
        name: id,
        renderer: 'glsl',
        code,
        requires: ['audio'],
        nativeSize: { w: 640, h: 360 },
        createdAt: 1,
        updatedAt: 1,
      }) ?? false,
    { id, code },
  )
  expect(ok, 'glsl viz registered').toBe(true)
}

async function setCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    const e = (
      window as unknown as { monaco?: { editor?: { getEditors?: () => { getModel?: () => { setValue: (v: string) => void } | null }[] } } }
    ).monaco?.editor?.getEditors?.()?.[0]
    if (!e) return false
    e.getModel()?.setValue(c)
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(250)
}

async function press(page: Page, key: string): Promise<void> {
  await page.evaluate(() =>
    (
      window as unknown as { monaco?: { editor?: { getEditors?: () => { focus?: () => void }[] } } }
    ).monaco?.editor?.getEditors?.()?.[0]?.focus(),
  )
  await page.keyboard.press(key)
}

async function scrollTo(page: Page, top: number): Promise<void> {
  await page.evaluate((t) => {
    ;(
      window as unknown as { monaco?: { editor?: { getEditors?: () => { setScrollTop?: (n: number) => void }[] } } }
    ).monaco?.editor?.getEditors?.()?.[0]?.setScrollTop(t)
  }, top)
}

interface Snap {
  worker: number
  glsl: number
  glctx: number
  draw: { count: number; p95: number } | null
}
async function snap(page: Page): Promise<Snap> {
  return page.evaluate(() => {
    const s = (
      window as unknown as { __stavePerf?: { snapshot?: () => { gauges?: Record<string, number>; sections?: Record<string, { count: number; p95: number }> } } }
    ).__stavePerf?.snapshot?.()
    const d = s?.sections?.['viz.worker.draw'] ?? null
    return {
      worker: s?.gauges?.['viz.worker'] ?? 0,
      glsl: s?.gauges?.['viz.glsl'] ?? 0,
      glctx: s?.gauges?.['viz.glctx'] ?? 0,
      draw: d ? { count: d.count, p95: d.p95 } : null,
    }
  })
}

test.describe('#297 GLSL per-track signals — staveTrack(i) reaches the shader', () => {
  test.skip(!process.env.E2E_VERIFY, 'acceptance gate — set E2E_VERIFY=1')

  test('a pure staveTrack().env shader compiles, mounts in the worker, and pulses with track activity', async ({
    browser,
  }) => {
    const { ctx, page } = await open(browser)
    try {
      await registerGLSL(page, 'gl-track', GLSL_TRACK_OK)
      // TWO tracks → uTrackCount ≥ 2; the .viz() pattern + a second track. The bus
      // binds engine-wide trackSchedulers, so both tracks are visible to the shader.
      const program = [
        `$: s("bd*4").bank("RolandTR909")`,
        `$: s("hh*8").bank("RolandTR909").gain(0.9).viz('gl-track')`,
      ].join('\n')
      await setCode(page, program)
      await press(page, `${MOD}+Enter`)
      await page.waitForTimeout(3500)
      await scrollTo(page, 0) // keep the inline zone on-screen (PV78)
      await page.waitForTimeout(1500)

      const m = await snap(page)
      console.log(`[#297] staveTrack shader → ${JSON.stringify(m)}`)

      // Control probe (PV60): the staveTrack shader COMPILED (the injected uniforms
      // + helper are valid GLSL) and ran in the WORKER — not fallen back to main.
      expect(m.worker, 'staveTrack shader mounted in the worker (compiled OK)').toBeGreaterThan(0)
      expect(m.glsl, 'no main-thread fallback (would mean a compile error)').toBe(0)
      expect(m.glctx, 'a live GL context was accounted').toBeGreaterThanOrEqual(1)
      expect(m.draw, 'viz.worker.draw populated').not.toBeNull()
      expect(m.draw!.count, 'glsl draw frames recorded').toBeGreaterThan(0)

      // Lokāyata: the canvas changes frame-to-frame. The shader has NO iTime/iChannel0
      // — the ONLY animated input is staveTrack(i).env, so change PROVES per-track
      // signals reach GLSL (uTrackCount > 0 + staveTrack wired on the worker seam).
      // PV90: COMPOSITOR capture, clipped clear of the perf overlay.
      const canvas = page.locator('[data-viz-zone] canvas').first()
      await canvas.waitFor({ timeout: 15000 })
      const frames = await vizFrameHashes(page, '[data-viz-zone] canvas', 6, 450)
      const d = distinct(frames)
      console.log(`[#297] per-track distinct=${d}/6 hashes=${frames.join(',')}`)

      expect(d, 'a pure-staveTrack shader changes as tracks fire (per-track signals reach GLSL)').toBeGreaterThanOrEqual(3)
    } finally {
      await ctx.close()
    }
  })
})
