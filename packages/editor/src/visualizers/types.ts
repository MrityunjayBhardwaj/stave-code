import type { RefObject } from 'react'
import type p5 from 'p5'
import type { HapStream } from '../engine/HapStream'

/**
 * Thin wrapper around the Strudel scheduler exposed to sketches.
 * `now()` returns the current playback position in cycles.
 * `query()` returns all haps overlapping the given cycle range.
 */
export interface PatternScheduler {
  now(): number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(begin: number, end: number): any[]
}

export type SketchFactory = (
  hapStreamRef: RefObject<HapStream | null>,
  analyserRef: RefObject<AnalyserNode | null>,
  schedulerRef: RefObject<PatternScheduler | null>
) => (p: p5) => void

export type VizMode = 'pianoroll' | 'scope' | 'fscope' | 'spectrum' | 'spiral' | 'pitchwheel' | 'wordfall'
