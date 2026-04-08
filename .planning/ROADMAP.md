# Roadmap: Stave (stave.live)

## Overview

Stave is a renderer-agnostic, engine-agnostic live coding platform delivered as an
embeddable React component library (@stave/editor). The architecture decouples five
independent islands — Language, Visualization, Synthesis, DAW, and Control — connected
by an Entity-Component bus. Any engine, any viz renderer, any synth backend plugs in.

Phases 1-6 shipped the foundation (Monaco, highlighting, 7 p5.js visualizers, VizRenderer
abstraction, per-track data, inline zones). Phase 8 shipped the engine protocol (ECS
components, LiveCodingEditor, multi-engine support). Phase 9 normalized the hap type
across engines. Phase F shipped the Free Monad PatternIR with parsers, interpreters,
and an ECS propagation engine. Phase 10 is in progress (error squiggles, completions,
hover docs shipped; tokenizer remaining). Sonic Pi Web integration is on a feature branch
with a working dual-engine demo.

See THESIS_COMPLETE.md for the full platform vision.
See SONIC_PI_WEB.md for the Sonic Pi browser engine thesis.
See FULL_TRANSPARENCY.md for the provenance/attribution framework.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Active Highlighting** - Notes in the Monaco editor light up in sync with the audio scheduler (completed 2026-03-21)
- [x] **Phase 2: Pianoroll Visualizers** - Rolling pianoroll canvas + inline view zones + toolbar layout wired (completed 2026-03-22)
- [x] **Phase 3: Audio Visualizers** - Scope, FScope, Spectrum, Spiral, Pitchwheel, Wordfall canvas visualizers (completed 2026-03-22)
- [x] **Phase 4: VizRenderer Abstraction** - Replace p5-coupled SketchFactory with renderer-agnostic VizRenderer interface (completed 2026-03-22)
- [x] **Phase 5: Per-Track Data** - Expose per-track PatternSchedulers via monkey-patching Pattern.prototype.p (completed 2026-03-22)
- [x] **Phase 6: Inline Zones via Abstraction** - Per-pattern .viz("name") opt-in replacing blanket inlinePianoroll prop (REPLANNED 2026-03-23) (completed 2026-03-22)
- [x] **Phase 8: Engine Protocol** - ECS components, LiveCodingEngine, LiveCodingEditor, DemoEngine, VizDescriptor.requires[] filtering, engine-agnostic viewZones (completed 2026-03-25)
- [x] **Phase 9: Normalized Hap Type** - NormalizedHap interface, engine-agnostic sketches and highlighting (completed 2026-03-25)
- [x] **Phase F: Free Monad PatternIR** - PatternIR ADT (15 node types), parseMini, parseStrudel, collect/toStrudel interpreters, ECS propagation engine, StrudelEngine integration (completed 2026-03-28)
- [ ] **Phase 7: Additional Renderers** - HydraEngine (visual component), Canvas2D renderer, Level 1 DAW timeline
- [ ] **Phase 10: Monaco Intelligence** - Strudel tokenizer, completions, hover docs, error squiggles (10-01 + 10-02 shipped)
- [ ] **Phase 11: Library Polish + Publish** - tsup build, README, publish @motif/editor to npm
- [ ] **Phase 12: Synth Invariance** - SynthBackend interface, SuperSonicBackend, SuperdoughBackend, MidiBackend
- [ ] **Phase 13: External Sync** - SyncComponent, LinkBridge (WebRTC), MidiInput
- [ ] **Phase 14: Recording & Export** - Engine-agnostic Recorder, WAV export, stem export
- [ ] **Phase 15: Provenance** - SessionLog, Ed25519 signing, WAV metadata embedding
- [ ] **Phase 16: Collaboration** - Yjs CRDT + WebRTC, cursor presence, shared tempo via Link
- [ ] **Phase 17: UI Bento Box** - Slider/knob/XY pad controls, MIDI CC mapping, slider() DSL
- [ ] **Phase 18: Composr Integration** - Replace iframe with <StrudelEditor>, renderStems, per-stem export
- [ ] **Phase 19: Bidirectional DAW** - IRNodeMeta provenance, Poly backward maps, DawVizRenderer (interactive timeline), BidirectionalBinding, code synthesis tiers (T1-T4), AudioRegion node (builds on Phase F foundation). See artifacts/stave/STAVE-STUDIO-DESIGN.md §5-6.
- [ ] **Phase 20: Transform Graph** - React Flow node patcher (visual free monad), bypass/solo toggles, bidirectional (edit nodes → IR → code). See STAVE-STUDIO-DESIGN.md §4.
- [ ] **Phase 21: Indian Classical** - Tala Circle VizRenderer, bol notation, tihai verification, layakari via fast() slider
- [ ] **Phase 22: Audio Analysis + Vocals** - AudioInput component (recording), onset/pitch detection, audio → IREvents (closed loop), AudioRegion manipulation (chop/slice/stretch), vocal workflow (record → display → edit). See STAVE-STUDIO-DESIGN.md §6-7.
- [ ] **Phase 23: Transparent AI** - Layer 3 kernel/wavelet signal representation, similarity/interpolation in signal space, normalizing flow synth, training data attribution. See STAVE-STUDIO-DESIGN.md §3.

