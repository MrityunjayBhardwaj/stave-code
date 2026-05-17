# Vyāpti Catalogue — struCode

> Project-specific structural regularities (invariants). Load at session start.
> **Maintenance:** At every 10th entry, review and prune.

## Universal Vyāptis

### UV1: Container Ownership
**Statement:** Wherever a visual element is placed inside a container, the container owns the element's available dimensions.
**Causal status:** STRUCTURAL
**Scope:** CSS layout, component trees, Monaco view zones.
**Breaks when:** Child has fixed/absolute positioning; child is off-DOM (clientWidth = 0).
**Implication:** Never hardcode sizes in child components.

### UV2: Framework Prototype Sovereignty
**Statement:** Wherever a framework initializes by writing to prototypes, it will overwrite pre-installed methods.
**Causal status:** CAUSAL
**Scope:** Any framework using `X.prototype.method = fn` during init.
**Implication:** Install interceptors AFTER framework init, or inside its init hook.

### UV3: Pipeline Argument Transformation
**Statement:** Wherever a build pipeline processes method calls, it may transform arguments before the handler receives them.
**Causal status:** CAUSAL
**Scope:** Transpilers, macro systems, middleware pipelines.
**Implication:** Test through the real pipeline. Handle both raw and transformed argument types.

### UV4: Async Construction
**Statement:** Wherever a constructor defers setup to a callback, post-constructor calls may execute before setup completes.
**Causal status:** CAUSAL
**Scope:** Any framework with deferred initialization.
**Implication:** Post-setup operations go inside the setup callback.

### UV5: Method Chain Identity
**Statement:** Wherever a method returns a new instance (not `this`), properties on the pre-call object are absent on the post-call object.
**Causal status:** STRUCTURAL
**Scope:** Immutable/functional APIs, fluent APIs that clone.
**Implication:** Tag the RETURN VALUE, not `this`.

### UV6: Observation Without Mutation
**Statement:** Wherever you modify system state to observe it, you change the behavior you're trying to observe.
**Causal status:** CAUSAL
**Scope:** Audio routing, message queues, network streams.
**Implication:** Design observation as passive side-taps, not re-routing.

## Project-Specific Vyāptis

### PV1: Strudel Pattern Methods Return New Instances
**Statement:** Wherever a Strudel Pattern method is called (`.s()`, `.gain()`, `.viz()`, etc.), the return value is a NEW Pattern instance, not the original.
**Causal status:** STRUCTURAL — Strudel's immutable Pattern architecture.
**Scope:** All Pattern prototype methods.
**Breaks when:** `.p()` which returns `this`.
**Confirmed by:** `_pendingViz` set on Pattern A, `.viz()` returned Pattern B, `.p()` called on B with no `_pendingViz`. (2026-03-23)
**Implication:** Any property tagging during method interception must be on the return value.

### PV2: Strudel injectPatternMethods Fires on Every evaluate()
**Statement:** Wherever `repl.evaluate()` is called, `injectPatternMethods` runs first and reassigns all Pattern.prototype methods.
**Causal status:** CAUSAL — `evaluate()` calls `injectPatternMethods()` internally.
**Scope:** Every call to `repl.evaluate()`.
**Confirmed by:** `.viz()` installed before evaluate was overwritten silently. (2026-03-23)
**Implication:** Interceptors must be installed inside the `.p` setter trap, not before `evaluate()`.

### PV3: superdough Audio Routes Through Orbits
**Statement:** Wherever a Strudel pattern produces audio, it routes through a superdough orbit (default orbit 0). Each orbit has its own GainNode chain.
**Causal status:** STRUCTURAL — superdough architecture.
**Scope:** All audio output.
**Breaks when:** N/A — always holds.
**Confirmed by:** Orbit reassignment moved audio away from default chain. (2026-03-23)
**Implication:** Per-track audio isolation requires passive taps on orbit outputs, not orbit reassignment.

### PV4: Monaco View Zone Container is Off-DOM at Mount Time
**Statement:** Wherever a Monaco view zone is created, its container div has `clientWidth = 0` at the time `changeViewZones` fires — the div hasn't been added to the DOM yet.
**Causal status:** STRUCTURAL — Monaco's view zone lifecycle.
**Scope:** All view zone creation.
**Confirmed by:** `container.clientWidth` returned 0, `editor.getLayoutInfo().contentWidth` returned correct value. (2026-03-22)
**Implication:** Use `editor.getLayoutInfo().contentWidth` for initial width, never `container.clientWidth`.

### PV5: p5 setup() Runs on Next requestAnimationFrame
**Statement:** Wherever `new p5(sketch, container)` is called, `setup()` executes on the next animation frame, not synchronously.
**Causal status:** CAUSAL — p5's internal scheduling.
**Scope:** All p5 instance creation.
**Confirmed by:** `resizeCanvas()` after `new p5()` was a no-op — canvas hadn't been created yet. (2026-03-23)
**Implication:** Post-setup operations must be inside the setup callback or a wrapped setup function.

### PV6: Theme Ownership Per Root Component
**Statement:** Wherever a top-level (root-of-tree) component reads CSS custom properties (`var(--*)`), that component MUST own its theme application by calling `applyTheme(containerRef.current, theme)` in a `useEffect`. CSS variables do not propagate from a sibling root — they propagate from a DOM ancestor that explicitly sets them.
**Causal status:** STRUCTURAL — CSS custom property inheritance only goes through the DOM tree, not through React component composition.
**Scope:** Every top-level Stave component (`LiveCodingEditor`, `StrudelEditor`, `VizEditor`, future `WorkspaceShell`).
**Breaks when:** A component is mounted as a sibling of a themed component instead of nested inside it. The CSS variables defined on `LiveCodingEditor`'s container do NOT reach a sibling `VizEditor`.
**Confirmed by:** `VizEditor` rendered without theme application — borders, text, surface colors all unstyled until `applyTheme()` was added to its mount effect. (2026-04-08)
**Implication:** Every new top-level component gets a `theme?: 'dark' | 'light' | StrudelTheme` prop and a mount effect that calls `applyTheme()`. Don't rely on a parent provider — themes are owned at the root, not provided.

### PV7: Editor / Preview Separation
**Statement:** Wherever a code editor and a runtime preview coexist, they must be modeled as independent views with a one-way data dependency (preview reads from editor's file content). They must NOT be modeled as a single component with `previewMode` state.
**Causal status:** STRUCTURAL — composition only works when concerns are fully separated.
**Scope:** Every authoring surface — pattern editors, viz editors, markdown editors, future shader/control editors.
**Breaks when:** A user wants to preview file A while editing file B (impossible if preview is glued to its own editor). When a file has zero previews open OR multiple previews open simultaneously (impossible if `previewMode` is per-editor-group state).
**Confirmed by:** `VizEditor` v0.1.0+ has `previewMode: 'panel' | 'inline' | 'background' | 'popout'` per `EditorGroupState` — this works for one editor but doesn't compose with pattern editors and can't support "preview viz A while editing pattern B." (2026-04-08, this is the motivation for Phase 10.2.)
**Reference system:** VS Code's markdown / markdown preview. Open `README.md` → it's just an editor. `Cmd+K V` → opens a sibling preview view that watches the file. The preview is a *view*, not a *mode of the editor*.
**Implication:** Phase 10.2 refactors all 3 current editor components (`StrudelEditor`, `LiveCodingEditor`, `VizEditor`) along this seam: `EditorView` (Monaco only) + `PreviewView` (file-extension-aware) + `PreviewProviderRegistry` mapping extensions to providers.

### PV8: Preview Providers Need a Shared Audio Bus
**Statement:** Wherever multiple preview views participate in a live system (e.g., a pattern preview produces audio, a viz preview consumes it), they must NOT each own their own audio context. They must publish/consume through a singleton audio bus at the workspace level.
**Causal status:** CAUSAL — `AudioContext` instances are expensive and per-context state can't be shared across them.
**Scope:** Pattern preview (Strudel/SonicPi) → viz preview (Hydra/p5).
**Breaks when:** Each preview creates its own engine — pattern audio plays on context A, viz tries to read from context B and gets silence.
**Implication:** Phase 10.2 introduces `WorkspaceAudioBus` as a singleton. Pattern previews call `bus.publish({ hapStream, analyser, scheduler })` when they start playing. Viz previews call `bus.consume()` (or subscribe) and re-mount their renderer with the new components. There is exactly one audio bus per workspace.

### PV9: Mount Effect Deps Are Input Identity, Not Derived Object Identity
**Statement:** Wherever a React mount effect depends on a derived object (compiled output, transformed config, memoized computation), its dep array must reference the STABLE INPUT that produced the object, not the object itself. Derived objects have unstable identity across pure re-computations.
**Causal status:** STRUCTURAL — JavaScript pure functions return new object references on every call even with identical inputs; React `useEffect` dep comparison is `Object.is`.
**Scope:** Every `useEffect([derivedObject])` where `derivedObject` is produced by a pure transformation of component inputs.
**Breaks when:** The parent re-renders for any reason (state change elsewhere, sibling update), the derivation re-runs, a new object reference is passed in, the effect re-fires and tears down + rebuilds the imperative instance the effect manages. Observable as "my pause/toggle/state-change appears to do nothing" because the instance is destroyed before the effect's side effect (noLoop, pause, update) can be visibly applied.
**Confirmed by:** `createCompiledVizProvider.render()` built `compilePreset(preset)` on every call. CompiledVizMount's `useEffect([descriptor])` fired on every re-render. Stop click looked broken because p5 was destroyed + recreated on the same microtask as the pause call. (2026-04-11)
**Implication:** When a component receives a derived object as a prop and needs to act on it in an effect, either (a) memoize the derivation at the producer level with `useMemo([INPUTS])`, or (b) do the derivation INSIDE the effect's component with `useMemo([INPUTS])` there. Never dep on the raw derived object unless the producer guarantees ref stability via its own memoization.

### PV10: stave.* Live Getters Over Container-Size Ref
**Statement:** Wherever a user-authored p5 sketch needs to match its canvas to a preview pane (not the browser window), the sketch MUST read container dimensions via `stave.width` / `stave.height` live getters over a ref that's maintained by the renderer — NOT via p5's built-in `windowWidth` / `windowHeight` (which track `window.innerWidth`/`innerHeight`, the entire browser).
**Causal status:** STRUCTURAL — p5 `windowWidth`/`Height` are mirror globals of window, not container-aware. A preview pane is a sub-rect of the browser window.
**Scope:** Every user-authored p5 sketch running inside `CompiledVizMount`.
**Breaks when:** User writes `createCanvas(windowWidth, windowHeight)` — the canvas is created at browser size (e.g., 1920×1080) and only AFTER setup does `P5VizRenderer.mount`'s post-mount `resizeCanvas(size.w, size.h)` clamp it to the container. This works only if (a) `size.w/h` are correct at mount time (containers can have `clientHeight: 0` if parent layout hasn't resolved) and (b) p5's setup is truly synchronous (not always). Mismatch produces either an oversized canvas clipped by container overflow or a tiny canvas from a 0-height fallback.
**Confirmed by:** User reported "the canvas isn't following the preview area's dims." Fix: threaded `containerSizeRef: RefObject<ContainerSize>` through `P5SketchFactory` (4th arg), maintained it in `P5VizRenderer.mount`/`resize`, exposed as live getters on the `stave` namespace. Seed Piano Roll uses `createCanvas(stave.width, stave.height)` which always matches the live container. (2026-04-11)
**Implication:** Every injected runtime context for user-authored code must expose container-aware dimensions when the code runs inside a bounded sub-rect. Never rely on the host environment's "window" globals when the host IS nested inside something smaller.

### PV13: VizRenderer Owns Its Own Draw Loop
**Statement:** Wherever a `VizRenderer` implementation supports `pause()`, the renderer MUST own the loop (rAF, polling timer, event chain) that drives its visible output. There is exactly ONE source of draw ticks per renderer instance, and `pause()` cancels it synchronously. Flag-only pauses are forbidden — a `paused = true` assignment that doesn't also cancel a loop is a no-op for any library that runs a default loop independently.
**Causal status:** STRUCTURAL — JavaScript loops are independent unless explicitly chained. A library's internal rAF loop has no knowledge of host-side flags; the host's only handle on it is to not start it (turn off the library default) or to cancel it explicitly.
**Scope:** Every `VizRenderer` implementation in `packages/editor/src/visualizers/renderers/`. Currently: `P5VizRenderer`, `HydraVizRenderer`. Future: any new renderer (shader, three.js, OffscreenCanvas, etc.).
**Confirmed by:** Issue #6 (HydraVizRenderer pause was a no-op because hydra ran its own `autoLoop:true` rAF). Issue #3 / P17 (P5VizRenderer had a parallel issue with deferred async setup creating orphan canvases that bypassed pause). Both fixed by taking ownership of the relevant loop / lifecycle.
**Implication:** Adding a new renderer requires answering three questions UP FRONT before merging:
  1. What loop drives the visible output? (rAF, polling, event listener, library internal)
  2. Can `pause()` cancel that loop synchronously?
  3. Can `destroy()` cancel any deferred async setup chains the library schedules during construction?
If the answer to (2) or (3) is "no without taking control," the renderer must be restructured to own the loop / neutralize the deferred chain BEFORE shipping. The corresponding unit test pattern lives in `HydraVizRenderer.test.ts` (mock the loop primitive, fire callbacks manually, assert pause cancels and resume re-arms). See P17 + P19.

### PV14: Component-Local State Doesn't Survive Layout-Shape Remount
**Statement:** Wherever a React parent renders different element-tree shapes for different layout states (e.g., `oneGroup ? <Direct/> : <SplitPane><Wrapper><Child/></Wrapper></SplitPane>`), the child component's local state (useState, useRef created inside) MUST NOT be the source of truth for anything that should survive the layout transition. React reconciliation will fully unmount and remount the child whenever the parent's element type at the child's tree position changes — no key trick rescues this; the type itself differs. State that must persist belongs in the lowest stable parent, not in the leaf.
**Causal status:** STRUCTURAL — React's reconciliation algorithm walks the parent's element children by type+position. A different element type at the same position is treated as a brand new tree, regardless of what's inside.
**Scope:** Every component below a parent that branches its render output structurally. Specifically in this codebase: VizEditorChrome (selectedSource), CompiledVizMount (descriptor memo + rendererRef), and any future leaf component below `WorkspaceShell`'s `renderTabContent` IIFE-vs-SplitPane branch.
**Breaks when:** A user gesture flips the layout shape — the most common in this codebase is "open the first preview tab" which transitions from one group to two groups, switching the IIFE branch to the SplitPane branch in `WorkspaceShell.tsx:1698-1702`. Other triggers: drag-drop into a new quadrant, closing the next-to-last group, opening a popout window (some of these may be guarded by `key` props but the IIFE/SplitPane branch is not).
**Confirmed by:** Issue #3 — the chrome's `selectedSource` state was being wiped to `default` whenever Preview was clicked, because the act of opening the preview tab transitioned the shell from 1 group to 2 groups, switching the render path. Confirmed by Playwright probe inspection: `chrome buttons=1 selects=1 values=["default"]` after Preview click, even though the user had selected "drum" before clicking. Fix: lifted the audio start/stop dispatch from the chrome (which had stale state) to the shell's `onTogglePausePreview` handler (which reads the open preview tab's `sourceRef` from the shell-owned `groups` Map — survives the remount). 2026-04-11.
**Implication:** When designing a new chrome / leaf component, audit: "does this component live below `renderTabContent`? If yes, does it have local state that the user expects to persist across layout changes? If yes, that state belongs in the shell, not in the chrome." The shell's `groups` Map and other root-level state are the canonical persistence layer. Chrome components should be DERIVED from shell state via props, not the source of truth. See P20.

