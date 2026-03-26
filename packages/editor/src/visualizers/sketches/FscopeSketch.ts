/**
 * Frequency scope with dual data paths:
 * 1. AnalyserNode available → live FFT bars (real audio frequency domain)
 * 2. PatternScheduler only → note frequency bars from events (per-track)
 */
import type { RefObject } from 'react'
import type p5 from 'p5'
import type { HapStream } from '../../engine/HapStream'
import type { PatternScheduler } from '../types'
import type { NormalizedHap } from '../../engine/NormalizedHap'

const BG = '#090912'
const COLOR = '#75baff'
const SCALE = 0.25
const POS = 0.75
const LEAN = 0.5
const MIN_DB = -100
const MAX_DB = 0

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

import { noteToMidi } from '../../engine/noteToMidi'

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

function resolveFreq(hap: NormalizedHap): number | null {
  if (hap.freq !== null) return hap.freq
  if (typeof hap.note === 'number') return midiToFreq(hap.note)
  if (typeof hap.note === 'string') {
    const midi = noteToMidi(hap.note)
    return midi !== null ? midiToFreq(midi) : null
  }
  return null
}

export function FscopeSketch(
  _hapStreamRef: RefObject<HapStream | null>,
  analyserRef: RefObject<AnalyserNode | null>,
  schedulerRef: RefObject<PatternScheduler | null>
): (p: p5) => void {
  return (p: p5) => {
    p.setup = () => {
      p.createCanvas(window.innerWidth, 200)
      p.pixelDensity(window.devicePixelRatio || 1)
      p.noStroke()
    }

    p.draw = () => {
      const W = p.width
      const H = p.height
      p.background(BG)

      // Baseline
      p.stroke(40, 50, 70)
      p.strokeWeight(0.5)
      p.noFill()
      p.line(0, POS * H, W, POS * H)
      p.noStroke()

      const analyser = analyserRef.current
      if (analyser) {
        // Path 1: Real FFT bars from AnalyserNode
        const bufferSize = analyser.frequencyBinCount
        const data = new Float32Array(bufferSize)
        analyser.getFloatFrequencyData(data)

        const sliceWidth = W / bufferSize
        p.fill(COLOR)

        for (let i = 0; i < bufferSize; i++) {
          const normalized = clamp((data[i] - MIN_DB) / (MAX_DB - MIN_DB), 0, 1)
          const v = normalized * SCALE
          const barH = v * H
          const barY = (POS - v * LEAN) * H
          p.rect(i * sliceWidth, barY, Math.max(sliceWidth, 1), barH)
        }
        return
      }

      // Path 2: Note frequency bars from PatternScheduler events
      const scheduler = schedulerRef.current
      if (!scheduler) return

      let now: number
      try { now = scheduler.now() } catch { return }

      let haps: NormalizedHap[]
      try { haps = scheduler.query(now - 0.2, now + 0.05) } catch { return }

      const MIN_FREQ = 30
      const MAX_FREQ = 4000
      const NUM_BINS = 64

      // Accumulate energy per frequency bin from active events
      const bins = new Float32Array(NUM_BINS)
      for (const hap of haps) {
        const freq = resolveFreq(hap)
        if (freq === null || freq < MIN_FREQ) continue

        const logPos = Math.log(freq / MIN_FREQ) / Math.log(MAX_FREQ / MIN_FREQ)
        const binIdx = clamp(Math.floor(logPos * NUM_BINS), 0, NUM_BINS - 1)
        const age = now - hap.begin
        const decay = Math.max(0, 1 - age / 0.5)
        bins[binIdx] = Math.max(bins[binIdx], decay * hap.gain)
      }

      const sliceWidth = W / NUM_BINS
      for (let i = 0; i < NUM_BINS; i++) {
        if (bins[i] <= 0) continue
        const v = bins[i] * SCALE
        const barH = v * H
        const barY = (POS - v * LEAN) * H
        const col = p.color(COLOR)
        ;(col as any).setAlpha(bins[i] * 220)
        p.fill(col)
        p.rect(i * sliceWidth, barY, Math.max(sliceWidth - 1, 1), barH)
      }
    }
  }
}
