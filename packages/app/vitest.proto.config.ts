/**
 * vitest.proto.config.ts — config used ONLY by `pnpm test:proto`
 * (Phase 20-17 Wave-0 D-01 regression oracle, maintainer tool). It exists
 * solely so the vendored prototype spec (`_proto-d01.spec.ts`) can be run by
 * an explicit path WITHOUT widening the CI `vitest.config.ts` `include` globs
 * — the parity/loc CI gate stays exactly as-is. This config is never used by
 * `pnpm test` / CI; it is invoked by name from the `test:proto` script.
 *
 * Until #1147 that promise was not kept: `mergeConfig` unions `include`, so
 * this collected 86 files rather than 1. `only()` assigns instead of merging.
 */
import { only } from './vitest.only'

export default only(['tests/parity-corpus/_proto-d01.spec.ts'])
