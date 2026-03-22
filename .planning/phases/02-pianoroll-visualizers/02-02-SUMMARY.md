---
phase: 02-pianoroll-visualizers
plan: 02
subsystem: ui
tags: [react, p5, vitest, testing-library, visualizers, components]

# Dependency graph
requires:
  - phase: 02-01
    provides: useP5Sketch hook with ResizeObserver, types.ts with VizMode and SketchFactory

provides:
  - VizPanel component — container div hosting p5 canvas via useP5Sketch
  - VizPicker component — 32px mode-switching strip with 5 SVG icon buttons
  - React Testing Library tests for both components (15 tests total)

affects: [02-03, 03-monaco-features]

# Tech tracking
tech-stack:
  added: []
  patterns: [TDD with React Testing Library, CSS var tokens only in component styles, useP5Sketch called by VizPanel not implementing its own canvas lifecycle]

key-files:
  created:
    - packages/editor/src/visualizers/VizPanel.tsx
    - packages/editor/src/visualizers/VizPicker.tsx
    - packages/editor/src/__tests__/VizPanel.test.tsx
    - packages/editor/src/__tests__/VizPicker.test.tsx
  modified: []

key-decisions:
  - "VizPanel does not contain ResizeObserver — useP5Sketch (Plan 01) handles canvas resize internally"
  - "MODES array defined after icon functions to keep icons close to their usage context"
  - "data-active attribute set to 'true' string (not boolean) to match HTML attribute conventions for testing"

patterns-established:
  - "TDD: write failing test first, commit, implement to green, commit"
  - "Component mocks in tests: vi.mock useP5Sketch to isolate VizPanel from p5 side effects"
  - "CSS-only: all styles use var(--*) tokens — no hardcoded hex values in components"

requirements-completed: [UI-01, UI-02, UI-03, UI-04]

# Metrics
duration: 2min
completed: 2026-03-22
---

# Phase 02 Plan 02: VizPanel and VizPicker React Components Summary

**VizPanel container hosting p5 canvas via useP5Sketch, and VizPicker 32px mode-strip with 5 SVG icon buttons and active accent styling**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-22T04:29:08Z
- **Completed:** 2026-03-22T04:30:39Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- VizPanel renders a styled container div (height via vizHeight prop, default 200px) that delegates p5 canvas lifecycle to useP5Sketch — no ResizeObserver in VizPanel itself
- VizPicker renders a 32px strip with 5 SVG icon buttons (pianoroll, scope, spectrum, spiral, pitchwheel), active state styled with accent-dim background and accent outline
- Full React Testing Library test coverage: 6 tests for VizPanel, 9 tests for VizPicker, all passing alongside 55 total tests in the package

## Task Commits

Each task was committed atomically:

1. **Task 1: VizPanel tests (RED)** — `79f0b1f` (test)
2. **Task 1: VizPanel implementation (GREEN)** — `2a9b3bc` (feat)
3. **Task 2: VizPicker tests (RED)** — `a07169f` (test)
4. **Task 2: VizPicker implementation (GREEN)** — `ec2fa49` (feat)

_Note: TDD tasks produced separate test and feat commits per task._

## Files Created/Modified

- `packages/editor/src/visualizers/VizPanel.tsx` — Container component hosting p5 canvas via useP5Sketch; vizHeight prop controls height
- `packages/editor/src/visualizers/VizPicker.tsx` — 32px mode-picker strip with 5 SVG icon buttons, active-state accent styling, showVizPicker hide toggle
- `packages/editor/src/__tests__/VizPanel.test.tsx` — 6 RTL tests for VizPanel styles and data-testid
- `packages/editor/src/__tests__/VizPicker.test.tsx` — 9 RTL tests for VizPicker buttons, active state, click handler, and showVizPicker prop

## Decisions Made

- VizPanel contains no ResizeObserver — useP5Sketch (Plan 01) already owns the canvas resize loop, keeping VizPanel purely declarative
- Icon functions (PianorollIcon, ScopeIcon, etc.) are defined before the MODES array so no forward-reference issues at runtime
- `data-active` uses the string `'true'` rather than a boolean attribute to match DOM attribute conventions used in tests

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — all tests passed first run after implementation.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- VizPanel and VizPicker are ready for Plan 03 to wire into StrudelEditor
- Both components accept the full prop surface Plan 03 needs: sketchFactory, hapStream, analyser, activeMode, onModeChange, showVizPicker
- All 55 editor package tests pass

---
*Phase: 02-pianoroll-visualizers*
*Completed: 2026-03-22*

## Self-Check: PASSED

- FOUND: packages/editor/src/visualizers/VizPanel.tsx
- FOUND: packages/editor/src/visualizers/VizPicker.tsx
- FOUND: packages/editor/src/__tests__/VizPanel.test.tsx
- FOUND: packages/editor/src/__tests__/VizPicker.test.tsx
- FOUND commit: 79f0b1f (test: VizPanel RED)
- FOUND commit: 2a9b3bc (feat: VizPanel GREEN)
- FOUND commit: a07169f (test: VizPicker RED)
- FOUND commit: ec2fa49 (feat: VizPicker GREEN)
