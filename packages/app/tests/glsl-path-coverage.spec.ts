/**
 * GLSL-PATH COVERAGE (#281) — the GLSL/ShaderToy renderer VALIDATES the engine-
 * agnostic renderer contract (architecture/renderer-contract.mdx, PR #280). The
 * GLSL worker path runs the SAME seams as p5/hydra through DIFFERENT code:
 *   - `mountGLSL`'s raw-WebGL2 `gl()` accessor → #266 glctx accounting,
 *   - a kind-agnostic `s.draw()` timed for the #230 viz.worker.draw bridge,
 *   - `shouldUseWorkerRenderer` gate + FallbackVizRenderer (#247) — no
 *     glsl-specific force-to-main,
 *   - the audio feed: `mountGLSL` reads the SAME already-refreshed `rawAnalyser`
 *     hydra reads and uploads it to the `iChannel0` texture (NO new host seam —
 *     the contract's predicted validation point).
 * This spec OBSERVES (Lokāyata, not inference) each on a real glsl-in-worker mount.
 *
 * CONTROL PROBE (per PK29): every assertion is guarded by `viz.worker > 0 &&
 * viz.glsl === 0` FIRST — i.e. a GLSL viz is live in the WORKER, not fallen back
 * to the main-thread `GLSLVizRenderer`. Without it a green check could be vacuous.
 *
 * GPU/compositor under test → run HEADED on real GPU (P108); per-test context
 * isolation so a leaked GL context / worker can't bleed across (PV84):
 *   E2E_VERIFY=1 pnpm --filter @stave/app exec playwright test glsl-path-coverage.spec.ts --headed --timeout=180000 --workers=1
 */
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

/** A ShaderToy `mainImage` body: animates off `iTime` (so it moves even in
 *  silence) AND reads the `iChannel0` audio texture (row 0 = FFT) so it's
 *  audio-reactive — the wrapped source is a plain transferable string. */
const GLSL_OK = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float a = texture(iChannel0, vec2(uv.x, 0.0)).x;
  vec3 col = 0.5 + 0.5 * cos(iTime + uv.xyx * 4.0 + vec3(0.0, 2.1, 4.2) + a * 5.0);
  fragColor = vec4(col, 1.0);
}`

/** A shader that won't COMPILE (undeclared identifier) → mountGLSL's
 *  createGLSLProgram throws at mount, BEFORE `ready` → the worker host posts a
 *  diag error → FallbackVizRenderer degrades to the main-thread GLSLVizRenderer
 *  (#247), which surfaces the same compile error. The fallback gauge `viz.glsl`
 *  must go up; `viz.worker` must NOT remain a live GLSL worker. */
const GLSL_BROKEN = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  fragColor = vec4(definitely_not_a_real_symbol, 0.0, 0.0, 1.0);
}`

/** A PURE-EVENT shader (#284) — NO iTime, NO iChannel0: its ONLY input is the
 *  `uKick` pattern-event uniform. So if the canvas changes frame-to-frame, that
 *  change can ONLY come from kick events reaching the shader (without #284 wiring,
 *  uKick is always 0 → a constant black frame → distinct === 1). The cleanest
 *  proof that EVENTS (not just FFT) drive the shader. */
