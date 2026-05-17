# Krama Catalogue — struCode

> Project-specific lifecycle and timing patterns. Load at session start.
> **Maintenance:** At every 10th entry, review and prune.

## Universal Krama Patterns

### UK1: Constructor → Async Setup → Ready
**Lifecycle:**
1. `new Framework(config, container)` — SYNC — creates instance, schedules setup
2. `setup()` — ASYNC (rAF/microtask) — creates internal state, DOM
3. Instance ready for method calls

**Common violation:** Calling methods between 1 and 2.

### UK2: Framework Init → Method Registration → User Code
**Lifecycle:**
1. Framework loads — SYNC
2. `initialize()` — SYNC during evaluate — registers methods on prototypes
3. User code executes

**Common violation:** Installing interceptors before step 2.

### UK3: Pipeline Transform → Execute Handler
**Lifecycle:**
1. User writes `obj.method("value")`
2. Pipeline rewrites call — may wrap arguments
3. Handler receives transformed arguments

**Common violation:** Handler assumes original argument type.

### UK4: Install → Execute → Capture → Restore
**Lifecycle:**
1. Install interceptors — SYNC
2. Execute scoped operation — may be ASYNC
3. Interceptors fire during step 2
4. Restore original state — SYNC in finally block

**Common violation:** Not restoring in `finally` block.

### UK5: Cleanup Old → Create New (Re-entry)
**Lifecycle:**
1. Trigger event fires
2. Cleanup previous state — SYNC — must complete before 3
3. Execute new operation — ASYNC
4. Create new state from results

**Common violation:** Creating new state without cleanup. Or cleaning up state that should persist (destroy vs pause).

## Project-Specific Krama Patterns

### PK1: StrudelEngine.evaluate() Full Lifecycle
**Lifecycle:**
1. Install `.p` setter trap on Pattern.prototype — SYNC
2. `repl.evaluate(code)` — ASYNC — triggers steps 3-5 internally
3. `injectPatternMethods()` fires — SYNC during evaluate — reassigns Pattern.prototype.p (triggers our setter)
4. Our setter fires — installs `.viz()` wrapper + `.p()` wrapper + legacy method wrappers — SYNC
5. User code executes — calls `.viz("name")` → `.p("$")` — our wrappers capture patterns + viz requests
6. evaluate completes — build trackSchedulers + vizRequests from captured data — SYNC
7. Restore all prototype state — SYNC in finally block

**Common violation:** Installing `.viz()` before step 3 (gets overwritten). Installing `.viz()` after step 5 (too late, user code already ran).
**Correct placement:** Inside the `.p` setter (step 4) — after framework init, before user code.

### PK2: p5 VizRenderer Mount Lifecycle
**Lifecycle:**
1. `new p5(wrappedSketch, container)` — SYNC — creates instance, schedules setup
2. `wrappedSketch.setup()` fires — ASYNC (rAF) — calls `createCanvas()` then our `resizeCanvas(container.clientWidth, container.clientHeight)`
3. `draw()` loop begins — every frame
4. ResizeObserver fires on container resize — calls `renderer.resize(w, h)` only when dimensions actually change (>1px delta)

**Common violation:** Calling `resizeCanvas()` between step 1 and 2 (no-op). Calling `resizeCanvas()` on every ResizeObserver event (clears spectrum waterfall).

### PK3: Inline View Zone Lifecycle
**Lifecycle:**
1. `handlePlay()` fires — user presses play or live mode triggers
2. `viewZoneCleanupRef.current?.cleanup()` — destroys old zones — SYNC
3. `engine.evaluate(code)` — ASYNC — captures patterns + viz requests
4. `addInlineViewZones(editor, ...)` — SYNC — creates zones only for tracks in vizRequests
5. `viewZoneCleanupRef.current?.resume()` — resumes paused zones — SYNC
6. On stop: `viewZoneCleanupRef.current?.pause()` — freezes zones (visible but static)
7. On next play: return to step 1

**Common violation:** Calling `cleanup()` on stop instead of `pause()` (destroys zones when they should freeze). Not calling `cleanup()` before step 4 (orphaned zones accumulate).

### PK4: .viz() Capture Chain
**Lifecycle:**
1. User writes: `$: note("c4").s("sine").viz("pianoroll")`
2. Transpiler rewrites: `note("c4").s("sine").viz(reify("pianoroll")).p('$')`
3. `.s("sine")` returns NEW Pattern B (not original A)
4. `.viz(reifiedArg)` — our wrapper extracts string from Pattern via `queryArc(0,1)[0].value`, sets `result._pendingViz = "pianoroll"`, returns result of Strudel's `.viz()` (Pattern C)
5. `.p('$')` — our wrapper reads `this._pendingViz` on Pattern C, stores in `capturedVizRequests`, calls Strudel's `.p()`

**Common violation:** Setting `_pendingViz` on `this` instead of return value (step 4). Checking `typeof arg === 'string'` when transpiler sends a Pattern (step 2).

### PK5: Viz Code Hot-Reload Lifecycle
**Lifecycle:**
1. User edits a viz code tab in `VizEditor` — Monaco fires `onChange(value)`
2. `handleCodeChange(groupId, tabId, value)` updates the tab's preset, marks dirty, calls `triggerHotReload(groupId, updatedPreset)`
3. `triggerHotReload` — clears any pending debounce timer for this group, sets a new 300ms `setTimeout`
4. Timer fires — calls `compilePreset(preset)` → wraps user code in `new Function()` (or `HydraVizRenderer(patternFn)` for hydra)
5. On compile success — `setPreviewDescriptors(prev => Map.set(groupId, descriptor))` triggers React re-render
6. The preview pane's React `key` prop includes the descriptor id — React unmounts the old `VizPanel`, mounts a new one
7. New `VizPanel` calls `useVizRenderer` which calls `mountVizRenderer` — new renderer instance, new canvas, new `mount()` call with current audio components
8. Old renderer's `destroy()` runs in the prior `useEffect` cleanup — releases hydra/p5 instance, removes canvas

**Common violation:** Recompiling without destroying the old renderer (canvas leaks, hydra contexts leak, RAFs accumulate). Reusing the renderer instance instead of creating a new one (state from old code persists). Not debouncing — compile fires on every keystroke and locks up the main thread.

