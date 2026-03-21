# External Integrations

**Analysis Date:** 2026-03-21

## Overview

struCode is a **client-side only** audio editor with no external API dependencies, cloud services, or backend integrations. All integrations are browser-based audio libraries and the Strudel.js ecosystem.

## Audio & Music Libraries

### Strudel.js Ecosystem

**Core Modules:**
- `@strudel/core` 1.0.0 - Pattern evaluation engine
  - Provides: `evaluate(code)` function for pattern parsing
  - Usage: `packages/editor/src/engine/StrudelEngine.ts:25`
  - Usage: `packages/editor/src/engine/OfflineRenderer.ts:24`

- `@strudel/webaudio` 1.0.0 - Web Audio API integration
  - Provides: `webaudioRepl()`, `webaudioOutput()`, `initAudio()`, `getAudioContext()`, `connectToDestination()`
  - Usage: `packages/editor/src/engine/StrudelEngine.ts:32-45`
  - Wraps: superdough (internal Strudel synthesis engine)
  - Audio Context: Single global AudioContext per page

- `@strudel/mini` 1.0.0 - Mini-notation support
  - Side-effect: Registers pattern syntax helpers on import
  - Usage: `packages/editor/src/engine/StrudelEngine.ts:29`
  - Usage: `packages/editor/src/engine/OfflineRenderer.ts:22`

- `@strudel/tonal` 1.0.0 - Music theory and note functions
  - Side-effect: Registers `note()`, `s()`, `gain()` and other musical functions
  - Usage: `packages/editor/src/engine/StrudelEngine.ts:30`
  - Usage: `packages/editor/src/engine/OfflineRenderer.ts:23`
  - Provides note name → MIDI conversion

- `@strudel/transpiler` 1.2.6 - Pattern syntax transpiler
  - Provides: `transpiler()` function to transform `$: pattern` syntax
  - Usage: `packages/editor/src/engine/StrudelEngine.ts:61`
  - Converts: `$: note("c3").s("sine")` → `.p()` registrations

### Web Audio API

**Browser Standard:**
- No external dependency
- Used via native browser APIs: `AudioContext`, `OfflineAudioContext`, `OscillatorNode`, `GainNode`, `AnalyserNode`
- Implementation: `packages/editor/src/engine/StrudelEngine.ts` (lines 36-46)
- Offline rendering: `packages/editor/src/engine/OfflineRenderer.ts` (lines 37-66)
- Audio export: `packages/editor/src/engine/WavEncoder.ts` (pure TypeScript RIFF/WAV encoder, no dependencies)

**AnalyserNode (for visualizers):**
- Created in: `packages/editor/src/engine/StrudelEngine.ts:40`
- FFT size: 2048 samples
- Used by: Visualizer components (future Phase 3/4)

## Code Editor Integration

### Monaco Editor

**UI Components:**
- `monaco-editor` 0.50.0 - Standalone editor library
  - Used in: `packages/editor/src/monaco/StrudelMonaco.tsx`

- `@monaco-editor/react` 4.6.0 - React wrapper
  - Implementation: `packages/editor/src/monaco/StrudelMonaco.tsx:1-2`
  - Props: `code`, `onChange`, `height`, `theme`, `readOnly`, `onMount`
  - Custom theming: `packages/editor/src/theme/monacoTheme.ts`
  - Custom language: `packages/editor/src/monaco/language.ts`

**Language Support:**
- Custom language registration in: `packages/editor/src/monaco/language.ts`
- Syntax highlighting for Strudel pattern DSL
- Keyboard shortcuts wired via Monaco actions:
  - Ctrl/Cmd+Enter: Play pattern
  - Ctrl/Cmd+.: Stop playback

## Data Storage

**Not Used:**
- No database
- No file storage service
- No persistent state backend

**Client-Side Only:**
- Pattern code: Stored in React component state (`packages/editor/src/StrudelEditor.tsx:74-77`)
- Visualization state: In-memory (useRef, useState)

## Authentication & Identity

**Not Used:**
- No user authentication
- No session management
- No API keys required

