/**
 * GLSL CREATION × 4 INLINE (#281) — a real ShaderToy ("Creation" by
 * Silexars/Danguafer) ported to the v1 contract and made AUDIO-REACTIVE, mounted
 * as FOUR concurrent inline `.viz()` worker viz, OBSERVED HEADED on real GL.
 *
 * Proves the GLSL renderer under genuine multi-instance load:
 *   - 4 live GLSL WORKER viz (viz.worker === 4, no main-thread fallback),
 *   - 4 live GL contexts accounted (#266, viz.glctx >= 4),
 *   - all 4 canvases PAINT + ANIMATE (the per-zone visual gate, PV86),
 *   - audio-reactive: each zone is attached to a playing pattern, so the shader's
 *     iChannel0 (FFT) drives the warp/brightness while iTime animates.
 *
 * Layout (PV78): a 1500×1500 viewport + SHORT zones (nativeSize 1100×200) + the
 * editor scrolled to top → all 4 zones are on-screen, so Phase C (#258) keeps
 * every one ACTIVE (an off-screen zone pauses and would read as 1-active+3-paused).
 *
 * Run HEADED on real GPU (P108) — the compositor/GL path is the thing under test:
 *   E2E_VERIFY=1 pnpm --filter @stave/app exec playwright test glsl-creation-4up.spec.ts --headed --timeout=180000 --workers=1
 */
import { test, expect, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const SHOTS = 5
const SHOT_GAP_MS = 600

/** "Creation" (Silexars/Danguafer, shadertoy.com/view/XsXXDn) made audio-reactive:
 *  bass (low FFT) drives the zoom speed + brightness; treble (high FFT) the ripple.
 *  Identical to the builtin `creation` preset (builtinGLSLCode.ts) — embedded here
 *  with a SHORT nativeSize so 4 zones fit one viewport. */
const CREATION = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 r = iResolution.xy;
  float bass = texture(iChannel0, vec2(0.04, 0.0)).x;
  float treble = texture(iChannel0, vec2(0.60, 0.0)).x;
  float t = iTime;
  vec3 c;
  float l, z = t;
  for (int i = 0; i < 3; i++) {
    vec2 uv, p = fragCoord.xy / r;
    uv = p;
    p -= 0.5;
    p.x *= r.x / r.y;
    z += 0.07 + bass * 0.06;
    l = length(p);
    uv += p / l * (sin(z) + 1.0) * abs(sin(l * 9.0 - z * 2.0)) * (1.0 + treble * 1.6);
    c[i] = 0.01 / length(mod(uv, 1.0) - 0.5);
  }
  fragColor = vec4(c / l * (0.7 + bass * 1.8), 1.0);
}`

const PATTERNS = [
  `$: s("bd*4").bank("RolandTR909").viz('creation4')`,
  `$: s("hh*8").bank("RolandTR909").gain(0.8).viz('creation4')`,
  `$: s("~ sd ~ sd").bank("RolandTR909").viz('creation4')`,
  `$: s("bd*2, hh*4").bank("RolandTR909").gain(0.7).viz('creation4')`,
].join('\n')

async function scanZones(page: Page): Promise<{ distinct: number; pngBytes: number }[]> {
  const canvases = page.locator('.monaco-editor canvas')
  const n = await canvases.count()
  const idx: number[] = []
  for (let i = 0; i < n; i++) {
    const box = await canvases.nth(i).boundingBox().catch(() => null)
    if (box && box.width > 200 && box.height > 60) idx.push(i)
  }
  const hashes: string[][] = idx.map(() => [])
  const sizes: number[][] = idx.map(() => [])
  for (let s = 0; s < SHOTS; s++) {
    for (let k = 0; k < idx.length; k++) {
      const buf = await canvases.nth(idx[k]).screenshot().catch(() => Buffer.from(''))
      hashes[k].push(createHash('md5').update(buf).digest('hex').slice(0, 8))
      sizes[k].push(buf.length)
    }
    if (s < SHOTS - 1) await page.waitForTimeout(SHOT_GAP_MS)
  }
  return idx.map((_, k) => {
    const sorted = [...sizes[k]].sort((a, b) => a - b)
    return { distinct: new Set(hashes[k]).size, pngBytes: sorted[Math.floor(sorted.length / 2)] }
  })
}

test.describe('#281 GLSL "Creation" × 4 inline (audio-reactive, headed)', () => {
  test.skip(!process.env.E2E_VERIFY, 'acceptance gate — set E2E_VERIFY=1')

  test('4 audio-reactive GLSL worker viz all mount, account a GL context, and paint', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1500, height: 1500 } })
    const page = await context.newPage()
    try {
      await page.addInitScript(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).__STAVE_PERF__ = true
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).__STAVE_E2E__ = true
        try {
          localStorage.setItem('stave.viz.worker', '1') // force the worker path
        } catch {
          /* ignore */
        }
      })
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
      await page.waitForTimeout(1500)

      // Register the (audio-reactive) Creation shader with a SHORT zone so 4 fit.
      const ok = await page.evaluate(
        (code) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__staveRegisterViz?.({
            id: 'creation4',
            name: 'creation4',
            renderer: 'glsl',
            code,
            requires: ['audio'],
            nativeSize: { w: 1100, h: 200 },
            createdAt: 1,
            updatedAt: 1,
          }) ?? false,
        CREATION,
      )
      expect(ok, 'creation4 viz registered').toBe(true)

      // Mount the 4 inline zones, all on-screen (scrollTop 0).
      await page.evaluate((c) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.setValue(c)
      }, PATTERNS)
      await page.waitForTimeout(250)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
      await page.keyboard.press(`${MOD}+Enter`)
      await page.waitForTimeout(4000)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.setScrollTop(0))
      await page.waitForTimeout(1500)

      const g = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = (window as any).__stavePerf?.snapshot?.()
        return {
          worker: s?.gauges?.['viz.worker'] ?? 0,
          glsl: s?.gauges?.['viz.glsl'] ?? 0,
          glctx: s?.gauges?.['viz.glctx'] ?? 0,
        }
      })
      console.log(`[#281 4up] gauges=${JSON.stringify(g)}`)

      // 4 GLSL worker viz live, none fell back to the main thread.
      expect(g.worker, 'all 4 GLSL viz live in the worker').toBe(4)
      expect(g.glsl, 'none fell back to the main-thread GLSLVizRenderer').toBe(0)
      // #266 — each GLSL mount accounted its raw-WebGL2 context.
      expect(g.glctx, '4 live GL contexts accounted (one per GLSL worker)').toBeGreaterThanOrEqual(4)

      // VISUAL — every zone paints + animates (PV86). iTime animates; the playing
      // patterns feed iChannel0 so the warp/brightness is audio-driven too.
      const zones = await scanZones(page)
      console.log(`[#281 4up] zones=${JSON.stringify(zones)}`)
      expect(zones.length, 'scanned all 4 on-screen zones').toBe(4)
      for (const [i, z] of zones.entries()) {
        expect(z.distinct, `zone ${i} animates (frame-to-frame change)`).toBeGreaterThanOrEqual(3)
        expect(z.pngBytes, `zone ${i} paints pixels (not black)`).toBeGreaterThan(3000)
      }
    } finally {
      await context.close()
    }
  })
})
