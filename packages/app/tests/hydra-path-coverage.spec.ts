/**
 * HYDRA-PATH COVERAGE (#274) — close the p5-only gap on the worker viz features.
 *
 * #266 (GL-context release), #257 (worker draw-error surfacing), #270/#253 (live
 * config-marshal) and #230 (viz.worker.draw profiler bridge) all shipped with e2e
 * proof on the *p5* worker path. The HYDRA worker path runs the SAME seams through
 * DIFFERENT code — `mountHydra`'s raw-WebGL `gl()` accessor (#266), a `tick()`
 * throw caught by the shared `s.draw()` catch rather than p5Compiler's lifecycle
 * wrap (#257), `hydraAudioBins`/density read from the marshalled vizConfig
 * (#270/#253), and a kind-agnostic `s.draw()` timed for the bridge (#230). This
 * spec OBSERVES (Lokāyata, not inference) each on a real hydra-in-worker mount.
 *
 * CONTROL PROBE (per PK29): every assertion is guarded by `viz.worker > 0 &&
 * viz.hydra === 0` FIRST — i.e. the induced state (a HYDRA viz running in the
 * WORKER, not fallen back to the main-thread HydraVizRenderer) is real — before
 * the effect is asserted. Without it a green check could mean "the feature works"
 * OR "no hydra-worker viz ever mounted" (vacuous).
 *
 * Hydra routes to the worker via `makeHydraRenderer` → `shouldUseWorkerRenderer`
 * (the SAME gate as p5: flag + factory + OffscreenCanvas) — there is NO
 * hydra-specific force-to-main. A `renderer:'hydra'` code string takes the worker
 * path. Each test runs in its OWN browser context (`ctx.close()` between) so a
 * lingering GL context / worker can't bleed across tests (GPU-process budget).
 *
 * GPU/compositor under test → run HEADED on real GPU (P108):
 *   E2E_VERIFY=1 pnpm --filter @stave/app exec playwright test hydra-path-coverage.spec.ts --headed --timeout=180000 --workers=1
 */
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

/** A small audio-reactive hydra sketch (`new Function('s','stave', code)`): `s` =
 *  the hydra synth, `s.a.fft[]` = the master bins the worker downsamples from the
 *  transported analyser bytes. Time-driven osc → animates even without audio. */
const HYDRA_OK = `s.osc(20, 0.1, () => s.a.fft[0] * 6)
  .color(0.4, 0.7, 1.0)
  .rotate(() => s.a.fft[1] * 3.14)
  .modulate(s.noise(2, 0.5), () => 0.08 + s.a.fft[2] * 0.3)
  .out()`

/** A hydra sketch that draws cleanly for the first ~60 ticks (so the worker posts
 *  `ready` and does NOT fall back), then its reactive arrow THROWS every tick.
 *  hydra-synth wraps EACH reactive-fn uniform eval in its own try/catch
 *  (`format-arguments.js:72-83` → `console.warn('ERROR', e)` + default), so the throw
 *  never reaches the host's `s.draw()` catch. The #275 fix patches the worker's
 *  `console.warn` to RE-EMIT hydra's swallowed user-error markers to the main
 *  engineLog — restoring p5 parity (a p5 `draw()` typo already surfaces there). This
 *  sketch drives that surfacing: the thrown text (`hydra tick boom`) must reach the
 *  main Console end-to-end.
 *  `_n` lives in the Function body, captured by the reactive arrow across ticks. */
const HYDRA_THROW_AFTER_READY = `let _n = 0
s.osc(20, 0.1, () => s.a.fft[0] * 6)
  .rotate(() => { if (++_n > 60) throw new Error('hydra tick boom'); return s.a.fft[1] * 0.5 })
  .out()`

/** A heavier multi-layer hydra sketch (osc/color/rotate/modulate×2/diff) — used
 *  where a non-trivial, continuously-animating worker draw is wanted. */
