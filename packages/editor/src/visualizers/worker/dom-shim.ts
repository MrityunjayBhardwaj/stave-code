/**
 * Worker DOM shim — the minimal `window`/`document`/canvas surface p5 v2 reaches
 * for so a whole sketch runs inside a `WorkerGlobalScope` (no DOM) and renders to
 * an `OffscreenCanvas` (Phase B / B-3, epic #228).
 *
 * GROUNDED by the B-0 feasibility spike (#235/#236, PV70): p5 touches a SMALL,
 * KNOWN set of DOM primitives, each discovered by reading p5.js at the exact
 * stack frame that threw against a recording shim. This module is the production
 * port of that spike's shim (`public/spike/p5-worker.js`), carrying the SIX
 * load-bearing conditions verbatim. The spike's *recording* instrumentation is
 * dropped — production only needs the surface, not the discovery.
 *
 * The six PV70 conditions (each maps to a real p5.js failure the spike grounded):
 *   1. SHIM BEFORE IMPORT      — `registerAddon(...)` calls `window.performance.now()`
 *      at module-eval, so `window`/`document` must exist on the worker global
 *      BEFORE `import('p5')`. The caller installs the shim, THEN imports p5.
 *   2. setTimeout-backed rAF   — a worker has no `requestAnimationFrame`; p5's draw
 *      loop needs one. Provide a ~60fps setTimeout shim on the worker global.
 *   3. disableFriendlyErrors   — p5's FES presetup hook does
 *      `querySelectorAll('script')[last].src` (meaningless in a worker, crashes on
 *      undefined). The caller sets `P5.disableFriendlyErrors = true` after import.
 *   4. tree-walk getElementsByTagName — p5 appends `<main>` to body then does
 *      `getElementsByTagName('main')[0].appendChild(canvas)`; a flat `[]` makes
 *      `[0]` undefined → crash. So actually walk the fake tree built via appendChild.
 *   5. DISTINCT canvas per createElement('canvas') — p5 creates MULTIPLE canvases
 *      (default P2D + the user's WEBGL + 1×1 helpers); a canvas holds ONE context
 *      type, so each must be its own surface. `makeCanvasEl` returns a FRESH one
 *      every call.
 *   6. AUGMENT the real OffscreenCanvas, NO Proxy (P102) — native WebGL
 *      `texImage2D(source)` does a BRANDED internal-slot check; a Proxy-wrapped
 *      OffscreenCanvas fails it ("Overload resolution failed"). So the DOM surface
 *      p5 reads is defined directly on the genuine instance via `defineProperty`.
 *
 * REF: PV70 (.anvi/vyapti.md), PK21/PK22 (.anvi/krama.md), P102 (.anvi/hetvabhasa.md),
 *      packages/app/public/spike/p5-worker.js (the grounded POC).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A fake element style bag — p5 reads/writes `el.style.*`. */
function makeStyle(): any {
  return new Proxy(
    {} as Record<string, unknown>,
    {
      get: (t, k) => (k in t ? (t as any)[k] : ''),
      set: (t, k, v) => {
        ;(t as any)[k] = v
        return true
      },
    },
  )
}

/** Recursively collect elements matching a tagName from the fake DOM tree built
 *  via appendChild — backs `getElementsByTagName` (condition 4). */
function collectByTag(root: any, TAG: string, out: any[]): void {
  const kids = root && (root.children || root.childNodes)
  if (!Array.isArray(kids)) return
  for (const c of kids) {
    if (c && c.tagName === TAG) out.push(c)
    collectByTag(c, TAG, out)
  }
}

