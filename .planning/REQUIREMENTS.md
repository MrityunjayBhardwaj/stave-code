# Requirements: struCode

**Defined:** 2026-03-21
**Core Value:** A standalone, embeddable Strudel editor that plays audio, exports WAV, and gives real-time visual feedback — clean enough to drop into any React app as a single import.

## v1 Requirements

### Engine (Validated — already implemented)

- [x] **ENG-01**: User can initialize the audio engine after a click (autoplay policy compliance)
- [x] **ENG-02**: User can evaluate a Strudel code string and get an error result if it fails
- [x] **ENG-03**: User can play and stop a Strudel pattern
- [x] **ENG-04**: Engine emits HapEvents with timing data (scheduledAheadMs, midiNote, loc, s, color) for every scheduled note
- [x] **ENG-05**: User can export a pattern as a WAV file via OfflineAudioContext fast-render (oscillator sounds only)
- [x] **ENG-06**: User can record live audio output as WAV (ScriptProcessorNode tap)
- [x] **ENG-07**: User can render multiple stems in parallel, each producing an isolated WAV blob
- [x] **ENG-08**: noteToMidi() correctly converts note name strings ("c3", "eb4", "f#2") and MIDI numbers

### Editor Core (Validated — already implemented)

- [x] **EDIT-01**: User sees a Monaco editor with Strudel code, dark theme, and monospace font
- [x] **EDIT-02**: Component supports controlled (code prop) and uncontrolled (defaultCode) modes
- [x] **EDIT-03**: Toolbar shows play/stop/export buttons, BPM display, and error badge
- [x] **EDIT-04**: Keyboard shortcut Ctrl+Enter toggles play/stop
- [x] **EDIT-05**: Exporting WAV triggers browser download when no onExport handler is provided
- [x] **EDIT-06**: engineRef prop lets integrators access the StrudelEngine instance directly
- [x] **EDIT-07**: Theme tokens (design system colors/fonts) applied via CSS custom properties

### Active Highlighting

- [ ] **HIGH-01**: Monaco characters that generated a playing note are highlighted with accent-colored background and outline
- [ ] **HIGH-02**: Highlights fire at the exact moment audio plays (delayed by scheduledAheadMs from HapEvent)
- [ ] **HIGH-03**: Highlights clear automatically when the note ends (audioDuration from HapEvent)
- [ ] **HIGH-04**: Multiple simultaneous haps (chords) each get independent highlight/clear cycles
- [ ] **HIGH-05**: Highlights use decoration class `strudel-active-hap` with correct design token colors

### Visualizers — Pianoroll

- [ ] **PIANO-01**: Full-panel Pianoroll canvas renders at 60fps via requestAnimationFrame
- [ ] **PIANO-02**: Pianoroll shows a rolling 6-second time window (right edge = now, scrolls left)
- [ ] **PIANO-03**: Y-axis spans MIDI 24 (C1) to MIDI 96 (C7)
- [ ] **PIANO-04**: Note blocks colored by s field (drums=orange, bass=cyan, melody=violet, pad=emerald, default=accent) or by hap.value.color if present
- [ ] **PIANO-05**: Percussion sounds (bd, sd, hh, etc.) shown at fixed MIDI positions below pitch area
- [ ] **PIANO-06**: Inline pianoroll embedded in Monaco as a view zone below $: lines (120px height)
- [ ] **PIANO-07**: Inline view zones re-added after every evaluate() call (they reset on editor re-layout)

### Visualizers — Audio Analysis

- [ ] **VIZ-01**: Scope visualizer renders time-domain waveform from AnalyserNode at 60fps
- [ ] **VIZ-02**: Scope uses zero-crossing trigger for stable waveform display
- [ ] **VIZ-03**: Spectrum visualizer renders frequency bars from AnalyserNode at 60fps
- [ ] **VIZ-04**: Spectrum bar colors use hue gradient (purple to blue)
- [ ] **VIZ-05**: Spiral visualizer maps note events to positions on a rotating spiral (cycle-based)
- [ ] **VIZ-06**: Pitchwheel visualizer shows 12 pitch classes on a circle; active notes glow

### Monaco Intelligence

