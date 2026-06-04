/**
 * makeP5Renderer gating (B-3 #245) — WHICH renderer is built, given the flag, the
 * registered worker factory, and the browser capabilities. The actual worker
 * RENDER is observed live (b3-worker-observe.spec.ts); this locks the SELECTION
 * contract so a regression can't silently force everything onto (or off) the
 * worker path.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// P5VizRenderer statically imports `p5` → `gifenc` (a CJS module) which the
// vitest ESM loader can't link in jsdom (the documented editor constraint — see
// vizCompiler.test.ts). Mock both so we can import the renderer classes for the
// `instanceof` checks; makeP5Renderer's constructor path never touches p5.
vi.mock('p5', () => ({ default: class MockP5 {} }))
vi.mock('gifenc', () => ({
  GIFEncoder: class {},
  quantize: () => [],
  nearestColorIndex: () => 0,
}))

import { makeP5Renderer } from '../renderers/makeP5Renderer'
import { P5VizRenderer } from '../renderers/P5VizRenderer'
import { WorkerVizRenderer } from '../renderers/WorkerVizRenderer'
import { setVizWorkerFactory } from '../vizWorkerFactory'
import { getVizConfig, setVizConfig } from '../vizConfig'

const CODE = 'function setup(){} function draw(){}'

/** Stub the globals `detectWorkerVizCapabilities` reads so it reports a
 *  worker-capable (non-'main-thread') environment in jsdom. */
function stubCapableGlobals(): void {
  vi.stubGlobal('OffscreenCanvas', class {})
  vi.stubGlobal('Worker', class {})
  vi.stubGlobal('HTMLCanvasElement', {
    prototype: { transferControlToOffscreen: () => {} },
  })
}

describe('makeP5Renderer — worker-vs-main selection', () => {
  const savedConfig = { ...getVizConfig() }

  beforeEach(() => {
    setVizWorkerFactory(null)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    setVizWorkerFactory(null)
    setVizConfig(savedConfig)
  })

  it('flag OFF → main-thread P5VizRenderer (even if capable + factory present)', () => {
    stubCapableGlobals()
    setVizWorkerFactory(() => ({}) as unknown as Worker)
    setVizConfig({ ...getVizConfig(), workerRenderer: false })
    expect(makeP5Renderer(CODE, 'x')).toBeInstanceOf(P5VizRenderer)
  })

  it('flag ON but NO worker factory registered → P5VizRenderer fallback', () => {
    stubCapableGlobals()
    setVizWorkerFactory(null)
    setVizConfig({ ...getVizConfig(), workerRenderer: true })
    expect(makeP5Renderer(CODE, 'x')).toBeInstanceOf(P5VizRenderer)
  })

  it('flag ON + factory but NOT worker-capable (no OffscreenCanvas) → P5VizRenderer', () => {
    // no stubCapableGlobals → jsdom lacks OffscreenCanvas → transport main-thread
    setVizWorkerFactory(() => ({}) as unknown as Worker)
    setVizConfig({ ...getVizConfig(), workerRenderer: true })
    expect(makeP5Renderer(CODE, 'x')).toBeInstanceOf(P5VizRenderer)
  })

  it('flag ON + factory + worker-capable → WorkerVizRenderer', () => {
    stubCapableGlobals()
    setVizWorkerFactory(() => ({}) as unknown as Worker)
    setVizConfig({ ...getVizConfig(), workerRenderer: true })
    expect(makeP5Renderer(CODE, 'x')).toBeInstanceOf(WorkerVizRenderer)
  })
})
