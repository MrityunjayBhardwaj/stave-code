import type { RefObject } from 'react'
import type p5 from 'p5'
import type { HapStream } from '../../engine/HapStream'
import type { PatternScheduler } from '../types'
import { noteToMidi } from '../../engine/noteToMidi'

const CYCLES = 4      // total cycles visible
const PLAYHEAD = 0.5  // 0..1 — position of "now" line on canvas
const BG = '#090912'
const INACTIVE_COLOR = '#75baff'  // Strudel foreground blue
const ACTIVE_COLOR = '#FFCA28'    // Strudel active yellow
const PLAYHEAD_COLOR = 'rgba(255,255,255,0.5)'

/** Mirrors Strudel's getValue() — returns MIDI number for pitched notes, "_s" string for sounds. */
function getValue(hap: any): number | string {
  const val = hap.value
  if (!val || typeof val !== 'object') {
    const n = typeof val === 'number' ? val : null
    return n ?? 0
  }
  const { note, n, freq, s } = val
  if (typeof freq === 'number') return Math.round(12 * Math.log2(freq / 440) + 69)
  const noteVal = note ?? n
  if (typeof noteVal === 'string') return noteToMidi(noteVal) ?? ('_' + noteVal)
  if (typeof noteVal === 'number') return noteVal
  if (typeof s === 'string') return '_' + s
  return 0
}

/** Parse a CSS hex color (#rrggbb or #rgb) to [r, g, b]. Returns null on failure. */
function parseHex(hex: string): [number, number, number] | null {
  const s = hex.replace('#', '')
  if (s.length === 6) {
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
  }
  if (s.length === 3) {
    return [parseInt(s[0] + s[0], 16), parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16)]
  }
  return null
}

export function PianorollSketch(
  _hapStreamRef: RefObject<HapStream | null>,
  _analyserRef: RefObject<AnalyserNode | null>,
  schedulerRef: RefObject<PatternScheduler | null>
): (p: p5) => void {
  return (p: p5) => {
    p.setup = () => {
      p.createCanvas(window.innerWidth, 200)
      p.pixelDensity(window.devicePixelRatio || 1)
      p.noSmooth()
    }

    p.draw = () => {
      const W = p.width
      const H = p.height

      const scheduler = schedulerRef.current
      if (!scheduler) {
        p.background(BG)
        return
      }

      let now: number
      try { now = scheduler.now() } catch { p.background(BG); return }

      const from = now - CYCLES * PLAYHEAD
      const to = now + CYCLES * (1 - PLAYHEAD)
      const timeExtent = to - from

      let haps: any[]
      try { haps = scheduler.query(from, to) } catch { haps = [] }

      // --- Fold layout: collect distinct values, sort ascending ---
      const valueSet = new Set<number | string>()
      for (const h of haps) valueSet.add(getValue(h))
      const foldValues = Array.from(valueSet).sort((a, b) => {
        if (typeof a === 'number' && typeof b === 'number') return a - b
        if (typeof a === 'number') return -1
        if (typeof b === 'number') return 1
        return String(a).localeCompare(String(b))
      })
      const foldCount = Math.max(1, foldValues.length)
      const barH = H / foldCount

      p.background(BG)
      p.noStroke()

      for (const hap of haps) {
        const value = getValue(hap)
        const laneIdx = foldValues.indexOf(value)
        if (laneIdx < 0) continue

        // Strudel's exact x formula
        const hapBegin = Number(hap.whole?.begin ?? 0)
        const hapEnd = Number(hap.whole?.end ?? hapBegin + 0.25)
        const duration = hapEnd - hapBegin
        const x = ((hapBegin - now + CYCLES * PLAYHEAD) / timeExtent) * W
        const noteW = Math.max(2, (duration / timeExtent) * W)

        // Higher pitch = higher on canvas (lower y index)
        const y = ((foldCount - 1 - laneIdx) / foldCount) * H

        const isActive = hapBegin <= now && Number(hap.endClipped ?? hapEnd) > now

        const gain = Math.min(1, Math.max(0.1, hap.value?.gain ?? 1))
        const velocity = Math.min(1, Math.max(0.1, hap.value?.velocity ?? 1))
        const alpha = gain * velocity

        // Resolve color — hap.value.color → theme color
        const hapColor = hap.value?.color
        let rgb = hapColor ? parseHex(String(hapColor)) : null

        if (isActive) {
          const [r, g, b] = rgb ?? parseHex(ACTIVE_COLOR)!
          p.fill(r, g, b, alpha * 255)
          p.rect(x, y + 1, noteW - 2, barH - 2)
          // Bright stroke outline for active notes
          p.noFill()
          p.stroke(r, g, b, 255)
          p.strokeWeight(1)
          p.rect(x, y + 1, noteW - 2, barH - 2)
          p.noStroke()
        } else {
          const [r, g, b] = rgb ?? parseHex(INACTIVE_COLOR)!
          p.fill(r, g, b, alpha * 180)
          p.rect(x, y + 1, noteW - 2, barH - 2)
        }
      }

      // Playhead line
      const phX = PLAYHEAD * W
      p.stroke(PLAYHEAD_COLOR)
      p.strokeWeight(1)
      p.line(phX, 0, phX, H)
      p.noStroke()
    }
  }
}
