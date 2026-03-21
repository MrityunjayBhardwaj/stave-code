# Architecture

**Analysis Date:** 2026-03-21

## Pattern Overview

**Overall:** Monorepo (pnpm + Turborepo) with a React component library (`@strucode/editor`) consumed by a Next.js 15 demo app.

**Key Characteristics:**
- Single source of truth: `StrudelEngine` class that wraps `@strudel/webaudio` for audio scheduling and rendering
- Event-driven architecture: `HapStream` (event bus) emits all scheduled audio events to visualizers and UI
- Clean separation: Engine layer (audio) is completely decoupled from UI layer (React components)
- Three export modes: Live playback, live capture (real-time recording), offline rendering (50× faster via OfflineAudioContext)

## Layers

**Engine Layer:**
- Purpose: Audio scheduling, evaluation, rendering, and export
- Location: `packages/editor/src/engine/`
- Contains: `StrudelEngine` (main class), `HapStream` (event bus), `OfflineRenderer`, `LiveRecorder`, `WavEncoder`, `noteToMidi` utilities
- Depends on: `@strudel/core`, `@strudel/webaudio`, `@strudel/mini`, `@strudel/tonal`, `@strudel/transpiler`
- Used by: React components, app integrations

**Monaco Editor Layer:**
- Purpose: Code editor with Strudel-aware syntax highlighting, language features, keyboard shortcuts
- Location: `packages/editor/src/monaco/`
- Contains: `StrudelMonaco` (component wrapper), `language.ts` (tokenizer + configuration)
- Depends on: `@monaco-editor/react`, `monaco-editor`
- Used by: `StrudelEditor` root component

**UI Layer:**
- Purpose: React components for playback control, visual feedback, and export
- Location: `packages/editor/src/` (root components), `packages/editor/src/toolbar/`, `packages/editor/src/theme/`
- Contains: `StrudelEditor` (root), `Toolbar` (play/stop/export controls), theme system
- Depends on: React, Engine, Monaco Editor
- Used by: Integrators (Next.js app, external apps)

**Theme Layer:**
- Purpose: Design tokens and theming via CSS custom properties
- Location: `packages/editor/src/theme/`
- Contains: Dark/light token definitions, `applyTheme()` function, Monaco theme customization
- Depends on: None (pure data + utilities)
- Used by: All UI components

## Data Flow

**Code Evaluation & Playback:**

1. User types code in Monaco editor
2. `StrudelEditor.handlePlay()` calls `engine.evaluate(code)`
3. `StrudelEngine.evaluate()` → `webaudioRepl.evaluate()` → `@strudel/core` parses and validates
4. On success: `StrudelEngine.play()` → `scheduler.start()` begins audio playback
5. Scheduler fires `onTrigger()` callback for each scheduled Hap (note event)
6. Wrapped output function emits Hap to `HapStream` before audio trigger
7. `HapStream.emit()` enriches event (MIDI note, audio timing, source location) and broadcasts to all subscribers
8. Visualizers/highlighters consume events in real-time

**Export Flow (Offline Rendering):**

1. `StrudelEditor.handleExport()` calls `engine.renderOffline(code, duration)`
2. `OfflineRenderer.render()`:
   - Evaluates code with fresh imports (no live context contamination)
   - Extracts pattern via `pattern.queryArc()`
   - Loops through all Haps in duration window
   - For each Hap: converts note name → MIDI → frequency, creates oscillator, connects to gain + destination
   - Runs `offlineCtx.startRendering()` at CPU speed (no real-time constraint)
   - ~30 sec audio renders in 300-600ms (50× faster than real-time)
3. `WavEncoder.encode()` converts AudioBuffer to WAV Blob
4. Integrator hook `onExport(blob)` handles upload/download

**Export Flow (Live Recording):**

1. `StrudelEditor.handleExport()` could call `engine.record(duration)` instead
2. `LiveRecorder.capture()`:
   - Creates ScriptProcessorNode tapping analyser output
   - Records incoming audio chunks to Float32Array buffer
   - Passes through to speakers (non-interrupting)
   - After timeout: disconnects, encodes to WAV
3. Returns WAV Blob with exactly what the user heard

## Key Abstractions

