import type { HapEvent } from './HapStream'
import type { HapStream } from './HapStream'
import type { IREvent } from '../ir/IREvent'
import type { IRPattern } from '../ir/IRPattern'

/**
 * Engine-agnostic IRPattern built from a live HapStream.
 *
 * Accumulates HapEvents into a rolling buffer of IREvent[].
 * Any engine that provides streaming (HapStream) automatically gets
 * a synchronous queryable — no engine-specific code needed.
 *
 * Usage:
 *   const sched = new BufferedScheduler(hapStream, audioCtx)
 *   sched.query(begin, end) // → IREvent[] from the buffer
 *   sched.now()             // → current audioContext time
 *   sched.dispose()         // → unsubscribe + clear buffer
 */
export class BufferedScheduler implements IRPattern {
  private buffer: IREvent[] = []
  private audioCtx: AudioContext
  private maxAge: number
  private hapStream: HapStream
  private handler: (event: HapEvent) => void

  constructor(hapStream: HapStream, audioCtx: AudioContext, maxAge = 10) {
    this.hapStream = hapStream
    this.audioCtx = audioCtx
    this.maxAge = maxAge

    this.handler = (event: HapEvent) => {
      const begin = event.audioTime
      const end = event.audioTime + event.audioDuration

      // Clip previous event's end to this event's begin — prevents overlap
      // when engines emit hardcoded durations (e.g. sonicPiWeb uses 0.25/0.5)
      // that exceed the actual gap between events.
      if (this.buffer.length > 0) {
        const prev = this.buffer[this.buffer.length - 1]
        if (prev.end > begin) {
          prev.end = begin
          prev.endClipped = begin
        }
      }

      this.buffer.push({
        begin,
        end,
        endClipped: end,
        note: event.midiNote,
        freq: typeof event.midiNote === 'number'
          ? 440 * Math.pow(2, (event.midiNote - 69) / 12)
          : null,
        s: event.s,
        gain: 1,
        velocity: 1,
        color: event.color,
        loc: event.loc ?? undefined,
      })

      // Evict old events
      const cutoff = this.audioCtx.currentTime - this.maxAge
      while (this.buffer.length > 0 && this.buffer[0].end < cutoff) {
        this.buffer.shift()
      }
    }

    hapStream.on(this.handler)
  }

  now(): number {
    return this.audioCtx.currentTime
  }

  query(begin: number, end: number): IREvent[] {
    return this.buffer.filter(h => h.begin < end && h.end > begin)
  }

  /** Clear the buffer (e.g. on re-evaluate). */
  clear(): void {
    this.buffer.length = 0
  }

  dispose(): void {
    this.hapStream.off(this.handler)
    this.buffer.length = 0
  }
}
