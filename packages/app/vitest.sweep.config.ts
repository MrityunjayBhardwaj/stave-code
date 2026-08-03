/**
 * vitest.sweep.config.ts — runs ONE named sweep spec by an explicit `--config`,
 * without widening the CI `include` globs in `vitest.config.ts`.
 *
 * The repo already had five of these, one per sweep (`vitest.bakery`,
 * `vitest.waveC`, `vitest.waveCdiag`, `vitest.proto`, `vitest.edit-coverage`).
 * This one takes the spec from `SWEEP` in the environment, so the next sweep
 * needs no new config file:
 *
 *   SWEEP=tests/parity-corpus/_p4b-cell-duration.spec.ts \
 *     pnpm --filter @stave/app exec vitest run --config vitest.sweep.config.ts
 *
 * This file was the only one that already knew `include` must be ASSIGNED and
 * not merged — that note is what led to #1147, where the other four were found
 * still merging it. The rule now lives in `vitest.only.ts` so it travels.
 *
 * The one thing it did get wrong: it assigned onto the imported `base` object
 * itself, mutating the base config module. Harmless in a single-config process,
 * but `only()` builds fresh objects instead.
 */
import { only } from './vitest.only'

export default only([process.env.SWEEP ?? 'tests/parity-corpus/_*.spec.ts'])
