/**
 * builtinHydraCode (#252) — guards that every built-in hydra code STRING is a
 * valid, executable hydra chain (compiles via compileHydraCode + runs against a
 * chainable synth + terminates in `.out()`). These strings are the single source
 * of truth for the built-in hydra presets AND the public `hydraPresets` closures
 * are derived from them, so a transcription error here would silently break BOTH
 * the worker path and the main-thread closures (the PV56/#184 divergence trap).
 */
import { describe, it, expect } from 'vitest'

import {
  HYDRA_DEFAULT_CODE,
  HYDRA_PIANOROLL_CODE,
  HYDRA_SCOPE_CODE,
  HYDRA_KALEID_CODE,
} from '../renderers/builtinHydraCode'
import { compileHydraCode } from '../hydraCompiler'

/** A chainable mock hydra synth: every method returns the chain (records the call
 *  name); `s.a.fft` is a live bin array; `s.o0` an output buffer token. Arrow
 *  thunks passed as args are NOT invoked (hydra calls them per frame) — we only
 *  verify the chain BUILDS and terminates in `.out()`. */
function makeMockSynth(): { synth: unknown; calls: string[] } {
  const calls: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy(function () {}, {
    get(_t, prop: string) {
      if (prop === 'a') return { fft: [0.1, 0.2, 0.3, 0.4] }
      if (prop === 'o0' || prop === 'o1') return { __out: prop }
      return (..._args: unknown[]) => {
        calls.push(prop)
        return chain
      }
    },
    apply() {
      return chain
    },
  })
  return { synth: chain, calls }
}

const PRESETS: Array<[string, string]> = [
  ['default', HYDRA_DEFAULT_CODE],
  ['pianoroll', HYDRA_PIANOROLL_CODE],
  ['scope', HYDRA_SCOPE_CODE],
  ['kaleid', HYDRA_KALEID_CODE],
]

describe('builtinHydraCode — every preset compiles + runs + ends in .out()', () => {
  for (const [name, code] of PRESETS) {
    it(`${name}: compiles and executes the chain`, () => {
      const pattern = compileHydraCode(code) // throws on syntax error
      const { synth, calls } = makeMockSynth()
      expect(() => pattern(synth, {} as never)).not.toThrow()
      expect(calls).toContain('osc') // every preset starts from an oscillator
      expect(calls).toContain('out') // …and routes to an output
    })
  }
})
