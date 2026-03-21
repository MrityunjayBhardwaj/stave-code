# struCode

## What This Is

struCode is a professional-grade Monaco-based editor for Strudel.js, publishable as a React component library (`@strucode/editor`). It provides active note highlighting synchronized to the audio scheduler, embedded pianoroll visualizations, full visual feedback (scope, spectrum, spiral, pitchwheel), and first-class track export via OfflineAudioContext fast-render. Built as a pnpm + Turborepo monorepo with a standalone Next.js demo app.

The target user is anyone writing Strudel patterns — from beginners to advanced livecode performers. The target integrator is any app that wants to embed a Strudel editor without iframes or web components.

## Core Value

A standalone, embeddable Strudel editor that plays audio, exports WAV, and gives real-time visual feedback — clean enough to drop into any React app as a single import.

## Requirements

### Validated

- ✓ Engine layer (StrudelEngine, WavEncoder, OfflineRenderer, HapStream, LiveRecorder, noteToMidi) — existing
- ✓ Basic StrudelEditor component with play/stop/export and Monaco integration — existing
- ✓ Design tokens and Monaco theme — existing
- ✓ Toolbar with play/stop/export/BPM/error — existing
- ✓ Monorepo structure (pnpm + Turborepo, packages/editor + packages/app) — existing
- ✓ Public API surface (index.ts exports) — existing

### Active

- [ ] Active note/character highlighting synchronized to the audio scheduler
- [ ] Pianoroll visualizer — full-panel rolling 6s canvas (60fps)
- [ ] Inline pianoroll via Monaco view zones (below $: lines)
- [ ] Scope visualizer — time-domain oscilloscope with zero-crossing trigger
- [ ] Spectrum visualizer — frequency-domain bar display
- [ ] Spiral and Pitchwheel visualizers
- [ ] VizPicker toolbar component for switching visualizers
- [ ] Monaco language features — Strudel tokenizer (syntax highlighting)
- [ ] Monaco completions — dot completions, note names, s() completions
- [ ] Monaco hover docs — function documentation on hover
- [ ] Error squiggles via editor.setModelMarkers
- [ ] packages/app demo page wired to @strucode/editor (working play + export)
- [ ] packages/app polished as public-facing demo site before v1
- [ ] Vitest tests for WavEncoder and noteToMidi (unit), highlight timing
- [ ] tsup build verified, package.json exports correct
- [ ] Storybook stories for all components

### Out of Scope

- iframes or the strudel-editor web component — replaced entirely by direct @strudel/core integration
- Application-specific logic (no CDN names, no upload endpoints) — integrators wire these via onExport prop
- Global state management libraries (Zustand, Redux) — not needed for a component library
- Sample-based sounds in OfflineRenderer — AudioWorklet limitation; documented, oscillators only
- Server-side audio rendering — browser WebAudio only

## Context

- Engine uses `webaudioRepl` from `@strudel/webaudio` (smarter than raw Scheduler — better superdough integration)
- OfflineRenderer uses `pattern.queryArc()` directly with native oscillators instead of fighting AudioWorklet limitations in OfflineAudioContext — this is the correct approach given browser constraints
- HapStream handles both `context.locations` and `context.loc` (both field names appear in practice)
- Active highlighting requires `scheduledAheadMs` delay (Strudel schedules 100–300ms ahead) so highlights fire exactly when audio plays
- Monaco view zones reset on editor re-layout — must re-add after every evaluate()
- Design tokens are exact values from ARCHITECTURE.md — no deviation
- Font stack: "JetBrains Mono", "Fira Code", "Cascadia Code", monospace

## Constraints

- **Tech stack**: pnpm + Turborepo monorepo, React 18+, TypeScript strict, tsup build — locked
- **Audio**: Must init after user gesture (browser autoplay policy) — engine.init() is always triggered by a click
- **Library purity**: @strucode/editor has zero knowledge of downstream applications — all app logic goes in packages/app or via callback props
- **Browser**: No Node.js audio — all audio paths use Web Audio API (AudioContext, OfflineAudioContext)
- **Dependencies**: Monaco via @monaco-editor/react, no iframe boundary

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| webaudioRepl over raw Scheduler | Better superdough integration, handles transpiler and eval lifecycle | ✓ Good |
| queryArc() for OfflineRenderer | AudioWorklet can't be re-registered in OfflineAudioContext — direct oscillator render is the pragmatic workaround | ✓ Good |
| Build on existing engine code, not start fresh | Engine layer is production-quality; real work is visualizers + Monaco features | — Pending |
| Core + export first, then layer features | Ship a working editor that proves audio + export, then add visualizers and Monaco intelligence | — Pending |
| packages/app = sandbox now, demo site before v1 | Starts as development harness, polished to public-facing demo before publishing | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-21 after initialization*