const HYDRA_HEAVY = `s.osc(40, 0.1, () => s.a.fft[0] * 6)
  .color(0.9, 0.4, () => s.a.fft[1] * 2)
  .rotate(() => s.a.fft[2] * 6.28)
  .modulate(s.noise(4, 0.4).rotate(0.7), () => 0.1 + s.a.fft[3] * 0.4)
  .modulate(s.osc(8, 0.2).kaleid(5), 0.06)
  .diff(s.noise(2, 0.3))
  .out()`

interface OpenOpts {
  /** Off-screen teardown threshold (ms) for this page; absent → product default. */
  teardownMs?: number
}

/** Fresh browser context + page, profiler on, worker viz forced. Per-test context
 *  isolation so a leaked GL context / worker can't bleed into the next test. */
async function open(browser: Browser, opts: OpenOpts = {}): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.addInitScript((o) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_PERF__ = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_E2E__ = true
    try {
      localStorage.setItem('stave.viz.worker', '1') // force the worker path
      if (o.teardownMs) localStorage.setItem('stave:inlineVizTeardownMs', String(o.teardownMs))
    } catch {
      /* ignore */
    }
  }, opts)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1500)
  return { ctx, page }
}

async function registerHydra(page: Page, id: string, code: string): Promise<void> {
  const ok = await page.evaluate(
    ({ id, code }) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__staveRegisterViz?.({
        id,
        name: id,
        renderer: 'hydra',
        code,
        requires: ['audio'],
        nativeSize: { w: 640, h: 360 },
        createdAt: 1,
        updatedAt: 1,
      }) ?? false,
    { id, code },
  )
  expect(ok, 'hydra viz registered').toBe(true)
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

/** Stop, swap the code, run — a fresh mount, left on-screen (scrollTop 0). */
async function remount(page: Page, code: string): Promise<void> {
  await press(page, `${MOD}+Period`)
  await page.waitForTimeout(400)
  await setCode(page, code)
  await press(page, `${MOD}+Enter`)
  await page.waitForTimeout(3000)
  await scrollTo(page, 0) // keep the zone on-screen so Phase C can't pause it (PV78)
  await page.waitForTimeout(1200)
}

interface Snap {
  worker: number
  hydra: number
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
      hydra: s?.gauges?.['viz.hydra'] ?? 0,
      glctx: s?.gauges?.['viz.glctx'] ?? 0,
      draw: d ? { count: d.count, p95: d.p95, mean: d.mean } : null,
    }
  })
}

/** Reset the profiler, accumulate a clean window, snapshot. */
async function measure(page: Page): Promise<Snap> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).__stavePerf?.reset?.())
  await page.waitForTimeout(3000)
  return snap(page)
}

