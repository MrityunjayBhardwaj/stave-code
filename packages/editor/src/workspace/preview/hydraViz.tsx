/**
 * HYDRA_VIZ — Phase 10.2 Task 06 preview provider for `.hydra` files.
 *
 * Thin adapter on top of `createCompiledVizProvider`. The shared helper
 * owns the compile-on-reload + mount-on-mount mechanics; this file just
 * declares the HYDRA identity:
 *
 *   - extensions: `.hydra`
 *   - label:       `'Hydra Visualization'`
 *   - renderer:    `'hydra'` (fed to `compilePreset`)
 *
 * Inherits D-03 (`keepRunningWhenHidden: false`) and D-07 (`reload:
 * 'debounced'`, `debounceMs: 300`) from the helper. Demo-mode fallback
 * (P7) is handled by `HydraVizRenderer`'s internal fallback chain — see
 * `compiledVizProvider.tsx` for the full rationale.
 *
 * @remarks
 * The entire body is one function call because hydra and p5 share the
 * reload lifecycle. A future format with different reload semantics
 * (e.g., GLSL with a "recompile only on save" button) would NOT use this
 * path — it would call the registry directly with its own render
 * function.
 */

import { createCompiledVizProvider } from './compiledVizProvider'

export const HYDRA_VIZ = createCompiledVizProvider({
  extensions: ['hydra'],
  label: 'Hydra Visualization',
  renderer: 'hydra',
})
