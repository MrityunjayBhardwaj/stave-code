/**
 * vitest.waveC.config.ts — config used ONLY by the maintainer-driven
 * Wave C-1 grounding probe (`_waveC-grounding.spec.ts`). Exists so the
 * underscore-prefixed maintainer spec can be invoked WITHOUT widening
 * the CI `vitest.config.ts` `include` globs (the parity/loc CI gate
 * stays exactly as-is).
 *
 * See `vitest.only.ts` — until #1147 this merged its `include` and so
 * collected 86 files rather than 1.
 */
import { only } from './vitest.only'

export default only(['tests/parity-corpus/_waveC-grounding.spec.ts'])
