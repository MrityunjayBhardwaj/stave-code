import { describe, it, expect, vi, beforeEach } from 'vitest'
import { attachVizLifecycle } from '../visualizers/attachVizLifecycle'

// Mock the visibility wiring so we can assert it's invoked + its unregister is
// returned, without standing up an IntersectionObserver (jsdom has none anyway).
const unregister = vi.fn()
const registerVizVisibility = vi.fn(() => unregister)
vi.mock('../visualizers/vizVisibility', () => ({
  registerVizVisibility: (...args: unknown[]) =>
    (registerVizVisibility as unknown as (...a: unknown[]) => unknown)(...args),
}))

function fakeRenderer(mount: () => void = () => {}) {
  return {
    mount: vi.fn(mount),
    update: vi.fn(),
    resize: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    destroy: vi.fn(),
  }
}

describe('attachVizLifecycle — the #260 per-mount choke point', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const container = document.createElement('div')
  const components = {}
  const size = { w: 400, h: 300 }
  const onError = vi.fn()

  it('runs the two mandatory per-mount concerns: mount() then registerVizVisibility()', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = fakeRenderer() as any
    const detach = attachVizLifecycle(r, container, components, size, onError)

    expect(r.mount).toHaveBeenCalledWith(container, components, size, onError)
    expect(registerVizVisibility).toHaveBeenCalledWith(r, container, undefined)
    // detach is the visibility unregister — NOT renderer.destroy (caller owns it).
    detach()
    expect(unregister).toHaveBeenCalledTimes(1)
    expect(r.destroy).not.toHaveBeenCalled()
  })

  it('forwards teardownMs to registerVizVisibility (inline #263 path)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = fakeRenderer() as any
    attachVizLifecycle(r, container, components, size, onError, { teardownMs: 1500 })
    expect(registerVizVisibility).toHaveBeenCalledWith(r, container, { teardownMs: 1500 })
  })

  it('onMountError swallows a mount throw AND still wires visibility (inline semantics)', () => {
    const boom = new Error('mount boom')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = fakeRenderer(() => { throw boom }) as any
    const onMountError = vi.fn()

    expect(() =>
      attachVizLifecycle(r, container, components, size, onError, { onMountError }),
    ).not.toThrow()
    expect(onMountError).toHaveBeenCalledWith(boom)
    // visibility STILL wired after a swallowed mount error (prior inline behaviour).
    expect(registerVizVisibility).toHaveBeenCalled()
  })

  it('without onMountError, a mount throw propagates and visibility is NOT wired (mountVizRenderer semantics)', () => {
    const boom = new Error('mount boom')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = fakeRenderer(() => { throw boom }) as any

    expect(() => attachVizLifecycle(r, container, components, size, onError)).toThrow(boom)
    expect(registerVizVisibility).not.toHaveBeenCalled()
  })
})
