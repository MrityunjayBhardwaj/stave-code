---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: staveCoder v1.0
status: active
stopped_at: Phase 10.1 complete (Viz Editor v0.1.0+ shipped). Branch feat/viz-mode-renderer-convention. 336 tests passing. Next: Phase 10.2 (Workspace Shell Refactor — single-editor-per-view architecture).
last_updated: "2026-04-08T00:00:00Z"
progress:
  total_phases: 32
  completed_phases: 11
  total_plans: 18
  completed_plans: 18
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-21)
See: .planning/ROADMAP.md (updated 2026-03-27 — major restructure)
See: artifacts/stave/PRODUCT-ROADMAP.md (complete product strategy)
See: artifacts/stave/PATTERN-IR-ALGEBRAIC-EFFECTS.md (formal IR design)
See: THESIS_COMPLETE.md (full platform vision)
See: SONIC_PI_WEB.md (Sonic Pi browser engine thesis)

**Core value:** Pattern IR (free monad over 9 algebraic effects) is the universal representation. Every surface — code, DAW, nodes, sheet music, audio, viz — is an ECS component synced by derivation systems with stratified fixed-point propagation. No surface is privileged. Code is optional.

**Current focus:** Phase 10.1 (Viz Editor) shipped → Phase 10.2 (Workspace Shell Refactor) → Phase 10.3 (IDE Shell) → Phase 10/11 → ship staveCoder.

## Current Position

Phase: 10.1 (Viz Editor v0.1.0+) — COMPLETE (2026-04-08)
Branch: feat/viz-mode-renderer-convention (do not merge yet — Phase 10.2 builds on it)
Last completed: Phase 10.1 (Viz Editor — multi-tab Monaco, splits, drag-drop, 4 preview modes, IndexedDB presets, hot reload)
Next: Phase 10.2 — Workspace Shell Refactor (single-editor-per-view architecture, EditorView/PreviewView split, PreviewProviderRegistry, WorkspaceAudioBus, then Phase 10.3 for the IDE shell on top)

## What's Shipped

### Phases 1–6 (foundation, 2026-03-21 to 2026-03-22)
- Active highlighting (useHighlighting + HapStream)
- 7 p5.js visualizers (pianoroll, scope, fscope, spectrum, spiral, pitchwheel, wordfall)
- VizRenderer abstraction (renderer-agnostic interface)
- Per-track data (PatternScheduler per $: block)
- Inline zones via .viz() opt-in

### Phase 8 (engine protocol, 2026-03-25)
- LiveCodingEngine interface with ECS components (streaming, queryable, audio, inlineViz)
- StrudelEngine implements LiveCodingEngine
- LiveCodingEditor component (engine-agnostic, accepts engine prop)
- StrudelEditor as thin wrapper
- DemoEngine (streaming + audio + inlineViz, no queryable)
- VizRenderer.mount() with component bag + update()
- VizDescriptor.requires[] + VizPicker auto-filtering
- Engine-agnostic viewZones (reads inlineViz component, no $: scanning)
- 140 tests passing, conformance suite

### Phase 9 + 9.1 (normalized hap + buffered scheduler, 2026-03-25)
- NormalizedHap / IREvent — engine-agnostic event type
- normalizeStrudelHap() at PatternScheduler.query() boundary
- All 4 queryable sketches consume NormalizedHap
- HapStream.emitEvent() for direct emission
- BufferedScheduler — auto-elevates streaming to queryable
- Dual-path sketches (AnalyserNode + event stream)
- Sonic Pi language mode (Ruby tokenizer, completions)
- 159 tests passing

### Sonic Pi Integration (feat/sonic-pi-engine branch)
- SonicPiEngine adapter wrapping sonicPiWeb
- Dual-engine demo app (Strudel ↔ Sonic Pi tabs)
- viz :scope parsed by adapter, stripped before engine
- SuperSonic CDN via bundler-proof dynamic import

## Architecture Decisions (2026-03-27 Session)

### Product Split: staveCoder / Stave Studio
- **staveCoder** (`stave.live/code`): multi-engine live coding tool, ships first (Phases F, 10, 11)
- **Stave Studio** (`stave.live/studio`): code-invariant production platform (Phase 12+)
- One domain: `stave.live` — products are routes, not separate sites
- Same monorepo, NOT a fork

