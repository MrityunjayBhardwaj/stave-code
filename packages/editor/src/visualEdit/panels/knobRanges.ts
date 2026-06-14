/**
 * Per-method knob ranges for the Mixer (S4).
 *
 * Each numeric chain argument becomes a knob; the method name picks a sensible
 * range and step (gain 0..1, speed −2..2, lpf log 20..20k, …). Unknown methods
 * fall back to a range derived from the current value so any numeric literal is
 * still draggable — the user can always type an exact value in code.
 *
 * Pure — no Monaco, no React.
 */

export interface KnobRange {
  min: number
  max: number
  step: number
  /** 'log' methods (filter cutoffs) map the slider position logarithmically */
  scale: 'linear' | 'log'
}

const lin = (min: number, max: number, step: number): KnobRange => ({
  min,
  max,
  step,
  scale: 'linear',
})
const log = (min: number, max: number): KnobRange => ({ min, max, step: 1, scale: 'log' })

/**
 * Method → range overrides. Names cover the common Strudel effect/envelope
 * chain. Anything absent uses the value-derived fallback below.
 */
const RANGES: Record<string, KnobRange> = {
  // levels
  gain: lin(0, 1, 0.01),
  velocity: lin(0, 1, 0.01),
  pan: lin(0, 1, 0.01),
  // reverb
  room: lin(0, 1, 0.01),
  size: lin(0, 1, 0.01),
  roomsize: lin(0, 1, 0.01),
  // delay
  delay: lin(0, 1, 0.01),
  delaytime: lin(0, 1, 0.01),
  delayfeedback: lin(0, 1, 0.01),
  // filters (logarithmic frequency)
  lpf: log(20, 20000),
  cutoff: log(20, 20000),
  hpf: log(20, 20000),
  hcutoff: log(20, 20000),
  bandf: log(20, 20000),
  resonance: lin(0, 40, 0.5),
  lpq: lin(0, 40, 0.5),
  // tone / drive
  shape: lin(0, 1, 0.01),
  distort: lin(0, 1, 0.01),
  crush: lin(1, 16, 1),
  coarse: lin(1, 16, 1),
  // envelope
  attack: lin(0, 2, 0.01),
  decay: lin(0, 2, 0.01),
  sustain: lin(0, 1, 0.01),
  release: lin(0, 4, 0.01),
  // playback
  speed: lin(-2, 2, 0.01),
  accelerate: lin(-2, 2, 0.01),
  begin: lin(0, 1, 0.01),
  end: lin(0, 1, 0.01),
  legato: lin(0, 2, 0.01),
  // time
  slow: lin(0.25, 8, 0.25),
  fast: lin(0.25, 8, 0.25),
  cps: lin(0.1, 4, 0.05),
  // probability
  degradeBy: lin(0, 1, 0.01),
  sometimesBy: lin(0, 1, 0.01),
  // discrete index
  n: lin(0, 16, 1),
}

/** A nice round step ~1/100 of the span (e.g. 0.01, 0.1, 1, 10). */
function niceStep(span: number): number {
  const raw = span / 100
  const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  return pow || 0.01
}

/**
 * The knob range for a method given the literal's current value. Known methods
 * use the override table; unknown methods get a range that comfortably
 * contains the current value so the knob is still usable.
 */
export function knobRangeFor(method: string, value: number): KnobRange {
  const known = RANGES[method]
  if (known) {
    // Widen the max if the authored value already exceeds the default ceiling
    // (e.g. a hand-written gain of 1.4) so the knob can represent it.
    if (value > known.max) return { ...known, max: value }
    if (value < known.min) return { ...known, min: value }
    return known
  }
  if (value >= 0 && value <= 1) return lin(0, 1, 0.01)
  const min = value < 0 ? value * 2 : 0
  const max = Math.max(1, value * 2)
  return lin(min, max, niceStep(max - min))
}
