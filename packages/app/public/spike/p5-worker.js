/* eslint-disable */
// ── B-0 FEASIBILITY SPIKE — p5 v2 in a Web Worker on an OffscreenCanvas ──
//
// Question (issue #235): can the p5 WEBGL renderer (the measured main-thread
// bottleneck — PV69/P101) move off-thread into a worker via OffscreenCanvas?
//
// This worker is OBSERVE-FIRST. It runs staged probes and posts a structured
// report for EACH stage. We never assume p5 works in a worker — p5 expects
// `window`/`document`, which a WorkerGlobalScope does not have. The job is to
// observe exactly WHERE it breaks and, via a recording DOM shim, discover the
// MINIMAL surface p5 actually touches (the "how minimal is the shim" answer).
//
// Stages:
//   S1  import p5 in a worker          — does module-eval touch document/window?
//   S2  bare `new p5()` WEBGL, no shim — what does it throw, and where?
//   S3  minimal recording DOM shim     — point p5 at the transferred canvas;
//                                         record every non-OffscreenCanvas prop
//                                         p5 reaches for (the shim surface).
//   S4  draw a frame → read pixels     — non-blank = PASS.

const reports = []
function emit(stage, status, detail) {
  const r = { stage, status, detail }
  reports.push(r)
  self.postMessage({ type: 'stage', ...r })
}

// Forward worker-side diagnostics to the driver — p5's async #_setup rejects
// out-of-band (it's not awaited by our `new p5()`), so without this the real
// error is invisible. Also capture p5's FES console output.
const workerLogs = []
function wlog(kind, args) {
  const line = `[${kind}] ` + args.map((a) => {
    try {
      if (a instanceof Error) return `${a.name}: ${a.message}\n${String(a.stack || '').split('\n').slice(0, 6).join('\n')}`
      return typeof a === 'string' ? a : JSON.stringify(a)
    } catch {
      return String(a)
    }
  }).join(' ')
  workerLogs.push(line)
  self.postMessage({ type: 'workerlog', line })
}
self.addEventListener('error', (e) => wlog('error', [e.message, `${e.filename}:${e.lineno}:${e.colno}`]))
self.addEventListener('unhandledrejection', (e) => wlog('unhandledrejection', [e.reason]))
for (const k of ['error', 'warn', 'log']) {
  const orig = console[k]?.bind(console)
  console[k] = (...a) => {
    wlog('console.' + k, a)
    orig?.(...a)
  }
}
function errInfo(e) {
  return {
    message: String((e && e.message) || e),
    name: String((e && e.name) || ''),
    // first few stack frames — enough to cite the p5 internal that died
    stack: String((e && e.stack) || '').split('\n').slice(0, 8).join('\n'),
  }
}

// ── Recording DOM shim ───────────────────────────────────────────────────
// Every property p5 reads off `document` / `window` / the canvas that is NOT
// natively present gets recorded in `touched`. That set, post-run, is the
// grounded minimal-shim surface. Stubs are benign (no-op fn / 0 / empty),
// so we observe how FAR p5 gets, not how fast it dies.
const touched = { document: new Set(), window: new Set(), canvas: new Set() }

// Recursively collect elements matching a tagName from the fake DOM tree we
// build via appendChild — backs getElementsByTagName so p5's created <main>
// (and the canvas) are findable.
function collectByTag(root, TAG, out) {
  const kids = root && (root.children || root.childNodes)
  if (!Array.isArray(kids)) return
  for (const c of kids) {
    if (c && c.tagName === TAG) out.push(c)
    collectByTag(c, TAG, out)
  }
}

function makeStyle() {
  // p5 reads/writes canvas.style.* and element.style.*
  return new Proxy(
    {},
    {
      get: (t, k) => (k in t ? t[k] : ''),
      set: (t, k, v) => {
        t[k] = v
        return true
      },
    }
  )
}

