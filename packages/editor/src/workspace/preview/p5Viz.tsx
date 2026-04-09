/**
 * P5_VIZ — Phase 10.2 Task 06 preview provider for `.p5` files.
 *
 * Thin adapter on top of `createCompiledVizProvider`. See
 * `hydraViz.tsx` for the rationale — the two providers are mirror images
 * of each other, and all the machinery lives in the shared helper.
 *
 *   - extensions: `.p5`
 *   - label:       `'p5 Visualization'`
 *   - renderer:    `'p5'` (fed to `compilePreset`)
 *
 * Demo-mode fallback (P7) works via the bundled p5 template's
 * `scheduler?.now() ?? 0` / `scheduler?.query(...) ?? []` optional-chaining
 * paths — when `ctx.audioSource` is null, the empty component bag means
 * `scheduler` is `null` and the user code hits its else branches
 * naturally. No provider-level overlay needed.
 */

import { createCompiledVizProvider } from './compiledVizProvider'

export const P5_VIZ = createCompiledVizProvider({
  extensions: ['p5'],
  label: 'p5 Visualization',
  renderer: 'p5',
})
