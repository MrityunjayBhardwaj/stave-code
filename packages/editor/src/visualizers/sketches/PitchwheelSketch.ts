import type { RefObject } from 'react'
import type p5 from 'p5'
import type { HapStream } from '../../engine/HapStream'

export function PitchwheelSketch(
  _hapStreamRef: RefObject<HapStream | null>,
  _analyserRef: RefObject<AnalyserNode | null>
): (p: p5) => void {
  return (p: p5) => {
    p.setup = () => {
      p.createCanvas(300, 200)
      p.pixelDensity(window.devicePixelRatio || 1)
    }
    p.draw = () => {
      p.background('#090912')
    }
  }
}
