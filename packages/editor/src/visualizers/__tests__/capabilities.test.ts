/**
 * Worker-viz capability detection (Phase B / B-1 #239).
 *
 * Pure environment-injectable selector — plain-object assertions across the
 * capability matrix, no DOM/worker needed.
 */
import { describe, it, expect } from 'vitest'
import {
  detectWorkerVizCapabilities,
  type CapabilityEnv,
} from '../worker/capabilities'

// A fully-capable, cross-origin-isolated environment (the live `performance` app).
function isolatedEnv(): CapabilityEnv {
  return {
    crossOriginIsolated: true,
    OffscreenCanvas: function OffscreenCanvas() {},
    SharedArrayBuffer: function SharedArrayBuffer() {},
    Worker: function Worker() {},
    HTMLCanvasElement: {
      prototype: { transferControlToOffscreen: function () {} },
    },
  }
}

describe('detectWorkerVizCapabilities — transport selection', () => {
  it('isolated + all features → sab', () => {
    const caps = detectWorkerVizCapabilities(isolatedEnv())
    expect(caps.canUseWorker).toBe(true)
    expect(caps.crossOriginIsolated).toBe(true)
    expect(caps.transport).toBe('sab')
  })

  it('worker-capable but NOT isolated → postmessage (Safari / non-isolated)', () => {
    const env = isolatedEnv()
    env.crossOriginIsolated = false
    const caps = detectWorkerVizCapabilities(env)
    expect(caps.canUseWorker).toBe(true)
    expect(caps.transport).toBe('postmessage')
  })

  it('isolated but SharedArrayBuffer missing → postmessage (no SAB to zero-copy into)', () => {
    const env = isolatedEnv()
    delete env.SharedArrayBuffer
    const caps = detectWorkerVizCapabilities(env)
    expect(caps.hasSharedArrayBuffer).toBe(false)
    expect(caps.transport).toBe('postmessage')
  })

  it('no OffscreenCanvas → main-thread (cannot offload)', () => {
    const env = isolatedEnv()
    delete env.OffscreenCanvas
    const caps = detectWorkerVizCapabilities(env)
    expect(caps.canUseWorker).toBe(false)
    expect(caps.transport).toBe('main-thread')
  })

  it('no transferControlToOffscreen → main-thread', () => {
    const env = isolatedEnv()
    env.HTMLCanvasElement = { prototype: {} }
    const caps = detectWorkerVizCapabilities(env)
    expect(caps.canTransferControl).toBe(false)
    expect(caps.canUseWorker).toBe(false)
    expect(caps.transport).toBe('main-thread')
  })

  it('no Worker → main-thread', () => {
    const env = isolatedEnv()
    delete env.Worker
    const caps = detectWorkerVizCapabilities(env)
    expect(caps.hasWorker).toBe(false)
    expect(caps.canUseWorker).toBe(false)
    expect(caps.transport).toBe('main-thread')
  })

  it('empty environment → all false, main-thread (no throw)', () => {
    const caps = detectWorkerVizCapabilities({})
    expect(caps).toEqual({
      crossOriginIsolated: false,
      hasOffscreenCanvas: false,
      hasSharedArrayBuffer: false,
      canTransferControl: false,
      hasWorker: false,
      canUseWorker: false,
      transport: 'main-thread',
    })
  })

  it('crossOriginIsolated only truthy when strictly true', () => {
    const env = isolatedEnv()
    // a truthy-but-not-true value must not count as isolated
    ;(env as { crossOriginIsolated?: unknown }).crossOriginIsolated = 1
    const caps = detectWorkerVizCapabilities(env)
    expect(caps.crossOriginIsolated).toBe(false)
    expect(caps.transport).toBe('postmessage')
  })
})
