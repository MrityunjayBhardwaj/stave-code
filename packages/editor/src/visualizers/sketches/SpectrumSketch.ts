/**
 * Port of Strudel's drawSpectrum to p5.js.
 * Scrolling waterfall spectrogram: each frame the canvas shifts left by `speed` pixels
 * and a new column is painted on the right using log-frequency mapping and
 * globalAlpha = normalized dB amplitude — matching Strudel's spectrum visualizer.
 */
import type { RefObject } from 'react'
import type p5 from 'p5'
import type { HapStream } from '../../engine/HapStream'
import type { PatternScheduler } from '../types'

const BG = '#090912'
const COLOR = '#75baff'
const MIN_DB = -80
const MAX_DB = 0
const SPEED = 2 // scroll pixels per frame

export function SpectrumSketch(
  _hapStreamRef: RefObject<HapStream | null>,
  analyserRef: RefObject<AnalyserNode | null>,
  _schedulerRef: RefObject<PatternScheduler | null>
): (p: p5) => void {
  return (p: p5) => {
    // pixelDensity(1) so getImageData coordinates match CSS pixels
    p.setup = () => {
      p.createCanvas(window.innerWidth, 200)
      p.pixelDensity(1)
      p.noStroke()
    }

    p.draw = () => {
      const W = p.width
      const H = p.height
      const ctx = p.drawingContext as CanvasRenderingContext2D

      const analyser = analyserRef.current
      if (!analyser) {
        p.background(BG)
        return
      }

      const bufferSize = analyser.frequencyBinCount
      const data = new Float32Array(bufferSize)
      analyser.getFloatFrequencyData(data)

      // Shift existing canvas content left by SPEED pixels
      const imageData = ctx.getImageData(0, 0, W, H)
      ctx.clearRect(0, 0, W, H)
      ctx.putImageData(imageData, -SPEED, 0)

      // Paint new column on the right edge
      const q = W - SPEED
      ctx.fillStyle = COLOR
      for (let i = 0; i < bufferSize; i++) {
        const normalized = Math.max(0, Math.min(1, (data[i] - MIN_DB) / (MAX_DB - MIN_DB)))
        if (normalized <= 0) continue
        ctx.globalAlpha = normalized
        // Logarithmic frequency → Y mapping (low freq at bottom, high at top)
        const yEnd = (Math.log(i + 1) / Math.log(bufferSize)) * H
        const yStart = i > 0 ? (Math.log(i) / Math.log(bufferSize)) * H : 0
        const barH = Math.max(2, yEnd - yStart)
        ctx.fillRect(q, H - yEnd, SPEED, barH)
      }
      ctx.globalAlpha = 1
    }
  }
}
