/**
 * THROWAWAY OBSERVATION (user-requested, blit-N1 session) — the REAL cost of
 * 1 vs 4 INDEPENDENT synthterrain inline viz, in CPU + GPU + memory terms.
 *
 * Reuses perf-matrix's exact setup: each `$: silence.viz("synthterrain")` is a
 * SEPARATE track/codeblock with its own viz (so inline-4 = 4 independent viz on
 * 4 separate tracks, as asked). Worker path (the shipped default).
 *
 * Three instruments, headed/real-GPU:
 *   1. __stavePerf  — per-instance worker draw fps + frameP95 (the same source
 *      perf-matrix trusts).
 *   2. CDP Performance.getMetrics — renderer MAIN-thread CPU (TaskDuration Δ) +
 *      JS heap (JSHeapUsedSize). GPU name via WEBGL_debug_renderer_info.
 *   3. ps over the Playwright Chromium PROCESS TREE (isolated by the browser's
 *      root pid so it can't catch your normal Chrome): GPU-helper + renderer
 *      %cpu (cputime Δ / wall) + rss. Viz WORKERS are threads in the renderer
 *      process, so renderer cputime captures the P101 tessellation cost.
 *
 * HONEST GAP: true per-process VRAM isn't cleanly scriptable on macOS — GPU
 * memory is reported as the GPU-process RSS proxy + GPU %cpu, labelled as such.
 *
 * Run: CPUGPU=1 pnpm --filter @stave/app exec playwright test cpu-gpu-observe.spec.ts --headed --timeout=240000 --workers=1
 */
import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const SETTLE_MS = 3000
const MEASURE_MS = 8000

// The user's heavy WEBGL synthwave-terrain sketch — verbatim from perf-matrix.
const SYNTH_CODE = String.raw`// Stave p5 viz — Synthwave waveform terrain
const envelopes = new Map();
const HISTORY_LEN = 100;
const COLS = 50;
const waveHistory = [];

function setup() {
  createCanvas(stave.width, stave.height, WEBGL);
  angleMode(DEGREES);
  colorMode(HSB,360,100,100,1);
}

function captureWaveform() {
  if (!stave.analyser) return;
  const buf = new Float32Array(stave.analyser.fftSize);
  stave.analyser.getFloatTimeDomainData(buf);
  const row = new Float32Array(COLS);
  const segLen = buf.length / COLS;
  for (let i = 0; i < COLS; i++) {
    let s = 0;
    const start = Math.floor(i * segLen);
    const end = Math.floor((i + 1) * segLen);
    for (let j = start; j < end; j++) s += buf[j];
    row[i] = s / Math.max(1, end - start);
  }
  waveHistory.unshift(row);
  if (waveHistory.length > HISTORY_LEN) waveHistory.pop();
}

function draw() {
  const dt = deltaTime / 1000;
  let rms = 0;
  if (stave.analyser) {
    const buf = new Float32Array(stave.analyser.fftSize);
    stave.analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    rms = Math.sqrt(sum / buf.length);
  }
  const amp = Math.min(rms * 6, 1);
  captureWaveform();

  const activeNotes = new Map();
  if (stave.scheduler) {
    const now = stave.scheduler.now();
    const haps = stave.scheduler.query(now - 0.05, now + 0.05);
    for (const h of haps) {
      if (h.begin <= now && h.end > now) activeNotes.set(h.note ?? 60, h);
    }
  }
  const ATTACK = 0.03, DECAY = 0.5;
  for (const [note] of activeNotes) {
    if (!envelopes.has(note)) envelopes.set(note, { value: 0 });
    envelopes.get(note).value = Math.min(1, envelopes.get(note).value + dt / ATTACK);
  }
  for (const [note, env] of envelopes) {
    if (!activeNotes.has(note)) {
      env.value = Math.max(0, env.value - dt / DECAY);
      if (env.value === 0) envelopes.delete(note);
    }
  }

  background(265, 85, 4);

  push();
  translate(0, 0, -2500);
  noStroke();
  const skyTop = -1400, skyBot = 240, bands = 40;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    const y = lerp(skyTop, skyBot, t);
    const hgt = (skyBot - skyTop) / bands + 4;
    fill(lerp(258, 22, Math.pow(t, 1.4)), lerp(80, 100, t), lerp(18, 92, Math.pow(t, 1.3)));
    rect(-3200, y, 6400, hgt);
  }
  pop();

  push();
  translate(0, 60 - amp * 8, -2400);
  noStroke();
  const sunR = 380 + amp * 25;
  for (let yy = -sunR; yy <= 4; yy += 2) {
    const w = Math.sqrt(sunR * sunR - yy * yy) * 2;
    const t = (yy + sunR) / sunR;
    fill(lerp(46, 332, t), 100, 100);
    rect(-w / 2, yy, w, 3);
  }
  let sy = 6, si = 0;
  while (sy < sunR) {
    const w = Math.sqrt(Math.max(0, sunR * sunR - sy * sy)) * 2;
    const stripeH = Math.max(2, 26 - si * 3);
    fill(lerp(332, 295, sy / sunR), 100, 100);
    rect(-w / 2, sy, w, stripeH);
    sy += stripeH + 4 + si;
    si++;
  }
  pop();

  push();
  translate(0, 240, -1900);
  noStroke();
  fill(278, 95, 7);
  const peaks = 60;
  const mtnPoints = [];
  for (let i = 0; i <= peaks; i++) {
    const x = -3500 + (i / peaks) * 7000;
    const y = -130 + Math.sin(i * 0.7 + 1.1) * 70 + Math.sin(i * 2.3 + 0.4) * 35 + Math.sin(i * 5.1 + 2.7) * 18;
    mtnPoints.push([x, y]);
  }
  beginShape();
  vertex(-3500, 200);
  for (const [x, y] of mtnPoints) vertex(x, y);
  vertex(3500, 200);
  endShape(CLOSE);
  stroke(320, 100, 100, 0.9);
  strokeWeight(1.5);
  noFill();
  beginShape();
  for (const [x, y] of mtnPoints) vertex(x, y);
  endShape();
  pop();

  push();
  translate(0, 240, 0);
  noFill();
  strokeWeight(1.2);
  const halfW = 500;
  const cellW = (halfW * 2) / (COLS - 1);
  const totalDepth = 2000;
  const cellD = totalDepth / Math.max(1, HISTORY_LEN - 1);
  const yScale = 10 + amp * 50;
  for (let r = 0; r < waveHistory.length; r++) {
    const row = waveHistory[r];
    const z = -r * cellD;
    const ageT = waveHistory.length > 1 ? r / (waveHistory.length - 1) : 0;
    stroke(lerp(188, 322, ageT), 100, 100, lerp(0.95, 0.2, ageT));
    beginShape();
    for (let c = 0; c < COLS; c++) vertex(-halfW + c * cellW, -row[c] * yScale, z);
    endShape();
  }
  stroke(310, 100, 100, 0.35);
  strokeWeight(1);
  for (let c = 0; c < COLS; c++) {
    const x = -halfW + c * cellW;
    beginShape();
    for (let r = 0; r < waveHistory.length; r++) vertex(x, -waveHistory[r][c] * yScale, -r * cellD);
    endShape();
  }
  pop();
}`

