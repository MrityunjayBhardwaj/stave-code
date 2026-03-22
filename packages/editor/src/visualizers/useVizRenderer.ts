import { useRef, useEffect } from 'react'
import type { RefObject } from 'react'
import type { HapStream } from '../engine/HapStream'
import type { VizRendererSource, VizRefs, PatternScheduler } from './types'
import { mountVizRenderer } from './mountVizRenderer'

/**
 * Renderer-agnostic hook replacing useP5Sketch.
 * Stabilizes VizRefs via refs updated each render (same pattern as useP5Sketch).
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
  const hapStreamRef = useRef<HapStream | null>(null)
  const analyserRef  = useRef<AnalyserNode | null>(null)
  const schedulerRef = useRef<PatternScheduler | null>(null)

  hapStreamRef.current  = hapStream
  analyserRef.current   = analyser
  schedulerRef.current  = scheduler

  useEffect(() => {
    if (!containerRef.current) return

    const refs: VizRefs = { hapStreamRef, analyserRef, schedulerRef }
    const size = {
      w: containerRef.current.clientWidth || 400,
      h: containerRef.current.clientHeight || 200,
    }

    const { renderer, disconnect } = mountVizRenderer(
      containerRef.current, source, refs, size, console.error
    )

    return () => {
      disconnect()
      renderer.destroy()
    }
  }, [source]) // same dep logic as useP5Sketch had [sketchFactory]
}