### PV12: Destroy Must Neutralize Deferred Work, Not Just Cancel Active Work
**Statement:** Wherever a host integrates with a library that uses DEFERRED initialization (async setup chains, RAF-queued construction, microtask-awaited lifecycle hooks), the host's "destroy" handler must NOT assume that the library's destroy method cancels work scheduled for the future. Calls to `instance.remove()` / `dispose()` / `cleanup()` typically only cancel work that's IN PROGRESS — async chains still awaiting microtasks, RAF callbacks bound to instance methods, and `window.addEventListener('load', ...)` callbacks all survive destroy unless the library explicitly cancels them.
**Causal status:** STRUCTURAL — JavaScript microtasks and RAF queues are ordered by scheduling time, not by which object scheduled them. Once a callback is on the queue, only its scheduler can revoke it.
**Scope:** Every host-managed lifecycle for a library that schedules work via `requestAnimationFrame`, `setTimeout`, `await`, `MutationObserver`, or load event listeners. Specifically: p5.js (PK2 / PV5 / P3 / P17), Web Audio API (deferred AudioContext state changes), Hydra (async shader compilation). Future renderers must be audited against this invariant.
**Breaks when:** Destroy runs BETWEEN the library's "schedule setup" call and the actual setup callback firing. Most common trigger in Stave: React StrictMode dev double-invoke runs `effect → cleanup → effect` synchronously, while p5's setup chain awaits the next animation frame.
**Confirmed by:** P5VizRenderer's `destroy()` had to be augmented with `hitCriticalError = true` plus no-op overrides of `setup`/`draw`/`preload`/`createCanvas` before calling `instance.remove()`. Without these, p5's `#_setup()` would run the unconditional `createCanvas(100, 100, P2D)` AFTER our remove() call, appending an orphan canvas that nothing could pause. (2026-04-11)
**Implication:** Every renderer's `destroy()` must (1) read the library's source to find every deferred-work mechanism it owns, (2) actively neutralize each one before calling the library's destroy, (3) document the audit in code comments. Adding a renderer without doing this audit re-opens this entire bug class. The audit checklist: "Does the library schedule any callback that survives destroy? If yes, override or no-op the callback's target before destroy."

### PV11: Single-Source-at-a-Time Playback via Coordinator
**Statement:** Wherever a project has multiple audio sources that should not play simultaneously (user expects DAW-style "hit play on one, everything else stops"), there must be a module-level coordinator that all sources register with. Starting a new source notifies the coordinator, which invokes the `stop` callback on every other registered source.
**Causal status:** CAUSAL — audio sources live in disconnected module graphs (class instances for pattern runtimes, module-level singletons for built-in example sources). There's no shared React tree to thread state through. Only a module-level coordinator can enforce the cross-cutting invariant.
**Scope:** All playback sources in Stave: `LiveCodingRuntime` instances (one per pattern tab), `sampleSound`, `drumPattern`, `chordProgression` (module singletons), future additions.
**Breaks when:** Any source bypasses the coordinator (calls its own audio graph directly without `notifyPlaybackStarted`). The cacophony of multiple simultaneous sources returns for that path.
**Implication:** Every new playback source added to the project must (1) register on construction with `registerPlaybackSource(id, stop)`, (2) call `notifyPlaybackStarted(id)` inside its start path AFTER marking itself playing, (3) call `notifyPlaybackStopped(id)` inside its stop path, (4) unregister on disposal. Stop callbacks MUST be idempotent (safe to call on an already-stopped source) and must not throw. See `src/workspace/playbackCoordinator.ts`.

### PV15: Live Source-Position Tracking Uses Editor Decorations, Not Indices
**Statement:** Wherever a consumer anchors UI elements (view zones, annotations, overlays) to positions in user-editable source code, the anchor MUST be a Monaco `IEditorDecorationsCollection` on the relevant text range — NOT a positional index into a scanned list. Decorations track text edits (insertions above, indentation changes, content growth/shrinkage) for free. Index-based anchors go stale on every edit that isn't a direct mutation of the tracked object's own line.
**Causal status:** STRUCTURAL — Monaco's decorations are first-class text anchors maintained by the model's edit engine. Any positional mapping reconstructed from a secondary source is an eventual-consistency shadow, not a truth.
**Scope:** Inline viz zones (`viewZones.ts`), active-hap highlights (`useHighlighting.ts`), future overlays that reference source text.
**Breaks when:** The user edits unrelated code above the tracked line — inserts, deletes, or reshuffles. The positional scanner produces a new list; the stored index dereferences to the wrong entry. Stored afterLines drift into other blocks.
**Confirmed by:** Inline viz zones drifted across `$:` blocks as the user inserted new patterns above. Fix: Monaco decoration on the `.viz("<name>")` source line with `stickiness: 1`; re-anchor reads the decoration's current line and walks source structure from there. Positional scanner deleted. Issue #29, commit `f7a752e`, 2026-04-15.
**Implication:** Any new source-anchored UI in the editor must plant a decoration at mount. Never store "line N" as an index; always store a decoration ID and read the current line back each time you need it.

### PV16: Internal Bookkeeping Mutations Must Not Fire User-Observable Subscribers
**Statement:** Wherever a module performs self-initiated bookkeeping mutations on a shared reactive store (Yjs, Zustand, Redux, etc.), those mutations MUST be tagged with a distinct transaction origin, and observers MUST filter their user-facing subscriber notifications on that origin. Firing user-subscribers from internal maintenance work enables reentrancy during active mount/cleanup cycles and duplicates downstream reactions that were already handled by the code doing the maintenance.
**Causal status:** STRUCTURAL — reactive stores dispatch observer events synchronously on commit. If a maintenance routine commits mid-mount, the sync observer dispatch can reenter the mount via a user-subscribed remount effect.
**Scope:** All Yjs mutations in `WorkspaceFile.ts` and future store modules. Specifically: `pruneZoneOverrides` (internal) vs. `setZoneCropOverride` (user-driven).
**Breaks when:** An internal transaction triggers a subscriber that re-invokes the caller or one of its callers. Inline viz zones duplicated until page refresh; the invisible orphan set was created by a remount reentering `addInlineViewZones` before its outer assignment completed.
**Confirmed by:** Issue #30, commit `1d4f69b`. Fix: `PRUNE_ZONE_OVERRIDES_ORIGIN` Symbol passed to `doc.transact`; `observeDeep` skips when `events[0].transaction.origin` matches.
**Implication:** When adding a new bookkeeping / reconciliation routine that touches a shared store, (1) define a private `Symbol` origin, (2) pass it to every `transact` inside the routine, (3) update the observer to skip that origin, (4) add a regression test asserting subscribers are NOT called by the routine. User-driven paths remain unaffected because they use the default origin.

### PV17: Async-Mounted Ref Consumers Need a Ready Flag in Effect Deps
**Statement:** Wherever a component subscribes to a bus / store whose `subscribe()` fires the callback SYNCHRONOUSLY once with current state AND the callback consumes a ref populated by an async child mount (Monaco, third-party widgets, etc.), the subscribe effect MUST include a `ready` state flag in its deps. The flag flips inside the async mount handler; the effect re-subscribes when it flips; the re-subscribe's sync initial fire redelivers the payload with the ref now populated.
**Causal status:** STRUCTURAL — ref assignment in an async callback does not trigger re-render. Without a state-change trigger, the subscribe callback's stale guard result is final.
**Scope:** `EditorView` + any future component that subscribes to `workspaceAudioBus` alongside a ref-bearing child. Also applies to consumers of `VizPresetStore`, `workspaceFileStore`, and any future subscribe-fires-sync store.
**Breaks when:** A second consumer mounts while the bus already has a payload (split editor group, popout window opened mid-playback, late-joining subscriber). The first consumer escapes the race because it mounted before any publish.
**Confirmed by:** Issue #22, commit `98f2fbb`. `editorReady` state added to `EditorView`; flipped in `handleMonacoMount`; added to the bus-subscribe effect deps.
**Implication:** Any new ref-bearing component that subscribes to a sync-firing store must (1) define a `ready` state initialised false, (2) flip it true inside the ref-populating callback, (3) list it in the subscribe effect's dep array. The comment should explain the race so the pattern survives refactors.

### PV18: useCallback Dep Arrays Must Reflect Every Read Identifier

**Statement:** Wherever a `useCallback` returns a render function (or any function the closure-deps interpretation of React applies to), its dep array MUST list every prop and state value the function body reads. Missing a dep silently bakes in a stale snapshot.
**Causal status:** STRUCTURAL — React caches the function reference between renders by dep-array equality. The closure captures values lexically; subsequent renders that change those values without changing the deps return the same cached function with stale captures.
**Scope:** Every `useCallback` returning a render function in the editor package. High-risk file: `WorkspaceShell.tsx`'s `renderGroup`, `renderTabContent`.
**Breaks when:** A new prop is added to a component whose render flow goes through a memoized renderer, and the dev forgets the dep array.
**Confirmed by:** P29 (this session).
**Implication:** Either keep `react-hooks/exhaustive-deps` lint enabled and respect it, or pull renderers out of useCallback — there's no middle ground.

### PV19: Per-Instance Configuration Lives With the Instance, Not in Global Settings

**Statement:** Wherever a configuration affects ONE pinned/active resource (this backdrop, this preview, this crop), its UI surface and its persistence MUST be co-located with that resource. Global settings modals are only for cross-project preferences.
**Causal status:** SEMANTIC — users mentally model "this thing's settings" vs "my IDE preferences" differently. Mixing them confuses scope (does changing the value affect every project? this one? this session?).
**Scope:** Every per-instance backdrop control (opacity, quality, crop, blur). Per-zone overrides (inline viz crop). Future: per-pattern viz settings.
**Breaks when:** Quality lives in BOTH the chrome and the Settings modal, both writing the same localStorage key — users see two UIs for one value, can't tell which scope they're editing.
**Confirmed by:** This session — Editor Settings had backdrop opacity / quality / blur AND the chrome had quality. Resolved by moving everything into the BackdropPopover (anchored to the indicator, the visible representation of the instance) and stripping the Settings rows.
**Implication:** When adding a new control, ask "does this affect this instance, or all instances forever?" Per-instance → contextual UI (popover, chrome, right-click). Cross-project → Settings.

---

### PV20: Zone Overrides Must Carry Content Identity

**Statement:** Every zone override (crop, height) stored in the Yjs doc MUST include a content hash of the block it was set for. Without content identity, overrides keyed by position-based trackKeys survive block reordering and apply to the wrong block.

**Causal status:** STRUCTURAL — anonymous `$:` blocks have no stable identity. Position-based keys (`$0`, `$1`) are reassigned on every code scan. Content hashes are the cheapest stable identifier that doesn't require language-level analysis.

**Scope:** All zone overrides in `WorkspaceFile.ts` — `setZoneCropOverride`, `setZoneHeightOverride`, `pruneZoneOverrides`.

**Breaks when:** A new override type is added without including `contentHash`, or the hash computation changes without migrating existing overrides.

**Confirmed by:** P35 (this session).

---

### PV21: Yjs Transaction Origins Control Subscriber Notification Scope

**Statement:** Every Yjs `doc.transact()` call that mutates shared state MUST use an appropriate transaction origin. Observer callbacks MUST check the origin and skip notification when the mutation is internal bookkeeping (prune, height-resize) rather than user-visible state change.

**Causal status:** STRUCTURAL — Yjs observers fire on every mutation regardless of intent. Without origin-based filtering, internal writes trigger subscriber cascades (remount, re-render) that undo the mutation's effect.

**Scope:** All zone override mutations. Currently three origins: `STRUCT_ORIGIN` (crop writes → triggers remount), `PRUNE_ZONE_OVERRIDES_ORIGIN` (prune → silent), `HEIGHT_RESIZE_ORIGIN` (drag resize → silent).

**Breaks when:** A new mutation type uses the wrong origin, or a new subscriber doesn't check origins.

**Confirmed by:** P34 (this session).

---

## PV22 — Event-store subscribers must defer React state updates

**Invariant:** Any subscriber registered against a module-level event store (`subscribeLog`, `subscribeToFileList`, Y.Map observers, the runtime `onError` chain) MUST NOT call React `setState` synchronously during emit. Use `queueMicrotask` (or a higher-level scheduler) to break the call stack before touching React state.

**Why:** Event-store emits happen from inside arbitrary call sites — engine error callbacks, Monaco marker-commit handlers, CRDT observers firing during React commits. A synchronous subscriber that `setState`s interleaves with whatever React phase the emitter was called from. Best-case: harmless wasted re-render. Worst-case: mid-commit error in a sibling subtree tears down the whole tree because React has no recovery path in commit.

**Span:**
- `packages/editor/src/engine/engineLog.ts` — fixed: listener fan-out wrapped in `queueMicrotask`.
- `packages/editor/src/engine/HapStream.ts` — should audit; subscribers fire from scheduler ticks.
- `packages/editor/src/workspace/WorkspaceFile.ts` Y.Map observers — already deferred via React's own state batching, but explicitly queueing would be safer.

**Status:** PARTIAL — only engineLog enforces it. Other stores should be audited.

## PV23 — Friendly-error fuzzy-match requires DocsIndex parity across runtimes

**Invariant:** Every runtime Stave exposes MUST have a committed `DocsIndex` in `packages/editor/src/monaco/docs/data/<runtime>.json` (OR hand-curated in `strudelDocs.ts`) validated by `validateDocsIndex`. `formatFriendlyError(err, runtime, { index })` uses the index's keys as its Levenshtein corpus; no index = no fuzzy suggestions for that runtime.

**Why:** The whole "Did you mean X?" UX is predicated on having a canonical symbol dictionary to match against. A runtime wired into `emitLog` without a paired DocsIndex silently degrades to raw error messages.

**Span:** Strudel, Sonic Pi, p5, Hydra all present and validated. Any new runtime (Tidal, FoxDot, Hydra extensions) must ship a DocsIndex before getting hooked into the engine-log bridge.

**Status:** ENFORCED for current 4 runtimes.

---

## PV24 — Every IREvent must carry source-range provenance when produced from known source

