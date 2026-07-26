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
 * `include` is ASSIGNED, not merged: `mergeConfig` CONCATENATES arrays, so
 * merging an include list runs the whole CI suite alongside the sweep.
 */
import base from './vitest.config'

const config = base as { test?: { include?: string[] } }
config.test = { ...(config.test ?? {}), include: [process.env.SWEEP ?? 'tests/parity-corpus/_*.spec.ts'] }

export default config
