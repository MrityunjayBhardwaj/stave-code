/**
 * PHASE B ACCEPTANCE GATE — end-to-end UI-render verification of the whole
 * worker-viz system in the REAL app (Lokāyata: observe the rendered artifact +
 * the perf gauges, never infer from "it didn't throw").
 *
 * Covers, with the worker flag ON (worker path) and OFF (main fallback):
 *   - all 7 p5 built-ins (pianoroll/wordfall/scope/fscope/spectrum/spiral/pitchwheel)
 *   - all 4 hydra built-ins (hydra/pianoroll:hydra/scope:hydra/kaleidoscope:hydra)
 *     — #252 residual: only kaleidoscope was eyeballed; default/pianoroll/scope
 *       were guard-tested only. This sweep eyeballs all four.
 *   - a user `.viz()` p5 sketch + a user `.hydra()` sketch
 *   - MODES: inline (Monaco viewzone, viewZones.ts) + backdrop (compiledVizProvider,
 *     full-screen) are DRIVEN here. The picker preview (VizPanel) is NOT driven —
 *     it's `showVizPicker`-gated (standalone-editor surface, not the WorkspaceShell
 *     app) and its `useVizRenderer` hook calls the SAME `mountVizRenderer`, so its
 *     renderer path is covered transitively by mode-invariance (a dedicated
 *     picker-UI test is a follow-up). (Popout was dead scaffold; #240 WIRED it —
 *     `openPopoutPreview` is now implemented via the `onOpenPopoutPreview` shell
 *     prop + `usePopoutPreview`, covered by viz-popout.spec.ts.)
 *   - runtime fallback to main thread when the worker fails before `ready` (PK23).
 *   - re-evaluate reactivity + resize.
 *
 * inline + backdrop + the picker's `useVizRenderer` all converge on
 * `mountVizRenderer → renderer.mount()`; the renderer (FallbackVizRenderer→
 * WorkerVizRenderer) is mode-invariant, so renderer correctness is swept once per
 * viz TYPE inline, and the two driven mount modes confirm each drives that renderer
 * + sizes/places the canvas.
 *
 * Run (server auto-starts; reap .next first per P83 for fresh COOP headers):
 *   E2E_VERIFY=1 pnpm --filter @stave/app exec playwright test phase-b-verify.spec.ts --timeout=400000
 */
import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const SHOT = 'test-results/verify'
mkdirSync(SHOT, { recursive: true })

const P5_BUILTINS = ['pianoroll', 'wordfall', 'scope', 'fscope', 'spectrum', 'spiral', 'pitchwheel']
const HYDRA_BUILTINS = ['hydra', 'pianoroll:hydra', 'scope:hydra', 'kaleidoscope:hydra']

// User sketches (registered at runtime via __staveRegisterViz).
// Bus DSP uniforms live on `sig` (sig.rms / sig.fft) — NOT on `stave` (which carries
// scheduler/analyser/hapStream/width/height/options/sig). Reading `stave.rms` is
// undefined and `stave.fft.length` THROWS, aborting draw() after background()
// with NO surfaced error — the "blank that isn't blank" trap (P106). Opaque bg +
// non-zero base radius keep it visible at idle audio.
const USER_P5 = `function setup(){ createCanvas(stave.width, stave.height) }
function draw(){
  background(28, 34, 64)
  noStroke(); fill(120, 200, 255)
  const r = 80 + sig.rms * 500
  circle(width/2, height/2, r)
  fill(255, 180, 90)
  for (let i=0;i<sig.fft.length && i<48;i++){
    const h = 4 + sig.fft[i] * height
    rect(i*(width/48), height-h, width/48-1, h)
  }
}`
const USER_HYDRA = `s.osc(20, 0.1, () => s.a.fft[0] * 6)
  .color(0.4, 0.7, 1.0)
  .rotate(() => s.a.fft[1] * 3.14)
  .modulate(s.noise(2, 0.5), () => 0.08 + s.a.fft[2] * 0.3)
  .out()`