**StrudelEngine:**
- Purpose: Central API for all audio operations
- Examples: `packages/editor/src/engine/StrudelEngine.ts`
- Pattern: Singleton-like (one per component instance), lazy initialization on first user gesture
- Exposes: `init()`, `evaluate()`, `play()`, `stop()`, `record()`, `renderOffline()`, `renderStems()`, `on/off()` event subscription

**HapStream:**
- Purpose: Lightweight event bus for audio scheduling
- Examples: `packages/editor/src/engine/HapStream.ts`
- Pattern: Observer pattern — subscribers register handlers, engine emits enriched HapEvents
- Event shape: `{ hap, audioTime, audioDuration, scheduledAheadMs, midiNote, s, color, loc }`
- Used by: Active note highlighting, visualizers, pianoroll, scope/spectrum

**OfflineRenderer:**
- Purpose: Fast, isolated audio rendering without touching live AudioContext
- Examples: `packages/editor/src/engine/OfflineRenderer.ts`
- Pattern: Static methods, completely self-contained
- Algorithm: Query pattern arc, generate oscillators per note, run native WebAudio in OfflineAudioContext
- Limitation: Oscillators only (sine, saw, square, triangle); samples skipped due to AudioWorklet re-registration constraints

**WavEncoder:**
- Purpose: Pure TypeScript RIFF WAV encoder (no dependencies)
- Examples: `packages/editor/src/engine/WavEncoder.ts`
- Pattern: Static utility, converts AudioBuffer or Float32Array chunks → WAV Blob
- Output: 16-bit stereo PCM WAV files

## Entry Points

**StrudelEditor (React Component):**
- Location: `packages/editor/src/StrudelEditor.tsx`
- Triggers: Imported by integrators, rendered in Next.js app
- Responsibilities:
  - Manages controlled/uncontrolled code state
  - Creates + exposes `StrudelEngine` instance
  - Wires play/stop/export handlers
  - Applies theme tokens to container
  - Renders Monaco editor + toolbar + visualizer placeholder
  - Handles auto-play, error display, BPM extraction

**StrudelMonaco (Monaco Editor Wrapper):**
- Location: `packages/editor/src/monaco/StrudelMonaco.tsx`
- Triggers: Mounted by `StrudelEditor`
- Responsibilities:
  - Wraps `@monaco-editor/react`
  - Registers Strudel language definition + theme
  - Syncs code state without losing cursor
  - Injects active highlight CSS

**@strucode/editor Package Exports:**
- Location: `packages/editor/src/index.ts`
- Exports: `StrudelEditor` (component), `StrudelEngine` (class), `HapStream`, `OfflineRenderer`, `LiveRecorder`, `WavEncoder`, `noteToMidi`, theme utilities
- Used by: Next.js app, external integrators

**@strucode/app (Next.js Demo):**
- Location: `packages/app/src/app/page.tsx`
- Triggers: Render at `/`
- Responsibilities:
  - Page layout with header, editor, footer
  - Dynamic import wrapper (`EditorWrapper.tsx`) for SSR-safe client component
  - Passes through hooks for integrator-specific upload logic

## Error Handling

**Strategy:** Try-catch with error propagation to UI; engine errors bubble to `onError` callback.

**Patterns:**
- `StrudelEngine.evaluate()` returns `{ error?: Error }` instead of throwing
- Error callback `onEvalError()` in REPL bridges promise to sync callback
- Toolbar displays error message in red badge
- `HapStream.emit()` catches subscriber exceptions to prevent cascade failures
- `LiveRecorder` silently continues if analyser already disconnected

## Cross-Cutting Concerns

**Logging:** No logging framework integrated; uses browser `console` for debugging (commented in test/dev scenarios).

**Validation:**
- Monaco syntax highlighting provides visual feedback pre-evaluation
- `StrudelEngine.evaluate()` validates via `@strudel/core` parser
- Note name validation in `noteToMidi()` with null-safe fallback

**Authentication:** Not applicable — editor operates entirely client-side.

**Audio Context Initialization:**
- Lazy initialization on first `init()` call (requires user gesture)
- `initAudio()` from `@strudel/webaudio` handles browser context setup
- Analyser node created + tapped after context ready

---

*Architecture analysis: 2026-03-21*
