---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: active
stopped_at: Completed Phase 8 (Engine Protocol) + Sonic Pi integration branch
last_updated: "2026-03-25T12:00:00Z"
progress:
  total_phases: 23
  completed_phases: 7
  total_plans: 13
  completed_plans: 13
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-21)
See: THESIS_COMPLETE.md (full platform vision — Motif, ECS, stratified isomorphism, MLIR, provenance)
See: SONIC_PI_WEB.md (Sonic Pi browser engine thesis)
See: FULL_TRANSPARENCY.md (quadtree → normalizing flow → attribution framework)

**Core value:** Five independent islands — Language, Visualization, Synthesis, DAW, Control — connected by one embeddable React component library. Any engine, any viz, any synth. The bridge holds.

**Current focus:** Phase 9 complete. Next: Phase 7 (Additional Renderers) or merge branch.

## Current Position

Phase: 9 (Normalized Hap Type) — COMPLETE
Last completed: Phase 9 (Normalized Hap Type) — 2026-03-25

## What's Shipped

### Phases 1-6 (foundation, 2026-03-21 to 2026-03-22)
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

### Sonic Pi Integration (feat/sonic-pi-engine branch, 2026-03-25)
- SonicPiEngine adapter wrapping sonicPiWeb
- Dual-engine demo app (Strudel ↔ Sonic Pi tabs)
- viz :scope parsed by adapter, stripped before engine
- SuperSonic CDN via bundler-proof dynamic import
- Ruby syntax demo code (RubyTranspiler handles it)

### Thesis & Documentation (2026-03-24 to 2026-03-25)
- THESIS_COMPLETE.md updated: ECS architecture, stratified isomorphism (Thm 5.13),
  MLIR dialect model, provenance as debug info, WebRTC Link sync, SyncComponent
- SONIC_PI_WEB.md: complete build thesis for browser Sonic Pi
- FULL_TRANSPARENCY.md: quadtree → normalizing flow → attribution → legal frameworks
- motif-vision.html: ecosystem visualization page

## Accumulated Context

### Key Decisions (Phase 8 + integration)

- ECS over traits: component bags, not interface inheritance. Runtime capability addition.
- Capability ladder: Level 0 (streaming) → Level 1 (queryable) → Level 2 (patternIR)
- viz is adapter's concern, not engine's. Engine is pure music. Adapter parses/strips viz.
- SuperSonic loaded via `new Function('url', 'return import(url)')` to bypass Turbopack.
- SonicPiEngine adapter: raw engine is null before init(), all methods null-safe.
- VizRefs deprecated → EngineComponents bag. P5VizRenderer bridges internally.
- P5SketchFactory unchanged — 7 sketches untouched during Phase 8.
- inlineViz.vizRequests uses { vizId, afterLine } — engine computes afterLine.
- StrudelEditor wraps LiveCodingEditor with toolbarExtra (BPM, export) + onPostEvaluate.
- LiveCodingEditor does NOT dispose engine on unmount (parent owns lifecycle).

### Architecture Vision (5 Islands)

1. Language (engine): Strudel, Sonic Pi, Hydra, ORCA, custom DSL
2. Visualization (renderer): p5, Three.js, Shadertoy, Hydra, Canvas2D, DAW timeline
3. Synthesis (backend): superdough, SuperSonic, Tone.js, FAUST, MIDI, OSC
4. DAW (timeline): Level 1 read-only, Level 2 editable (Pattern IR), Level 3 collaborative
5. Control (surface): UI Bento Box, Link sync, MIDI I/O, live mic

All connected by ECS Component Bus. Five invariances: change any island, others stay.

### Phase 9 (Normalized Hap Type, 2026-03-25)
- NormalizedHap interface (begin, end, endClipped, note, freq, s, gain, velocity, color)
- normalizeStrudelHap() maps raw Strudel haps at PatternScheduler.query() boundary
- All 4 queryable sketches consume NormalizedHap (zero raw hap access)
- HapStream.emitEvent() for direct HapEvent emission (DemoEngine + SonicPiAdapter use it)
- HapEvent.hap made optional (dead field)
- 146 tests passing

### Pending Todos

- Merge feat/sonic-pi-engine branch
- SynthBackend interface (Phase 12)
- Publish @motif/editor to npm (Phase 11)

### Blockers/Concerns

- SonicPiEngine queryable disabled (CaptureScheduler needs full DSL context in capture mode — sonicPiWeb fix)
- Sonic Pi highlighting needs Phase 9 (emitEvent with loc from transpiler source positions)
- SuperSonic GPL core must stay CDN-loaded, never bundled

## Session Continuity

Last session: 2026-03-25
Stopped at: Phase 8 complete. Sonic Pi integration working. Ready for Phase 9.
Resume: Run /anvi:plan-phase 9
