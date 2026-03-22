import { useRef, useEffect } from 'react'
import p5 from 'p5'
import type { RefObject } from 'react'
import type { HapStream } from '../engine/HapStream'
import type { SketchFactory, PatternScheduler } from './types'

export function useP5Sketch(
  containerRef: RefObject<HTMLDivElement | null>,
  sketchFactory: SketchFactory,
  hapStream: HapStream | null,
  analyser: AnalyserNode | null,
  scheduler: PatternScheduler | null
): void {
  const hapStreamRef = useRef<HapStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const schedulerRef = useRef<PatternScheduler | null>(null)

  hapStreamRef.current = hapStream
  analyserRef.current = analyser
  schedulerRef.current = scheduler

  useEffect(() => {
    if (!containerRef.current) return

    const sketch = sketchFactory(hapStreamRef, analyserRef, schedulerRef)
    const instance = new p5(sketch, containerRef.current)

    // ResizeObserver: keep p5 canvas in sync with container size
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          instance.resizeCanvas(width, height)
        }
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      instance.remove()
    }
  }, [sketchFactory])
}