/** A fake DOM element good enough for p5's container / wrapper plumbing. */
function makeElement(tag: string): any {
  const children: any[] = []
  const listeners: Record<string, ((...a: any[]) => void)[]> = {}
  const el: any = {
    tagName: String(tag || 'div').toUpperCase(),
    nodeType: 1,
    style: makeStyle(),
    dataset: {},
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    attributes: {} as Record<string, unknown>,
    children,
    childNodes: children,
    parentNode: null,
    ownerDocument: null,
    clientWidth: 0,
    clientHeight: 0,
    offsetWidth: 0,
    offsetHeight: 0,
    scrollWidth: 0,
    scrollHeight: 0,
    setAttribute(k: string, v: unknown) {
      this.attributes[k] = v
    },
    getAttribute(k: string) {
      return this.attributes[k] ?? null
    },
    removeAttribute(k: string) {
      delete this.attributes[k]
    },
    hasAttribute(k: string) {
      return k in this.attributes
    },
    appendChild(c: any) {
      children.push(c)
      if (c) c.parentNode = el
      return c
    },
    removeChild(c: any) {
      const i = children.indexOf(c)
      if (i >= 0) children.splice(i, 1)
      return c
    },
    insertBefore(c: any) {
      children.push(c)
      if (c) c.parentNode = el
      return c
    },
    remove() {},
    addEventListener(type: string, fn: (...a: any[]) => void) {
      ;(listeners[type] ||= []).push(fn)
    },
    removeEventListener() {},
    dispatchEvent: () => true,
    getBoundingClientRect: () => ({
      x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0,
    }),
    getElementsByTagName: () => [],
    querySelector: () => null,
    querySelectorAll: () => [],
    elt: undefined, // p5.Element compat — set by p5 itself
  }
  return el
}

/**
 * Augment the REAL `OffscreenCanvas` with the DOM surface p5 reaches for, WITHOUT
 * a Proxy (condition 6 / P102). Native APIs (getContext, texImage2D, drawImage)
 * see a genuine OffscreenCanvas; p5's JS reads hit the shimmed props defined
 * directly on the instance.
 */
export function wrapCanvas(offscreen: OffscreenCanvas): OffscreenCanvas {
  const oc = offscreen as any
  const def = (k: string, v: unknown) =>
    Object.defineProperty(oc, k, { value: v, writable: true, configurable: true })
  const getr = (k: string, fn: () => unknown) =>
    Object.defineProperty(oc, k, { get: fn, configurable: true })
  const attributes: Record<string, unknown> = {}
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
  getr('clientWidth', () => oc.width)
  getr('clientHeight', () => oc.height)
  getr('offsetWidth', () => oc.width)
  getr('offsetHeight', () => oc.height)
  def('offsetLeft', 0)
  def('offsetTop', 0)
  getr('scrollWidth', () => oc.width)
  getr('scrollHeight', () => oc.height)
  def('setAttribute', (k: string, v: unknown) => {
    attributes[k] = v
  })
  def('getAttribute', (k: string) => (k in attributes ? attributes[k] : null))
  def('removeAttribute', (k: string) => {
    delete attributes[k]
  })
  def('hasAttribute', (k: string) => k in attributes)
  def('addEventListener', () => {})
  def('removeEventListener', () => {})
  def('dispatchEvent', () => true)
  def('getBoundingClientRect', () => ({
    x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0,
    width: oc.width, height: oc.height,
  }))
  def('remove', () => {})
  return offscreen
}

/** The factory the shim calls for every `document.createElement('canvas')`. Must
 *  return a DISTINCT surface each call (condition 5). */
export type CanvasFactory = () => OffscreenCanvas

/**
 * Install the worker DOM shim onto the worker global. Call BEFORE importing p5
 * (condition 1). `makeCanvasEl` mints a fresh wrapped `OffscreenCanvas` for each
 * `createElement('canvas')` (condition 5).
 *
 * Idempotent-ish: re-installing replaces the globals (a fresh worker normally
 * installs once).
 */
