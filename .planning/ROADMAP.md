# Roadmap: Motif (formerly struCode)

## Overview

The foundation is shipped: engine layer, Monaco editor, active highlighting, and all 7
p5.js visualizers (pianoroll, wordfall, scope, fscope, spectrum, spiral, pitchwheel).

The remaining work transforms struCode from a Strudel-specific editor into **Motif** — a
renderer-agnostic, engine-agnostic live coding platform. The architecture introduces three
decoupled layers: Engine (pluggable language adapters), PatternScheduler API (the agnostic
boundary), and VizRenderer (extensible visualization). Each phase delivers a coherent,
verifiable capability before the next begins.

See THESIS.md for the full platform vision.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Active Highlighting** - Notes in the Monaco editor light up in sync with the audio scheduler (completed 2026-03-21)
- [x] **Phase 2: Pianoroll Visualizers** - Rolling pianoroll canvas + inline view zones + toolbar layout wired (completed 2026-03-22)
- [x] **Phase 3: Audio Visualizers** - Scope, FScope, Spectrum, Spiral, Pitchwheel, Wordfall canvas visualizers (completed 2026-03-22)
- [x] **Phase 4: VizRenderer Abstraction** - Replace p5-coupled SketchFactory with renderer-agnostic VizRenderer interface (completed 2026-03-22)
- [ ] **Phase 5: Per-Track Data** - Expose per-track PatternSchedulers via monkey-patching Pattern.prototype.p
- [ ] **Phase 6: Inline Zones via Abstraction** - Refactor viewZones.ts to use VizRendererSource, any renderer works inline
- [ ] **Phase 7: Additional Renderers** - Canvas 2D, Three.js, Shadertoy GLSL renderer implementations
- [ ] **Phase 8: Engine Protocol** - Define LiveCodingEngine interface, refactor StrudelEngine, prove multi-engine
- [ ] **Phase 9: Normalized Hap Type** - Engine-agnostic event format so viz works across all engines
- [ ] **Phase 10: Monaco Intelligence** - Strudel tokenizer, completions, hover docs, and error squiggles
- [ ] **Phase 11: Library Polish + Demo Site** - Tests, Storybook, tsup build, README, and public demo app

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
**Plans:** 1 plan
Plans:
- [ ] 05-01-PLAN.md — TDD: getTrackSchedulers() with setter-intercept pattern capture

### Phase 6: Inline Zones via Abstraction
**Goal**: Refactor viewZones.ts to accept VizRendererSource. Inline zones are renderer-agnostic — any VizRenderer can render inline, not just PianorollSketch. Track-scoped VizRefs resolved before mount.
**Depends on**: Phase 4, Phase 5
**Requirements**: ZONE-01, ZONE-02, ZONE-03, ZONE-04
**Success Criteria** (what must be TRUE):
  1. addInlineViewZones accepts VizRendererSource parameter
  2. Each inline zone gets track-scoped VizRefs (scheduler from getTrackSchedulers)
  3. Zone width from editor.getLayoutInfo().contentWidth (not container.clientWidth)
  4. Cleanup returns { cleanup, pause, resume } — pause on stop, resume on play
**Plans**: TBD

### Phase 7: Additional Renderers
**Goal**: Implement Canvas 2D, Three.js (dynamic import), and Shadertoy GLSL renderers. Each implements VizRenderer interface. Third-party renderer authors can publish motif-renderer-* packages.
**Depends on**: Phase 4
**Requirements**: EXTRA-01, EXTRA-02, EXTRA-03, EXTRA-04
**Success Criteria** (what must be TRUE):
  1. Canvas2DVizRenderer renders a basic pianoroll without p5 dependency
  2. Three.js renderer dynamically imports (~600KB) only when mounted
  3. Shadertoy GLSL renderer compiles user shaders with onError for compile failures
  4. VizDescriptor.requires capability check disables unsupported renderers in picker
**Plans**: TBD

### Phase 8: Engine Protocol
**Goal**: Define the LiveCodingEngine interface. Refactor StrudelEngine to implement it. Prove multi-engine support by adding a second engine adapter.
**Depends on**: Phase 5
**Requirements**: ENG-P-01, ENG-P-02, ENG-P-03, ENG-P-04
**Success Criteria** (what must be TRUE):
  1. LiveCodingEngine interface defined with init/evaluate/play/stop/getAnalyser/getPatternScheduler/getTrackSchedulers/dispose
  2. StrudelEngine implements LiveCodingEngine without behavioral change
  3. LiveCodingEditor component accepts engine prop (not hardcoded to Strudel)
  4. At least one proof-of-concept second engine adapter exists
**Plans**: TBD

### Phase 9: Normalized Hap Type
**Goal**: Define a normalized Hap interface that engines map their native events to. Viz layer becomes truly engine-agnostic — sketches work with any engine's events without modification.
**Depends on**: Phase 8
**Requirements**: HAP-01, HAP-02, HAP-03
**Success Criteria** (what must be TRUE):
  1. Normalized Hap interface defined (begin, end, pitch, gain, duration, label, color, trackId)
  2. StrudelEngine maps Strudel haps to normalized Hap type
  3. All 7 sketches consume normalized Hap (not raw Strudel hap)
**Plans**: TBD

### Phase 10: Monaco Intelligence
**Goal**: The Monaco editor understands Strudel code — syntax elements get distinct colors, users get completions for functions and note names, hovering a function shows docs, and evaluation errors appear as red squiggles.
**Depends on**: Phase 4
**Requirements**: MON-01, MON-02, MON-03, MON-04, MON-05, MON-06, MON-07, MON-08, MON-09
**Success Criteria** (what must be TRUE):
  1. Strudel functions (note, s, gain, stack, every, jux, fast, slow, etc.) are highlighted in blue; note names in green; mini-notation operators distinctly colored
  2. Typing a dot after a pattern value shows a completion list of all chainable Strudel functions with their signatures
  3. Inside `note("...")` or `s("...")`, completions offer context-appropriate values (note names, oscillator types, percussion names)
  4. After an evaluate() error, the error location is underlined with red squiggles in Monaco; hovering shows the message
  5. Hovering a Strudel function name shows a documentation popup with the function signature and an example
**Plans**: TBD

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
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11
(Phase 7 can run in parallel with 5-6; Phase 10 can run in parallel with 5-9)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Active Highlighting | 2/2 | Complete | 2026-03-21 |
| 2. Pianoroll Visualizers | 3/3 | Complete | 2026-03-22 |
| 3. Audio Visualizers | N/A | Complete | 2026-03-22 |
| 4. VizRenderer Abstraction | 2/2 | Complete   | 2026-03-22 |
| 5. Per-Track Data | 0/1 | Not started | - |
| 6. Inline Zones via Abstraction | 0/TBD | Not started | - |
| 7. Additional Renderers | 0/TBD | Not started | - |
| 8. Engine Protocol | 0/TBD | Not started | - |
| 9. Normalized Hap Type | 0/TBD | Not started | - |
| 10. Monaco Intelligence | 0/TBD | Not started | - |
| 11. Library Polish + Demo Site | 0/TBD | Not started | - |
