import { test, expect, type Page } from '@playwright/test'

/**
 * perf-matrix (#228) — a measurement LADDER, not a single number.
 *
 * Drives the user's heavy WEBGL "synthwave terrain" p5 sketch as both INLINE
 * (one p5 instance per codeblock) and BACKDROP (full-screen), scaling instance
 * count one step at a time so the DELTA between rungs attributes the cost (the
 * cost curve that decides whether an optimization is even warranted).
 *
 * For each rung: eval → settle → perf.reset() → measure a steady-state window →
 * read window.__stavePerf.snapshot(). The numbers are the deliverable; the
 * console table at the end IS the result. Assertions only guard that data was
 * actually produced (frames recorded), NOT env-dependent thresholds.
 *
 * Read what matters: per-instance fps + p95 + DROPS (stutter, not mean fps),
 * longtasks (main-thread blocking), p5.bus p95, triggers/s.
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const SETTLE_MS = 2500 // let mount/compile/eval settle before measuring
const MEASURE_MS = 7000 // steady-state window (>4s fills the 240-frame ring)

// The user's sketch, verbatim (WEBGL terrain: sky/sun/mountains + a 100×50
// waveform-history mesh redrawn every frame — a genuinely heavy per-frame load).
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

// A constant rich audio bed (kept the same across rungs so viz cost is the
// variable). Each `silence.viz(...)` line adds ONE inline p5 instance fed by
// the MASTER analyser (so the terrain fills), with no extra audio.
const AUDIO = [
  `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909")`,
  `$: note("c2 eb2 g2 c3").s("sawtooth").lpf(700)`,
].join('\n')

const vizLine = `$: silence.viz("synthterrain")`

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

// Ctrl/Cmd+. = stop (EditorView.tsx:356). MUST stop before re-evaluating —
// Ctrl+Enter WHILE PLAYING is a no-op (#180), so without a stop every other
// rung's eval is swallowed and measures the previous scene.
async function stopCode(page: Page): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Period`)
  await page.waitForTimeout(600)
}

// Clean scene change: stop → set new code → evaluate (not-playing → eval takes).
async function play(page: Page, code: string): Promise<void> {
  await stopCode(page)
  await setCode(page, code)
  await runCode(page)
}

interface Row {
  scenario: string
  vizGauge: number
  instances: number
  minFps: number
  maxP95: number
  totalDrops: number
  busP95: number
  longtasks: number
  longtaskMax: number
  triggersPerSec: number
}

async function measure(page: Page, scenario: string): Promise<Row> {
  await page.waitForTimeout(SETTLE_MS)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).__stavePerf?.reset?.())
  await page.waitForTimeout(MEASURE_MS)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snap = await page.evaluate(() => (window as any).__stavePerf?.snapshot?.())

  const frameIds = Object.keys(snap.frames)
  const fpsList = frameIds.map((id) => snap.frames[id].fps).filter((f) => f > 0)
  const p95List = frameIds.map((id) => snap.frames[id].p95)
  const drops = frameIds.reduce((a, id) => a + snap.frames[id].drops, 0)
  const busSections = Object.keys(snap.sections).filter((n) => n.endsWith('.bus'))
  const busP95 = busSections.reduce((m, n) => Math.max(m, snap.sections[n].p95), 0)
  const triggers = snap.counters['audio.triggers'] ?? 0

  return {
    scenario,
    vizGauge: (snap.gauges['viz.p5'] ?? 0) + (snap.gauges['viz.hydra'] ?? 0) + (snap.gauges['viz.worker'] ?? 0),
    instances: frameIds.length,
    minFps: fpsList.length ? Math.min(...fpsList) : 0,
    maxP95: p95List.length ? Math.max(...p95List) : 0,
    totalDrops: drops,
    busP95,
    longtasks: snap.longtasks.count,
    longtaskMax: snap.longtasks.maxMs,
    triggersPerSec: snap.uptimeMs > 0 ? (triggers / snap.uptimeMs) * 1000 : 0,
  }
}

test.describe('perf-matrix — synthwave terrain cost curve (#228)', () => {
  test.beforeEach(async ({ page }) => {
    // B-3 (#245): VIZ_WORKER=1 force-enables OffscreenCanvas-worker rendering via
    // the localStorage override (registerVizWorker reads it at mount). Lets the
    // SAME pristine synthterrain fixture run both ways — main-thread baseline
    // (unset) vs worker (set) — so trig/s + longtasks are A/B comparable.
    const vizWorker = !!process.env.VIZ_WORKER
    await page.addInitScript((useWorker) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_PERF__ = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_E2E__ = true
      try {
        localStorage.setItem('stave.viz.worker', useWorker ? '1' : '0')
      } catch {
        /* private mode — ignore */
      }
    }, vizWorker)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(1000)

    // Register the sketch as an inline viz, and override the bundled spectrum
    // backdrop file with it (so a real `.spectrum()` pins it full-screen WITH
    // live audio — the production backdrop path).
    const overrideId = await page.evaluate((code) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      w.__staveRegisterViz({
        id: 'perf-synthterrain', name: 'synthterrain', renderer: 'p5', code,
        requires: ['streaming', 'queryable'], nativeSize: { w: 600, h: 380 },
        createdAt: 1, updatedAt: 1,
      })
      return w.__staveOverrideVizFile?.('spectrum', code) ?? null
    }, SYNTH_CODE)
    // eslint-disable-next-line no-console
    console.log(`[setup] backdrop override of spectrum.p5 → ${overrideId ?? 'NOT FOUND (backdrop rungs will use default spectrum)'}`)
  })

  test('measure the cost ladder and print the table', async ({ page }) => {
    // Manual diagnostic harness (~90s) — opt-in so it doesn't slow normal e2e.
    // Run: PERF_MATRIX=1 pnpm exec playwright test perf-matrix.spec.ts
    test.skip(!process.env.PERF_MATRIX, 'manual perf harness — set PERF_MATRIX=1')
    const rows: Row[] = []

    const [drums, bass] = AUDIO.split('\n')

    // 1. idle floor (nothing running)
    await play(page, `// idle`)
    rows.push(await measure(page, 'idle'))

    // 2. audio only, no viz
    await play(page, AUDIO)
    rows.push(await measure(page, 'audio-only'))

    // 3-5. audio + N inline WEBGL terrains
    for (const n of [1, 2, 4]) {
      await play(page, [AUDIO, ...Array(n).fill(vizLine)].join('\n'))
      rows.push(await measure(page, `inline-${n}`))
    }

    // 6. audio + 1 full-screen backdrop terrain (heaviest single instance)
    await play(page, [drums, `${bass}.spectrum()`].join('\n'))
    rows.push(await measure(page, 'backdrop-1'))

    // Screenshot the live overlay HUD (proves the visual output) — heaviest rung.
    await page.screenshot({ path: 'test-results/perf-overlay.png' })

    // 7. realistic mix: backdrop + 2 inline + audio
    await play(page, [drums, `${bass}.spectrum()`, vizLine, vizLine].join('\n'))
    rows.push(await measure(page, 'mix(bd+2inline)'))

    // ── PRINT THE COST CURVE ─────────────────────────────────────────────────
    const pad = (s: string | number, n: number) => String(s).padEnd(n)
    const fix = (n: number, d = 1) => n.toFixed(d)
    // eslint-disable-next-line no-console
    console.log('\n=== PERF MATRIX — synthwave terrain (#228) ===')
    // eslint-disable-next-line no-console
    console.log(
      pad('scenario', 18) + pad('viz', 5) + pad('minFps', 8) + pad('frameP95ms', 12) +
        pad('drops', 7) + pad('busP95ms', 10) + pad('longtask(n/max)', 18) + 'trig/s',
    )
    for (const r of rows) {
      // eslint-disable-next-line no-console
      console.log(
        pad(r.scenario, 18) + pad(r.vizGauge, 5) + pad(fix(r.minFps), 8) +
          pad(fix(r.maxP95), 12) + pad(r.totalDrops, 7) + pad(fix(r.busP95, 2), 10) +
          pad(`${r.longtasks} / ${fix(r.longtaskMax)}`, 18) + fix(r.triggersPerSec),
      )
    }
    // eslint-disable-next-line no-console
    console.log('=== end matrix ===\n')

    // STRUCTURE assertions — data was produced, not env thresholds.
    expect(rows.length).toBe(7)
    const audioOnly = rows.find((r) => r.scenario === 'audio-only')!
    expect(audioOnly.triggersPerSec).toBeGreaterThan(0) // scheduler running
    const inline4 = rows.find((r) => r.scenario === 'inline-4')!
    expect(inline4.instances).toBeGreaterThanOrEqual(1) // at least one terrain rendered
  })
})
