import { describe, it, expect, vi, beforeEach } from 'vitest'

// Choke-point guard (#260 / PV74): the picker/backdrop/crop seam must route its
// mandatory per-mount concerns through attachVizLifecycle, not wire mount +
// visibility itself. Mock attachVizLifecycle (so this test doesn't need a real
// IntersectionObserver) and assert mountVizRenderer calls it. jsdom has no
// ResizeObserver either — stub a no-op so the (divergent, seam-local) resize
// wiring doesn't throw.
const detach = vi.fn()
const attachVizLifecycle = vi.fn(() => detach)
vi.mock('../visualizers/attachVizLifecycle', () => ({
  attachVizLifecycle: (...args: unknown[]) =>
    (attachVizLifecycle as unknown as (...a: unknown[]) => unknown)(...args),
}))

class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

import { mountVizRenderer } from '../visualizers/mountVizRenderer'

function fakeRenderer() {
  return {
    mount: vi.fn(),
    update: vi.fn(),
    resize: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    destroy: vi.fn(),
  }
}

describe('mountVizRenderer — routes through attachVizLifecycle (#260 choke point)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).ResizeObserver = NoopResizeObserver
  })

  const container = document.createElement('div')
  const components = {}
  const size = { w: 400, h: 300 }
  const onError = vi.fn()

  it('runs mount + visibility via attachVizLifecycle (not its own wiring)', () => {
    const r = fakeRenderer()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { renderer, disconnect } = mountVizRenderer(container, r as any, components, size, onError)

    expect(renderer).toBe(r)
    expect(attachVizLifecycle).toHaveBeenCalledTimes(1)
    const call = (attachVizLifecycle as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe(r) // renderer
    expect(call[1]).toBe(container) // container
    expect(call[4]).toBe(onError) // onError
    // No onMountError opt — a mount throw must propagate on this seam.
    expect(call[5]?.onMountError).toBeUndefined()

    // disconnect tears down the lifecycle detach (visibility) too.
    disconnect()
    expect(detach).toHaveBeenCalledTimes(1)
  })

  it('resolves a factory source before attaching', () => {
    const r = fakeRenderer()
    const factory = vi.fn(() => r)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { renderer } = mountVizRenderer(container, factory as any, components, size, onError)
    expect(factory).toHaveBeenCalledTimes(1)
    expect(renderer).toBe(r)
    expect((attachVizLifecycle as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(r)
  })
})
