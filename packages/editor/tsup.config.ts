import { defineConfig } from 'tsup'

export default defineConfig({
  // Two entries: the main editor bundle, and a SEPARATE worker-safe bundle
  // (`@stave/editor/worker`, Phase B / B-3) a Web Worker imports without dragging
  // the Monaco/React/yjs monolith into the worker chunk. `splitting: false` keeps
  // each entry a self-contained bundle; `p5` is `import()`'d lazily inside the
  // host (PV70 condition 1 — shim before p5 eval) so the final app bundler (Next)
  // emits it as the worker's own sub-chunk.
  // A THIRD entry (#1581): the value↔position map two packages share. The app's
  // stepped lane may not import the barrel at runtime — that drags a CommonJS
  // dependency into its test loader — so the map ships as its own tiny,
  // dependency-free bundle (`@stave/editor/knobScale`), the same arrangement the
  // worker entry uses for the same reason.
  // A FOURTH (#1679), for the same reason: what a track's label means — its id
  // and its mute marker — read by the app's timeline without the barrel.
  entry: [
    'src/index.ts',
    'src/visualizers/worker/index.ts',
    'src/visualEdit/panels/knobScale.ts',
    'src/ir/trackId.ts',
  ],
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
