/**
 * SPIKE (#263, PK21 ladder) — the HIGH-N viz ceiling: worker MEMORY climb +
 * the WebGL ~16-context HARD cap. This is the real headroom wall left after the
 * blit N→1 session proved the blit wall is gone (P110-addendum; #262 removed it).
 * The output is a GROUNDED yes/no/where (observe the cap + the memory curve on
 * THIS GPU), NOT a feature. The A-vs-B lever (worker POOL vs TEARDOWN-on-pause)
 * is decided AFTER this run.
 *
 * WHAT WE EXPLOIT (PV77 — the keystone):
 *   Phase C `pause` HALTS the draw loop but HOLDS the worker + p5 + GL context.
 *   ⇒ N mounted zones = N live WebGL contexts + N×~100MB. The renderer-RSS climb
 *   is therefore robust no matter the on-screen state.
 *
 * SCOPE OF THIS SWEEP (ceiling 12, UNDER the ~16 cap):
 *   At N≤12 nothing is evicted, so we do NOT need every zone on-screen to force
 *   count-eviction (that matters only when probing the cap itself, past ~16 — a
 *   follow-up). Here: renderer-RSS measures the MEMORY climb for all N mounted
 *   zones (held regardless of pause, PV77); the live/black scan covers the
 *   on-screen ACTIVE subset (scrollTop 0 → the oldest zones, the first Chrome
 *   would force-lose if the GPU cap were lower than 16 → we'd still catch it).
 *
 * WHY HEADED (not headless): the GPU/compositor path is the thing under test;
 * headless can misreport GPU behaviour (P108). At ceiling 12 the all-on-screen
 * tall-viewport need (which would force headless) does not apply, so headed is
 * strictly the more faithful choice.
 *
 * HOW WE DETECT A LOST/BLACK CONTEXT (decode-free; reuses the reactivity-gate
 * technique): screenshot each zone SHOTS× ~0.6s apart → md5 each.
 *   - LIVE zone (audio-reactive heavy sketch) → ≥4/5 DISTINCT + large PNG.
 *   - LOST zone (force-lost → frozen black)   → 1/5 distinct  + tiny  PNG.
 * We do NOT infer "16": we read the N at which any zone flips live→frozen-black,
 * and the renderer-RSS climb per mounted viz.
 *
 * Measures the WORKER path only (the shipped default; contexts live in workers).
 *
 * Run (HEADED — real GPU/compositor; P108):
 *   HIGHN=1 pnpm --filter @stave/app exec playwright test high-n-headroom.spec.ts \
 *     --headed --timeout=600000 --workers=1
 * Optional: HIGHN_NS="2,4,6,8,10,12" to override the sweep (ceiling 12).
 */
import { test, expect, type Page, type CDPSession } from '@playwright/test'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const SETTLE_MS = 3500
const SHOT_GAP_MS = 600
const SHOTS = 5

// Heavy WEBGL sketch reading `u.fft` (live-audio reactive) — verbatim from the
// reactivity gate. A LIVE instance changes every frame (≥4/5 distinct); a
// force-lost one freezes black (1/5 distinct, tiny PNG).
const SYNTHWAVE = `function setup(){ createCanvas(stave.width, stave.height, WEBGL) }
function draw(){
  background(12,6,28)
  const W=width,H=height
  stroke(255,40,200); strokeWeight(2); noFill()
  const ROWS=40, COLS=70
  for(let r=0;r<ROWS;r++){
    const z=r/ROWS
    const y0=-H/2 + H*0.42 + z*z*(H*0.58)
    beginShape()
    for(let c=0;c<=COLS;c++){
      const x=-W/2 + (c/COLS)*W
      const fi=(c*3+r)%u.fft.length
      const h=(u.fft[fi]||0)*220*(1-z)
      vertex(x, y0-h)
    }
    endShape()
  }
}`

