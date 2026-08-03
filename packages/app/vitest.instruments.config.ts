/**
 * vitest.instruments.config.ts — config used ONLY by `pnpm test:instruments:collect`.
 *
 * The `_`-prefixed files under `tests/parity-corpus/` are INSTRUMENTS, not gates:
 * measurements taken by hand when a figure is needed, some of them minutes long.
 * Keeping them out of `vitest.config.ts`'s `include` is deliberate and right.
 *
 * The gap that leaves (#1141): nothing ever asks whether they still *load*. A
 * green gate run is not evidence about them either way, so a file can rot into
 * unrunnability and the discovery happens at the moment someone needs the figure
 * — the expensive moment. `_sweep-1034e.spec.ts` sat broken from the day it
 * landed until an unrelated closing sweep re-took all 31.
 *
 * This config collects them WITHOUT executing them. Pair it with a
 * `--testNamePattern` that cannot match (see the script), and vitest imports and
 * transforms every instrument, then runs nothing. Roughly 11s for all 31.
 *
 * WHAT IT CATCHES, AND WHAT IT DOES NOT — worth being exact, because the guard
 * was proposed for a case it cannot see:
 *   · a broken STATIC import fails at transform, so the pass reddens.  ✓
 *   · a broken DYNAMIC import inside a test body is invisible to collection,
 *     so the pass stays green. That is exactly `_sweep-1034e.spec.ts`, which
 *     defends itself with its own existence check instead. ✗
 *
 * NOT `mergeConfig` for `include`. `mergeConfig` UNIONS array options rather
 * than replacing them, so merging an `include` widens the base globs instead of
 * narrowing to them — which is how `vitest.proto.config.ts` ends up collecting
 * 86 files while its docblock promises 1 (#1147). Everything else is inherited
 * from the base; `include` is assigned explicitly, after the merge, on purpose.
 */
import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vitest.config'

const config = mergeConfig(base, defineConfig({}))

config.test.include = ['tests/parity-corpus/_*.spec.{ts,tsx}']
config.test.exclude = ['node_modules', '.next']

export default config
