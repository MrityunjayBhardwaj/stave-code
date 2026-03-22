---
phase: 06-inline-zones-via-abstraction
plan: 02
subsystem: ui + visualizers
tags: [viz, inline-zones, opt-in, inlinePianoroll-removal, viewZones, StrudelEditor]
dependency_graph:
  requires:
    - phase: 06-01
      provides: getVizRequests, addInlineViewZones opt-in signature
  provides:
    - inlinePianoroll prop completely removed from StrudelEditorProps
    - VizPanel source computed inline from vizDescriptors (no useMemo/currentSource)
    - Inline zones driven entirely by engine.getVizRequests() after evaluate
  affects: [StrudelEditor consumers, StrudelEditorClient demo]
tech-stack:
  added: []
  patterns: [inline factory lookup via vizDescriptors.find, prop removal as breaking change cleanup]
key-files:
  created: []
  modified:
    - packages/editor/src/StrudelEditor.tsx
    - packages/app/src/components/StrudelEditorClient.tsx
key-decisions:
  - "VizPanel source computed inline (vizDescriptors.find instead of useMemo currentSource) — removes the dependency on vizRenderer prop"
  - "inlinePianoroll and vizRenderer props removed as breaking change — replaced entirely by .viz() opt-in in pattern code"
patterns-established:
  - "Per-pattern .viz() opt-in is the only mechanism for inline zones — no blanket prop exists"
requirements-completed: [ZONE-04]
duration: 10min
completed: "2026-03-23"
---

# Phase 06 Plan 02: Remove inlinePianoroll and Wire vizRequests-Driven Zone Creation

**StrudelEditorProps cleaned of inlinePianoroll/vizRenderer props — inline zones now driven solely by engine.getVizRequests() after evaluate, with per-zone factory dispatch via vizDescriptors.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-23T00:00:00Z
- **Completed:** 2026-03-23
- **Tasks:** 1 auto + 1 checkpoint (auto-approved)
- **Files modified:** 2

## Accomplishments

- Removed `inlinePianoroll?: boolean` and `vizRenderer?: VizRendererSource` from `StrudelEditorProps` interface
- Removed `currentSource` useMemo block — VizPanel now computes source inline with `vizDescriptors.find(d => d.id === activeViz)?.factory`
- Removed `VizRendererSource` from type imports (no longer referenced)
- Removed `useMemo` from React import list (no longer used)
- `handlePlay` now exclusively calls `engine.getVizRequests()` to determine which patterns get inline zones
- Demo app `StrudelEditorClient.tsx` updated to remove deprecated `inlinePianoroll={true}` prop
- All 93 tests pass, TypeScript compiles with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove inlinePianoroll prop, wire vizRequests-driven zone creation** - `a83cc24` (feat)
   - Editor package: packages/editor/src/StrudelEditor.tsx
2. **Task 1 (app submodule): Remove inlinePianoroll from demo** - `49dcedf` (feat)
   - App submodule: packages/app/src/components/StrudelEditorClient.tsx
3. **Task 2: Checkpoint human-verify** - Auto-approved (auto_advance=true, no code changes)

**Plan metadata:** (docs commit — see state_updates below)

## Files Created/Modified

- `packages/editor/src/StrudelEditor.tsx` — Removed `inlinePianoroll`, `vizRenderer`, `currentSource`, `VizRendererSource` import, `useMemo` import; VizPanel source computed inline
- `packages/app/src/components/StrudelEditorClient.tsx` — Removed `inlinePianoroll={true}` prop from demo usage

## Decisions Made

- VizPanel `source` prop now computes inline via `vizDescriptors.find(d => d.id === activeViz)?.factory ?? vizDescriptors[0].factory` — this is simpler than a useMemo since `activeViz` and `vizDescriptors` are already stable across renders
- The `vizRenderer` prop (which allowed overriding the factory globally) is removed since the new per-zone factory dispatch via vizDescriptors makes it redundant

## Deviations from Plan

None — plan executed exactly as written. The `handlePlay` wiring with `getVizRequests()` was already in place from Wave 1 (06-01 Rule 3 auto-fix), so this plan's work was purely prop cleanup and interface narrowing.

## Known Stubs

None — all functionality is wired through the complete data path. Inline zones driven entirely by `.viz()` calls in pattern code.

## Issues Encountered

None. The packages/app directory is a git submodule, so the app commit required a separate `git commit` inside the submodule directory — handled cleanly.

## Next Phase Readiness

Phase 06 (inline-zones-via-abstraction) is now complete:
- Per-pattern `.viz("name")` opt-in system is fully wired end-to-end
- `StrudelEditorProps` is clean — no legacy blanket flags remain
- Inline zones pause on stop, resume on play, and use per-zone factory dispatch
- Visual verification checkpoint: dev server started at `localhost:3000` for manual testing

## Self-Check: PASSED

- packages/editor/src/StrudelEditor.tsx — FOUND (inlinePianoroll removed, getVizRequests wired, vizDescriptors passed to addInlineViewZones)
- packages/app/src/components/StrudelEditorClient.tsx — FOUND (inlinePianoroll={true} removed)
- .planning/phases/06-inline-zones-via-abstraction/06-02-SUMMARY.md — FOUND
- Commit a83cc24 — FOUND in git log (editor package)
- Commit 49dcedf — FOUND in app submodule git log

---
*Phase: 06-inline-zones-via-abstraction*
*Completed: 2026-03-23*
