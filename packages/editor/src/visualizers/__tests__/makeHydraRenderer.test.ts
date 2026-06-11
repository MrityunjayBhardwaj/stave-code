/**
 * makeHydraRenderer gating (B-5 #250) — WHICH renderer is built for a USER `.hydra`
 * sketch, given the flag, the registered worker factory, and browser capabilities.
 * Mirrors makeP5Renderer.test.ts. The live worker RENDER is observed e2e; this
 * locks the SELECTION contract so a regression can't force everything on/off the
 * worker path.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// makeHydraRenderer pulls `shouldUseWorkerRenderer` from makeP5Renderer, which
// statically imports P5VizRenderer → `p5` → `gifenc` (CJS the vitest ESM loader
// can't link in jsdom — the documented editor constraint). Mock both; the hydra
// factory's construction path never touches p5/gifenc.
vi.mock('p5', () => ({ default: class MockP5 {} }))
vi.mock('gifenc', () => ({
  GIFEncoder: class {},
  quantize: () => [],
  nearestColorIndex: () => 0,
}))

import { makeHydraRenderer } from '../renderers/makeHydraRenderer'
import { HydraVizRenderer } from '../renderers/HydraVizRenderer'
import { FallbackVizRenderer } from '../renderers/FallbackVizRenderer'
import { setVizWorkerFactory } from '../vizWorkerFactory'
import { getVizConfig, setVizConfig } from '../vizConfig'

const CODE = 'osc(10, 0.1, 0).out()'

/** Stub the globals `detectWorkerVizCapabilities` reads so it reports a
 *  worker-capable (non-'main-thread') environment in jsdom. */
function stubCapableGlobals(): void {
  vi.stubGlobal('OffscreenCanvas', class {})
  vi.stubGlobal('Worker', class {})
  vi.stubGlobal('HTMLCanvasElement', {
    prototype: { transferControlToOffscreen: () => {} },
  })
}

describe('makeHydraRenderer — worker-vs-main selection', () => {
  const savedConfig = { ...getVizConfig() }

  beforeEach(() => {
    setVizWorkerFactory(null)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    setVizWorkerFactory(null)
    setVizConfig(savedConfig)
  })

  it('flag OFF → main-thread HydraVizRenderer (even if capable + factory present)', () => {
    stubCapableGlobals()
    setVizWorkerFactory(() => ({}) as unknown as Worker)
    setVizConfig({ ...getVizConfig(), workerRenderer: false })
    expect(makeHydraRenderer(CODE, 'x')).toBeInstanceOf(HydraVizRenderer)
  })

  it('flag ON but NO worker factory registered → HydraVizRenderer fallback', () => {
    stubCapableGlobals()
    setVizWorkerFactory(null)
    setVizConfig({ ...getVizConfig(), workerRenderer: true })
    expect(makeHydraRenderer(CODE, 'x')).toBeInstanceOf(HydraVizRenderer)
  })

  it('flag ON + factory but NOT worker-capable (no OffscreenCanvas) → HydraVizRenderer', () => {
    // no stubCapableGlobals → jsdom lacks OffscreenCanvas → transport main-thread
    setVizWorkerFactory(() => ({}) as unknown as Worker)
    setVizConfig({ ...getVizConfig(), workerRenderer: true })
    expect(makeHydraRenderer(CODE, 'x')).toBeInstanceOf(HydraVizRenderer)
  })

  it('flag ON + factory + worker-capable → FallbackVizRenderer (wraps the worker, #247)', () => {
    stubCapableGlobals()
    setVizWorkerFactory(() => ({}) as unknown as Worker)
    setVizConfig({ ...getVizConfig(), workerRenderer: true })
    expect(makeHydraRenderer(CODE, 'x')).toBeInstanceOf(FallbackVizRenderer)
  })
})