const GLSL_EVENT_OK = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  fragColor = vec4(vec3(uKick), 1.0);
}`

/** A RAW GLSL fragment shader (#283) — the user owns `out` + `void main()`, NOT
 *  the ShaderToy `mainImage` convention. Uses the same Stave uniforms; animates
 *  off iTime + reads the iChannel0 FFT. Proves the dual-mode wrapper end to end. */
const GLSL_RAW_OK = `out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  float a = texture(iChannel0, vec2(uv.x, 0.0)).x;
  vec3 col = 0.5 + 0.5 * cos(iTime + uv.xyx * 5.0 + vec3(1.0, 3.0, 5.0) + a * 4.0);
  fragColor = vec4(col, 1.0);
}`

async function open(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
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
  return { ctx, page }
}

async function registerGLSL(page: Page, id: string, code: string): Promise<void> {
  const ok = await page.evaluate(
    ({ id, code }) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__staveRegisterViz?.({
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
    if (!e) return false
    e.getModel()?.setValue(c)
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(250)
}

async function press(page: Page, key: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(key)
}

async function scrollTo(page: Page, top: number): Promise<void> {
  await page.evaluate((t) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).monaco?.editor?.getEditors?.()?.[0]?.setScrollTop(t)
  }, top)
}

/** Stop, swap the code, run — a fresh mount, left on-screen (scrollTop 0, PV78). */
async function remount(page: Page, code: string): Promise<void> {
  await press(page, `${MOD}+Period`)
  await page.waitForTimeout(400)
  await setCode(page, code)
  await press(page, `${MOD}+Enter`)
  await page.waitForTimeout(3000)
  await scrollTo(page, 0)
  await page.waitForTimeout(1200)
}

interface Snap {
  worker: number
  glsl: number
  glctx: number
  draw: { count: number; p95: number; mean: number } | null
}
async function snap(page: Page): Promise<Snap> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).__stavePerf?.snapshot?.()
    const d = s?.sections?.['viz.worker.draw'] ?? null
    return {
      worker: s?.gauges?.['viz.worker'] ?? 0,
      glsl: s?.gauges?.['viz.glsl'] ?? 0, // main-thread GLSLVizRenderer (fallback) gauge
      glctx: s?.gauges?.['viz.glctx'] ?? 0,
      draw: d ? { count: d.count, p95: d.p95, mean: d.mean } : null,
    }
  })
}

async function measure(page: Page): Promise<Snap> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).__stavePerf?.reset?.())
  await page.waitForTimeout(3000)
  return snap(page)
}

test.describe('#281 GLSL worker path — contract validation', () => {
  test.skip(!process.env.E2E_VERIFY, 'acceptance gate — set E2E_VERIFY=1')

  test('(a) #266 — a GLSL worker mount accounts a live GL context (viz.glctx)', async ({ browser }) => {
    const { ctx, page } = await open(browser)
    try {
      await registerGLSL(page, 'gl-glctx', GLSL_OK)
      await remount(page, `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909").viz('gl-glctx')`)
      const m = await snap(page)
      console.log(`[#281 a] ${JSON.stringify(m)}`)

      expect(m.worker, 'GLSL worker viz live (control probe)').toBeGreaterThan(0)
      expect(m.glsl, 'must NOT have fallen back to the main-thread GLSLVizRenderer').toBe(0)
      // #266 — accounting fired for the raw-WebGL2 context mountGLSL.gl() returns.
      expect(m.glctx, 'GLSL mount must account a live GL context (viz.glctx)').toBeGreaterThanOrEqual(1)
    } finally {
      await ctx.close()
    }
  })

  test('(b) #230 — viz.worker.draw populates from a glsl-kind worker viz', async ({ browser }) => {
    const { ctx, page } = await open(browser)
    try {
      await registerGLSL(page, 'gl-draw', GLSL_OK)
      await remount(page, `$: s("hh*16").bank("RolandTR909").gain(0.9).viz('gl-draw')`)
      const m = await measure(page)
      console.log(`[#281 b] ${JSON.stringify(m)}`)

      expect(m.worker, 'a GLSL worker viz must be live (control probe)').toBeGreaterThanOrEqual(1)
      expect(m.glsl, 'no main-thread fallback').toBe(0)
      // The #230 bridge is kind-agnostic — s.draw() is timed for glsl too.
      expect(m.draw, 'viz.worker.draw must exist for glsl (the bridge fired)').not.toBeNull()
      expect(m.draw!.count, 'glsl draw samples recorded from the worker').toBeGreaterThan(0)
      expect(m.draw!.p95, 'a sensible non-negative glsl draw time').toBeGreaterThanOrEqual(0)
    } finally {
      await ctx.close()
    }
  })

  test('(c) #247/#331 — a broken GLSL shader falls back AND surfaces its compile error (with line) to the Console', async ({ browser }) => {
    const { ctx, page } = await open(browser)
    try {
      // CONTROL (P135 — no false surfacing): a CLEAN GLSL shader must surface ZERO
      // glsl error entries. Proves the emit fires on a real compile failure, not on
      // every mount.
      await registerGLSL(page, 'gl-clean', GLSL_OK)
      await remount(page, `$: s("bd*4").bank("RolandTR909").viz('gl-clean')`)
      await page.waitForTimeout(2500)
      const cleanErrs = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const log: Array<{ level: string; runtime: string }> = (window as any).__staveGetLog?.() ?? []
        return log.filter((e) => e.runtime === 'glsl' && e.level === 'error').length
      })
      console.log(`[#281 c] CONTROL clean glsl errors=${cleanErrs}`)
      expect(cleanErrs, 'a clean GLSL shader surfaces NO compile errors').toBe(0)

      // EFFECT: a shader with an undeclared identifier on USER line 2. The worker's
      // createGLSLProgram throws before `ready` → FallbackVizRenderer mounts the
      // main-thread GLSLVizRenderer, which re-compiles + (#331) emits the info log to
      // the Console with the editor line.
      await registerGLSL(page, 'gl-broken', GLSL_BROKEN)
      await remount(page, `$: s("bd*4").bank("RolandTR909").viz('gl-broken')`)
      await page.waitForTimeout(2500)
      const m = await snap(page)
      const obs = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const log: Array<{ level: string; runtime: string; message: string; line?: number }> =
          (window as any).__staveGetLog?.() ?? []
        const glslErrs = log.filter((e) => e.runtime === 'glsl' && e.level === 'error')
        return {
          count: glslErrs.length,
          hasSymbol: glslErrs.some((e) => e.message.includes('definitely_not_a_real_symbol')),
          lines: glslErrs.map((e) => e.line),
          sample: glslErrs[0]?.message.slice(0, 100),
        }
      })
      console.log(`[#281 c] EFFECT ${JSON.stringify(m)} | err=${JSON.stringify(obs)}`)

      // Fallback (#247): main gauge up, no live GLSL worker remains.
      expect(m.glsl, 'fell back to the main-thread GLSLVizRenderer (#247)').toBeGreaterThanOrEqual(1)
      expect(m.worker, 'the broken worker did not stay live as a worker viz').toBe(0)
      // Surfacing (#331): the compile error reached the Console.
      expect(obs.count, 'the GLSL compile error surfaced to the Console (#331)').toBeGreaterThanOrEqual(1)
      // ISOLATION: it's OUR shader's error (the induced symbol), end-to-end.
      expect(obs.hasSymbol, "the surfaced error carries the shader's undeclared symbol").toBe(true)
      // LINE ATTRIBUTION: mapped back through the wrapper preamble to user line 2.
      expect(obs.lines, 'the error is attributed to the authored editor line (2)').toContain(2)
    } finally {
      await ctx.close()
    }
  })

  test('(d) VISUAL — the GLSL worker canvas actually PAINTS animated frames (not black, not frozen)', async ({ browser }) => {
    // The gauge tests prove MOUNT + bridge, but a worker can report viz.worker=1
    // while the transferred canvas shows nothing (context lost, shader no-op). This
    // is the LOKĀYATA gate: the rendered artifact. Decode-free (high-n-headroom
    // technique): screenshot the inline canvas N× ~0.6s apart → md5 each. A LIVE
    // shader animates off iTime (≥3/5 distinct) and fills pixels (large PNG).
    const { ctx, page } = await open(browser)
    try {
      await registerGLSL(page, 'gl-visual', GLSL_OK)
      await remount(page, `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909").viz('gl-visual')`)

      const g = await snap(page)
      expect(g.worker, 'worker GLSL viz live (control probe)').toBeGreaterThanOrEqual(1)
      expect(g.glsl, 'no main-thread fallback').toBe(0)

      const canvas = page.locator('[data-viz-zone] canvas').first()
      await canvas.waitFor({ timeout: 15000 })

      const shots: { hash: string; bytes: number }[] = []
      for (let i = 0; i < 5; i++) {
        const buf = await canvas.screenshot({
          path: i === 0 || i === 4 ? `test-results/glsl-visual-${i}.png` : undefined,
        })
        shots.push({ hash: createHash('md5').update(buf).digest('hex').slice(0, 8), bytes: buf.length })
        if (i < 4) await page.waitForTimeout(600)
      }
      const distinct = new Set(shots.map((s) => s.hash)).size
      const maxBytes = Math.max(...shots.map((s) => s.bytes))
      console.log(`[#281 d] distinct frames=${distinct}/5  maxPNG=${maxBytes}B  hashes=${shots.map((s) => s.hash).join(',')}`)

      expect(distinct, 'the GLSL canvas must change frame-to-frame (animating, not frozen)').toBeGreaterThanOrEqual(3)
      expect(maxBytes, 'the GLSL canvas must paint pixels (not a black/empty surface)').toBeGreaterThan(3000)
    } finally {
      await ctx.close()
    }
  })

  test('(e) #283 — a RAW GLSL shader (own void main, no mainImage) mounts and paints', async ({ browser }) => {
    const { ctx, page } = await open(browser)
    try {
      await registerGLSL(page, 'gl-raw', GLSL_RAW_OK)
      await remount(page, `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909").viz('gl-raw')`)

      // Control probe: the raw shader took the WORKER path and did NOT fall back —
      // i.e. the dual-mode wrapper produced a shader that COMPILES in the worker GL.
      const g = await snap(page)
      console.log(`[#281 e] ${JSON.stringify(g)}`)
      expect(g.worker, 'raw GLSL worker viz live (control probe)').toBeGreaterThanOrEqual(1)
      expect(g.glsl, 'raw shader compiled in the worker — no main-thread fallback').toBe(0)

      const canvas = page.locator('[data-viz-zone] canvas').first()
      await canvas.waitFor({ timeout: 15000 })
      const shots: { hash: string; bytes: number }[] = []
      for (let i = 0; i < 5; i++) {
        const buf = await canvas.screenshot()
        shots.push({ hash: createHash('md5').update(buf).digest('hex').slice(0, 8), bytes: buf.length })
        if (i < 4) await page.waitForTimeout(600)
      }
      const distinct = new Set(shots.map((s) => s.hash)).size
      const maxBytes = Math.max(...shots.map((s) => s.bytes))
      console.log(`[#281 e] raw distinct=${distinct}/5 maxPNG=${maxBytes}B`)
      expect(distinct, 'the raw GLSL canvas animates').toBeGreaterThanOrEqual(3)
      expect(maxBytes, 'the raw GLSL canvas paints pixels').toBeGreaterThan(3000)
    } finally {
      await ctx.close()
    }
  })

  test('(f) #284 — pattern EVENTS reach the shader: a pure uKick shader pulses with the kick', async ({ browser }) => {
    const { ctx, page } = await open(browser)
    try {
      await registerGLSL(page, 'gl-event', GLSL_EVENT_OK)
      // bd*4 → 4 kicks per cycle; uKick bumps + decays → brightness oscillates.
      await remount(page, `$: s("bd*4").bank("RolandTR909").gain(1.0).viz('gl-event')`)

      const g = await snap(page)
      console.log(`[#281 f] ${JSON.stringify(g)}`)
      expect(g.worker, 'event GLSL worker viz live (control probe)').toBeGreaterThanOrEqual(1)
      expect(g.glsl, 'no main-thread fallback').toBe(0)

      const canvas = page.locator('[data-viz-zone] canvas').first()
      await canvas.waitFor({ timeout: 15000 })
      const hashes: string[] = []
      for (let i = 0; i < 6; i++) {
        const buf = await canvas.screenshot()
        hashes.push(createHash('md5').update(buf).digest('hex').slice(0, 8))
        if (i < 5) await page.waitForTimeout(400)
      }
      const distinct = new Set(hashes).size
      console.log(`[#281 f] uKick-only distinct=${distinct}/6 hashes=${hashes.join(',')}`)
      // The shader has NO iTime/iChannel0 — frame-to-frame change PROVES uKick
      // (a pattern event) is reaching the shader. A dead feed → 1 distinct (black).
      expect(distinct, 'a pure-uKick shader must change as kicks fire (events reach GLSL)').toBeGreaterThanOrEqual(3)
    } finally {
      await ctx.close()
    }
  })
})