**Invariant:** Any IREvent whose producer was a recognized parser leaf (Strudel mini-notation atom, Sonic Pi note, future Tidal/FoxDot note) MUST carry a populated `loc: SourceLocation[]`. Two paths produce IREvents and both must honor this:

1. **Live audio path** — `HapStream.emit` extracts loc from `hap.context.locations`; BufferedScheduler forwards it onto the IREvent; normalizeStrudelHap also extracts it for `queryArc` results.
2. **IR-derived path** — `parseStrudel` and `parseMini` track char offsets from the user's source code, attach them as `Play.loc`; `collect.ts` propagates them onto produced events.

**Why:** Inspector click-to-source, future Monaco highlighting of active sub-sections, the bidirectional editing thesis, and the Transform Graph debugger ALL depend on every event mapping back to its source range. A single producer that drops loc creates a class of "events I can't trace" — a hole that propagates through every downstream UI feature.

**Span:**
- `packages/editor/src/engine/HapStream.ts` ✓
- `packages/editor/src/engine/BufferedScheduler.ts` ✓
- `packages/editor/src/engine/NormalizedHap.ts` ✓
- `packages/editor/src/ir/parseMini.ts` ✓
- `packages/editor/src/ir/parseStrudel.ts` ✓
- `packages/editor/src/ir/collect.ts` ✓ (propagates Play.loc → event.loc)
- Future: parseSonicPi, parseTidal, etc. — must thread baseOffset and attach Play.loc.

**Status:** ENFORCED for current Strudel + BufferedScheduler paths. Container nodes (Seq, Stack, Cycle, FX) don't carry loc yet — deferred until a consumer needs container highlighting.

**Confirmed by:** PR #59 (BufferedScheduler/normalizeStrudelHap), PR #65 (parseStrudel + parseMini + collect).

---

## PV25 — Parser pipelines preserve absolute offsets at every hop

**Invariant:** From the user's source code through to leaf IR nodes, the parser MUST preserve absolute character offsets. Specifically:

- No `.trim()` followed by use of the trimmed string as a positional reference
- No `chunks.join('\n')` of separately-positioned strings into a single buffer
- Slice-producing helpers (extractTracks, splitArgs, extractParenContent) return `{ slice, offset }` shapes when downstream parsers need loc, not raw strings
- Recursive parser calls thread `baseOffset` through every level
- Regex matches use `match.index` to compute offset of inner content

**Why:** Source-range tracking is invariant-by-construction — once a single hop drops the offset, all downstream attribution is lost. P39 documents the cost of retrofitting this onto a non-offset-aware parser.

**Span:** `parseStrudel`, `parseMini`. Future parsers (parseSonicPi, parseTidal) inherit this invariant from day one.

**Status:** ENFORCED in IR parsers as of PR #65. Future parsers must follow.

**Breaks when:** A new parser case adds a `.trim()` or string-concat without preserving offset alongside it.

**Update (Phase 19-07):** Stage transitions are now PV25's primary enforcement surface. The 4-stage pipeline (RAW → MINI-EXPANDED → CHAIN-APPLIED → FINAL) creates 3 stage seams; each is a P39-class risk surface. Codified in `packages/editor/src/ir/__tests__/parseStrudelStages.test.ts`:
- T-05.a/b: per-stage loc probes for RAW + MINI-EXPANDED (PR-A).
- T-10.b1: MINI-EXPANDED → CHAIN-APPLIED universal loc-equality across 6 fixtures (PR-B).
- T-10.b: PK12 dot-inclusive convention probe across method chains.
- T-05.c + T-09: FINAL parity sentinel (1 + 19 fixtures) — byte-equal to today's `parseStrudel(code)`.

