import React, { useRef } from 'react'
import type { HapStream } from '../engine/HapStream'
import { useVizRenderer } from './useVizRenderer'
import type { VizRendererSource, PatternScheduler } from './types'

interface VizPanelProps {
  vizHeight?: number | string
  hapStream: HapStream | null
  analyser: AnalyserNode | null
  scheduler: PatternScheduler | null
  source: VizRendererSource
}

export function VizPanel({ vizHeight = 200, hapStream, analyser, scheduler, source }: VizPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  useVizRenderer(containerRef, source, hapStream, analyser, scheduler)

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