## Monitoring & Observability

**Not Used:**
- No error tracking service (Sentry, etc.)
- No analytics
- No logging to external service

**Local:**
- Console logging only
- Error handling: `onError` callback in `StrudelEditorProps` (`packages/editor/src/StrudelEditor.tsx:27`)

## Export Capabilities

### Audio Export

**WAV Export:**
- Format: 16-bit signed PCM, stereo, variable sample rate (default 44100 Hz)
- Implementation: `packages/editor/src/engine/WavEncoder.ts` (pure TypeScript RIFF encoder)
- No external dependencies
- Generated as Blob for download or custom handler

**Export Modes:**

1. **Live Recording:**
   - Captures real-time playback via ScriptProcessorNode
   - Implementation: `packages/editor/src/engine/LiveRecorder.ts`
   - Returns: Blob of recorded audio

2. **Offline Rendering:**
   - Renders pattern at CPU speed via OfflineAudioContext
   - Implementation: `packages/editor/src/engine/OfflineRenderer.ts`
   - Duration: Configurable (default 8 seconds per `StrudelEditor.tsx:52`)
   - Limitations: Oscillator-based sounds only (sine, sawtooth, square, triangle)
   - Sample-based sounds (bd, sd, hh) are skipped

3. **Stem Export (Future):**
   - API exists: `StrudelEngine.renderStems()` (`packages/editor/src/engine/StrudelEngine.ts:116-132`)
   - Renders multiple patterns as separate audio files
   - Not yet integrated into UI

**Custom Export Handler:**
- Callback: `onExport` in `StrudelEditorProps` (`packages/editor/src/StrudelEditor.tsx:42`)
- Signature: `(blob: Blob, stemName?: string) => Promise<string>`
- Default behavior: Trigger browser download with `<a>` element click

## Real-Time Audio Monitoring

### HAP Stream

**Event System:**
- Internal pub/sub for audio events: `packages/editor/src/engine/HapStream.ts`
- "HAP" = Heavily Armed Percussion (Strudel event object)
- Usage: Fan events to visualizers during playback
- Implementation: `packages/editor/src/engine/StrudelEngine.ts:49-58`

**Interface:**
- `on(handler)` / `off(handler)` - Subscribe to audio events
- Event object: `{ hap, time, cps, endTime, audioContextTime }`
- Subscribers: Visualizers (WaveformScope, PianoRoll, Spectrum, etc. - Phase 3/4)

## External Imports & Peer Dependencies

**React/DOM (Peer):**
- `react` >=18 - Required by @strucode/editor
- `react-dom` >=18 - Required for DOM rendering

**Provided by Host:**
- Next.js app (`packages/app`) provides React 19.2.4, React DOM 19.2.4
- Satisfies peerDependencies

## No Cloud/Backend Services

**Not integrated:**
- No database (PostgreSQL, Firestore, etc.)
- No object storage (S3, GCS, Firebase Storage)
- No API backends
- No authentication providers (Auth0, Firebase Auth, etc.)
- No real-time services (WebSockets, Pusher, etc.)
- No CDN or external assets
- No analytics or telemetry

## Build-Time Only Dependencies

**Development:**
- Turbo 2.0.0+ - Task orchestration
- TypeScript 5.4.x - Compilation
- ESLint 9.x - Linting
- Vitest 1.6.0 - Unit tests
- tsup 8.0.0 - Library bundling
- Next.js 16.2.1 - App framework & build

These are not bundled in production.

## Summary of Integration Points

| Category | Service | Type | Required |
|----------|---------|------|----------|
| Audio | Strudel.js ecosystem | Library | Yes |
| Audio | Web Audio API | Browser Standard | Yes |
| Editor | Monaco Editor | Library | Yes |
| Export | RIFF WAV encoder | Internal | Yes |
| State | Browser memory | Local | Yes |
| Storage | IndexedDB/LocalStorage | Not used | No |
| Backend | REST/GraphQL API | Not used | No |
| Auth | OAuth/API Keys | Not used | No |

---

*Integration audit: 2026-03-21*
