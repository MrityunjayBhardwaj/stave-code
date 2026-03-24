import { useRef, useEffect } from 'react'
import type { RefObject } from 'react'
import type { HapStream } from '../engine/HapStream'
import type { EngineComponents } from '../engine/LiveCodingEngine'
import type { VizRendererSource, VizRenderer, PatternScheduler } from './types'
import { mountVizRenderer } from './mountVizRenderer'

/**
 * Renderer-agnostic hook replacing useP5Sketch.
 * Accepts individual engine values (same external API as before) and internally
 * builds a Partial<EngineComponents> bag for VizRenderer.mount()/update().
 *
 * Live ref updates: P5VizRenderer stores refs as instance fields. This hook
 * calls renderer.update() each render so sketches see fresh values at draw time.
 *
 * IMPORTANT: `source` must be a stable reference (from useMemo, module-level constant,
 * or descriptor factory). An inline lambda creates a new ref each render, triggering
 * destroy/create on every render cycle.
 */
export function useVizRenderer(
  containerRef: RefObject<HTMLDivElement | null>,
  source: VizRendererSource,
  hapStream: HapStream | null,
  analyser: AnalyserNode | null,
  scheduler: PatternScheduler | null
): void {
  const rendererRef = useRef<VizRenderer | null>(null)

  // Build component bag from current values
  const components: Partial<EngineComponents> = {}
  if (hapStream) {
    components.streaming = { hapStream }
  }
  if (analyser) {
    components.audio = { analyser, audioCtx: analyser.context as AudioContext }
  }
  if (scheduler) {
    components.queryable = { scheduler, trackSchedulers: new Map() }
  }

  // Update live refs each render (no-ops if renderer not yet mounted)
  if (rendererRef.current) {
    rendererRef.current.update(components)
  }

  useEffect(() => {
    if (!containerRef.current) return

    const size = {
      w: containerRef.current.clientWidth || 400,
      h: containerRef.current.clientHeight || 200,
    }

    const { renderer, disconnect } = mountVizRenderer(
      containerRef.current, source, components, size, console.error
    )
    rendererRef.current = renderer

    return () => {
      disconnect()
      renderer.destroy()
      rendererRef.current = null
    }
  }, [source]) // same dep logic as useP5Sketch had [sketchFactory]
}