**Caveat at stage transitions:** synthetic-from-stage anchors (e.g., RAW's outer Stack carrying `[0, code.length]` for tab visualization) are deliberately exempted from cross-stage loc preservation per P47. Real anchors (every Cycle/Play/Seq/etc. inside tracks) are preserved per the invariant.

---

## PV26 — Curated friendly-error hints must reproduce live before shipping

**Invariant:** A `commonMistakes` entry (per-symbol or `globalMistakes`) MUST be backed by a captured live error message before merging. The detection regex matches against THAT message, not against an inferred-from-docs hypothesis. Tests assert the hint fires on the actual message.

**Why:** Friendly hints fail silently. A wrong regex still passes a unit test fed a fabricated error string but never fires for users. The empty-state degradation is invisible — no failing build, no thrown exception.

**Span:** All 4 runtime indexes (Strudel, Sonic Pi, p5, Hydra). Strudel/Hydra have proven seeded hints; p5/Sonic Pi have empty `globalMistakes: []` slots awaiting observed failures.

**Status:** ENFORCED — PR #57 dropped a speculative p5 hint that didn't reproduce.

**Breaks when:** A maintainer adds a hint based on plausibility ("users probably hit this") without browser-side verification. The unit-test layer can't catch this.



## PV27 — Schema evolution at observation-only stores via publisher-set alias

**Invariant:** When extending the schema of an observation-only store (a single-slot snapshot like `IRSnapshot`, where the latest publish replaces the previous), prefer adding a NEW required field for the richer data and **populating any legacy field as an alias of the new one at the publisher**. Do NOT use a getter — the snapshot must remain a plain serializable object so `structuredClone`, JSON serialization, and tests work uniformly. The alias is set once from the new field and never derived elsewhere.

**Why:** Existing readers of the legacy field continue to compile and run with zero migration churn. New readers can opt into the richer field. The single source of truth lives at the publisher (one site to verify the alias contract). Drift is detected by either a tsc-level type check (legacy field still required) or a single grep audit (`grep -rn "snap\\.ir\\b"` after the change).

**Span:** `IRSnapshot` (extended `passes[]` while keeping `ir` as alias of `passes[passes.length-1].ir` in PR #68). Future evolutions of `engineLog`, `IRSnapshot`, and any future single-slot publish stores follow the same pattern.

**Status:** ENFORCED at the `IRSnapshot.ir` field via `publishIRSnapshot` callers in `StrudelEditorClient.tsx`. New publishers must derive both fields from a single computed value to prevent drift.

**Breaks when:** Two independent code paths set the legacy and new fields separately — drift becomes possible. Or a getter is used and a downstream `structuredClone` strips it. Or readers cache the legacy field across publishes (the alias is per-snapshot, not stable across them).

**Implication:** When adding a richer schema variant, the PR's verify step includes an alias-drift assertion: `snap.ir === snap.passes[snap.passes.length - 1].ir`. Any new reader site of the legacy field must continue to type-check and pass tests in the same PR.


## PV28 — `Fast` in our IR scales ctx.speed; does not re-play the body

**Invariant:** Our `Fast(n, body)` arm in `collect.ts` scales `ctx.speed` so the body's events are time-compressed into `[0, 1/n)` of the cycle. It does NOT re-play the body N times. Strudel's `_fast(n)` re-plays — body events appear N times across `[0, 1)`. **Wrapping a body in `Fast(n, Seq(body × n))` does NOT reproduce Strudel's `fast(n)` for multi-event bodies.**

**Why:** This is consistent with how the rest of our IR threads `ctx.speed` (Slow, Stack-internal scaling, etc.). It is, however, divergent from Strudel's user-facing semantic of `.fast()`. The divergence is invisible for single-event bodies (one event scaled vs. one event repeated yields the same observable). It IS visible for multi-event bodies — desugars that wrapped multi-event bodies in `Fast(n, Seq(body × n))` collapsed in Phase 19-03 (the `ply` case).

**Span:** `collect.ts` `Fast` arm; any future operator that desugars to `Fast(n, ...)` over a multi-event body. Currently includes `Slow` (symmetric) and any prospective `chop`/`ply`/`stutter`-style transforms.

**Status:** ENFORCED at the implementation level (`Fast` arm uses `ctx.speed`). NOT YET DOCUMENTED in user-facing surfaces. New operators that need re-playing semantics must use a dedicated tag (e.g., `Ply` per Phase 19-03), not a `Fast` desugar.

**Breaks when:** A desugar wraps a multi-event body in `Fast(n, ...)` and expects re-playing semantics. Single-event bodies will pass parity by coincidence; multi-event bodies will collapse into `[0, 1/n)`. This was the exact failure mode that forced `Ply` to a new tag in Phase 19-03 W4.

**Implication:** Future Tier 4 / Tier 5 operators with re-playing semantics (`chop`, `stutter`-equivalents, `repeat`, anything that "plays N copies in original duration") need either (a) a dedicated tag with explicit collect re-play, OR (b) a fix to `Fast` to add re-play semantics — but that's a behavioral change to existing patterns and would need its own migration. Default: dedicated tag.

**Confirmed by:** Phase 19-03 W4 — the `Fast(n, Seq(body × n))` desugar for `ply` was probed empirically and produced 12 events in `[0, 1/3)` instead of `[0, 1)`. Pivoted to a `Ply` tag.


## PV29 — Phase prioritization is governed by the 5-axis substrate progression

**Invariant:** Every phase that touches the IR pipeline must advance one of the five substrate axes — **Code, Stages, Time, Editing, Sound source** — and each axis has a sequencing constraint relative to the others. Phases that don't advance an axis are detours, not necessarily wrong but worth being explicit about. Phases that violate an axis's sequencing constraint produce wasted infrastructure (e.g., a 4-tab Inspector on a 60%-modeled IR is less useful than a 1-tab Inspector on a 95%-modeled IR).

**Sub-axis decomposition (added 2026-05-06):** An axis MAY decompose into sub-axes (e.g., axis 5 → 5a/5b/5c/5d) when an external thesis or codebase realization surfaces a substrate that BELONGS in the parent axis but is paradigmatically distinct from sibling sub-axes. Sub-axes use letter suffixes; existing axis numbers (1–5) are NEVER renumbered to preserve catalogue cross-reference stability. Each sub-axis carries its own "what honest means" definition, status, ratchet phase, and sequencing constraint within the parent axis. The decomposition mechanism itself is sanctioned within PV29 — surfacing a new sub-axis is a recognized form of substrate-axis maturation, not a thesis revision. See `feedback_substrate_subaxis_split.md` for application protocol.

**Why:** The destination is "one IR, five views, all editable, all parity-verified" — not a sequencer plus a debugger plus a DAW, but a substrate that makes all three emerge. The Ableton-class capability ("any sample → IR → code → audio with provenance") is the **emergent property** of the five substrates being honest, not a separate roadmap item to chase. Without the axes-as-lens, phase decisions drift toward feature-completeness over substrate-honesty, which produces visually richer Inspectors with diagnostically weaker substrates.

**Span:** All Phase 19-* (Pattern IR pipeline + Bidirectional DAW + Tier 4 expansion), Phase 20 (Transform Graph), Phase 22 (Audio Analysis + Vocals), Phase 23 (Layer 3 timbre). Phases outside this span (Phase 11 library polish, PM-* persistence) advance orthogonal concerns and don't trip this invariant.

**Status:** ENFORCED at planning time. `/anvi:discuss-phase` and `/anvi:plan-phase` should consult `artifacts/stave/CLOSED-LOOP-PLAN.md` to confirm the next phase advances an axis and respects sequencing.

**Breaks when:** A phase is planned for feature parity with a reference system (e.g., "match Ableton feature X") instead of for substrate progression. Or a downstream phase ships before its upstream substrate is honest enough to support it (e.g., bidirectional editing before sufficient Tier 4 coverage produces round-trip drift on every desugar). Or two phases get sequenced in parallel when they have a hidden axis-dependency (e.g., streaming timeline parallel to parser decomp — the timeline scrubs through one undifferentiated blob without the stages).

**Implication:** When planning the next phase, ask the substrate question first: which axis does this advance, what's its current honesty %, and is the upstream-axis honesty sufficient? If the axis is at 60% and a downstream phase is being considered, advance the upstream axis first. Coverage before decomposition; decomposition before scrubbing; scrubbing before bidirectional editing; bidirectional editing before audio-in.

**Confirmed by:** Session ending 2026-05-04. Phase 19-03 (Tier 4 first half) advanced axis 1 from ~60% to ~85% — the deliberate-substrate-progression framing emerged at the end of this session when the user reframed Stave-as-debugger to Stave-as-instrument. Codified in `artifacts/stave/CLOSED-LOOP-PLAN.md` and ROADMAP.md's substrate-progression header.

**2026-05-07 reframe.** PV29's 5-axis structure stands as long-range
vision, but **immediate phase prioritization is governed by the
debugger thesis** (PV36 / PV37 / PV38, see
`memory/project_debugger_thesis.md`). Axis 4 ("Editing is honest") is
narrowed to "Observation is honest" for the v1 substrate; the
edit-direction work (bidirectional DAW second half, Phase 20
Transform Graph as edit surface, Phase 22 audio→IR, Phase 23 Layer-3
timbre) is deferred until the debugger v1 + v2 ships. PV29 still
applies as the long-range axis lens; PV36-38 are the immediate
ratchets. When a phase is being prioritized today: ask the debugger
question first ("does this advance loc-completeness, opaque-wrapper,
or hap-identity?"), the axis question second.

**Sub-axis decomposition confirmed by:** Session 2026-05-06. SonicPiWeb's SynthDef encoder thesis (`~/Documents/projects/sonicPiWeb/artifacts/THESIS_BROWSER_SYNTHDEF_ENCODER.md`, April 2026, 246-byte byte-verified POC) surfaced during Phase 19-08 planning. Axis 5 decomposed into 5a (audio in / Phase 22), 5b (statistical timbre / Phase 23), 5c (synthesis architecture / Phase 24 — encoder), 5d (offline transformation / Phase 25 — CDP-class). Existing axes 1–4 unchanged. CLOSED-LOOP-PLAN.md revised end-to-end with sub-axis status, full IR taxonomy across 6 layers, FMOD-class adaptive audio (Phases 25–28) + external integration (Phases 29–34) added. Sub-axis decomposition mechanism worked WITHOUT cascading catalogue rework — every existing PV/PK/P entry that referenced "axis 5" remained semantically valid; the sub-axis breakdown lives in the strategic doc, not in catalogue numbering.


## PV30 — Narrow-tag parity tests assert divergence as contract, never weaken to count-only

**Invariant:** When a forced narrow tag (e.g., `Swing` in 19-04 D-03; future `Inside`-deferred shapes) deliberately diverges from a desugar-via-not-yet-existing-primitive reference, the parity test MUST encode the divergence as a four-clause contract:

1. **Our IR is correct on its own claim** — count + per-event `(begin, s/note, gain, …)` set match what our collect arm SHOULD produce given the tag's documented narrow semantics.
2. **Reference's diverging count** — the parity test asserts the reference (Strudel) produces a specific event count under the same input. This LOCKS the divergence point — if Strudel changes, the test fails and we re-evaluate.
3. **Strict inequality with reference** — the test explicitly asserts `ours !== reference` on the divergence axis. Counting tests that "happen to be equal under specific inputs" silently weaken when the inputs change; explicit `!==` codifies "we know we differ."
4. **Migration trigger comment** — a top-of-block comment names the future primitive (e.g., `Inside`, `randrun`) whose arrival flips this contract from divergence to tight parity.

**Why:** Without all four clauses, a parity test for a narrow tag becomes ambiguous: a future change that ACCIDENTALLY brings our IR into alignment with the reference reads as a passing test, but it isn't proof we got the semantics right — it's coincidence. Worse, a test that asserts only "count matches" weakens to a tautology when the reference under-emits. The four-clause shape forces the test author to state what they ARE asserting and what they explicitly are NOT.

**Span:** Any forced narrow tag whose semantics intentionally differ from a desugar reference. Currently: `Swing` (19-04 — diverges from `pat.inside(n, late(seq(0, 1/6)))` because `Inside` primitive deferred). Future candidates: any tag added before its underlying primitive (per D-03 / 19-03's "ratchet a primitive in only when its first user demands it AND it pays double" rule).

**Status:** ENFORCED at parity-harness review. New narrow tags failing the four-clause contract get rejected from PR review.

**Breaks when:** A reviewer accepts a narrow-tag parity test that only checks count or only checks "our IR produces N events" without asserting divergence from reference. The test becomes a regression-blocker for accidental alignment but provides zero forward signal about what "right" means.

**Confirmed by:** Phase 19-04 W3 Swing (`signal.mjs:392`-derived divergence; the `Inside` primitive deferred per D-03; parity test encodes (a) our 6-event swung output, (b) Strudel's 12-event late-stack output, (c) `expect(ours.length).not.toBe(reference.length)`, (d) migration comment naming `Inside`). RESEARCH §1.3 anticipated this pattern; W3 implementation crystallized it as the project-level invariant.

---

## PV31 — `userMethod` distinguishes co-tag aliases (Stack-from-layer ≠ Stack-from-jux)

**ORIGIN:** Phase 19-05 D-08 (exact-token taxonomy locked at the
discuss-phase) + W4 (per-component loc + userMethod at layer/jux/off
desugars) + W7 round-trip subset assertions. Surfaced concretely when
the round-trip test on `s("bd").layer(x => x.gain(0.5))` asserted
`Stack.userMethod === 'layer'` and the symmetric test on
`s("bd").jux(rev)` asserted `Stack.userMethod === 'jux'` — two Stack
tags with identical structural shape but different user-typed method
names. Same pattern surfaced for `Degrade-from-degrade` vs
`Degrade-from-degradeBy`.

**Invariant:** When two parser paths produce the same IR tag from
different user methods (Stack from `.layer(...)` and Stack from
`.jux(...)`; Degrade from `.degrade()` and Degrade from
`.degradeBy(p)`; etc.), the tag's `userMethod` field MUST carry the
EXACT user-typed method name (D-08 exact-token taxonomy). Canonicalization
or aliasing (e.g., normalizing `.degradeBy(0.5)` to `userMethod:
'degrade'`) is forbidden at the parser layer. Round-trip fidelity is
the load-bearing property — when 19-06's projection renders the tree
row label, users see THEIR OWN VOCABULARY, not a normalized canonical.

**Why:** Without this invariant, the Inspector's projected tree
collapses onto a normalized vocabulary that doesn't match what the
user typed. A user who writes `.degradeBy(0.5)` sees `degrade` in the
tree row — confusing because the user knows they typed `degradeBy`,
and click-to-source would land at `.degradeBy(...)` while the row
says `degrade`. The mismatch breaks the cognitive bridge between
source and tree. Canonicalization is a 19-06+ display concern (search,
grouping by canonical kind) and can be a derived map; the parser-layer
field stays semantically simple: "what string did the user write at
this method's call site?"

**Span:** Every parser path that constructs a non-Play tag.
Specifically:
- Smart-ctor calls via `tagMeta(method, callSiteRange)` — `method` is
  whatever string `extractNextMethod` returned (the literal user-typed
  token).
- Literal-construction sites at desugars (parseStrudel:317 layer,
  parseStrudel:425 jux, parseStrudel:487 off, parseStrudel:186 root
  stack) — `userMethod` is hardcoded to the user-method string per
  case (`'layer'`, `'jux'`, `'off'`, `'stack'`).
- parseTransform's bare `fast(n)` / `slow(n)` direct constructions
  — `userMethod: 'fast'` / `'slow'`.
- parseMini synthetic constructions — `userMethod: undefined` (no
  method-typed user vocabulary in mini-notation; the implicit-IR
  principle PV28 handles the projection).

**Status:** ENFORCED at parity-harness review. T-10 round-trip subset
exercises 5 representative tags (Late, Pick, Struct, Stack-from-layer,
Stack-from-jux) PLUS a nested-composition case to ensure inner tags
also preserve their userMethod (e.g., `.every(2, x => x.late(0.125))`
→ outer `Every.userMethod === 'every'`, inner
`Late.userMethod === 'late'`). New parser paths must add a round-trip
assertion before merge.

**Breaks when:** A parser path canonicalizes the method name (e.g.,
maps `'degradeBy'` → `'degrade'` "for cleaner display") or omits
userMethod entirely on a desugar's outer Stack ("we don't know what
user method produced it" — they DO know; the case statement is
exactly the spelling). Either failure makes Inspector display in
19-06 lose round-trip fidelity. Detection: round-trip subset test
fails on the alias-distinguished pair.

**Confirmed by:** Phase 19-05 W7 round-trip subset (Late, Pick,
Struct, Stack-from-layer, Stack-from-jux all green); W7 nested
composition (`every(2, x => x.late(0.125))` — both layers preserve
userMethod); D-08 explicit lock in CONTEXT. The Inspector projection
in 19-06 (#76) consumes this invariant directly — without it, the
projection is structurally impossible to make round-trip-clean.

## PV32 — Implicit-IR principle: IR vocabulary stays internal; user-facing surfaces speak the user's language

**ORIGIN:** Phase 19-03 D-02 ("a new tag earns its keep when (i) it
carries a semantic axis no existing primitive has, AND (ii) it is
named after a method the user types") established the principle at
the modeling layer — narrow tags only when forced AND named after a
method the user types, so the Inspector tree row label reads as the
user's code, not as compiler IR jargon. Phase 19-06 (PR #78)
extended the same principle to the presentation layer — render-time
projection translates `userMethod` to user-facing labels so
`.layer(f, g)` shows as `layer` (not `Stack`), `.jux(rev)` shows as
`jux` (not `Stack > FX, FX`), and mini-notation tags render as
source symbols (`~`, `<>`, `?`, `@N`, `*N`, `{}`, `[]`). Two
independent layers (modeling + presentation) consistently applying
the same rule = invariant promotion criteria met.

**Invariant:** The Pattern IR is internal infrastructure. Any
user-facing surface that exposes IR shape (Inspector tree, error
messages with IR-tag references, future bidirectional editing
projections, code synthesis tiers) MUST translate IR vocabulary to
the user's vocabulary by default. IR-shape-as-rendered is permitted
only behind an explicit "developer view" toggle or in code-paths
where the consumer is provably another IR-aware layer (parser,
collect, toStrudel, transform passes).

**Why:** Strudel users author Strudel patterns. They type `.layer(f, g)`,
`.jux(rev)`, `.off(t, f)`. They do not type `Stack` or `FX(pan=-1, ...)`.
Forcing users to learn IR vocabulary to debug their Strudel violates
the layering thesis (project_thesis_v2.md / project_llvm_mlir_lessons.md):
IR is the substrate, but the user-facing view is the source-language
projection. LLVM users don't see SSA when they read C; they see C.
Without this invariant, every IR-shape change risks user-visible churn,
which means IR shape decisions become hostage to UX considerations
(the inverse of the desired layering).

**Span:** Every user-facing surface that consumes IR. In current
codebase:
1. `IRInspectorPanel.tsx` — projects via `irProjection.ts` per 19-06
   D-01..D-06; raw IR available behind `aria-pressed` toggle
   (`localStorage` key `stave:inspector.irMode`)
2. Error messages / friendly errors — current FES code does not
   surface IR vocabulary today; future additions must check this
   invariant
3. Code synthesis tiers (Phase 19-07+) — must emit user-method
   names, not IR-tag names, when reconstructing source from IR
4. Bidirectional editing (Phase 20+) — DAW edits round-trip through
   IR but the editing surface speaks DAW vocabulary, not IR
5. Transform Graph (Phase 20) — node labels speak user vocabulary;
   "show IR shape" reveals the structural decomposition

**Test gate:** Any new user-facing component consuming IR MUST
include a unit test asserting the user-facing rendering uses
user-method labels (or domain-vocabulary equivalents), not raw IR
tag names. The pattern is established by `irProjection.test.ts` in
`packages/app/src/components/__tests__/`.

**Breaks when:** A future surface renders `node.tag` directly without
first checking `userMethod` (or domain-equivalent). Detection
signal: a screenshot or DOM inspection of the surface shows IR-tag
names like `Stack`, `FX`, `Late`, `Choice` in default user view.
Real fix: insert a projection helper at the rendering boundary,
mirroring `projectedLabel` from `irProjection.ts`.

**Confirmed by:** Phase 19-03 D-02 (modeling layer — narrow tags
only when user-named); Phase 19-04 (Tier 4 second half — `Pick`,
`Struct`, `Swing`, `Shuffle`, `Scramble`, `Chop` all named after
user methods; rejected `Rearrange` umbrella tag for Shuffle+Scramble
per D-02 rule even though arms were 90% identical); Phase 19-05
(`userMethod` field populated at every parser site, exact-token
taxonomy preserved per D-08 — PV31); Phase 19-06 (presentation
layer — projection rules consume `userMethod` at render time;
30-row truth-table verified by 53 unit tests + 33 Playwright dual-mode
probes). Two independent applications of the same rule across two
layers, both shipping clean = invariant. Future phases inherit it.


## PV33 — Captured snapshots are immutable post-push (Object.freeze applied at push time)

**Claim:** Once an IRSnapshot enters the `timelineCapture` ring buffer
via `captureSnapshot()`, it MUST be treated as immutable by every
downstream consumer. The buffer applies `Object.freeze(snap)` and
`Object.freeze(snap.passes)` defensively at push time; consumers
(IR Inspector UI, future replay tools) read but never mutate.

**Why:** Pin-by-reference (D-07) means UI state holds a snapshot
REFERENCE for arbitrary durations after capture. If any code path
later mutated the snapshot in place (e.g., to attach derived metadata),
the pinned view would reflect post-pin mutations — breaking the
"frozen at the moment of capture" UX promise. Defense-in-depth: the
freeze catches bugs at the mutation site instead of letting them
silently corrupt the timeline.

**Test gate:** any new consumer of `getCaptureBuffer()` or the
IRSnapshot returned via `subscribeIRSnapshot` MUST treat the snapshot
as `Readonly`. New unit tests adding entries to the buffer and then
attempting in-place mutation should `expect(...).toThrow(TypeError)`
in strict mode or no-op silently in non-strict — both are acceptable
because the freeze is applied via try/catch.

**Breaks when:** a future code path republishes a captured snapshot
after structural mutation, or mutates `snap.passes[*].ir` in place
to attach inspection metadata. Detection signal: pinned IR Inspector
view changes after capture without an explicit unpin/pin cycle.
Real fix: clone-then-mutate (deep copy at the mutation site), never
mutate in place.

**Confirmed by:** Phase 19-08 PR-A (3 unit tests in `timelineCapture.test.ts`:
freeze-snap, freeze-passes, freeze-throw-safe try/catch); Phase 19-08
PR-B (probe (g) — held reference survives FIFO eviction without
data corruption — relies on the snapshot being read-only after capture).


## PV34 — External-store reads must yield a fresh array reference each render

**Claim:** When a React component subscribes to an external mutable
ring buffer (e.g., `timelineCapture`'s internal `entries` array) and
re-derives memoized values from that buffer, the hook MUST return a
FRESH array reference (e.g., via `[...getBuffer()]`) on each render.
Returning the live internal reference defeats `useMemo` because the
dep array sees a stable reference even when the contents have mutated.

**Why:** FIFO eviction (`entries.shift()`) and similar in-place
mutations preserve the array reference but change its length and
contents. A `useMemo([entries, ...])` that derives, say,
`pinnedInBuffer = entries.some(e => e.snapshot === pinnedSnapshot)`
will skip recomputation across an eviction → cached `true` persists
forever after the pinned entry is gone. UX symptom: "ghost marker
never appears."

**Test gate:** any new subscription hook that surfaces an external
mutable collection to React MUST expose its dep-array contract in
the docstring AND have a unit/integration probe that triggers an
in-place mutation (eviction, splice, in-place sort) and asserts a
downstream useMemo recomputes.

**Breaks when:** an author subscribes via `useState`+`subscribe`
pattern but returns `getBuffer()` directly. Detection signal: tests
that depend on derived state crossing a buffer-mutation boundary
fail intermittently or only on full-suite runs (not in isolation).
Real fix: shallow-clone at the boundary (`return [...getBuffer()]`)
OR migrate to `useSyncExternalStore` with an explicit
`getSnapshot()` that returns a stable-but-reference-changing value.

**Confirmed by:** Phase 19-08 PR-B T-15 probe (g) — the ghost marker
was invisible because `useCaptureBuffer` returned the live buffer
reference; downstream `useMemo([entries, pinnedSnapshot])` saw a
referentially stable dep across `entries.shift()` evictions and
skipped recomputation. Fix: `return [...getCaptureBuffer()]`. Cost:
one O(n) copy per render, n ≤ 500. Probe (g) flipped from FAIL to
PASS on the same line of test code.


## PV35 — Audience-classification gate for any "debug / inspect / trace / timeline" feature

**ORIGIN:** Phase 19-08 (Streaming timeline, capture & replay) shipped a
tick-per-eval strip inside the IR Inspector. User reaction at close-out:
"the timeline is not useful — I was hoping for multi-track / DAW / NLA
treatment." The CONTEXT.md inherited the framing "scrub the trace to
see the audible bug in time" verbatim from `IR-DEBUGGER-NORTH-STAR.md`
without classifying whether the audience for that scrub was the **IR
developer** (eval-archaeology, IR correctness across re-evals) or the
**musician** (find the wrong note in time across bars/beats). The
discuss-phase never surfaced the question; the wrong primitive shipped.
This is the second-order failure beneath PV32 (implicit-IR principle):
PV32 says user-facing surfaces hide IR vocabulary, but PV32 alone
doesn't catch features that LEAK IR vocabulary because they were never
classified as user-facing in the first place.

**Invariant:** Before any phase whose name contains `debug`, `inspect`,
`trace`, `timeline`, `playhead`, `scrub`, `breakpoint`, or `replay`
enters discuss-phase, the audience MUST be classified as one of:

- **IR developer surface** — vocabulary is IR-native (snapshot, pass,
  event[], publishIRSnapshot, IRNode). Lives inside the IR Inspector
  panel. Audience is "Mrityunjay debugging IR-pipeline correctness."
  PV32 does not apply (this is the developer console, the one place
  IR vocabulary is allowed).

- **Musician surface** — vocabulary is musical (voice, bar, beat,
  note, sample, region). Lives in the editor surfaces (Code, Viz,
  future DAW, future Studio). Audience is "Mrityunjay-or-anyone
  writing music." PV32 applies in full force; no IR vocabulary may
  appear in chrome, controls, status text, tooltips, or error copy.

The audience classification MUST be recorded in CONTEXT.md as a locked
decision (`D-AUDIENCE: developer | musician`). It governs every
subsequent UX decision — vocabulary, placement, default visibility,
keybindings, what the playhead measures, what J/K-equivalents step
through, what a "tick" represents.

A feature CAN be both, but only by being two surfaces: the same data
layer (capture buffer, scheduler accessor) feeding two distinct UI
components, each PV32-clean for its own audience. Bolting both
audiences onto one component is the trap.

**Why:** Vocabulary leaks when audience is unclassified. The strip in
19-08 calls its data points "ticks" (IR vocabulary — `IRSnapshot.ts` +
buffer index), pins "snapshots" (IR vocabulary), steps "events" (IR
vocabulary). A musician asking "find the wrong note at bar 3 beat 2"
finds none of their vocabulary on the surface and concludes (correctly)
the surface isn't for them. Meanwhile a developer asking "what did the
IR look like 3 evals ago" gets exactly what they need. Two audiences,
one surface, neither served well unless the surface is honestly
positioned as serving one and not the other. PV32 prevents IR
vocabulary from leaking ONTO a musician surface — but only if the
surface was known to be a musician surface at scope time. Audience
classification is the upstream gate that makes PV32 enforceable.

**Test gate:** Every CONTEXT.md for a debug/inspect/trace/timeline/
playhead/scrub/breakpoint/replay phase MUST contain a section titled
`Audience` with one of two labels. Discuss-phase MUST NOT skip this
question. If both audiences are claimed, the phase MUST split into
two surfaces (data layer shared, UI components separate) before
plan-phase begins.

**Breaks when:** A phase inherits its framing from an upstream design
doc whose phrasing reads user-facing but whose mechanics are
developer-facing (or vice versa), and the inheriting phase doesn't
re-classify. Detection signal: at phase close-out, the user says
"this isn't useful for what I expected" while tests pass and goal
sentence is technically satisfied. The framing was satisfied; the
audience-mental-model wasn't.

**Confirmed by:** Phase 19-08 close-out conversation (2026-05-06). User
identified the strip as not-useful for music debugging; tracing back
showed CONTEXT.md never asked the audience question. The phase
satisfied its goal sentence verbatim and still missed the user-need
because the goal sentence itself was audience-ambiguous. Reframe
plan: rename `IRInspectorTimeline` to `IRInspectorEvalHistory`,
collapse-by-default, document audience as developer in CONTEXT;
build the musician timeline as a separate phase with `D-AUDIENCE:
musician` locked at discuss-phase.

**REF:** Phase 19-08 reframe (issue TBD); CONVENTIONS.md §Authoring
contract; PV32 (this is its upstream gate).

## PV36 — Loc-completeness contract: every IR node and every collect-produced event carries source-range provenance, and no transform may strip it

**ORIGIN:** 2026-05-07 disparity-catalog conversation. User narrowed the
project's primary objective to "fully fledged debugger with breakpoints
end-to-end." The standard-practice analog (DWARF / source maps) requires
*every observable instruction* to carry `(file, line, column)` so the
runtime can map any pause-point back to source. Today: `Play.loc` is set
when the parser sees a literal mini atom (parseStrudel.ts:175-188);
non-Play tags get `loc` only via the PRE-01/P39 thread (signature-level —
attribution to the produced node is "deferred" per RESEARCH §2 Subtlety
C); collect arms preserve `loc` for `Play` (collect.ts:247) but not
uniformly for events produced by `Stack`, `Seq`, `Every`, `Late`, `Fast`,
etc. The deferral was acceptable under the editing thesis (where
round-trip parity, not loc, was load-bearing). Under the debugger thesis
it is the single most load-bearing channel: a missing `loc` ANYWHERE in
the chain is a region the debugger cannot point at.

**Invariant:** Every `PatternIR` node in a parsed tree, and every
`IREvent` returned from `collect`, MUST carry a `loc: SourceLocation[]`
(non-empty) that resolves to a contiguous range in the user's source.
Specifically:

1. **Parser-side:** every `applyMethod` arm that constructs a new IR
   node MUST attach `loc` (via `tagMeta(method, callSiteRange)` or
   literal-construction with the same shape — see PK12). Includes the
   `default:` arm once it is fixed (see PV37).
2. **Collect-side:** every collect arm that produces events from a
   tagged child node MUST propagate the parent's `loc` onto produced
   events (or merge with the child's `loc` into a multi-range
   provenance). The `event.loc = ir.loc` pattern at collect.ts:247
   becomes the canonical shape; arms missing it are bugs.
3. **Stripping prohibited:** no transform may remove `loc`. `fast` /
   `every` / `jux` duplicate events → duplicates inherit `loc`.
   `degradeBy` drops events → loc leaves with the events. The contract
   is identical to the existing `Play.loc` rule (PV24), now elevated
   to apply across every tag.
4. **Multi-range when synthetic:** desugars (`layer`, `off`, `chunk`)
   that produce structural nodes from compound source ranges MUST
   carry the call-site range as `loc[0]` and may carry inner argument
   ranges as additional entries. The first entry is the source the
   user clicked when click-to-source resolves.

**Why:** Without this contract, the debugger has dark regions — events
that fire at runtime but cannot be highlighted in the source. Every dark
region is a place a breakpoint can never be set, an inspector chain
can never render, a click-to-source can never resolve. The DWARF-class
debuggers don't model the source language; they require *only* this loc
channel. If we don't enforce it as an invariant, drift is silent: a new
collect arm shipped without loc-propagation degrades the debugger by one
event class with no test failing today.

**How to apply:** When adding any new IR tag or any new `applyMethod`
arm, the loc-attribution review check fires: did this construction call
`tagMeta`? If literal-constructed, does it carry the same `[start, end]`?
When adding any new collect arm, the loc-propagation review check
fires: does the produced event carry `ir.loc` (or the parent chain's
loc when the IR node is synthetic)? Catalogue gap-check (`/anvi:rq`)
on every debugger-adjacent phase: enumerate IR tags vs collect arms vs
loc-attribution coverage; surface uncovered paths before plan-phase.

**Confirmed by:** Phase 19-05 PRE-01 / P39 thread for parser-side loc;
Phase 19-08 reverse-step on the `loc` test in IRInspectorEvalHistory;
2026-05-07 click-to-source slice γ (5 successive fix commits) — every
fix-up was a missing-loc-channel discovery on a different IR shape.

**REF:** parseStrudel.ts:175-188 (Play.loc); parseStrudel.ts:281
(applyChain callSiteRange); collect.ts:247 (Play loc propagation);
artifacts/stave/IR-DEBUGGER-NORTH-STAR.md (read-only debugger contract);
PV24 (Play.loc precedent); PK12 (loc.start convention).

**STATUS: VALIDATED 2026-05-08 (PR #95).** Phase 20-03 landed all three
clauses end-to-end: parser-side via the existing PRE-01/P39 thread plus
W7 outermost-loc audit (zero drift across 26 recognised arms);
collect-side via the new `withWrapperLoc(events, wrapper)` helper at
collect.ts threaded through 20+ collect arms (Seq, Stack, Choice, Every,
Cycle, When, FX, Ramp, Loop, Elongate, Fast, Slow, Late, Degrade, Chunk,
Struct, Swing, Ply, Chop) plus Pick multi-range upgrade and
`_collectRearrange` signature extension for Shuffle/Scramble; stripping
prevention enforced by dev-only `console.warn` at `collect()` boundary
(NODE_ENV-guarded); contract test sweeps 14-fixture corpus + 25 per-shape
probes in `parity.test.ts`. Editor vitest 1274 → 1327 (+53). Click-to-source
reduced from 5-commit regex-fallback cascade to one-line
`countLines(snapshot.code, evt.loc[0].start)` (slice-γ commits reverted).
PR #95 merged into main at `aded68f`.

## PV37 — Unrecognised chain methods MUST wrap as opaque `Code`-with-loc, never silently drop

**ORIGIN:** 2026-05-07 diagnostic of `note("c4 e4").s("sawtooth").release(0.3).viz("pianoroll")`
on user's `pattern.strudel`. `applyMethod`'s `default:` arm at
parseStrudel.ts:729 silently `return ir` for any unrecognised method —
`.s`, `.n`, `.note`, `.bank`, `.scale`, `.release`, `.attack`, `.sustain`,
`.decay`, `.shape`, `.amp`, `.detune`, `.octave`, `.tremolo`, `.lfo`,
`.legato`, `.unison`, `.coarse`, `.fine`, `.add`, `.sub`, `.mul`, `.div`,
`.range`, `.outside`, `.inside`, `.zoom`, `.compress`, and any future
Strudel addition. Effect: the user's typed code silently degrades into
"the IR has no representation of this region." Audio still plays
(Strudel runtime applies the method); the debugger cannot point at it.
For the editing thesis this was a round-trip data-loss bug; for the
debugger thesis it is a more fundamental observability bug.

**Invariant:** Every chain method `applyMethod` does not recognise MUST
wrap the receiving IR in an opaque `Code`-with-loc node that captures
(a) the source range of the entire `.method(args)` call site and (b) a
back-pointer to the inner IR so transformable inner regions remain
inspectable. Specifically:

1. **No silent drop.** The `default:` arm of `applyMethod` may not
   `return ir` unmodified. It must wrap.
2. **Loc preserved verbatim.** The wrapper carries the call-site range
   (the `[start, end]` `applyChain` already computes — parseStrudel.ts:271).
3. **Inner remains inspectable.** The wrapped IR is reachable through
   the `Code` node so the inspector renders the chain history with the
   opaque region marked but the inner Play events still discoverable.
4. **Round-trip honest.** `toStrudel` on the wrapper re-emits the
   original method-call source verbatim; round-trip survives unrecognised
   methods losslessly without modeling them.
5. **Inspector contract:** opaque regions render as `[opaque: .release(0.3)]`
   in chain history with their source range clickable. Breakpoints set
   inside the call site resolve to the wrapper.

**Why:** Without wrapping, the IR's "I don't model this" is
indistinguishable from "this didn't exist." The debugger has no way to
tell the user "you typed `.release(0.3)`; I see it but I can't inspect
inside it." Wrapping preserves the typed source as a first-class
artefact in the IR even when the IR doesn't structurally model the
method's behaviour. This is the MLIR-opaque-op pattern: dialects keep
ops they don't understand; the textual form passes through. It's also
the gdb-on-stripped-libraries pattern: the debugger names the function
even when it can't step inside.

**How to apply:** When auditing `applyMethod`, the `default:` arm is
the gate — it must wrap, never `return ir`. When adding a new method
arm, the question shifts from "is this method important enough to
recognise?" to "would breakpoints set on this method-call's source
range work without recognition?" If the answer is "they should work via
the wrapper alone" — the wrapper is sufficient and the method can stay
in `default:`. If the answer is "we want stepping INSIDE this method"
— add a typed arm. The wrapper makes coverage gradual instead of
all-or-nothing.

**Confirmed by:** 2026-05-07 disparity audit. The categorical answer
about Strudel coverage gaps (~25 chain methods uncovered) collapses
under this invariant: each gap becomes "opaque but visible" instead of
"invisible." The full-coverage roadmap line item shrinks from "model
every Strudel method" to "wrap unrecognised methods + opportunistically
upgrade to typed arms when stepping inside is needed."

**REF:** parseStrudel.ts:729 (silent-drop `default:` arm — bug to fix);
parseStrudel.ts:271 (callSiteRange already computed); collect.ts (Code
walk arm); PV36 (loc-completeness — wrapper supplies loc to otherwise
loc-less regions); P33 (the hetvabhasa entry diagnosing the silent-drop
trap class).

**D-03 expansion (2026-05-07 — phase 20-04 discuss-ratified).** Clause 1
("no silent drop") applies to BOTH `applyMethod`'s `default:` arm AND
every typed arm's parse-failure branch. Each typed arm's `return ir` on
parse failure is a P33 instance; the fix is identical:
`wrapAsOpaque(ir, method, args, callSiteRange)`. ~10 distinct edited
sites in `parseStrudel.ts:303-727` (the 14-arm FX group at line 618
collapses 14 arms into one shared edit). Two intentional NON-wrap sites
preserved: `ply` line 546 (n=1 valid no-op per CONTEXT D-02 from 19-03)
and `p` line 727 (track-assignment pass-through, consumed externally).
Recognised arms keep their typed shape on the success path; failure
branch wraps. Pattern-as-arg gaps in typed arms (e.g. `.fast("<2 3>")`,
`.gain("0.3 0.7")`) become opaque-but-visible instead of silent-drop —
the runtime still applies them via Strudel dispatch; the IR carries
their source range for the debugger. P33 trap class fully eliminated
once 20-04 lands.

**D-06 (2026-05-07) — Double-wrap is allowed.** Chain `.foo(1).bar(2)`
where neither method is recognised produces nested wrappers — the second
method's wrapper carries the first's wrapper as `via.inner`. This is
correct behaviour, not a bug. Round-trip works (each wrapper re-emits
its own `.method(args)`); inspector renders nested opacity; collect's
recursion in the `Code-with-via` arm naturally appends each wrapper's
range innermost-first. No special handling required. Considered for
elevation to its own vyapti and rejected — too narrow a property to
warrant its own number.

**Wrapper construction shape (locked at 20-04 plan-phase):**
- New free function `wrapAsOpaque(inner, method, args, callSiteRange)`
  in `parseStrudel.ts` (NOT an `IR.code` overload — IR.code is called
  from 8+ parse-failure sites that never carry `via`).
- `via.inner` is REQUIRED at the type level (not optional). Every
  wrapper has a receiver.
- `via.args` is a RAW string (whitespace preserved) for round-trip
  byte-fidelity. `toStrudel` emits `${gen(via.inner)}.${via.method}(${via.args})`.
- `code: ''` on wrapper path is structurally sufficient; `toStrudel`
  branches on `via` and never reads the empty `code`.
- `userMethod` field intentionally NOT used on wrappers — it carries
  PV31 co-tag-alias semantics (Stack-from-layer ≠ Stack-from-jux) which
  the wrapper is structurally distinct from.

**STATUS: VALIDATED 2026-05-08 (PR #96).** Phase 20-04 landed all five
invariant clauses + the D-03 expansion + D-06 double-wrap + wrapper
construction shape locks. 24 wrap call sites in `parseStrudel.ts`
(default arm + 23 typed-arm failure branches; FX 14-arm group collapsed
to one shared edit). Two intentional non-wrap sites preserved with
inline comments: `ply(n=1)` no-op (parseStrudel.ts:546) and `p`
track-assignment passthrough (parseStrudel.ts:727). Consumer wiring
landed atomically across `collect.ts` (Code arm walks via.inner via
`withWrapperLoc` from PV36), `toStrudel.ts` (re-emits
`${gen(via.inner)}.${via.method}(${via.args})` byte-equivalent),
`serialize.ts:220-223` (validator block carries `via` through round-trip
— closes the silent-strip regression site documented in 20-04 RESEARCH §0).
Inspector chrome split: developer surface renders `[opaque: .release(0.3)]`
chip with tree expansion via new pure-helper module
`packages/app/src/components/IRInspectorChrome.ts`; musician surface
renders `[unmodelled]` (label-only — no method name leak per PV32).
24-fixture full corpus contract test in `parity.test.ts`. Editor vitest
1327 → 1369 (+42); App vitest 154 → 166 (+12). P33 silent-drop trap
class fully ELIMINATED. PR #96 merged into main at `aded68f`.

**Phase 20-10 (2026-05-09) — sibling layer codified.** PV37 governs
REPRESENTATION completeness (every typed character lands in IR — opaque
wrapper + raw source range). PV39 (added Phase 20-10) governs SEMANTICS
completeness (every param-bearing chain method's effect lands on
downstream events — typed `Param` IR tag + collect-time merge into
ctx.params + body-event spread). Two layers, same span, sibling
invariants. Removing either reopens its layer's silent-drop class. PV37
unchanged.

**Phase 20-11 (2026-05-09) — track-identity layer codified.** PV37 governs
REPRESENTATION (every typed character lands in IR; Code-with-via fallback
for unknowns). PV40 (added Phase 20-11) governs IDENTITY (every `$:` /
`.p()` track has a parser-assigned trackId on its events). The Track
wrapper applies the PV37 model to the `$:` boundary — wraps the source
range, round-trips through serialize, never drops. PV37 + 20-10's PV39
(semantics) + PV40 (track identity) form a three-layer span:
representation, semantics, identity. Removing any reopens its layer's
silent-drop class. PV37 unchanged.

**Phase 20-12 (2026-05-10) — `freq` Param promotion preserves PV37.** D-06
extended the SEMANTICS whitelist (PV39's typed-arm set) by adding `freq` to
the `note`/`n` numeric-coercion family at `parseStrudel.ts:839-848`. The
PV37 fallback path is unchanged: numeric `.freq(440)` lands as a typed
`Param` (PV39 SEMANTICS path); non-numeric `.freq("<200 800>")` falls
through to `wrapAsOpaque` (PV37 REPRESENTATION path). SINGLE decision per
call site (P50 — no compound discriminator added; the typed-arm parse-
failure branch already wraps per the D-03 expansion above). PV37 model
intact across the 20-10 → 20-12 axis-extension; the chrome's channel-4
(bar Y = pitch via `extractPitch(evt.params.freq)`) reads only when the
runtime delivers a numeric value, so the opaque path stays Y-flat (correct
per PV41 percussive-leaf default).

## PV38 — Every observable runtime hap maps to an IR-node identity (engine ↔ IR identity channel)

**ORIGIN:** 2026-05-07 debugger-architecture conversation. Today
StrudelEditorClient.tsx:357 publishes a static IR snapshot from
`collect(parseStrudel(code))`; StrudelEngine.ts:368 emits runtime haps
from `pattern.queryArc()` via `normalizeStrudelHap`. These are two
parallel pipelines that never reconcile. For breakpoints to work, when
a hap fires, the engine must answer "which IR node produced this?" —
otherwise the inspector cannot render the chain, the editor cannot
highlight, and the scheduler cannot match a breakpoint condition to a
specific source range.

**Invariant:** Every NormalizedHap that StrudelEngine emits MUST carry
either (a) a stable `irNodeId` referencing the IR node that produced
it, or (b) sufficient `(time, value, loc)` for a deterministic
hap→IRNode lookup against the published snapshot. The chosen mechanism
must be byte-stable across `query()` calls within a snapshot's
lifetime: querying the same arc twice produces haps with the same
`irNodeId`s. Specifically:

1. **ID source:** at `collect`-time, every produced `IREvent` is
   assigned an `irNodeId` (stable hash of `loc` + position-in-output,
   or sequential index — TBD at plan time). The IRSnapshot exports a
   lookup table `id → IREvent`.
2. **Engine-side carry:** `normalizeStrudelHap` enriches each hap with
   the matching `irNodeId` by structural lookup against the snapshot
   (matching by hap.context.locations + hap.whole.begin). When
   no match is found (hap from a runtime-only path), the hap is
   tagged with `irNodeId` absent (the type field is `irNodeId?`) and
   the inspector renders it as "runtime only" (the same opaque-but-visible
   treatment PV37 gives source regions the parser doesn't model).
3. **Inspector contract:** clicking a hap in the timeline / piano roll
   resolves through `irNodeId → IREvent → loc → source range`.
   Breakpoints register conditions over `irNodeId` (or over loc, with
   the snapshot translating loc → set of `irNodeId`s).
4. **Runtime safety:** the channel is observation-only. Adding it does
   not modify scheduling, audio routing, or hap value semantics.
   Identity comes from `loc` already on the IR, not from a new mutation.

**Why:** A breakpoint debugger is fundamentally "stop when a specific
*program point* is reached." In our world, the program point is an IR
node; the runtime executes via Strudel's PatternScheduler which emits
haps. Without an identity channel between hap and IR node, the
breakpoint condition language collapses to "stop at time t" or
"stop on a hap whose value matches X" — neither is a *source-level*
breakpoint. The DWARF analog: every emitted CPU instruction has
`(addr → file:line)`. Our analog: every emitted hap has
`(hap → IR node → file:line)`.

**How to apply:** At engine-IR boundary review time (any change to
NormalizedHap, IREvent, IRSnapshot, or PatternScheduler emission),
the question fires: does the hap-to-IR-node mapping still hold? When
adding a new IR tag whose collect arm produces events with novel
shape, the audit fires: do the produced events carry irNodeId? When
adding a runtime feature that produces haps outside the IR (e.g.
direct Strudel patterns not routed through our parser), the
"runtime-only" tag is the explicit acknowledgement, surfaced in the
inspector.

**Confirmed by:** 2026-05-07 categorical analysis of debugger
requirements. This is the single property all source-level debuggers
share: gdb (CPU addr → DWARF), Chrome DevTools (V8 stack frame →
sourcemap), MSVC (IL offset → PDB). Without it, no breakpoint debugger
exists.

**Path correction (2026-05-08, phase 20-05):** earlier drafts of clause
2 cited `hap.value.context.locations` — the actual Strudel API is
`hap.context.locations` (`@strudel/core/hap.mjs:25-29` constructs context
as a top-level Hap field, NOT inside `value`). Verified at three
points: our `extractLoc` at NormalizedHap.ts:38-53; the test fixture
at NormalizedHap.test.ts:80; and Strudel's `withLoc` at
`@strudel/core/pattern.mjs:558-568`. PV38 clause 2 corrected in
the same PR that lands the engine-side carry (phase 20-05 wave γ).

**REF:** StrudelEngine.ts:368 (normalizeStrudelHap call site, the
boundary that grows the channel); engine/NormalizedHap.ts (where
irNodeId would land); engine/irInspector.ts:51 (publishIRSnapshot —
where lookup table joins the snapshot); engine/timelineCapture.ts
(reverse-step / scrub already buffers snapshots; needs hap-id wiring);
PV36 (loc-completeness — the source-range half of this channel);
PV37 (opaque wrapper — defines what runtime-only haps look like in
the inspector).

**VALIDATED (2026-05-08):** All 4 clauses enforced end-to-end across
debugger v2 sub-phases:
- Clause 1 (id source at collect): phase 20-05 PR #102 — `assignNodeId`
  at Play leaf in collect.ts:160, FNV-1a content-hash of
  `${loc.start}:${loc.end}:${tag}:${position}`. Wrapper arms preserve
  via existing `{...e, ...}` spread (DEC-NEW-1 leaf-only assignment).
- Clause 2 (engine-side carry): phase 20-05 PR #102 wave γ
  (queryArc boundary via `normalizeStrudelHap` + `findMatchedEvent`)
  + phase 20-06 PR #103 wave α (onTrigger boundary via
  `HapStream.emit` enrichment). Both consume the same single-strategy
  `findMatchedEvent` (loc[0] key + whole.begin tie-break; miss →
  `irNodeId` absent per PV37 alignment; NO fallback ladder per P50).
- Clause 3 (inspector contract): phase 20-06 PR #103 wave β
  (MusicalTimeline rewrite) + phase 20-07 PR #104 wave γ (Inspector
  chain-row click + breakpoint marker). `IRSnapshot.irNodeIdLookup` +
  `irNodeLocLookup` + `irNodeIdsByLine` (added 20-07 α0) compose the
  lookup surface.
- Clause 4 (observation-only safety): all 3 sub-phases preserve. The
  hit-check in `wrappedOutput` (StrudelEngine.ts:219) skips audio
  dispatch on pause but does not mutate hap value semantics.

## PV39 — Param-bearing chain methods MUST inject their effect into ctx.params before projection reads it (semantics-completeness pair-of PV37)

**Status:** ENFORCED 2026-05-09 (Phase 20-10).

**ORIGIN:** Issue #108 — user pasted a multi-voice fixture with
`note(...).s("sawtooth")`, `s("hh*8")`, etc. The MusicalTimeline rendered
all events on a single `$default` track because chained `.s(...)` calls
landed in the IR via `wrapAsOpaque` (PV37 — representation honest) but
never wrote their effect into ctx.params. `collect.makeEvent` saw
`evt.s = null`; `groupEventsByTrack`'s `evt.s ?? '$default'` fallback
collapsed three distinct synth voices and four drum stems into one
bucket. PV37 closed the REPRESENTATION layer in 20-04 (no silent-drop);
this phase closes the SEMANTICS sibling.

**Invariant:** Every param-bearing chain method (the 10-method whitelist
below) MUST construct a typed semantic IR tag (`Param`) at the parser
arm, AND MUST merge its effect into ctx.params at the collect arm before
walking the body. Specifically:

1. **Parser arm.** `applyMethod`'s switch in `parseStrudel.ts` has a
   typed `Param` arm for the 10 whitelisted methods. The arm reads the
   raw arg string, constructs `IR.param({ key, value, rawArgs, body,
   loc, userMethod })`, and short-circuits BEFORE `wrapAsOpaque`. Methods
   outside the whitelist still fall through to `default:` and wrap as
   `Code-with-via` — PV37 unchanged.
2. **Whitelist (Phase 20-10 starter set):** `s`, `n`, `note`, `gain`,
   `velocity`, `color`, `pan`, `speed`, `bank`, `scale`. Expandable —
   the next param phase adds `release/attack/sustain/decay/crush/distort/
   shape/amp/detune/octave/tremolo/lfo/legato/unison/coarse/fine`.
3. **Collect arm.** `collect.ts` `case 'Param':` merges `value` into a
   per-event slot table (literal arg → constant; pattern-arg → walk
   sub-IR once, find slot covering body event's begin time). Body event
   gets the slot value spread into `params: { ...e.params, [key]: v }`
   AND, for the four shorthand keys (`s`, `gain`, `velocity`, `color`),
   spread into the top-level event field per `makeEvent`'s destructure.
4. **Body-event spread preserves PV36 + PV38.** The Param walk
   re-emits body events with `loc` and `irNodeId` intact (they come from
   the body sub-IR's Play leaf, not from the Param wrapper's call site).
   Slot events are NOT included in the output — the sub-IR is a VALUE
   PROVIDER, not an event producer.
5. **D-05 last-typed-wins.** When two `.<key>(...)` calls chain
   (`.gain(0.3).gain(0.7)`), the OUTER call's value overwrites the inner
   on the merge step. Locked empirically by α-1 probe vs Strudel runtime;
   pinned in `parity.test.ts` describe `'20-10 wave γ — Param-shadow
   merge direction parity'`.

**Span:** parser arm in `parseStrudel.ts:applyMethod` (typed `Param`
case before `default:`/`wrapAsOpaque`); collect arm in `collect.ts:case
'Param':` (merge into ctx.params before walking body). Both must change
together; partial change reopens the silent-drop class for the affected
keys.

**Pair-of:** PV37 (representation completeness — opaque-wrap covers
typed characters but discards effect). Same span, sibling layer.
Removing PV39 reopens semantics-silent-drop (P52); removing PV37
reopens representation-silent-drop (P33).

**Catcher:**
- `parity.test.ts` "20-10 wave α — issue #108 regression" — asserts
  `evt.s` populated for every chained `.s` invocation in the user
  fixture (root-cause assertion).
- `parity.test.ts` "20-10 wave γ — Param-shadow merge direction parity"
  — pins D-05 vs Strudel runtime for both numeric and string keys.
- `integration.test.ts` "20-10 wave γ — Param sub-IR slot-table
  semantics" — 11-test corpus pinning event-count, per-cycle alternation,
  silence handling, numeric coercion, body-atom loc, last-typed-wins
  shadow, PV37 preservation, sub-IR-spread loc/irNodeId survival
  (PV36+PV38), and pattern-arg atom loc inside mini-string (PV25).

**Wrong fix (P52 trap):** "Read `via.method` and `via.args` in
`collect.ts case 'Code'`." This couples the opaque wrapper to method-
specific semantics; turns PV37's clean fallback into a switch over
method names; does NOT generalize when the method's argument shape needs
structural introspection (e.g. pattern-args). The right fix is to
PROMOTE the method to a typed semantic IR tag (Param) at the parser arm
— representation honesty (PV37) + effect honesty (PV39) = full
observation completeness.

**REF:** `.planning/phases/20-musician-timeline/20-10-PLAN.md` §0;
`packages/editor/src/ir/parseStrudel.ts:applyMethod` typed Param arm;
`packages/editor/src/ir/collect.ts:case 'Param':` (lines 347-417);
`packages/editor/src/ir/PatternIR.ts` Param tag + IR.param constructor.

**Phase 20-10 (2026-05-09).** Wave α landed Param IR tag + parser arm
+ collect arm + α-6 regression test (issue #108 fixture). Wave β
landed toStrudel + serialize + Inspector chrome (developer / musician
projection split). Wave γ landed nested-pattern-arg corpus + Strudel
runtime parity + catalogue codification + manual γ-4 gate. P52 trap
class introduced. Closes #108 at the IR-collect level; γ-4 manual gate
verifies user-visible render.

## PV40 — Track identity is parser-assigned, never inferred from event content

**Status:** ENFORCED 2026-05-09 (Phase 20-11).

**ORIGIN:** Phase 20-08 / γ-4 manual gate session — duplicate `$:` blocks
collapse into a single timeline row. Two `$: stack(s("hh*8")...)` blocks
producing events with identical `evt.s = 'hh'` were bucketed together by
`groupEventsByTrack`'s 3-level fallback `evt.trackId ?? evt.s ?? '$default'`
because `evt.trackId` was undefined for parser-derived events. The user's
authored intent (two distinct tracks) was lost at the consumer because the
parser never asserted it. CONTEXT §0 (`20-11-CONTEXT.md`).

**Invariant:** Track identity (the `trackId` on every `IREvent`) MUST come
from the parser via the `Track` wrapper IR tag, set at `parseStrudel.ts`
from the `$:` block index (auto-numbered `d{N}`) or the `.p("name")`
argument. Downstream consumers MUST NOT infer track identity from event
content (`evt.s`, `evt.note`, etc.) — those are FALLBACK keys when the
parser-assigned `trackId` is absent (hand-built IR fixtures only).

**Span:** parser at `parseStrudel.ts:97-130` (`extractTracks`-loop wraps
each `$:` track with `Track('d{N}', ..., {loc: $: range})`; non-`$:` files
get a synthetic `Track('d1', ..., {loc: undefined, userMethod: undefined})`;
the `case 'p':` arm wraps with explicit `Track('name', ..., userMethod:
'p')`); collect at `collect.ts` (`case 'Track'` spreads `ctx.trackId`;
`makeEvent` reads it via conditional spread); presentation at
`MusicalTimeline.tsx` + `groupEventsByTrack.ts` (read `evt.trackId` first;
sample-fallback only fires for hand-built fixtures).

**Catcher:** `parity.test.ts` describe block `"20-11 wave γ — duplicate-$:
regression (closes 20-08-residual / CONTEXT §0)"` (γ-6 — 7 tests pinning
root cause + symptom + .p() override + nested .p() inner-wins +
synthetic-d1 + .p()-on-stack-arg + two-$: with shared .p()-name merge).
Plus app-side `groupEventsByTrack.test.ts` describe `"20-11 — duplicate
$: blocks no longer collapse"` (γ-6 PART B — 3 tests pinning consumer-
side bucket distinction).

**Pair-of:** PV37 (wrap-never-drop, REPRESENTATION) + PV39 (SEMANTICS) —
same span, sibling layer. PV37 closed REPRESENTATION for unrecognised
methods; PV39 closed SEMANTICS for param-bearing methods; PV40 closes
IDENTITY for `$:` blocks and `.p()`. Three layers, same span: removing
any reopens its layer's silent-drop class.

**REF:** `.planning/phases/20-musician-timeline/20-11-PLAN.md` §3-§5;
`case 'Track'` arm in `collect.ts`; `parseStrudel.ts:97-130` main path;
`toStrudel.ts:24-35` Track gen arm.

## PV41 — Bar visual identity is a 5-channel contract; bars carry NO text labels

**Status:** ENFORCED 2026-05-10 (Phase 20-12).

**ORIGIN:** Phase 20-11 design debate — reviewers reflexively asked "how does the user know which sample plays at this bar?" The naive answer ("label the bar with `evt.s`") works for a single bar-wide selection but fails for the steady-state view where 1/16 cells are ~30px wide and ~12px tall. The lock came out of `20-11-DESIGN-DEBATE.md` ("no bar labels EVER") and the 5-channel substitute was specified in `20-12-CONTEXT.md` D-01..D-05.

**Invariant:** Every event-bearing visual surface in the chrome carries identity through exactly five channels. No channel is optional; no sixth channel (especially not on-bar text labels) may be added without retiring this invariant.

**The five channels:**
1. **Row header rail** — chevron + track name + swatch dot (per-track identity).
2. **Row color** — track palette slot OR user override via swatch popover; persisted in `trackMeta` Y.Map (`evt.color ?? meta.color ?? paletteForTrack(...)` precedence).
3. **Bar opacity** — `clamp(evt.gain ?? 1, 0.15, 1)` (gain semantically dominates; floor 0.15 keeps `gain(0)` bars visually present per RESEARCH §G.3).
4. **Bar Y position** — auto-fit pitch from `evt.note ⊕ evt.params.note ⊕ evt.params.n ⊕ evt.params.freq` for melodic leaves; flat baseline for percussive leaves; flat baseline for collapsed rows.
5. **Hover tooltip** — full chain summary via native `title=` attribute (pointer-events: none, screen-reader friendly, zero CSS cost).

**Span:** `MusicalTimeline.tsx` event render (β-3 opacity, β-4 Y-as-pitch, β-5 tooltip), `TrackHeaderRow` (β-1 chevron + swatch + name), `TrackSwatchPopover` (β-6 commit). Future event-bearing surfaces (piano-roll lane, automation lane, structure view from 20-13) inherit this contract.

**Catcher:**
- `MusicalTimeline.test.tsx` `"20-12 β-3 — bar opacity = clamp(gain, 0.15, 1)"` (4 cases — channel 3).
- `MusicalTimeline.test.tsx` `"20-12 β-5 — hover tooltip extension"` (4 cases — channel 5; PV32 vocabulary lock cross-check).
- `MusicalTimeline.test.tsx` `"20-12 β-1 — track header rail"` (3 cases — channel 1).
- `MusicalTimeline.test.tsx` `"20-12 γ-2 — color persistence"` (4 cases — channel 2 + 3-source precedence).
- `pitch.test.ts` (29 cases) covers the channel-4 input lattice (`note` string / midi / `n` / `freq` Hz).
- Manual gate `20-12-MANUAL-GATE.md` visual checks #1, #6, #8, #11 cover the perception-side gate (a label appearing on any bar is a BLOCKS-PR violation).

**Pair-of:** P54 (label-trap-at-typical-zoom) — names the trap that violating PV41 lands in. PV35 (musician-vocabulary discipline) — same audience target; PV41 is the visual-substrate sibling of PV35's textual discipline. PV40 (parser-assigned identity) — provides channel-1's `trackId` source.

**REF:** `.planning/phases/20-musician-timeline/20-12-CONTEXT.md` §3 D-01..D-05; `20-12-RESEARCH.md` §C.5 + §G.3; `20-11-DESIGN-DEBATE.md` "no bar labels EVER" lock; `MusicalTimeline.tsx:868-874` (channel-2 precedence chain); `MusicalTimeline.tsx:812-815` (channel-3 clamp); `MusicalTimeline.tsx:822-853` (channel-4 pitch-to-Y); `MusicalTimeline.tsx:859` (channel-5 native title).

## PV42 — Events span the same cycle window the chrome displays

**Statement.** When the chrome shows a fixed cycle window of length N, the IR-projection events fed to it must span the same `[0, N)` cycle range — not `[0, 1)`. Otherwise the right edge of the timeline is permanently empty for static viz, and any chrome-side identity match against runtime hap events drifts past the first window pass.

**Scope.** Every consumer of `IRSnapshot.events` that maps event begin → x via a window of length N must agree with the producer about N. Concretely: `MusicalTimeline.tsx`'s `WINDOW_CYCLES = 2` (timeAxis.ts) and the `StrudelEditorClient.tsx` `collectCycles(finalIR, 0, TIMELINE_WINDOW_CYCLES)` call must use the same constant. App and editor packages can't import each other; the constant is duplicated with a synced-comment.

**Type.** STRUCTURAL — about the contract between event producer (engine) and event consumer (chrome). A misalignment doesn't fail the pipeline; it produces a silently-broken UX (empty cycle column, dead highlighting after wrap).

**Implication for design.** Any new chrome view that displays multiple cycles must:
1. Decide its own window length N.
2. Either use `collectCycles(ir, 0, N)` at its data source, or fold incoming events modulo N at the consumption point.
3. Document the N-coupling at both sites with a cross-reference comment.

If a future feature wants a scrollable-multi-cycle timeline (e.g., 20-13 structure-view), N becomes dynamic and the constant duplication breaks. At that point N becomes a parameter passed from chrome to data layer (a hook accepting `windowCycles`, or a coordinator that owns the constant).

**Pair-of:** P57 (window-vs-monotonic identity matching) — P57 names the trap when the consumer fails to adapt to the monotonic-runtime convention; PV42 is the contract that defines what the consumer's window IS.

**Breaks when:**
- Engine collects only `[0, 1)` while chrome displays `[0, 2)` → cycle 1 column empty (Phase 20-12 pre-hotfix).
- Engine collects `[0, 4)` while chrome displays `[0, 2)` → cycle 2-3 events render off-screen and are wasted.
- Chrome compares hap-begin (∈ [0, ∞)) to event-begin (∈ [0, N)) without modulo → P57 triggers.

**Origin.** Codified Phase 20-12 hotfix wave (2026-05-10) when `IRSnapshot.events` switched from single-cycle to multi-cycle. Required by the angle-bracket alternation pattern `<a b c d>` whose per-cycle shape was invisible in single-cycle collection.

**REF:** `MusicalTimeline.tsx:56` (WINDOW_CYCLES import); `musicalTimeline/timeAxis.ts:29` (constant definition); `StrudelEditorClient.tsx:380-388` (TIMELINE_WINDOW_CYCLES use); commit `af7b6e5`.

## PV43 — Chrome surfaces must adopt the global theme tokens (no mockup-literal opt-out)

**Statement.** Every chrome surface — every panel, modal, popover, timeline, inspector, and inline overlay — must derive every color from the project's CSS-variable theme tokens (`--bg-app`, `--text-primary`, `--border-subtle`, etc.). A surface that hardcodes mockup-literal colors silently breaks light mode, system mode, and any future theme variant. Inline-styles MAY include the mockup value as a `var(--token, FALLBACK)` fallback for isolated mounts (storybook, unit tests without globals.css), but the token MUST come first.

**Scope.** All `.tsx` files under `packages/app/src/components/` whose render output ships color, background, border, or shadow declarations. Includes JSX `style={{...}}` literals AND any `styles` constant object. Excludes:
- Per-event computed colors (palette + custom-pick) — those are SEMANTIC color (track identity), not chrome-color.
- Boolean-state outlines that intentionally use accent tokens (active-note, focus rings).
- Embedded canvas/SVG painted by p5/Hydra — those are user-content, not chrome.

**Type.** STRUCTURAL — about the contract between component implementations and the theme system. Theme switches at runtime via `setEditorTheme`; surfaces that opted out of the theme remain dark-mode-locked and become invisible in light mode.

**Implication for design.** Any new chrome component:
1. Imports its colors via `var(--token, fallback)` form, not literal hex/rgba.
2. Picks tokens from globals.css (`.anvi/` audit if uncertain which token applies — chrome and panel and elevated all serve different roles).
3. Carries the original mockup value as the `var()` fallback ONLY if needed for isolated rendering; otherwise omit.

**Pair-of:** P54 (label-trap-at-typical-zoom) — same family of "self-contained visual unit" traps where the implementer thought their surface was an island. PV41 (5-channel identity contract) — channels 1-5 reference the theme tokens for color where applicable; PV43 is the substrate PV41 stands on.

**Breaks when:**
- A new chrome panel ships with `background: '#0d0d1a'` instead of `var(--bg-chrome)` → invisible in light mode.
- A modal hardcodes `color: 'white'` (or `rgba(255,255,255,...)` without a `var()` wrap) → dark-on-white in light mode.
- A popover's border color uses a fixed hex not in the token map → visible only in dark mode.

**Origin.** Codified Phase 20-12 wave-δ (2026-05-10) when MusicalTimeline.tsx's "no external theme dependency — the tab is a self-contained visual unit" comment (added Phase 20-02 DV-08) was discovered to make the entire timeline invisible in light mode. The original opt-out was justified at the time by the mockup being dark-only; theme support landed in PR #92 across the rest of the IDE without round-tripping back to the timeline.

**Audit discipline (Phase 20-12 wave-ε refinement, 2026-05-11).** The PV43 audit MUST enumerate every component rendered inside the panel tree, not just the entry-point file. Wave-δ converted `MusicalTimeline.tsx` but missed `Ruler.tsx` (a sibling component rendered inside the same tab). Manual gate Check #17 caught it: the body adopted the theme but the ruler stayed dark — a dark island above a light timeline. Wave-ε ε-1 closed the gap. Generalisation: when codifying a "all chrome surfaces must X" invariant, the catcher list must include the recursive surface enumeration, NOT just the surface where the invariant was first noticed.

**REF:** `MusicalTimeline.tsx:1021-1024` (post-fix theme-aware comment, wave-δ); `Ruler.tsx:148-217` (post-fix sibling, wave-ε); `globals.css:11-101` (token definitions for both modes); `EditorSettingsModal.tsx:148` (canonical pattern: `background: 'var(--bg-overlay)'`); commits `c1c5e4b`, `3540a9e`.

---

## PV44 — Chain methods with runtime-dependent semantics need live-canvas regression, not IR-only tests

**Claim:** Any IR tag whose behavior depends on the host runtime's interpretation of the source (Strudel's transpiler + eval, not just our parser's view of the AST) MUST have at least one live-canvas regression test — Playwright against the dev server — in addition to IR-level unit tests. IR tests are blind to the transpiler stage.

**Why:** Phase 20-11 wave-γ shipped a `Track` IR tag + `.p()` parser arm + 17 IR-level unit tests covering parse / collect / toStrudel / round-trip. Every test passed. Wave-δ booted the dev server and `.p("kick")` immediately crashed with `TypeError: k.includes is not a function`. The IR side handled the source correctly; Strudel's transpiler rewrote `"kick"` to `mini("kick")` (a Pattern) BEFORE the runtime saw it. The IR tests had no visibility into that rewrite. Only the live canvas exposed the gap.

**Confirmed by:** Wave-δ γ-7 gate run (2026-05-12). The bug was structurally invisible to unit tests; Playwright caught it on first run.

**Test gate:** For every chain-method IR tag whose argument is a string OR can be transformed by Strudel's transpiler:
1. Unit test the parser arm + collect arm + toStrudel arm (existing γ practice).
2. ADD a Playwright spec that pastes the canonical user fixture into the live editor, evaluates it, and asserts the rendered DOM matches expectation.
3. Capture `consoleErrors` and `pageerror` events. Any `TypeError` from the external runtime is a P62 candidate; investigate before merging.

**Breaks when:** A new chain method ships with full IR test coverage but no Playwright probe, and the method's argument shape interacts with Strudel's transpiler (string literals, label statements, mini-notation, backticks, etc.). Crash or silent-drop surfaces in user reports, not CI.

**REF:** Wave-δ summary `20-11-WAVE-δ-SUMMARY.md` "Why the wave finished green" §5; Playwright spec `packages/app/tests/wave-delta-gate.spec.ts`.

---

## PV45 — Yjs read paths are doc-write-free during React render

**Claim:** Any Yjs sub-store accessor (`getX`, `subscribeToX`, `useX`) called from a React render or from a `useSyncExternalStore.getSnapshot` / `subscribe` callback MUST be doc-write-free. Lazy sub-store creation lives on the WRITE path only. Readers return a shared frozen sentinel when the sub-store doesn't exist yet.

**Why:** A Y.Doc write during render triggers `observeDeep` callbacks; those callbacks fire `useSyncExternalStore` subscribers; subscribers re-evaluate `getSnapshot` (which might write again) and call `setState` on OTHER components mid-render of the originating component. React warns `Cannot update a component while rendering a different component`. In future React versions this becomes a hard error. Phase 20-11 wave-δ surfaced this via Playwright when MusicalTimeline → `getTrackMeta` → `ensureTrackMetaMap` wrote to the doc on first call per file.

**Confirmed by:** F-4 fix commit `2ef4697` (2026-05-13). Splitting `ensureTrackMetaMap` into `getTrackMetaMap` (read-only) + `ensureTrackMetaMap` (write-allowed) eliminated the warning across all 5 Playwright wave-δ fixtures.

**Test gate:** For every new `getX` / `subscribeToX` helper that accesses a lazily-created sub-store:
1. Code review the body — does it call `parentMap.set(...)` on any branch? If yes, the path is write-capable and unsafe for render.
2. Document the read-only contract in the function's JSDoc (`SAFE during React render`).
3. Pair with an `ensureX` helper for the write path; route writers through it.
4. The frozen sentinel returned for "doesn't exist yet" must be ref-stable across calls (allocating `{}` each read tears StrictMode).

**Breaks when:** A new sub-store is added (e.g. `Y.Map<unknown>` keyed by some id) and the access helper lazily allocates on first read. Symptom: React warning on first cold-load of any file with the new sub-store. Won't show on subsequent renders (the map exists by then) — easy to dismiss as flaky if the dev never boots clean.

**REF:** P63 (hetvabhasa) for the failure-mode catalogue; `WorkspaceFile.ts` `getTrackMetaMap` vs `ensureTrackMetaMap` split.

---

## PV46 — Transport-state accessors MUST gate on the engine's own play/stop state

**Invariant:** any accessor exposed to React/UI for a "current playhead /
cycle / time" value must short-circuit to `null` (or whatever the "no live
transport" sentinel is) when the underlying engine reports
`isPlayingState === false`. The accessor reads through to scheduler state
only after that gate.

**Why this matters:** consumers downstream wire transport-state edges
(`null → number` = play start, `number → null` = stop). A scheduler that
retains its last `.now()` value across stop (most engines do — Strudel's
`@strudel/core` is one) breaks the edge entirely unless the accessor
explicitly returns `null` on the stopped state.

**Where it lives:** `packages/editor/src/workspace/runtime/LiveCodingRuntime.ts`
`getCurrentCycle()` (and any sibling accessor that adds in the future). The
gate is one `if (!this.isPlayingState) return null` at the top of the method.

**Breaks when:** a new engine class is added without copying the gate;
a new scheduler-state accessor is exposed without the gate; a refactor
"simplifies" the gate away because the inner `Number.isFinite` looked
sufficient.

**Pre-mortem signal:** "edge feature works in jsdom (test sets state
directly) but fails in browser" → suspect a missing engine-state gate.

**REF:** P65 (hetvabhasa) for the failure mode; Phase 20-12.1 follow-up
commit `667615d` for the fix; `LiveCodingRuntime.ts:641-650` for the
current implementation.

---

## PV47 — Timeline slot identity is source-anchored, NOT display-derived

**Invariant:** the MusicalTimeline slot map's KEY is anchored to a
property of the source code that doesn't change when the user renames /
relabels the row (`.p()` argument, color, collapsed flag, etc.). The
display label is read from a separate field at render time and may
freely change.

The canonical anchor is `dollarPos` — the source character offset of
the outermost `$:` Track wrapper. This offset is stable across:
- Adding/removing `.p("name")` on the same line (only the body changes;
  `$:` stays where it is).
- Editing the body's expression (the `$:` token doesn't move; the
  trailing content can change arbitrarily).
- Commenting/uncommenting via the parser's empty-Track path (the line
  itself stays in source; the `$:` token re-emerges at the same offset).

**Why this matters:** before this invariant, the slot map was keyed by
event `trackId`, which flips to the user's `.p()` name (inner-wins).
Renaming a row → new trackId → new slot at the bottom → user sees their
row "move". The user's mental model is "rename keeps position"; the slot
map must enforce that.

**Where it lives:**
- Event field: `IREvent.dollarPos` (`packages/editor/src/ir/IREvent.ts`).
- Threading: `collect.ts` Track arm — `dollarPos: ctx.dollarPos ?? ir.loc?.[0]?.start`
  (OUTER-WINS, distinct from `trackId` which is inner-wins).
- Slot derivation: `MusicalTimeline.tsx` `groupSlotKey()` and
  `collectTopLevelSlots()` — `slotKey = "$" + dollarPos` if defined,
  else fall back to trackId for hand-built/non-`$:` fixtures.

**Breaks when:** future code uses `event.trackId` as a Map key for any
state that should survive `.p()` renames (color, collapsed, layout,
trackMeta Y.Doc, etc.). Such state is currently still keyed by
display trackId — when the user reports "my color got reset after I
added `.p()`", that's the next vyapti to enforce (re-key trackMeta
on slotKey).

**Pre-mortem signal:** a feature that "remembers" something per-row
loses its memory when the user adds `.p("name")` → check if the
identity used is slotKey or display trackId.

**REF:** Phase 20-12.1 follow-up commit `109a9f8` (rename-in-place);
`MusicalTimeline.tsx` `collectTopLevelSlots` + `groupSlotKey`. Pairs
with P64 (slot retention class — adjacent neighbour).

---

## PV48 — Workspace packages exporting compiled `dist/` need watch-mode in dev

**Invariant:** when developing against a workspace package (`@stave/editor`,
any future split) whose `package.json` exports point to `./dist/*`, the
package's build script must be running in watch mode (`tsup --watch`)
during interactive iteration. Otherwise the app's HMR runs against the
LAST-BUILT artifact, source edits are silently discarded by the runtime
even though they're saved on disk.

**Where it lives:** `packages/editor/package.json` `scripts.dev` =
`tsup --watch`. Every workspace package with a dist export should have
the equivalent.

**Breaks when:** a contributor edits `packages/editor/src/...`, sees
unit tests pass, refreshes the browser, sees old behaviour, and iterates
on a hypothesis that doesn't match the running code. Hours burned.

**Workflow enforcement:** the dev start-up command for the project should
spawn BOTH the app dev server AND every workspace package's watch script.
Today this is manual. Future fix: a root `pnpm dev` script that runs both
in parallel (e.g. via `concurrently` or `turbo dev`).

**Pre-mortem signal:** "I changed code in `packages/<name>/src/` and the
browser shows old behaviour" → check if `pnpm --filter <name> dev` is
running.

**REF:** P66 (hetvabhasa); `feedback_viz_bugs.md` for prior occurrence.

## PV49 — Strudel-source walkers must tolerate inter-element whitespace AND inline line-comments

**Invariant:** every walker that scans Strudel source for a delimiter
(method-chain `.`, comma-separated args, top-level statements, `$:`/label
prefixes) must skip arbitrary whitespace INCLUDING newlines AND whole-line
or trailing `// …` comments between elements. The upstream Strudel
transpiler does (it's real JS); shared/community code is formatted on that
assumption (one method per line, a `// label` before each `stack()` voice).
A walker that only `.startsWith('.')` after a single `.trim()` silently
truncates the chain at the first newline.

**Span (≥3 modules — this is why it's a vyapti, not a one-off):**
`applyChain` (fixed Phase 20-14 γ cluster-B), `stripParserPrelude` (built
already tolerant), the `stack()`/comma arg-splitter (gap #137 — NOT yet
tolerant), `extractTracks` label scan (gap #138). Same requirement, four
call sites.

**Breaks when:** a chain/arg/statement spans multiple physical lines or
carries an interleaved `//` comment; the walker stops early; the tail of
the expression vanishes into Code-fallback. Real-world incidence is high
(Bakery stress test 2026-05-15: comment-between-stack-args was 1/10).

**Implication for design:** extract ONE shared
`skipWhitespaceAndLineComments(src, pos) → pos` primitive and route all
four walkers through it. Do not hand-roll the skip per walker — divergent
implementations are how `applyChain` ended up newline-intolerant while
`stripParserPrelude` was tolerant. Offset arithmetic must stay additive
(consumed prefix length adds to the element's base offset) so loc fidelity
holds.

**Out of scope of the invariant:** `${…}` template interpolation is real
JS, not whitespace — Code-fallback is the correct behavior there, not a
walker bug.

**Phase 20-15 — REALIZED + R1 DIVERGENCE (grounding instance):** the
shared primitive `skipWhitespaceAndLineComments(src, pos) → absolute idx`
was extracted (α-2, commit 888e4e4) and is the **realized PV49 substrate**.
It serves the **3 genuinely inter-token sites**: `applyChain` (the PV49
reference behaviour — α-3 rerouted it onto the primitive AS the
equivalence oracle: 16 snapshots + loc-fidelity + editor suite all
byte-unchanged proves equivalence), `splitArgsWithOffsets` (#137/G4, α-4),
`extractTracks` label scan (#138/G5, γ-2). **R1 divergence (deliberate, do
NOT "fix"):** `stripParserPrelude`'s whole-line skip (pS:139-148) is a
LINE-CLASSIFIER, structurally distinct from inter-token skip — migrating
it risks the multi-line boot-call depth logic (pS:161-212). It is
intentionally NOT routed through the primitive. The PV49 span is therefore
"3 inter-token sites + 1 deliberately-separate line-classifier", not "4
identical sites". Offset-additivity held: the 20-15 loc-fidelity harness
(full 25-file corpus) is empty-diff — the pre-mortem (right tokens, wrong
absolute index) provably did not occur.

**Span addendum (20-15 V-2, the alias corollary):** the same "match the
forms the target language treats as equivalent" obligation extends to
ROOT-FN ALIASES, not just whitespace. `sound` is upstream Strudel's
documented alias of `s` (controls.mjs); parseRoot recognised only `s`, so
EVERY `sound(...)` form fell to bare Code. Detection: a corpus fixture
vending the issue's LITERAL repro (#136 used `sound(`…`)`) caught a gap
the ad-hoc REPL checks (which used `s(`…`)`) missed. Lesson: gap-class
fixtures must use the ISSUE'S verbatim repro, not a convenient
paraphrase — the paraphrase silently substitutes a working alias.

**REF:** P67 (Code-discrimination — the same parser surface); PV-NEW
(s/sound isSampleKey threading — sibling parseRoot-recursion invariant);
gaps #136/#137/#138; `packages/editor/src/ir/parseStrudel.ts`
(`skipWhitespaceAndLineComments`, `applyChain`, `splitArgsWithOffsets`,
`extractTracks`, the `(?:s|sound)` parseRoot arms). Ground Truth:
20-14-γ-SUMMARY.md vyapti candidate; 20-15-SUMMARY.md (α-2/α-3/V-2).

## PV50 — Per-evaluate engine-owned accumulators reset at `evaluate()` entry, top-of-function

**Invariant:** any state the engine accumulates across one
`evaluate()`/render pass (e.g. `lastAliasResolutions` from the Strategy-A
alias intercept, Phase 20-14 β) MUST be (1) owned as an instance field on
the engine — not module-global, not React state — and (2) reset as a
top-of-function statement at `evaluate()` entry, NOT inside a helper the
error path can skip.

**Why instance-owned:** module-global leaks across engine instances /
files / hot-reloads; React state can't be read synchronously from the
audio callback. The accumulator is engine lifecycle state, so the engine
owns it. Single source of truth.

**Why top-of-function reset:** if the reset lives in a helper that runs
mid-`evaluate()`, an eval-error path (parse throw, transpile throw) that
returns before reaching the helper leaves the PREVIOUS pass's accumulator
live. The next consumer (friendly-error builder, β-5) reads stale data
and reports resolutions that didn't happen this pass. The reset must be
unconditional and first.

**Breaks when:** the accumulator is reset lazily / conditionally, or
stored where a second instance or a render can see it. Detection: a
per-pass diagnostic (alias hint, event count, timing) reports values from
the WRONG pass after an eval error or instance switch.

**REF:** PV45 (Yjs read paths doc-write-free during render — sibling
"where does per-pass state live" invariant), β-2/β-5 of Phase 20-14;
`packages/editor/src/engine/StrudelEngine.ts` (`wrappedOutput`,
`lastAliasResolutions`, `evaluate()` entry). Ground Truth:
20-14-β-SUMMARY.md.

## PV51 — `s(...)`/sample-key context MUST be threaded through recursive parseExpression

**Invariant:** when `parseRoot` recursively parses an inner string
argument of a sample-context call (`s(...)` / `sound(...)`), the caller's
`isSampleKey=true` discriminator MUST be threaded into the recursive
`parseExpression`/`parseRoot` call. `note`/`n`/`mini` thread `false`. A
plain recursive parse that defaults the inner bare string silently drops
`params.s` and the `duration:1` sample semantics for `s(...)` — the IR is
structurally green (Play nodes present) but semantically wrong (no sample
key, wrong duration).

**Why a vyapti, not a one-off:** the discriminator is a single boolean but
its span reaches every recursive arm on the parseRoot surface — the #132
loose arm (`callerIsSample = fnName === 's' || fnName === 'sound'`), the
strict `s`/`sound` `"…"` arm (`parseMini(…, true, …)`), the backtick arm
(`backtickInnerToIR(…, true, …)`), and any future nested-arg recursion.
Miss it in ONE arm and that arm's `s(...)` outputs lose sample semantics
while every other arm is correct — a per-arm coupled-correctness bug.

**ORIGIN:** 20-15 β-1 Lokāyata probe. It was run specifically because the
20-15 RESEARCH carried a MEDIUM-confidence inference that "naive
`parseExpression` recursion is semantically safe for `s("…".chain())`".
The probe OVERTURNED that inference by direct observation — `isSampleKey`
is NOT inert; it must be threaded. This is why β-1 was a mandatory gate
BEFORE β-2's impl, and why the conclusion is recorded in β-2's commit body.

**Breaks when:** a new recursive arm (or the V-2 `sound`-alias widening)
forgets the `true` for the sample context. Detection: `s("…".method())`
produces Play nodes WITHOUT `params.s` set / with wrong duration, while
`s("…")` (strict non-recursive arm) is correct — the divergence between
the recursive and non-recursive arm is the signal.

**REF:** PV49 (same parseRoot/recursion surface — the walker invariant),
P67 (the recursion's bare-Code-vs-structured chokepoint); β-1 probe +
β-2 impl + V-2 sound-alias of Phase 20-15;
`packages/editor/src/ir/parseStrudel.ts` (`parseRoot` `(?:s|sound)` arms,
`isSampleKey` param, the `callerIsSample` loose-arm thread). Ground
Truth: 20-15-SUMMARY.md (β-1 conclusion + V-2).