## Phase Details

### Phase 1: Active Highlighting
**Goal**: Characters in the Monaco editor that generated a playing note are visually highlighted at the exact moment audio plays, and clear when the note ends.
**Depends on**: Nothing (HapStream already implemented)
**Requirements**: HIGH-01, HIGH-02, HIGH-03, HIGH-04, HIGH-05
**Success Criteria** (what must be TRUE):
  1. Playing a Strudel pattern causes the source characters to glow with accent-colored background and outline in Monaco
  2. The highlight fires at the exact moment the corresponding audio plays (not when the note is scheduled ahead of time)
  3. The highlight clears automatically when the note's audio duration expires
  4. Multiple simultaneous notes (chords) each get independent highlight and clear cycles without interfering
  5. The decoration uses CSS class `strudel-active-hap` with the correct design token colors from tokens.ts
**Plans:** 2/2 plans complete
Plans:
- [x] 01-01-PLAN.md — useHighlighting hook + tests + CSS fix
- [x] 01-02-PLAN.md — Wire hook into StrudelEditor + visual verification

### Phase 2: Pianoroll Visualizers
**Goal**: Users can see a rolling pianoroll displaying all playing notes in real time, both as a full panel below the editor and inline beneath individual pattern lines, with a toolbar that controls layout and visualizer selection.
**Depends on**: Phase 1
**Requirements**: PIANO-01, PIANO-02, PIANO-03, PIANO-04, PIANO-05, PIANO-06, PIANO-07, UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. A full-panel pianoroll renders at 60fps with a 6-second rolling window, note blocks colored by instrument type
  2. Percussion sounds (bd, sd, hh, etc.) appear at fixed positions below the pitch area; pitched notes span MIDI 24-96 on the Y-axis
  3. An inline pianoroll appears as a Monaco view zone below each `$:` line and re-appears after every evaluate() call
  4. The VizPicker toolbar lets the user switch between visualizer modes (pianoroll, scope, spectrum, spiral, pitchwheel)
  5. The layout follows spec: toolbar (40px) + viz-picker (32px) + editor + visualizer panel; vizHeight and showToolbar props work correctly
**Plans:** 3/3 plans complete
Plans:
- [x] 02-01-PLAN.md — Install p5, types, useP5Sketch hook, PianorollSketch factory + stubs
- [x] 02-02-PLAN.md — VizPanel + VizPicker React components
- [x] 02-03-PLAN.md — StrudelEditor wiring, inline view zones, visual verification

