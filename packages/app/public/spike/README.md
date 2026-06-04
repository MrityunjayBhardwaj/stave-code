# B-0 feasibility spike — p5 v2 in a Web Worker on an OffscreenCanvas

Issue **#235** (perf epic #228). Branch `perf/b0-worker-spike` → PRs into `performance`.

## The question (the fork that decides Phase B)

The #232 ablation pinned the viz bottleneck: the p5 WEBGL `draw()` is **CPU per-segment
line tessellation on the main thread**, and it **starves the audio scheduler**
(`trig/s` 8.4→4.8 — PV69/P101). The only architectural fix left is moving the renderer
**off the main thread → an OffscreenCanvas Web Worker (Phase B)**. But p5 expects
`window`/`document` and does NOT run in a worker out of the box — **unproven**. Spike
before architecting.

## Result: **YES** — observed, not inferred

`p5 v2.2.3` renders WEBGL into an OffscreenCanvas inside a dedicated Web Worker. The
sketch painted a green rect on a red field; the worker read back the canvas centre pixel
as `[0,255,0,255]` (green), `nonBlank=2048/2048` sampled, ~55fps (22 frames/400ms). The
per-frame draws are entirely worker-side — the main thread is free.

## What it takes (the minimal shim — grounded at each p5 source line)

p5 fails progressively; each failure was read in `p5.js` and fixed with the smallest shim:

1. **`window is not defined` at import** — `registerAddon(Ge)` calls `window.performance.now()`
   at module-eval (p5.js `Ge`). → install the `window`/`document` shim on the worker global
   **before** importing p5.
2. **Workers have no `requestAnimationFrame`** — p5's draw loop needs one. → setTimeout-backed
   rAF on the worker global.
3. **FES `fetchScript` → `reading 'src'`** (presetup) — p5's Friendly Error System reads a
   `<script>`'s `.src` (p5.js:97021), meaningless in a worker. → `p5.disableFriendlyErrors = true`
   (gated at p5.js:97043).
4. **`createCanvas` → `reading 'appendChild'`** — p5 creates `<main>`, then does
   `getElementsByTagName('main')[0].appendChild(canvas)` (p5.js:71123). → `getElementsByTagName`
   must actually **walk the fake DOM tree**, not return `[]`.
5. **`getContext('experimental-webgl')` invalid enum** — p5 creates a default **P2D** canvas
   first, then the user's **WEBGL** canvas. A single surface holds one context type, so the 2nd
   `getContext` returned null and p5 fell through to `experimental-webgl` (throws on OffscreenCanvas).
   → mint a **distinct** OffscreenCanvas per `createElement('canvas')`.
6. **`texImage2D … Overload resolution failed`** — native WebGL does a **branded** internal-slot
   check on its texture source; a `Proxy`-wrapped OffscreenCanvas is not recognised. → augment the
   **real** OffscreenCanvas instance in place (no Proxy); native APIs see a genuine OffscreenCanvas,
   p5's JS reads hit the patched DOM props.

Net shim surface (small, stable): a `window` (performance/innerWidth/addEventListener/rAF/
devicePixelRatio/screen), a `document` (createElement, tree-walking getElementsByTagName,
getElementById/querySelectorAll, readyState='complete', body/documentElement), `disableFriendlyErrors`,
one fresh OffscreenCanvas per canvas element, each augmented in place with DOM props.

## Files

- `p5-worker.js` — the staged, observe-first worker (S1 import → S2 bare → S3 shim → S4 draw+readback).
- `../../tests/b0-worker-spike.spec.ts` — Playwright driver: transfers a real OffscreenCanvas,
  collects the verdict, asserts the green-rect render. Self-provisions `p5.esm.min.js`.
- `p5.esm.min.js` — gitignored; copied from `packages/editor/node_modules/p5/lib/` by the test.

## Run

```
pnpm --filter @stave/app exec playwright test b0-worker-spike.spec.ts --reporter=line
```

## Not yet proven (Phase B pre-flight, not the fork)

- **Direct render into the *transferred* canvas** (on-screen): proven feasible in principle
  (transferControlToOffscreen available; p5 renders into worker OffscreenCanvases fine) but the
  spike reads back a worker-local canvas. Phase B wires the transferred canvas as p5's main
  WEBGL surface (route it to the canvas whose `getContext` is `webgl2`).
- **COOP/COEP for SharedArrayBuffer** (Q2): Next 16.2.1 supports `async headers()` in
  `next.config.ts` (mechanism confirmed). Whether it breaks superdough/AudioWorklet/fonts/embeds
  must be observed — make it the first Phase B task.
- **hydra-synth in a worker** (Q3, fallback path): not spiked; lower priority now that the
  primary (p5) path is YES.