// BRIGHT opaque p5 — used for the backdrop so it's unambiguously visible behind
// the code (USER_P5 above is intentionally dark/audio-driven, near-invisible idle).
const BACKDROP_P5 = `function setup(){ createCanvas(stave.width, stave.height) }
function draw(){
  background(140, 30, 160)
  noStroke(); fill(255, 200, 60)
  const r = 80 + sig.rms * 600
  circle(width/2, height/2, r)
}`

async function boot(page: Page, worker: boolean): Promise<void> {
  await page.addInitScript((w) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_PERF__ = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_E2E__ = true
    try {
      localStorage.setItem('stave.viz.worker', w ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, worker)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1500)
}

async function setCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
    if (!e) return false
    e.getModel()?.setValue(c)
    return true
  }, code)
  expect(ok, 'monaco editor present').toBe(true)
  await page.waitForTimeout(200)
}
async function stop(page: Page): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Period`)
  await page.waitForTimeout(500)
}
async function run(page: Page): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2500)
}
async function gauges(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).__stavePerf?.snapshot?.()
    return s?.gauges ?? {}
  })
}

// Per-case error sink wired once; cases reset the slice index they read from.
function wireConsole(page: Page) {
  const errors: string[] = []
  const fallback: string[] = []
  page.on('console', (m) => {
    const t = m.text()
    if (m.type() === 'error') errors.push(t)
    if (t.includes('falling back to the main thread')) fallback.push(t)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  return { errors, fallback }
}

const AUDIO = `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909")`

