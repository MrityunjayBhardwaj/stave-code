---
phase: 02-pianoroll-visualizers
plan: "01"
subsystem: visualizers
tags: [p5js, pianoroll, hooks, tdd, canvas]
dependency_graph:
  requires: []
  provides:
    - packages/editor/src/visualizers/types.ts
    - packages/editor/src/visualizers/useP5Sketch.ts
    - packages/editor/src/visualizers/sketches/PianorollSketch.ts
    - packages/editor/src/visualizers/sketches/ScopeSketch.ts
    - packages/editor/src/visualizers/sketches/SpectrumSketch.ts
    - packages/editor/src/visualizers/sketches/SpiralSketch.ts
    - packages/editor/src/visualizers/sketches/PitchwheelSketch.ts
  affects: []
tech_stack:
  added:
    - p5@2.2.3
    - "@types/p5@1.7.7"
  patterns:
    - SketchFactory pattern — hapStreamRef + analyserRef refs passed to p5 sketch via closure
    - ResizeObserver wired in same useEffect as p5 instance for responsive resize
    - Pure exported functions for math logic (getNoteX, getNoteY, getColor) enabling unit testing without p5
key_files:
  created:
    - packages/editor/src/visualizers/types.ts
    - packages/editor/src/visualizers/useP5Sketch.ts
    - packages/editor/src/visualizers/sketches/PianorollSketch.ts
    - packages/editor/src/visualizers/sketches/ScopeSketch.ts
    - packages/editor/src/visualizers/sketches/SpectrumSketch.ts
    - packages/editor/src/visualizers/sketches/SpiralSketch.ts
    - packages/editor/src/visualizers/sketches/PitchwheelSketch.ts
    - packages/editor/src/__tests__/PianorollSketch.test.ts
    - packages/editor/src/__tests__/useP5Sketch.test.ts
  modified:
    - packages/editor/package.json
decisions:
  - "Unknown/unrecognized instrument sounds (s field) fall back to --accent (#8b5cf6), not --stem-melody — no melody branch in getColor()"
  - "ResizeObserver is created in the same useEffect as the p5 instance to share cleanup closure"
  - "Pure math functions (getNoteX, getNoteY, getColor, isDrumSound, getDrumSlot) are exported from PianorollSketch for direct unit testing without p5 mock complexity"
metrics:
  duration: "3 minutes"
  completed_date: "2026-03-22"
  tasks_completed: 1
  files_created: 9
  files_modified: 1
---

# Phase 02 Plan 01: Visualizer Foundation — p5 Hook, PianorollSketch, and Stubs Summary

**One-liner:** p5@2.2.3 installed, `useP5Sketch` hook with ResizeObserver, `PianorollSketch` with pure math functions for 6s rolling window and MIDI-to-pixel mapping, and 4 Phase 3 stub sketches — 40 tests passing.

## What Was Built

### types.ts
Defines `SketchFactory` (the function signature all sketch factories must follow) and `VizMode` (union of `'pianoroll' | 'scope' | 'spectrum' | 'spiral' | 'pitchwheel'`). These types are the shared contract between the hook and all visualizer implementations.

### useP5Sketch.ts
React hook that:
1. Takes `containerRef`, `sketchFactory`, `hapStream`, and `analyser`
2. Maintains `hapStreamRef` and `analyserRef` for data flowing via ref (not re-creating p5 on data changes)
3. Creates `new p5(sketch, containerRef.current)` on mount
4. Wires a `ResizeObserver` in the same effect to call `instance.resizeCanvas(width, height)` on container resize
5. Cleanup: `ro.disconnect()` then `instance.remove()`

