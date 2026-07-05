import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // Exclude Playwright specs (they live under packages/app/tests/) — they
    // import from `@playwright/test` and are not vitest-runnable.
    //
    // Phase 20-14 γ-2: the parity corpus spec lives under
    // `tests/parity-corpus/` alongside the vendored `.strudel` fixtures —
    // include that subdirectory explicitly. The corresponding `exclude`
    // entry below targets `tests/*.spec.ts` (Playwright glob) rather than
    // the whole `tests/` tree.
    include: [
      'src/**/__tests__/**/*.test.{ts,tsx}',
      'tests/parity-corpus/**/*.test.{ts,tsx}',
    ],
    exclude: ['node_modules', 'tests/*.spec.ts', '.next'],
    // App-package projection helpers are pure functions that import
    // PatternIR types from @stave/editor. Real Strudel parsing in tests
    // means we still need the @strudel transitive imports to resolve via
    // vite-node — mirror the editor's stub + inline pattern.
    server: {
      deps: {
        // `gifenc` is a CJS module the editor barrel pulls in (GIF export /
        // trackColor); inlining lets Vite fix its named-export interop so
        // tests importing editor runtime (e.g. the settings adapters) load.
        inline: [/@strudel\//, "gifenc"],
      },
    },
  },
  resolve: {
    alias: {
      '@kabelsalat/web': new URL(
        '../editor/test/stubs/kabelsalat-web.mjs',
        import.meta.url,
      ).pathname,
    },
  },
})
