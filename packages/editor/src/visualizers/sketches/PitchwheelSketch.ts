/**
 * Port of Strudel's pitchwheel.mjs to p5.js.
 * Active notes are placed on a circle by frequency angle (mod octave).
 * Lines connect center to each note (flake mode).
 */
import type { RefObject } from 'react'
import type p5 from 'p5'
import type { HapStream } from '../../engine/HapStream'
import type { PatternScheduler } from '../types'
import type { NormalizedHap } from '../../engine/NormalizedHap'
import { noteToMidi } from '../../engine/noteToMidi'

const BG = '#090912'
const BASE_COLOR = '#75baff'
// MIDI 36 = C2, used as the root for freq2angle
const ROOT_FREQ = 440 * Math.pow(2, (36 - 69) / 12)
const EDO = 12

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

function getFreq(hap: NormalizedHap): number | null {
  if (hap.freq !== null) return hap.freq
  const midi = typeof hap.note === 'number' ? hap.note : noteToMidi(String(hap.note ?? ''))
  return midi !== null ? midiToFreq(midi) : null
}

function freq2angle(freq: number, root: number): number {
  return 0.5 - (Math.log2(freq / root) % 1)
}

function circlePos(cx: number, cy: number, radius: number, angle: number): [number, number] {
  const a = angle * Math.PI * 2
  return [Math.sin(a) * radius + cx, Math.cos(a) * radius + cy]
}

export function PitchwheelSketch(
  _hapStreamRef: RefObject<HapStream | null>,
  _analyserRef: RefObject<AnalyserNode | null>,
  schedulerRef: RefObject<PatternScheduler | null>
): (p: p5) => void {
  return (p: p5) => {
    p.setup = () => {
      p.createCanvas(300, 200)
      p.pixelDensity(window.devicePixelRatio || 1)
    }

    p.draw = () => {
      const W = p.width
      const H = p.height
      p.background(BG)

      const scheduler = schedulerRef.current
      if (!scheduler) return

      let now: number
      try { now = scheduler.now() } catch { return }

      let haps: NormalizedHap[]
      try { haps = scheduler.query(now - 0.01, now + 0.01) } catch { return }
      // Only draw currently active haps
      haps = haps.filter(h => h.begin <= now && h.endClipped > now)

      const size = Math.min(W, H)
      const hapRadius = 6
      const thickness = 2
      const margin = 12
      const radius = size / 2 - thickness / 2 - hapRadius - margin
      const cx = W / 2
      const cy = H / 2

      // Draw EDO reference dots
      p.noStroke()
      p.fill(BASE_COLOR + '40')
      for (let i = 0; i < EDO; i++) {
        const angle = freq2angle(ROOT_FREQ * Math.pow(2, i / EDO), ROOT_FREQ)
        const [x, y] = circlePos(cx, cy, radius, angle)
        p.circle(x, y, hapRadius * 1.2)
      }

      // Draw reference circle
      p.noFill()
      p.stroke(BASE_COLOR + '30')
      p.strokeWeight(1)
      p.circle(cx, cy, radius * 2)

      // Draw each active hap
      for (const hap of haps) {
        const freq = getFreq(hap)
        if (freq === null) continue

        const angle = freq2angle(freq, ROOT_FREQ)
        const [x, y] = circlePos(cx, cy, radius, angle)
        const color = hap.color ?? BASE_COLOR
        const alpha = Math.min(1, hap.gain * hap.velocity)

        // Line from center to note
        p.stroke(color)
        p.strokeWeight(thickness)
        ;(p.drawingContext as CanvasRenderingContext2D).globalAlpha = alpha
        p.line(cx, cy, x, y)

        // Filled circle at note position
        p.fill(color)
        p.noStroke()
        p.circle(x, y, hapRadius * 2)
      }
      ;(p.drawingContext as CanvasRenderingContext2D).globalAlpha = 1
    }
  }
}