### Phase 3: Audio Visualizers
**Goal**: Users can see real-time audio analysis visualizations — oscilloscope, frequency spectrum, waterfall spectrogram, spiral, pitchwheel, and wordfall — all driven by the live AnalyserNode and PatternScheduler.
**Depends on**: Phase 2
**Requirements**: VIZ-01, VIZ-02, VIZ-03, VIZ-04, VIZ-05, VIZ-06
**Success Criteria** (what must be TRUE):
  1. The Scope visualizer renders a stable time-domain waveform from the AnalyserNode at 60fps, triggered at zero-crossings
  2. The FScope visualizer renders frequency bars at 60fps with symmetric layout
  3. The Spectrum visualizer renders scrolling waterfall with log-frequency Y axis
  4. The Spiral visualizer maps note events to positions on a rotating cycle-based spiral
  5. The Pitchwheel visualizer shows 12 pitch classes on a circle, with active notes glowing
  6. The Wordfall visualizer shows vertical pianoroll with note labels
**Plans:** Completed outside GSD (all 7 sketches implemented in session 2026-03-22)

### Phase 4: VizRenderer Abstraction
**Goal**: Replace the p5-coupled SketchFactory type with a renderer-agnostic VizRenderer interface. Wrap all 7 existing p5 sketches in a P5VizRenderer adapter. Export VizDescriptor system for extensibility. Zero behavioral change — all existing viz modes work through the new interface.
**Depends on**: Phase 3
**Requirements**: REND-01, REND-02, REND-03, REND-04, REND-05, REND-06, REND-07
**Success Criteria** (what must be TRUE):
  1. VizRenderer interface exists with mount/resize/pause/resume/destroy methods
  2. P5VizRenderer adapter wraps all 7 existing SketchFactory sketches without behavioral change
  3. VizDescriptor type drives VizPicker as a data-driven dropdown (not hardcoded tab bar)
  4. DEFAULT_VIZ_DESCRIPTORS exported — devs spread and extend without source edits
  5. StrudelEditorProps uses vizDescriptors/vizRenderer instead of vizSketch
  6. useVizRenderer hook replaces useP5Sketch with renderer-agnostic lifecycle
  7. mountVizRenderer shared utility works for both VizPanel and viewZones
**Plans:** 2/2 plans complete
Plans:
- [x] 04-01-PLAN.md — Source refactor: types, P5VizRenderer, mountVizRenderer, useVizRenderer, defaultDescriptors, VizPanel, VizPicker, viewZones, StrudelEditor, index.ts
- [x] 04-02-PLAN.md — Test migration: create P5VizRenderer/useVizRenderer/defaultDescriptors tests, migrate VizPanel/VizPicker/viewZones tests
**Canonical refs**: THESIS.md (Section 3-4), memory/project_viz_renderer_plan.md

### Phase 5: Per-Track Data
**Goal**: Expose per-track PatternSchedulers from StrudelEngine by capturing patterns during evaluate via monkey-patching Pattern.prototype.p. Each $: block gets its own scheduler that queries its Pattern directly via queryArc.
**Depends on**: Phase 4
**Requirements**: TRACK-01, TRACK-02, TRACK-03, TRACK-04
**Success Criteria** (what must be TRUE):
  1. StrudelEngine.getTrackSchedulers() returns Map<string, PatternScheduler> after evaluate
  2. Each track scheduler queries its own Pattern directly (no hap filtering)
  3. Pattern.prototype.p is always restored in finally block, even on error
  4. Anonymous $: patterns get keys "$0", "$1" etc; named patterns get literal name
**Plans:** 1/1 plans complete
Plans:
- [x] 05-01-PLAN.md — TDD: getTrackSchedulers() with setter-intercept pattern capture

