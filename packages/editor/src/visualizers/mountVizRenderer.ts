import type { EngineComponents } from '../engine/LiveCodingEngine'
import type { VizRenderer, VizRendererSource } from './types'

/**
 * Shared imperative utility that creates/resolves a VizRenderer, calls mount(),
 * and wires a ResizeObserver. Used by both useVizRenderer (React hook) and
 * viewZones.ts (imperative).
 *
 * Returns the renderer instance and a disconnect function for the ResizeObserver.
 */
export function mountVizRenderer(
  container: HTMLDivElement,
  source: VizRendererSource,
  components: Partial<EngineComponents>,
  size: { w: number; h: number },
  onError: (e: Error) => void
): { renderer: VizRenderer; disconnect: () => void } {
  const renderer = typeof source === 'function' ? (source as () => VizRenderer)() : source
  renderer.mount(container, components, size, onError)

  let lastW = size.w
  let lastH = size.h
  const ro = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0 && (Math.abs(width - lastW) > 1 || Math.abs(height - lastH) > 1)) {
      lastW = width
      lastH = height
      renderer.resize(width, height)
    }
  })
  ro.observe(container)

  return {
    renderer,
    disconnect: () => ro.disconnect(),
  }
}
