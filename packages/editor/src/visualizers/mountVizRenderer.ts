import type { EngineComponents } from '../engine/LiveCodingEngine'
import type { VizRenderer, VizRendererSource } from './types'
import { registerVizVisibility } from './vizVisibility'

/**
 * Shared imperative utility that creates/resolves a VizRenderer, calls mount(),
 * and wires a ResizeObserver + visibility pausing. Used by both useVizRenderer
 * (React hook) and viewZones.ts (imperative) — so inline, backdrop, and picker
 * all get off-screen/collapsed/background-tab pausing (Phase C, #258) from one
 * place.
 *
 * Returns the renderer instance and a disconnect function that tears down BOTH
 * the ResizeObserver and the visibility registration.
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

  // Pause the renderer while the container is off-screen/collapsed or the tab is
  // hidden (Phase C, #258). The renderer's pause()/resume() do the real work
  // (WorkerVizRenderer also stops the main sample()+post rAF).
  const unregisterVisibility = registerVizVisibility(renderer, container)

  return {
    renderer,
    disconnect: () => {
      ro.disconnect()
      unregisterVisibility()
    },
  }
}
