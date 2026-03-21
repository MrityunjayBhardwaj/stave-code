# Codebase Concerns

**Analysis Date:** 2026-03-21

## Critical Audio API Risks

**OfflineAudioContext with @strudel/webaudio incompatibility:**
- Issue: `OfflineRenderer.render()` creates a fresh `OfflineAudioContext` to render patterns offline, but @strudel/webaudio's `webaudioOutput` function may not accept or properly handle offline contexts. The code passes the offline context directly to audio synthesis but never validates that webaudioOutput is compatible.
- Files: `src/engine/OfflineRenderer.ts` (line 37), `src/strudel.d.ts` (lines 28-35)
- Impact: Export/offline rendering may silently fail or produce silent audio when using sample-based sounds. Users downloading WAV files may get blank audio without error feedback.
- Fix approach: Add explicit validation that OfflineAudioContext can be substituted for AudioContext in webaudioOutput. If incompatible, create a dedicated offline synth path bypassing webaudioOutput.

**Sample-based sounds silently skipped in offline rendering:**
- Issue: `OfflineRenderer.ts` explicitly skips all percussion/sample-based sounds (lines 11-13, 56) because "AudioWorklets cannot be re-registered in a fresh OfflineAudioContext". The code silently continues without warning the user that their drum patterns won't export.
- Files: `src/engine/OfflineRenderer.ts` (lines 11-13, 54-56)
- Impact: Exported patterns are incomplete if they use `s("bd")`, `s("hh")`, `s("sd")` etc. No error is thrown—users get partial audio with no indication why drums are missing.
- Fix approach: Detect sample-based sounds during offline rendering and either: (a) queue a warning to the UI, (b) throw an error, or (c) implement a fallback synthetic kick/hat generator for common samples.

**ScriptProcessorNode deprecated in LiveRecorder:**
- Issue: `LiveRecorder.ts` (line 19) uses `ctx.createScriptProcessor()` which is deprecated in the Web Audio API spec. While it remains widely supported, browsers may remove support or warn in consoles.
- Files: `src/engine/LiveRecorder.ts` (lines 19, 23-28)
- Impact: Future browser versions may remove ScriptProcessorNode support entirely. Real-time recording would fail. The code includes a note acknowledging this (lines 5-9) but provides no migration path.
- Fix approach: Migrate to AudioWorklet-based recording. This requires: (1) defining a processor worklet, (2) passing encoded buffer channels from worklet to main thread via MessagePort, (3) testing cross-browser latency vs. ScriptProcessorNode. High effort, should be Phase 3+ work.

**No fallback for AudioWorklet unsupported contexts:**
- Issue: Both live playback (webaudioOutput) and offline rendering implicitly depend on AudioWorklet support for sample playback. No code checks for AudioWorklet availability before initializing.
- Files: `src/engine/StrudelEngine.ts` (line 33-35), `src/engine/OfflineRenderer.ts` (lines 21-24)
- Impact: On browsers without AudioWorklet support (rare but non-zero), initialization silently fails or produces no audio. No error message guides users to upgrade.
- Fix approach: Add AudioWorklet capability detection in `StrudelEngine.init()`. If unavailable, warn user or throw with actionable message.

---

## Browser Compatibility Gaps

**No explicit browser version targeting:**
- Issue: Package declares `react: ">=18"` in `package.json` but no documented minimum browser versions. Monaco Editor v0.50.0 and modern Web Audio APIs have specific requirements.
- Files: `packages/editor/package.json` (lines 28-31)
- Impact: Users on unsupported browsers (IE11, older Safari, etc.) may get cryptic import errors or blank UI.
- Fix approach: Add to README: "Requires Chrome 90+, Firefox 88+, Safari 14.1+, Edge 90+". Add runtime check in `StrudelEngine.init()` to detect missing APIs (AudioContext, OfflineAudioContext, AudioWorklet).