### Phase 6: Inline Zones via Abstraction (REPLANNED)
**Goal**: Replace the blanket `inlinePianoroll` prop with per-pattern `.viz("name")` opt-in. Register `.viz()` on Pattern.prototype during evaluate(), capture viz requests per track, and refactor viewZones.ts to create zones only for opted-in patterns with the correct viz type resolved from VizDescriptor[].
**Depends on**: Phase 4, Phase 5
**Requirements**: ZONE-01, ZONE-02, ZONE-03, ZONE-04
**Success Criteria** (what must be TRUE):
  1. `.viz("pianoroll")` chained on a pattern causes an inline zone with pianoroll to appear after that pattern's block
  2. Patterns without `.viz()` get no inline zone
  3. Any viz type from DEFAULT_VIZ_DESCRIPTORS works (e.g. `.viz("scope")`, `.viz("spectrum")`)
  4. Zone appears after the LAST LINE of the pattern block (not after the `$:` line)
  5. InlineZoneHandle pause/resume lifecycle works (pause on stop, resume on play)
  6. `inlinePianoroll` prop removed from StrudelEditorProps
**Plans:** 2/2 plans complete
Plans:
- [x] 06-01-PLAN.md — Register .viz() capture in StrudelEngine + refactor viewZones.ts to opt-in + update tests
- [x] 06-02-PLAN.md — Wire StrudelEditor with vizRequests, remove inlinePianoroll prop, visual verification

### Phase 7: Additional Renderers + Hydra Engine
**Goal**: HydraEngine (proves visual component), Canvas2D renderer (lightweight), Level 1 DAW timeline (read-only, requires queryable).
**Depends on**: Phase 8
**Success Criteria** (what must be TRUE):
  1. HydraEngine implements LiveCodingEngine with visual component (canvas passthrough)
  2. VizPicker disables all audio/streaming viz for Hydra, shows "Hydra Output" only
  3. Canvas2DVizRenderer renders basic pianoroll without p5 dependency
  4. Level 1 DAW VizRenderer: multi-track timeline, playhead, zoom, requires: ['queryable']
**Plans:** TBD

### Phase 8: Engine Protocol (COMPLETE — 2026-03-25)
**Goal**: Define the LiveCodingEngine interface with Entity-Component architecture. Refactor StrudelEngine. Create LiveCodingEditor. Build DemoEngine. Make inline viz engine-agnostic.
**Depends on**: Phase 5
**Success Criteria** (all TRUE):
  1. LiveCodingEngine interface with 5 core methods + ECS components bag
  2. StrudelEngine implements LiveCodingEngine without behavioral change
  3. LiveCodingEditor accepts engine prop (not hardcoded to Strudel)
  4. StrudelEditor is thin wrapper around LiveCodingEditor
  5. DemoEngine proves interface with streaming + audio + inlineViz (no queryable)
  6. VizRenderer.mount() accepts Partial<EngineComponents> (component bag)
  7. VizDescriptor.requires[] filters VizPicker by available components
  8. viewZones.ts is engine-agnostic (reads inlineViz component, no $: scanning)
  9. All 140 tests pass, conformance suite added
**Plans:** 3/3 plans complete (08-01, 08-02, 08-03)
Plans:
- [x] 08-01-PLAN.md — LiveCodingEngine interface + StrudelEngine conformance + LiveCodingEditor + StrudelEditor wrapper + exports (5 tasks)
- [x] 08-02-PLAN.md — VizRenderer component bag + VizDescriptor.requires[] + VizPicker filtering + engine-agnostic viewZones + tests (7 tasks)
- [x] 08-03-PLAN.md — DemoEngine + conformance tests + integration verification (4 tasks)

**Also shipped (unplanned, on feat/sonic-pi-engine branch):**
- SonicPiEngine adapter wrapping sonicPiWeb (streaming + audio + inlineViz)
- Dual-engine demo app (Strudel ↔ Sonic Pi tabs)
- viz :scope DSL parsing in adapter (stripped before engine sees it)
- SuperSonic loaded via bundler-proof dynamic import from CDN

