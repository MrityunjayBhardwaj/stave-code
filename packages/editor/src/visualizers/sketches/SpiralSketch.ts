/**
 * Port of Strudel's spiral.mjs to p5.js.
 * Each hap is drawn as an arc segment on an Archimedean spiral.
 * Active haps use the accent color; past haps fade out.
 */
import type { RefObject } from 'react'
import type p5 from 'p5'
import type { HapStream } from '../../engine/HapStream'
import type { PatternScheduler } from '../types'

const BG = '#090912'
const ACTIVE_COLOR = '#75baff'
const INACTIVE_COLOR = '#8a919966'
const PLAYHEAD_COLOR = '#ffffff'

// Archimedean spiral: returns canvas [x, y] for a given rotation count + angle
function xyOnSpiral(
  rotations: number, margin: number, cx: number, cy: number, rotate: number
): [number, number] {
  const angle = ((rotations + rotate) * 360 - 90) * (Math.PI / 180)
  return [cx + Math.cos(angle) * margin * rotations, cy + Math.sin(angle) * margin * rotations]
}

export function SpiralSketch(
  _hapStreamRef: RefObject<HapStream | null>,
  _analyserRef: RefObject<AnalyserNode | null>,
  schedulerRef: RefObject<PatternScheduler | null>
): (p: p5) => void {
  return (p: p5) => {
    p.setup = () => {
      p.createCanvas(300, 200)
      p.pixelDensity(window.devicePixelRatio || 1)
      p.noFill()
    }

    p.draw = () => {
      const W = p.width
      const H = p.height
      p.background(BG)

      const scheduler = schedulerRef.current
      if (!scheduler) return

      let now: number
      try { now = scheduler.now() } catch { return }

      // Show 2 cycles behind, 1 cycle ahead
      const lookbehind = 2
      const lookahead = 1
      let haps: any[]
      try { haps = scheduler.query(now - lookbehind, now + lookahead) } catch { return }

      const cx = W / 2
      const cy = H / 2
      const size = Math.min(W, H) * 0.38
      const margin = size / 3
      const inset = 3
      const rotate = now // spiral rotates with time

      // Draw each hap as a spiral arc segment (mirrors Strudel's spiralSegment)
      for (const hap of haps) {
        const hapBegin = Number(hap.whole?.begin ?? 0)
        const hapEnd = Number(hap.endClipped ?? hap.whole?.end ?? hapBegin + 0.25)
        const isActive = hapBegin <= now && hapEnd > now
        const from = hapBegin - now + inset
        const to = hapEnd - now + inset - 0.005
        const opacity = Math.max(0, 1 - Math.abs((hapBegin - now) / lookbehind))

        const hapColor = hap.value?.color ?? (isActive ? ACTIVE_COLOR : INACTIVE_COLOR)

        // Parse color for p5 fill/stroke
        const col = p.color(hapColor)
        ;(col as any).setAlpha(opacity * 255)

        p.stroke(col)
        p.strokeWeight(margin / 2)
        p.strokeCap('round')

        p.beginShape()
        const inc = 1 / 60
        let angle = from
        while (angle <= to) {
          const [x, y] = xyOnSpiral(angle, margin, cx, cy, rotate)
          p.vertex(x, y)
          angle += inc
        }
        p.endShape()
      }

      // Playhead arc segment
      p.stroke(PLAYHEAD_COLOR)
      p.strokeWeight(margin / 2)
      p.strokeCap('round')
      p.beginShape()
      let angle = inset - 0.02
      while (angle <= inset) {
        const [x, y] = xyOnSpiral(angle, margin, cx, cy, rotate)
        p.vertex(x, y)
        angle += 1 / 60
      }
      p.endShape()
    }
  }
}