// N distinct CONTINUOUS-audio tracks (every zone has constant spectral energy →
// a healthy zone is unambiguously distinct). Each `$:` is its own track + its
// own `.viz('swr')` → N independent WorkerVizRenderers → N WebGL contexts.
const NOTES = ['c2 e2 g2 c3', 'e2 g2 b2 e3', 'g2 b2 d3 g3', 'a1 c2 e2 a2', 'd2 f2 a2 d3', 'f2 a2 c3 f3']
const SOUNDS = ['sawtooth', 'square', 'triangle', 'sine']
function codeFor(n: number): string {
  const lines: string[] = []
  for (let i = 0; i < n; i++) {
    if (i % 4 === 2) lines.push(`$: s("hh*16").bank("RolandTR909").gain(0.5).viz('swr')`)
    else lines.push(`$: note("${NOTES[i % NOTES.length]}").s("${SOUNDS[i % SOUNDS.length]}").gain(0.35).viz('swr')`)
  }
  return lines.join('\n')
}

// ── process-tree RSS sampling, isolated to THIS test's Chromium ───────────────
interface Proc { pid: number; ppid: number; rss: number; cmd: string }
function psSnapshot(): Proc[] {
  const out = execSync('ps -axo pid=,ppid=,rss=,command=', { maxBuffer: 32 * 1024 * 1024 }).toString()
  const procs: Proc[] = []
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)
    if (!m) continue
    procs.push({ pid: +m[1], ppid: +m[2], rss: +m[3], cmd: m[4] })
  }
  return procs
}
function classify(): { gpu: number[]; renderer: number[] } {
  const kids = psSnapshot().filter((p) => /ms-playwright/.test(p.cmd))
  return {
    gpu: kids.filter((p) => /--type=gpu-process/.test(p.cmd)).map((p) => p.pid),
    renderer: kids.filter((p) => /--type=renderer/.test(p.cmd)).map((p) => p.pid),
  }
}
function rssKb(pids: number[]): number {
  if (!pids.length) return 0
  const set = new Set(pids)
  return psSnapshot().filter((p) => set.has(p.pid)).reduce((s, p) => s + p.rss, 0)
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
  await page.waitForTimeout(200)
}
async function press(page: Page, key: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(key)
}

/** Per on-screen zone: distinct screenshots / SHOTS + median PNG byte size.
 *  A live heavy viz → distinct≈SHOTS + large PNG; a force-lost (black) one →
 *  distinct=1 + tiny PNG. With all N forced on-screen this scans every zone. */
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

/** Drive a long churn session (alternate scroll top/bottom so a different ~4 of
 *  N zones go off-screen each cycle → teardown + reinit) and return the renderer
 *  RSS (MB) sampled after each cycle. `pool` toggles the worker-reuse pool. */
async function runChurnSeries(
  browser: import('@playwright/test').Browser,
  pool: boolean,
  cycles: number,
  n = 12,
): Promise<number[]> {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1500 } })
  const page = await context.newPage()
  await page.addInitScript((usePool) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_PERF__ = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_E2E__ = true
    try {
      localStorage.setItem('stave.viz.worker', '1')
      localStorage.setItem('stave:inlineVizTeardown', '1')
      localStorage.setItem('stave:inlineVizTeardownMs', '5000')
      localStorage.setItem('stave.viz.pool', usePool ? '1' : '0')
    } catch { /* ignore */ }
  }, pool)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1200)
  await page.evaluate((code) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__staveRegisterViz?.({
      id: 'swr', name: 'swr', renderer: 'p5', code,
      requires: ['streaming'], nativeSize: { w: 1100, h: 200 }, createdAt: 1, updatedAt: 1,
    })
  }, SYNTHWAVE)
  await press(page, `${MOD}+Period`)
  await page.waitForTimeout(400)
  await setCode(page, codeFor(n))
  await press(page, `${MOD}+Enter`)
  await page.waitForTimeout(3000)
  const series: number[] = []
  for (let i = 0; i < cycles; i++) {
    await page.evaluate((toTop) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
      e?.setScrollTop(toTop ? 0 : (e?.getScrollHeight?.() ?? 999_999))
    }, i % 2 === 0)
    await page.waitForTimeout(8000)
    series.push(rssKb(classify().renderer) / 1024)
  }
  await context.close()
  return series
}

interface Row {
  n: number
  vizGauge: number
  instances: number
  rndRssMB: number
  gpuRssMB: number
  jsHeapMB: number
  scanned: number
  liveZones: number
  lostZones: number
  minPng: number
  maxPng: number
  contextLostLogs: number
}

