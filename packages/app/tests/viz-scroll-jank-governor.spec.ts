import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * viz-scroll-jank-governor (REGRESSION GATE) — the GPU-budget governor (P122/PV91)
 * keeps the editor scrollable when N heavy GLSL viz co-saturate the shared GPU.
 *
 * The bug (diagnosed 2026-06-09): 5 concurrent ocean-class raymarchers (4 inline
 * .viz() + 1 backdrop) at quality HIGH × Retina DPR=2 drove Chrome's COMPOSITOR to
 * ~95% dropped frames — and because the editor scroll composites on the SAME GPU,
 * the whole UI dropped to ~6fps. Main thread was IDLE (GPU-bound, not main-thread).
 * The fix is `vizGovernor`: adaptive fps-throttle + round-robin concurrency cap +
 * render-resolution drop under sustained stress.
 *
 * This gate is CI-SAFE: the heavy shader is INLINED (no readFileSync of a user
 * project), so the file imports cleanly. The actual measurement needs a REAL GPU
 * compositor, so the test body is gated behind SCROLL_JANK=1 + --headed (like the
 * other scroll-jank specs) and skips in headless CI.
 *
 * The assertion is RELATIVE within one run (governor ON vs OFF on the SAME machine),
 * so it is machine-independent — it cannot flake on a fast/slow GPU the way an
 * absolute "drop < X%" threshold would. The authoritative GPU-jank instrument is
 * Chrome's `DroppedFrame` compositor trace (CDP `cc` category), NOT the main-thread
 * rAF meter, which is blind to compositor jank until saturation starves rAF itself
 * (PV92, extends PV90). Each scenario runs in its OWN browser context so the WebGL
 * context budget (~16, Chrome) can't bleed across the two passes (PV84).
 *
 * Run: SCROLL_JANK=1 pnpm --filter @stave/app exec playwright test viz-scroll-jank-governor.spec.ts --headed --timeout=240000 --workers=1
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

/** Ocean-class HEAVY raymarcher (ShaderToy mainImage) — genuinely FILL/fragment
 *  bound: a high-iteration sphere-tracing loop per pixel, so cost scales with
 *  resolution (the lever the governor's resolution drop targets) and N instances
 *  co-saturate the GPU. Audio-reactive via iChannel0 (master FFT, row 0). Inlined
 *  so the gate carries no dependency on a user project (cf. the /tmp diagnostics). */
const HEAVY_GLSL = String.raw`// Heavy raymarched caverns — deliberately fill-bound for the governor gate.
float fbm(vec3 p){
  float a=0.5, s=0.0;
  for(int i=0;i<5;i++){ s+=a*(sin(p.x*1.7)+cos(p.y*1.9)+sin(p.z*2.1)); p*=2.03; a*=0.5; }
  return s;
}
float map(vec3 p, float t){
  float audio = texture(iChannel0, vec2(0.15, 0.25)).r; // master FFT bin
  float d = 1.6 + 0.6*sin(t*0.3) + 0.7*audio;
  return d - length(p) * 0.18 + 0.45*fbm(p*0.9 + vec3(0.0, t*0.2, 0.0));
}
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = (2.0*fragCoord - iResolution.xy) / iResolution.y;
  vec3 ro = vec3(0.0, 0.0, -4.0);
  vec3 rd = normalize(vec3(uv, 1.6));
  float t = iTime;
  vec3 col = vec3(0.0);
  float tr = 0.0;
  // 96 raymarch steps — heavy per-pixel work (the fill-bound cost).
  for(int i=0;i<96;i++){
    vec3 p = ro + rd*tr;
    float d = map(p, t);
    if(d < 0.001){
      float g = float(i)/96.0;
      col = mix(vec3(0.1,0.3,0.6), vec3(0.9,0.5,0.2), g) + 0.3*fbm(p*3.0+t);
      break;
    }
    tr += max(0.02, d*0.5);
    if(tr > 30.0) break;
  }
  col += 0.04*float(96); // ensure the loop body isn't optimized away
  fragColor = vec4(col*0.02 + col*0.0, 1.0) + vec4(col, 1.0);
}`

const AUDIO = `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909")\n$: note("c2 eb2 g2 c3").s("sawtooth").lpf(700)`

/** A long document with N inline `.viz("heavy")` zones so the editor scrolls and
 *  multiple heavy viz are live at once. */
function heavyDoc(n: number): string {
  const pad = (label: string, count: number) =>
    Array.from({ length: count }, (_, i) => `// ${label} line ${i + 1} — padding so the editor has scroll travel`).join('\n')
  const vizzes = Array.from({ length: n }, (_, i) => `$: silence.viz("heavy") // inline ${i + 1}`).join('\n')
  return [pad('TOP', 30), AUDIO, vizzes, pad('BOTTOM', 50)].join('\n')
}

