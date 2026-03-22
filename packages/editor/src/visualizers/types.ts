import type { RefObject } from 'react'
import type p5 from 'p5'
import type { HapStream } from '../engine/HapStream'

export type SketchFactory = (
  hapStreamRef: RefObject<HapStream | null>,
  analyserRef: RefObject<AnalyserNode | null>
) => (p: p5) => void

export type VizMode = 'pianoroll' | 'scope' | 'spectrum' | 'spiral' | 'pitchwheel'
