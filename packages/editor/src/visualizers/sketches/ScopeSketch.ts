/**
 * Port of Strudel's drawTimeScope to p5.js.
 * Trigger-aligned oscilloscope: waveform snaps to rising zero-crossing for a stable picture.
 * pos=0.75, scale=0.25 mirrors Strudel's defaults.
 */
import type { RefObject } from 'react'
import type p5 from 'p5'
import type { HapStream } from '../../engine/HapStream'
import type { PatternScheduler } from '../types'

const BG = '#090912'
const LINE_COLOR = '#75baff'
const POS = 0.75   // waveform baseline as fraction of height
const SCALE = 0.25 // vertical amplitude scale

export function ScopeSketch(
  _hapStreamRef: RefObject<HapStream | null>,
  analyserRef: RefObject<AnalyserNode | null>,
  _schedulerRef: RefObject<PatternScheduler | null>
): (p: p5) => void {
  return (p: p5) => {
    p.setup = () => {
      p.createCanvas(window.innerWidth, 200)
      p.pixelDensity(window.devicePixelRatio || 1)
      p.noFill()
    }

    p.draw = () => {
      const W = p.width
      const H = p.height
      p.background(BG)

      // Always draw flat baseline
      p.stroke(40, 50, 70)
      p.strokeWeight(0.5)
      p.line(0, POS * H, W, POS * H)

      const analyser = analyserRef.current
      if (!analyser) return

      // Use frequencyBinCount samples (= fftSize / 2), matching Strudel
      const bufferSize = analyser.frequencyBinCount
      const data = new Float32Array(bufferSize)
      analyser.getFloatTimeDomainData(data)

      // Trigger alignment: find falling zero-crossing (prev > 0, curr <= 0)
      let triggerIndex = 0
      for (let i = 1; i < bufferSize; i++) {
        if (data[i - 1] > 0 && data[i] <= 0) {
          triggerIndex = i
          break
        }
      }

      const sliceWidth = W / (bufferSize - triggerIndex)

      p.stroke(LINE_COLOR)
      p.strokeWeight(2)
      p.strokeCap('round')
      p.beginShape()
      for (let i = triggerIndex; i < bufferSize; i++) {
        const x = (i - triggerIndex) * sliceWidth
        const y = (POS - SCALE * data[i]) * H
        p.vertex(x, y)
      }
      p.endShape()
    }
  }
}
