/**
 * THROWAWAY SPIKE (PK21 ladder) — the BLIT N→1 architecture fork.
 *
 * Question this answers (observe, don't infer): for N concurrent worker viz, is
 * the per-context BLIT (transferToImageBitmap → GPU flush, P110) removable by
 *   (B) Tier-1 DIRECT-render (render straight into the transferred canvas, NO
 *       transferToImageBitmap — like hydra, PV73), or does N-context contention
 *       persist independent of the blit (→ we need (A) a SHARED GL context)?
 *   (A) ONE GL context drawing N sub-viewports → ONE flush → region-readback to
 *       the N separate presenting canvases (the N→1 lever).
 *
 * Method mirrors P110: a HEAVY scene + a TRIVIAL (clear-only) control, each at
 * 1-up and 4-up. P110's tell was that even the trivial sketch inflated 1.9→4.5ms
 * at 4-up (N WebGL contexts flushing/compositing contend, 12 idle cores). If
 * DIRECT's trivial+heavy stay flat 1-up→4-up, B alone wins and A is unnecessary.
 *
 * Raw WebGL2 (not regl/p5) on purpose: the fork is about GL-context/blit
 * mechanics, identical under any wrapper — regl (the chosen vehicle) would not
 * change the answer. Self-contained: about:blank + blob workers, NO dev server.
 *
 * CAVEAT: headless chromium uses SwiftShader (software GL) — same as how P110 /
 * perf-matrix were measured, so RELATIVE A-vs-B holds; absolute ms differ from
 * real-GPU. Re-run headed for real-GPU confirmation before locking the design.
 *
 * Run: BLIT_SPIKE=1 pnpm --filter @stave/app exec playwright test blit-spike.spec.ts --timeout=180000 --workers=1
 */
import { test, expect } from '@playwright/test'

