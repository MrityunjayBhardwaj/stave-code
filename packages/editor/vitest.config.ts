import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      // Strudel's repl.mjs imports `SalatRepl` from `@kabelsalat/web`, which
      // ships a CJS UMD as its `main` field. Under vite-node Node-resolves
      // the package to that UMD and the static ESM linker rejects the named
      // import before any test setup runs. We never use the REPL surface
      // during tests, so redirect the import to a tiny ESM stub. This lets
      // `evalScope(core, mini); evaluate(code)` work end-to-end via the
      // documented Strudel boot sequence (RESEARCH §6.1).
      '@kabelsalat/web': fileURLToPath(
        new URL('./test/stubs/kabelsalat-web.mjs', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    server: {
      // Force vite-node to transform these packages instead of externalising
      // them through Node's resolver — Node ignores Vite aliases for
      // transitive imports inside externalised node_modules.
      deps: {
        inline: [/@strudel\//],
      },
    },
  },
})
