/**
 * Spectrum visualizer with dual data paths:
 * 1. AnalyserNode available → scrolling waterfall spectrogram (real audio FFT)
 * 2. PatternScheduler only → frequency bars from active note events (per-track)
 *
 * The fallback makes spectrum work for ANY engine via BufferedScheduler.
 */
import type { RefObject } from 'react'
import type p5 from 'p5'
import type { HapStream } from '../../engine/HapStream'
import type { PatternScheduler } from '../types'
import type { NormalizedHap } from '../../engine/NormalizedHap'

const BG = '#090912'
const COLOR = '#75baff'
const MIN_DB = -80
const MAX_DB = 0
const SPEED = 2 // scroll pixels per frame

import { noteToMidi } from '../../engine/noteToMidi'

/** Convert MIDI note to frequency for bar positioning. */
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/** Resolve frequency from an IREvent's note/freq fields. */
function resolveFreq(hap: NormalizedHap): number | null {
  if (hap.freq !== null) return hap.freq
  if (typeof hap.note === 'number') return midiToFreq(hap.note)
  if (typeof hap.note === 'string') {
    const midi = noteToMidi(hap.note)
    return midi !== null ? midiToFreq(midi) : null
  }
  return null
}

export function SpectrumSketch(
  _hapStreamRef: RefObject<HapStream | null>,
  analyserRef: RefObject<AnalyserNode | null>,
  schedulerRef: RefObject<PatternScheduler | null>
): (p: p5) => void {
  return (p: p5) => {
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
      if (analyser) {
        // Path 1: Real FFT waterfall from AnalyserNode
        const bufferSize = analyser.frequencyBinCount
        const data = new Float32Array(bufferSize)
        analyser.getFloatFrequencyData(data)

        const imageData = ctx.getImageData(0, 0, W, H)
        ctx.clearRect(0, 0, W, H)
        ctx.putImageData(imageData, -SPEED, 0)

        const q = W - SPEED
        ctx.fillStyle = COLOR
        for (let i = 0; i < bufferSize; i++) {
          const normalized = Math.max(0, Math.min(1, (data[i] - MIN_DB) / (MAX_DB - MIN_DB)))
          if (normalized <= 0) continue
          ctx.globalAlpha = normalized
          const yEnd = (Math.log(i + 1) / Math.log(bufferSize)) * H
          const yStart = i > 0 ? (Math.log(i) / Math.log(bufferSize)) * H : 0
          const barH = Math.max(2, yEnd - yStart)
          ctx.fillRect(q, H - yEnd, SPEED, barH)
        }
        ctx.globalAlpha = 1
        return
      }

      // Path 2: Frequency bars from PatternScheduler events
      const scheduler = schedulerRef.current
      if (!scheduler) { p.background(BG); return }

      let now: number
      try { now = scheduler.now() } catch { p.background(BG); return }

      // Shift canvas left (scrolling effect)
      const imageData = ctx.getImageData(0, 0, W, H)
      ctx.clearRect(0, 0, W, H)
      ctx.putImageData(imageData, -SPEED, 0)

      // Get recently active events
      let haps: NormalizedHap[]
      try { haps = scheduler.query(now - 0.3, now + 0.05) } catch { return }

      const q = W - SPEED
      // Map note frequencies to Y positions (log scale, 20Hz-4000Hz range)
      const MIN_FREQ = 20
      const MAX_FREQ = 4000

      for (const hap of haps) {
        const freq = resolveFreq(hap)
        if (freq === null || freq < MIN_FREQ) continue

        const logPos = Math.log(freq / MIN_FREQ) / Math.log(MAX_FREQ / MIN_FREQ)
        const y = H - logPos * H
        const barH = Math.max(4, H * 0.03)
        const age = now - hap.begin
        const alpha = Math.max(0.1, 1 - age / 0.5) * hap.gain

        const col = p.color(hap.color ?? COLOR)
        ;(col as any).setAlpha(alpha * 220)
        ctx.fillStyle = col.toString()
        ctx.globalAlpha = 1
        ctx.fillRect(q, y - barH / 2, SPEED, barH)
      }
      ctx.globalAlpha = 1
    }
  }
}