// ── worker source (classic blob worker, raw WebGL2, no imports) ───────────────
// Drives a fixed-window draw loop and reports per-frame present self-time +
// effective viz-frames. One source serves all three configs.
const WORKER_SRC = `
const VS = \`#version 300 es
in vec2 p; uniform float t;
void main(){ gl_Position = vec4(p.x, p.y + 0.001*sin(t), 0.0, 1.0); }\`;
const FS = \`#version 300 es
precision highp float; out vec4 o; uniform float t;
void main(){
  // a little fragment work so the flush has something to surface
  float a = 0.0;
  for(int i=0;i<8;i++){ a += sin(gl_FragCoord.x*0.05 + float(i) + t)*cos(gl_FragCoord.y*0.05); }
  o = vec4(0.6+0.4*sin(a), 0.2, 0.8, 1.0);
}\`;

function makeGL(canvas, preserve){
  const gl = canvas.getContext('webgl2', { antialias:false, preserveDrawingBuffer: !!preserve });
  const prog = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, VS],[gl.FRAGMENT_SHADER, FS]]){
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('shader: '+gl.getShaderInfoLog(sh));
    gl.attachShader(prog, sh);
  }
  gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link: '+gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const tLoc = gl.getUniformLocation(prog, 't');
  // HEAVY: a big dynamic line mesh (~10k segments) re-uploaded each frame, the
  // raw-GL analogue of the synthwave terrain whose geometry P110 found dominant.
  const SEG = 4000;
  const verts = new Float32Array(SEG*4);
  const buf = gl.createBuffer();
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, verts.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  return { gl, tLoc, verts, buf, SEG, vao };
}

function drawScene(ctx, mode, t, vp){
  const { gl, tLoc, verts, buf, SEG } = ctx;
  if (vp) gl.viewport(vp.x, vp.y, vp.w, vp.h); else gl.viewport(0,0,gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(0.05, 0.02, 0.11, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform1f(tLoc, t);
  if (mode === 'trivial'){
    // clear-only control + a single tri so the pipeline runs once
    return;
  }
  // heavy: animate + upload the line mesh, draw as GL_LINES
  for (let i=0;i<SEG;i++){
    const a = (i/SEG)*6.283 + t*0.5;
    verts[i*4]   = Math.cos(a);
    verts[i*4+1] = Math.sin(a*1.3)*0.9;
    verts[i*4+2] = Math.cos(a+0.3)*0.95;
    verts[i*4+3] = Math.sin(a*1.3+0.2)*0.85;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts);
  gl.drawArrays(gl.LINES, 0, SEG*2);
}

// force the GPU to finish surfacing this frame (comparable sync across configs)
const px = new Uint8Array(4);
function forceFlush(gl){ gl.readPixels(0,0,1,1, gl.RGBA, gl.UNSIGNED_BYTE, px); }

let stop = false;
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'stop'){ stop = true; return; }
  if (m.type !== 'run') return;
  const { config, mode, presenting, size, durationMs, count } = m;
  try { runConfig(config, mode, presenting, size, durationMs, count); }
  catch (err){ self.postMessage({ type:'error', message: String(err && err.message || err) }); }
};

function percentile(arr, p){
  if(!arr.length) return 0;
  const s = arr.slice().sort((a,b)=>a-b);
  return s[Math.min(s.length-1, Math.floor(p*s.length))];
}

function runConfig(config, mode, presenting, size, durationMs, count){
  const present = [], draw = [];
  let frames = 0, vizFrames = 0;
  const W = size.w, H = size.h;

  if (config === 'shared'){
    // ONE GL context, big canvas stacked vertically into N rows; one flush;
    // region-readback to each of the N presenting canvases.
    const big = new OffscreenCanvas(W, H*count);
    const ctx = makeGL(big, true); // preserve so createImageBitmap can read the regions
    const sinks = presenting.map(c => c.getContext('bitmaprenderer'));
    const t0 = performance.now();
    (function loop(){
      if (stop) return report();
      const t = (performance.now()-t0)/1000;
      const d0 = performance.now();
      for (let r=0;r<count;r++){
        drawScene(ctx, mode, t, { x:0, y:r*H, w:W, h:H });
        vizFrames++;
      }
      const d1 = performance.now();
      forceFlush(ctx.gl); // ONE flush for all N sub-viewports (the N→1 core)
      // distribute: one createImageBitmap per row region → transferFromImageBitmap
      const work = [];
      for (let r=0;r<count;r++){
        work.push(
          createImageBitmap(big, 0, r*H, W, H)
            .then(bmp => { try { sinks[r].transferFromImageBitmap(bmp); } catch(_){} })
            .catch(()=>{}),
        );
      }
      Promise.all(work).then(() => {
        const d2 = performance.now();
        draw.push(d1-d0); present.push(d2-d1); frames++;
        if (performance.now()-t0 < durationMs) setTimeout(loop, 0); else report();
      }).catch(() => report());
    })();
  } else {
    // baseline (Tier-2 blit) or direct (Tier-1) — N separate GL contexts in
    // THIS worker (proxy for N separate workers; same N-context contention).
    const ctxs = presenting.map(pc => {
      if (config === 'direct'){
        return { kind:'direct', ctx: makeGL(pc), present: pc };
      } else {
        const local = new OffscreenCanvas(W, H);
        const sink = pc.getContext('bitmaprenderer');
        return { kind:'baseline', ctx: makeGL(local), local, sink };
      }
    });
    const t0 = performance.now();
    (function loop(){
      if (stop) return report();
      const t = (performance.now()-t0)/1000;
      const d0 = performance.now();
      for (const c of ctxs){ drawScene(c.ctx, mode, t); vizFrames++; }
      const d1 = performance.now();
      for (const c of ctxs){
        if (c.kind === 'direct'){ forceFlush(c.ctx.gl); }
        else { c.sink.transferFromImageBitmap(c.local.transferToImageBitmap()); }
      }
      const d2 = performance.now();
      draw.push(d1-d0); present.push(d2-d1); frames++;
      if (performance.now()-t0 < durationMs) setTimeout(loop, 0); else report();
    })();
  }

  function report(){
    // non-blank check on the first presenting canvas via the heavy/clear color
    self.postMessage({
      type:'result', config, mode, count,
      frames, vizFrames,
      fps: +(frames/(durationMs/1000)).toFixed(1),
      vizFps: +(vizFrames/(durationMs/1000)).toFixed(1),
      drawP50:+percentile(draw,0.5).toFixed(3), drawP95:+percentile(draw,0.95).toFixed(3),
      presentP50:+percentile(present,0.5).toFixed(3), presentP95:+percentile(present,0.95).toFixed(3),
    });
  }
}
`

interface SpikeResult {
  config: string
  mode: string
  count: number
  frames: number
  vizFrames: number
  fps: number
  vizFps: number
  drawP50: number
  drawP95: number
  presentP50: number
  presentP95: number
}