// A fake DOM element good enough for p5's container / wrapper plumbing.
function makeElement(tag) {
  const children = []
  const listeners = {}
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    nodeType: 1,
    style: makeStyle(),
    dataset: {},
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    attributes: {},
    children,
    childNodes: children,
    parentNode: null,
    ownerDocument: null, // set below
    clientWidth: 0,
    clientHeight: 0,
    offsetWidth: 0,
    offsetHeight: 0,
    scrollWidth: 0,
    scrollHeight: 0,
    setAttribute(k, v) {
      this.attributes[k] = v
    },
    getAttribute(k) {
      return this.attributes[k] ?? null
    },
    removeAttribute(k) {
      delete this.attributes[k]
    },
    hasAttribute(k) {
      return k in this.attributes
    },
    appendChild(c) {
      children.push(c)
      if (c) c.parentNode = el
      return c
    },
    removeChild(c) {
      const i = children.indexOf(c)
      if (i >= 0) children.splice(i, 1)
      return c
    },
    insertBefore(c) {
      children.push(c)
      if (c) c.parentNode = el
      return c
    },
    remove() {},
    addEventListener(type, fn) {
      ;(listeners[type] ||= []).push(fn)
    },
    removeEventListener() {},
    dispatchEvent: () => true,
    getBoundingClientRect: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
    }),
    getElementsByTagName: () => [],
    querySelector: () => null,
    querySelectorAll: () => [],
    elt: undefined, // p5.Element compat — set by p5 itself
  }
  return el
}

// Augment the REAL OffscreenCanvas with the DOM surface p5 reaches for, WITHOUT
// a Proxy. A Proxy fails: native WebGL `texImage2D(source)` does a BRANDED
// internal-slot check on its source, and a Proxy-wrapped OffscreenCanvas is not
// recognised as an OffscreenCanvas → "Overload resolution failed". So we define
// the extra props directly on the genuine instance — native APIs (getContext,
// texImage2D, drawImage) see a real OffscreenCanvas; p5's JS reads hit our shims.
function wrapCanvas(offscreen) {
  const def = (k, v) =>
    Object.defineProperty(offscreen, k, { value: v, writable: true, configurable: true })
  const getr = (k, fn) =>
    Object.defineProperty(offscreen, k, { get: fn, configurable: true })
  const attributes = {}
  def('tagName', 'CANVAS') // getElementsByTagName('canvas') (touchAction loop)
  def('nodeName', 'CANVAS')
  def('nodeType', 1)
  def('style', makeStyle())
  def('dataset', {})
  def('id', '')
  def('className', '')
  def('classList', { add() {}, remove() {}, contains: () => false, toggle() {} })
  def('parentNode', null)
  def('parentElement', null)
  def('ownerDocument', null)
  def('children', [])
  def('childNodes', [])
  def('elt', undefined)
  getr('clientWidth', () => offscreen.width)
  getr('clientHeight', () => offscreen.height)
  getr('offsetWidth', () => offscreen.width)
  getr('offsetHeight', () => offscreen.height)
  def('offsetLeft', 0)
  def('offsetTop', 0)
  getr('scrollWidth', () => offscreen.width)
  getr('scrollHeight', () => offscreen.height)
  def('setAttribute', (k, v) => {
    attributes[k] = v
  })
  def('getAttribute', (k) => (k in attributes ? attributes[k] : null))
  def('removeAttribute', (k) => {
    delete attributes[k]
  })
  def('hasAttribute', (k) => k in attributes)
  def('addEventListener', () => {})
  def('removeEventListener', () => {})
  def('dispatchEvent', () => true)
  def('getBoundingClientRect', () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: offscreen.width,
    height: offscreen.height,
  }))
  def('remove', () => {})
  touched.canvas.add('augmented-real-OffscreenCanvas (no Proxy)')
  return offscreen
}

