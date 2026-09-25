/**
 * The sample rate a synth track's display render may use (#1759).
 *
 * The Song timeline draws a synth track from an offline render of it (#1731),
 * reduced to 100 columns a second. At the live rate (48 kHz) that costs a
 * second or more per long track, and the render budget runs out a few tracks
 * into a long song. Measured on the demo song (374 s tracks), a render at
 * 24 kHz costs 0.46–0.57 of one at 48 kHz, and its envelope, scaled the way a
 * lane draws it (to its own 95th percentile), is within 0.5% at the 95th
 * percentile of columns. Bright unfiltered synths (sawtooth c5–c6, supersaw,
 * triangle c7) are within 3.7%. At 12 kHz those were 7–8.5%, so 24 kHz it is.
 *
 * ⚠ ONLY FOR A TRACK THAT PLAYS NOTHING BUT PLAIN OSCILLATORS. superdough keeps
 * page-wide caches of rate-dependent buffers, keyed without the rate: decoded
 * samples by URL (`sampler.mjs` `loadBuffer`, decoded on the CURRENT context,
 * which also serves an `ir` reverb, `superdough.mjs` `roomIR`), noise by type
 * (`noise.mjs` `getNoiseBuffer`, also reached through `noise`, an FM wave named
 * after a noise, and `sbd`), and soundfont zones (`@strudel/soundfonts`
 * `fontloader.mjs` `getFontPitch`). The first render to ask for one fills the
 * cache at ITS rate, and live playback would then play a low-rate copy. So a
 * note qualifies only when its sound is an oscillator that builds no cached
 * buffer, and nothing else in it names a sample, a bank, a reverb file or a
 * noise. Anything not recognised renders at the live rate, as before: this
 * list going stale costs speed, never sound.
 *
 * Deliberately free of imports.
 */

/** The display render's rate for a track that qualifies (never above live). */
export const DISPLAY_RENDER_RATE = 24000

/**
 * Oscillator sounds that build no cached buffer (`superdough/synth.mjs`
 * `waveforms`, `supersaw`, `pulse`). A note with no sound plays superdough's
 * default, `triangle` (`superdough.mjs` `defaultDefaultValues`).
 */
const OSCILLATORS = new Set(['sine', 'triangle', 'square', 'sawtooth', 'supersaw', 'pulse'])

/** `superdough/helpers.mjs` `noises`. */
const NOISES = new Set(['pink', 'white', 'brown', 'crackle'])

/** Can this note be rendered below the live rate without touching a cache? */
export function playsAtDisplayRate(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  const s = v.s ?? 'triangle'
  if (typeof s !== 'string' || !OSCILLATORS.has(s)) return false
  if (v.bank != null || v.ir != null || v.iresponse != null) return false
  if (v.noise != null && v.noise !== 0) return false
  for (const key in v) {
    const x = v[key]
    if (typeof x === 'string' && NOISES.has(x)) return false
  }
  return true
}

/** The rate to render a track at, given every note it plays over the span. */
export function displayRenderRate(values: Iterable<unknown>, liveRate: number): number {
  for (const value of values) if (!playsAtDisplayRate(value)) return liveRate
  return Math.min(liveRate, DISPLAY_RENDER_RATE)
}
