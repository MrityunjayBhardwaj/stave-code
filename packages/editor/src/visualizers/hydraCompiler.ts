import type {
  HydraPatternFn,
  HydraStaveBag,
} from './renderers/HydraVizRenderer'

/**
 * Compile a `.hydra` source string into a `HydraPatternFn`.
 *
 * User code executes inside `new Function('s', 'stave', code)`:
 *   - `s`      — the hydra synth (audio reactive via `s.a.fft[]`).
 *   - `stave`  — scheduler bag; see `HydraStaveBag`.
 *
 * Kept in its own module (mirroring `p5Compiler.ts`) so unit tests can
 * import it without transitively pulling in `P5VizRenderer` → `p5` →
 * `gifenc`, which vitest's ESM loader can't resolve.
 */
export function compileHydraCode(code: string): HydraPatternFn {
  return (s: unknown, stave: HydraStaveBag) => {
    const fn = new Function('s', 'stave', code)
    fn(s, stave)
  }
}