function installShim(makeCanvasEl) {
  const doc = {
    nodeType: 9,
    createElement(tag) {
      touched.document.add('createElement(' + tag + ')')
      // p5 creates MULTIPLE canvases: an unconditional default P2D canvas in
      // #_setup (p5.js:72546), then the user's WEBGL canvas in setup(). Each
      // must be a DISTINCT surface — a canvas can hold only ONE context type, so
      // reusing one surface makes the 2nd getContext() return null and p5 falls
      // through to the invalid 'experimental-webgl' enum (throws on OffscreenCanvas).
      if (String(tag).toLowerCase() === 'canvas') return makeCanvasEl()
      const el = makeElement(tag)
      el.ownerDocument = doc
      return el
    },
    createElementNS(_ns, tag) {
      touched.document.add('createElementNS(' + tag + ')')
      return this.createElement(tag)
    },
    createTextNode: (t) => ({ nodeType: 3, textContent: t }),
    getElementById(id) {
      touched.document.add('getElementById(' + id + ')')
      return null
    },
    getElementsByTagName(t) {
      touched.document.add('getElementsByTagName(' + t + ')')
      // p5 creates <main>, appends it to body, then immediately does
      // getElementsByTagName('main')[0].appendChild(canvas) (p5.js:71123-71128).
      // A flat [] makes [0] undefined → the appendChild crash. So actually walk
      // the fake tree we've been building via appendChild.
      const out = []
      const TAG = String(t).toUpperCase()
      collectByTag(doc.body, TAG, out)
      return out
    },
    querySelector(s) {
      touched.document.add('querySelector(' + s + ')')
      return null
    },
    querySelectorAll(s) {
      touched.document.add('querySelectorAll(' + s + ')')
      return []
    },
    addEventListener() {
      touched.document.add('addEventListener')
    },
    removeEventListener() {},
    hasFocus: () => true,
    elementFromPoint: () => null,
  }
  const body = makeElement('body')
  const docEl = makeElement('html')
  body.ownerDocument = doc
  docEl.ownerDocument = doc
  doc.body = body
  doc.documentElement = docEl
  doc.head = makeElement('head')
  doc.readyState = 'complete'

  // Recording wrappers so unexpected document/window props are captured.
  const docProxy = new Proxy(doc, {
    get(t, p) {
      if (p in t) {
        const v = t[p]
        return typeof v === 'function' ? v.bind(t) : v
      }
      touched.document.add(String(p) + ' (UNHANDLED)')
      return undefined
    },
  })

  const win = {
    document: docProxy,
    devicePixelRatio: 1,
    innerWidth: 800,
    innerHeight: 600,
    screen: { width: 800, height: 600 },
    location: { href: self.location ? self.location.href : 'about:blank' },
    navigator: self.navigator,
    addEventListener() {
      touched.window.add('addEventListener')
    },
    removeEventListener() {},
    requestAnimationFrame:
      self.requestAnimationFrame?.bind(self) ||
      ((cb) => setTimeout(() => cb(performance.now()), 16)),
    cancelAnimationFrame: self.cancelAnimationFrame?.bind(self) || ((id) => clearTimeout(id)),
    getComputedStyle: () => makeStyle(),
    matchMedia: () => ({ matches: false, addListener() {}, removeListener() {} }),
    performance: self.performance,
    setTimeout: self.setTimeout.bind(self),
    clearTimeout: self.clearTimeout.bind(self),
  }
  const winProxy = new Proxy(win, {
    get(t, p) {
      if (p in t) {
        const v = t[p]
        return typeof v === 'function' ? v.bind(t) : v
      }
      // fall through to the worker global for anything else p5 reads
      if (p in self) {
        touched.window.add(String(p) + ' (->self)')
        const v = self[p]
        return typeof v === 'function' ? v.bind(self) : v
      }
      touched.window.add(String(p) + ' (UNHANDLED)')
      return undefined
    },
  })

  // Install on the worker global so p5's bare `document` / `window` resolve.
  self.window = winProxy
  self.document = docProxy
  self.screen = win.screen
  if (!('devicePixelRatio' in self)) self.devicePixelRatio = 1
  // Workers have NO requestAnimationFrame — p5's draw loop needs one. Provide a
  // setTimeout-backed shim globally so both bare `requestAnimationFrame` and
  // `window.requestAnimationFrame` resolve and p5's loop ticks (~60fps).
  if (typeof self.requestAnimationFrame !== 'function') {
    self.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
    self.cancelAnimationFrame = (id) => clearTimeout(id)
  }
  return { winProxy, docProxy }
}