**React 19 type mismatch with Monaco Editor:**
- Issue: `StrudelMonaco.tsx` (lines 3-5) manually casts `MonacoEditorRaw` to `any` because @monaco-editor/react types are written for React 18, causing JSX type conflicts.
- Files: `src/monaco/StrudelMonaco.tsx` (lines 3-5)
- Impact: Type safety is lost; future React or Monaco updates could break the cast silently.
- Fix approach: Wait for @monaco-editor/react to publish React 19-compatible types, OR create a type wrapper that bridges the version gap.

---

## Type Safety Issues

**Heavy use of `any` type throughout codebase:**
- Issue: 20+ instances of `// eslint-disable-next-line @typescript-eslint/no-explicit-any` and explicit `any` types in core files. Strudel packages lack TypeScript types (declared in `strudel.d.ts` lines 4-85), forcing loose typing.
- Files:
  - `src/engine/StrudelEngine.ts` (lines 16, 27, 44, 52, 57)
  - `src/engine/OfflineRenderer.ts` (lines 27, 40)
  - `src/engine/HapStream.ts` (lines 5, 46)
  - `src/monaco/StrudelMonaco.tsx` (line 5)
- Impact: Runtime errors slip through type checking. Pattern structure, Hap object shape, and repl API are unverified at compile time.
- Fix approach: Create narrower types for Hap, Pattern, and Scheduler interfaces in `strudel.d.ts`. Add type guards to verify hap objects before destructuring in OfflineRenderer and HapStream.

**Untyped event handler in HapStream:**
- Issue: `HapStream.emit()` (lines 44-73) accepts raw `any` hap object and only extracts properties via optional chaining. No validation that required fields exist.
- Files: `src/engine/HapStream.ts` (lines 44-73)
- Impact: If scheduler passes malformed hap object, HapStream silently emits null values to subscribers. Visualizers may crash or display incorrect data.
- Fix approach: Add a type guard function `isValidHap(hap: unknown): hap is Hap` and validate before emit.

---

## Incomplete Features

**Visualizers are stubs:**
- Issue: `StrudelEditor.tsx` (lines 256-271) shows placeholder text "pianoroll/scope/spectrum/spiral/pitchwheel — coming in Phase 3/4". Index.ts exports commented-out visualizer exports (lines 19-23).
- Files: `src/StrudelEditor.tsx` (lines 255-271), `src/index.ts` (lines 19-23)
- Impact: Users request visualizers but none exist. The UI allocates space for them but renders only text. This is documented as Phase 2 work in ARCHITECTURE.md.
- Fix approach: Phase 3/4 deliverable. Implement Pianoroll first (high demand). Each visualizer must subscribe to HapStream and use AnalyserNode data from StrudelEngine.

**No code location tracking for error highlighting:**
- Issue: `HapEvent.loc` (HapStream.ts line 20) is declared as `Array<{start, end}>` from hap.context.locations, but code never populates or uses it for highlight visualization. HapStream emits loc but no consumer acts on it.
- Files: `src/engine/HapStream.ts` (lines 19-20, 63), unused in `src/StrudelEditor.tsx`
- Impact: Active code highlighting (showing which pattern is playing) cannot work without source map. Users can't visually follow execution.
- Fix approach: Extend Strudel transpiler output to include location data. Implement location-based highlighting in Monaco when note fires.

**No error recovery or restart mechanism:**
- Issue: `StrudelEngine.evaluate()` (lines 75-87) catches errors but has no mechanism to recover the engine state. If evaluation fails, the previous pattern keeps playing indefinitely.
- Files: `src/engine/StrudelEngine.ts` (lines 75-87)
- Impact: User gets an error and can't cleanly reset without refreshing the page. Pattern is stuck in stale state.
- Fix approach: Add `engine.reset()` method that stops scheduler, clears pattern, and resets internal state. Call it automatically on fatal errors.

---

## Performance Concerns

