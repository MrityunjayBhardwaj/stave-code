---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Completed 02-pianoroll-visualizers-02-PLAN.md
last_updated: "2026-03-22T04:31:36.862Z"
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 5
  completed_plans: 4
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-21)

**Core value:** A standalone, embeddable Strudel editor that plays audio, exports WAV, and gives real-time visual feedback — clean enough to drop into any React app as a single import.
**Current focus:** Phase 02 — pianoroll-visualizers

## Current Position

Phase: 02 (pianoroll-visualizers) — EXECUTING
Plan: 3 of 3

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01-active-highlighting P01 | 3 | 2 tasks | 3 files |
| Phase 01-active-highlighting P02 | 5 | 2 tasks | 1 files |
| Phase 02-pianoroll-visualizers P01 | 3m | 1 tasks | 10 files |
| Phase 02-pianoroll-visualizers P02 | 2m | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Existing]: Engine layer (StrudelEngine, HapStream, OfflineRenderer, WavEncoder, noteToMidi) fully implemented — do not rewrite
- [Existing]: webaudioRepl chosen over raw Scheduler for better superdough integration
- [Existing]: queryArc() used in OfflineRenderer — AudioWorklet cannot be re-registered in OfflineAudioContext
- [Init]: Core + export first, then layer features — natural build order confirmed as: Highlighting → Pianoroll → Audio Vizs → Monaco → Polish
- [Phase 01-active-highlighting]: Per-hap IEditorDecorationsCollection: each hap gets its own collection for independent clear() calls without affecting other active haps
- [Phase 01-active-highlighting]: Canvas ctx.fillStyle color parsing for per-note color injection — graceful fallback to base class if canvas unavailable in test/SSR environments
- [Phase 01-active-highlighting]: useHighlighting call placed before handlePlay/handleStop so clearHighlights binding is available in callback closures — React const bindings are not hoisted
- [Phase 01-active-highlighting]: setHapStream(engine.getHapStream()) on every play call is safe — HapStream instance is stable per engine lifetime, useState skips re-render on identity equality
- [Phase 02-pianoroll-visualizers]: Unknown sounds fall back to --accent, not --stem-melody — no melody branch in getColor()
- [Phase 02-pianoroll-visualizers]: ResizeObserver created in same useEffect as p5 instance to share cleanup closure
- [Phase 02-pianoroll-visualizers]: Pure math functions exported from PianorollSketch for direct unit testing without p5 mock
- [Phase 02-pianoroll-visualizers]: VizPanel does not contain ResizeObserver — useP5Sketch handles canvas resize internally
- [Phase 02-pianoroll-visualizers]: data-active attribute uses string 'true' not boolean to match DOM attribute conventions in tests

### Pending Todos

None yet.

### Blockers/Concerns

- Active highlighting requires `scheduledAheadMs` delay — highlights must fire at audioTime, not schedule time (see HapEvent shape)
- Monaco view zones reset on editor re-layout — inline pianoroll must re-add after every evaluate()
- Phase 2 pianoroll inline view zones depend on Phase 1 decorations infrastructure being in place

## Session Continuity

Last session: 2026-03-22T04:31:36.860Z
Stopped at: Completed 02-pianoroll-visualizers-02-PLAN.md
Resume file: None
