---
phase: 02-pianoroll-visualizers
plan: 03
subsystem: ui
tags: [react, p5, monaco, view-zones, vitest, visualizers, integration]

# Dependency graph
requires:
  - phase: 02-01
    provides: useP5Sketch, PianorollSketch, ScopeSketch, SpectrumSketch, SpiralSketch, PitchwheelSketch, types.ts
  - phase: 02-02
    provides: VizPanel, VizPicker components

provides:
  - viewZones.ts — imperative addInlineViewZones function for Monaco inline pianoroll
  - StrudelEditor.tsx — updated with VizPanel, VizPicker, view zone integration, analyser state
  - index.ts — updated public exports for all visualizer components and types

affects: [03-monaco-features]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Imperative module pattern: viewZones.ts exports addInlineViewZones (not a hook, no use* prefix)"
    - "Plain object refs (not React.useRef) in imperative functions for p5 sketch factories"
    - "setAnalyser() state for React VizPanel, but direct engine.getAnalyser() synchronous call for view zones — bypasses React render cycle timing"
    - "viewZoneCleanupRef pattern: store cleanup fn in ref, call before adding new zones"

key-files:
  created:
    - packages/editor/src/visualizers/viewZones.ts
    - packages/editor/src/__tests__/viewZones.test.ts
  modified:
    - packages/editor/src/StrudelEditor.tsx
    - packages/editor/src/index.ts

key-decisions:
  - "viewZones.ts is named as an imperative module (not useViewZones.ts) — hooks use 'use*' prefix only"
  - "addInlineViewZones receives engine.getAnalyser() synchronously to bypass React state timing for view zones"
  - "setAnalyser() state update triggers re-render for VizPanel; PianorollSketch fallback to performance.now() covers the first frame"
  - "viewZoneCleanupRef stores cleanup fn — caller calls it before addInlineViewZones on each evaluate() cycle"

requirements-completed: [PIANO-06, PIANO-07, UI-02]

# Metrics
duration: 3min
completed: 2026-03-22
---

# Phase 02 Plan 03: StrudelEditor Wiring + viewZones Integration Summary

**Full pianoroll visualizer system wired: VizPicker strip + VizPanel rolling canvas + inline Monaco view zones below $: lines, all with correct imperative/declarative patterns**

## Performance

- **Duration:** ~3 min
- **Completed:** 2026-03-22
- **Tasks:** 2 (1 auto TDD + 1 checkpoint:human-verify auto-approved)
- **Files modified:** 4

## Accomplishments

- Created `viewZones.ts` exporting the imperative `addInlineViewZones` function — scans Monaco editor model for `$:` lines, adds 120px p5 pianoroll view zones below each, returns a cleanup function
- Updated `StrudelEditor.tsx` with: VizPicker strip between Toolbar and Monaco, VizPanel below Monaco (when visualizer != 'off'), analyser state, SKETCH_MAP for mode switching, view zone cleanup on stop/re-evaluate, `showVizPicker` and `vizSketch` props
- Updated `index.ts` with all visualizer exports: VizPanel, VizPicker, SketchFactory, VizMode, and all 5 sketch factory functions
- Removed old `coming in Phase 3/4` placeholder div
- 8 new viewZones unit tests pass; all 63 total package tests pass

## Task Commits

1. **Task 1: viewZones RED test** — `34e7b6e` (test)
2. **Task 1: GREEN implementation** — `7f3ef01` (feat)
3. **Task 2: human-verify** — auto-approved (auto_advance: true)

## Files Created/Modified

- `packages/editor/src/visualizers/viewZones.ts` — Imperative function `addInlineViewZones` that scans for `$:` lines and mounts 120px p5 pianoroll zones; returns cleanup fn
- `packages/editor/src/__tests__/viewZones.test.ts` — 8 unit tests covering zone creation, heightInPx 120, cleanup, no-model edge case, correct afterLineNumber
- `packages/editor/src/StrudelEditor.tsx` — Wired VizPicker + VizPanel + view zones; layout order: Toolbar > VizPicker > editor > VizPanel
- `packages/editor/src/index.ts` — Added exports for VizPanel, VizPicker, SketchFactory, VizMode, and all 5 sketch factories

## Decisions Made

- `viewZones.ts` is named as an imperative module (not `useViewZones.ts`) — the project reserves `use*` prefix for React hooks only
- `addInlineViewZones` receives `engine.getAnalyser()` synchronously (not the React analyser state) — this guarantees view zones get a valid analyser immediately without waiting for the next render cycle
- `setAnalyser()` React state update drives VizPanel; `PianorollSketch` handles `analyserRef.current?.context.currentTime ?? performance.now() / 1000` to cover the first render frame before state propagates
- `viewZoneCleanupRef` stores the cleanup function in a React ref — caller calls it before each new `addInlineViewZones` invocation to prevent zone accumulation

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — all 63 tests passed after implementation.

## User Setup Required

To verify visually: run `pnpm dev --filter app` and check VizPicker strip, VizPanel rolling canvas, and inline pianorolls below `$:` lines.

## Next Phase Readiness

- Phase 02 complete — all visualizer components integrated into StrudelEditor
- Phase 03 (Monaco features) can proceed independently
- All 63 editor package tests pass

---
*Phase: 02-pianoroll-visualizers*
*Completed: 2026-03-22*

## Self-Check: PASSED

- FOUND: packages/editor/src/visualizers/viewZones.ts
- FOUND: packages/editor/src/__tests__/viewZones.test.ts
- FOUND: packages/editor/src/StrudelEditor.tsx (modified)
- FOUND: packages/editor/src/index.ts (modified)
- FOUND commit: 34e7b6e (test: viewZones RED)
- FOUND commit: 7f3ef01 (feat: GREEN implementation)
