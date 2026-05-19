/**
 * vitest.proto.config.ts — config used ONLY by `pnpm test:proto`
 * (Phase 20-17 Wave-0 D-01 regression oracle, maintainer tool). It exists
 * solely so the vendored prototype spec (`_proto-d01.spec.ts`) can be run by
 * an explicit path WITHOUT widening the CI `vitest.config.ts` `include` globs
 * — the parity/loc CI gate stays exactly as-is. This config is never used by
 * `pnpm test` / CI; it is invoked by name from the `test:proto` script.
 * Mirrors vitest.bakery.config.ts verbatim except for the `include` target.
 */
import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vitest.config'

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ['tests/parity-corpus/_proto-d01.spec.ts'],
    },
  }),
)