**Krama dependency:** Step 7 (mount new renderer) MUST be preceded by step 8 (destroy old). React's `key`-based unmount/mount enforces this ordering when the key includes the descriptor id. If you forget the key (or use a stable key), React tries to update the component in place and the renderer reuses its old internal state.

### PK6: Standalone Component Theme Application
**Lifecycle:**
1. Component mounts — `containerRef.current` is null until after first render
2. First render commits — `containerRef.current` is now the DOM element
3. `useEffect(() => applyTheme(containerRef.current, theme), [theme])` fires
4. `applyTheme` iterates DARK_THEME_TOKENS / LIGHT_THEME_TOKENS, calls `el.style.setProperty('--background', '#090912')` etc.
5. CSS variables are now set on the element
6. Children re-render and `var(--background)` resolves to the set value
7. On `theme` prop change — effect re-runs, new tokens overwrite old

**Common violation:** Calling `applyTheme()` synchronously during render (ref is null). Forgetting the effect entirely (CSS variables never set, fallback colors used). Setting tokens on a parent element that the component doesn't actually mount inside (variables don't propagate through React composition, only through the DOM tree).

### PK7: Viz Chrome Three-State Button Lifecycle (closed → running → paused → running)
**Lifecycle:**
1. `renderTabContent` (editor tab case) computes `existingPreview = findTabByFileId(fileId, 'preview')` → sets `previewOpen = existingPreview !== null`
2. Same code path computes `previewPaused = pausedPreviews.has(fileId)`
3. Chrome's `handlePrimaryButtonClick` derives the three-state button from these two flags: `closed` (!previewOpen) | `paused` (previewOpen && previewPaused) | `running` (previewOpen && !previewPaused)
4. **Closed click** → calls `onOpenPreview(selectedSource)`. Shell handler opens a preview tab (or no-ops if one exists). Lazy-starts a built-in example source if the dropdown selection points to one.
5. **Running click** → calls `onTogglePausePreview()`. Shell handler flips the file id in `pausedPreviews` via `setPausedPreviews`. React re-renders. Chrome recomputes `previewPaused = true` and renders "▶ Play".
6. PreviewView re-renders with `paused={pausedPreviews.has(tab.fileId)}`. Provider's ctx gets `paused: true`. CompiledVizMount's `useEffect([paused, hidden])` fires and calls `renderer.pause()` (p5.noLoop / hydra halt).
7. **Paused click** → same path, flipping back. `renderer.resume()` called.
8. Preview tab's × button is the ONLY path that tears down the preview. Clearing `pausedPreviews` on tab close ensures a re-opened preview starts un-paused.

**Common violation:**
- Missing `pausedPreviews` from `renderTabContent`'s useCallback deps → second-click toggle uses stale closure (P8 recurrence).
- Computing the button state in the chrome from stale closed-over props (chrome must derive from LATEST `previewOpen`/`previewPaused` every render, not cache in local state).
- Closing the preview tab on Stop click instead of pausing. The preview is a persistent editing surface; Stop freezes, × dismisses.
- Not clearing `pausedPreviews[fileId]` in `handleTabClose` for preview tabs → reopening a preview starts frozen with no visible Play button path to un-freeze.

### PK9: HydraVizRenderer Mount + Loop-Ownership Lifecycle
**Lifecycle:**
1. `new HydraVizRenderer(pattern?)` — SYNC — creates instance, no hydra yet
2. `mount(container, components, size, onError)` — SYNC
   - Resolves audio source priority: analyser FIRST, hapStream envelope as fallback (PV13 / P21)
   - Allocates `freqData` if analyser path; subscribes envelope handler if envelope path
   - Creates `<canvas>`, appends to container
   - Calls `initHydra(size).catch(onError)` — schedules ASYNC chain
3. `initHydra` — ASYNC
   - Awaits `import('hydra-synth')` (dynamic import)
   - Guards: `if (!this.canvas || this.destroyed) return` — bails if mount was torn down before hydra loaded (StrictMode dev double-mount safety)
   - Constructs `new Hydra({ canvas, autoLoop: false, ... })` — `autoLoop: false` is load-bearing per PV13
   - Bridges `synth.a = this.hydra.a` so user patterns can use `s.a.fft[]`
   - Runs the user pattern (or `defaultPattern`)
   - Schedules first rAF: `this.rafId = requestAnimationFrame(this.pumpAudio)` — does NOT call pumpAudio synchronously (so pause is observable from frame 1)
4. `pumpAudio(now)` — rAF callback, runs every frame while not paused
   - Guard: bails + sets `rafId = null` if `paused` or `destroyed`
   - Polls FFT into `s.a.fft[]` (analyser path or envelope path per PV13)
   - Calls `this.hydra.tick(now ?? performance.now())` — single source of ticks
   - Schedules next: `this.rafId = requestAnimationFrame(this.pumpAudio)`
5. `pause()` — SYNC — sets `paused=true`, `cancelAnimationFrame(rafId)`, `rafId=null`
6. `resume()` — SYNC — clears `paused`, re-arms rAF if `rafId==null && !destroyed`
7. `destroy()` — SYNC — sets `destroyed=true`, cancels rAF, unsubscribes hapStream, removes canvas, nulls all refs

**Common violation:**
- Setting a `paused` flag without cancelling the rAF (P19) — pumpAudio keeps polling and ticking forever
- Constructing hydra with `autoLoop: true` (P19) — hydra owns its own rAF that we can't reach
- Calling `pumpAudio` synchronously inside `initHydra` instead of scheduling via rAF — first frame happens before any pause check, racing pause-from-frame-zero
- Not setting `destroyed` flag — async `initHydra` resumes after teardown and creates an orphan instance
- Picking the silent envelope path over a working analyser (P21) — see PV13's audio-source resolution rule

**Krama dependency:** Step 3 (initHydra) MUST check `destroyed` before constructing hydra, or a destroy that races against the dynamic import creates an orphan. Step 4 (pumpAudio) MUST guard on `paused`/`destroyed` at the top, in case the browser fires a callback that was queued before cancelAnimationFrame ran. Step 5 (pause) MUST cancel the rAF synchronously — race-safe pause requires both the cancel AND the guard.

