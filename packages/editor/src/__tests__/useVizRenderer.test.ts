import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { useVizRenderer } from '../visualizers/useVizRenderer'
import type { VizRenderer } from '../visualizers/types'

// Mock mountVizRenderer so we control the renderer lifecycle in tests
const mockDisconnect = vi.fn()
const mockMount = vi.fn()
const mockDestroy = vi.fn()
const mockResize = vi.fn()

const mockRenderer: VizRenderer = {
  mount: mockMount,
  resize: mockResize,
  pause: vi.fn(),
  resume: vi.fn(),
  destroy: mockDestroy,
}

vi.mock('../visualizers/mountVizRenderer', () => ({
  mountVizRenderer: vi.fn(() => ({ renderer: mockRenderer, disconnect: mockDisconnect })),
}))

import { mountVizRenderer } from '../visualizers/mountVizRenderer'
const MockMountVizRenderer = mountVizRenderer as unknown as ReturnType<typeof vi.fn>

// Mock ResizeObserver
const mockObserve = vi.fn()

class MockResizeObserver {
  constructor(_cb: ResizeObserverCallback) {}
  observe = mockObserve
  disconnect = mockDisconnect
  unobserve = vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as unknown as Record<string, unknown>).ResizeObserver = MockResizeObserver
})

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>).ResizeObserver
})

const fakeSource = vi.fn(() => mockRenderer)

function renderUseVizRenderer() {
  const containerElement = document.createElement('div')
  return renderHook(() => {
    const containerRef = useRef<HTMLDivElement | null>(containerElement)
    useVizRenderer(containerRef, fakeSource, null, null, null)
  })
}

describe('useVizRenderer', () => {
  it('calls mountVizRenderer on mount', () => {
    renderUseVizRenderer()
    expect(MockMountVizRenderer).toHaveBeenCalledTimes(1)
  })

  it('passes the container element to mountVizRenderer', () => {
    renderUseVizRenderer()
    const [containerArg] = MockMountVizRenderer.mock.calls[0]
    expect(containerArg).toBeInstanceOf(HTMLDivElement)
  })

  it('calls renderer.destroy() on unmount', () => {
    const { unmount } = renderUseVizRenderer()
    expect(mockDestroy).not.toHaveBeenCalled()
    unmount()
    expect(mockDestroy).toHaveBeenCalledTimes(1)
  })

  it('calls disconnect() on unmount', () => {
    const { unmount } = renderUseVizRenderer()
    unmount()
    expect(mockDisconnect).toHaveBeenCalledTimes(1)
  })

  it('calls disconnect before destroy on cleanup', () => {
    const callOrder: string[] = []
    mockDisconnect.mockImplementation(() => callOrder.push('disconnect'))
    mockDestroy.mockImplementation(() => callOrder.push('destroy'))

    const { unmount } = renderUseVizRenderer()
    unmount()

    expect(callOrder).toEqual(['disconnect', 'destroy'])
  })
})