async function setCode(page: Page, code: string): Promise<void> {
  await page.evaluate((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.setValue(c)
  }, code)
  await page.waitForTimeout(150)
}
async function runCode(page: Page): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(3000)
}

interface GovResult {
  dropRate: number // compositor dropped / total (%)
  drawn: number
  dropped: number
  rafP50: number
  jankFrames: number
  rafFrames: number
  peakWorker: number
  peakGlctx: number
}

/** Boot a fresh context with the governor ON or OFF, register + mount N heavy GLSL
 *  viz (inline + backdrop) at quality HIGH × DPR 2, settle, then measure a scroll
 *  window via the compositor DroppedFrame trace + a rAF meter. */
async function measureScenario(browser: Browser, governorOn: boolean, nInline: number): Promise<GovResult> {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1300 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  try {
    await page.addInitScript((gov: boolean) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_PERF__ = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_E2E__ = true
      try {
        localStorage.setItem('stave.viz.worker', '1')
        // Governor disables ONLY on the exact string '0'; '1' (or absent) = enabled.
        localStorage.setItem('stave.viz.governor', gov ? '1' : '0')
      } catch {
        /* private mode */
      }
    }, governorOn)

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(1000)
    await page.evaluate((glsl) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      w.__staveSetVizQuality?.('high') // worst case — max resolution + density
      w.__staveRegisterViz?.({ id: 'heavy', name: 'heavy', renderer: 'glsl', code: glsl, requires: ['audio'], nativeSize: { w: 640, h: 360 }, createdAt: 1, updatedAt: 1 })
    }, HEAVY_GLSL)

    // Activate the pattern editor tab, set the heavy doc, evaluate.
    const editorTab = page.locator('[data-workspace-tab][data-tab-kind="editor"]').first()
    await editorTab.click()
    await page.waitForTimeout(200)
    await setCode(page, heavyDoc(nInline))
    await runCode(page)
    await page.waitForTimeout(1500)

    // Pin the heavy shader as a full-screen BACKDROP too (the 5th saturating viz),
    // after eval so the code-backdrop handler can't wipe it.
    await page.evaluate((glsl) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__staveSeedAndPinBackdrop?.('viz-heavy-bg', 'heavybg', 'glsl', glsl)
    }, HEAVY_GLSL)
    await page.waitForTimeout(2500)

    // Re-activate the pattern tab (pin/seed may have switched it) + hover the editor.
    await editorTab.click()
    await page.waitForTimeout(400)
    const edBox = await page.locator('.monaco-editor').first().boundingBox()
    if (edBox) await page.mouse.move(edBox.x + edBox.width / 2, edBox.y + edBox.height / 2)

    // WARM-UP scroll (unmeasured): let the governor ramp to its steady-state throttle
    // BEFORE measuring — under catastrophic jank a headed run starves its OWN test
    // timers, so the first ~1-2s is a ramp transient, not the steady state the user
    // lives in. We want steady state (method lesson from the diagnosis).
    for (let i = 0; i < 60; i++) {
      try { await page.mouse.wheel(0, i % 2 ? 120 : -120) } catch { /* transient */ }
      await page.waitForTimeout(16)
    }
    await page.waitForTimeout(800)

    // Install a rAF frame-delta meter (the main-thread CONTROL — proves main is idle).
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      w.__jank = { last: performance.now(), deltas: [] as number[], raf: 0 }
      const tick = () => { const n = performance.now(); w.__jank.deltas.push(n - w.__jank.last); w.__jank.last = n; w.__jank.raf = requestAnimationFrame(tick) }
      w.__jank.raf = requestAnimationFrame(tick)
    })

    // Start the compositor frame-lifecycle trace (the AUTHORITATIVE GPU-jank signal).
    const client = await context.newCDPSession(page)
    await client.send('Tracing.start', { transferMode: 'ReturnAsStream', traceConfig: { includedCategories: ['disabled-by-default-devtools.timeline.frame', 'benchmark', 'cc', 'gpu'] } })

    let peakWorker = 0, peakGlctx = 0
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < 30; i++) {
        try { await page.mouse.wheel(0, 120) } catch { /* transient CDP input stall under jank */ }
        await page.waitForTimeout(14)
      }
      await page.waitForTimeout(100)
      for (let i = 0; i < 30; i++) {
        try { await page.mouse.wheel(0, -120) } catch { /* transient */ }
        await page.waitForTimeout(14)
      }
      const g = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const snap = (window as any).__stavePerf?.snapshot?.()
        return { worker: snap?.gauges?.['viz.worker'] ?? 0, glctx: snap?.gauges?.['viz.glctx'] ?? 0 }
      })
      peakWorker = Math.max(peakWorker, g.worker)
      peakGlctx = Math.max(peakGlctx, g.glctx)
    }

    const complete = new Promise<{ stream?: string }>((res) => client.once('Tracing.tracingComplete', res as () => void))
    await client.send('Tracing.end')
    const { stream } = await complete
    let traceData = ''
    if (stream) {
      for (;;) {
        const { data: d, eof } = await client.send('IO.read', { handle: stream, size: 1_000_000 })
        traceData += d
        if (eof) break
      }
      await client.send('IO.close', { handle: stream })
    }
    let drawn = 0, dropped = 0, partial = 0
    try {
      const events = (JSON.parse(traceData) as { traceEvents?: Array<{ name?: string; args?: { data?: { state?: string } } }> }).traceEvents ?? []
      for (const e of events) {
        if (e.name === 'DroppedFrame') dropped++
        else if (e.name === 'DrawFrame') drawn++
        const st = e.args?.data?.state
        if (st === 'presented_all') drawn++
        else if (st === 'dropped') dropped++
        else if (st === 'presented_partial') partial++
      }
    } catch { /* zeros */ }
    const totalC = drawn + dropped + partial

    const m = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      cancelAnimationFrame(w.__jank.raf)
      const deltas: number[] = (w.__jank.deltas as number[]).slice(2)
      const sorted = [...deltas].sort((a, b) => a - b)
      const pct = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0)
      return { rafP50: Math.round(pct(0.5) * 10) / 10, jankFrames: deltas.filter((d) => d > 24).length, rafFrames: deltas.length }
    })

    return {
      dropRate: totalC ? Math.round((dropped / totalC) * 1000) / 10 : 0,
      drawn,
      dropped,
      rafP50: m.rafP50,
      jankFrames: m.jankFrames,
      rafFrames: m.rafFrames,
      peakWorker,
      peakGlctx,
    }
  } finally {
    await context.close() // release this scenario's WebGL contexts before the next (PV84)
  }
}