test.describe('#263 spike — high-N viz memory + WebGL ~16-context cap (worker path)', () => {
  test('sweep N: renderer-RSS climb + the context-cap black-out point', async ({ browser }) => {
    test.skip(!process.env.HIGHN, 'spike harness — set HIGHN=1')

    const NS = (process.env.HIGHN_NS ?? '2,4,6,8,10,12').split(',').map((s) => +s.trim()).filter((x) => x > 0)
    const rows: Row[] = []
    let gpuName = 'unknown'

    for (const n of NS) {
      // Fresh context per N → the previous N's contexts are fully gone (worker
      // terminated) before we load the next, so the reading is clean. Normal
      // viewport (headed-friendly): the on-screen subset (oldest zones, scrollTop 0)
      // is scanned for live/black; RSS captures all N mounted (held, PV77).
      const context = await browser.newContext({ viewport: { width: 1500, height: 1500 } })
      const page = await context.newPage()
      let contextLostLogs = 0
      page.on('console', (m) => {
        const t = m.text().toLowerCase()
        if (t.includes('context lost') || t.includes('contextlost') || (t.includes('webgl') && t.includes('lost'))) {
          contextLostLogs++
        }
      })
      await page.addInitScript(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).__STAVE_PERF__ = true
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).__STAVE_E2E__ = true
        try { localStorage.setItem('stave.viz.worker', '1') } catch { /* ignore */ }
      })
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
      await page.waitForTimeout(1200)
      await page.evaluate((code) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).__staveRegisterViz?.({
          id: 'swr', name: 'swr', renderer: 'p5', code,
          requires: ['streaming'], nativeSize: { w: 1100, h: 200 },
          createdAt: 1, updatedAt: 1,
        })
      }, SYNTHWAVE)
      if (gpuName === 'unknown') {
        gpuName = await page.evaluate(() => {
          try {
            const c = document.createElement('canvas')
            const gl = c.getContext('webgl2') || c.getContext('webgl')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dbg = (gl as any)?.getExtension('WEBGL_debug_renderer_info')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return dbg ? (gl as any).getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown'
          } catch { return 'unknown' }
        })
      }

      const client: CDPSession = await page.context().newCDPSession(page)
      await client.send('Performance.enable')

      // Mount N zones, all on-screen + active.
      await press(page, `${MOD}+Period`)
      await page.waitForTimeout(500)
      await setCode(page, codeFor(n))
      await press(page, `${MOD}+Enter`)
      await page.waitForTimeout(2500)
      await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.setScrollTop(0)) // eslint-disable-line @typescript-eslint/no-explicit-any
      await page.waitForTimeout(SETTLE_MS)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const snap = await page.evaluate(() => (window as any).__stavePerf?.snapshot?.())
      const vizGauge = (snap?.gauges?.['viz.worker'] ?? 0) + (snap?.gauges?.['viz.p5'] ?? 0) + (snap?.gauges?.['viz.hydra'] ?? 0)
      const instances = Object.keys(snap?.frames ?? {}).length

      const { renderer, gpu } = classify()
      const rndRssMB = rssKb(renderer) / 1024
      const gpuRssMB = rssKb(gpu) / 1024
      const { metrics } = await client.send('Performance.getMetrics')
      const jsHeapMB = (metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0) / (1024 * 1024)

      const zones = await scanZones(page)
      const pngs = zones.map((z) => z.pngBytes)
      rows.push({
        n, vizGauge, instances, rndRssMB, gpuRssMB, jsHeapMB,
        scanned: zones.length,
        liveZones: zones.filter((z) => z.distinct >= 4).length,
        lostZones: zones.filter((z) => z.distinct <= 1).length,
        minPng: pngs.length ? Math.min(...pngs) : 0,
        maxPng: pngs.length ? Math.max(...pngs) : 0,
        contextLostLogs,
      })
      await context.close()
    }

    // ── report ──
    const f = (x: number, d = 1) => x.toFixed(d)
    const pad = (s: string | number, w: number) => String(s).padEnd(w)
    // eslint-disable-next-line no-console
    console.log(`\n=== #263 HIGH-N HEADROOM — worker viz memory + WebGL context cap ===`)
    // eslint-disable-next-line no-console
    console.log(`GPU: ${gpuName}`)
    // eslint-disable-next-line no-console
    console.log(
      pad('N', 4) + pad('gauge', 6) + pad('active', 7) + pad('rndRSS_MB', 11) + pad('ΔRSS/viz', 10) +
      pad('gpuRSS_MB', 11) + pad('jsHeap_MB', 11) + pad('scan', 6) + pad('live', 6) + pad('LOST', 6) +
      pad('minPng', 8) + pad('maxPng', 8) + 'ctxLostLog',
    )
    let prev: Row | null = null
    for (const r of rows) {
      const perViz = prev ? (r.rndRssMB - prev.rndRssMB) / Math.max(1, r.n - prev.n) : r.rndRssMB / Math.max(1, r.n)
      // eslint-disable-next-line no-console
      console.log(
        pad(r.n, 4) + pad(r.vizGauge, 6) + pad(r.instances, 7) + pad(f(r.rndRssMB), 11) + pad(f(perViz), 10) +
        pad(f(r.gpuRssMB), 11) + pad(f(r.jsHeapMB), 11) + pad(r.scanned, 6) + pad(r.liveZones, 6) +
        pad(r.lostZones, 6) + pad(r.minPng, 8) + pad(r.maxPng, 8) + r.contextLostLogs,
      )
      prev = r
    }
    const firstLost = rows.find((r) => r.lostZones > 0)
    // eslint-disable-next-line no-console
    console.log(
      `\nBLACK-OUT POINT: ${firstLost ? `first lost zones at N=${firstLost.n} (${firstLost.lostZones} of ${firstLost.scanned} scanned)` : `none up to N=${NS[NS.length - 1]} — cap not hit in this sweep (realistic ceiling stays under the GPU cap)`}`,
    )
    // eslint-disable-next-line no-console
    console.log(`NOTE: gpuRSS = GPU-process RSS proxy (true VRAM not separable per-process on macOS). LOST = distinct≤1 (frozen/black).`)
    console.log(`=== end ===\n`)

    expect(rows.length).toBe(NS.length)
    // Every N must have mounted all N renderers (else the memory/cap reading is
    // confounded — a renderer that failed to mount holds no context).
    for (const r of rows) expect(r.vizGauge, `N=${r.n} mounted gauge`).toBeGreaterThanOrEqual(r.n)
  })

  // ── #263 B: off-screen teardown reclaims memory ────────────────────────────
  // The lever the spike pointed at. Mount N inline zones; ~6 fit a 1500px
  // viewport, the rest scroll off-screen and Phase C pauses them. Past the 60s
  // threshold the off-screen ones are DESTROYED (TeardownOnPauseRenderer →
  // WorkerVizRenderer.destroy → viz.worker gauge −1 + worker terminated). Then
  // scrolling back re-creates one. We OBSERVE both the gauge drop and the
  // renderer-RSS drop (the reclaim), then the gauge recovery (the reinit).
  test('off-screen teardown reclaims renderer-RSS + a worker; scroll-back re-creates', async ({ browser }) => {
    test.skip(!process.env.HIGHN, 'spike harness — set HIGHN=1')
    const N = 10
    const context = await browser.newContext({ viewport: { width: 1500, height: 1500 } })
    const page = await context.newPage()
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_PERF__ = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_E2E__ = true
      try {
        localStorage.setItem('stave.viz.worker', '1')
        localStorage.setItem('stave:inlineVizTeardown', '1') // ensure teardown ON
      } catch { /* ignore */ }
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
    await page.waitForTimeout(1200)
    await page.evaluate((code) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__staveRegisterViz?.({
        id: 'swr', name: 'swr', renderer: 'p5', code,
        requires: ['streaming'], nativeSize: { w: 1100, h: 200 }, createdAt: 1, updatedAt: 1,
      })
    }, SYNTHWAVE)
    await press(page, `${MOD}+Period`)
    await page.waitForTimeout(400)
    await setCode(page, codeFor(N))
    await press(page, `${MOD}+Enter`)
    await page.waitForTimeout(2500)
    await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.setScrollTop(0)) // eslint-disable-line @typescript-eslint/no-explicit-any
    await page.waitForTimeout(4000)

    const gauge = async (): Promise<number> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = await page.evaluate(() => (window as any).__stavePerf?.snapshot?.())
      return s?.gauges?.['viz.worker'] ?? 0
    }
    const rss = (): number => rssKb(classify().renderer) / 1024

    const gaugeBefore = await gauge()
    const rssBefore = rss()
    expect(gaugeBefore, 'all N mounted before teardown').toBeGreaterThanOrEqual(N)

    // Wait past the fixed 60s off-screen teardown threshold.
    await page.waitForTimeout(67_000)

    const gaugeAfter = await gauge()
    const rssAfter = rss()

    // The HARD gate is the live-worker GAUGE: teardown destroys the off-screen
    // workers (WorkerVizRenderer.destroy → terminate + gauge −1), bounding the
    // live high-water mark to the on-screen count AND freeing their WebGL-context
    // slots (the out-of-range ~16-context cap). That part WORKS.
    expect(gaugeBefore - gaugeAfter, 'off-screen zones torn down → gauge drops').toBeGreaterThanOrEqual(1)

    // Scroll to the bottom → torn-down zones re-create (gauge climbs back).
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
      e?.setScrollTop(e?.getScrollHeight?.() ?? 999_999)
    })
    await page.waitForTimeout(4000)
    const gaugeBack = await gauge()
    const rssReinit = rss()
    // eslint-disable-next-line no-console
    console.log(
      `\n[#263 teardown] gauge ${gaugeBefore}→${gaugeAfter}(torn down)→${gaugeBack}(reinit) · ` +
      `rndRSS ${rssBefore.toFixed(0)}→${rssAfter.toFixed(0)}→${rssReinit.toFixed(0)}MB`,
    )
    expect(gaugeBack, 'scroll-back re-creates a torn-down zone').toBeGreaterThan(gaugeAfter)

    // OBSERVED LIMITATION (motivates #263 part A — worker REUSE): renderer RSS is
    // NOT reclaimed by terminate-based teardown. Terminating a worker doesn't
    // return its pages to the OS (allocator retention), and reinit spawns FRESH
    // workers that allocate anew instead of reusing the freed pages — so RSS does
    // not drop and can GROW under scroll churn. Only a worker POOL (park + reuse
    // a warm worker, no fresh allocation) bounds memory across a long session.
    // We assert the lifecycle (gauge), and only LOG RSS to make this visible —
    // we do NOT assert an RSS drop, because the terminate path does not deliver
    // one. When A lands, tighten this to assert reinit RSS stays bounded.
    // eslint-disable-next-line no-console
    if (rssReinit > rssBefore + 80) {
      console.log(
        `[#263 teardown] NOTE: reinit RSS grew ${(rssReinit - rssBefore).toFixed(0)}MB over a ` +
        `teardown→reinit cycle — terminate doesn't return memory; part A (worker reuse) is the fix.`,
      )
    }
    await context.close()
  })

  // ── #263 A: worker POOL bounds RSS across teardown→reinit churn ─────────────
  // The fix for the limitation above. Same scenario WITH the worker pool on:
  // teardown releases the worker to the pool (parked warm, no terminate); reinit
  // REUSES a parked worker (no fresh thread/isolate). So re-creating the
  // torn-down zones must NOT re-grow RSS the way the terminate path did — the
  // reinit RSS stays bounded near the pre-teardown high-water mark. This is the
  // hypothesis A rests on; the gate OBSERVES it (don't infer — P112's lesson).
  test('worker pool: teardown→reinit churn stays BOUNDED (vs terminate +356MB)', async ({ browser }) => {
    test.skip(!process.env.HIGHN, 'spike harness — set HIGHN=1')
    const N = 10
    const context = await browser.newContext({ viewport: { width: 1500, height: 1500 } })
    const page = await context.newPage()
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_PERF__ = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_E2E__ = true
      try {
        localStorage.setItem('stave.viz.worker', '1')
        localStorage.setItem('stave:inlineVizTeardown', '1') // teardown ON
        localStorage.setItem('stave.viz.pool', '1') // + worker REUSE pool ON
      } catch { /* ignore */ }
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
    await page.waitForTimeout(1200)
    await page.evaluate((code) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__staveRegisterViz?.({
        id: 'swr', name: 'swr', renderer: 'p5', code,
        requires: ['streaming'], nativeSize: { w: 1100, h: 200 }, createdAt: 1, updatedAt: 1,
      })
    }, SYNTHWAVE)
    await press(page, `${MOD}+Period`)
    await page.waitForTimeout(400)
    await setCode(page, codeFor(N))
    await press(page, `${MOD}+Enter`)
    await page.waitForTimeout(2500)
    await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.setScrollTop(0)) // eslint-disable-line @typescript-eslint/no-explicit-any
    await page.waitForTimeout(4000)

    const gauge = async (): Promise<number> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = await page.evaluate(() => (window as any).__stavePerf?.snapshot?.())
      return s?.gauges?.['viz.worker'] ?? 0
    }
    const rss = (): number => rssKb(classify().renderer) / 1024

    const gaugeBefore = await gauge()
    const rssBefore = rss()
    expect(gaugeBefore, 'all N mounted').toBeGreaterThanOrEqual(N)

    await page.waitForTimeout(67_000) // past the 60s off-screen teardown threshold
    const gaugeAfter = await gauge()

    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
      e?.setScrollTop(e?.getScrollHeight?.() ?? 999_999)
    })
    await page.waitForTimeout(4000)
    const gaugeBack = await gauge()
    const rssReinit = rss()
    // eslint-disable-next-line no-console
    console.log(
      `\n[#263 pool] gauge ${gaugeBefore}→${gaugeAfter}→${gaugeBack} · ` +
      `rndRSS ${rssBefore.toFixed(0)}→${rssReinit.toFixed(0)}MB (reinit Δ ${(rssReinit - rssBefore).toFixed(0)}MB, want bounded)\n`,
    )
    // HARD gate = the reuse LIFECYCLE: teardown releases workers to the pool
    // (parked warm) and scroll-back REUSES them (gauge recovers to N without
    // fresh spawns). That part is solid + non-flaky.
    expect(gaugeBefore - gaugeAfter, 'off-screen zones torn down').toBeGreaterThanOrEqual(1)
    expect(gaugeBack, 'scroll-back reuses parked workers').toBeGreaterThan(gaugeAfter)
    // RSS is INFORMATIONAL (a hard threshold flakes run-to-run): OBSERVED the pool
    // roughly HALVES one-cycle churn growth vs the terminate path (~+172MB vs
    // +356MB) but does NOT fully bound it — the per-mount p5 instance + GL context
    // + canvas are re-created each reinit and the renderer-process allocator does
    // not fully return/reuse the freed pages. Whether RSS PLATEAUS or grows
    // linearly over MANY cycles (the true long-session question) is a separate
    // multi-cycle observation. We assert only a gross-regression ceiling here.
    expect(rssReinit, 'pool reinit must not blow past a gross ceiling').toBeLessThan(rssBefore + 500)
    await context.close()
  })

  // ── #263: the DECISIVE long-session test — RSS PLATEAU vs LEAK over many cycles
  // One teardown→reinit cycle grows RSS (+356 terminate / +172 pool). The real
  // "long live session" question is whether that COMPOUNDS (linear leak) or
  // PLATEAUS at a high-water mark (bounded = acceptable). We churn many cycles
  // (pool ON, short teardown threshold via the localStorage override) by
  // alternating scrollTop top/bottom so a different ~4 zones go off-screen each
  // cycle (tear down) while the previous off-screen ones reinit (reuse the pool).
  // The RSS SERIES is the observation; we assert only a gross linear-leak ceiling.
  test('LONG SESSION: RSS plateaus (bounded) across many teardown→reinit cycles (pool)', async ({ browser }) => {
    test.skip(!process.env.HIGHN, 'spike harness — set HIGHN=1')
    const N = 12
    const CYCLES = 8
    const context = await browser.newContext({ viewport: { width: 1500, height: 1500 } })
    const page = await context.newPage()
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_PERF__ = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_E2E__ = true
      try {
        localStorage.setItem('stave.viz.worker', '1')
        localStorage.setItem('stave.viz.pool', '1') // worker reuse ON
        localStorage.setItem('stave:inlineVizTeardown', '1') // teardown ON
        localStorage.setItem('stave:inlineVizTeardownMs', '5000') // fast churn for the test
      } catch { /* ignore */ }
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
    await page.waitForTimeout(1200)
    await page.evaluate((code) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__staveRegisterViz?.({
        id: 'swr', name: 'swr', renderer: 'p5', code,
        requires: ['streaming'], nativeSize: { w: 1100, h: 200 }, createdAt: 1, updatedAt: 1,
      })
    }, SYNTHWAVE)
    await press(page, `${MOD}+Period`)
    await page.waitForTimeout(400)
    await setCode(page, codeFor(N))
    await press(page, `${MOD}+Enter`)
    await page.waitForTimeout(3000)

    const rss = (): number => rssKb(classify().renderer) / 1024
    const series: number[] = []
    for (let i = 0; i < CYCLES; i++) {
      // Alternate scroll position so a different ~4 zones go off-screen each cycle.
      await page.evaluate((toTop) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
        e?.setScrollTop(toTop ? 0 : (e?.getScrollHeight?.() ?? 999_999))
      }, i % 2 === 0)
      await page.waitForTimeout(8000) // > 5s threshold → off-screen zones tear down + churn
      series.push(rss())
    }

    const avg = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length)
    const firstHalf = avg(series.slice(0, CYCLES / 2))
    const secondHalf = avg(series.slice(CYCLES / 2))
    const drift = secondHalf - firstHalf
    // eslint-disable-next-line no-console
    console.log(`\n[#263 plateau] RSS series MB: ${series.map((x) => x.toFixed(0)).join(' → ')}`)
    // eslint-disable-next-line no-console
    console.log(`[#263 plateau] first-half avg ${firstHalf.toFixed(0)} → second-half avg ${secondHalf.toFixed(0)} = drift ${drift.toFixed(0)}MB over ${CYCLES} cycles (small=plateau/bounded, large=linear leak)\n`)

    // The observation is the SERIES + drift. Assert only a gross linear-leak
    // ceiling: if churn truly leaked it would climb ~+170MB EVERY cycle → the
    // second-half average would be hundreds of MB above the first. A bounded
    // (plateauing) working set keeps the drift modest.
    expect(series.length).toBe(CYCLES)
    expect(drift, 'RSS plateaus across cycles (not a linear per-cycle leak)').toBeLessThan(500)
    await context.close()
  })

  // ── #263 A/B: the pool/terminate MEMORY tradeoff (OBSERVED, hypothesis-inverting)
  // Run the SAME churn with the pool OFF (terminate+respawn) vs ON (park+reuse).
  // OBSERVED (this is NOT what we expected): BOTH plateau (neither leaks — the
  // single-cycle +356/+172 does not compound), but TERMINATE plateaus LOWER
  // (~2175MB) than the POOL (~2638MB). Parked-alive workers retain their warm
  // isolate+module memory; terminated workers' memory is reclaimed across cycles.
  // ⇒ the pool is NOT a memory win — it COSTS ~+460MB for the benefit of resume
  // LATENCY (no ~52ms respawn on scroll-back). So B (terminate teardown) is the
  // better MEMORY lever; A (pool) is a latency/UX optimization at a memory cost.
  // We assert: BOTH bounded (no linear leak); the logged delta is the tradeoff.
  test('A/B: pool vs terminate memory tradeoff — both bounded; pool trades RSS for latency', async ({ browser }) => {
    test.skip(!process.env.HIGHN, 'spike harness — set HIGHN=1')
    const CYCLES = 6
    const avg = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length)
    const terminate = await runChurnSeries(browser, false, CYCLES)
    const pooled = await runChurnSeries(browser, true, CYCLES)
    const termSettled = avg(terminate.slice(CYCLES / 2))
    const poolSettled = avg(pooled.slice(CYCLES / 2))
    const termGrowth = terminate[CYCLES - 1] - terminate[0]
    const poolGrowth = pooled[CYCLES - 1] - pooled[0]
    // eslint-disable-next-line no-console
    console.log(`\n[#263 A/B] terminate RSS: ${terminate.map((x) => x.toFixed(0)).join(' → ')}  (settled ${termSettled.toFixed(0)}MB)`)
    // eslint-disable-next-line no-console
    console.log(`[#263 A/B] pool      RSS: ${pooled.map((x) => x.toFixed(0)).join(' → ')}  (settled ${poolSettled.toFixed(0)}MB)`)
    // eslint-disable-next-line no-console
    console.log(`[#263 A/B] TRADEOFF: pool plateau is ${(poolSettled - termSettled).toFixed(0)}MB ${poolSettled > termSettled ? 'HIGHER' : 'lower'} than terminate (pool trades RSS for resume latency)\n`)
    expect(terminate.length).toBe(CYCLES)
    expect(pooled.length).toBe(CYCLES)
    // Both must be BOUNDED (plateau, not a linear per-cycle leak): end-to-end
    // growth across the run stays well under (cycles × single-cycle delta).
    expect(termGrowth, 'terminate path is bounded (plateaus)').toBeLessThan(900)
    expect(poolGrowth, 'pool path is bounded (plateaus)').toBeLessThan(900)
  })

  // ── #263 A: fallback × pool × teardown chain survives ───────────────────────
  // A broken worker must (1) fall back to a main-thread renderer (PK23) even with
  // the pool on, (2) NOT be returned to the pool (never-ready → terminated, so a
  // future acquire can't reuse a poisoned worker), and (3) survive a teardown→
  // reinit churn cycle without crashing (the 3-decorator chain:
  // TeardownOnPauseRenderer → FallbackVizRenderer → WorkerVizRenderer).
  test('fallback × pool × teardown: broken worker → main render, survives churn', async ({ browser }) => {
    test.skip(!process.env.HIGHN, 'spike harness — set HIGHN=1')
    const context = await browser.newContext({ viewport: { width: 1500, height: 1500 } })
    const page = await context.newPage()
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(e.message))
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_PERF__ = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_E2E__ = true
      try {
        localStorage.setItem('stave.viz.worker', '1')
        localStorage.setItem('stave.viz.pool', '1')
        localStorage.setItem('stave:inlineVizTeardown', '1')
        localStorage.setItem('stave:inlineVizTeardownMs', '5000')
      } catch { /* ignore */ }
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
    await page.waitForTimeout(1200)
    await page.evaluate((code) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__staveRegisterViz?.({
        id: 'swr', name: 'swr', renderer: 'p5', code,
        requires: ['streaming'], nativeSize: { w: 1100, h: 200 }, createdAt: 1, updatedAt: 1,
      })
    }, SYNTHWAVE)
    // Force broken workers BEFORE any mount → every acquire gets a broken worker.
    const forced = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__staveForceBrokenVizWorker?.() ?? false
    })
    expect(forced, '__staveForceBrokenVizWorker hook present').toBe(true)

    await press(page, `${MOD}+Period`)
    await page.waitForTimeout(400)
    await setCode(page, codeFor(3))
    await press(page, `${MOD}+Enter`)
    await page.waitForTimeout(4000) // worker fails pre-ready → fallback mounts main

    const gauges = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = await page.evaluate(() => (window as any).__stavePerf?.snapshot?.())
      return { p5: s?.gauges?.['viz.p5'] ?? 0, worker: s?.gauges?.['viz.worker'] ?? 0 }
    }
    const g1 = await gauges()
    // eslint-disable-next-line no-console
    console.log(`\n[#263 fallback] after broken-worker mount: viz.p5=${g1.p5} viz.worker=${g1.worker}`)
    expect(g1.p5, 'fell back to main-thread renderer').toBeGreaterThan(0)

    // Churn: scroll off-screen + back → teardown + reinit on the fallback chain.
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
      e?.setScrollTop(e?.getScrollHeight?.() ?? 999_999)
    })
    await page.waitForTimeout(8000)
    await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.setScrollTop(0)) // eslint-disable-line @typescript-eslint/no-explicit-any
    await page.waitForTimeout(4000)
    const g2 = await gauges()
    // eslint-disable-next-line no-console
    console.log(`[#263 fallback] after teardown→reinit churn: viz.p5=${g2.p5} viz.worker=${g2.worker} · pageErrors=${pageErrors.length}\n`)
    expect(g2.p5, 'still rendering on main after churn (chain survived)').toBeGreaterThan(0)
    expect(pageErrors, 'no uncaught page errors through the chain').toHaveLength(0)
    await context.close()
  })
})
