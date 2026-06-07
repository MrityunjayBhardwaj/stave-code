import type { EngineComponents } from '../engine/LiveCodingEngine'
import type { VizRenderer, VizRendererSource } from './types'
import { attachVizLifecycle } from './attachVizLifecycle'

/**
 * Shared imperative utility for the PICKER (`useVizRenderer`/`VizPanel`), BACKDROP
 * (`compiledVizProvider`) and CROP preview (`CropPopup`) seams: resolves a
 * VizRenderer, runs the shared per-mount lifecycle (mount + visibility pausing) via
 * `attachVizLifecycle`, and ADDS a ResizeObserver (this seam's container is sized
 * by CSS/layout, so a generic ResizeObserver is the right resize trigger here).
 *
 * NOT the inline `.viz()` path — `viewZones.ts` does its OWN mount (Monaco-layout
 * reflow, teardown-wrap, crop, decorations) and calls `attachVizLifecycle`
 * DIRECTLY. The single shared choke point for the mount+visibility concern-class
 * is `attachVizLifecycle`, NOT this function (P107: don't claim callers you don't
 * have — `viewZones` is not one).
 *
 * Returns the renderer instance and a disconnect function that tears down BOTH the
 * ResizeObserver and the visibility registration.
 */
export function mountVizRenderer(
  container: HTMLDivElement,
  source: VizRendererSource,
  components: Partial<EngineComponents>,
  size: { w: number; h: number },
  onError: (e: Error) => void
): { renderer: VizRenderer; disconnect: () => void } {
  const renderer = typeof source === 'function' ? (source as () => VizRenderer)() : source

  // Shared per-mount lifecycle: mount + visibility pausing (Phase C, #258). A
  // mount throw propagates (no onMountError) — this seam's callers expect it.
  const detachLifecycle = attachVizLifecycle(renderer, container, components, size, onError)

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
    disconnect: () => {
      ro.disconnect()
      detachLifecycle()
    },
  }
}
