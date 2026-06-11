/* eslint-disable */
// ── Q3 PRE-FLIGHT SPIKE — hydra-synth in a Web Worker on an OffscreenCanvas ──
//
// Issue #237. The worker-friendly second renderer. Same observe-first PK21 ladder
// as the B-0 p5 spike. GROUNDED expectation: hydra needs a SMALLER shim than p5 —
// `_initCanvas` (hydra-synth.js:235) does `if (canvas) this.canvas = canvas`, so
// passing an OffscreenCanvas skips p5's createElement/appendChild dance; and
// makeGlobal/autoLoop/detectAudio/enableStreamCapture=false strip the rest.
//
// Classic worker: importScripts() the self-contained UMD bundle (it falls back to
// `self` as global → `self.Hydra`). Shim = alias window→self (workers already have
// addEventListener/setTimeout/URL/navigator) + a thin document + size props.

const reports = []
function emit(stage, status, detail) {
  reports.push({ stage, status, detail })
  self.postMessage({ type: 'stage', stage, status, detail })
}
function errInfo(e) {
  return {
    message: String((e && e.message) || e),
    name: String((e && e.name) || ''),
    stack: String((e && e.stack) || '').split('\n').slice(0, 8).join('\n'),
  }
}
self.addEventListener('unhandledrejection', (e) =>
  self.postMessage({ type: 'workerlog', line: '[unhandledrejection] ' + String(e.reason && e.reason.stack || e.reason) })
)
for (const k of ['error', 'warn']) {
  const orig = console[k]?.bind(console)
  console[k] = (...a) => {
    self.postMessage({ type: 'workerlog', line: `[console.${k}] ` + a.map(String).join(' ') })
    orig?.(...a)
  }
}

// Read pixels off the (webgl) OffscreenCanvas via a 2D probe (drawImage accepts
// an OffscreenCanvas regardless of its own context type).
function probePixels(oc) {
  const w = oc.width
  const h = oc.height
  const probe = new OffscreenCanvas(w, h)
  const ctx = probe.getContext('2d')
  ctx.drawImage(oc, 0, 0)
  const { data } = ctx.getImageData(0, 0, w, h)
  let nonBlank = 0
  const colors = new Set()
  const step = Math.max(1, Math.floor((w * h) / 2000))
  for (let i = 0; i < w * h; i += step) {
    const o = i * 4
    if (data[o] || data[o + 1] || data[o + 2] || data[o + 3]) nonBlank++
    if (colors.size < 12) colors.add(`${data[o]},${data[o + 1]},${data[o + 2]},${data[o + 3]}`)
  }
  return { nonBlank, sampledColors: [...colors], w, h }
}

function installShim(W, H) {
  // Make `window` an alias of the worker global — hydra reads window.innerWidth /
  // window.addEventListener / window.URL / window.navigator, all of which then
  // resolve to `self` (workers natively provide most; we add the few missing).
  self.window = self
  if (typeof self.requestAnimationFrame !== 'function') {
    self.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
    self.cancelAnimationFrame = (id) => clearTimeout(id)
  }
  if (!('innerWidth' in self)) self.innerWidth = W
  if (!('innerHeight' in self)) self.innerHeight = H
  if (!('devicePixelRatio' in self)) self.devicePixelRatio = 1
  // Thin document — only the createElement/body/head paths hydra might touch
  // (the canvas path is skipped because we pass an explicit OffscreenCanvas).
  const noopEl = () => ({
    style: {},
    appendChild: () => {},
    removeChild: () => {},
    remove: () => {},
    setAttribute: () => {},
    addEventListener: () => {},
  })
  self.document = {
    createElement: (tag) =>
      String(tag).toLowerCase() === 'canvas' ? new OffscreenCanvas(W, H) : noopEl(),
    createElementNS: () => noopEl(),
    body: noopEl(),
    head: noopEl(),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    readyState: 'complete',
  }
  self.screen = { width: W, height: H }
}

self.onmessage = (ev) => {
  const { canvas, scriptUrl, width = 256, height = 256 } = ev.data || {}
  const W = width
  const H = height

  // ── S3: install the (thin) shim FIRST ──
  // hydra touches window at module-eval (e.g. `mouseListen` adds a mousemove
  // listener — hydra-synth.js:3926), so the shim must precede importScripts.
  // window=self means the UMD picks g=window=self → self.Hydra.
  try {
    installShim(W, H)
    emit('S3-shim', 'ok', { note: 'window=self alias + thin document + size props' })
  } catch (e) {
    emit('S3-shim', 'throw', errInfo(e))
  }

  // ── S1: load the hydra UMD bundle in a worker ──
  try {
    importScripts(scriptUrl || './hydra-synth.js')
    emit('S1-import', 'ok', { hasHydra: typeof self.Hydra })
  } catch (e) {
    emit('S1-import', 'throw', errInfo(e))
    return self.postMessage({ type: 'done', verdict: 'NO', at: 'S1-import', reports })
  }
  if (typeof self.Hydra !== 'function') {
    emit('S1-import', 'throw', { note: 'self.Hydra is not a constructor after importScripts' })
    return self.postMessage({ type: 'done', verdict: 'NO', at: 'S1-import', reports })
  }

  // ── S4: construct hydra against the OffscreenCanvas, run osc().out(), readback ──
  if (!canvas) {
    emit('S4-draw', 'skip', { reason: 'no OffscreenCanvas transferred' })
    return self.postMessage({ type: 'done', verdict: 'INCONCLUSIVE', at: 'S4-draw', reports })
  }
  canvas.width = W
  canvas.height = H
  try {
    const h = new self.Hydra({
      canvas, // explicit surface → skips hydra's createElement/appendChild (hydra-synth.js:235)
      width: W,
      height: H,
      makeGlobal: false, // no global synth writes / window.loadScript
      autoLoop: false, // we drive tick() ourselves (no rAF dependency)
      detectAudio: false, // no Meyda / getUserMedia / AudioContext in the worker
      enableStreamCapture: false, // OffscreenCanvas has no captureStream
    })
    emit('S4-construct', 'ok', { synthKeys: Object.keys(h.synth || {}).slice(0, 12) })

    // A trivial generative sketch — a coloured oscillator. With makeGlobal:false
    // the generators live on h.synth.
    const s = h.synth
    s.osc(60, 0.1, 1.5).rotate(0.2).out(s.o0)

    // Drive a handful of frames manually (autoLoop is off).
    let ticks = 0
    let tickErr = null
    for (let i = 0; i < 12; i++) {
      try {
        h.tick(16)
        ticks++
      } catch (e) {
        tickErr = e
        break
      }
    }
    if (tickErr) {
      emit('S4-draw', 'throw', { ...errInfo(tickErr), ticks })
      return self.postMessage({ type: 'done', verdict: 'NO', at: 'S4-draw', reports })
    }

    const pixels = probePixels(canvas)
    const pass = ticks > 0 && pixels.nonBlank > 0
    emit('S4-draw', pass ? 'ok' : 'blank', { ticks, pixels })
    self.postMessage({ type: 'done', verdict: pass ? 'YES' : 'PARTIAL', at: 'S4-draw', reports, pixels })
  } catch (e) {
    emit('S4-draw', 'throw', errInfo(e))
    self.postMessage({ type: 'done', verdict: 'NO', at: 'S4-draw', reports })
  }
}
