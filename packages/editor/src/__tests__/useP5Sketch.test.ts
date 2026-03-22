import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { useP5Sketch } from '../visualizers/useP5Sketch'

// Mock p5 constructor
const mockRemove = vi.fn()
const mockResizeCanvas = vi.fn()
const mockP5Instance = {
  remove: mockRemove,
  resizeCanvas: mockResizeCanvas,
}
const MockP5Constructor = vi.fn(() => mockP5Instance)
vi.mock('p5', () => ({ default: MockP5Constructor }))

// Mock ResizeObserver
const mockDisconnect = vi.fn()
const mockObserve = vi.fn()
let mockResizeObserverCallback: ResizeObserverCallback | null = null

class MockResizeObserver {
  constructor(cb: ResizeObserverCallback) {
    mockResizeObserverCallback = cb
  }
  observe = mockObserve
  disconnect = mockDisconnect
  unobserve = vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  mockResizeObserverCallback = null
  // Install mock ResizeObserver globally
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
    expect(mockRemove).not.toHaveBeenCalled()
    unmount()
    expect(mockRemove).toHaveBeenCalledTimes(1)
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
    mockDisconnect.mockImplementation(() => callOrder.push('disconnect'))
    mockRemove.mockImplementation(() => callOrder.push('remove'))

    const { unmount } = renderUseP5Sketch()
    unmount()

    expect(callOrder).toEqual(['disconnect', 'remove'])
  })
})
