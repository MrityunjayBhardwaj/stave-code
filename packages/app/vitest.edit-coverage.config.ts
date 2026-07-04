import { defineConfig } from 'vitest/config'

// Maintainer-only measurement config for the edit-coverage harness. Kept out
// of the main app suite: the CI gate globs `.test.ts` (see vitest.config.ts
// `include`), while this harness is a `.spec.ts` run explicitly via
// `pnpm --filter @stave/app exec vitest run --config vitest.edit-coverage.config.ts`.
// Mirrors the parity harness's @strudel inline + kabelsalat stub defensively
// (the visualEdit oracle itself only needs acorn, but this keeps resolution
// byte-identical to the working parity config if a transitive import appears).
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/parity-corpus/edit-coverage.spec.ts'],
    server: { deps: { inline: [/@strudel\//] } },
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