**OfflineRenderer re-parses code for each stem:**
- Issue: `StrudelEngine.renderStems()` (lines 116-132) calls `OfflineRenderer.render()` once per stem, which re-imports @strudel/mini, @strudel/tonal, and calls `evaluate()` each time. Heavy startup cost for each stem.
- Files: `src/engine/StrudelEngine.ts` (lines 116-132), `src/engine/OfflineRenderer.ts` (lines 22-24)
- Impact: Exporting 4-5 stems is slow (5-10 second wait per stem). UI shows no progress feedback except onProgress callback to parent.
- Fix approach: Cache parsed pattern AST after first evaluation. Pass it to subsequent OfflineRenderer renders to skip re-parsing. Add ETA display in Toolbar based on stem count.

**No garbage collection of disposed engines:**
- Issue: `StrudelEditor.tsx` (line 210) calls `engineRef.current?.dispose()` on unmount, but `StrudelEngine.dispose()` (lines 156-162) only clears references—it doesn't close AudioContext or stop the scheduler if still playing.
- Files: `src/StrudelEditor.tsx` (line 210), `src/engine/StrudelEngine.ts` (lines 156-162)
- Impact: Multiple editor instances created/destroyed will leak AudioContexts. Browsers have a low limit (usually 6 concurrent contexts). Stress tests fail after creating ~6 editors.
- Fix approach: In `dispose()`, explicitly call `scheduler.stop()` if running, then call `audioCtx.close()` (if OfflineAudioContext doesn't support close, catch and swallow error).

**No debouncing on code changes:**
- Issue: `StrudelEditor.tsx` (lines 173-179) calls `onChange` on every keystroke. Each change could trigger re-evaluation in parent component via HMR without debounce.
- Files: `src/StrudelEditor.tsx` (lines 173-179), `src/monaco/StrudelMonaco.tsx` (lines 83)
- Impact: If parent calls `engine.evaluate()` on every change, the scheduler may spam evaluations. No race condition guard exists in StrudelEngine.
- Fix approach: Add debounce to onChange callback in StrudelEditor (e.g., 500ms). Document that parent should implement debounce or use controlled input carefully.

---

## Testing Gaps

**Only WAV encoder has tests:**
- Issue: Only `src/engine/WavEncoder.test.ts` has unit tests (113 lines). StrudelEngine, OfflineRenderer, LiveRecorder, HapStream, and all UI components have no tests.
- Files: Test coverage limited to `WavEncoder.test.ts`
- Impact: Refactors to critical engine code (evaluate, dispose, renderOffline) can break without detection. Audio output quality regressions go unnoticed.
- Fix approach:
  - Unit tests for StrudelEngine (init, evaluate error handling, dispose, memory cleanup)
  - Integration tests for OfflineRenderer (validate WAV output matches pattern)
  - Component tests for StrudelEditor (play/stop state, error display, export flow)
  - Target 70%+ coverage for src/engine/*

**No browser compatibility testing:**
- Issue: No test matrix for Chrome, Firefox, Safari, Edge. No AudioWorklet fallback tests.
- Files: `vitest.config.ts` uses jsdom (node environment), not real browser
- Impact: Safari-specific bugs (e.g., AudioContext state quirks) only discovered in production.
- Fix approach: Add Vitest browser mode or Playwright E2E tests. Test against real browsers via CI matrix.

---

## Security Considerations

**Code evaluation from user input:**
- Issue: `StrudelEngine.evaluate()` (line 75) calls `webaudioRepl.evaluate(code)` with untrusted code from the editor. While Strudel's sandbox is intentional, no Content Security Policy restricts what the evaluated code can access.
- Files: `src/engine/StrudelEngine.ts` (line 82), `src/StrudelEditor.tsx` (line 116)
- Impact: A malicious pattern could theoretically access DOM, storage, or network (if browser allows). This is acceptable for a music tool but should be documented.
- Fix approach: Add comment in StrudelEngine documenting that code evaluation is intentionally permissive (music DSL). For embedded use, consider sandboxing in iframe or Web Worker.

**No input validation on export duration:**
- Issue: `StrudelEditor.tsx` hardcodes DEFAULT_EXPORT_DURATION = 8 seconds (line 52). No validation prevents rendering 1000-second patterns that would freeze the browser.
- Files: `src/StrudelEditor.tsx` (lines 52, 151)
- Impact: Malicious or accidental UI manipulation could request unbounded render time, causing browser hang.
- Fix approach: Cap export duration to max 60 seconds in UI. Add timeout to OfflineRenderer.render() that rejects if rendering takes >120 seconds.

**No CORS validation for Monaco dependencies:**
- Issue: Monaco Editor and typeface fonts are loaded from CDN with no integrity checks. If CDN is compromised, attacker gets full JavaScript execution in browser.
- Files: Implicit via @monaco-editor/react npm package
- Impact: Supply chain risk if Monaco's build is compromised.
- Fix approach: Use npm's `integrity` field in lock file (already in pnpm-lock.yaml). Consider SRI hashes for CDN resources if self-hosting Monaco.

---

## Missing Infrastructure

**No error boundary or crash recovery:**
- Issue: `StrudelEditor.tsx` has no React.ErrorBoundary wrapper. If any child component crashes, entire editor unmounts.
- Files: `src/StrudelEditor.tsx` (no try-catch around render)
- Impact: A single bug in future visualizer code crashes the editor. Parent loses reference to engine state.
- Fix approach: Wrap StrudelMonaco and visualizer sections in ErrorBoundary. Log errors and show fallback UI.

**No logging or analytics:**
- Issue: No way to debug user issues or track feature usage. Errors are only visible to the user via onError callback.
- Files: All engine files
- Impact: Users report vague errors ("nothing happens when I press export") with no logs to diagnose.
- Fix approach: Add optional logging sink to StrudelEngine. Emit lifecycle events (init, play, stop, error) with timestamps. Parent can wire to console, Sentry, or custom analytics.

**No offline fallback or service worker:**
- Issue: Application requires live npm package fetches (dynamic imports in OfflineRenderer, StrudelEngine). No service worker caches Strudel libraries.
- Files: `src/engine/OfflineRenderer.ts` (lines 22-24), `src/engine/StrudelEngine.ts` (lines 29-30)
- Impact: Works offline only if Strudel packages were already imported. First load on a flight fails silently.
- Fix approach: Pre-bundle essential Strudel libraries into editor package rather than dynamic imports. Or register service worker to cache @strudel/* modules after first load.

**No version compatibility matrix:**
- Issue: Dependencies are pinned tightly (@strudel/core: ^1.0.0) with no documented compatibility. A breaking change in @strudel/webaudio could break all exports.
- Files: `packages/editor/package.json` (lines 34-38)
- Impact: Upstream breaking changes in Strudel cause silent failures.
- Fix approach: Document tested Strudel versions. Add integration tests that verify OfflineRenderer and StrudelEngine work with each Strudel release.

---

## Technical Debt Summary

| Area | Severity | Effort | Phase |
|------|----------|--------|-------|
| AudioWorklet offline context incompatibility | Critical | Medium | Phase 1B |
| Sample-based sound export warnings | High | Low | Phase 1 |
| ScriptProcessorNode → AudioWorklet migration | High | High | Phase 3 |
| Visualizers implementation | Medium | High | Phase 3 |
| Code location tracking for highlighting | Medium | Medium | Phase 2 |
| Engine memory leak (AudioContext cleanup) | Medium | Low | Phase 1B |
| Unit tests for engine | Medium | Medium | Phase 2 |
| React 19 Monaco type safety | Low | Low | Phase 2 |
| Browser compatibility testing | Medium | Medium | Phase 2 |
| Error boundaries and crash recovery | Low | Low | Phase 2 |

---

*Concerns audit: 2026-03-21*
