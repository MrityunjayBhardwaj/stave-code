/**
 * faderTaper.ts — the mapping between a fader's screen position and Strudel's
 * linear `.gain`, plus the dB readout.
 *
 * A linear fader feels wrong: most useful gesture happens in the top of the
 * travel and the bottom is dead. DAWs use a taper so the bottom ~80% of travel
 * covers the useful −∞…0 dB and the top is makeup gain. We use the standard
 * power taper `gain = MAX · pos⁴`, which puts unity (0 dB) at ~84% of travel and
 * the top at +6 dB.
 *
 * Pure number math (no React, no audio) so it unit-tests directly and both the
 * read side (S0, fader position from gain) and the write side (S1, gain from a
 * drag) share one curve.
 *
 * GR7: the exponent and the +6 dB ceiling are a sensible default for the
 * read-only display. They must be TUNED BY EAR before the write slice (S1)
 * ships — balance a real 3–4 track sketch and confirm the travel feels musical.
 */

/** loudest gain the fader can reach: +6 dB ≈ 1.995× linear. */
export const MAX_FADER_GAIN = 10 ** (6 / 20)

/** taper exponent — higher = more travel devoted to the quiet end. */
const TAPER = 4

/** fader position 0..1 → linear gain (0..MAX_FADER_GAIN). */
export function faderPosToGain(pos: number): number {
  const p = clamp01(pos)
  return MAX_FADER_GAIN * p ** TAPER
}

/** linear gain → fader position 0..1 (inverse taper, clamped). */
export function gainToFaderPos(gain: number): number {
  if (!(gain > 0)) return 0
  return clamp01((gain / MAX_FADER_GAIN) ** (1 / TAPER))
}

/** linear gain → decibels (−Infinity at silence). */
export function gainToDb(gain: number): number {
  if (!(gain > 0)) return -Infinity
  return 20 * Math.log10(gain)
}

/** dB for display: `-∞` at silence, else one decimal with a leading sign. */
export function formatDb(gain: number): string {
  const db = gainToDb(gain)
  if (db === -Infinity) return '-∞'
  const r = Math.round(db * 10) / 10
  return (r > 0 ? '+' : '') + r.toFixed(1)
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
