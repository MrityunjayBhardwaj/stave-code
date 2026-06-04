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

---

# Phase B pre-flight — Q2 + Q3 (issue #237)

## Q3 — hydra-synth in a worker: **YES**

`hydra-worker.js` (classic worker, `importScripts` the self-contained UMD bundle) renders an
`osc().rotate().out()` into the **transferred** OffscreenCanvas — 12 ticks, full rainbow
gradient, `nonBlank=2048/2048`. Driver: `tests/b-preflight-hydra.spec.ts`.

**Confirmed the prediction: hydra needs a far smaller shim than p5 — only 2 conditions vs p5's 6:**
1. install the shim **before** `importScripts` (hydra touches `window` at module-eval —
   `mouseListen` adds a mousemove listener, hydra-synth.js:3926).
2. `window = self` alias + a thin `document` + size props. That's it.

No FES, no multi-canvas dance, no Proxy-vs-native issue — because hydra takes the canvas
**explicitly** (`new Hydra({ canvas })`, hydra-synth.js:235 `if (canvas) this.canvas = canvas`)
and `makeGlobal/autoLoop/detectAudio/enableStreamCapture = false` strip the rest. Note hydra
rendered **directly into the transferred canvas** (the real on-screen path), unlike the p5 spike
which read back a worker-local surface.

## Q2 — COOP/COEP for SharedArrayBuffer without breaking audio: **YES (with credentialless)**

`next.config.ts` sets `COOP=same-origin` + `COEP=credentialless`. Observed
(`tests/b-preflight-coep.spec.ts`, dev server restarted with the headers):
`crossOriginIsolated=true`, `SharedArrayBuffer` allocatable, `audioContext.state=running`,
`audio.triggers=15 (~4.3/s)`, **COEP-blocked requests = 0** (the strudel.cc sample packs still load).

**Key: `credentialless`, NOT `require-corp`.** `require-corp` would block every cross-origin
subresource lacking a CORP header — including the CDN sample packs — silencing drums.
`credentialless` sends cross-origin no-cors requests without credentials but allows them, so
isolation + samples coexist. ⇒ SAB is viable for Phase B's per-frame signal transport.

### ⚠️ NOT yet tested under isolation (Phase B must check before performance→main)
- **OAuth popups / `window.opener`.** COOP `same-origin` (required for `crossOriginIsolated`)
  can break popup-based OAuth (`window.opener`/`postMessage`). The app has Google OAuth (PM
  signup) — **untested here.** If it's a popup flow, COOP same-origin breaks it; a redirect flow
  is fine. Verify; if it breaks, the SAB plan must reconcile with OAuth (or use a redirect flow).
- **Fonts / embeds / images** from cross-origin origins — credentialless should be fine, but only
  audio + samples were exercised.
- **Browser support:** COEP `credentialless` is Chromium-only-ish (no Safari < 16.4). Phase B must
  feature-detect `crossOriginIsolated` and **degrade to transferable-ArrayBuffer postMessage** when SAB is absent.

## Still open for Phase B proper (not the forks)
- **Direct render into the transferred canvas for p5** (hydra already proven): route the transferred
  canvas to the surface whose `getContext` is `webgl2`.
- **One shared worker vs a pool** — decide by the matrix (`trig/s` recovery + frameP95).
