---
phase: 06-inline-zones-via-abstraction
plan: 01
subsystem: engine + visualizers
tags: [viz, prototype-intercept, inline-zones, opt-in, pattern-capture]
dependency_graph:
  requires: [Phase 05-per-track-data]
  provides: [getVizRequests, addInlineViewZones-opt-in]
  affects: [StrudelEngine, viewZones, StrudelEditor]
tech_stack:
  added: []
  patterns: [Pattern.prototype setter-intercept, _pendingViz tag pattern, factory-from-descriptor lookup]
key_files:
  created: []
  modified:
    - packages/editor/src/engine/StrudelEngine.ts
    - packages/editor/src/visualizers/viewZones.ts
    - packages/editor/src/__tests__/viewZones.test.ts
    - packages/editor/src/StrudelEditor.tsx
decisions:
  - ".viz() capture via _pendingViz tagging in prototype — ordering problem (.viz before .p) solved by tagging instance then resolving in .p() wrapper"
  - "Legacy ._pianoroll() etc. aliased to .viz() for Strudel code compatibility"
  - "addInlineViewZones now opt-in only — only tracks in vizRequests map get zones"
  - "Last-line detection via forward-scan heuristic for multi-line pattern blocks"
  - "Rule 3 auto-fix: StrudelEditor.tsx updated to use getVizRequests() instead of inlinePianoroll prop"
metrics:
  duration: ~10m
  completed: "2026-03-23"
  tasks: 2
  files: 4
requirements: [ZONE-01, ZONE-02, ZONE-03]
---

# Phase 06 Plan 01: .viz() Opt-In Capture and addInlineViewZones Refactor Summary

**One-liner:** Per-pattern .viz("name") opt-in inline zone system via _pendingViz prototype-intercept pattern, factory resolved from VizDescriptor[] by name.

## What Was Built

Replaced the blanket `inlinePianoroll={true}` flag with a per-pattern `.viz("name")` opt-in system. Only patterns where the user writes `.viz("pianoroll")` (or `.viz("scope")`, etc.) get an inline Monaco view zone. The viz type is resolved dynamically from `VizDescriptor[]` by name, so any registered viz mode can be used inline.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Register .viz() capture in StrudelEngine.evaluate(), add getVizRequests() | 6bf14ae | packages/editor/src/engine/StrudelEngine.ts |
| 2 | Refactor addInlineViewZones to opt-in via vizRequests+vizDescriptors, update all tests | c508a1a | packages/editor/src/visualizers/viewZones.ts, packages/editor/src/__tests__/viewZones.test.ts, packages/editor/src/StrudelEditor.tsx |

## Technical Approach

### .viz() Capture (Task 1)

The `.viz()` method is registered on `Pattern.prototype` inside `evaluate()` using the same setter-intercept mechanism used for `.p` in Phase 5. The key challenge: `.viz("pianoroll")` fires BEFORE `.p("$")` in the chain (`$: expr.viz("pianoroll")` transpiles to `expr.viz("pianoroll").p('$')`).

**Solution:** The `_pendingViz` tagging pattern:
1. `.viz(vizName)` sets `this._pendingViz = vizName` and returns `this`
2. In the existing `.p()` wrapper, after `capturedPatterns.set(captureId, this)`, check for `_pendingViz` and record `capturedVizRequests.set(captureId, this._pendingViz)`

Legacy methods `._pianoroll()`, `._scope()`, etc. are aliased to `.viz("name")` for Strudel code compatibility.

### addInlineViewZones Refactor (Task 2)

Function signature changed from 5 params (with `source: VizRendererSource`) to 6 params (with `vizRequests: Map<string, string>` and `vizDescriptors: VizDescriptor[]`).

Key changes:
- **Opt-in gate:** `const vizName = vizRequests.get(key); if (!vizName) return` skips tracks without a viz request
- **Factory dispatch:** `vizDescriptors.find(d => d.id === vizName)` resolves the factory per-zone
- **Last-line detection:** Forward-scan heuristic finds the last continuation line of a pattern block for accurate zone placement
- **Unknown viz warning:** `console.warn('[motif] Unknown viz name: ...')` for unrecognized viz names

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated StrudelEditor.tsx to compile with new viewZones signature**
- **Found during:** Task 2 verification (TypeScript compile)
- **Issue:** StrudelEditor.tsx called `addInlineViewZones` with the old 5-param signature including `source: VizRendererSource`
- **Fix:** Updated the inline zone wiring to use `engine.getVizRequests()` instead of `_inlinePianoroll` flag; removed `currentSource` from the call; updated dependency array
- **Files modified:** packages/editor/src/StrudelEditor.tsx
- **Commit:** c508a1a

## Test Results

All 16 viewZones tests pass:
- 13 existing tests migrated to new 6-param signature
- 3 new tests added:
  - "adds zone only for $: lines present in vizRequests" — opt-in filtering
  - "logs warning and skips zone for unknown vizName" — warning behavior
  - "places zone after last line of multi-line pattern block" — last-line detection

## Known Stubs

None — all functionality is wired through the complete data path.

## Self-Check: PASSED

- packages/editor/src/engine/StrudelEngine.ts — FOUND (getVizRequests, _pendingViz, legacyVizNames all present)
- packages/editor/src/visualizers/viewZones.ts — FOUND (vizRequests.get, descriptor.factory, lastLineIdx, console.warn all present)
- packages/editor/src/__tests__/viewZones.test.ts — FOUND (16 tests all pass)
- Commits 6bf14ae and c508a1a — FOUND in git log