### Phase 9: Normalized Hap Type
**Goal**: Define a normalized Hap interface that engines map their native events to. Viz layer and highlighting become truly engine-agnostic — sketches and active highlighting work with any engine's events without modification.
**Depends on**: Phase 8
**Requirements**: HAP-01, HAP-02, HAP-03, HAP-04, HAP-05
**Success Criteria** (what must be TRUE):
  1. NormalizedHap interface defined (begin, end, endClipped, note, freq, s, gain, velocity, color) and exported from index.ts
  2. StrudelEngine maps Strudel haps to NormalizedHap via normalizeStrudelHap() in PatternScheduler.query()
  3. All 4 queryable sketches (Pianoroll, Spiral, Pitchwheel, Wordfall) consume NormalizedHap — no raw Strudel hap access
  4. HapStream.emitEvent(event: HapEvent) added — engines emit HapEvents directly without constructing Strudel-specific hap objects. Legacy emit() preserved for backward compat. HapEvent.hap made optional.
  5. DemoEngine and SonicPiEngine adapter use emitEvent() directly — no fake Strudel hap construction
**Plans:** 3 plans
Plans:
- [x] 09-01-PLAN.md — NormalizedHap type + normalize function + PatternScheduler contract + StrudelEngine wrappers + index.ts export (5 tasks)
- [x] 09-02-PLAN.md — Migrate all 4 queryable sketches to consume NormalizedHap (5 tasks)
- [x] 09-03-PLAN.md — HapStream.emitEvent() + HapEvent cleanup + DemoEngine/SonicPiAdapter updates (4 tasks)

### Phase F: Free Monad PatternIR (COMPLETE — 2026-03-28)
**Goal**: Ship a universal Pattern IR based on free monads — a tree ADT with 15 node types, parsers for mini-notation and Strudel code, interpreters (collect → IREvent[], toStrudel → code string), JSON serialization, and an ECS propagation engine wired into StrudelEngine.
**Depends on**: Phase 8
**Success Criteria** (all TRUE):
  1. PatternIR ADT with 15 node types (Pure/Seq/Stack/Play/Sleep/Choice/Every/Cycle/When/FX/Ramp/Fast/Slow/Loop/Code) and IR.* smart constructors
  2. collect interpreter walks the tree → IREvent[] with time accumulation, multiplicative speed, FX/Ramp param override
  3. toStrudel interpreter produces idiomatic Strudel code (mini-notation collapse, stack indentation, method chains)
  4. JSON round-trip serialization with schema versioning (patternir/1.0)
  5. parseMini: recursive descent for mini-notation (sequences, rests, cycles, sub-sequences, repeat, sometimes)
  6. parseStrudel: structural matcher for Strudel code (note/s/stack, $: syntax, method chain walking, Code fallback)
  7. ECS propagation engine: ComponentBag, System interface with strata, propagate() with stratum ordering
  8. StrudelEngine.evaluate() runs propagation, exposes ir component on EngineComponents
  9. 110+ new tests, 281 total passing
**Plans:** 2/2 plans complete
Plans:
- [x] F-01-PLAN.md — PatternIR ADT, collect/toStrudel interpreters, JSON serialization, 77 tests
- [x] F-02-PLAN.md — parseMini, parseStrudel, propagation engine, StrudelEngine integration, 33 integration tests

### Phase 10: Monaco Intelligence (IN PROGRESS)
**Goal**: The Monaco editor understands Strudel code — syntax elements get distinct colors, users get completions for functions and note names, hovering a function shows docs, and evaluation errors appear as red squiggles.
**Depends on**: Phase 4
**Requirements**: MON-01, MON-02, MON-03, MON-04, MON-05, MON-06, MON-07, MON-08, MON-09
**Success Criteria** (what must be TRUE):
  1. Strudel functions (note, s, gain, stack, every, jux, fast, slow, etc.) are highlighted in blue; note names in green; mini-notation operators distinctly colored
  2. Typing a dot after a pattern value shows a completion list of all chainable Strudel functions with their signatures
  3. Inside `note("...")` or `s("...")`, completions offer context-appropriate values (note names, oscillator types, percussion names)
  4. After an evaluate() error, the error location is underlined with red squiggles in Monaco; hovering shows the message
  5. Hovering a Strudel function name shows a documentation popup with the function signature and an example
