/**
 * vitest.bakery.config.ts — config used ONLY by `pnpm parity:bakery`
 * (20-15 V-1, maintainer tool). It exists solely so the network-driven
 * classifier spec (`_bakery-classify.spec.ts`) can be run by an explicit
 * path WITHOUT widening the CI `vitest.config.ts` `include` globs — the
 * 34-file parity/loc CI gate stays exactly 34. This config is never used
 * by `pnpm test` / CI; it is invoked by name from parity-bakery.mjs.
 */
import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vitest.config'

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ['tests/parity-corpus/_bakery-classify.spec.ts'],
    },
  }),
)