### PK8: OfflineAudioContext Loop Rendering Lifecycle
**Lifecycle:**
1. User clicks Preview on a viz tab with a built-in example source (drum / chord) selected
2. Chrome handler fires `builtin.startIfIdle()` which calls the source's `start()` (async)
3. `start()` creates a new `AudioContext` (real, user gesture required)
4. `start()` calls `renderLoopBuffer()` which instantiates an `OfflineAudioContext(channels, sampleRate * duration, sampleRate)`
5. Synthesis runs: oscillators/noise sources scheduled with `start(t)` / `stop(t)`, gain envelopes via `setValueAtTime` + `linearRampToValueAtTime` / `exponentialRampToValueAtTime`, filters + connections — all drawn into the offline graph
6. `await offline.startRendering()` returns an `AudioBuffer` with the full pre-rendered loop (~30–80ms for a 2s bar on desktop hardware)
7. Real graph built: `AudioBufferSourceNode.buffer = renderedBuffer`, `source.loop = true`, connect through `GainNode → AnalyserNode → destination`
8. `source.start()` — the loop begins playing in the real context
9. Payload published to `workspaceAudioBus` with `{ analyser, scheduler, hapStream }`. Analyser now reflects the live FFT of the looping buffer.
10. `notifyPlaybackStarted(sourceId)` — playback coordinator stops any other active source.
11. On stop: `source.stop()`, disconnect, unpublish, `notifyPlaybackStopped(sourceId)`, close `AudioContext`.

**Common violation:**
- Calling `start()` outside a user gesture → `new AudioContext()` throws under autoplay policy.
- Not gating parallel starts during the async render window with a `starting` flag → double-click on Preview spawns two renders, two loops, two bus publishes.
- Rebuilding the buffer on every start (cheap but wasteful) vs. caching in the module. Current impl re-renders on each start; caching is a follow-up optimization.
- Scheduler `query()` and the synthesized audio pattern drift apart when someone edits one without updating the other. The invariant "scheduler events align with audio hits" is maintained by construction (same beat offsets in both) but must be preserved by any future edits.

### PK9: IR Inspector snapshot lifecycle
**Lifecycle:**
1. User edits Strudel code in the workspace file (Y.Doc-backed).
2. User triggers eval (Cmd+Enter or auto-eval from live mode).
3. `LiveCodingRuntime.evaluate(content)` runs Strudel's transpile + scheduler-update.
4. On success Strudel fires `runtime.onEvaluateSuccess` callback (StrudelEditorClient.tsx).
5. The handler:
   - clears any error state for the file
   - calls `emitFixed({ runtime, source: fileId })` so the Console panel's Live mode can hide stale errors
   - **only when runtimeId === 'strudel' and fileNow exists**: parses + collects + publishes IRSnapshot
6. `parseStrudel(fileNow.content)` — pure function over the source string. Tracks char offsets so Play nodes carry `loc`.
7. `collect(ir)` — pure walk that produces `IREvent[]` for one cycle window. Propagates Play.loc onto event.loc.
8. `publishIRSnapshot({ ts, source: fileNow.id, runtime: 'strudel', code, ir, events })` — fan-out to all `subscribeIRSnapshot` listeners.
9. IRInspectorPanel React component (subscribed via useEffect) re-renders with the new snapshot.
10. User clicks an event row whose `loc` is set → handler computes line from offset → `revealLineInFile(source, line)` — looks up the editor by `fileId` and moves the cursor.

**Common violation:**
- `IRSnapshot.source` set to `path` instead of `id` (P38) — silent click-to-source failure.
- `parseStrudel` errors thrown synchronously instead of caught + ignored — would block the eval-success path.
- Skipping the `runtimeId === 'strudel'` gate — Sonic Pi etc. fall through to a parser that doesn't understand them, produces opaque Code nodes, wastes work.