- [ ] **MON-01**: Monaco uses a custom 'strudel' language with Monarch tokenizer
- [ ] **MON-02**: Strudel functions (note, s, gain, stack, every, jux, fast, slow, etc.) highlighted in blue
- [ ] **MON-03**: Note names (c3, eb4, f#2) highlighted in green
- [ ] **MON-04**: Mini-notation strings get sub-tokenized (operators, note names, numbers distinct)
- [ ] **MON-05**: Dot completions offer all chainable Strudel function names with signatures
- [ ] **MON-06**: Inside note("...") — completions for note names and mini-notation operators
- [ ] **MON-07**: Inside s("...") — completions for oscillator types and common percussion names
- [ ] **MON-08**: Error from evaluate() shown as Monaco red squiggles via setModelMarkers
- [ ] **MON-09**: Hover over a Strudel function shows documentation and an example

### Toolbar & UI

- [ ] **UI-01**: VizPicker toolbar component lets user switch between visualizer modes
- [ ] **UI-02**: Layout follows spec: toolbar (40px) + viz-picker (32px) + editor + visualizer panel
- [ ] **UI-03**: vizHeight prop controls visualizer panel height (default 200px)
- [ ] **UI-04**: showToolbar prop hides toolbar (default: shown)

### Library Polish

- [ ] **LIB-01**: Vitest unit tests for WavEncoder (header correctness, stereo interleaving, mono fallback)
- [ ] **LIB-02**: Vitest unit tests for noteToMidi (note names, MIDI pass-through, invalid inputs)
- [ ] **LIB-03**: Vitest test for highlight timing (scheduledAheadMs fires at correct time)
- [ ] **LIB-04**: tsup build produces valid ESM + CJS bundles with correct package.json exports field
- [ ] **LIB-05**: All public API types exported from index.ts (StrudelEditor, StrudelEngine, all visualizers, StrudelEditorProps, StrudelTheme, HapEvent)
- [ ] **LIB-06**: Storybook stories for StrudelEditor (default, with pianoroll, with scope, read-only)
- [ ] **LIB-07**: Storybook stories for each visualizer component in isolation
- [ ] **LIB-08**: README.md with npm install instructions and minimal usage example

### App (Demo Site)

- [ ] **APP-01**: packages/app renders StrudelEditor with play/stop/export working
- [ ] **APP-02**: App demo page shows all visualizer types switchable via VizPicker
- [ ] **APP-03**: App includes an examples gallery with 3-5 starter Strudel patterns
- [ ] **APP-04**: App polished as public-facing demo site (landing page, usage docs)

## v2 Requirements

### Export

- **EXP-01**: Multi-stem ZIP export from toolbar (fflate, lazy import)
- **EXP-02**: Progress indicator during offline render (onProgress callback)

### Advanced Monaco

- **MON-10**: setcps() BPM formula suggestion in completions
- **MON-11**: Inline error messages (Monaco inline decoration)

### Audio

- **AUDIO-01**: Sample-based sounds in OfflineRenderer (requires AudioWorklet workaround or fallback)

## Out of Scope

| Feature | Reason |
|---------|--------|
| iframe or strudel-editor web component | Replaced by direct @strudel/core integration — no iframe boundary |
| Application-specific CDN/upload logic | Integrators provide onExport hook — struCode stays generic |
| Zustand / Redux state management | Not needed in a component library |
| Server-side audio rendering | Browser Web Audio API only |
| p5.js for visualizers | Native Canvas 2D is sufficient; p5 adds 300KB+ bundle weight with no benefit |
| Real-time sample playback in OfflineRenderer | AudioWorklet cannot be re-registered in OfflineAudioContext — oscillators only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENG-01..08 | Existing | Complete |
| EDIT-01..07 | Existing | Complete |
| HIGH-01 | Phase 1 | Pending |
| HIGH-02 | Phase 1 | Pending |
| HIGH-03 | Phase 1 | Pending |
| HIGH-04 | Phase 1 | Pending |
| HIGH-05 | Phase 1 | Pending |
| PIANO-01 | Phase 2 | Pending |
| PIANO-02 | Phase 2 | Pending |
| PIANO-03 | Phase 2 | Pending |
| PIANO-04 | Phase 2 | Pending |
| PIANO-05 | Phase 2 | Pending |
| PIANO-06 | Phase 2 | Pending |
| PIANO-07 | Phase 2 | Pending |
| UI-01 | Phase 2 | Pending |
| UI-02 | Phase 2 | Pending |
| UI-03 | Phase 2 | Pending |
| UI-04 | Phase 2 | Pending |
| VIZ-01 | Phase 3 | Pending |
| VIZ-02 | Phase 3 | Pending |
| VIZ-03 | Phase 3 | Pending |
| VIZ-04 | Phase 3 | Pending |
| VIZ-05 | Phase 3 | Pending |
| VIZ-06 | Phase 3 | Pending |
| MON-01 | Phase 4 | Pending |
| MON-02 | Phase 4 | Pending |
| MON-03 | Phase 4 | Pending |
| MON-04 | Phase 4 | Pending |
| MON-05 | Phase 4 | Pending |
| MON-06 | Phase 4 | Pending |
| MON-07 | Phase 4 | Pending |
| MON-08 | Phase 4 | Pending |
| MON-09 | Phase 4 | Pending |
| LIB-01 | Phase 5 | Pending |
| LIB-02 | Phase 5 | Pending |
| LIB-03 | Phase 5 | Pending |
| LIB-04 | Phase 5 | Pending |
| LIB-05 | Phase 5 | Pending |
| LIB-06 | Phase 5 | Pending |
| LIB-07 | Phase 5 | Pending |
| LIB-08 | Phase 5 | Pending |
| APP-01 | Phase 5 | Pending |
| APP-02 | Phase 5 | Pending |
| APP-03 | Phase 5 | Pending |
| APP-04 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 43 active (16 validated/complete, 43 active pending)
- Mapped to phases: 43/43
- Unmapped: 0

---
*Requirements defined: 2026-03-21*
*Last updated: 2026-03-21 after roadmap creation*