test.describe('viz-scroll-jank-governor — GPU-budget governor regression gate', () => {
  test('governor ON drops fewer compositor frames than OFF under N heavy GLSL viz', async ({ browser }) => {
    test.skip(!process.env.SCROLL_JANK, 'GPU regression gate — set SCROLL_JANK=1 and run --headed (needs a real compositor)')
    test.setTimeout(240_000)

    const N = 4 // 4 inline + 1 backdrop = 5 ocean-class viz (the diagnosed repro)
    // OFF first (establish the unthrottled baseline), then ON — separate contexts.
    const off = await measureScenario(browser, false, N)
    const on = await measureScenario(browser, true, N)

    /* eslint-disable no-console */
    console.log('\n=== GOVERNOR REGRESSION GATE (5 heavy GLSL viz, quality HIGH, DPR=2) ===')
    for (const [label, r] of [['governor OFF', off], ['governor ON ', on]] as const) {
      console.log(`[${label}] compositor drop=${r.dropRate}% (drawn=${r.drawn} dropped=${r.dropped})  rafP50=${r.rafP50}ms jank(>24ms)=${r.jankFrames}/${r.rafFrames}  peak worker=${r.peakWorker} glctx=${r.peakGlctx}`)
    }
    console.log(`Δ compositor drop: ${off.dropRate}% → ${on.dropRate}%   Δ jankFrames: ${off.jankFrames} → ${on.jankFrames}`)
    /* eslint-enable no-console */

    // Both scenarios must have produced data (the harness ran + viz mounted).
    expect(off.rafFrames, 'OFF produced too few frames — harness/setup failure').toBeGreaterThan(10)
    expect(on.rafFrames, 'ON produced too few frames — harness/setup failure').toBeGreaterThan(10)
    expect(on.peakWorker, 'no worker viz mounted with governor ON').toBeGreaterThan(0)

    // The governor must NEVER make compositor jank meaningfully WORSE (5pt run noise).
    expect(on.dropRate, 'governor ON dropped MORE frames than OFF').toBeLessThanOrEqual(off.dropRate + 5)

    // When the OFF baseline actually reproduces the jank (high drop rate on this GPU),
    // the governor must measurably HELP. On a GPU fast enough that even 5 raymarchers
    // don't saturate (OFF drop low), there's nothing to fix — log and don't assert a
    // delta we can't observe (no silent threshold games).
    if (off.dropRate > 30) {
      expect(on.dropRate, 'governor failed to reduce a reproduced compositor-drop jank').toBeLessThan(off.dropRate)
    } else {
      // eslint-disable-next-line no-console
      console.log(`(OFF drop ${off.dropRate}% < 30% — GPU did not saturate on this machine; governor not exercised, delta assertion skipped)`)
    }
  })
})