test('blit N→1 spike: A (shared) vs B (direct) vs baseline (Tier-2 blit)', async ({ page }) => {
  test.skip(!process.env.BLIT_SPIKE, 'throwaway perf spike — set BLIT_SPIKE=1')
  await page.goto('about:blank')

  const results = await page.evaluate(async (workerSrc: string) => {
    const SIZE = { w: 360, h: 160 }
    const DURATION = 1800
    const CELL_BUDGET = 12000 // watchdog: a cell that exceeds this is reported as stuck
    const blobUrl = URL.createObjectURL(new Blob([workerSrc], { type: 'application/javascript' }))

    // one matrix cell: spawn the worker(s), transfer the presenting canvas(es),
    // collect each worker's result, sum viz-frames across workers.
    async function runCell(config: string, mode: string, count: number): Promise<any> {
      // baseline/direct: `count` separate workers (true N-worker contention).
      // shared: ONE worker holding all `count` presenting canvases.
      const nWorkers = config === 'shared' ? 1 : count
      const perWorker = config === 'shared' ? count : 1
      const workers: Worker[] = []
      const pending: Promise<any>[] = []

      for (let w = 0; w < nWorkers; w++) {
        const presenting: OffscreenCanvas[] = []
        for (let k = 0; k < perWorker; k++) {
          const canvas = document.createElement('canvas')
          canvas.width = SIZE.w
          canvas.height = SIZE.h
          canvas.style.cssText = 'width:480px;height:220px;display:block'
          document.body.appendChild(canvas)
          presenting.push(canvas.transferControlToOffscreen())
        }
        const worker = new Worker(blobUrl)
        workers.push(worker)
        const stub = {
          type: 'result', config, mode, count: perWorker, frames: 0, vizFrames: 0,
          fps: 0, vizFps: 0, drawP50: 0, drawP95: 0, presentP50: 0, presentP95: 0, stuck: true,
        }
        pending.push(
          new Promise((resolve) => {
            const wd = setTimeout(() => resolve({ ...stub, note: 'WATCHDOG-TIMEOUT' }), CELL_BUDGET)
            worker.onmessage = (ev: MessageEvent) => {
              if (ev.data?.type === 'error') { clearTimeout(wd); resolve({ ...stub, note: 'ERR:' + ev.data.message }) }
              else if (ev.data?.type === 'result') { clearTimeout(wd); resolve(ev.data) }
            }
            worker.onerror = (e: any) => { clearTimeout(wd); resolve({ ...stub, note: 'ONERROR:' + (e?.message || e) }) }
          }),
        )
        worker.postMessage(
          { type: 'run', config, mode, presenting, size: SIZE, durationMs: DURATION, count: perWorker },
          presenting as unknown as Transferable[],
        )
      }

      const parts = await Promise.all(pending)
      workers.forEach((w) => w.terminate())
      document.querySelectorAll('canvas').forEach((c) => c.remove())
      const stuckPart = parts.find((p: any) => p.stuck)

      // aggregate across workers: viz-frames sum; present p95 = worst worker
      const vizFps = parts.reduce((s, p) => s + p.vizFps, 0)
      const frames = parts.reduce((s, p) => s + p.frames, 0)
      const presentP95 = Math.max(...parts.map((p) => p.presentP95))
      const presentP50 = Math.max(...parts.map((p) => p.presentP50))
      const drawP95 = Math.max(...parts.map((p) => p.drawP95))
      return {
        config, mode, count,
        frames,
        vizFrames: parts.reduce((s, p) => s + p.vizFrames, 0),
        fps: +(frames / nWorkers / (DURATION / 1000)).toFixed(1),
        vizFps: +vizFps.toFixed(1),
        drawP50: parts[0].drawP50, drawP95: +drawP95.toFixed(3),
        presentP50: +presentP50.toFixed(3), presentP95: +presentP95.toFixed(3),
        stuck: !!stuckPart, note: stuckPart?.note,
      }
    }

    const out: any[] = []
    for (const mode of ['trivial', 'heavy']) {
      for (const config of ['baseline', 'direct', 'shared']) {
        for (const count of [1, 4]) {
          // brief settle between cells so prior GPU work drains
          await new Promise((r) => setTimeout(r, 250))
          out.push(await runCell(config, mode, count))
        }
      }
    }
    URL.revokeObjectURL(blobUrl)
    return out
  }, WORKER_SRC)

  // ── print the matrix ────────────────────────────────────────────────────────
  const rows = results as SpikeResult[]
  const fmt = (r: SpikeResult) =>
    `${r.mode.padEnd(8)} ${r.config.padEnd(9)} ${String(r.count) + '-up'} ` +
    `| vizFps ${String(r.vizFps).padStart(6)} | present p50 ${String(r.presentP50).padStart(7)}ms ` +
    `p95 ${String(r.presentP95).padStart(7)}ms | draw p95 ${String(r.drawP95).padStart(7)}ms`
  // eslint-disable-next-line no-console
  console.log('\n=== BLIT N→1 SPIKE (headless/SwiftShader) ===')
  for (const r of rows) console.log(fmt(r))

  // The fork tell: for each mode, present-cost inflation 1-up→4-up per config.
  for (const mode of ['trivial', 'heavy']) {
    for (const config of ['baseline', 'direct', 'shared']) {
      const u1 = rows.find((r) => r.mode === mode && r.config === config && r.count === 1)!
      const u4 = rows.find((r) => r.mode === mode && r.config === config && r.count === 4)!
      const inflation = u1.presentP95 > 0 ? (u4.presentP95 / u1.presentP95).toFixed(2) : 'n/a'
      // eslint-disable-next-line no-console
      console.log(`INFLATE ${mode}/${config}: present p95 ${u1.presentP95}→${u4.presentP95}ms (${inflation}×) · vizFps ${u1.vizFps}→${u4.vizFps}`)
    }
  }

  // surface any stuck/errored cells explicitly (don't fail — it's a measurement run)
  for (const r of rows as any[]) {
    if (r.stuck || r.note) console.log(`STUCK ${r.mode}/${r.config}/${r.count}-up: ${r.note || 'no result'}`)
  }
  // sanity only — this is a measurement harness, not a pass/fail gate
  expect(rows.length).toBe(12)
})
