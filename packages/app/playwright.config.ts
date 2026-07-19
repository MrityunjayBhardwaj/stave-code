import { defineConfig } from '@playwright/test'

/**
 * Specs whose ASSERTION IS A MEASUREMENT of real-time rendering — frames per
 * second, spectral variance across frames, reads/frame, scroll jank, a cost ladder.
 *
 * These cannot be mocked or fast-forwarded: to observe that output VARIES across
 * frames, frames must actually render, at real frame rate, on a real GPU. But
 * Playwright parallelises across FILES (~6 workers on 12 cores) all sharing ONE
 * GPU — so while these measure, five other workers are competing for the exact
 * resource under measurement. The number degrades and the spec goes red, not
 * because the product regressed but because the measurement was taken in a crowded
 * room. Below, they get the machine to themselves.
 *
 * The alternative — widening their thresholds until they stop complaining — would
 * destroy the only thing they exist for.
 *
 * The list is EVIDENCE-BASED, from repeated full-gate runs. Note what is NOT here:
 * `stave.spec.ts` also failed only under load, and looked like a member — but its
 * a11y test simply never waited for the app to render (`h1` count 0). That is a
 * race, not contention, and it was fixed at the source rather than hidden in here.
 * Serialising it would have been treating a spec bug as an infrastructure cost.
 */
/** vitest-only harnesses that match Playwright's default testMatch — never collect. */
const VITEST_ONLY = ['**/parity-corpus/**']

const MEASUREMENT_SPECS = [
  '**/viz-shared-pump-observe.spec.ts', // reads/frame + sample mean, cache on vs off
  '**/strudel-viz-methods.spec.ts', // 26 worker-backed viz mounts; "varies over frames"
  '**/perf-matrix.spec.ts', // the cost ladder (env-gated)
  '**/viz-scroll-jank.spec.ts', // jank: no-viz control vs heavy worker viz (env-gated)
]

export default defineConfig({
  testDir: './tests',
  // `tests/parity-corpus/` holds the maintainer-only VITEST harnesses (the parse-
  // parity and edit-coverage measurements). They match Playwright's default
  // testMatch (`*.spec.ts` / `*.test.ts`), so without this a bare
  // `npx playwright test` collects them and dies on `require is not defined in ES
  // module scope` before running a single browser test — which is why the gate
  // could only ever be run one file at a time. They stay out of the browser gate;
  // `pnpm parity` / `pnpm edit:coverage` run them under vitest.
  testIgnore: VITEST_ONLY,
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
      // A project-level `testIgnore` REPLACES the top-level one — it does not merge.
      // So the parity-corpus exclusion has to be repeated here, or the vitest-only
      // harnesses get collected again and the gate dies on `require is not defined`
      // before running a single browser test (the #876 breakage, restored by hand).
      testIgnore: [...VITEST_ONLY, ...MEASUREMENT_SPECS],
    },
    {
      name: 'measurement',
      use: { browserName: 'chromium' },
      testMatch: MEASUREMENT_SPECS,
      // Alone on the GPU: never alongside each other…
      workers: 1,
      // …and never alongside the other ~500 tests, which would otherwise run
      // concurrently with this project and re-create the very contention we are
      // removing.
      //
      // ⚠ `dependencies` also means: if the `chromium` project FAILS, this project
      // is SKIPPED ENTIRELY — its 29 tests do not run and are not even reported as
      // skipped. The gate then prints a plausible-looking "375 passed" that is
      // simply a smaller suite. So ALWAYS reconcile the total: a complete run is
      // 531 + 29 = 560 (2026-07-20). If the count is short, tests were dropped,
      // not passed — and re-check this number when specs are added, because a
      // stale total makes a dropped-test run look like a normal one.
      //
      // Also budget for contention: a full parallel run reproducibly reports
      // ~15 failures that pass on a serial re-run of the same files (measured
      // 2026-07-20: 15 failed parallel → 1 failed serial). Most carry the same
      // signature — `[data-bottom-panel="root"]` never appearing, i.e. the app
      // never loaded, several workers deep. Re-run failures serially before
      // treating any of them as a product defect.
      dependencies: ['chromium'],
    },
  ],
  webServer: {
    command: 'pnpm dev',
    port: 3000,
    reuseExistingServer: true,
    timeout: 30000,
  },
})