### Incremental Package Architecture
- `@stave/ir` — the open standard (separate package from day one)
- `@stave/core` — ECS propagation engine (directory layer initially, extract when non-React consumer appears)
- `@stave/coder` — Monaco, engines, viz (directory layer initially, extract when @stave/studio adds heavy deps)
- `@stave/studio` — DAW, node patcher, mixer, collab (empty for now)
- Dependency rule: studio → coder → core → ir (never upward)

### Domain Strategy
- Register `stave.live` — the only domain needed
- Phase 11: `stave.live` redirects to `/code` (staveCoder IS the product)
- When Studio ships: `stave.live` becomes landing page with side-by-side demo
- `stave.live/ir` for the open standard page
- Shared state between routes via IndexedDB + BroadcastChannel

### Pattern IR: Free Monad over Algebraic Effects
- Pattern IR is a free monad, not a flat IREvent[] (which is a derived product)
- 9 effect vocabulary: Play, Sleep, Choice, Every, Cycle, When, FX, Ramp, Stack
- S3a conformance: imperative conditionals (if rand < p, if beat % n) map to effect vocabulary
- Extended isomorphism: S1 ∪ S3a ≅ PatternIR (~95% of live coding practice)
- Prior decision "free monad stays in engine" was about SonicPi's internal monad — the universal IR monad is separate

### Two-Layer IR Architecture
- Free monad: structural invariance (projection layer — code/DAW/nodes/sheet music)
- IREvent[]: viz renderer invariance (rendering layer — p5/Three.js/Canvas2D)
- Both needed: free monad for bidirectional editing, IREvent[] for fast viz rendering

### ECS Propagation (Datalog Model)
- Extended component bag: patternIR, strudelCode, sonicPiCode, dawLayout, nodeGraph, irEvents, sheetMusic, etc.
- Systems are derivation rules: parse systems (surface → IR), generate systems (IR → surface), render systems
- Stratified fixed-point propagation: Stratum 0 (input) → 1 (parse) → 2 (generate) → 3 (render)
- Termination guaranteed by construction: finite fact space, stratification, idempotent systems, fixed-point exit
- No version tagging, no manual cycle prevention — cycles impossible by architecture
- Replaces: Projection<T>, Lens<T>, LiveCodingEngine interface, VizRenderer interface

### Code Invariance
- Code is one ECS component among equals, not the primary input
- Valid inputs: code, DAW drawing, node patching, MP3 analysis, MIDI import, natural language, humming, tapping, DAW audio streaming
- Strudel is an adapter like everything else — no privileged surface syntax

### Foundation First
- Phase F (Free Monad MVP) goes before Phase 10 — correct time is now, no users to break
- LLM-digestable: 9-effect vocab fits in a system prompt, enables generated examples + stress tests
- Free monad → MusicXML is a free interpreter (sheet music from pattern algebra)

## What Was Done This Session (2026-03-27)

### Bug Fix: Highlighting duration
- Root cause: `HapStream.emit()` params were mislabeled. Strudel's `onTrigger` is `(hap, deadline, duration, cps, t)` but code used `(hap, time, cps, endTime, s)`. `audioDuration = endTime - time = cps - deadline` → always negative → clear timeout fired immediately → highlights flashed and vanished.
- Fix: renamed params, use `duration` directly as `audioDuration`. 3 files changed (HapStream.ts, StrudelEngine.ts, 2 test files). All 171 tests pass.

### Phase F Planning
- F-01-PLAN.md: PatternIR ADT (12 node types), smart constructors, collect/toStrudel/JSON interpreters, ~30 unit tests
- F-02-PLAN.md: parseMini + parseStrudel (MVP, Code fallback), propagation engine, StrudelEngine wiring, integration tests

## Pending Actions

1. Create branch `feat/pattern-ir` from `bug-fixes`
2. Execute Phase F (plans at `.planning/phases/F-free-monad/`)
3. Merge `bug-fixes` → main
4. Merge `feat/sonic-pi-engine` → main
5. Plan and execute Phase 10 (Monaco Intelligence)
6. Plan and execute Phase 11 (Library Polish + Ship)

## Blockers/Concerns

- SonicPiEngine queryable disabled (CaptureScheduler needs sonicPiWeb fix)
- Sonic Pi highlighting needs emitEvent with loc from transpiler source positions
- SuperSonic GPL core must stay CDN-loaded, never bundled
- Phase F scope needs bounding: StrudelProjection + IREventProjection + JSON, defer rest

## Session Continuity

Last session: 2026-03-27
Stopped at: Phase F planned (2 plans). Highlighting bug fixed. Branch: bug-fixes. 171 tests passing.
Resume: Create branch feat/pattern-ir, then /anvi:execute-phase F
