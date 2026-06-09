import { test, type Page } from '@playwright/test'

/**
 * viz-scroll-jank (DIAGNOSTIC) — why does the editor scroll JANK when a heavy
 * inline viz runs?
 *
 * The perf-matrix (#228/#249, PV72) measured steady-state cost but NEVER
 * scrolled — so the scroll handlers (`recomputeAllZones` + `hitTestAndUpdateBar`,
 * both O(zones), both forcing synchronous reflow on every `onDidScrollChange`)
 * were invisible to it. This harness drives a REAL wheel-scroll over the editor
 * and measures the scroll window two ways:
 *   1. longtasks (count + max ms) + an independent rAF frame-delta meter →
 *      CLASSIFIES the jank: main-thread blocking (longtasks spike) vs compositor/
 *      GPU starvation (frame drops with NO longtasks).
 *   2. a CDP JS self-time profile over the SAME window → ATTRIBUTES the main-thread
 *      cost to specific functions.
 *
 * Compares NO-VIZ control vs HEAVY-WORKER-VIZ. The delta isolates the viz's
 * contribution to scroll jank.
 *
 * Run: SCROLL_JANK=1 pnpm --filter @stave/app exec playwright test viz-scroll-jank.spec.ts --timeout=180000 --workers=1
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

// Heavy WEBGL terrain — the user's genuinely-heavy per-frame sketch (verbatim
// shape from perf-matrix). Fed by the master analyser.
const SYNTH_CODE = String.raw`// Stave p5 viz — Synthwave waveform terrain
const HISTORY_LEN = 100; const COLS = 50; const waveHistory = [];
function setup() { createCanvas(stave.width, stave.height, WEBGL); angleMode(DEGREES); colorMode(HSB,360,100,100,1); }
function cap() { if (!stave.analyser) return; const buf=new Float32Array(stave.analyser.fftSize); stave.analyser.getFloatTimeDomainData(buf); const row=new Float32Array(COLS); const segLen=buf.length/COLS; for(let i=0;i<COLS;i++){let s=0;const a=Math.floor(i*segLen),b=Math.floor((i+1)*segLen);for(let j=a;j<b;j++)s+=buf[j];row[i]=s/Math.max(1,b-a);} waveHistory.unshift(row); if(waveHistory.length>HISTORY_LEN)waveHistory.pop(); }
function draw() { let rms=0; if(stave.analyser){const buf=new Float32Array(stave.analyser.fftSize);stave.analyser.getFloatTimeDomainData(buf);let sum=0;for(let i=0;i<buf.length;i++)sum+=buf[i]*buf[i];rms=Math.sqrt(sum/buf.length);} const amp=Math.min(rms*6,1); cap(); background(265,80,8); push(); translate(0,240,0); noFill(); strokeWeight(1.2); const halfW=500,cellW=(halfW*2)/(COLS-1),cellD=2000/Math.max(1,HISTORY_LEN-1),yScale=10+amp*50; for(let r=0;r<waveHistory.length;r++){const row=waveHistory[r];const z=-r*cellD;const t=waveHistory.length>1?r/(waveHistory.length-1):0;stroke(lerp(188,322,t),100,100,lerp(0.95,0.2,t));beginShape();for(let c=0;c<COLS;c++)vertex(-halfW+c*cellW,-row[c]*yScale,z);endShape();} stroke(310,100,100,0.35);strokeWeight(1);for(let c=0;c<COLS;c++){const x=-halfW+c*cellW;beginShape();for(let r=0;r<waveHistory.length;r++)vertex(x,-waveHistory[r][c]*yScale,-r*cellD);endShape();} pop(); }`

const AUDIO = `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909")\n$: note("c2 eb2 g2 c3").s("sawtooth").lpf(700)`

// A LONG document so the editor actually scrolls. Many comment lines padding
// above and below so there's vertical travel across the inline viz zone.
function longDoc(withViz: boolean): string {
  const pad = (label: string, n: number) =>
    Array.from({ length: n }, (_, i) => `// ${label} line ${i + 1} — padding so the editor has scroll travel`).join('\n')
  const viz = withViz ? `$: silence.viz("synthterrain")` : `$: silence // no viz (control)`
  return [pad('TOP', 40), AUDIO, viz, pad('BOTTOM', 60)].join('\n')
}

// Long doc with a FULL-SCREEN BACKDROP viz (`.spectrum()`) that stays on-screen
// the whole scroll — so the GPU is continuously loaded WHILE scrolling (the
// case the inline harness misses: PV78 pauses an inline viz once it scrolls off).
function longDocBackdrop(): string {
  const pad = (label: string, n: number) =>
    Array.from({ length: n }, (_, i) => `// ${label} line ${i + 1} — padding so the editor has scroll travel`).join('\n')
  const lines = AUDIO.split('\n')
  lines[lines.length - 1] = `${lines[lines.length - 1]}.spectrum()`
  return [pad('TOP', 40), ...lines, pad('BOTTOM', 60)].join('\n')
}

async function setCode(page: Page, code: string): Promise<void> {
  await page.evaluate((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
    e?.getModel()?.setValue(c)
  }, code)
  await page.waitForTimeout(150)
}
async function runCode(page: Page): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2500)
}
async function stopCode(page: Page): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Period`)
  await page.waitForTimeout(600)
}

interface ScrollResult {
  scenario: string
  vizGauge: number
  longtasks: number
  longtaskMaxMs: number
  frameCount: number
  frameP50: number
  frameP95: number
  frameMax: number
  jankFrames: number // rAF deltas > 24ms (missed a 60fps frame)
  topSelf: Array<{ fn: string; url: string; selfMs: number }>
}

/** Drive a real wheel-scroll over the editor for ~durationMs while measuring. */
async function measureScroll(page: Page, scenario: string, durationMs: number): Promise<ScrollResult> {
  // Hover the editor so wheel events hit the Monaco scrollable element.
  const box = await page.locator('.monaco-editor').first().boundingBox()
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)

  // Install an independent rAF frame-delta meter + reset the app profiler.
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    w.__stavePerf?.reset?.()
    w.__jank = { last: performance.now(), deltas: [] as number[], raf: 0 }
    const tick = () => {
      const now = performance.now()
      w.__jank.deltas.push(now - w.__jank.last)
      w.__jank.last = now
      w.__jank.raf = requestAnimationFrame(tick)
    }
    w.__jank.raf = requestAnimationFrame(tick)
  })

  // Start the CDP JS profiler over the scroll window.
  const client = await page.context().newCDPSession(page)
  await client.send('Profiler.enable')
  await client.send('Profiler.setSamplingInterval', { interval: 80 })
  await client.send('Profiler.start')

  // Drive the wheel: alternating down/up bursts to traverse the viz repeatedly.
  const start = Date.now()
  let dir = 1
  while (Date.now() - start < durationMs) {
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, dir * 60)
      await page.waitForTimeout(16) // ~one frame between wheel ticks
    }
    dir *= -1
  }

  const { profile } = await client.send('Profiler.stop')
  await client.send('Profiler.disable')

  // Aggregate self-time by function from the CPU profile.
  const selfByNode = new Map<number, number>()
  const interval = (profile as { timeDeltas?: number[] }).timeDeltas ?? []
  const samples = (profile as { samples?: number[] }).samples ?? []
  for (let i = 0; i < samples.length; i++) {
    const id = samples[i]
    const dt = (interval[i] ?? 0) / 1000 // µs → ms
    selfByNode.set(id, (selfByNode.get(id) ?? 0) + dt)
  }
  const nodes = (profile as { nodes?: Array<{ id: number; callFrame: { functionName: string; url: string } }> }).nodes ?? []
  const byFn = new Map<string, { selfMs: number; url: string }>()
  for (const node of nodes) {
    const self = selfByNode.get(node.id) ?? 0
    if (self <= 0) continue
    const fn = node.callFrame.functionName || '(anonymous)'
    const url = node.callFrame.url || ''
    const key = `${fn}`
    const prev = byFn.get(key)
    byFn.set(key, { selfMs: (prev?.selfMs ?? 0) + self, url: url || prev?.url || '' })
  }
  const topSelf = [...byFn.entries()]
    .map(([fn, v]) => ({ fn, url: v.url.split('/').slice(-1)[0], selfMs: Math.round(v.selfMs * 10) / 10 }))
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, 14)

  // Read the app profiler longtasks (during the window) + frame-delta meter.
  const data = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    cancelAnimationFrame(w.__jank.raf)
    const snap = w.__stavePerf?.snapshot?.()
    const deltas: number[] = (w.__jank.deltas as number[]).slice(2) // drop warm-up
    const sorted = [...deltas].sort((a, b) => a - b)
    const pct = (p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0
    const vizGauge = (snap?.gauges?.['viz.p5'] ?? 0) + (snap?.gauges?.['viz.hydra'] ?? 0) + (snap?.gauges?.['viz.worker'] ?? 0)
    return {
      vizGauge,
      longtasks: snap?.longtasks?.count ?? -1,
      longtaskMaxMs: snap?.longtasks?.maxMs ?? -1,
      frameCount: deltas.length,
      frameP50: Math.round(pct(0.5) * 10) / 10,
      frameP95: Math.round(pct(0.95) * 10) / 10,
      frameMax: Math.round(Math.max(0, ...deltas) * 10) / 10,
      jankFrames: deltas.filter((d) => d > 24).length,
    }
  })

  return { scenario, ...data, topSelf }
}

