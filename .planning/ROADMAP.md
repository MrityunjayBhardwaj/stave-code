# Roadmap: struCode

## Overview

The engine layer and basic editor are already shipped. The remaining work layers
visual feedback and language intelligence on top of that working foundation: first
active note highlighting (synchronized to the audio scheduler), then pianoroll
visualizations (full-panel rolling canvas + inline view zones) with toolbar wiring,
then audio analysis visualizers (scope, spectrum, spiral, pitchwheel), then Monaco
language intelligence (tokenizer, completions, hover docs, error squiggles), and
finally library polish and the public-facing demo site. Each phase delivers a
coherent, verifiable capability before the next begins.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Active Highlighting** - Notes in the Monaco editor light up in sync with the audio scheduler (completed 2026-03-21)
- [ ] **Phase 2: Pianoroll Visualizers** - Rolling pianoroll canvas + inline view zones + toolbar layout wired
- [ ] **Phase 3: Audio Visualizers** - Scope, Spectrum, Spiral, and Pitchwheel canvas visualizers
- [ ] **Phase 4: Monaco Intelligence** - Strudel tokenizer, completions, hover docs, and error squiggles
- [ ] **Phase 5: Library Polish + Demo Site** - Tests, Storybook, tsup build, README, and public demo app

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
**Plans:** 2/3 plans executed
Plans:
- [x] 02-01-PLAN.md — Install p5, types, useP5Sketch hook, PianorollSketch factory + stubs
- [x] 02-02-PLAN.md — VizPanel + VizPicker React components
- [x] 02-03-PLAN.md — StrudelEditor wiring, inline view zones, visual verification

### Phase 3: Audio Visualizers
**Goal**: Users can see real-time audio analysis visualizations — an oscilloscope waveform, a frequency spectrum, a spiral note display, and a pitchwheel — all driven by the live AnalyserNode.
**Depends on**: Phase 2
**Requirements**: VIZ-01, VIZ-02, VIZ-03, VIZ-04, VIZ-05, VIZ-06
**Success Criteria** (what must be TRUE):
  1. The Scope visualizer renders a stable time-domain waveform from the AnalyserNode at 60fps, triggered at zero-crossings
  2. The Spectrum visualizer renders frequency bars at 60fps with a purple-to-blue hue gradient
  3. The Spiral visualizer maps note events to positions on a rotating cycle-based spiral
  4. The Pitchwheel visualizer shows 12 pitch classes on a circle, with active notes glowing
**Plans**: TBD

### Phase 4: Monaco Intelligence
**Goal**: The Monaco editor understands Strudel code — syntax elements get distinct colors, users get completions for functions and note names, hovering a function shows docs, and evaluation errors appear as red squiggles.
**Depends on**: Phase 3
**Requirements**: MON-01, MON-02, MON-03, MON-04, MON-05, MON-06, MON-07, MON-08, MON-09
**Success Criteria** (what must be TRUE):
  1. Strudel functions (note, s, gain, stack, every, jux, fast, slow, etc.) are highlighted in blue; note names in green; mini-notation operators distinctly colored
  2. Typing a dot after a pattern value shows a completion list of all chainable Strudel functions with their signatures
  3. Inside `note("...")` or `s("...")`, completions offer context-appropriate values (note names, oscillator types, percussion names)
  4. After an evaluate() error, the error location is underlined with red squiggles in Monaco; hovering shows the message
  5. Hovering a Strudel function name shows a documentation popup with the function signature and an example
**Plans**: TBD

### Phase 5: Library Polish + Demo Site
**Goal**: The @strucode/editor package is ready to publish — tested, documented, built correctly — and packages/app is a polished public-facing demo that showcases all features.
**Depends on**: Phase 4
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
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Active Highlighting | 2/2 | Complete   | 2026-03-21 |
| 2. Pianoroll Visualizers | 2/3 | In Progress|  |
| 3. Audio Visualizers | 0/TBD | Not started | - |
| 4. Monaco Intelligence | 0/TBD | Not started | - |
| 5. Library Polish + Demo Site | 0/TBD | Not started | - |