export function installWorkerDomShim(makeCanvasEl: CanvasFactory): {
  window: any
  document: any
} {
  const self = globalThis as any

  const doc: any = {
    nodeType: 9,
    createElement(tag: string) {
      // p5 creates several canvases (default P2D, user WEBGL, 1×1 helpers); each
      // must be its own surface — a canvas holds one context type (condition 5).
      if (String(tag).toLowerCase() === 'canvas') return makeCanvasEl()
      const el = makeElement(tag)
      el.ownerDocument = doc
      return el
    },
    createElementNS(_ns: string, tag: string) {
      return this.createElement(tag)
    },
    createTextNode: (t: string) => ({ nodeType: 3, textContent: t }),
    getElementById() {
      return null
    },
    getElementsByTagName(t: string) {
      // p5 does getElementsByTagName('main')[0].appendChild(canvas) — walk the
      // fake tree built via appendChild so [0] is defined (condition 4).
      const out: any[] = []
      const TAG = String(t).toUpperCase()
      collectByTag(doc.body, TAG, out)
      return out
    },
    querySelector() {
      return null
    },
    querySelectorAll() {
      return []
    },
    addEventListener() {},
    removeEventListener() {},
    hasFocus: () => true,
    elementFromPoint: () => null,
  }
  const body = makeElement('body')
  const docEl = makeElement('html')
  body.ownerDocument = doc
  docEl.ownerDocument = doc
  // p5 v2 initialises an i18next FES at `import('p5')`, whose browser
  // language-detector reads `document.documentElement.lang` (htmlTag detector) —
  // a real <html> has one; without it the detector hits `.substring` on undefined
  // and the whole p5 import throws. Provide a sane lang (both property + attr).
  docEl.lang = 'en-US'
  docEl.setAttribute('lang', 'en-US')
  doc.body = body
  doc.documentElement = docEl
  doc.head = makeElement('head')
  doc.readyState = 'complete'
  // The same i18next detector reads `document.cookie` (cookie detector). A worker
  // has no cookies — an empty string keeps the detector's split/parse safe.
  doc.cookie = ''

  // Build a FULL location — p5 v2's i18next FES language-detector runs the
  // `querystring` detector FIRST: `window.location.search.substring(1)`. A bare
  // `{ href }` leaves `.search` undefined → `.substring` throws → p5 import dies.
  // Mirror the worker's own `self.location` fields (which include search/hash).
  const loc = (self.location as Partial<Location>) || ({} as Partial<Location>)
  const location = {
    href: loc.href ?? 'about:blank',
    search: loc.search ?? '',
    hash: loc.hash ?? '',
    pathname: loc.pathname ?? '/',
    host: loc.host ?? '',
    hostname: loc.hostname ?? '',
    port: loc.port ?? '',
    protocol: loc.protocol ?? 'https:',
    origin: loc.origin ?? 'null',
  }

  const win: any = {
    document: doc,
    devicePixelRatio: 1,
    innerWidth: 800,
    innerHeight: 600,
    screen: { width: 800, height: 600 },
    location,
    navigator: self.navigator,
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame:
      self.requestAnimationFrame?.bind(self) ||
      ((cb: (t: number) => void) => setTimeout(() => cb(performance.now()), 16)),
    cancelAnimationFrame:
      self.cancelAnimationFrame?.bind(self) || ((id: number) => clearTimeout(id)),
    getComputedStyle: () => makeStyle(),
    matchMedia: () => ({ matches: false, addListener() {}, removeListener() {} }),
    performance: self.performance,
    setTimeout: self.setTimeout.bind(self),
    clearTimeout: self.clearTimeout.bind(self),
  }
  // Anything p5 reads off `window` that we didn't enumerate falls through to the
  // worker global (e.g. TextEncoder, URL) — a recording Proxy in the spike
  // proved the enumerated set is sufficient; this fall-through is belt-and-braces.
  const winProxy = new Proxy(win, {
    get(t, p) {
      if (p in t) {
        const v = (t as any)[p]
        return typeof v === 'function' ? v.bind(t) : v
      }
      if (p in self) {
        const v = self[p]
        return typeof v === 'function' ? v.bind(self) : v
      }
      return undefined
    },
  })

  self.window = winProxy
  self.document = doc
  self.screen = win.screen
  // p5's `createGraphics()` and p5.Element resize/cleanup test `x instanceof
  // HTMLCanvasElement` (rendering-CC8JNTwG.js:21561, dom/p5.Element.js:957,
  // dom/dom.js:361). The worker has no such global, so the bare identifier raises
  // a ReferenceError in setup() — every createGraphics()/readback sketch renders
  // BLANK with no signal while the viz.worker gauge still lights (#308 / PV94).
  // Define it so the identifier resolves AND matches our canvases: every surface
  // the shim mints is a REAL OffscreenCanvas (wrapCanvas augments, never replaces),
  // so `instanceof OffscreenCanvas` is the exact predicate — and `undefined
  // instanceof` → false, so createGraphics's no-renderer branch still falls through
  // to P2D. A custom Symbol.hasInstance leaves the native OffscreenCanvas binding
  // untouched, so WebGL's own `instanceof OffscreenCanvas` stays true (P102).
  if (typeof self.HTMLCanvasElement === 'undefined') {
    self.HTMLCanvasElement = class HTMLCanvasElement {
      static [Symbol.hasInstance](x: unknown): boolean {
        return typeof OffscreenCanvas !== 'undefined' && x instanceof OffscreenCanvas
      }
    }
  }
  if (!('devicePixelRatio' in self)) self.devicePixelRatio = 1
  // Worker rAF shim (condition 2) — both bare `requestAnimationFrame` and
  // `window.requestAnimationFrame` must resolve so p5's loop ticks (~60fps).
  if (typeof self.requestAnimationFrame !== 'function') {
    self.requestAnimationFrame = (cb: (t: number) => void) =>
      setTimeout(() => cb(performance.now()), 16)
    self.cancelAnimationFrame = (id: number) => clearTimeout(id)
  }

  return { window: winProxy, document: doc }
}