// Read pixels off the (webgl) offscreen canvas via a 2D probe canvas —
// drawImage accepts an OffscreenCanvas regardless of its own context type.
function probePixels(offscreen) {
  const w = offscreen.width
  const h = offscreen.height
  const probe = new OffscreenCanvas(w, h)
  const ctx = probe.getContext('2d')
  ctx.drawImage(offscreen, 0, 0)
  const { data } = ctx.getImageData(0, 0, w, h)
  let nonBlank = 0
  const colors = new Set()
  const step = Math.max(1, Math.floor((w * h) / 2000)) // sample ~2000 px
  for (let i = 0; i < w * h; i += step) {
    const o = i * 4
    const r = data[o]
    const g = data[o + 1]
    const b = data[o + 2]
    const a = data[o + 3]
    if (r || g || b || a) nonBlank++
    if (colors.size < 12) colors.add(`${r},${g},${b},${a}`)
  }
  // center pixel — the sketch paints a known green rect there over red bg
  const co = (Math.floor(h / 2) * w + Math.floor(w / 2)) * 4
  const center = [data[co], data[co + 1], data[co + 2], data[co + 3]]
  return { nonBlank, sampledColors: [...colors], center, w, h }
}

self.onmessage = async (ev) => {
  const { canvas, width = 256, height = 256 } = ev.data || {}
  const W = width
  const H = height

  // ── S1-bare: import p5 in a worker WITHOUT a shim ──
  // GROUNDED (first run): p5 throws `window is not defined` at module-eval —
  // `registerAddon(Ge)` immediately calls `window.performance.now()`
  // (p5.esm.min.js Ge body). A cache-busted specifier gives this a fresh module
  // evaluation so the result is recorded independently of the shimmed import.
  try {
    await import('./p5.esm.min.js?bare=' + Date.now())
    emit('S1-bare', 'ok', { note: 'imported with NO shim — unexpected; p5 did not touch window at eval' })
  } catch (e) {
    emit('S1-bare', 'throw', errInfo(e))
  }

  // ── S3: install the recording shim BEFORE importing p5 ──
  // (registerAddon touches window at eval, so the shim must pre-exist.)
  if (!canvas) {
    emit('S3-shim', 'skip', { reason: 'no OffscreenCanvas was transferred' })
    self.postMessage({ type: 'done', verdict: 'INCONCLUSIVE', at: 'S3-shim', reports, touched: snapshot() })
    return
  }
  canvas.width = W
  canvas.height = H
  // p5 creates SEVERAL canvases — the default P2D, the user's WEBGL renderer,
  // AND internal helpers (1×1 empty texture, image buffers). EACH must be its
  // own fresh surface (a canvas holds one context type). We render into
  // worker-local OffscreenCanvases and read the WEBGL one back; wiring the
  // *transferred* canvas as p5's main render target is a Phase B detail
  // (transferControlToOffscreen availability already proven on the main side).
  const createdCanvases = []
  let canvasCalls = 0
  const makeCanvasEl = () => {
    canvasCalls++
    const oc = new OffscreenCanvas(1, 1) // p5 sizes it via createCanvas
    createdCanvases.push(oc)
    return wrapCanvas(oc)
  }
  let shimErr = null
  try {
    installShim(makeCanvasEl)
    emit('S3-shim', 'ok', { note: 'window/document/rAF shim installed; canvas factory wired (throwaway P2D → transferred WEBGL)' })
  } catch (e) {
    shimErr = e
    emit('S3-shim', 'throw', errInfo(e))
  }

  // ── S1-shimmed: import p5 with the shim in place ──
  let P5
  try {
    const mod = await import('./p5.esm.min.js?shim=' + Date.now())
    P5 = mod.default || mod.p5 || mod
    // Kill the Friendly Error System — its presetup hook does
    // `querySelectorAll('script')[last].src` (p5.js:97021) to fetch user source,
    // which has no meaning in a worker and crashes on undefined. Gated by this
    // flag (p5.js:97043). FES is dev-ergonomics only; irrelevant to rendering.
    P5.disableFriendlyErrors = true
    emit('S1-shimmed', 'ok', { typeofDefault: typeof P5, fesDisabled: true })
  } catch (e) {
    emit('S1-shimmed', 'throw', errInfo(e))
    self.postMessage({ type: 'done', verdict: 'NO', at: 'S1-shimmed', reports, touched: snapshot() })
    return
  }

  // ── S4: construct p5 against the shim + draw a frame + read pixels ──
  try {
    let setupRan = false
    let drawCount = 0
    let drawErr = null
    const sketch = (p) => {
      p.setup = () => {
        setupRan = true
        p.createCanvas(W, H, p.WEBGL)
        p.noStroke()
      }
      p.draw = () => {
        try {
          p.background(255, 0, 0) // red field
          p.fill(0, 255, 0) // green rect dead center
          p.rectMode(p.CENTER)
          p.rect(0, 0, W / 2, H / 2)
          drawCount++
        } catch (e) {
          drawErr = e
          p.noLoop?.()
        }
      }
    }
    const inst = new P5(sketch)
    // Wait for p5's deferred setup + a few draw frames.
    await new Promise((r) => setTimeout(r, 400))

    if (drawErr) {
      emit('S4-draw', 'throw', { ...errInfo(drawErr), setupRan, drawCount })
      self.postMessage({ type: 'done', verdict: 'NO', at: 'S4-draw', reports, touched: snapshot() })
      return
    }

    // p5's main render canvas is whichever worker OffscreenCanvas has the
    // rendered scene. Probe each W×H-ish surface; pick the one with the most
    // non-blank pixels (the others are the 1×1 texture / default P2D).
    let pixels = { nonBlank: 0, sampledColors: [], center: [0, 0, 0, 0], w: 0, h: 0 }
    const sizes = []
    for (const oc of createdCanvases) {
      sizes.push(`${oc.width}x${oc.height}`)
      if (oc.width < 8 || oc.height < 8) continue
      try {
        const p = probePixels(oc)
        if (p.nonBlank > pixels.nonBlank) pixels = p
      } catch {
        /* a webgl-only canvas may reject 2d drawImage in some engines */
      }
    }
    const pass = setupRan && drawCount > 0 && pixels.nonBlank > 0
    emit('S4-draw', pass ? 'ok' : 'blank', { setupRan, drawCount, canvasCalls, canvasSizes: sizes, pixels })
    try {
      inst.remove?.()
    } catch {}

    self.postMessage({
      type: 'done',
      verdict: pass ? 'YES' : 'PARTIAL',
      at: 'S4-draw',
      reports,
      touched: snapshot(),
      pixels,
    })
  } catch (e) {
    emit('S4-draw', 'throw', { ...errInfo(e), shimErr: shimErr ? errInfo(shimErr) : null })
    self.postMessage({ type: 'done', verdict: 'NO', at: 'S4-draw', reports, touched: snapshot() })
  }
}

function snapshot() {
  return {
    document: [...touched.document],
    window: [...touched.window],
    canvas: [...touched.canvas],
  }
}
