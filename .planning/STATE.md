# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-21)

**Core value:** A standalone, embeddable Strudel editor that plays audio, exports WAV, and gives real-time visual feedback — clean enough to drop into any React app as a single import.
**Current focus:** Phase 1 — Active Highlighting

## Current Position

Phase: 1 of 5 (Active Highlighting)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-03-21 — Roadmap created; engine layer and basic editor already validated

Progress: [░░░░░░░░░░] 0%

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

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Existing]: Engine layer (StrudelEngine, HapStream, OfflineRenderer, WavEncoder, noteToMidi) fully implemented — do not rewrite
- [Existing]: webaudioRepl chosen over raw Scheduler for better superdough integration
- [Existing]: queryArc() used in OfflineRenderer — AudioWorklet cannot be re-registered in OfflineAudioContext
- [Init]: Core + export first, then layer features — natural build order confirmed as: Highlighting → Pianoroll → Audio Vizs → Monaco → Polish

### Pending Todos

None yet.

### Blockers/Concerns

- Active highlighting requires `scheduledAheadMs` delay — highlights must fire at audioTime, not schedule time (see HapEvent shape)
- Monaco view zones reset on editor re-layout — inline pianoroll must re-add after every evaluate()
- Phase 2 pianoroll inline view zones depend on Phase 1 decorations infrastructure being in place

## Session Continuity

Last session: 2026-03-21
Stopped at: Roadmap created, STATE.md initialized — ready to plan Phase 1
Resume file: None