test.describe('viz-scroll-jank — diagnostic', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_PERF__ = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_E2E__ = true
      try { localStorage.setItem('stave.viz.worker', '1') } catch { /* ignore */ }
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(1000)
    await page.evaluate((code) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      w.__staveRegisterViz({
        id: 'perf-synthterrain', name: 'synthterrain', renderer: 'p5', code,
        requires: ['streaming', 'queryable'], nativeSize: { w: 600, h: 380 },
        createdAt: 1, updatedAt: 1,
      })
      // Override the bundled `spectrum` backdrop so `.spectrum()` pins the HEAVY
      // terrain full-screen (the production backdrop path).
      w.__staveOverrideVizFile?.('spectrum', code)
    }, SYNTH_CODE)
  })

  test('scroll jank: no-viz control vs heavy worker viz', async ({ page }) => {
    test.skip(!process.env.SCROLL_JANK, 'manual diagnostic — set SCROLL_JANK=1')
    const results: ScrollResult[] = []

    // CONTROL: long doc, NO viz.
    await stopCode(page)
    await setCode(page, longDoc(false))
    await runCode(page)
    results.push(await measureScroll(page, 'no-viz (control)', 4000))

    // HEAVY INLINE VIZ: same doc shape + heavy worker terrain (scrolls off → pauses).
    await stopCode(page)
    await setCode(page, longDoc(true))
    await runCode(page)
    await page.waitForTimeout(1500)
    results.push(await measureScroll(page, 'heavy inline viz', 4000))

    // HEAVY BACKDROP VIZ: full-screen, STAYS on-screen → GPU loaded during scroll.
    await stopCode(page)
    await setCode(page, longDocBackdrop())
    await runCode(page)
    await page.waitForTimeout(1500)
    results.push(await measureScroll(page, 'heavy backdrop viz (on-screen)', 4000))

    // ── Report ──
    // eslint-disable-next-line no-console
    console.log('\n=== SCROLL JANK MATRIX ===')
    for (const r of results) {
      // eslint-disable-next-line no-console
      console.log(
        `\n[${r.scenario}] vizGauge=${r.vizGauge}  longtasks=${r.longtasks} (max ${r.longtaskMaxMs}ms)  ` +
        `frames=${r.frameCount} p50=${r.frameP50}ms p95=${r.frameP95}ms max=${r.frameMax}ms  jankFrames(>24ms)=${r.jankFrames}`
      )
      // eslint-disable-next-line no-console
      console.log(`  top self-time (ms) during scroll:`)
      for (const t of r.topSelf) {
        // eslint-disable-next-line no-console
        console.log(`    ${String(t.selfMs).padStart(7)}  ${t.fn}  [${t.url}]`)
      }
    }
    // Data-produced guard only (no env-dependent threshold).
    for (const r of results) if (r.frameCount < 10) throw new Error(`${r.scenario}: too few frames (${r.frameCount})`)
  })
})