**Krama dependency:**
- Step 5's three actions (clear error, emitFixed, IRSnapshot publish) are independent — order doesn't matter, but ALL must run on every successful eval. Skipping the IRSnapshot leaves the Inspector stuck on stale data.
- Steps 6-7 must complete BEFORE step 8 — the snapshot must be fully populated when subscribers fire (subscribers don't re-fetch).
- The `parseStrudel` → `collect` step uses `baseOffset` plumbing (PV25). Any change to the parser pipeline that drops offsets breaks step 10's click-to-source without breaking earlier steps.

**Update (Phase 19-07):** Step 6 + 8 changed shape. The eval-success handler now seeds the pipeline with `IR.code(content)` and runs `STRUDEL_PASSES = [RAW, MINI-EXPANDED, CHAIN-APPLIED, Parsed]` via `runPasses`. Every snapshot publishes 4 passes (`STRUDEL_PASSES.length === 4` from 19-07 onward; `passes[3].ir` is the FINAL output that matches today's `parseStrudel(code)` byte-shape). PV27's alias-drift invariant still holds: `snap.ir === snap.passes[passes.length - 1].ir`. The Inspector renders 4 tabs by data flow alone — UI unchanged.

**Update (Phase 19-08, steps 8a + 8b):** `publishIRSnapshot` fan-out now decomposes into two parallel side-effects, both fired on every successful eval. Order independence (PK9's core invariant) is preserved — neither side-effect depends on the other.
- **Step 8a — timeline capture fan-out.** `captureSnapshot(snap, { ts, cycleCount })` pushes the snapshot REFERENCE into the timelineCapture FIFO ring buffer (default capacity 30). The buffer holds references, not copies; UI consumers (`IRInspectorTimeline`) hold a captured reference in React state so FIFO eviction never invalidates a pin (D-07 / RESEARCH §7 trap #5).
- **Step 8b — listener fan-out.** Single-slot consumers (the IR Inspector panel's live subscribe) re-render with the new snapshot.

In the current implementation (`packages/editor/src/engine/irInspector.ts:55-64`) 8a runs before 8b textually, but ordering is incidental — either order satisfies the invariant. Future publishers may add additional side-effects at this step so long as none of them depend on read-after-write of the others.

**Update (Phase 19-08, step 2 sub-step):** `Cmd+Enter` is bound to a play/stop **toggle** in `StrudelEditorClient.tsx`:504-506. Pressing it on a playing runtime calls `stop()` — which does NOT fire `onEvaluateSuccess` and does NOT publish an IRSnapshot. To force a re-evaluate during testing or programmatic use, the call sequence must be `stop()` → `play()` (or the keyboard equivalent `Cmd+./Cmd+Enter`). Two consecutive `Cmd+Enter` presses yield exactly ONE capture, not two. Codified in `ir-inspector-timeline.spec.ts` as the `reEvalStrudel(page)` helper.


### PK10: @stave/editor barrel re-export propagation
**Lifecycle:**
1. Author adds a new export to a sub-barrel (e.g., `packages/editor/src/ir/index.ts` re-exports `runPasses` from `./passes`).
2. Author runs `pnpm --filter @stave/editor build` — tsup compiles dist.
3. Consumer in `@stave/app` imports the symbol — TS errors out. Author re-checks src files; types are correct.
4. Author greps `dist/index.cjs` / `dist/index.d.ts` — symbol is missing.
5. Root cause: `packages/editor/src/index.ts` is **hand-curated**, not a wildcard re-export. Sub-barrels do NOT auto-propagate.
6. Fix: add the symbol to the top-level `src/index.ts` explicitly. Rebuild dist. Confirm by re-grep.

**Common violation:**
- Adding a sub-barrel re-export without also adding to the top-level barrel — the dist ships without the symbol, app-side `@stave/editor` import fails to resolve.
- Author "rebuilds harder" (clean install, delete dist, etc.) instead of reading the top-level `index.ts`.

**Krama dependency:**
- The hand-curated barrel is intentional — controls the public surface of `@stave/editor`. Wildcards would leak internal symbols.
- Build (tsup) only follows what the top-level index exports. Sub-barrels are private unless re-exported from the top.
- Task list for any new public symbol: (a) export from sub-barrel for editor-internal use, (b) export from top-level barrel for app consumption, (c) rebuild dist, (d) verify by `grep <symbol> packages/editor/dist/index.cjs`.

**Confirmed by:** Phase 19-02 Task 3 — `runPasses` was missing from dist after first build because it was added to `ir/index.ts` only. Fixed by also adding to `src/index.ts`.


### PK11: Forced-tag introduction sequence in PatternIR
**Lifecycle:**
1. Add the tag to `PatternIR.ts` union + smart constructor on the `IR` object.
2. Add the `case '<Tag>':` arm to `collect.ts` (event production semantics + `loc` propagation).
3. Add the `case '<Tag>':` arm to `toStrudel.ts` (round-trip emit — for new tags this is the user-typed method name; for desugars structural emit is acceptable).
4. Add shape unit tests in `__tests__/PatternIR.test.ts` (or `integration.test.ts`): construction, default values, `loc` propagation through collect, semantic-correctness on a small probe.
5. Add `case '<methodName>':` to `parseStrudel.ts` `applyMethod` switch (parser dispatch).
6. Add a parity `it()` block to `__tests__/parity.test.ts` that compares `parseStrudel(code) → collect` vs `evaluate(code).queryArc()` on the dimensions the tag claims to model.

**Common violation:**
- Skipping step 6 (parity) — the tag's collect arm claim goes unverified. Symmetric-only tests miss direction inversions (P42); spec-only verification misses spec-vs-implementation gaps (P43).
- Bundling steps 1-3 with step 5 in a single commit — when the parser starts producing the tag and collect goes wrong, the bug surfaces conflated with the parser change. Atomic per-step commits make bisection trivial.
- Adding the tag to `PatternIR.ts` only and not propagating to barrels. For new properties on the existing `IR` smart-ctor object, propagation is automatic (the object is already exported). For new top-level exports (helpers, types), PK10 applies — both `src/ir/index.ts` and `src/index.ts` must export.

**Krama dependency:**
- Step 1 (union + smart ctor) MUST land before step 2 (collect) — TypeScript will error otherwise.
- Step 2 (collect) MUST land before step 6 (parity) — parity calls collect.
- Steps 3 (toStrudel) and 4 (shape tests) are commutable with each other but must precede step 6.
- Step 5 (parser wire) can land before or after step 6; if before, the parity test's input string can be the user-typed method (cleaner). Plan PK11 calls for: tag-end-to-end (steps 1-4) commits FIRST, then parser wire + parity (steps 5-6) commit SECOND. This gives two atomic commits per forced tag.

**Confirmed by:** Phase 19-03 — Late, Degrade, Chunk, Ply each followed this sequence. Late shipped as 2 commits (tag end-to-end + parser+parity). Degrade and Chunk bundled their tag commits together (shared collect surface area), then each had its own parser commit. Ply shipped as 1 commit (tag + parser + parity together because all wiring was small after 3 prior tags established the pattern). All four ship without parity regressions.

---

## PK12 — `loc.start` convention for chained-method tags includes the leading `.`

**ORIGIN:** Phase 19-05 W3/W7 — every chained-method tag's `loc.start`
landed at the leading `.`, not at the method name. This was not an
accident: `applyChain` walks `remaining` starting at the dot, computes
`consumed = remaining.length - rest.length` BEFORE calling `applyMethod`,
and passes `callSiteRange = [remainingOffset, remainingOffset + consumed]`
to `tagMeta`. The full token captured is `.method(args)` end-to-end.
First observed in W3 when populating the per-method case bodies; locked
in W7 by D-11 containment tests on a 3-method chain
(`s("bd").fast(2).late(0.125).gain(0.5)`) where each tag's loc must
contain its full `.method(args)` substring.

**WHY:** Without this convention, future Inspector / bidirectional
consumers might assume `loc.start` lands at the method name (a natural
assumption — "the method's location is where its name is written").
That assumption would mis-render click-to-source: the user clicks
`.fast(2)` expecting to land at the dot or method name, but the IR's
`loc.start` actually points one character earlier (the dot is included).
Worse, a consumer that highlights the loc range would highlight from
the dot, which differs from how IDE-style "go to method definition"
tools usually work. Documenting the convention prevents the next
consumer from re-discovering it through a mismatched highlight bug.

**HOW:** Three load-bearing pieces:

1. **`applyChain` advances after the call.** The walker's `remainingOffset`
   points at the leading `.` of the current method during the iteration;
   it advances to the next `.` (or end of chain) AFTER `applyMethod`
   returns. This is the source of dot-inclusion.

2. **`tagMeta(method, callSiteRange)` builds the `loc` array.**
   `callSiteRange[0]` IS `remainingOffset` (the dot position).
   `callSiteRange[1]` is `remainingOffset + consumed` where `consumed`
   = the substring length applyMethod is about to handle. Returns
   `{ loc: [{ start, end }], userMethod: method }`.

3. **`argsAbsoluteOffset` is a separate axis.** PRE-01 established
   `argsAbsoluteOffset = remainingOffset + argsOffset` where `argsOffset`
   points at `args[0]` (first character INSIDE the parens). For a
   chain `.fast(2).late(0.125)`, the `.late` iteration has
   `argsAbsoluteOffset` pointing at `0` of `0.125` while
   `callSiteRange[0]` points at the `.` of `.late`. Conflating the
   two would drift the tag-loc range by `methodName.length + 1` (the
   `.method(` prefix). The 3-method chain test is the offset catcher.

**Common violation:** Using `argsAbsoluteOffset` as a substitute for
`callSiteRange.start`. They differ by `methodName.length + 1`. A test
on `s("bd").fast(2)` would pass either way (loc.start at 7 or 13 both
land "near" the method); a test on a longer method
(`.degradeBy(0.5)` — 9 chars) would expose the drift immediately.

**Krama dependency:**
- The `applyChain` walker MUST advance `remainingOffset` AFTER
  `applyMethod` returns, never before. Pre-emptive advance would lose
  the dot position.
- `tagMeta` MUST be called with `callSiteRange` from
  `applyChain`, never reconstructed from `argsAbsoluteOffset`.
- D-11 containment tests on chains of length ≥ 2 are the only reliable
  catcher; single-method probes silently pass either convention.

**Confirmed by:** Phase 19-05 W3 (29 single-tag case-body populations);
W4 (3 desugar branches); W7 (per-method containment tests on 17 multi-arg
methods + 3-method-chain offset catcher). PK11 sequence step 5 (parser
wire) for forced tags must follow this convention going forward — every
new `case` in `applyMethod` either calls `tagMeta(method, callSiteRange)`
or builds the literal-construction with the same `[start, end]` shape.

## PK13 — Source-level debugger projection lifecycle (parse → loc → collect → publish → run → match → render → break)

**Domain:** end-to-end pipeline that turns a typed `.strudel` source
into an inspectable, breakpointable program-execution surface. The
contract that makes "click-to-source" / "highlight-on-play" / "set
breakpoint" a single coherent feature rather than three independently
broken ones.

**Sequence (every step is mandatory; skipping any one creates a dark
region the debugger cannot point at):**

1. **Parse.** `parseStrudel(code)` produces an IR tree. Every leaf
   `Play` carries `loc` (parseStrudel.ts:175-188). Every transform
   tag carries `loc` via `tagMeta(method, callSiteRange)` (PK12).
   **Krama violation:** an `applyMethod` arm that constructs a node
   without `tagMeta` (or equivalent literal-construction) — the node
   joins the tree loc-less. Downstream click-to-source on this node's
   range fails.

2. **Wrap unknowns.** `applyMethod`'s `default:` arm wraps unrecognised
   chain methods as `Code`-with-loc (PV37). The wrapper carries the
   `.method(args)` call-site range and a back-pointer to the inner IR.
   **Krama violation:** `return ir` in the default arm — the typed
   source disappears. Future steps cannot recover it.

3. **Loc-tag every produced event.** `collect(ir)` walks the tree;
   every collect arm that produces an `IREvent` MUST attach `loc` to
   the event (PV36). For `Play`, this is `event.loc = ir.loc`
   (collect.ts:247). For events produced by `Stack` / `Seq` / `Every`
   / `Late` / `Fast` / etc., the produced events inherit the parent's
   `loc` AND/OR the originating leaf's `loc`.
   **Krama violation:** a collect arm that returns events without
   `loc` — those events are runtime-visible but source-invisible.

4. **Assign IR-node identity.** Each `IREvent` gets a stable
   `irNodeId` (PV38) — derived at collect time from the IR node it
   came from + position-in-output. The IRSnapshot exposes a lookup
   `id → IREvent`.
   **Krama violation:** identity assigned post-publish (e.g. by the
   inspector) — the channel is no longer authoritative; runtime
   matching becomes lossy.

5. **Publish.** `publishIRSnapshot({ events, ir, code, source, … })`
   exposes the snapshot to consumers (StrudelEditorClient.tsx:357).
   The snapshot is immutable post-push (PV33) — the lookup table
   never drifts.

6. **Run.** `StrudelEngine` evaluates the user's code through Strudel's
   `repl`; per-track `PatternScheduler`s emit haps via `queryArc()`
   (StrudelEngine.ts:362-373). `normalizeStrudelHap(hap, trackId)`
   produces a `NormalizedHap`.

7. **Match.** Each `NormalizedHap` is enriched with `irNodeId` by
   structural lookup against the published snapshot (matching by
   `hap.value.context.locations` + `hap.whole.begin`). When no match
   is found, the hap is tagged `irNodeId: null` and rendered as
   "runtime-only" — same opaque-but-visible treatment PV37 gives
   parser-unmodelled regions.
   **Krama violation:** matching on `time` alone (drifts under
   `fast`/`slow`); matching on `value` alone (collisions on repeated
   notes). Must use `loc + position-in-arc` together.

8. **Render.** The Inspector / MusicalTimeline / Monaco click-to-source
   resolve `irNodeId → IREvent → loc → source range` and render. The
   chain history walks from leaf back to root, stamping every
   transform's `loc` along the way (the "stack frames" view).
   **Krama violation:** rendering directly from `evt.loc` without
   going through `irNodeId` — the projection becomes lossy when
   multiple events share a loc range (e.g. all 8 hits of `s("hh*8")`).

9. **Break (when scheduler-breakpoint phase lands).** Before triggering
   each hap, the scheduler evaluates registered breakpoint conditions
   (matching on `irNodeId` or on `loc` ranges). On match, the
   scheduler clock pauses; the inspector renders the chain history
   at this hap; the user resumes.
   **Krama violation:** breakpoint matching after audio dispatch — the
   user hears the note before the break fires, defeating the purpose.

**Invariants threaded through this krama:**

- **PV24 / PV36:** every IR node + every event carries `loc`.
- **PV37:** unrecognised methods wrap, never drop.
- **PV38:** every observable hap maps to an `irNodeId`.
- **PV33:** snapshots are immutable after publish — the identity
  channel is stable for the snapshot's lifetime.
- **PV35:** the rendered surface honours the audience (musician for
  timeline / piano roll; developer for IR Inspector chain view; both
  consume the same identity channel).

**Why this krama matters:** The debugger is not a single feature; it
is the cumulative product of every step holding. Step 3 (loc-tag) is
load-bearing for click-to-source; step 4 (identity) for breakpoints;
step 7 (match) for live highlighting. A working click-to-source with
no loc-completeness is a brittle special case that breaks on the
first uncovered IR shape. A breakpoint mechanism without identity is
indistinguishable from "stop at time t." The whole krama is the
contract; partial implementations are not partial debuggers — they
are debuggers that lie in proportion to the gaps.

**Confirmed by:** 2026-05-07 architecture conversation. The DWARF /
sourcemap analog is the same krama: parse → tag-with-loc → emit →
identity → match → render → break. Production debuggers (gdb, Chrome
DevTools, MSVC) all enforce every step. None ship with steps missing
because the resulting tool would not be called a debugger.

**REF:** parseStrudel.ts:175-188 (step 1); parseStrudel.ts:729-731
(step 2 — site of the silent-drop bug, see P33); collect.ts:247
(step 3); engine/irInspector.ts:51 (step 5); StrudelEngine.ts:362-373
(step 6); engine/NormalizedHap.ts (step 7 — where irNodeId enrichment
lands); MusicalTimeline.tsx (step 8); engine/timelineCapture.ts (step
9 reverse-step / scrub already buffers snapshots).

**STATUS (2026-05-08):** **All 9 steps LANDED.** Debugger v2 substrate is complete in main as of `dc00749`.

- **Steps 1-3** (debugger v1 — main `aded68f`):
  - Step 1 (parse with loc on every IR node) — preserved by parser; validated via PV36 clause 1 + W7 outermost-loc audit (PR #95).
  - Step 2 (wrap unknowns) — landed by PV37 wrapper construction (PR #96); silent-drop bug at parseStrudel.ts:729 ELIMINATED (P33 closed).
  - Step 3 (loc-tag every produced event) — landed by `withWrapperLoc` helper threaded through 20+ collect arms (PR #95).
- **Step 4** (debugger v2 — PR #102): assign IR-node identity. `assignNodeId(ir, position)` in collect.ts:160 (FNV-1a content-hash; leaf-only assignment per DEC-NEW-1 — wrapper arms preserve via `{...e, ...}` spread). PV38 clause 1 enforced.
- **Step 5** (publish): `publishIRSnapshot` extended with `IRSnapshotInput = Omit<IRSnapshot, 'irNodeIdLookup' \| 'irNodeLocLookup' \| 'irNodeIdsByLine'>` (PR #102 + PR #104 wave α0). Three `ReadonlyMap` lookups built in `enrichWithLookups`; PV33 immutability enforced at the type level.
- **Step 6** (run): unchanged — Strudel's repl drives `wrappedOutput` per `StrudelEngine.ts:195-211`.
- **Step 7** (match): two boundaries close.
  - queryArc boundary — `normalizeStrudelHap` consumes `findMatchedEvent(loc, begin, lookup)` (PR #102 wave γ).
  - onTrigger boundary — `HapStream.emit` enriches the fired hap with `irNodeId` via the same `findMatchedEvent` (PR #103 wave α). Single-strategy match per P50; no fallback ladder.
- **Step 8** (render): both surfaces consume the identity channel.
  - musician timeline — `MusicalTimeline.activeKeys` rewritten from cycle-derived to hap-driven; HapStream subscription drives the glow (PR #103).
  - developer Inspector — `IRInspectorPanel` chain rows pulse on hap fire and render breakpoint markers when registered (PR #104 wave γ). `data-irinspector-pulsed` + `data-breakpoint-active` attributes.
- **Step 9** (break): scheduler-level breakpoints land via `BreakpointStore` (per-engine, keyed by content-addressed irNodeId) + hit-check at `wrappedOutput` AFTER the pulse emit and BEFORE `await webaudioOutput` (PR #104 wave α + δ). DEC-AMENDED-1: pause via `repl.scheduler.pause()` — NOT `stop()` (Strudel `cyclist.mjs:112-116` preserves cycle position for true inspect-and-resume; `stop()` rewinds to cycle 0). Resume reachable via Inspector header button + Monaco "Debugger: Resume" command (R-1; Cmd-Shift-P even when Inspector collapsed).

**Behavioural guarantee post-v2:** the DWARF / Chrome-DevTools analog for live coding is in main. Click-to-source resolves anywhere; live highlighting glows the actually-firing event; gutter-click or chain-row-click sets a breakpoint that pauses the scheduler at the correct cycle and survives unrelated edits (irNodeId is content-addressed). The remaining v2 surface — cheap scrub UI (drag the playhead with cycle-derived glow at scrub position) — is split to phase 20-08 per user scope decision; audio-coordinated scrub explicitly deferred indefinitely.

**Phase 20-10 (2026-05-09) — step 2 strengthened for whitelisted param methods.**
For the 10 methods `s/n/note/gain/velocity/color/pan/speed/bank/scale`,
`applyMethod` constructs a typed `Param` IR tag (semantics-honest)
BEFORE the `default:` arm's `wrapAsOpaque` runs. Methods outside the
whitelist still fall through `default:` to `wrapAsOpaque` (PV37 —
representation-honest, semantics-deferred). Both paths converge at
collect: `case 'Param':` merges value into ctx.params and spreads into
the body event's top-level fields (s/gain/velocity/color); `case
'Code':` walks `via.inner` with no semantic effect. The whitelist is
expandable — same `applyMethod` arm shape; same `Param` tag. PK13's
step 2 narrative is unchanged ("Wrap unknowns"); the strengthening adds
a typed-arm short-circuit ABOVE the wrap fallback for the 10 named
methods. PV37 unchanged; PV39 added as the semantics-completeness
sibling. Cross-ref: hetvabhasa P52 (silent-semantics-after-PV37 trap
class).

**Phase 20-11 (2026-05-09) — step 2 (parser → IR) + step 7 (collect → events) — track-identity layer.** Step 2 strengthens further: parseStrudel main path now wraps every `$:` track with `Track('d{N}', expr, {loc: $:-line range})` (auto-numbered per Tidal convention) and synthetic `Track('d1', expr)` (no loc, no userMethod) for non-`$:` files. Multi-`$:` produces an outer `Stack` of Tracks. The `case 'p':` arm (previously a 20-04 Chesterton pass-through) now wraps with `Track(name, body, {userMethod: 'p', loc: callSiteRange})` for explicit user-typed track names; non-string args fall back to the PV37 `wrapAsOpaque` path. Step 7 strengthens: collect's `case 'Track'` arm spreads `{...ctx, trackId: ir.trackId}` (outer-then-inner walk; inner explicit `.p()` wins over outer synthetic `d{N}` per CONTEXT pre-mortem #1); `makeEvent` populates `evt.trackId` via conditional spread (omitted when undefined to preserve the pre-20-11 fallback path for hand-built fixtures). Downstream consumers (`groupEventsByTrack`, `MusicalTimeline`) read `evt.trackId` first; inference from `evt.s` becomes pure fallback. PK13's step 2 narrative grows the "wrap" set: PV37 wraps unknowns, PV39 wraps param-bearing methods, PV40 wraps `$:` blocks and `.p()`. All three are the same shape (typed wrapper + loc + back-pointer). Cross-ref: vyapti PV40 (track-identity-parser-assigned); hetvabhasa P53 (groupEventsByTrack-evt.s-fallback trap class).

---

## PK14 — Stacked-PR merge resolution: `dist/*` conflicts are build artifacts, not real divergence

**Claim:** When a downstream branch (B based on A) needs to merge `origin/main` after A landed, `git merge` will report conflicts in `packages/editor/dist/*`. These are build-artifact conflicts (minified output diverges between branches even when source is identical). Source files auto-merge cleanly. Canonical resolution:

```bash
# After `git merge --no-commit --no-ff origin/main` reports dist conflicts:
git checkout --ours packages/editor/dist/
pnpm --filter @stave/editor build
git add packages/editor/dist/
# Source files were auto-merged; verify they look right:
git diff --staged packages/editor/src/   # should be empty if A's source landed identically
# Run tests on the merged state BEFORE committing:
pnpm --filter @stave/editor exec vitest run
# Commit the merge with the default message:
git commit --no-edit
```

**Why this sequence works:**
1. `--ours` takes our (B's) dist as the merge base for the conflicted files.
2. The rebuild regenerates dist from merged source (which is now A's source + B's source); the regenerated dist is consistent with the merged source state, not stale.
3. `git add packages/editor/dist/` stages the rebuilt artifacts.
4. Tests verify the merge didn't break source-level behavior.

**Counter-pattern.** Trying to manually resolve the dist conflicts (editing the merge markers in minified JS) is futile — minified output isn't human-merge-friendly. Trying to `--theirs` is wrong because their dist was built from THEIR pre-merge source, not the merged state. The rebuild is the only correct resolution.

**When this fires.** Anytime a PR queue is opened in dependency order (A → B → C → D) and predecessors merge to main while downstream branches are still local. Each downstream branch will need this resolution when bringing main forward. Phase 20-11 wave-δ saw it 4 times in one session (20-12 vs main after 20-11 merged; followups vs main after 20-12 merged; etc.).

**Step ordering (atomic per merge):**
1. `git checkout <downstream-branch>`
2. `git fetch origin`
3. `git merge --no-commit --no-ff origin/main` — observe conflict report
4. If conflicts are only in `packages/editor/dist/*`: apply the recipe above
5. If conflicts include source files: investigate each — likely a genuine downstream/upstream divergence that needs hand-merge
6. `git push` once tests green

**Cross-ref:**
- AnviDev §2 commits: rebuild after merge is a maintenance step, not a "fix"
- `feedback_viz_bugs.md` editor-`dist/` staleness reminder — same family

---

## PK15 — MusicalTimeline slot-map session lifecycle

**Lifecycle ordering (per-render, in `MusicalTimeline.tsx`):**

1. **File-switch reset** (`snapshot.source !== lastSourceRef.current`):
   `slotMapRef.current = new Map()`, `hasHadEventsRef.current = new Set()`.
   Different workspace file → wipe all session state.

2. **Transport-transition reset** (`prevCycleNullRef.current !== cycleIsNull`):
   Same clear as above. Fires on BOTH edges of play↔stop. Hot-reload mid-play
   is NOT a transition (both prev and curr non-null) → no reset, slots
   preserved (D-04 audition workflow).

3. **Slot derivation** (always seed from IR top-level + event-group slot keys):
   `currentSlotKeys = [...irSlots.map(s => s.slotKey),
                       ...groups.map(groupSlotKey)]`,
   then `stableTrackOrder(slotMapRef.current, currentSlotKeys)`.
   IR top-level walk includes commented `$:` lines (parser emits them as
   empty-body Tracks), so source position is captured in the slot map even
   for silent rows.

4. **Visibility set update**: `for g in groups: hasHadEventsRef.add(groupSlotKey(g))`.
   Tracks WHICH SLOTS have ever produced events this session.

5. **orderedTracks build**: iterate `slotMap.entries()` sorted by slot index,
   filter by membership in `hasHadEventsRef`, map each surviving slot to
   `{trackId: displayLabel, events: groupBySlotKey.get(slotKey)?.events ?? []}`.

**Three behaviours this enforces (the conflict resolution):**
- *Mid-play comment* — slotKey still in `hasHadEvents` from prior eval; row
  renders as ghost in its source-order slot. (D-04 audition.)
- *Stop + play after comment* — stop edge clears `hasHadEvents`; the next
  play's events repopulate the set only for ACTIVE rows. Commented row is
  not in the set → invisible. Slot map still has its slot (from IR-side
  seed), so uncommenting later restores the row IN POSITION, not at the
  bottom.
- *`.p("name")` rename* — outer `$:` Track's `loc.start` (= `dollarPos`) is
  unchanged; events carry the same `dollarPos` → same slotKey → same slot.
  Display label changes via the separate `slotDisplay` map.

**Common violations:**
- Adding state (color, collapsed flag, etc.) keyed by display `trackId`
  instead of `slotKey` → state lost on `.p()` rename. Currently `trackMeta`
  Y.Doc has this issue; see PV47.
- Using `slotMap.size > 0` as a proxy for "mid-session" (the gate-fix bug
  in commit `0e68482`) → fresh seed never gets IR-side slots → uncomment
  appends at end. Use `hasHadEvents` membership for visibility, not
  `slotMap.size` for sessionness.
- Not resetting on BOTH transport edges (stop-only reset, commit `c926042`)
  → edit-while-stopped doesn't take effect on play. Always reset on
  `prevCycleNullRef !== cycleIsNull`.

**REF:** Phase 20-12.1 + follow-up commits on
`fix/20-12.1-pause-resets-slot-map`. PV47 (source-anchored slot identity),
PV45 (Y.Doc render hygiene), P64 (slot retention diagnostic walk).

## PK16 — Strudel engine-init + no-`$:` parse pipeline ordering (Phase 20-14)

Two related execution-order dependencies validated in Phase 20-14.

**(a) Engine init — sound registration before snapshot, aliasBank after manifests.**

```
StrudelEngine.init() ordering (after evalScope + miniAllStrings + transpiler):
1. initAudio()
2. registerSynthSounds() / registerZZFXSounds() / registerSoundfonts()
3. await samples('github:…/Dirt-Samples')        ← existing
4. await Promise.all([ 6 b-cdn sample manifests ]) ← 20-14 α-2
5. await aliasBank(tidal-drum-machines-alias.json) ← 20-14 α-3
6. loadedSoundNames = Object.keys(soundMap.get()) ← snapshot
7. analyser tap + wrappedOutput install
```

**Why the order is load-bearing:** `aliasBank` (step 5) walks the
already-registered `soundMap` suffixes to emit aliased keys. Run it BEFORE
the manifest fetches (step 4) and there are no suffixes to alias → aliases
silently absent, `.bank("RolandTR909")` no-ops. The `loadedSoundNames`
snapshot (step 6) must be AFTER 4+5 or autocomplete misses the new banks.
Verified empirically (α-3 BEFORE/AFTER `soundMap` key-count gate: Δ must
be ≥ 0 — a drop means aliasBank replaced rather than merged the map, which
would be a PLAN-LEVEL stop).

**(b) no-`$:` parse pipeline — prelude-strip is the first stage.**

```
parseStrudel(code), no-$: branch:
1. stripParserPrelude(code) → { body, offset }   ← 20-14 γ (skip comments,
                                                     samples/useRNG/set*)
2. splitRootAndChain(body) → root + chain
3. parseRoot(root, offset)  (bare-string arm, note/n/s, stack, …)
4. applyChain(chain)        (whitespace/comment-tolerant walker — PV49)
```

**Why prelude-strip is stage 1:** every later stage assumes its input
starts at the musical expression. Leave the prelude in and `parseRoot`'s
anchored regexes fail on the leading `// "Title"` / `samples({…})` lines →
whole program → Code-fallback. The offset returned by stage 1 threads
through 3+4 so loc stays valid against the ORIGINAL source. Extends PK15
(μ-α parse cycle) — same shape as μ's pre-parse normalisations, one stage
earlier.

**Phase 20-15 — NEW stage 0.5 + the label branch.**

```
parseStrudel(code), no-$: branch (20-15-updated):
1.   stripParserPrelude(code) → { body, offset }   (set* family now
                                                     {setcps,setCps,setcpm,setCpm}, α-1)
0.5  buildBindingMap(body) → ReadonlyMap<name,IR>?  ← NEW (γ-3, G1/#134)
                                                       AFTER prelude-strip,
                                                       BEFORE splitRootAndChain
2.   splitRootAndChain(body) → root + chain
3.   parseRoot(root, offset, isSampleKey, bindings) (bindings threaded into
                                                     the stack-arg resolver)
4.   applyChain(chain)        (PV49 shared primitive — α-3 reroute)
```

**Why stage 0.5 sits exactly there:** the prelude STILL does not strip
`let`/`const` (pS comment unchanged — bindings are musical, not boot
side-effects), so stage 1 leaves them in `body`. stage 0.5 splits
top-level statements (depth/string-aware, REUSING the lexStateAt walker —
PV49 spirit, no hand-roll), parses each binding RHS at its definition-site
offset (R6), and threads a `ReadonlyMap` into stage 3's stack-arg
resolver. It MUST run before splitRootAndChain or `splitRootAndChain`
reads `let` as the root identifier → whole-program Code-fallback (the
exact #134 BEFORE behaviour). Statement order is load-bearing: a reference
before its definition → D-02 graceful single Code node (NEVER a throw,
NEVER partial-eval — the matcher-not-interpreter line).

**The G5 label branch (the OTHER branch, NOT PK16(b)):** when
`extractTracks` finds a `name:`/`$:` label (generalized regex + γ-1
depth/string guard, γ-2), the pipeline is
`extractTracks → parseExpression(t.expr, t.offset)` with loc covering the
label line. `label` → `trackId` (D-01); `dollarStart` (LINE-START) →
collect.ts OUTER-WINS → every event's `dollarPos` → MusicalTimeline
`$${pos}` slotKey. Single-pass, synchronous. The extractTracks return
tuple is APPEND-ONLY (`label?` appended; RAW consumer parseStrudelStages
reads by field — verified intact, γ-2).

**Common violation:** adding a new boot-side-effect call (e.g. `setcpm`,
gap #135 — now closed, family {setcps,setCps,setcpm,setCpm}) WITHOUT
adding it to stripParserPrelude's skip set → that whole class of programs
regresses to Code-fallback. R2 anti-drift (20-15): the skip set is
HAND-MAINTAINED (upstream list is not vendored — no programmatic
cross-ref is possible; the #135-misread note: 20-14 α-6's
`settingPatterns` audit covers UI theme/font CHAIN methods, NOT tempo
boot calls — it is NOT this list's source). The real anti-drift is a
code comment citing the upstream file + pinned Codeberg SHA f73b3956
PLUS one CI fixture per added setter (V-3: bakery-G2-setcpm /
-setCpm-camel / -setCps-camel).

**REF:** PK15 (MusicalTimeline slot-map lifecycle — sibling parse-cycle
krama), PV49 (the stage-4 walker invariant), P67 (stage-3 Code
discrimination); `feedback_strudel_init.md` (the evalScope→mini→synths
ordering this extends); `packages/editor/src/ir/parseStrudel.ts`,
`packages/editor/src/engine/StrudelEngine.ts`. Ground Truth:
20-14-{RESEARCH,α-SUMMARY,γ-SUMMARY}.md.
