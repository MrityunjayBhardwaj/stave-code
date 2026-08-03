/**
 * vitest.bakery.config.ts — config used ONLY by `pnpm parity:bakery`
 * (20-15 V-1, maintainer tool). It exists solely so the network-driven
 * classifier spec (`_bakery-classify.spec.ts`) can be run by an explicit
 * path WITHOUT widening the CI `vitest.config.ts` `include` globs. This
 * config is never used by `pnpm test` / CI; it is invoked by name from
 * parity-bakery.mjs.
 *
 * Its docblock used to claim "the 34-file parity/loc CI gate stays exactly
 * 34". It did not: `mergeConfig` unions `include`, so this collected the
 * whole app suite alongside the classifier (#1147). `only()` assigns.
 */
import { only } from './vitest.only'

export default only(['tests/parity-corpus/_bakery-classify.spec.ts'])