test.describe('Phase B acceptance — worker-viz end-to-end', () => {
  test.skip(!process.env.E2E_VERIFY, 'acceptance gate — set E2E_VERIFY=1')

  test('worker ON — all built-ins + user sketches render inline (off-main, no fallback)', async ({ page }) => {
    const { errors, fallback } = wireConsole(page)
    await boot(page, true)

    const isolated = await page.evaluate(() => self.crossOriginIsolated === true)
    // eslint-disable-next-line no-console
    console.log(`[verify] crossOriginIsolated=${isolated} (worker transport tier requires true)`)
    expect(isolated, 'COOP/COEP must give crossOriginIsolated for SAB-capable worker tier').toBe(true)

    // Register the two user sketches.
    const reg = await page.evaluate(
      ({ p5, hy }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const f = (window as any).__staveRegisterViz
        if (!f) return false
        f({ id: 'verify-up5', name: 'myp5', renderer: 'p5', code: p5, requires: ['streaming'], nativeSize: { w: 800, h: 300 }, createdAt: 1, updatedAt: 1 })
        f({ id: 'verify-uhydra', name: 'myhydra', renderer: 'hydra', code: hy, requires: ['audio'], nativeSize: { w: 600, h: 400 }, createdAt: 1, updatedAt: 1 })
        return true
      },
      { p5: USER_P5, hy: USER_HYDRA },
    )
    expect(reg, '__staveRegisterViz hook present').toBe(true)

    const cases: { id: string; name: string }[] = [
      ...P5_BUILTINS.map((id) => ({ id, name: `p5:${id}` })),
      ...HYDRA_BUILTINS.map((id) => ({ id, name: `hydra:${id}` })),
      { id: 'myp5', name: 'user:p5' },
      { id: 'myhydra', name: 'user:hydra' },
    ]

    const results: Record<string, unknown>[] = []
    for (const c of cases) {
      const errBefore = errors.length
      const fbBefore = fallback.length
      await stop(page)
      // single quotes — transpiler reifies double-quoted strings to mini patterns (P62)
      await setCode(page, `${AUDIO}.viz('${c.id}')`)
      await run(page)
      const g = await gauges(page)
      const shot = `${SHOT}/on-${c.name.replace(/[:/]/g, '_')}.png`
      await page.screenshot({ path: shot })
      await page.waitForTimeout(900)
      const shot2 = `${SHOT}/on-${c.name.replace(/[:/]/g, '_')}-2.png`
      await page.screenshot({ path: shot2 })
      const caseErrors = errors.slice(errBefore).filter((e) => /viz worker|OffscreenCanvas|hydra|p5|worker|render/i.test(e))
      const caseFb = fallback.slice(fbBefore)
      const row = {
        case: c.name,
        id: c.id,
        worker: g['viz.worker'] ?? 0,
        mainP5: g['viz.p5'] ?? 0,
        mainHydra: g['viz.hydra'] ?? 0,
        errors: caseErrors,
        fellBack: caseFb.length,
      }
      results.push(row)
      // eslint-disable-next-line no-console
      console.log(`[verify] ${JSON.stringify(row)}`)
    }

    // eslint-disable-next-line no-console
    console.log(`[verify] SUMMARY\n${JSON.stringify(results, null, 2)}`)

    // Every case must have mounted on the WORKER (viz.worker>0) and NOT fallen
    // back to a main renderer (viz.p5/viz.hydra==0), with no render/worker errors.
    for (const r of results) {
      expect(r.worker as number, `${r.case}: worker renderer must be live`).toBeGreaterThan(0)
      expect(r.mainP5 as number, `${r.case}: must NOT fall back to main p5`).toBe(0)
      expect(r.mainHydra as number, `${r.case}: must NOT fall back to main hydra`).toBe(0)
      expect(r.fellBack as number, `${r.case}: no fallback warning`).toBe(0)
      expect(r.errors as string[], `${r.case}: no render/worker errors`).toEqual([])
    }
  })

  test('worker ON — backdrop (full-screen) drives the worker renderer (p5 + hydra)', async ({ page }) => {
    const { errors, fallback } = wireConsole(page)
    await boot(page, true)

    // Start audio so the backdrop has a live analyser/scheduler feed.
    await setCode(page, AUDIO)
    await run(page)

    // p5 backdrop via the CODE-DRIVEN path (`.spectrum()` — a real STRUDEL_VIZ_METHODS
    // method). Unlike seed+pin, this keeps pattern.strudel active and composites the
    // backdrop BEHIND the code, so it's actually visible. Override the bundled
    // spectrum.p5 with a BRIGHT opaque sketch so the backdrop is unambiguous.
    const overrode = await page.evaluate((code) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__staveOverrideVizFile?.('spectrum', code) ?? null
    }, BACKDROP_P5)
    expect(overrode, 'spectrum.p5 override hook present + file exists').not.toBeNull()
    await stop(page)
    await setCode(page, `${AUDIO}.spectrum()`)
    await run(page)
    await page.waitForTimeout(2000)
    let g = await gauges(page)
    // eslint-disable-next-line no-console
    console.log(`[verify backdrop p5] gauges=${JSON.stringify(g)}`)
    await page.screenshot({ path: `${SHOT}/backdrop-p5.png` })
    expect(g['viz.worker'] ?? 0, 'backdrop p5 must mount in worker').toBeGreaterThan(0)
    expect(g['viz.p5'] ?? 0, 'backdrop p5 must not fall back to main').toBe(0)

    // hydra backdrop — no code-driven method exists for hydra, so use the
    // production seed+pin path. Gauge-proven (the hydra renderer itself is
    // visually confirmed inline elsewhere in this spec).
    const okHy = await page.evaluate((code) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__staveSeedAndPinBackdrop?.('verify-bd-hy', 'verifyBdHy', 'hydra', code) ?? false
    }, USER_HYDRA)
    expect(okHy).toBe(true)
    await page.waitForTimeout(2500)
    g = await gauges(page)
    // eslint-disable-next-line no-console
    console.log(`[verify backdrop hydra] gauges=${JSON.stringify(g)}`)
    await page.screenshot({ path: `${SHOT}/backdrop-hydra.png` })
    expect(g['viz.worker'] ?? 0, 'backdrop hydra must mount in worker').toBeGreaterThan(0)
    expect(g['viz.hydra'] ?? 0, 'backdrop hydra must not fall back to main').toBe(0)

    const workerErrors = errors.filter((e) => /viz worker|OffscreenCanvas|hydra|worker/i.test(e))
    expect(workerErrors, `worker errors:\n${workerErrors.join('\n')}`).toEqual([])
    expect(fallback, `unexpected fallback:\n${fallback.join('\n')}`).toEqual([])
  })

  test('worker OFF — main-thread renderers still render correctly (fallback target)', async ({ page }) => {
    const { errors } = wireConsole(page)
    await boot(page, false) // flag OFF → P5VizRenderer / HydraVizRenderer on main

    // p5 (scope) on main.
    await stop(page)
    await setCode(page, `${AUDIO}.viz('scope')`)
    await run(page)
    let g = await gauges(page)
    // eslint-disable-next-line no-console
    console.log(`[verify OFF p5] gauges=${JSON.stringify(g)}`)
    await page.screenshot({ path: `${SHOT}/off-scope-main.png` })
    expect(g['viz.worker'] ?? 0, 'flag OFF → no worker').toBe(0)
    expect(g['viz.p5'] ?? 0, 'flag OFF → main p5 renderer live').toBeGreaterThan(0)

    // hydra on main.
    await stop(page)
    await setCode(page, `${AUDIO}.viz('kaleidoscope:hydra')`)
    await run(page)
    g = await gauges(page)
    // eslint-disable-next-line no-console
    console.log(`[verify OFF hydra] gauges=${JSON.stringify(g)}`)
    await page.screenshot({ path: `${SHOT}/off-hydra-main.png` })
    expect(g['viz.worker'] ?? 0, 'flag OFF → no worker').toBe(0)
    expect(g['viz.hydra'] ?? 0, 'flag OFF → main hydra renderer live').toBeGreaterThan(0)

    const bad = errors.filter((e) => /render|p5|hydra/i.test(e))
    expect(bad, `main-thread render errors:\n${bad.join('\n')}`).toEqual([])
  })

  test('worker ON — a worker that fails before ready falls back to main (PK23)', async ({ page }) => {
    const { errors, fallback } = wireConsole(page)
    await boot(page, true)

    // Swap in a worker that posts a pre-`ready` diag error → FallbackVizRenderer
    // tears it down and mounts the main-thread renderer with the real sketch.
    const forced = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__staveForceBrokenVizWorker?.() ?? false
    })
    expect(forced, 'force-broken-worker hook present').toBe(true)

    await stop(page)
    await setCode(page, `${AUDIO}.viz('scope')`)
    await run(page)
    await page.waitForTimeout(1500)
    const g = await gauges(page)
    // eslint-disable-next-line no-console
    console.log(`[verify fallback] gauges=${JSON.stringify(g)} fallbackWarnings=${fallback.length}`)
    await page.screenshot({ path: `${SHOT}/fallback-to-main.png` })

    // The worker was selected but failed pre-ready → degraded to the MAIN p5
    // renderer (viz.p5>0), no live worker (viz.worker==0), and it told the user.
    expect(fallback.length, 'a fallback warning must have been emitted').toBeGreaterThan(0)
    expect(g['viz.p5'] ?? 0, 'must have degraded to the main-thread p5 renderer').toBeGreaterThan(0)
    expect(g['viz.worker'] ?? 0, 'no live worker renderer after fallback').toBe(0)
    // The forced pre-ready error is expected; no OTHER (post-fallback) errors.
    const unexpected = errors.filter((e) => !/forced E2E worker failure/.test(e))
    expect(unexpected, `unexpected errors:\n${unexpected.join('\n')}`).toEqual([])
  })

  test('worker ON — resize keeps the inline viz rendering', async ({ page }) => {
    const { errors } = wireConsole(page)
    await boot(page, true)
    await stop(page)
    await setCode(page, `${AUDIO}.viz('spectrum')`)
    await run(page)
    await page.screenshot({ path: `${SHOT}/resize-before.png` })
    await page.setViewportSize({ width: 900, height: 700 })
    await page.waitForTimeout(1500)
    const g = await gauges(page)
    await page.screenshot({ path: `${SHOT}/resize-after.png` })
    // eslint-disable-next-line no-console
    console.log(`[verify resize] gauges=${JSON.stringify(g)}`)
    expect(g['viz.worker'] ?? 0, 'still worker-rendering after resize').toBeGreaterThan(0)
    const bad = errors.filter((e) => /resize|render|worker/i.test(e))
    expect(bad, `resize errors:\n${bad.join('\n')}`).toEqual([])
  })
})
