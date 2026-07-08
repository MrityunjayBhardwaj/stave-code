/**
 * audition.ts — one-shot sound preview through the shared audio graph (#805).
 *
 * "Hear before you place": the instrument picker (and any future sound browser)
 * previews a sound by triggering a single note on the SAME `superdough` singleton
 * the engine drives, so it reuses the already-loaded samples/output. Mirrors the
 * press-and-hold audition in PianoRollGrid (#633), factored out now that a second
 * caller (the Mixer picker) needs the same primitive.
 *
 * Grounding notes (superdough.mjs:439 `superdough(value, t, hapDuration, cps, cycle)`):
 *   - `value` is the resolved hap object — `{ note, s, gain, attack, sustain, release }`.
 *   - Synth sounds always render. Sample/soundfont sounds need the engine
 *     initialized (a played doc) — otherwise superdough REJECTS the promise, so
 *     we `.catch` it and no-op. Never throws: audio-not-ready must never break
 *     the picker UI.
 *   - Percussive samples ignore the note; a mid-register default keeps melodic
 *     instruments in a musical range.
 */
import { superdough, getAudioContext } from '@strudel/webaudio'

/**
 * Shared audition envelope (#816). Both this one-shot preview and PianoRollGrid's
 * key press (`playMidi`) trigger a note through this SAME shape, so a picker ▶
 * preview sounds identical to a key tap — one constant, no drift. `sustain: 1`
 * (full level, not the synth default pluck of 0) gives the note body; the short
 * `release` keeps the tail tight.
 */
export const AUDITION_ENVELOPE = {
  gain: 0.9,
  attack: 0.01,
  sustain: 1,
  release: 0.08,
} as const

/**
 * One-shot / single-tap note length in seconds. A held pianoroll key retriggers
 * at this interval (PianoRollGrid `HOLD_RETRIGGER_MS = AUDITION_DUR_S * 1000`),
 * so a single tap and a ▶ preview are the same length.
 */
export const AUDITION_DUR_S = 0.22

/** Preview `sound` once (a single `note`, default c4). Safe to call anytime. */
export function auditionSound(sound: string, note = 'c4'): void {
  if (!sound) return
  try {
    const ctx = getAudioContext()
    // The click/select is the user gesture that unlocks a suspended context.
    void ctx.resume()
    const value: Record<string, unknown> = {
      note,
      s: sound,
      ...AUDITION_ENVELOPE,
    }
    // t must be the absolute onset; a small lead avoids scheduling in the past.
    void superdough(value, ctx.currentTime + 0.02, AUDITION_DUR_S, 0.5, 0)?.catch(() => {})
  } catch {
    /* audio graph not ready — never break the UI */
  }
}
