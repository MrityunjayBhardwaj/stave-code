import React, { useRef } from 'react'
import type { HapStream } from '../engine/HapStream'
import { useP5Sketch } from './useP5Sketch'
import type { SketchFactory, PatternScheduler } from './types'

interface VizPanelProps {
  vizHeight?: number | string
  hapStream: HapStream | null
  analyser: AnalyserNode | null
  scheduler: PatternScheduler | null
  sketchFactory: SketchFactory
}

export function VizPanel({ vizHeight = 200, hapStream, analyser, scheduler, sketchFactory }: VizPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  useP5Sketch(containerRef, sketchFactory, hapStream, analyser, scheduler)

  // Note: ResizeObserver + p.resizeCanvas(w, h) is handled INSIDE useP5Sketch (Plan 01).
  // VizPanel is purely declarative — it provides the container div, useP5Sketch manages the canvas lifecycle.

  return (
    <div
      ref={containerRef}
      data-testid="viz-panel"
      style={{
        height: vizHeight,
        background: 'var(--background)',
        borderTop: '1px solid var(--border)',
        overflow: 'hidden',
        position: 'relative',
        flexShrink: 0,
      }}
    />
  )
}
