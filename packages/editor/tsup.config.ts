import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
  treeshake: true,
  splitting: false,
  // 20-17 A-1 (#141 / D-01 / P68): keep function + parameter names through
  // any (future) minification so the pervasive `bindings` optional-arg
  // refactor is a minification-STABLE P68 build-hygiene anchor. Without
  // this, grepping `bindings` in dist after a CORRECT refactor would
  // false-negative once minify is ever enabled (the plan-checker MAJOR
  // dim 2/4). esbuild `keepNames` preserves the names verbatim.
  keepNames: true,
})
