/**
 * vitest.waveC.config.ts — config used ONLY by the maintainer-driven
 * Wave C-1 grounding probe (`_waveC-grounding.spec.ts`). Exists so the
 * underscore-prefixed maintainer spec can be invoked WITHOUT widening
 * the CI `vitest.config.ts` `include` globs (the parity/loc CI gate
 * stays exactly as-is). Mirrors vitest.proto.config.ts / vitest.bakery.config.ts.
 */
import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vitest.config'

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ['tests/parity-corpus/_waveC-grounding.spec.ts'],
    },
  }),
)
