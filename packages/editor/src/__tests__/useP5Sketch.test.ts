import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { useP5Sketch } from '../visualizers/useP5Sketch'

// vi.mock is hoisted — cannot reference variables declared below vi.mock.
// Use a module-level spy holder pattern instead.
const p5Instances: { remove: ReturnType<typeof vi.fn>; resizeCanvas: ReturnType<typeof vi.fn> }[] =
  []

vi.mock('p5', () => {
  const P5 = vi.fn(function (this: { remove: ReturnType<typeof vi.fn>; resizeCanvas: ReturnType<typeof vi.fn> }) {
    this.remove = vi.fn()
    this.resizeCanvas = vi.fn()
    p5Instances.push(this)
  })
  return { default: P5 }
})

// Import after mock is registered
import p5 from 'p5'
const MockP5Constructor = p5 as unknown as ReturnType<typeof vi.fn>

// Mock ResizeObserver
const mockDisconnect = vi.fn()
const mockObserve = vi.fn()

class MockResizeObserver {
  constructor(_cb: ResizeObserverCallback) {}
  observe = mockObserve
  disconnect = mockDisconnect
  unobserve = vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  p5Instances.length = 0
  ;(globalThis as unknown as Record<string, unknown>).ResizeObserver = MockResizeObserver
})

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>).ResizeObserver
})

// A simple sketch factory for testing
const fakeSketchFactory = vi.fn(() => vi.fn())

function renderUseP5Sketch() {
  const containerElement = document.createElement('div')
  return renderHook(() => {
    const containerRef = useRef<HTMLDivElement | null>(containerElement)
    useP5Sketch(containerRef, fakeSketchFactory, null, null)
  })
}

describe('useP5Sketch', () => {
  it('creates a p5 instance on mount', () => {
    renderUseP5Sketch()
    expect(MockP5Constructor).toHaveBeenCalledTimes(1)
  })

  it('passes the sketch function and container element to p5 constructor', () => {
    renderUseP5Sketch()
    const [sketchArg, containerArg] = MockP5Constructor.mock.calls[0]
    expect(typeof sketchArg).toBe('function')
    expect(containerArg).toBeInstanceOf(HTMLDivElement)
  })

  it('calls instance.remove() on unmount', () => {
    const { unmount } = renderUseP5Sketch()
    expect(p5Instances[0].remove).not.toHaveBeenCalled()
    unmount()
    expect(p5Instances[0].remove).toHaveBeenCalledTimes(1)
  })

  it('creates a ResizeObserver that observes the container', () => {
    renderUseP5Sketch()
    expect(mockObserve).toHaveBeenCalledTimes(1)
    expect(mockObserve.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement)
  })

  it('calls ResizeObserver.disconnect() on cleanup', () => {
    const { unmount } = renderUseP5Sketch()
    unmount()
    expect(mockDisconnect).toHaveBeenCalledTimes(1)
  })

  it('calls disconnect before remove on cleanup', () => {
    const callOrder: string[] = []

    const { unmount } = renderUseP5Sketch()

    // Intercept after instance is created
    const instance = p5Instances[0]
    const origRemove = instance.remove
    instance.remove = vi.fn(() => {
      callOrder.push('remove')
      origRemove()
    })
    mockDisconnect.mockImplementation(() => callOrder.push('disconnect'))

    unmount()

    expect(callOrder).toEqual(['disconnect', 'remove'])
  })
})
