import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // `tests/parity-corpus/` holds the maintainer-only VITEST harnesses (the parse-
  // parity and edit-coverage measurements). They match Playwright's default
  // testMatch (`*.spec.ts` / `*.test.ts`), so without this a bare
  // `npx playwright test` collects them and dies on `require is not defined in ES
  // module scope` before running a single browser test — which is why the gate
  // could only ever be run one file at a time. They stay out of the browser gate;
  // `pnpm parity` / `pnpm edit:coverage` run them under vitest.
  testIgnore: ['**/parity-corpus/**'],
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: {
    command: 'pnpm dev',
    port: 3000,
    reuseExistingServer: true,
    timeout: 30000,
  },
})