// FOUR DISTINCT track patterns, each its own codeblock + its own .viz(). 1-viz
// uses the first; 4-viz uses all four (audio also scales 1→4 tracks, but audio
// is off-thread + minor — viz count is the dominant variable).
const PATTERNS = [
  `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909").viz("synthterrain")`,
  `$: note("c2 eb2 g2 c3").s("sawtooth").lpf(700).viz("synthterrain")`,
  `$: note("g4 bb4 d5 f5").s("square").lpf(1400).gain(0.4).viz("synthterrain")`,
  `$: s("cp*2, ~ rim*3").bank("RolandTR808").gain(0.7).viz("synthterrain")`,
]
function codeFor(n: number): string {
  return PATTERNS.slice(0, n).join('\n')
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
async function play(page: Page, code: string): Promise<void> {
  await stopCode(page)
  await setCode(page, code)
  await runCode(page)
}

// ── process-tree CPU/mem sampling (isolated to the Playwright browser) ────────
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
// Isolate THIS test's Chromium by the ms-playwright binary path (your normal
// Chrome is Google Chrome.app — a different path — so it won't be caught).
function classify(): { gpu: number[]; renderer: number[] } {
  const kids = psSnapshot().filter((p) => /ms-playwright/.test(p.cmd))
  const gpu = kids.filter((p) => /--type=gpu-process/.test(p.cmd)).map((p) => p.pid)
  const renderer = kids.filter((p) => /--type=renderer/.test(p.cmd)).map((p) => p.pid)
  return { gpu, renderer }
}
// cumulative CPU seconds per pid (parse ps cputime HH:MM:SS.ss / MM:SS.ss)
function cpuSeconds(pids: number[]): Map<number, number> {
  const m = new Map<number, number>()
  if (!pids.length) return m
  const out = execSync(`ps -o pid=,cputime= -p ${pids.join(',')}`, { maxBuffer: 8 * 1024 * 1024 }).toString()
  for (const line of out.split('\n')) {
    const mm = line.trim().match(/^(\d+)\s+(.+)$/)
    if (!mm) continue
    const parts = mm[2].split(':').map(Number)
    let sec = 0
    for (const p of parts) sec = sec * 60 + p
    m.set(+mm[1], sec)
  }
  return m
}
function rssKb(pids: number[]): number {
  if (!pids.length) return 0
  const all = psSnapshot()
  const set = new Set(pids)
  return all.filter((p) => set.has(p.pid)).reduce((s, p) => s + p.rss, 0)
}

interface Sample {
  path: string
  scenario: string
  vizGauge: number
  instances: number
  minFps: number
  frameP95: number
  drops: number
  longtasks: number
  longtaskMaxMs: number
  triggersPerSec: number
  rendererCpuPct: number // process-tree: all playwright renderers (workers live here)
  rendererRssMB: number
  gpuCpuPct: number
  gpuRssMB: number
  mainThreadCpuPct: number // CDP TaskDuration Δ (renderer MAIN thread only)
  jsHeapMB: number
}

async function gpuName(page: Page): Promise<string> {
  return page.evaluate(() => {
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

test.describe('cpu/gpu cost — 1 vs 4 distinct-track synthterrain viz (worker vs main)', () => {
  test('end-to-end: worker & main, 1 vs 4 — fps + CPU + GPU + memory', async ({ browser }) => {
    test.skip(!process.env.CPUGPU, 'manual observation harness — set CPUGPU=1')

    const f = (n: number, d = 1) => n.toFixed(d)
    const pad = (s: string | number, n: number) => String(s).padEnd(n)
    const samples: Sample[] = []
    let gpu = 'unknown'

    // Fresh context per path so the worker on/off localStorage is clean and the
    // previous path's renderer is gone before we ps-sample the next (one active
    // playwright renderer at a time → clean process isolation).
    for (const useWorker of [true, false]) {
      const path = useWorker ? 'worker' : 'main'
      const context = await browser.newContext({ viewport: { width: 1500, height: 1500 } })
      const page = await context.newPage()
      await page.addInitScript((w) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).__STAVE_PERF__ = true
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).__STAVE_E2E__ = true
        try { localStorage.setItem('stave.viz.worker', w ? '1' : '0') } catch { /* ignore */ }
      }, useWorker)
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
      await page.waitForTimeout(1000)
      await page.evaluate((code) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).__staveRegisterViz({
          id: 'perf-synthterrain', name: 'synthterrain', renderer: 'p5', code,
          requires: ['streaming', 'queryable'], nativeSize: { w: 1100, h: 200 },
          createdAt: 1, updatedAt: 1,
        })
      }, SYNTH_CODE)
      if (gpu === 'unknown') gpu = await gpuName(page)

      const client = await page.context().newCDPSession(page)
      await client.send('Performance.enable')
      const metric = async (name: string): Promise<number> => {
        const { metrics } = await client.send('Performance.getMetrics')
        return metrics.find((m) => m.name === name)?.value ?? 0
      }

      const measure = async (n: number): Promise<Sample> => {
        // Force all zones on-screen (defeat Phase C off-screen pause) before measuring.
        await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.setScrollTop(0)) // eslint-disable-line @typescript-eslint/no-explicit-any
        await page.waitForTimeout(SETTLE_MS)
        await page.evaluate(() => (window as any).__stavePerf?.reset?.()) // eslint-disable-line @typescript-eslint/no-explicit-any

        const { gpu: gpuPids, renderer } = classify()
        const taskDur0 = await metric('TaskDuration')
        const ts0 = await metric('Timestamp')
        const cpu0 = cpuSeconds([...gpuPids, ...renderer])
        const wall0 = Date.now()

        await page.waitForTimeout(MEASURE_MS)

        const wall1 = Date.now()
        const cpu1 = cpuSeconds([...gpuPids, ...renderer])
        const taskDur1 = await metric('TaskDuration')
        const ts1 = await metric('Timestamp')
        const jsHeap = await metric('JSHeapUsedSize')
        const wallSec = (wall1 - wall0) / 1000
        const sumDelta = (pids: number[]) =>
          pids.reduce((s, pid) => s + Math.max(0, (cpu1.get(pid) ?? 0) - (cpu0.get(pid) ?? 0)), 0)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const snap = await page.evaluate(() => (window as any).__stavePerf?.snapshot?.())
        const frameIds = Object.keys(snap.frames)
        const fpsList = frameIds.map((id: string) => snap.frames[id].fps).filter((x: number) => x > 0)
        const p95List = frameIds.map((id: string) => snap.frames[id].p95)
        const drops = frameIds.reduce((acc: number, id: string) => acc + snap.frames[id].drops, 0)
        const triggers = snap.counters['audio.triggers'] ?? 0
        return {
          path,
          scenario: `${n}-viz`,
          vizGauge: (snap.gauges['viz.worker'] ?? 0) + (snap.gauges['viz.p5'] ?? 0) + (snap.gauges['viz.hydra'] ?? 0),
          instances: frameIds.length,
          minFps: fpsList.length ? Math.min(...fpsList) : 0,
          frameP95: p95List.length ? Math.max(...p95List) : 0,
          drops,
          longtasks: snap.longtasks?.count ?? 0,
          longtaskMaxMs: snap.longtasks?.maxMs ?? 0,
          triggersPerSec: snap.uptimeMs > 0 ? (triggers / snap.uptimeMs) * 1000 : 0,
          rendererCpuPct: (sumDelta(renderer) / wallSec) * 100,
          rendererRssMB: rssKb(renderer) / 1024,
          gpuCpuPct: (sumDelta(gpuPids) / wallSec) * 100,
          gpuRssMB: rssKb(gpuPids) / 1024,
          mainThreadCpuPct: ts1 > ts0 ? ((taskDur1 - taskDur0) / (ts1 - ts0)) * 100 : 0,
          jsHeapMB: jsHeap / (1024 * 1024),
        }
      }

      await play(page, codeFor(1))
      samples.push(await measure(1))
      await play(page, codeFor(4))
      samples.push(await measure(4))
      await context.close()
    }

    // ── report ──
    // eslint-disable-next-line no-console
    console.log(`\n=== CPU/GPU/MEM — 1 vs 4 DISTINCT-track synthterrain viz · WORKER vs MAIN (HEADED) ===`)
    // eslint-disable-next-line no-console
    console.log(`GPU: ${gpu}`)
    // eslint-disable-next-line no-console
    console.log(
      pad('path', 7) + pad('scen', 7) + pad('viz', 5) + pad('minFps', 8) + pad('p95ms', 8) + pad('drops', 7) +
      pad('longtask', 14) + pad('trig/s', 8) + pad('rndCPU%', 9) + pad('rndRSS_MB', 11) +
      pad('gpuCPU%', 9) + pad('gpuRSS_MB', 11) + pad('mainCPU%', 10) + 'jsHeap_MB',
    )
    for (const s of samples) {
      // eslint-disable-next-line no-console
      console.log(
        pad(s.path, 7) + pad(s.scenario, 7) + pad(s.vizGauge, 5) + pad(f(s.minFps), 8) + pad(f(s.frameP95), 8) +
        pad(s.drops, 7) + pad(`${s.longtasks}/${f(s.longtaskMaxMs)}ms`, 14) + pad(f(s.triggersPerSec), 8) +
        pad(f(s.rendererCpuPct), 9) + pad(f(s.rendererRssMB), 11) + pad(f(s.gpuCpuPct), 9) +
        pad(f(s.gpuRssMB), 11) + pad(f(s.mainThreadCpuPct), 10) + f(s.jsHeapMB),
      )
    }
    const cell = (p: string, sc: string) => samples.find((s) => s.path === p && s.scenario === sc)!
    for (const p of ['worker', 'main']) {
      const a = cell(p, '1-viz'), b = cell(p, '4-viz')
      // eslint-disable-next-line no-console
      console.log(
        `\n[${p}] 1→4: rndCPU ${f(a.rendererCpuPct)}→${f(b.rendererCpuPct)}% (${f(b.rendererCpuPct / Math.max(1, a.rendererCpuPct), 2)}×) · ` +
        `gpuCPU ${f(a.gpuCpuPct)}→${f(b.gpuCpuPct)}% · rndRSS ${f(a.rendererRssMB)}→${f(b.rendererRssMB)}MB · ` +
        `minFps ${f(a.minFps)}→${f(b.minFps)} · longtask ${a.longtasks}→${b.longtasks} · trig/s ${f(a.triggersPerSec)}→${f(b.triggersPerSec)}`,
      )
    }
    // eslint-disable-next-line no-console
    console.log(`\nNOTE: gpuRSS = GPU-process resident memory (CPU-side); true VRAM not separable per-process on macOS.`)
    console.log(`=== end ===\n`)

    expect(samples.length).toBe(4)
    // both 4-viz cells must have 4 genuinely-active viz (else paused-off-screen confound)
    expect(cell('worker', '4-viz').vizGauge).toBeGreaterThanOrEqual(4)
    expect(cell('main', '4-viz').vizGauge).toBeGreaterThanOrEqual(4)
  })
})