/**
 * Install the worker shim hydra-synth needs (Phase B / B-5). Hydra is the Tier-1
 * "accepts a canvas explicitly" renderer (B.1 thesis) — `new Hydra({ canvas })`
 * skips p5's createElement/appendChild/multi-canvas dance, so it needs only the
 * 2-condition subset the Q3 spike grounded (`public/spike/hydra-worker.js`):
 *   1. SHIM BEFORE IMPORT — hydra touches `window` at module-eval (`mouseListen`
 *      adds a `mousemove` listener, hydra-synth.js:3926), so the shim must precede
 *      `import('hydra-synth')`. Unlike p5, `window` is ALIASED to the worker global
 *      (`self.window = self`) — hydra reads `window.innerWidth`/`addEventListener`/
 *      `URL`/`navigator`, all of which then resolve to the worker's own globals.
 *   2. thin document + size — only the createElement/body/head paths hydra might
 *      touch (the canvas path is skipped because we pass an explicit OffscreenCanvas).
 *
 * Distinct from `installWorkerDomShim` (p5's 6-part superset): hydra's needs are a
 * strict subset AND it wants `window === self`, where p5 wants a separate window
 * object. One worker hosts ONE renderer kind (B-3/B-5), so only one shim installs.
 *
 * REF: PV70 (worker-render feasibility), packages/app/public/spike/hydra-worker.js
 *      (the grounded Q3 POC), HydraVizRenderer.initHydra (the main-thread contract).
 */
export function installWorkerHydraShim(size: { w: number; h: number }): void {
  const self = globalThis as any
  const W = size.w
  const H = size.h

  // window === self: hydra reads window.* expecting the global (it does global
  // writes via window in some paths) — aliasing keeps those consistent.
  self.window = self
  if (typeof self.requestAnimationFrame !== 'function') {
    self.requestAnimationFrame = (cb: (t: number) => void) =>
      setTimeout(() => cb(performance.now()), 16)
    self.cancelAnimationFrame = (id: number) => clearTimeout(id)
  }
  if (!('innerWidth' in self)) self.innerWidth = W
  if (!('innerHeight' in self)) self.innerHeight = H
  if (!('devicePixelRatio' in self)) self.devicePixelRatio = 1

  const noopEl = (): any => ({
    style: {},
    appendChild: () => {},
    removeChild: () => {},
    remove: () => {},
    setAttribute: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  })
  self.document = {
    createElement: (tag: string) =>
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