### PianorollSketch.ts
Full pianoroll sketch factory plus exported pure math functions:
- `getNoteX(audioTime, now, canvasWidth)` — maps audio time to x-pixel in 6s rolling window
- `getNoteY(midiNote, pitchAreaHeight)` — maps MIDI 24..96 to y-pixel (24=bottom, 96=top)
- `getColor(event, tokens)` — color priority: user `.color()` > drums > bass > pad > accent fallback
- `isDrumSound(s)` — prefix-based drum detection (bd2 matches bd, etc.)
- `getDrumSlot(s)` — assigns drum to visual lane (0=bd, 1=sd, 2=hh, ..., 4=fallback)
- `PianorollSketch(hapStreamRef, analyserRef)` — factory returning p5 sketch with HapStream subscription

### Stub Sketches
`ScopeSketch`, `SpectrumSketch`, `SpiralSketch`, `PitchwheelSketch` — each exports a `SketchFactory`-shaped function rendering a solid background. Ready for Phase 3 implementation.

## Tests

| Suite | Tests | Result |
|-------|-------|--------|
| PianorollSketch.test.ts | 21 | PASS |
| useP5Sketch.test.ts | 6 | PASS |
| WavEncoder.test.ts | 5 | PASS |
| useHighlighting.test.ts | 8 | PASS |
| **Total** | **40** | **PASS** |

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| 1b0ac9a | test(02-01) | Add failing tests for PianorollSketch and useP5Sketch (RED) |
| d542056 | feat(02-01) | Implement p5 visualizer foundation with pianoroll and stubs (GREEN) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed vi.mock hoisting issue in useP5Sketch.test.ts**
- **Found during:** TDD RED → GREEN transition (running tests)
- **Issue:** `vi.mock('p5', ...)` factory referenced `MockP5Constructor` variable declared outside but after the mock call — Vitest hoists `vi.mock` so the variable wasn't initialized yet, causing `ReferenceError: Cannot access 'MockP5Constructor' before initialization`
- **Fix:** Rewrote the test to use an instance array (`p5Instances`) populated from inside the mock factory. The constructor mock uses `vi.fn()` with `this` assignment. `MockP5Constructor` is then obtained by re-importing `p5` after the mock is registered.
- **Files modified:** packages/editor/src/__tests__/useP5Sketch.test.ts
- **Commit:** d542056

## Known Stubs

| File | What's Stubbed | Reason | Plan to Resolve |
|------|---------------|--------|-----------------|
| packages/editor/src/visualizers/sketches/ScopeSketch.ts | Renders solid background only | Phase 3 scope | Phase 03 |
| packages/editor/src/visualizers/sketches/SpectrumSketch.ts | Renders solid background only | Phase 3 scope | Phase 03 |
| packages/editor/src/visualizers/sketches/SpiralSketch.ts | Renders solid background only | Phase 3 scope | Phase 03 |
| packages/editor/src/visualizers/sketches/PitchwheelSketch.ts | Renders solid background only | Phase 3 scope | Phase 03 |

These stubs are intentional. The plan's stated objective includes "Phase 3 sketch stubs" — these are correctly in scope as stubs. The VizPanel in Plan 02 will be able to select and render these sketches with the correct factory signature. Full audio visualizer implementations are Phase 3 work.

## Self-Check: PASSED

All created files verified:
- packages/editor/src/visualizers/types.ts — EXISTS
- packages/editor/src/visualizers/useP5Sketch.ts — EXISTS
- packages/editor/src/visualizers/sketches/PianorollSketch.ts — EXISTS
- packages/editor/src/visualizers/sketches/ScopeSketch.ts — EXISTS
- packages/editor/src/visualizers/sketches/SpectrumSketch.ts — EXISTS
- packages/editor/src/visualizers/sketches/SpiralSketch.ts — EXISTS
- packages/editor/src/visualizers/sketches/PitchwheelSketch.ts — EXISTS
- packages/editor/src/__tests__/PianorollSketch.test.ts — EXISTS
- packages/editor/src/__tests__/useP5Sketch.test.ts — EXISTS

Commits verified: 1b0ac9a (RED tests), d542056 (GREEN implementation) — both in git log.
