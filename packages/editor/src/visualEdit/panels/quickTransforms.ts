/**
 * Quick transforms (#390) — one-tap effect adds for the Mixer.
 *
 * Each appends `.method(default)` to the pattern expression when that method
 * isn't already in the chain, which then surfaces a knob. Musician-facing
 * labels; the method + default are Strudel idiom. Pure data.
 */
export interface QuickTransform {
  /** musician-facing button label */
  label: string
  /** Strudel chain method to append */
  method: string
  /** default value for the appended call */
  value: number
}

export const QUICK_TRANSFORMS: readonly QuickTransform[] = [
  { label: 'Reverb', method: 'room', value: 0.4 },
  { label: 'Filter', method: 'lpf', value: 800 },
  { label: 'Distortion', method: 'distort', value: 0.3 },
  { label: 'Delay', method: 'delay', value: 0.4 },
  { label: 'Speed', method: 'speed', value: 1.5 },
  { label: 'Gain', method: 'gain', value: 0.8 },
]
