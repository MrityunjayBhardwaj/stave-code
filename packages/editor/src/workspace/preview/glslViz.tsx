/**
 * GLSL_VIZ — preview provider for `.glsl` files (issue #287).
 *
 * Thin adapter on top of `createCompiledVizProvider`, the mirror image of
 * `p5Viz.tsx` / `hydraViz.tsx` — all the machinery (compile-on-reload, the
 * stable-descriptor memo, the editor chrome) lives in the shared helper. This
 * is the editor surface for the GLSL renderer (issue #281): a `.glsl` file's
 * source is a ShaderToy `mainImage` or raw `void main()`, fed straight to
 * `compilePreset` → `makeGLSLRenderer`.
 *
 *   - extensions: `.glsl`
 *   - label:       `'GLSL Visualization'`
 *   - renderer:    `'glsl'` (fed to `compilePreset`)
 *
 * Demo-mode (no attached pattern) works the same as p5/hydra: with an empty
 * component bag the shader still animates off `iTime` and simply reads a silent
 * `iChannel0` / zero `u*` uniforms — no provider-level overlay needed.
 */

import { createCompiledVizProvider } from './compiledVizProvider'

export const GLSL_VIZ = createCompiledVizProvider({
  extensions: ['glsl'],
  label: 'GLSL Visualization',
  renderer: 'glsl',
})