test.describe('#274 hydra worker path coverage', () => {
  test.skip(!process.env.E2E_VERIFY, 'acceptance gate — set E2E_VERIFY=1')

  test('(a) #266 — hydra worker mount accounts a GL context; off-screen teardown releases it', async ({ browser }) => {
    // Low teardown threshold so the off-screen DESTROY (the #263/#266 path that
    // calls releaseGL → loseContext) fires within the test window.
    const { ctx, page } = await open(browser, { teardownMs: 1200 })
    try {
      await registerHydra(page, 'hy-glctx', HYDRA_OK)

      // Pattern on line 1 + many blank lines so the editor can scroll the zone out.
      const pad = '\n'.repeat(120)
      await remount(page, `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909").viz('hy-glctx')${pad}`)
      const mounted = await snap(page)
      console.log(`[#274 a] mounted: ${JSON.stringify(mounted)}`)

      // Control probe (PK29): a HYDRA viz is live in the WORKER, no main-thread fallback.
      expect(mounted.worker, 'hydra worker viz must be live (control probe)').toBeGreaterThan(0)
      expect(mounted.hydra, 'must NOT have fallen back to main-thread hydra').toBe(0)
      // #266 — the accounting fired for hydra's raw-WebGL context (mountHydra.gl()).
      expect(mounted.glctx, 'hydra mount must account a live GL context (viz.glctx)').toBeGreaterThanOrEqual(1)

      // Scroll the zone off-screen → Phase C pauses immediately, then after
      // teardownMs the off-screen TEARDOWN destroys the renderer (releaseGL + -1).
      await scrollTo(page, 4000)
      await page.waitForTimeout(1200 + 3500)
      const torn = await snap(page)
      console.log(`[#274 a] torn: ${JSON.stringify(torn)}`)

      expect(torn.worker, 'worker viz gauge released on off-screen teardown').toBe(0)
      expect(torn.glctx, 'GL context released on teardown (#266 releaseGL → loseContext)').toBe(0)
    } finally {
      await ctx.close()
    }
  })

  // #275 — hydra-synth SWALLOWS user reactive-fn throws in its own try/catch
  // (format-arguments.js:72-83 → console.warn('ERROR', e) + default uniform), so they
  // never reach the host's s.draw() catch and a hydra typo gave a silent default +
  // a warning buried in the DEDICATED worker's devtools — vs p5, whose draw() typo
  // surfaces in the main Console (#257). The fix patches the worker's console.warn to
  // re-emit hydra's user-error markers via vizlog → main engineLog. This test proves
  // PARITY: a clean sketch surfaces NOTHING (control — no over-capture), and a
  // throwing reactive fn surfaces its thrown text (effect + isolation).
  test('(b) #257/#275 — a hydra reactive-fn throw SURFACES to the main Console (p5 parity)', async ({ browser }) => {
    const { ctx, page } = await open(browser)
    try {
      // CONTROL (P135 — no over-capture): a HEALTHY hydra sketch trips neither marker
      // ('ERROR' / 'function does not return a number'), so a green here proves the
      // patch doesn't spam the Console with hydra/regl internals or clean frames.
      await registerHydra(page, 'hy-clean', HYDRA_OK)
      await remount(page, `$: s("bd*4, hh*8").bank("RolandTR909").viz('hy-clean')`)
      await page.waitForTimeout(3000)
      const cleanObs = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any
        const s = w.__stavePerf?.snapshot?.()
        const log: Array<{ level: string; runtime: string; message: string }> = w.__staveGetLog?.() ?? []
        const reactive = log.filter((e) => e.runtime === 'hydra' && /reactive fn/.test(e.message))
        return { worker: s?.gauges?.['viz.worker'] ?? 0, hydra: s?.gauges?.['viz.hydra'] ?? 0, count: reactive.length }
      })
      console.log(`[#274 b] CONTROL clean: ${JSON.stringify(cleanObs)}`)
      expect(cleanObs.worker, 'clean hydra worker viz live (control probe)').toBeGreaterThan(0)
      expect(cleanObs.hydra, 'no main-thread fallback (clean)').toBe(0)
      expect(cleanObs.count, 'a healthy hydra sketch surfaces NO reactive-fn errors (no over-capture)').toBe(0)

      // EFFECT: a reactive arrow that throws every tick after ready. hydra-synth
      // swallows it to console.warn('ERROR', e); the #275 patch re-emits it.
      await registerHydra(page, 'hy-throw', HYDRA_THROW_AFTER_READY)
      await remount(page, `$: s("bd*4, hh*8").bank("RolandTR909").viz('hy-throw')`)
      await page.waitForTimeout(5000) // > 60 clean ticks (ready, no fallback), then throws every tick

      const obs = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any
        const s = w.__stavePerf?.snapshot?.()
        const log: Array<{ level: string; runtime: string; message: string; line?: number }> =
          w.__staveGetLog?.() ?? []
        const reactive = log.filter((e) => e.level === 'error' && e.runtime === 'hydra' && /reactive fn/.test(e.message))
        return {
          worker: s?.gauges?.['viz.worker'] ?? 0,
          hydra: s?.gauges?.['viz.hydra'] ?? 0,
          count: reactive.length,
          messages: reactive.map((e) => e.message),
          lines: reactive.map((e) => e.line),
        }
      })
      console.log(
        `[#274 b] EFFECT surfaced=${obs.count} worker=${obs.worker} hydra=${obs.hydra} lines=${JSON.stringify(obs.lines)} msgs=${JSON.stringify(obs.messages)}`,
      )

      // Control probe (PK29): worker hydra path taken, no fallback — surfacing the
      // throw must NOT tear the already-ready worker down (it's a log, not onError).
      expect(obs.worker, 'worker path taken, still live (control probe)').toBeGreaterThan(0)
      expect(obs.hydra, 'no fallback to main-thread hydra').toBe(0)
      // EFFECT (#275): the swallowed reactive-fn throw now reaches the main engineLog.
      expect(obs.count, 'hydra reactive-fn throw surfaces to the main Console (#275, p5 parity)').toBeGreaterThanOrEqual(1)
      // ISOLATION: it's OUR induced throw, not an incidental hydra error — the surfaced
      // message carries the thrown text end-to-end (hydra warn → vizlog → main log).
      expect(
        obs.messages.some((m) => m.includes('hydra tick boom')),
        'the surfaced error is the induced reactive-fn throw (end-to-end)',
      ).toBe(true)
      // LINE ATTRIBUTION (#330): the Error's stack maps back through the new-Function
      // header (getHydraLineOffset) to the authored line — the `throw` is on line 3 of
      // HYDRA_THROW_AFTER_READY (`let _n = 0` is line 1, the `.rotate(() => …throw…)` is line 3).
      expect(obs.lines, 'the hydra reactive-fn error is attributed to the authored editor line (3)').toContain(3)
    } finally {
      await ctx.close()
    }
  })

  test('(c) #270/#253 — the live config-marshal channel reaches the hydra worker', async ({ browser }) => {
    // SCOPE (honest split):
    //  - The config VALUE marshal — that the worker subset carries `hydraAudioBins`
    //    and a `{density}` patch doesn't wipe it (the #253 bug) — is UNIT-covered in
    //    editor `vizConfig.test.ts` (pickWorkerVizConfig + merge-not-reset). Not
    //    re-asserted here.
    //  - A resolution→cost assert is physically UNOBSERVABLE via `viz.worker.draw`:
    //    hydra renders DIRECTLY to the transferred canvas (Tier 1, no blit/readback)
    //    and `tick()` only DISPATCHES GPU work, so the CPU dispatch wall-time this
    //    section measures is resolution-independent (the GPU fill is async). P117.
    //  - What THIS e2e adds is CHANNEL LIVENESS: a live config message (setVizQuality
    //    → ConfigMessage, the #270 channel) posted to a MOUNTED hydra worker does not
    //    disrupt it (no remount/teardown/fallback; it keeps drawing). The marshalled
    //    config has no externally-observable effect on a running hydra (density is
    //    p5-only, hydraAudioBins is visual, resolution is remount-pull), so liveness
    //    is the strongest e2e signal — value correctness lives in the unit test.
    const { ctx, page } = await open(browser)
    try {
      await registerHydra(page, 'hy-cfg', HYDRA_HEAVY)
      await remount(page, `$: s("hh*16").bank("RolandTR909").gain(1.0).viz('hy-cfg')`)

      const before = await measure(page)
      console.log(`[#274 c] before: ${JSON.stringify(before)}`)
      expect(before.worker, 'worker hydra viz live (control probe)').toBeGreaterThanOrEqual(1)
      expect(before.hydra, 'no main-thread fallback').toBe(0)
      expect(before.draw, 'viz.worker.draw populated for hydra').not.toBeNull()

      // Fire a LIVE config change (setVizQuality posts a ConfigMessage to the worker
      // — the same channel that marshals hydraAudioBins, #270/#253). The mounted
      // hydra worker must keep running: applied via updateVizConfig (merge), NOT a
      // remount/teardown/fallback.
      await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).__staveSetVizQuality?.('performance')
      })
      await page.waitForTimeout(500)
      // `measure` RESETS the profiler, so this window is taken entirely AFTER the
      // config message — a non-zero draw count here = the worker kept drawing
      // THROUGH and PAST the live config update (not frozen, not torn down).
      const after = await measure(page)
      console.log(`[#274 c] after live config: ${JSON.stringify(after)}`)

      // The live ConfigMessage reached the hydra worker and did NOT disrupt it:
      // same instance still live (no remount), no fallback, still drawing post-config.
      expect(after.worker, 'hydra worker stayed live across the live config change (no remount)').toBeGreaterThanOrEqual(1)
      expect(after.hydra, 'no fallback triggered by the config message').toBe(0)
      expect(after.draw, 'viz.worker.draw still populated after the config message').not.toBeNull()
      expect(after.draw!.count, 'the hydra worker kept drawing AFTER the live config update').toBeGreaterThan(0)
    } finally {
      await ctx.close()
    }
  })

  test('(d) #230 — viz.worker.draw populates from a hydra-kind worker viz', async ({ browser }) => {
    const { ctx, page } = await open(browser)
    try {
      await registerHydra(page, 'hy-draw', HYDRA_HEAVY)
      await remount(page, `$: s("hh*16").bank("RolandTR909").gain(0.9).viz('hy-draw')`)
      const m = await measure(page)
      console.log(`[#274 d] ${JSON.stringify(m)}`)

      // Control probe: it is the WORKER hydra path (not main HydraVizRenderer).
      expect(m.worker, 'a hydra worker viz must be live (control probe)').toBeGreaterThanOrEqual(1)
      expect(m.hydra, 'no main-thread fallback').toBe(0)
      // THE BRIDGE (#230) is kind-agnostic — s.draw() is timed for hydra too.
      expect(m.draw, 'viz.worker.draw section must exist for hydra (the bridge fired)').not.toBeNull()
      expect(m.draw!.count, 'hydra draw samples recorded from the worker').toBeGreaterThan(0)
      expect(m.draw!.p95, 'a sensible non-negative hydra draw time').toBeGreaterThanOrEqual(0)
    } finally {
      await ctx.close()
    }
  })

  test('(e) VISUAL — the worker hydra canvas actually PAINTS audio-reactive frames (not black, not frozen)', async ({ browser }) => {
    // The gauge tests (a)-(d) prove the worker MOUNTED + the bridge fired, but a
    // worker can report viz.worker=1 while the transferred canvas shows nothing
    // (GL context lost, blit broken, shader no-op). This is the LOKAYATA gate: the
    // rendered artifact itself. Decode-free (high-n-headroom technique): screenshot
    // the inline canvas N× ~0.6s apart → md5 each. A LIVE hydra animates (≥3/5
    // distinct frames) and fills pixels (large PNG); a black/frozen canvas is 1
    // distinct + a tiny PNG (a flat image compresses to ~nothing).
    const { ctx, page } = await open(browser)
    try {
      await registerHydra(page, 'hy-visual', HYDRA_OK)
      await remount(page, `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909").viz('hy-visual')`)

      // Control probe: it IS the worker hydra path (not main, not blank-fallback).
      const g = await snap(page)
      expect(g.worker, 'worker hydra viz live (control probe)').toBeGreaterThanOrEqual(1)
      expect(g.hydra, 'no main-thread fallback').toBe(0)

      const canvas = page.locator('[data-viz-zone] canvas').first()
      await canvas.waitFor({ timeout: 15000 })

      const shots: { hash: string; bytes: number }[] = []
      for (let i = 0; i < 5; i++) {
        const buf = await canvas.screenshot({
          path: i === 0 || i === 4 ? `test-results/hydra-visual-${i}.png` : undefined,
        })
        shots.push({ hash: createHash('md5').update(buf).digest('hex').slice(0, 8), bytes: buf.length })
        if (i < 4) await page.waitForTimeout(600)
      }
      const distinct = new Set(shots.map((s) => s.hash)).size
      const maxBytes = Math.max(...shots.map((s) => s.bytes))
      console.log(`[#274 e] distinct frames=${distinct}/5  maxPNG=${maxBytes}B  hashes=${shots.map((s) => s.hash).join(',')}`)

      // ANIMATING: a frozen/black canvas yields 1 distinct hash across the window.
      expect(distinct, 'the hydra canvas must change frame-to-frame (animating, not frozen)').toBeGreaterThanOrEqual(3)
      // NON-BLACK: a flat/black PNG compresses to a few hundred bytes; a real
      // shader frame is many KB. Generous floor keeps it off the noise.
      expect(maxBytes, 'the hydra canvas must paint pixels (not a black/empty surface)').toBeGreaterThan(3000)
    } finally {
      await ctx.close()
    }
  })
})
