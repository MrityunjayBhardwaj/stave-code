import { noteToMidi } from './noteToMidi'

export interface HapEvent {
  /** Full Strudel Hap object */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hap: any
  /** AudioContext.currentTime when note fires */
  audioTime: number
  /** Duration in AudioContext seconds */
  audioDuration: number
  /** Lookahead offset in ms (use for display timing delays) */
  scheduledAheadMs: number
  /** Computed MIDI note number (null for unpitched percussion) */
  midiNote: number | null
  /** Instrument/sample name from hap.value.s */
  s: string | null
  /** From .color() in pattern */
  color: string | null
  /** Source character ranges in the original code string */
  loc: Array<{ start: number; end: number }> | null
}

type HapHandler = (event: HapEvent) => void

/**
 * Lightweight event bus fed by StrudelEngine's scheduler onTrigger.
 * All visualizers and the highlight system subscribe here.
 */
export class HapStream {
  private handlers: Set<HapHandler> = new Set()

  on(handler: HapHandler): void {
    this.handlers.add(handler)
  }

  off(handler: HapHandler): void {
    this.handlers.delete(handler)
  }

  /**
   * Called by the engine scheduler for each scheduled Hap.
   * Enriches the raw data and fans it out to all subscribers.
   */
  emit(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hap: any,
    time: number,
    cps: number,
    endTime: number,
    audioCtxCurrentTime: number
  ): void {
    const scheduledAheadMs = (time - audioCtxCurrentTime) * 1000
    const audioDuration = endTime - time

    const event: HapEvent = {
      hap,
      audioTime: time,
      audioDuration,
      scheduledAheadMs,
      midiNote: noteToMidi(hap?.value?.note ?? hap?.value?.n),
      s: hap?.value?.s ?? null,
      color: hap?.value?.color ?? null,
      loc: hap?.context?.locations ?? hap?.context?.loc ?? null,
    }

    for (const handler of this.handlers) {
      try {
        handler(event)
      } catch {
        // Prevent one bad subscriber from breaking others
      }
    }
  }

  dispose(): void {
    this.handlers.clear()
  }
}