**Plans:** 2/TBD plans complete
Plans:
- [x] 10-01 — Eval error squiggles via setModelMarkers
- [x] 10-02 — Dot completions, note completions, hover docs
- [ ] 10-03 — Strudel tokenizer / syntax highlighting (TBD)

### Phase 11: Library Polish + Demo Site
**Goal**: The @motif/editor package is ready to publish — tested, documented, built correctly — and packages/app is a polished public-facing demo that showcases all features.
**Depends on**: Phase 10
**Requirements**: LIB-01, LIB-02, LIB-03, LIB-04, LIB-05, LIB-06, LIB-07, LIB-08, APP-01, APP-02, APP-03, APP-04
**Success Criteria** (what must be TRUE):
  1. Vitest test suite passes: WavEncoder header/stereo/mono, noteToMidi conversions, and highlight timing delay are all verified
  2. `tsup build` produces valid ESM and CJS bundles; `package.json` exports field points to correct outputs; all public types export from index.ts
  3. Storybook stories exist for StrudelEditor (default, pianoroll, scope, read-only) and each visualizer component in isolation
  4. The packages/app demo site loads in a browser with play/stop/export working, all visualizer modes switchable, and an examples gallery of 3-5 starter patterns
  5. README.md contains npm install instructions and a minimal working usage example that an integrator can copy
**Plans:** TBD

## Progress

**Execution Order:**
1→2→3→4→5→6→8→9→F→10→11 (ship staveCoder) → 12-17 (Studio alpha) → 19-20 (multi-view) → 22 (audio input)
Phase 7 can run in parallel with later phases.

| Phase | Plans | Status | Completed |
|-------|-------|--------|-----------|
| 1. Active Highlighting | 2/2 | Complete | 2026-03-21 |
| 2. Pianoroll Visualizers | 3/3 | Complete | 2026-03-22 |
| 3. Audio Visualizers | N/A | Complete | 2026-03-22 |
| 4. VizRenderer Abstraction | 2/2 | Complete | 2026-03-22 |
| 5. Per-Track Data | 1/1 | Complete | 2026-03-22 |
| 6. Inline Zones via Abstraction | 2/2 | Complete | 2026-03-22 |
| 8. Engine Protocol | 3/3 | Complete | 2026-03-25 |
| 9. Normalized Hap Type | 3/3 | Complete | 2026-03-25 |
| **F. Free Monad PatternIR** | **2/2** | **Complete** | **2026-03-28** |
| **10. Monaco Intelligence** | **2/TBD** | **In progress** | - |
| 7. Additional Renderers + Hydra | 0/TBD | Not started | - |
| **── staveCoder ships here (v0.1.0 on npm) ──** | | | |
| 11. Library Polish + Publish | 0/TBD | Not started | - |
| **── Stave Studio phases below ──** | | | |
| 12. Synth Invariance | 0/TBD | Not started | - |
| 13. External Sync (Link, MIDI, OSC) | 0/TBD | Not started | - |
| 14. Recording & Export (WAV, stems) | 0/TBD | Not started | - |
| 15. Provenance (session log, signing) | 0/TBD | Not started | - |
| 16. Collaboration (Yjs CRDT, WebRTC) | 0/TBD | Not started | - |
| 17. UI Bento Box (sliders, knobs, MIDI CC) | 0/TBD | Not started | - |
| 18. Composr Integration | 0/TBD | Not started | - |
| 19. Bidirectional DAW (IRNodeMeta, backward maps, DawVizRenderer, code synthesis) | 0/TBD | Not started | - |
| 20. Transform Graph (React Flow node patcher, bypass/solo) | 0/TBD | Not started | - |
| 21. Indian Classical (tala circle, bol, tihai) | 0/TBD | Not started | - |
| 22. Audio Analysis (audio→IR, AudioRegion, vocals, closed loop) | 0/TBD | Not started | - |
| 23. Transparent AI (kernel/wavelet Layer 3, attribution) | 0/TBD | Not started | - |
