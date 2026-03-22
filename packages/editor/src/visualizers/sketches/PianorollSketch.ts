import type { RefObject } from 'react'
import type p5 from 'p5'
import type { HapStream, HapEvent } from '../../engine/HapStream'

export const WINDOW_SECONDS = 6
export const MIDI_MIN = 24
export const MIDI_MAX = 96
export const MIDI_RANGE = MIDI_MAX - MIDI_MIN // 72
export const DRUM_LANE_RATIO = 0.20

export const DRUM_SOUNDS = new Set([
  'bd', 'sd', 'hh', 'oh', 'cp', 'rim', 'mt', 'ht', 'lt',
  'cr', 'rd', 'cb', 'cy', 'ag', 'ma', 'perc', 'drum',
])

export const DRUM_SLOT: Record<string, number> = {
  bd: 0, sd: 1, hh: 2, oh: 3, cp: 4, rim: 5, mt: 6, ht: 7, lt: 8,
}

export function getNoteX(audioTime: number, now: number, canvasWidth: number): number {
  return ((audioTime - now + WINDOW_SECONDS) / WINDOW_SECONDS) * canvasWidth
}

export function getNoteY(midiNote: number, pitchAreaHeight: number): number {
  const midi = Math.max(MIDI_MIN, Math.min(MIDI_MAX, midiNote))
  return pitchAreaHeight * (1 - (midi - MIDI_MIN) / MIDI_RANGE)
}

export function getBaseName(s: string): string {
  return s.replace(/[0-9_-].*$/, '')
}

export function isDrumSound(s: string): boolean {
  const base = getBaseName(s)
  return DRUM_SOUNDS.has(base) || DRUM_SOUNDS.has(s)
}

export function getDrumSlot(s: string): number {
  const base = getBaseName(s)
  return DRUM_SLOT[base] ?? DRUM_SLOT[s] ?? 4
}

export function getColor(
  event: { color: string | null; s: string | null },
  fallbackTokens?: Record<string, string>
): string {
  if (event.color) return event.color
  const s = event.s ?? ''
  const tokens = fallbackTokens ?? {}
  if (isDrumSound(s)) return tokens['--stem-drums'] ?? '#f97316'
  if (/^(bass|b[0-9]|sub)/.test(s)) return tokens['--stem-bass'] ?? '#06b6d4'
  if (/^(pad|str|choir|voice)/.test(s)) return tokens['--stem-pad'] ?? '#10b981'
  // Per locked decision: unknown/unrecognized sounds fall back to --accent, NOT --stem-melody.
  // --stem-melody is only used if we add an explicit melody category match in the future.
  return tokens['--accent'] ?? '#8b5cf6'
}

function getCSSTokens(canvas: HTMLCanvasElement): Record<string, string> {
  const el = canvas.parentElement ?? canvas
  const style = getComputedStyle(el)
  return {
    '--background': style.getPropertyValue('--background').trim() || '#090912',
    '--stem-drums': style.getPropertyValue('--stem-drums').trim() || '#f97316',
    '--stem-bass': style.getPropertyValue('--stem-bass').trim() || '#06b6d4',
    '--stem-pad': style.getPropertyValue('--stem-pad').trim() || '#10b981',
    '--accent': style.getPropertyValue('--accent').trim() || '#8b5cf6',
  }
}

export function PianorollSketch(
  hapStreamRef: RefObject<HapStream | null>,
  analyserRef: RefObject<AnalyserNode | null>
): (p: p5) => void {
  return (p: p5) => {
    const events: HapEvent[] = []
    const handler = (e: HapEvent) => events.push(e)

    p.setup = () => {
      p.createCanvas(p.windowWidth, 200)
      p.pixelDensity(window.devicePixelRatio || 1)
      p.noStroke()
      hapStreamRef.current?.on(handler)
    }

    p.draw = () => {
      const now = analyserRef.current?.context.currentTime ?? performance.now() / 1000
      const W = p.width
      const H = p.height
      const pitchH = H * (1 - DRUM_LANE_RATIO)
      const drumH = H * DRUM_LANE_RATIO
      const tokens = getCSSTokens(p.canvas as unknown as HTMLCanvasElement)

      p.background(tokens['--background'] ?? '#090912')

      // Prune events older than window
      const cutoff = now - WINDOW_SECONDS
      while (events.length > 0 && events[0].audioTime < cutoff) events.shift()

      for (const e of events) {
        const x = getNoteX(e.audioTime, now, W)
        const noteW = Math.max(2, (e.audioDuration / WINDOW_SECONDS) * W)
        const color = getColor(e, tokens)

        const isDrum = isDrumSound(e.s ?? '')

        if (isDrum) {
          const slot = getDrumSlot(e.s ?? '')
          const slotCount = Object.keys(DRUM_SLOT).length
          const y = pitchH + (slot / slotCount) * drumH
          const noteH = drumH / slotCount
          p.fill(color)
          p.rect(x, y, noteW, Math.max(2, noteH - 1))
        } else if (e.midiNote !== null) {
          const y = getNoteY(e.midiNote, pitchH)
          const noteH = Math.max(1, pitchH / MIDI_RANGE)
          p.fill(color)
          p.rect(x, y, noteW, noteH)
        }
      }
    }

    // Store original remove so we can extend it
    const origRemove = p.remove.bind(p)
    p.remove = () => {
      hapStreamRef.current?.off(handler)
      origRemove()
    }
  }
}
