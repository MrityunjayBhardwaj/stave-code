---
phase: 8
plan: 3
title: "DemoEngine + conformance tests + integration verification"
status: complete
duration: "3m 6s"
tasks_completed: 4
tasks_total: 4
---

# Summary: 08-03 DemoEngine, Conformance Tests, Integration

## Outcome
All 4 tasks completed. DemoEngine proves the LiveCodingEngine protocol works for non-Strudel engines. Conformance tests validate any implementation against the interface contract. VizPicker filtering verified: pianoroll/wordfall disabled (require queryable), scope/spectrum/spiral/pitchwheel enabled.

## Commits
| Hash | Message |
|------|---------|
| 81435b8 | feat(engine): add DemoEngine implementing LiveCodingEngine |
| 7ebb8f2 | test(engine): add LiveCodingEngine conformance test suite |
| 996da32 | feat(engine): export DemoEngine + integration tests for VizPicker filtering |
| fd61e68 | test(engine): add StrudelEngine LiveCodingEngine conformance tests |

## Key Decisions
1. **packages/app is a git submodule** -- created integration test in packages/editor instead of DemoPage in app
2. **AudioContext mock** -- minimal class mock covering createAnalyser, createGain, createOscillator, resume, close, destination, currentTime
3. **Conformance test as factory pattern** -- `conformanceSuite(name, factory)` allows future engines to be plugged in by adding one line

## Verification
- `npx tsc --noEmit`: zero errors
- `npx vitest run`: 140 tests pass across 12 files, zero failures
- DemoEngine exported from @motif/editor
- DemoEngine.components: streaming + audio + inlineViz, NO queryable
- VizPicker correctly disables pianoroll/wordfall for DemoEngine

## Deviations
None. All tasks executed as planned.

## Files Created/Modified
- **Created**: `packages/editor/src/engine/DemoEngine.ts` (193 lines)
- **Created**: `packages/editor/src/engine/LiveCodingEngine.conformance.test.ts` (277 lines)
- **Created**: `packages/editor/src/engine/DemoEngine.integration.test.ts` (176 lines)
- **Modified**: `packages/editor/src/index.ts` (added DemoEngine export)
- **Modified**: `packages/editor/src/engine/StrudelEngine.test.ts` (added 3 conformance tests)
