# Hetvābhāsa Catalogue — struCode

> Project-specific reasoning error patterns. Load at session start.
>
> **Entry structure:** Root cause first, then detection signal, then the trap.
> **Maintenance:** At every 10th entry, review and prune.

## Universal Error Patterns

### U1: Timing Error (Krama Violation)
**Root cause:** The dependent operation is async. Your code runs before it completes.
**Detection signal:** Method call has no effect, returns null/undefined, or operates on uninitialized state.
**The trap:** You add a retry, setTimeout, or polling loop. The root fix is to run your code INSIDE the async callback.

### U2: Identity Error (Object Mutation Assumption)
**Root cause:** The method returns a new object. Your property is on the old one.
**Detection signal:** Property you set is missing on the object downstream in the chain.
**The trap:** You set the property again downstream, or add it to the prototype. The root fix is to tag the RETURN VALUE.

### U3: Scope Error (Prototype Collision)
**Root cause:** The framework owns the prototype. Your installation gets overwritten.
**Detection signal:** Your interceptor/wrapper is never called despite being installed.
**The trap:** You install it "harder." The root fix is to install AFTER the framework, or inside its initialization hook.

### U4: Observation Error (Mock Divergence)
**Root cause:** The mock doesn't replicate the real system's transformations.
**Detection signal:** Tests pass, production fails.
**The trap:** You fix production code but the mock still doesn't test it. The root fix is to test through the real pipeline.

### U5: Workaround Error (Symptom Suppression)
**Root cause:** The underlying system doesn't have the information it needs.
**Detection signal:** Cascading fixes — each fix creates a new symptom.
**The trap:** Each individual fix seems reasonable. The root fix is at the data source.

### U6: Mutation-for-Observation Error
**Root cause:** Observation redirected the data flow instead of tapping it.
**Detection signal:** The observed thing works, everything else on the same path breaks.
**The trap:** You duplicate the data to fix the broken paths. The root fix is a passive side-tap.

## Project-Specific Error Patterns

### P1: Strudel Transpiler Reification
**Root cause:** Strudel's transpiler converts all string arguments of Pattern methods into Pattern objects via `reify()`. Your handler receives a Pattern, not the string you expected.
**Detection signal:** `typeof arg` is `"object"` instead of `"string"`. The object has `_Pattern: true` and a `queryArc` method.
**The trap:** You check `typeof arg === 'string'` — always false. You add type coercion. The root fix is to extract the original value via `arg.queryArc(0, 1)[0].value` and handle both string and Pattern argument types.

### P2: Strudel injectPatternMethods Overwrite
**Root cause:** Strudel's `injectPatternMethods()` runs during `repl.evaluate()` and reassigns all Pattern.prototype methods, overwriting any methods you installed beforehand.
**Detection signal:** Your prototype method wrapper is never called. `typeof Pattern.prototype.yourMethod` shows the framework's version, not yours.
**The trap:** You install your wrapper before evaluate and assume it persists. The root fix is to install INSIDE the `.p` setter trap, which fires when `injectPatternMethods` assigns `.p` — at that point, the framework's initialization is complete and your wrapper won't be overwritten.

### P3: p5.js Async Setup
**Root cause:** `new p5(sketch, container)` defers `setup()` to `requestAnimationFrame`. Any method call after the constructor runs before setup completes.
**Detection signal:** `resizeCanvas()` has no effect. Canvas remains at hardcoded `createCanvas()` dimensions.
**The trap:** You call `resizeCanvas()` right after `new p5()` — it's a no-op because canvas doesn't exist yet. The root fix is to wrap the sketch's `setup()` and append `resizeCanvas()` at the end of setup, where the canvas exists.

### P4: Canvas Hardcoded Dimensions
**Root cause:** p5 sketches hardcode `createCanvas(300, 200)` instead of reading from the container.
**Detection signal:** Canvas overflows container, gets truncated, or doesn't match available space.
**The trap:** CSS overrides, height constants, post-mount resize. The root fix is `container.clientWidth` / `container.clientHeight` inside setup() — the child inherits from its parent.

### P5: Orbit Reassignment for Observation
**Root cause:** Reassigning a pattern's orbit to route audio to a per-track AnalyserNode removes the pattern from its default audio chain. Other patterns' audio breaks.
**Detection signal:** Only the observed track plays audio. All other tracks are silent.
**The trap:** You try to fix the other tracks by duplicating audio routing. The root fix is to NOT mutate patterns for observation — use passive side-taps on existing audio nodes instead.

### P6: CSS Variables Undefined When Component Mounted Standalone
**Root cause:** A component reads `var(--background)`, `var(--foreground)`, etc. but never calls `applyTheme()` on its container ref. When the parent doesn't apply theme tokens (e.g., the component is rendered standalone, not inside `LiveCodingEditor`), the CSS variables are undefined and the component falls back to whatever the browser inherits — usually white-on-white or unstyled.
**Detection signal:** The component looks correct when embedded in another themed component, but renders with wrong colors / no styles when used standalone. `getComputedStyle(el).getPropertyValue('--background')` returns empty string.
**The trap:** You hard-code colors as fallbacks (`var(--background, #090912)`) — this works for one variable but the design system has 20+ tokens and you'll miss some. The root fix is: every top-level component that uses theme tokens MUST own its theme application. Add a `theme` prop and call `applyTheme(containerRef.current, theme)` in a `useEffect`. Theme ownership is per-root-component, not per-app.
**First observed:** VizEditor rendered standalone in a tab — toolbar/borders/text were unstyled. Root fix: added `theme` prop + `applyTheme()` call in VizEditor (2026-04-08).

### P7: Empty Preview When No Data Source
**Root cause:** A preview/visualization is mounted in an authoring context (no playback running). The viz code reads from `scheduler.query()` / `analyser.getByteFrequencyData()` which return empty arrays / silence. The canvas renders only the background color and looks "broken" or "black."
**Detection signal:** Preview canvas shows only the background color. `events.length === 0` for the entire frame loop. No errors in console.
**The trap:** You assume the renderer is broken and start debugging the renderer. The root fix is in the **viz code itself**: every preview-able viz must have a "demo mode" branch that draws *something* when no audio source is available, plus a "play a pattern to see live data" hint. The canvas must never look like a bug just because nothing is playing.
**Universal principle:** Authoring environments need their own data source independent of runtime. Markdown previews can render without a server; viz previews must render without an active audio engine.
**First observed:** Seeded p5 pianoroll preset rendered black in the Viz Editor tab because the tab had no engine running. Fix: added a `if (events.length > 0) { ... } else { /* animated demo */ }` branch in the seeded code, plus a "preview mode" hint text (2026-04-08).

### P8: Stale Closure in useCallback Deps
**Root cause:** A React useCallback callback reads state from its closure but the enclosing useCallback's dep array is missing that state OR a downstream helper that captures it. The callback keeps firing with an old state snapshot even after the state updates, so derived computations return stale values indefinitely.
**Detection signal:** State updates correctly (you can inspect it), but a UI element that depends on a computed value from state is frozen at the initial value. Refs can't explain it because the state is in useState, not useRef.
**The trap:** You add `useMemo` or `useRef` patches around the derived value, or you add the state to the component's OTHER callbacks, missing the specific one that memoized with stale deps. The root fix is to identify the exact useCallback holding the stale closure and add EVERY state/helper it reads (transitively) to its dep array.
**Universal principle:** If a helper function `h` captures state via closure, every callback that uses `h` must have `h` in its deps — not the underlying state. Chain it: dep on `h`, and `h` has its own deps on state.
**First observed:** `renderTabContent` in `WorkspaceShell.tsx` captured `findTabByFileId` via closure but didn't list it in deps. After a preview tab was added to a group, `findTabByFileId` returned the stale null, `previewOpen` stayed false forever, the viz Play button never flipped to Stop (2026-04-10).

### P9: Monaco Editor Has Its Own Theme System Separate from CSS Vars
**Root cause:** `applyTheme(container, 'dark')` sets CSS custom properties on a DOM element, which affects ANYTHING styled via `var(--*)`. But Monaco editor's gutter, syntax colors, caret, and selection are painted by Monaco's OWN theme engine — they ignore CSS variables entirely. Without a separate `monaco.editor.defineTheme(...)` + `monaco.editor.setTheme(...)` call, the editor paints its default `vs` (white) theme on top of a dark chrome.
**Detection signal:** Chrome bars, tab headers, borders look correct dark/light, but the Monaco surface inside (code background, line numbers, gutter) renders white-on-black or the wrong variant.
**The trap:** You keep adding CSS overrides trying to style Monaco via cascade, none of which work because Monaco applies its colors via inline styles on its own elements. The root fix is to register a Monaco theme via `defineTheme` (in `theme/monacoTheme.ts`) and call `monaco.editor.setTheme('stave-dark' | 'stave-light')` inside the editor's mount handler, AND re-call `setTheme` from a `useEffect` on theme prop change.
**Universal principle:** Foreign rendering engines (Monaco, Hydra, p5, shader-based components) have their own theme/style systems. CSS var theming only reaches them if they're explicitly wired through a bridge function — never assumed.
**First observed:** `EditorView` in the shell refactor mounted `@monaco-editor/react` without calling `defineStrudelMonacoTheme` or `setTheme`. The editor rendered white while everything around it was dark. Fix: register the theme on mount + add a theme-change effect (2026-04-10).

### P10: Paranoid Early-Return Blocking the Common Case
**Root cause:** A guard clause designed to prevent a narrow degenerate case (e.g., "infinite loop when X equals Y") catches a MUCH broader case where the same equality holds but the behavior should work normally. The comment justifying the guard sounds reasonable on its own but doesn't match the actual call distribution.
**Detection signal:** A feature appears to do nothing — no error, no side effect, no state change — and the code path reaches a specific early-return. The guard's reasoning is architectural/worst-case rather than empirical.
**The trap:** You trust the guard's comment and look for the bug elsewhere. The root fix is to NARROW the guard to the actually-degenerate subset, usually by adding conjunctive conditions (`A === B && someExtraCondition`).
**Universal principle:** Early returns based on equality of two identifiers are suspect when the two identifiers are frequently the same in normal usage. Question every `if (a === b) return` by asking: "in the normal user flow, how often is a === b? If it's the MAJORITY of calls, this guard is almost certainly wrong."
**First observed:** `handleDropOnGroup` in `WorkspaceShell` had `if (sourceGroupId === targetGroupId) return` as a "cost-effective no-op" for directional drops. But when the shell seeds all tabs into one group, EVERY drag-to-split has source === target. The guard silently blocked every quadrant drop. Narrowed to `if (sourceGroupId === targetGroupId && source.tabs.length === 1)` in `moveTabToNewQuadrant` (the actual degenerate case) (2026-04-10).

### P11: RTL `fireEvent` Doesn't Propagate `clientX/clientY` to React Synthetic Events
**Root cause:** `@testing-library/react`'s `fireEvent.drop(el, { clientX, clientY })` passes the init dict to the underlying native event constructor, but for `DragEvent` specifically, either jsdom or React's delegated listener drops the coordinates before the handler sees them. Inside React's onDrop, `e.clientX` and `e.clientY` are `undefined`.
**Detection signal:** A drop handler that reads `e.clientX`/`e.clientY` to compute positional logic (like a quadrant detector) gets undefined values in tests even though fireEvent was called with explicit coords.
**The trap:** You convert to native `element.dispatchEvent(new Event('drop'))` which makes it worse — React's delegated listener doesn't receive plain Events, only proper DragEvents built via the `createEvent` factory. The root fix is: build the event via `createEvent.drop(el, { dataTransfer })`, then PATCH `clientX/clientY` via `Object.defineProperty(ev, 'clientX', { value, configurable: true })` BEFORE calling `fireEvent(el, ev)`.
**Universal principle:** Test environments may strip properties that production browsers preserve. When writing tests for positional event logic, verify the property actually reaches the handler (log it once) before trusting fireEvent's init dict.
**First observed:** Drag-drop tests for the 2-D layout refactor passed 'center' direction when they expected 'east'/'west'/'north'/'south'. Console log inside the handler showed `clientX: undefined`. Fix: `createEvent.drop` + `Object.defineProperty` + `fireEvent(el, ev)` (2026-04-10).

**Re-applied (2026-05-09, phase 20-08 wave α / commit 037a701):** the
same trap class fires on `fireEvent.pointerDown(target, { clientX,
pointerId, button })` against jsdom 24. The PointerEvent constructor
in jsdom 24 swallows `clientX`/`clientY`/`pointerId`/`button` from
`PointerEventInit` — they read as `undefined` on the dispatched event.
Production guards like `if (e.button !== 0) return` early-return,
swallowing the test path silently. Detection: handler fires (log
shows entry) but downstream side effects don't. Fix shape mirrors
P11's drag variant: construct a real `PointerEvent` (or fallback to
`MouseEvent`) and force-define each lost property via
`Object.defineProperty(ev, 'pointerId', { value, configurable: true })`,
then `target.dispatchEvent(ev)`. The `dispatchPointer` helper at
`packages/app/src/components/__tests__/MusicalTimelineScrub.test.tsx:108-140`
is the canonical shape; copy it for any future pointer-handler test
in this codebase.

### P12: Bridge Module Transitive Import Pulls in the Whole Renderer Stack
**Root cause:** A "pure data utility" module (e.g., `vizPresetBridge.ts`) adds an import for a function that lives in the same directory tree as the renderer code. The new import has a transitive chain into `p5`, `hydra-synth`, `gifenc`, or any ESM-incompatible library. All test files that import the bridge module directly (or via a test subject) now fail to load with ESM CommonJS interop errors — before any test runs.
**Detection signal:** A test file that used to work starts failing at module load with `SyntaxError: Named export 'X' not found. The requested module 'Y' is a CommonJS module`. The failing test has nothing to do with rendering.
**The trap:** You try to mock the offending library in every affected test file. The root fix is to **keep the bridge pure**: extract the function that needs `compilePreset` into a SEPARATE sibling file (`namedVizBridge.ts`) that only the app layer / compat shims import. The pure data module stays clean; tests of it stay isolated.
**Universal principle:** A module's import graph defines its test compatibility surface. Adding an import to a "utility" module can silently break its entire test harness. Audit the transitive load cost before adding imports to shared utilities.
**First observed:** Added `import { compilePreset } from '../vizCompiler'` to `vizPresetBridge.ts` to auto-register viz files as named descriptors. `vizCompiler` → `P5VizRenderer` → `p5` → gifenc. Broke `vizPresetBridge.test.ts` and `VizEditor.compat.test.tsx` at load time. Fix: moved `registerPresetAsNamedViz` to a new `namedVizBridge.ts` that consumers import separately (2026-04-10).

### P13: Inconsistent Close Paths — Tab × vs Chrome Stop
**Root cause:** Two different user actions for "dismiss this thing" dispatch to different handlers that do different things. `handleTabClose` (from the tab's × button) removes the tab but leaves an empty group as a "Drop a tab here" placeholder. `closeTabById` (from shell actions used by viz chrome Stop) removes the tab AND auto-collapses the empty group. Same user intent, different outcomes depending on which button they clicked.
**Detection signal:** User reports "I can't close this area" after using the close button that doesn't collapse the pane. The feature looks broken because the empty placeholder pane is still visible.
**The trap:** You add a new "dismiss pane" button instead of fixing the existing close path. The root fix is to pick the RIGHT semantic (auto-collapse on last-tab-close matches VS Code and is what users expect) and apply it to BOTH paths. Single source of truth for the close behavior.
**Universal principle:** When two UI entry points invoke "close" semantics, they must share a single lowest-level handler OR the two higher handlers must do the same thing. Splitting close semantics by entry point creates UX drift that users report as bugs.
**First observed:** Tab × on preview tab closed the tab but left an empty pane. User couldn't find the tiny group-close × button. Fix: `handleTabClose` now auto-collapses the group when closing its last tab (matching `closeTabById`'s existing behavior), unless it's the only group in the shell (2026-04-10).

### P14: Mount-Effect Thrash from Unstable Derived Object Identity
**Root cause:** A React component is called with a prop whose value is a DERIVED object (e.g., `compilePreset(file)` returning a new `VizDescriptor`). Every call to the parent's render produces a NEW object ref, even when the SOURCE input is unchanged. A downstream `useEffect([derivedObject])` in the mount component treats every re-render as a dep change, firing its cleanup + setup repeatedly. The imperative instance (p5, canvas, hydra context) is torn down and rebuilt on every state flip.
**Detection signal:** A user-visible action (pause, toggle, state change) appears to do nothing. The handler fires, the state updates, but the underlying instance is destroyed and recreated so fast that any side effect applied to it (noLoop, pause, setVolume) is invisible — it hits a brand-new instance that hasn't even completed its first frame.
**The trap:** You keep instrumenting the handler, the state update, the prop propagation — they all look correct. The root fix is to move the derivation INTO the mount component wrapped in `useMemo(..., [INPUT_IDENTITY])` where INPUT_IDENTITY is the stable source of truth (file content, scalar config) — NOT the derived object. The mount effect then only fires on real input changes, not on every render.
**Universal principle:** React effect deps should be **input identity, not derived object identity**. Two calls to a pure function with the same inputs produce equivalent outputs but NOT the same object reference. Putting the derived object in deps gives you "re-run on every parent render" which is almost never what you want. Memoize at the derivation boundary, or compute inside the component.
**First observed:** `createCompiledVizProvider.render(ctx)` built a fresh `VizPreset` and called `compilePreset(preset)` on every invocation. The returned descriptor went into `<CompiledVizMount descriptor={...} />`. CompiledVizMount had `useEffect([descriptor])`. When the user clicked Stop on the viz chrome, the paused prop flipped, provider.render was called again, a new descriptor was produced, mount effect tore down the p5 instance and rebuilt it. `renderer.pause()` fired on the new instance one microtask after it was created. Visually: nothing stopped. Fix: moved compile into CompiledVizMount via `useMemo([file.id, file.content, file.language, rendererType])` (2026-04-11).

### P15: Next.js Dev Workspace Dep Staleness
**Root cause:** A monorepo with a workspace package (`@stave/editor`) compiled to `dist/index.js`, consumed by an app package via Turbopack dev. Rebuilding the dist file updates the bytes on disk but Turbopack's module cache may keep serving the previous version because its workspace dep resolution doesn't always detect file changes inside `node_modules`-equivalent linked packages. Hot refresh in the browser pulls the old bundled code.
**Detection signal:** Integration tests pass (they import source directly), unit tests pass, `dist` file shows the new code via `grep`, but the user says "the fix isn't in the browser." The user hard-refreshes and still sees the old behavior. The gap between what tests prove and what the browser runs feels impossible.
**The trap:** You keep debugging the code, adding more tests, looking for subtle React bugs — all of them come up clean. The root fix is environmental: kill the Next dev server, `rm -rf .next`, restart. The module graph rebuilds fresh and picks up the new dist.
**Universal principle:** Workspace deps in dev servers with module graph caching are a source of silent staleness. Whenever a compiled artifact in a workspace dep is rebuilt and the behavior "should have changed but didn't," restart the dev server BEFORE continuing to debug the code.
**First observed:** User reported "stop is still not working" after two consecutive fixes that should have resolved it. A shell-level end-to-end integration test proved the full click → pause chain works. Restarting the dev server with cleared `.next` cache was the resolution. (2026-04-11)

### P16: Isolated Unit Tests Pass, Integration Behavior Broken
**Root cause:** A feature touches three layers: an outer shell, a middle provider, and an inner component. Unit tests cover each layer in isolation with mocks/stubs at the boundaries. Each isolated test passes. But the bug lives in the INTEGRATION: a property of the full pipeline that only emerges when all three layers compose. Because no test exercises the full chain, the bug is invisible until a user reports it.
**Detection signal:** You have a passing unit test for the chrome, a passing unit test for the provider's `render()`, and a passing unit test for the shell's state flow. The user says "this button doesn't work." You can't reproduce the bug in any test you've written. Every layer looks correct.
**The trap:** You write MORE isolated unit tests, refining each layer's contract. The root fix is to write an INTEGRATION test that uses the real components at each layer (with minimal mocks only at external resources like WebGL/AudioContext) and exercises the user action end-to-end. That single test catches the "fresh object identity leaks across the boundary" class of bugs that isolated tests by definition can't see.
**Universal principle:** Unit tests verify contracts at boundaries. Integration tests verify that the contracts COMPOSE. When a feature involves more than two layers of React components communicating via props + callbacks + effects, at least one test must render the full chain. Mocking the provider or the shell to simplify the test discards the exact information needed to catch integration bugs.
**First observed:** The Stop button regression (P14). Chrome test mocked `renderEditorChrome`'s ctx props directly. Provider test mocked `mountVizRenderer`. Shell test used a stub provider. All passed. The bug was that `provider.render()` built a fresh descriptor on every call — invisible in any isolated test. Fix: added a shell-level integration test that renders `<WorkspaceShell>` with a real `HYDRA_VIZ` provider and mocked `mountVizRenderer`, clicks Preview + Stop, asserts `mountVizRenderer` was called exactly ONCE and `renderer.pause()` was called on the SAME instance. The test failed immediately on the buggy code and passed on the fix — the missing integration proof (2026-04-11).

### P17: p5 v2 Default Canvas Survives instance.remove() Mid-Setup
**Root cause:** p5 v2's `#_setup()` is `async`, runs on the next animation frame after `new p5(...)`, and contains an UNCONDITIONAL `this.createCanvas(100, 100, P2D)` call BEFORE awaiting the user's setup (line 72544 of p5.js v2.2.3). If the host calls `instance.remove()` BEFORE that rAF fires — e.g., React StrictMode dev double-invoke runs the effect cleanup before p5 has had a chance to run its setup chain — `remove()` cancels the draw loop schedule but does NOT cancel the queued `#_setup` async chain. The chain still fires, the default 100×100 canvas is appended to the host container, the user setup runs and creates a SECOND canvas sized to the requested dimensions, and the draw loop starts on a "destroyed" instance whose remove() was a no-op because no canvas existed yet at the moment of removal. The orphan canvas keeps drawing forever — `pause()` calls on the LIVE renderer ref work fine on the surviving instance, but the orphan has no externally-held reference, so nothing can stop it.
**Detection signal:** Two `<canvas>` elements appear inside a single `compiled-viz-mount-*` container, both with class `p5Canvas`, both at the requested dimensions. Pause button appears to "half-work": the live canvas freezes but visual change continues underneath because the orphan is still drawing. Console-instrumented logs show `P5VizRenderer.destroy #N BEFORE remove (canvases: 0)` followed by `P5VizRenderer.mount #N → after rAF (canvases: 2)` — proving the canvases appear AFTER destroy ran but BEFORE the next destroy.
**The trap:** You debug the React state flow, the renderer ref capture, the `pause()` plumbing — all of which are correct. The chrome flips, the prop threads down, `renderer.pause()` is called on the right instance, `noLoop()` does its job. None of this matters because the orphan canvas's draw loop lives on a separate p5 instance. You blame React StrictMode and consider disabling it. Or you add a MutationObserver to manually clean orphan canvases. Both are workarounds that don't address the root cause.
**Universal principle:** When a host integrates with a library that has DEFERRED initialization (async setup chains, RAF-queued construction), the library's "destroy" call may only cancel work that's already started. Work queued for the FUTURE — async chains awaiting microtasks, RAF callbacks bound to instance methods, onload listeners — survives destroy unless the library explicitly cancels them. The host must either (a) wait for setup to complete before allowing destroy, or (b) actively neutralize the deferred chain via flags/method overrides BEFORE calling the library's destroy. Reading the library's source to understand what its destroy actually cancels (and what it leaves running) is non-negotiable.
**The fix:** In `P5VizRenderer.destroy()`, set `instance.hitCriticalError = true` (p5's `#_setup` checks this after each await and bails early), and override `instance.setup`, `instance.draw`, `instance.preload`, AND `instance.createCanvas` with no-ops on the instance BEFORE calling `instance.remove()`. Belt-and-suspenders — if any one defense is bypassed by an internal p5 path, the others still prevent the orphan canvas from being created or drawn to. (2026-04-11)

### P18: Strudel reify Tokenizes String Args as Mini-Notation
**Root cause:** Strudel's transpiler runs every string argument to a Pattern method through `reify()`, which parses the literal as **mini-notation**. Mini-notation has its own grammar — spaces are sequence separators, `:` is the sample-index operator, `*`/`[]`/`<>`/`,`/`?` are other operators. So `.viz("Piano Roll")` doesn't reach the wrapper as a single hap with value `"Piano Roll"`; it reaches as a Pattern with TWO haps `["Piano", "Roll"]` because the space tokenized into a sequence. Similarly `.viz("pianoroll:hydra")` arrives as one hap whose value is the array `["pianoroll", "hydra"]`. Any wrapper that does `haps[0].value` and stops drops the rest of the data.
**Detection signal:** A `.viz("name with space")` call silently fails to resolve a named viz that IS registered. Single-token names like `.viz("pianoroll")` work fine. The failure surface is "the named registry lookup misses" — no error, no warning, just no inline view zone or no resolved descriptor.
**The trap:** You blame the registry or the lookup logic. You don't realize the string was already mangled by reify before your code saw it. Adding more entries to the registry under guessed variants ("piano", "roll", "Piano-Roll") doesn't fix it.
**Universal principle:** Pattern methods that take string arguments in Strudel get mini-notation reify ALWAYS. The wrapper must reconstruct the original literal by inverting reify's tokenization: rejoin multiple haps with spaces, rejoin per-hap array values with `:`. Other operators (`*`, `[`, `<`, `,`, `?`) can't be cleanly inverted — those characters are not allowed in viz names.
**The fix:** Pure helper `extractVizName(rawArg)` in `packages/editor/src/engine/StrudelEngine.ts` handles all three reify shapes: single-hap string → use as-is; single-hap array → join with `:`; multi-hap → join all hap values (each rendered recursively) with spaces. The wrapper calls the helper instead of inlining the extraction. 11 unit tests in `extractVizName.test.ts`. (2026-04-11)

### P19: Library Default Loop Bypasses Manual Pause Flag
**Root cause:** When a host integrates with a library that runs its own animation loop by default (hydra `autoLoop: true`, three.js implicit render loops, etc.), setting a host-side `paused` flag is a no-op because the library's loop runs independently and never reads the host's flag. The library keeps drawing forever. The host's `pause()` method appears to do something (it sets the flag) but the user-visible animation never stops.
**Detection signal:** `pause()` is called, the boolean toggles correctly, no errors anywhere — but the canvas keeps animating. The renderer's own RAF callback might also be running (if the host has one), but cancelling THAT alone doesn't help because the library's separate loop is the one actually drawing.
**The trap:** You debug the host's pause flag, the click chain, the prop threading. They're all correct. You add `console.log` statements that confirm pause() runs. You don't realize there's a separate independent loop you don't control.
**Universal principle:** A renderer that wants to support `pause()` MUST own the loop that drives its visible output. No flag-only pauses. If the library you're wrapping has a default loop (autoLoop, internal RAF, polling timer), turn it off and drive the equivalent tick yourself from a loop you can cancel. Single source of ticks → cancellable pause.
**The fix:** Construct hydra with `autoLoop: false`. Have the renderer's own `pumpAudio` rAF callback call `hydra.tick(performance.now())` per frame in addition to its existing FFT polling. `pause()` cancels the rAF synchronously AND the pumpAudio guard at the top bails if `paused` is true (race-safe in case the browser already queued the callback). `resume()` re-arms the rAF, idempotent. `destroy()` sets a `destroyed` flag so a late async setup resolution can't reschedule into a dead instance. (See `HydraVizRenderer.ts`, issue #6, 2026-04-11.)
**Sister pattern:** Same shape as P17 (p5 deferred setup) — both are "library does work outside your control unless you explicitly opt out." p5's mechanism is the async `#_setup` chain; hydra's is the autoLoop. Both fixes share the structure: take ownership, neutralize the library's default behavior.

### P20: Layout-Shape Component Remount Wipes Local State
**Root cause:** When a React parent's render tree branches between two structurally different shapes — e.g., `{onlyOneGroup ? <DirectChild/> : <SplitPane><Wrapper><Child/></Wrapper></SplitPane>}` — the child component is at a DIFFERENT position in the parent element type chain in each branch. React's reconciliation sees the type at that position has changed and **fully unmounts and remounts** the child subtree, even when the data flowing into it is identical. Any `useState` in that subtree is wiped and reinitialized to its default. Refs are recreated. Effect cleanups run, then setups run again.
**Detection signal:** A user gesture that changes some unrelated layout (splitting a pane, opening a sibling tab, toggling a chrome) silently resets state in a component that isn't visually affected. The component's local `useState` always shows the initial default whenever its parent's tree shape transitions, even if the gesture had no semantic relation to that state.
**The trap:** You think the state isn't being captured correctly. You check `useCallback` deps, suspect stale closures (P8), check that the state setter is being called. None of it explains why the state KEEPS resetting — the setter IS being called, but the component instance it set on no longer exists.
**Universal principle:** Component-local state only persists across re-renders that REUSE the same instance. React reuses an instance only when its key + position in the parent's element type chain remain stable. **State that must survive layout changes belongs in the lowest stable parent**, not in the leaf. Lifting is the structural fix; trying to memoize harder won't help.
**Detection-by-inspection:** When inspecting state-loss bugs in dev tools, put a `console.log` in the component's useState initializer (or use a counter ref that increments on each mount). If the counter resets after a gesture that "shouldn't" affect that component, it's been remounted.
**First observed:** The viz chrome's `selectedSource` (drum / chord / sample dropdown selection) was wiping back to `default` whenever the user clicked Preview for the first time. Cause: `WorkspaceShell` renders `{layout.length === 1 && layout[0].length === 1 ? renderGroup(g) : <SplitPane>...</SplitPane>}`. Opening a preview tab transitioned from one group to two, switching the IIFE branch to the SplitPane branch, the editor subtree's parent type changed, the chrome remounted, `selectedSource` state was lost. Fix: moved the audio start/stop dispatch from the chrome (which had stale state) to the shell's `onTogglePausePreview` handler (which reads the open preview tab's `sourceRef` from the shell-owned `groups` Map — survives the remount). Issue #3, 2026-04-11.

### P21: Wrong Source Priority — Silent Fallback Wins Over Working Primary
**Root cause:** A renderer (or any consumer) has multiple paths to get the same data — e.g., a real audio analyser AND a synthetic envelope from event streams. The path-selection logic picks the WRONG one when both are present, locking onto a fallback that happens to be silent/empty/zero. The "working" primary path is silently bypassed. Visually: the consumer animates but doesn't respond to the data it should be reading.
**Detection signal:** The consumer is alive (loop running, no errors, no zero divisions) but the data it's pulling from is constant. In debugger, the data structure is filled with zeros / defaults / placeholder values. The data SOURCE is producing real values, just not on the path the consumer is reading.
**The trap:** You blame the source ("the analyser isn't producing data") or the consumer's data extraction ("the FFT bin math is wrong"). You don't realize the consumer was reading from a completely different source the whole time. The path-selection logic is usually buried in a `mount()` or `init()` method and looks innocuous.
**Universal principle:** When you have N paths to the same data, the priority logic should match what ACTUALLY DELIVERS data, not what's syntactically present. A path that exists but is silent should be a fallback, not a primary. Document the priority and verify with one observation per path: "if both A and B are present, which one wins, and is that one actually populated?"
**First observed:** `HydraVizRenderer.mount()` had:
```ts
if (this.hapStream) { this.useEnvelope = true }
if (this.analyser && !this.useEnvelope) { /* allocate freqData */ }
```
Built-in example sources (drum / chord / sample) construct a HapStream they NEVER emit on. So `useEnvelope = true` won, `freqData` was never allocated, `pumpAudio` populated `s.a.fft[]` from the empty envelope, the hydra shader saw constant zero FFT input, the canvas was visually unresponsive to audio. p5 worked in the same scenario because the user sketch reads `stave.analyser` directly (no envelope path). Fix: invert the priority — analyser ALWAYS wins when present; envelope is fallback only. Issue #7, 2026-04-11.

### P22: Buffer Size vs CSS Display Size on HiDPI
**Root cause:** `canvas.width` / `canvas.height` are the BACKING-STORE (buffer) dimensions. On HiDPI/Retina (`devicePixelRatio > 1`), p5 (and other canvas libraries) double the buffer for crisp rendering — so `canvas.width = CSS_width × DPR`. Using buffer dims in layout math (CSS transforms, zone heights, scale factors) halves the visual width on Retina screens.
**Detection signal:** Works in Playwright's default Chromium (DPR=1) and in Firefox (different p5 WEBGL pixel-density handling). Fails in Chrome on Mac with DPR=2: canvas appears at half-width, centered or left-aligned inside its zone.
**The trap:** You think it's the viz sketch's problem, or the transform formula. You keep tweaking `computeLayout`, wrapper dims, scale math. None of those are wrong — the INPUT to the math is wrong.
**Universal principle:** In any layout/transform math, ALWAYS use CSS display dimensions (`offsetWidth` / `offsetHeight`) — they're DPR-independent and reflect what the rendered layout sees. Use `canvas.width`/`height` only when drawing INTO the canvas (where you actually want buffer-native coordinates for sharpness).
**First observed:** `readCanvasNative` in `packages/editor/src/visualizers/viewZones.ts` read `canvas.width | 0`. On Retina, that was 2880 for a 1440px CSS canvas. Scale became `contentW/2880 = 0.39`, visual width = 1440 × 0.39 = 560px (half). Fixed by switching to `canvas.offsetWidth | 0`. Branch `fix/track-analyser-producer`, commit `b0522d1`, 2026-04-14.

### P23: Monaco View Zone Stored Descriptor — Mutate, Don't Recompute
**Root cause:** Monaco's `editor.changeViewZones((acc) => acc.addZone(zone))` stores a REFERENCE to the `zone` descriptor object. Monaco re-reads `zone.heightInPx` from that reference for: (a) line-number positioning after the zone, (b) restoring the zone's height when it re-enters the viewport after `display:none` scroll-out. Updating `domNode.style.height` and calling `layoutZone(id)` is NOT enough — Monaco's internal `heightInPx` stays at the initial value.
**Detection signal:** Two flavors. (1) Next line of code after the zone sits with visible empty space above it — gap proportional to (originalHeight − currentHeight). (2) Scrolling the zone off-screen and back resets its height to the uncropped initial value.
**The trap:** You change `accessor.layoutZone(zoneId)` to be called more often, add `requestAnimationFrame` retries, or try to override with `!important` CSS. None of it works because Monaco's stored value is never touched.
**Universal principle:** When a framework API takes an object and stores a reference, subsequent updates must MUTATE that same object. Don't replace, don't re-pass — keep the reference and patch it in-place. Match the framework's ownership model.
**First observed:** After cropping an inline viz zone to e.g. `h:38%`, Monaco placed the next code line as if the zone were still full-height. Fixed by storing the `zoneDesc` object in `ZoneEntry` and mutating `entry.zoneDesc.heightInPx = layout.zoneH` on every layout recompute. Branch `fix/track-analyser-producer`, commits `911e9c6` + `5ac8b58`, 2026-04-14.

### P24: Monaco onDidLayoutChange Excludes Scroll
**Root cause:** `editor.onDidLayoutChange` fires only on editor-dimension changes (resize, font change, sidebar toggle). Scrolling is a separate event (`onDidScrollChange`). If your code re-computes view-zone geometry only on layout-change, scroll-triggered DOM repositioning is missed.
**Detection signal:** Hit-testing against zone bounding boxes produces stale results after scroll. Floating UI (action bars, overlays) stays anchored to the cursor's last-tested zone even when the user has scrolled past it.
**The trap:** You look at the event listener and assume "layout change" covers everything visual. The API naming misleads — scroll is layout-change's sibling, not subset.
**Universal principle:** When your UI state depends on where zones are in screen space, subscribe to BOTH `onDidLayoutChange` AND `onDidScrollChange` and reuse the same handler. Scroll + resize are orthogonal events in Monaco; both shift DOM positions.
**First observed:** Inline viz floating edit/crop action bar stayed visible with stale position after scrolling. Also used for re-asserting cropped zone heights on scroll-back since Monaco can reset `heightInPx` when un-hiding. Branch `fix/track-analyser-producer`, commits `911e9c6` + `78326be`, 2026-04-14.

### P25: Async IDB Seed Races Synchronous Consumer
**Root cause:** `StrudelEditorClient` seeds bundled VizPresets to IndexedDB via async `seedPresets()` in a useEffect (fire-and-forget, no await). Downstream consumers (`addInlineViewZones` → `VizPresetStore.getAll()`) may execute BEFORE the seed writes land. `presets.find(byName)` returns undefined. Any logic gated on `if (!preset) continue` silently skips.
**Detection signal:** Feature works on second page load (IDB is populated) but fails on first load after clearing site data. Looks intermittent — depends on microtask ordering and IDB transaction speed.
**The trap:** You think the feature itself is broken. You add Playwright probes that always pass because they run after the IDB has stabilized.
**Universal principle:** Never gate workspace-file-scoped state behind a concurrently-seeded IDB read. Split responsibilities: per-instance overrides (zone-level, Y.Doc-backed) must be read BEFORE and independently of per-preset defaults. Fall back to defaults when the preset is missing, rather than skipping the whole path.
**First observed:** Per-instance crop overrides (`zoneOverrides` Y.Map) were read inside `if (!preset) continue`. First page load: preset missing → skip → crop never applied. User pattern: save crop → close tab → reopen → crop "didn't save". Fixed by reading the override first, preset second. Branch `fix/track-analyser-producer`, commit `fd370b3`, 2026-04-14.


### P26: Ref-From-Async-onMount Races Sync-Fired Subscription Initial Callback
**Root cause:** Component subscribes to a bus/store whose `subscribe()` fires the callback SYNCHRONOUSLY once with current state. The callback guards on a ref populated by Monacos async `onMount`. On fresh mount while the bus already has a payload, the subscribe-time sync fire runs BEFORE onMount has assigned the ref — the guard fails silently, payload is lost. Later onMount assigns the ref but ref-assignment does not trigger a re-render, so no re-delivery mechanism ever runs.
**Detection signal:** A component works at cold start (no publish yet, null payload) but is dead on any second / split / remount while the bus is already publishing. Audio / data keeps flowing but the UI shows stale or initial state.
**The trap:** You suspect the subscription is wrong or the payload is wrong. You verify both are fine. You do not realize the ref was null only for the first dispatch and nobody redelivers.
**Universal principle:** When a subscription fires synchronously on subscribe AND the consumer depends on a ref populated by an async child mount, gate the subscribe effect on a `ready` state flag that flips inside the mount handler. The state change re-runs the effect, which unsubscribes and resubscribes — the new subscribe-time sync fire redelivers the payload with the ref now populated.
**Sister pattern:** `feedback_observer_wire_race.md` — Y.Map observer wire guarded with reference-check, not boolean. Same shape: subscribe-before-ready.
**First observed:** Splitting an editor group while Strudel was publishing left the new groups inline viz and hap highlight dead. `EditorView` subscribed to `workspaceAudioBus`, callback guarded on `editorRef.current` which was null at the sync initial fire. Fix: `editorReady` state flipped in `handleMonacoMount`, added to the bus-subscribe effect deps. Issue #22, PR #23, commit `98f2fbb`, 2026-04-14.

### P27: Positional Index Mapping Drifts When Source Positions Shift Mid-Edit
**Root cause:** A live-update path maps stored objects to source positions by index (`trackKey `$N` → afterLines[N]`). Index `N` was assigned at evaluate time by the engine walking `$:` blocks in order. Between evaluations the user can insert/remove/reshuffle blocks — line numbers shift but the stored trackKey does not. Positional lookup returns `afterLines[N]` from the NEW code, which is now a different block. The stored object gets dragged to an unrelated position; if combined with a guard that defers on total-count change, the object sits at a stale afterLine that now lands inside another block.
**Detection signal:** An inline zone, annotation, or marker "jumps" to a nearby but wrong location after the user edits unrelated code (inserts new blocks above, deletes a block, reorders). Re-evaluating fixes it — but during editing the object is misplaced.
**The trap:** You add guards: "defer when block count changes" (handles one half); "skip when index out of range" (handles another). Neither handles the common "count stable but positions shifted" case; both leave the object stale instead of wrong.
**Universal principle:** Dont use positional indices for live-update mapping across code edits. Anchor to the SOURCE TEXT itself — editor decorations track content edits for free. On content change, read the decorations current line, then walk source-structure outward (`$:` block start → end). The decoration IS the single source of truth.
**First observed:** Inline viz zones drifted into unrelated block content when the user inserted a new `$:` block between existing ones or expanded a comment region. Before: `trackKey $N → scanStrudelBlockAfterLines()[N]` + count-change guard. After: Monaco `IEditorDecorationsCollection` planted on the `.viz("<name>")` source line with `stickiness: 1`; on content change read the decoration line, walk backward to enclosing `$:`, forward to block end, update `afterLineNumber`. Positional scanner deleted. Issue #29, commit `f7a752e`, 2026-04-14.

### P28: Reentrant Mount Via Yjs Observer Firing Synchronously During Active Mount
**Root cause:** A mount routine (e.g. `addInlineViewZones`) creates resources, then calls an internal bookkeeping API (`pruneZoneOverrides`) that `doc.transact()`s on a Y.Map. The `observeDeep` callback fires SYNCHRONOUSLY on transaction commit — still inside the outer mount. Observer notifies subscribers; one subscriber is a remount effect (`onNamedVizChanged` / `subscribeToZoneOverrides`). The remount effect reads the shared handle ref — which still points at the OLD handle because the outer mounts assignment (`ref.current = addInlineViewZones(...)`) has NOT completed yet (the RHS is still executing). Remount calls `cleanup()` on the old handle (no-op) and `addInlineViewZones()` AGAIN, creating a second set of resources and assigning THAT handle to the ref. Control returns to the outer mount; its return value overwrites the ref with its own handle. Net: two live resource sets in the framework (e.g. Monaco zones), only one reachable through the ref. Cleanup on next cycle misses the orphans.
**Detection signal:** Duplicates of a resource (inline viz zones, listeners, renderers) accumulate after a specific user gesture. Stop/play / re-evaluate does not clear them — only a full unmount (page refresh) does. Count grows with each gesture; only one copy is reachable programmatically.
**The trap:** You search for a missing `cleanup()` call. You audit every caller of the mount routine for duplicated dispatch. You find none. The reentry is INSIDE the mount itself, invisible from the outside.
**Universal principle:** Internal bookkeeping mutations (prune, reconcile, invariant-restore) must not fire user-observable subscribers. When the underlying store exposes transaction origins (Yjs, redux, etc.), tag internal transactions with a distinct origin and filter them in the observer. Alternative: make the subscriber notification async (microtask) so it never reenters an active sync call. Origin filtering is cleaner — it encodes the intent (this mutation is not a user action) in the transaction itself.
**First observed:** Adding a new `.viz("name")` block duplicated every pre-existing inline zone. `pruneZoneOverrides` inside `addInlineViewZones` did `doc.transact(..., STRUCT_ORIGIN)`. Y.Map `observeDeep` fired sync → `subscribeToZoneOverrides` notified → `EditorView`s `remount` effect re-entered `addInlineViewZones` before the outer assignment completed → two zone sets in Monaco. Stop/play only cleaned the reachable handles zones. Fix: new `PRUNE_ZONE_OVERRIDES_ORIGIN` (module-private Symbol) passed to `doc.transact`; `observeDeep` skips notification when `events[0].transaction.origin === PRUNE_ZONE_OVERRIDES_ORIGIN`. User-driven `setZoneCropOverride` still uses the default origin and fires subscribers normally. Issue #30, commit `1d4f69b`, 2026-04-15.
**Sister patterns:** P20 (layout-shape remount wipes state) — both involve reentry during a parent operation. P28 is reentry via external subscriber; P20 is reentry via React reconciliation. Both share the remedy: lift stable state out of the reentrant zone.

---

### P29: Stale useCallback Closure Hides Fresh Props in Render IIFE

**Detection signal:** A prop you can verify is reaching the component (logged at the top of render, fresh value present) shows up as the OLD value when read inside an IIFE deeper in the JSX tree. State updates from callbacks land in app state, are forwarded through component props, but the visible UI never reflects them.

**Wrong fix (the trap):** Add yet more state propagation, suspect React reconciliation, suspect prop drilling, restart the dev server, blame turbopack caching, lift the value into context.

**Real root cause:** The IIFE renders inside a `useCallback` whose dep array omits the prop. React keeps the previous closure alive — the closure captured the prop's old value at the previous render and continues returning that value even though the component itself is re-rendering with new data.

**Real fix:** Add every prop / state read inside the `useCallback`'d render function to its dep array. Treat closures returned from `useCallback` as snapshots of their declaration moment unless you list the deps that should invalidate them.

**Confirmed by:** Phase 4 backdrop crop (commit 173dafa range). Save → adapter.saveCrop → React state set → StrudelEditorClient re-render with new `backgroundCrop` (verified via `console.log` at component top), but `WorkspaceShell.renderGroup`'s IIFE saw `crop= null` (verified via `console.log` inside IIFE). Three rebuild + dev-restart cycles before noticing the dep array. Fix: add `backgroundCrop, backdropQuality, backdropOpacity, previewProviderFor, theme` to renderGroup's deps. Same root cause expected to bite any future prop added to the shell render — there's a comment in the deps list now naming this risk.

**Implication:** When a render function reads N props/state, its useCallback dep array MUST list those N values. The React lint rule `react-hooks/exhaustive-deps` catches this if enabled — verify it's on for new files.

### P30: Layered Opaque CSS Hides a Sibling at Lower zIndex

**Detection signal:** A canvas/element renders correctly (verified via `canvas.toDataURL()` raw dump) but is invisible on the rendered page even though the layer above it is supposed to be transparent.

**Wrong fix:** Tweak opacity, change blend modes, blame backdrop-filter stacking-context, swap quality factor, increase contrast.

**Real root cause:** Multiple ancestor `<div>`s between the rendered surface and the viewport each paint `background: var(--background)` opaquely. The layer you "made transparent" was only ONE of them; others above it kept covering. CSS doesn't tell you about layers you didn't suspect.

**Real fix:** Walk DOWN from the cluster you suspect, log every descendant's `getComputedStyle().backgroundColor`, filter to non-transparent. Every opaque ancestor between visible-region and the canvas must be neutralised (e.g., `[data-stave-code-panel][data-stave-backdrop="on"] [data-workspace-view="editor"] { background: transparent !important; }`).

**Confirmed by:** Backdrop visibility fix (Phase 3). Monaco's `.monaco-editor` was set transparent but `[data-workspace-view="editor"]` (its parent in EditorView.tsx) painted `var(--background)` opaque, hiding the viz. Diagnostic: downward bg-walk found `rgb(9, 9, 18)` at depth 1 — that wrapper. Fix added to `globals.css`.

**Implication:** "Make Monaco transparent" is not the same as "make the editor surface transparent." For backdrop-style features, neutralise every opaque div between the backdrop layer and the viewport. The downward bg-walk diag (in screenshot-p5-backdrop.spec.ts comments) is the canonical diagnostic.

### P31: Extension-to-Language Map Mismatch Excludes Files Silently

**Detection signal:** A file picker / filter shows fewer files than expected but throws no errors. Some extensions show; some don't. The "missing" extension's files exist in the project.

**Wrong fix:** Re-check the file list subscription, re-check the projection, suspect Yjs not flushing, restart everything.

**Real root cause:** The extension-to-language token used in code (`"p5"`) doesn't match the language token actually stored on the file (`"p5js"`). The map at `FileTree.tsx:1488` is the source of truth; consumers must match its outputs, not the extension string.

**Real fix:** When filtering by `WorkspaceFile.language`, mirror the exact tokens emitted by `extensionToLanguage`. Currently: `'strudel' | 'sonicpi' | 'hydra' | 'p5js' | 'markdown'`. NOT `'p5'`.

**Confirmed by:** Backdrop popover dropdown showed only `.hydra` files; every `.p5` file was filtered out by `f.language === "p5"` (should have been `"p5js"`). Took a user report to surface — no error, just silent absence.

**Implication:** Centralise the tokens. Better long-term: export the language constants as a const enum from FileTree's helper module so consumers can't typo them.

---

### P32: Blanket CSS `*` Rule Kills Functional Backgrounds

**Detection signal:** A visual element (selection highlight, minimap slider, scroll visor) works in normal mode but disappears when a CSS mode switch activates (e.g., backdrop on).

**Wrong fix:** Add more specificity to the missing element's styles, suspect z-index, suspect display toggling.

**Real root cause:** A blanket wildcard rule (`[scope] .parent *`) sets `background-color: transparent !important` on ALL descendants. The functional element paints via `background-color` — the wildcard kills it. The original comment claims "highlights paint via borders" but that's wrong for many Monaco classes.

**Real fix:** Exempt functional elements from the blanket rule using `:not(.selected-text):not(.selectionHighlight):not(.minimap-slider-horizontal)` etc. Enumerate each class that paints via background-color.

**Confirmed by:** Selection highlight (P46), minimap scroll visor — both killed by `.monaco-editor *` transparent rule in backdrop mode.

---

### P33: Monaco Pointer Capture Blocks View Zone Event Handlers

**Detection signal:** A click/drag handler inside a Monaco view zone's DOM node registers correctly (hover effects work via CSS/mouseenter), but mousedown/pointerdown never fires the handler.

**Wrong fix:** Try different event types, add capture listeners, use stopPropagation.

**Real root cause:** Monaco's `.monaco-scrollable-element` calls `setPointerCapture()` on pointer events, routing all subsequent pointer events to itself. Handlers on child elements (like view zone DOM nodes) never receive the events.

**Real fix:** Register the handler on the view zone CONTAINER in capture phase, and call `resizeHandle.setPointerCapture(e.pointerId)` to steal the pointer capture from Monaco. Use `pointermove`/`pointerup` on the handle (not document) since pointer capture routes events to the capturing element.

**Confirmed by:** Inline viz resize handle — hover worked, drag didn't. Fixed by setPointerCapture on the handle.

---

### P34: Zone Override Subscriber Triggers Full Remount on Every Write

**Detection signal:** Persisting a zone override (crop, height) causes the zone to flash/reset to its default state, even though the override was just saved with the correct value.

**Wrong fix:** Add timing delays, defer the persist, use requestAnimationFrame.

**Real root cause:** `setZoneHeightOverride` mutates the Yjs zone overrides map. The `subscribeToZoneOverrides` observer fires, calling `remount()` in EditorView, which destroys all zones and recreates them. The recreated zones read the override correctly but the remount itself causes a visual flash and resets in-progress drag state.

**Real fix:** Use a dedicated transaction origin (`HEIGHT_RESIZE_ORIGIN`) for height writes. The observer checks the origin and skips subscriber notification for this origin.

**Confirmed by:** Drag-to-resize reverted on mouseup because the persist triggered remount.

---

### P35: Position-Based TrackKeys Break Overrides on Block Reorder

**Detection signal:** After reordering `$:` blocks, cropping one inline viz applies the crop to a different viz.

**Wrong fix:** Clear all overrides on re-evaluate, or use line numbers as keys.

**Real root cause:** Anonymous `$:` blocks get sequential trackKeys (`$0`, `$1`...) based on source position. Overrides are keyed by trackKey. Reordering blocks reassigns keys, but old overrides persist — `pruneZoneOverrides` only checks vizId, not block content. When both blocks use the same viz, both overrides survive at the wrong positions.

**Real fix:** Store a content hash (first 120 chars, whitespace-normalized) in each override. `pruneZoneOverrides` compares stored hash against current block content at each trackKey. Mismatched content = stale override = pruned.

**Confirmed by:** Rearranging `.viz("p5test")` blocks caused crop cross-contamination.

---

### P36: reAnchorZones Swallows Lines Typed After .viz()

**Detection signal:** Text typed after a `.viz()` line appears BETWEEN the `.viz()` call and the inline viz zone, instead of below the zone.

**Wrong fix:** Change decoration stickiness, adjust afterLineNumber offset.

**Real root cause:** `reAnchorZones` scans forward for the block's last non-empty line to position the zone. Gibberish typed after `.viz()` is a non-empty line that doesn't start with `$:`, so the scan includes it as a block continuation, pushing the zone below the gibberish.

**Real fix:** Stop the block-end scan at the `.viz()` call itself (`/\.viz\s*\(/.test(line)`). The `.viz()` line is always the last meaningful line of a block. Falls back to last-non-empty scan if `.viz()` was deleted.

**Confirmed by:** Typing gibberish after `.viz("pianoroll")` pushed the zone below the text.

---

## P37 — Sync React setState inside a runtime error handler can unmount the tree

**Category:** React / Monaco / engine boundary
**First observed:** 2026-04-19, friendly-errors-console session — StatusBar disappears after a Strudel `ReferenceError` eval.

**Symptom:** After a bad Strudel eval, `[data-stave-statusbar]` vanishes from the DOM. Page errors include `Illegal value for lineNumber`, `Failed to execute 'removeChild' on 'Node'`, and `Canceled`. Valid evals don't trigger it.

**Detection signal:** Any time an engine callback (`runtime.onError`, `engine.setRuntimeErrorHandler`, custom `subscribeLog`) fires DURING a React commit — e.g. Monaco's own `setModelMarkers` path is in the middle of committing when the callback calls `setState`.

**The trap:** "My new `emitLog` subscriber crashed the tree." No — reproduces on main without the subscriber (only the existing StrudelEditorClient `setRuntimeStates` call is enough). Touching subscriber code won't fix it.

**Real root cause:** Monaco's `setEvalError` → marker-commit path throws for Strudel errors whose location metadata doesn't map to a real line. The throw happens during React's commit phase (inside a useEffect child-update). React then unmounts the whole subtree because there's no ErrorBoundary guarding Monaco's children.

**Real fix (not landed yet):** wrap Monaco marker updates in try/catch; validate line numbers before passing to `editor.setModelMarkers`; add an ErrorBoundary around the editor view so a marker-set throw doesn't cascade into the status bar / menu bar.

**Stopgap:** defer any NEW engine-log subscribers to `queueMicrotask` inside `emitLog` so we don't amplify the pre-existing bug. Doesn't fix root cause but avoids making it worse.

**Confirmed by:** Reverting my engine-log bridge AND the whole StatusBar subscribe still reproduced the unmount on a `ReferenceError: notes is not defined` eval.

---

## P38 — Registry key mismatch silently breaks click-to-source

**Category:** Editor / workspace registry / IR Inspector boundary
**First observed:** 2026-05-02, IR loc-tracking session — Inspector click on event row didn't move cursor.

**Symptom:** User clicks an IREvent row in the IR Inspector panel that has a populated `loc`. No error, no console warning, but the editor cursor doesn't move. Visible state is identical before and after.

**Detection signal:** Any time a downstream component looks up a resource via a key (`fileId`, `presetId`, `runtimeId`) that was sourced from a different field than the registrar used. The lookup returns `undefined`, the no-op-on-miss code path runs silently.

**The trap:** "The click handler must be broken — let me debug `revealLineInFile`." It isn't broken; it returns `false` (editor not found) and the caller doesn't surface that. Walking through the click handler in DevTools shows it executing without error, so the bug looks like it's deeper inside Monaco.

**Real root cause:** `IRSnapshot.source` was populated with `fileNow.path`, but `revealLineInFile(fileId, line)` keys the editor registry by the workspace-file `id`, not the path. The two happen to be equal for some shapes and differ for others — silently wrong on whichever shape mismatches.

**Real fix:** publish `fileNow.id` as `IRSnapshot.source`. Update JSDoc to make the field's contract explicit ("the registry key, not a human-visible label").

**Lesson:** When wiring a NEW handler that looks up registered resources, verify the lookup HIT — not just that the call didn't throw. `if (!found) return false` is a silent failure mode. Either log on miss or add a unit test that asserts the lookup succeeds end-to-end.

**Confirmed by:** Cursor moved correctly after switching `source` from `path` to `id`. Live-browser smoke confirmed.

---

## P39 — Parser pipelines that trim/concat destroy source-range info

**Category:** Parser architecture / source-location tracking
**First observed:** 2026-05-02, IR loc-tracking session — `parseStrudel`'s original `extractTracks` lost offsets via `.trim()` + `\n`-concat.

**Symptom:** When you go to add `loc` (source ranges) to a parser pipeline AFTER the fact, intermediate string transformations have already dropped position information. There's no way to recover the original char offset of an atom inside a Stack track once the input was trimmed and rebuilt.

**Detection signal:** Any function in the parser chain that does:
- `input.trim()` — drops leading/trailing whitespace position
- `chunks.join('\n')` — rebuilds a string whose offsets don't correspond to the original
- `slice(2)` after a structural marker (e.g. `$:`) without recording where the slice started
- Any recursion that takes a substring without threading a `baseOffset` parameter

**The trap:** "I'll just `.indexOf()` the matched substring in the original code." Works for unique substrings, breaks the moment the user has two `note("c4")` calls — `.indexOf` returns the FIRST one, which may not be the one being parsed right now.

**Real root cause:** The parser was written for a stage where loc didn't exist, so every helper happily mangled string content. Adding loc to such a pipeline is a refactor, not an addition.

**Real fix:** thread `baseOffset` through every parser entry point. Rewrite slice-producing helpers to return `{ slice, offset }` pairs. For parseStrudel specifically: scan with a regex that records both the structural marker position AND the body start; return `{ expr, offset }[]` from the absolute-position slice (no trim, no concat).

**Lesson:** If a parser has any chance of needing source-range tracking later, design it offset-aware from day one. Threading `baseOffset` through helpers from the start is trivial; retrofitting it across already-mangled string surgery is high cost.

**Confirmed by:** parseStrudel offset-aware refactor (PR #65) — all 1007 tests still green; 12 new loc tests pass; live-browser cursor jump works.

---

## P40 — Curated friendly-error hints can ship "wrong" silently

**Category:** Friendly errors / runtime hint authoring
**First observed:** 2026-05-02, unified-FES session — the seeded p5 `windowWidth is not defined` hint never fired because p5 v2 still exposes `windowWidth` as a sketch-instance getter.

**Symptom:** A `commonMistakes` entry was added with a message regex that matched a plausible-looking error. Unit tests passed (fed in a fabricated error message). But in the live runtime, that error message never actually fires — the user gets no hint, and the maintainer thinks the hint works because tests are green.

**Detection signal:** Any new `commonMistakes` entry whose detection trigger was inferred from documentation or "what users probably hit," NOT from a captured live failure.

**The trap:** "p5 v2 docs say windowWidth was removed, so it must throw a ReferenceError when accessed." It doesn't — Strudel/p5/Hydra wrap user code in `with (sketch) { ... }` which falls through to `window.windowWidth` (undefined) for unknown identifiers OR returns `undefined` for instance properties not there. Neither throws.

**Real fix:** before shipping any curated hint, reproduce the trigger live (Playwright or manual browser), capture the actual error message that fires, write the regex against THAT message. If you can't reproduce, drop the hint — keep the schema slot wired but unfilled. A wired-and-empty slot is honest; a wired-and-wrong slot looks like coverage but isn't.

**Lesson:** "If you can't demo it, don't ship it" applies harder to friendly errors than to most features. A failed UI element shows; a failed friendly hint silently degrades the empty-state experience.

**Confirmed by:** Dropped the p5 `windowWidth` hint in PR #57 self-review after live-browser smoke showed it never fired. Replaced with empty `globalMistakes: []` slot + comment.


## P41 — Stacked PR auto-retarget silently fails when base branch is deleted

**Category:** GitHub workflow / stacked PRs
**First observed:** 2026-05-02 — PR #65 (loc-tracking) was stacked on PR #63 (Inspector v0). After #63 squash-merged into `main`, GitHub deleted the head branch `feat/ir-inspector-v0`. PR #65's base remained pointed at the deleted branch. Merging #65 marked it MERGED on the API but the merge target was a tombstone — the loc-tracking commits never reached `main`. Status badge said "merged"; `git log origin/main` did not contain the commits.

**Symptom:** A stacked PR shows MERGED in the GitHub UI but `git log main` doesn't contain its commits. CI on subsequent work appears to "lose" features that the user remembers shipping. Worst-case: you ship dependent work on the assumption a feature is on main, only to find it isn't.

**Detection signal:** After merging a stacked PR, `git diff main..feature-branch` is non-empty even though the PR is marked merged. `gh api repos/X/Y/pulls/N --jq .base.ref` returns a branch name that no longer exists (`gh api repos/X/Y/branches/<base>` returns 404).

**The trap:** "GitHub auto-retargets stacked PRs when the base merges, right?" Sometimes yes (UI-side, before merge). NOT after the base is deleted. The merge proceeds against the deleted ref, succeeds at the API level, and lands nowhere.

**Real fix (preventive):** Before merging a stacked PR, verify its base. If the base branch was deleted (because its PR was squash-merged with branch deletion), retarget to `main` first via `gh pr edit N --base main`. Or: avoid stacking entirely on small projects — open the second PR off `main` once the first lands.

**Real fix (recovery):** Cherry-pick the orphaned commits into a new branch off `main`, open a fresh PR. (This session: fix/ir-loc-tracking → PR #66, replacing the orphaned #65.)

**Lesson:** Trust `git log origin/main` over GitHub's MERGED badge. The badge says "the merge ran." It does not say "the changes are on main." For stacked PRs, the base branch's deletion races the second PR's merge — verify the destination, don't infer it from the badge.

**Confirmed by:** PR #66 successfully landed the orphaned commits from #65 onto main; full diff verified before/after. Same gotcha cannot recur silently because the rule is now: `git diff main..HEAD` after every "merged" PR you depended on.


## P42 — Predicate-direction inversion silently passes count-equality assertions

**Category:** test design / parity verification
**First observed:** 2026-05-03 — Phase 19-03 Wave 3, `Degrade` collect arm.

**Symptom:** Implementation of a probabilistic filter passes a symmetric-probability parity test (e.g., p=0.5: ~50% retention either way produces ~same count) but produces a different *set* of retained events than the reference. Asymmetric probe (e.g., p=0.2) reveals the inversion: same total count, but the *opposite* events are kept.

**Detection signal:** Symmetric-probability test green; asymmetric-probability test red on COUNT (or red on SET when count happens to coincide). Re-running the symmetric test still passes. The implementation looks superficially correct because the symmetric case is direction-agnostic.

**The trap:** "Counts match — the filter works. The set difference must be a hashing/seeding nuance." You start chasing seed-state divergence instead of the predicate. Or worse, you weaken the parity to count-only and ship a backwards filter.

**Real fix:** include at least one *asymmetric* probe in any parity test of a probabilistic or threshold-based operator. Strudel's `degrade` predicate is `rand > drop_amount` (strict, `signal.mjs:679`). Our retention `p = 1 - drop`, so the correct ours-side predicate is `seededRand > (1 - p)`, not `< p`. The asymmetric `.degradeBy(0.8)` probe (p=0.2) caught the inversion immediately; the symmetric `.degrade()` (p=0.5) had hidden it.

**Lesson:** Symmetric tests for symmetric properties are tautological — they pass regardless of direction. Asymmetric probes exercise direction. Build at least one in for any threshold operator, predicate filter, comparison-based selector.

**Confirmed by:** Phase 19-03 W3, commit `a769827`. The predicate was inverted on the first implementation; the asymmetric probe (which existed only because the plan-checker explicitly asked for it as warning #4) was the only test that distinguished correct from inverted. The symmetric `.degrade()` probe was green in both versions.


## P43 — External-system documented spec disagrees with source-code implementation

**Category:** grounding / Lokayata enforcement
**First observed:** 2026-05-03 — Phase 19-03, three independent cases in one phase.

**Symptom:** A behavioral claim sourced from documentation, plan text, or a research summary is contradicted by direct read of the dependency's source code. The "spec" describes algorithm A; the actual implementation does B. Building against the spec produces output that diverges from the dependency under test conditions.

**Detection signal:** Strict parity / behavioral comparison fails despite confident-sounding spec. The fix that "should work per docs" doesn't. Re-reading the docs reinforces the wrong model. Reading the source resolves it in minutes.

**The trap:** "The plan / research / docs all agree on the algorithm. The bug must be in OUR implementation." You debug for an hour assuming the spec is right. The actual answer was a 5-minute source read away.

**Three cases this phase:**
1. **`off` desugar order** — research and plan both stated `Stack(body, Late(t, transform(body)))`. `pattern.mjs:2236-2238` is `func(pat.late(time_pat))` — transform OUTSIDE Late. Strict parity caught it on first run (8 ours vs 12 Strudel).
2. **`repeatCycles` semantics** — orchestrator brief and plan both said it "slows the body to span n outer cycles." Direct probe + re-read of `pattern.mjs:2530-2545` showed it REPEATS the source cycle on every outer cycle (`delta = cycle - source_cycle`). Opposite of slow.
3. **`ply` desugar via `Fast(n, Seq(body × n))`** — plan and research said this would work. Probe showed our `Fast` IR scales `ctx.speed` without re-playing body, so the desugar collapsed all events into `[0, 1/n)` instead of spreading across `[0, 1)`. Forced a new `Ply` tag.

**Real fix:** Before modeling any external operator, READ the source. Cite `file:line`. Don't trust prose summaries — including your own. The cost of one source read is 5-10 minutes; the cost of debugging an ungrounded model is hours plus a retracted commit.

**Real fix (preventive):** When designing a parity or behavioral-equivalence test against an external system, run the test against the FIRST candidate model BEFORE writing the implementation. The test result is the cheap arbiter. Failing fast against a 10-line probe beats failing slow against a 200-line implementation.

**Lesson:** Lokayata over inference, every time. Plans, research notes, and docs are claims; source code is truth. The strict parity harness IS Lokayata — it confronted three documented-but-wrong models in one phase, each within minutes of running.

**Confirmed by:** Phase 19-03 W2 (off desugar correction), W3 (repeatCycles correction), W4 (Ply tag pivot). Each correction came from running the strict harness against the documented model. Each took <30 minutes from "docs say X" to "source says Y; harness confirms Y." Without the harness, all three would have shipped wrong.


## P44 — Documented spec under-specifies span semantics in re-timing operators

**Category:** grounding / Lokayata enforcement (P43 specialization for span vs. point semantics)
**First observed:** 2026-05-03 — Phase 19-03 (P43's three cases). Recurred 2026-05-04 — Phase 19-04 W3 Struct (4th in-codebase hit).

**Symptom:** A re-timing operator (`struct`, `keepif`, `chunk`, `off`, `late`) is wired with point-membership semantics (`mask.has(e.begin)`) when the source-of-truth implementation uses span-intersection (`appRight`, `e.begin < slotHi && e.end > slotLo`). The unit tests pass for events whose `begin` lands exactly on a mask onset; events whose span CROSSES an onset boundary but whose `begin` lies in a silence slot are silently dropped. Parity diverges on bodies whose events have non-trivial duration.

**Detection signal:** Parity count divergence in re-timing operators when the body has events with `duration > 1/N` (where N = mask resolution). Tests built from "one event per slot" hide the bug; tests with overlapping spans expose it.

**The trap:** The operator's docstring ("draws values from `pat`," "selects events at mask onsets") reads as point-membership. Writing the collect arm with begin-membership produces missing events whose begin times fall in silent slots even though their spans extend into onset slots. Re-reading the doc reinforces the wrong model. Reading the source (`pattern.mjs:1161` for struct → `_keepif` → `appRight`) shows span-intersection is the actual contract.

**Real fix:**
1. For any re-timing operator, READ the source's span-handling primitive (`appRight`, `appLeft`, `_keepif`, `squeezeBind`, etc.) before writing the collect arm.
2. Use `e.begin < slotHi && e.end > slotLo` for span-intersection — never `mask.has(e.begin)` alone.
3. Verify with a probe whose body events have `duration > slot width` — the bug only surfaces under that condition.

**Real fix (preventive):** Add a row to the parity harness for every re-timing operator with a body of `Pure(...)` × N where N events are guaranteed to span more than one slot. The asymmetric coverage forces span-intersection from the start.

**Lesson:** P43 covered "spec says A but source does B" generically. P44 specializes to **span semantics** — the most common failure mode for re-timing operators. The operator's documentation says nothing wrong; it just doesn't say enough. Source is the only place where "what is in the slot" gets defined precisely.

**Confirmed by:** Phase 19-04 W3 Struct (initial collect arm used `mask.has(e.begin)`; parity caught the divergence on a 2-cycle probe; fix used span-intersection). Cumulative: P43's three Phase 19-03 cases + this case = 4 in-codebase hits within 2 phases on adjacent operators.

---

## P45 — Containment-vs-equality on multi-loc `Play.loc` array

**Category:** assertion-shape / observation-conflation (silent test pass under structural mismatch)
**First observed:** 2026-05-04 — Phase 19-05 W7 (D-11 containment-helper design); promoted at 19-05 W9 after RESEARCH §8 + §10 #6 confirmed forward-compat risk.

**Symptom:** A test that asserts `event.loc` equality with a fixed
single-element array — `expect(event.loc).toEqual([{ start: 12, end:
17 }])` — passes on every plain mini-notation input today. When
mini-notation `!N` repetition lands (currently NOT implemented in
`parseMini.ts`; see RESEARCH §8), the same input produces
`Play.loc.length > 1` (multiple source ranges per node from polymetric
or repetition origin). The `toEqual([...])` assertion silently fails
on those inputs, but the parser/collect arm itself is correct — the
test is wrong.

**Detection signal:** Parity test green on plain inputs (`s("bd hh")`
→ single-element loc); red on `!N`-bearing inputs once that mini-notation
feature ships (`s("bd!2 hh")` → 2-element loc on the `bd` event). The
red wave appears at the boundary between "current parseMini coverage"
and "future mini-notation feature." Any test that passes today and
fails the day `!N` lands is a P45 instance.

**The trap:** `Play.loc` is typed `SourceLocation[]` — a list, not
a single value — exactly to support multi-range origin
(`@strudel/core`'s `context.locations` collects all locations a hap's
value flowed through). Tests authored assuming a single-element array
silently bake in the wrong shape. The test author reads "loc is
SourceLocation[]" and writes `toEqual([X])` — semantically: "loc is
exactly one X." But the actual semantic claim is: "loc CONTAINS the
range that produced this event somewhere among its members."

**Real fix (CURATIVE):** Use the D-11 containment helper
`assertEventLocWithin(event, code, subExpr)`:

```ts
const subStart = code.indexOf(subExpr)
const subEnd = subStart + subExpr.length
expect(event.loc!.some(l => l.start >= subStart && l.end <= subEnd))
  .toBe(true)
```

The `some()` is the load-bearing operator. It handles both 1-element
and N-element arrays uniformly: "is there at least one element in
loc whose range falls within the source-range of the originating
sub-expression?" This is the actual semantic claim ("event came from
somewhere inside the sub-expression").

**Real fix (PREVENTIVE):** When adding any new `event.loc` assertion,
default to containment via `assertEventLocWithin`. Reach for `toEqual`
ONLY when:
1. The test exhaustively enumerates a known multi-loc shape (e.g., a
   regression test specifically for a multi-element loc bug).
2. The element count is part of the assertion's claim, not incidental.

If the test author can't articulate which case applies, default to
containment.

**Lesson:** Discriminated arrays in IR types (`SourceLocation[]`,
`PatternIR[]`) carry semantic shape information beyond what the
type declaration says. A list type is a HINT: "this can have more
than one." Testing as if it always has exactly one bakes in a
silent gap. The shape of the list is part of the contract; tests
should mirror the contract's flexibility, not the current
implementation's narrowness.

**Confirmed by:** Phase 19-05 D-11 (containment-match parity
assertions explicitly chosen over exact-offset matching for this
reason); W7 the 17 per-method `it()` blocks + the 5 round-trip
subset blocks all use `assertEventLocWithin`; RESEARCH §8 verified
that `!N` is not implemented today but the type's multi-element
shape is forward-compatible. The first concrete failure case will
appear when `!N` lands in a future mini-notation phase; tests
written today using `assertEventLocWithin` will continue to pass
without changes.

## P46 — Display-layer projection that hides nodes by default must whitelist parser-failure escape-hatch tags

**Symptom (would-be):** Strudel users see a clean projected Inspector
tree of their `.layer().jux().off()` patterns — but when their code
contains a typo like `nooote("c d")` (unparseable), the parser falls
back to a `Code` IR tag and the projected tree shows... nothing.
The error is invisible. The user sees an empty tree and assumes
everything is fine, when in fact the parser silently dropped a
significant chunk of source. By the time they notice the missing
audio output, they have no Inspector signal pointing at the failing
expression.

**Caught BEFORE shipping (planning-time catch).** Phase 19-06
RESEARCH §3 audit + NEW pre-mortem #8 surfaced the trap during
planning. Without the audit, the projection rule "if `userMethod ===
undefined`, splice children into parent (D-02 hide rule)" would have
applied uniformly — and `Code` carries `userMethod === undefined`
(parser-failure fallback, no user-method name to record).

**Root cause:** Display-layer projections that operate on
`userMethod` as a "did the user author this" signal conflate two
populations:
1. Synthetic intermediate tags created by desugars (Late inside
   `.off()`, FX(pan) inside `.jux()`) — `userMethod === undefined`
   because the user didn't author them directly. SAFE TO HIDE.
2. Parser-failure escape-hatch tags (`Code` today; future
   `Unparseable`, etc.) — `userMethod === undefined` because the
   parser couldn't classify the input. MUST NOT HIDE.

Both populations look the same to a naive `userMethod === undefined`
check. The hide rule that's correct for population 1 silently
degrades debuggability for population 2.

**The trap:** Adding a "projection" or "user-friendly view" layer
that filters by absence-of-author-signal. The natural rule
("undefined → hide") is right 99% of the time and catastrophically
wrong the remaining 1% — and the wrongness manifests as INVISIBLE
output, the worst possible failure mode for a debugger.

**Wrong fix (TEMPTING):** Make the parser populate `userMethod`
on Code-tags too (e.g., `userMethod: '?unparseable'`). This:
- Pollutes the `userMethod` namespace with non-user-typed values,
  breaking PV31's exact-token taxonomy
- Forces every consumer to filter the synthetic strings out of
  search/grouping/canonicalization
- Doesn't actually fix the underlying problem — the projection
  layer still has to decide WHEN to render the parser-failure
  escape-hatch differently from a real method

**Real fix (PREVENTIVE):** Maintain a small whitelist of tag-name
exceptions in the projection's hide-rule. Today the whitelist is
`{ Code }`. New parser-failure escape-hatches added in the future
get added to the whitelist explicitly. The check becomes:

```ts
if (node.userMethod === undefined && !PARSER_FAILURE_TAGS.has(node.tag)) {
  // hide: splice children into parent
} else {
  // render with raw tag name
}
```

Where `PARSER_FAILURE_TAGS = new Set(['Code'])` is a module-scope
constant adjacent to the projection rules.

**Lesson:** Display-layer rules that operate on absence-of-signal
to hide nodes need to enumerate which absence-bearers are
intentionally invisible vs. which are visibility-critical-failures.
The default-hide rule is a debuggability footgun unless the
escape-hatch population is explicitly named.

**Confirmed by:** Phase 19-06 RESEARCH §3 (userMethod field
coverage audit caught the gap); CONTEXT NEW pre-mortem #8 (recorded
the trap and the fix); PLAN T-02 (`projectedLabel` includes the
explicit `Code` case returning `'Code'`); T-03 unit test
("Code-fallthrough whitelist test — Code MUST render with label
'Code', not be hidden"); PR #78 ships the whitelist as
`PARSER_FAILURE_TAGS` (or equivalent — final naming locked at
implementation). Promotion based on a single occurrence justified
because (1) the failure mode is silent (would not have been caught
post-ship by tests that don't probe parser-failure inputs) and
(2) the trap is structurally tempting at every future projection
layer (FE error messages, code-synthesis preview, transform-graph
display, bidirectional-editing surfaces — each is its own future
opportunity to repeat the mistake without this catalogue entry).

## P47 — Stage-transition synthetic metadata escape (P39 specialization)

**Symptom:** A per-stage round-trip test that asserts "every `loc`
field present at stage N is preserved at stage N+1 with same byte
offsets" fails on the multi-track outer Stack wrapper at the
MINI-EXPANDED → CHAIN-APPLIED transition. The outer Stack carries
`loc: [{start: 0, end: code.length}]` at MINI-EXPANDED but has no
loc at CHAIN-APPLIED. The probe reports "loc dropped at CHAIN-APPLIED"
— but no real source-correspondence was lost; the outer loc was
synthetic-from-RAW for tab visualization, not a real anchor.

**Caught at:** Phase 19-07 PR-B T-10.b1 (universal loc-equality
probe, REV-2). The 6-fixture set included two multi-track `$:`
patterns; both failed the naive equality assertion. **Catching
observation:** `expect(caKeys.has(key)).toBe(true)` failed with
`Stack tag=Stack start=0 end=28` for `$: note("c d")\n$: s("bd hh")`.

**Root cause:** A pipeline stage may carry a SYNTHETIC anchor whose
purpose is presentation (Inspector tab visualization showing "what
this stage saw") rather than source-correspondence. When a later
stage rebuilds the structure to match the canonical engine shape,
it intentionally drops the synthetic anchor. A test that treats
every loc as a real source-correspondence will report a false drop.

The trap is two layers deep:
1. **At impl time:** the synthetic anchor on RAW's outer Stack is
   correct (it tells RAW-tab viewers "this is the source span this
   stage operated on"). Today's `parseStrudel(code)` for multi-track
   `$:` produces an outer Stack with NO outer loc — see
   `parseStrudel.ts:66`'s `IR.stack(...tracks.map(parseExpression))`.
   So CHAIN-APPLIED faithfully matches today's shape by dropping
   the synthetic.
2. **At test time:** a naive "every loc preserved" assertion would
   force CHAIN-APPLIED to retain the synthetic, breaking byte-shape
   parity with `parseStrudel`.

**The trap:** Either of the two wrong fixes:
- (a) Force the synthetic outer loc to survive into CHAIN-APPLIED.
  This breaks byte-shape parity with today's `parseStrudel(code)`
  output; the regression sentinel (T-05.c) would catch it but only
  for fixtures that hit the multi-track path. Other fixtures pass
  silently.
- (b) Drop the synthetic outer loc at MINI-EXPANDED to make the
  test pass. This breaks the RAW tab's source-span visualization,
  which IS the intended affordance — the user sees "this stage
  operated on the full source." A blind regression unrelated to
  the test's actual goal.

**Real fix (skip-the-synthetic):** When walking stage transitions
for round-trip equality, identify and skip synthetic-from-stage
anchors. Concretely: a Stack at the root with `userMethod ===
undefined` is a synthetic-from-RAW outer wrapper for multi-track
$: input. Skip its loc entry from the comparison; assert all
non-synthetic loc entries (every Cycle/Seq/Stack/etc. inside the
tracks) are preserved.

```ts
const isSyntheticOuter =
  me.tag === 'Stack' &&
  (me as { userMethod?: string }).userMethod === undefined
const meEntries = collectLocEntries(me).filter(
  (e, i) => !(isSyntheticOuter && i === 0),
)
```

**Why this is a P39 specialization:** P39 names the general failure
of parser pipelines that trim/concat — losing source-range info
silently. P47 is the controlled, documented case: the pipeline
deliberately drops a synthetic anchor at a stage transition to
match the canonical downstream shape. The synthetic was correctly
introduced (RAW tab UX); its drop is correct (FINAL parity); the
test must distinguish synthetic from real anchors.

**Generalization to future stages:** Any future stage transition
that inserts a presentation-only anchor must mark it (e.g., via
a sentinel `userMethod` value or a `synthetic: true` field) so
round-trip tests can identify and exclude it. Or the convention —
"at stage N, an outer wrapper with `userMethod === undefined` is
synthetic" — must be documented and respected by every transition
test.

**Confirmed by:** Phase 19-07 PR-B T-10.b1 (universal loc-equality
probe; 6 fixtures including 2 multi-track `$:`); the FINAL parity
sentinel T-05.c (held green across all fixtures). The 6-fixture set
is the regression surface.

**Cross-references:**
- **P39** — parser pipelines that trim/concat destroy source-range
  info. Parent pattern.
- **PV25** — parser preserves offsets at every hop. The invariant
  P47's specialization respects: real anchors are preserved;
  synthetic-from-stage anchors are exempted from the invariant
  with explicit documentation at the catalogue level.
- **D-02 / 19-07 stage boundaries** — the source of the synthetic
  anchor convention.
- **D-04 / 19-07 uniform projection** — the user-visible payoff
  of the synthetic anchor (Inspector tab UX).


## P48 — External-store hook returns the live mutable buffer reference; downstream useMemo goes stale

**Pattern:** A React hook subscribes to a module-level mutable
collection (ring buffer, Set, in-place-sorted array) and returns
the live reference from `getStorage()` directly. A consumer derives
state with `useMemo([liveRef, ...])`. Pushes that GROW the buffer
trigger setState (subscriber fires) and the memo recomputes — looks
correct in casual testing. Pushes that EVICT (in-place `shift`,
`splice`, in-place mutation) preserve the array's identity but
change its contents. The dep array sees a referentially stable
value, useMemo skips recomputation, and the cached derived value
goes stale.

**Symptom:** UX hazard that depends on the derived state crossing
a buffer mutation boundary. Manifests as: a "found" indicator that
never updates after the underlying entry is evicted, a count that
freezes at a stale total, a "is in" check that returns true
indefinitely after removal.

**Detection:** the test for the eviction path fails. Pure-grow
tests pass. Code review surfaces this when reading the hook —
"why does it return getStorage() directly?" The bug is in the
return statement, not in the consumer.

**Wrong fix (the trap):** plumb a version counter through every
consumer and add it to every dep array. Works but pushes the
contract into every call site — a future consumer that forgets the
counter is silently buggy.

**Right fix:** shallow-copy at the hook boundary —
`return [...getStorage()]`. Fresh reference every render. Every
useMemo that depends on the returned value recomputes whenever the
buffer mutates, regardless of mutation kind. Cost: one O(n) copy
per render, bounded by the buffer's max capacity. For ring buffers
with bounded capacity (Phase 19-08's 500 cap) the cost is
negligible compared to the React commit cost.

**Even better fix (future):** migrate to `useSyncExternalStore`
with `getSnapshot()` that returns a fresh reference. Canonical
React 18+ external-store pattern. Equivalent semantics, no manual
version counter.

**REF:** Phase 19-08 PR-B T-15 probe (g). Surfaced by the
"pin-by-reference: held snapshot survives eviction" test. Fix in
commit `3e67b7b` (`useCaptureBuffer` returns `[...getCaptureBuffer()]`).
Codified as PV34.


## P49 — Inheriting upstream design-doc phrasing without classifying audience ships the wrong primitive

**Pattern:** A phase's CONTEXT.md inherits its framing from an
upstream design doc (north-star, product roadmap, thesis). The
framing reads natural-language ("scrub the trace to see the audible
bug in time") and is interpreted at face value. The phase plans
mechanics — capture buffer, scrub UI, playhead, J/K step — without
asking the upstream question: *who is the audience for the scrub?*
A developer scrubbing eval history wants tick-per-eval. A musician
scrubbing musical time wants row-per-voice × bar-grid. Both are valid
"scrub" mechanics. They are mutually incompatible primitives. The
inherited phrasing didn't distinguish them; the phase shipped one
and called it "the timeline." User reaction at close-out: "this
isn't useful — I expected the other one."

**Symptom:** Tests pass. Goal sentence is satisfied verbatim. PR
descriptions look clean. Self-review (AnviDev §5) finds no gaps.
Verification (`/anvi:verify-phase`) passes with at most low-severity
warnings. Then the user uses the feature for one minute and says
"this is not what I wanted." The framing held; the audience-
mental-model didn't. The bug isn't in the code — the bug is in the
discuss-phase that never happened, or that happened without an
audience classification gate.

**Detection:** Three signals:
1. The phase name OR goal sentence contains a debugger-shaped verb
   (`debug`, `inspect`, `trace`, `scrub`, `replay`, `step`, `pin`).
2. The CONTEXT.md does not explicitly state who the audience is.
3. The framing was lifted from an upstream doc (north-star, thesis,
   roadmap) without the inheriting phase re-deriving it from current
   user-need.

If all three are present, the phase is at risk of P49 BEFORE
implementation begins. The catch-point is discuss-phase, not
plan-phase or executor.

**Wrong fix (the trap):** ship the feature, then add a "v2" follow-up
that "really means it" with the multi-track UI. This compounds the
problem — now the surface has two debugger primitives competing for
the same chrome, and the original (low-value) one has user-facing
weight (rename costs, deprecation period, doc rewrites). Worse: the
v2 ships with the same audience-ambiguous framing because the
discuss-phase question was never added to the workflow.

**Right fix:** When the symptom appears, do TWO things:
1. **Reframe the shipped feature** as serving its actual narrow
   audience (here: the developer-console eval-history). Rename to
   match vocabulary. Demote in chrome. Document audience in CONTEXT
   retroactively.
2. **Add the audience-classification gate to discuss-phase** so the
   next debugger-shaped phase doesn't inherit-and-ship the same
   ambiguity. Codified as PV35 (audience-classification gate). The
   gate forces every CONTEXT.md for debug/inspect/trace/timeline/
   playhead/scrub/breakpoint/replay phases to lock `D-AUDIENCE:
   developer | musician`.

**Even better fix (proactive):** before plan-phase, run the audience
classification as the first discuss-phase question. If the answer is
ambiguous, split the phase into two surfaces (shared data layer, two
distinct UIs) BEFORE writing the plan.

**REF:** Phase 19-08 close-out (2026-05-06). Inherited phrase: "scrub
the trace to see the audible bug in time" from
`artifacts/stave/IR-DEBUGGER-NORTH-STAR.md` Step 4. CONTEXT.md
implemented it as tick-per-eval (developer audience) but never
labeled it as such; user expected row-per-voice × bar-grid (musician
audience). Codified as PV35. Reframe plan: rename
`IRInspectorTimeline` → `IRInspectorEvalHistory`, demote in chrome,
build musician timeline as separate phase with audience locked.

### P33: Silent-drop in `applyMethod`'s `default:` arm — unrecognised chain methods become invisible to the debugger

**STATUS: ELIMINATED 2026-05-08 (PR #96 / PV37).** Entry retained as
historical record + cautionary tale for future "defensive default that
swallows the signal" diagnoses. The silent-drop site at
`parseStrudel.ts:729` and ~10 typed-arm failure branches all wrap via
`wrapAsOpaque(inner, method, args, callSiteRange)`. Detection signal
inverts: feeding `note("c").<unknown>(0).<unknown>(1)` to
`parseStrudel` now produces a `Code-with-via` wrapper carrying both
unknown call sites; `toStrudel` round-trips byte-equivalent.

**Symptom (parser-side):** The user types `note("c4 e4").s("sawtooth").release(0.3).viz("pianoroll")`.
After `parseStrudel(code)`, the produced IR carries Play(c4) Play(e4)
with `params.note` set, NO `params.s`, NO `release`, NO `viz`.
Surrounding chain — gone. `toStrudel(ir)` re-emits `note("c4 e4")` only.

**Symptom (debugger-side):** The runtime still applies `.s("sawtooth")`
and `.release(0.3)` (Strudel's own dispatch); audio plays as the user
expects. But the IR Inspector / MusicalTimeline / click-to-source see no
representation of those methods. Setting a breakpoint on the line is
either impossible (no IR node owns that range) or fires for the wrong
event (the underlying `note(…)` Plays). The debugger silently lies
about what is executing.

**Symptom (downstream):** `groupEventsByTrack` falls back to
`evt.trackId ?? evt.s ?? '$default'`. Without `params.s`, every
`note(…).s(...)` block collapses into a single `$default` row in the
timeline — multiple `$:` blocks with distinct intentions merge into
one indistinguishable row. User reports "the timeline doesn't show
my first block."

**Root cause:** `applyMethod` (parseStrudel.ts:303-732) is a switch over
~30 known methods. The `default:` arm at parseStrudel.ts:729-731 is
`return ir` — an unrecognised method returns the *receiver* unchanged,
discarding the typed source. The switch was scoped during phase 19 to
model *transforms* (Category A: fast/slow/every/jux/layer/…). Per-event
control params and synth selectors (Category B: s/n/release/attack/…)
were added opportunistically — only those a downstream gate explicitly
needed (gain/lpf/pan/…). No phase ever scoped "the IR must wrap or
recognise *every* chain method." The silent drop survived because the
absence is silent — no warning, no test failure, the underlying pattern
parses fine and audio plays via Strudel.

**The trap (wrong fix):** "Add cases for the missing methods one by one
until coverage is complete." This treats the symptom (specific
unrecognised method X) instead of the root cause (the `default:` arm
silently discards data). It is also unbounded: Strudel adds methods;
controls.mjs is open; users define custom helpers. Coverage is a
moving target.

**The real fix (PV37):** The `default:` arm wraps the receiver in an
opaque `Code`-with-loc node carrying the entire `.method(args)` call
site as its source range. The wrapper:
1. Preserves the typed source (round-trip honest)
2. Gives the debugger a node to point at (PV36 loc-completeness)
3. Allows the inspector to render `[opaque: .release(0.3)]` with the
   inner pattern still inspectable
4. Makes coverage *gradual* — typed arms can be added when stepping
   inside the method matters; until then, the wrapper is sufficient

The fix converts ~25 missing-method bugs into a single architectural
invariant: "no method silently discards source." Each typed arm added
later is an *upgrade* (opaque → steppable), not a bug fix.

**Detection signal:** Run `grep -n "default:" packages/editor/src/ir/parseStrudel.ts`
on the `applyMethod` switch. If the arm is `return ir` (or any variant
that does not produce a node carrying `callSiteRange`), the trap is
present. Confirm by feeding `note("c").<unknown>(0).<unknown>(1)` to
`parseStrudel` and checking that the produced IR is `Play(c)` —
identical to `parseStrudel('note("c")')`. If the two are
indistinguishable, the silent-drop is live.

**Family:** Same shape as P21 (silent fallback wins over working primary)
and P31 (extension map mismatch excludes silently). All three: a
defensive default that swallows the very signal that should fire.

**REF:** parseStrudel.ts:729-731 (the silent-drop site); PV37 (the
invariant the fix codifies); PV36 (the loc-completeness contract the
wrapper restores); 2026-05-07 disparity-catalog conversation (where the
trap class was named).

## P50 — Workaround cascade: each fix-up papering over a missing contract creates a new symptom

**Pattern:** A symptom appears (e.g. click-to-source resolves to the
wrong line for a transform-derived event). Instead of asking "what
contract is missing?" the response is to add a fallback layer (regex
walk over `$:` blocks). The fallback fixes the visible case but produces
a new failure mode for a different shape (sample-name lookup needed).
Add another fallback. Repeat. Each fallback layer builds on the previous
one's framing — none of them surface the actual question: *the IR's
provenance channel is missing a contract*.

**Symptom (process-side):** A short series of commits — usually 3 to 6
— with messages like `fix: add X fallback for Y`, `fix: prioritize A
over B in walker`, `fix: handle the C edge case`. Each individual diff
is small and reasonable. Each individual test passes. The symptom
returns under a slightly different shape and a new fallback is added.
Tests lock in the workaround behaviour (see P51) so the workaround
becomes the contract.

**Symptom (architectural-side):** A function that grew from one path to
five paths. A switch statement with a `default:` arm full of fallbacks.
A resolver that tries `A ?? B ?? C ?? D` where each branch is a different
heuristic, none of them named, none of them principled.

**Detection signal:** Three signals, each independently load-bearing:
1. **Commit log shape:** N successive `fix:` commits in the same area
   within a short window, each addressing a different shape of the same
   symptom class.
2. **Resolver fan-out:** the offending function has an early-return
   ladder where each `if` is a different heuristic. Read top-down: each
   condition is an attempt to detect a case the previous attempt missed.
3. **No invariant cited:** none of the commits reference a vyāpti, a
   contract, or a structural rule. They reference the specific shape
   they fix.

If 2+ of the 3 signals fire, the cascade is live and the framing is
wrong. STOP adding fallbacks.

**The trap (wrong fix):** "One more layer will catch the remaining
case." The trap is that this is plausible at every individual step —
the new case really did need handling, the new fallback really does fix
it. The cumulative cost (resolver complexity, test coupling, framing
debt) is invisible at each step.

**The real fix:** Ask "what contract is missing?" Read the producer side
(parser, builder, source-of-truth). Find the case where the producer
DOESN'T attach the channel the consumer is trying to recover. Codify the
producer-side contract as a vyāpti. Replace the resolver fallbacks with
a single one-line consumer that trusts the contract. The fallbacks
become deletable; the contract is the new abstraction.

**Family:** Same shape as P21 (silent fallback wins over working
primary), P31 (extension map mismatch excludes silently), P39 (parser
pipelines that trim/concat destroy provenance). All share the pattern:
the producer side has an unwritten contract; downstream consumers reach
for compensation logic; the compensation hides the original gap.

**REF:** Slice-γ click-to-source (5 successive fix commits cc19d5b,
571898d, 599826c, e71627e, eab49d5 in 2026-05-08 — the canonical
example; reverted in PR #95 once PV36 was codified). PV36 (the contract
that eliminated the resolver). 20-03 wave γ commit body (records the
recognition that "5 fix-ups were instances of one root cause"). Generic
process-level cousin to PV36's invariant: when the consumer reaches for
compensation, ask the producer.

**Discipline held across debugger v2 (2026-05-08):** Phases 20-05/06/07
all maintained single-strategy match. `findMatchedEvent(loc, begin,
lookup)` is THE match function — one map lookup, one tie-break loop,
miss → undefined (PV37-aligned runtime-only path). NO fallback shapes
("if no match by id, try by loc; if no match by loc, try by begin")
anywhere in the diff. The temptation surfaces every time a hap doesn't
match (e.g. fast(N) duplicate disambig at the timeline subscriber);
each time, the right answer was tighter producer-side semantics
(content-addressed irNodeId, leaf-only assignment, snapshot lookup
tables) — not consumer-side compensation. The breakpoint hit-check at
StrudelEngine.ts:219 is the same: `if (irNodeId && store.has(id))
pause()` — single check; no ladder.

## P51 — Tests asserting symptom behaviour lock the bug into the contract

**Pattern:** A bug ships. Someone writes a test that asserts the
buggy-but-stable output ("ply(2.5) produces just the 2 unscaled events
and silently drops the 0.5 scaled portion" / "Pick userMethod fixture
returns events without selector loc"). The test passes because it
documents what actually happens. Later, the bug is fixed (a new contract
lands). The test now fails — but it fails because it was asserting the
SYMPTOM, not the SPEC. Worse: if the test is interpreted as
authoritative, the fix gets reverted.

**Symptom:** During a contract-landing PR (PV36, PV37, etc.), one or
more existing tests fail. The diff that caused them is correct per the
new contract. The test assertions look reasonable in isolation.

**Detection signal:** Three checks at PR-author time:
1. The failing test pre-dates the contract being landed.
2. The test asserts a specific output shape (count, exact event list,
   exact projection text) without citing an invariant.
3. Updating the test to assert the new contract's output is mechanical —
   no semantic re-interpretation of what the test was probing.

If all three: the test was documenting a symptom. Update the assertion
in the same PR; add a comment citing the contract reference (e.g.
`// PV37 — wrap contract: ply(2.5) failure branch wraps; was P33`).

**The trap (wrong fix):** Revert the contract change because "tests
fail." Or: keep the contract, leave the symptom-tests skipped/disabled,
ship anyway. Both produce silent erosion: option 1 reverts the work;
option 2 leaves the bug-pattern living in the codebase as inert
documentation, still findable by `grep` and likely to be re-asserted
elsewhere.

**The real fix:** When landing a contract, audit tests in the
contract's domain BEFORE writing the implementation. Surface tests that
assert the OLD broken behaviour and update them in the same PR with
explicit references to the new contract. Each updated test is now
documentation OF the contract, not documentation AGAINST it.

**Family:** Same shape as P50 (workaround cascade — there, the cascade
is in production code; here, the cascade is in test fixtures
calcifying the cascade's outputs).

**REF:** Phase 20-04 deviation #3 (3 pre-existing tests asserted P33
silent-drop bug behaviour: `integration.test.ts` ply(2.5) test,
`parity.test.ts` Pick userMethod test, `app/irProjection.test.ts` pick
projection fixture; updated each with phase-reference comments in PR #96
once PV37 wrap contract landed). Slice-γ tests — never written because
the resolver was a fallback ladder, but the same principle would have
applied if any were. PV36 / PV37 (the contracts whose landing surfaced
the pattern). P50 (the production-code cousin).

**Re-applied successfully (2026-05-08, PR #103 phase 20-06):** when
20-06 replaced cycle-derived glow with hap-driven (PV38 consumption),
the 3 cycle-derived active-glow tests at MusicalTimeline.test.tsx:549-630
locked the OLD contract. P51 protocol applied verbatim: REPLACE in place
within the existing describe block, update header to "(20-06 —
hap-driven; replaces 20-02 cycle-derived per P51)", inline PV38
reference comment. Audit grep at plan time confirmed zero
`.toEqual({...begin...})` shape-locking assertions elsewhere. Pattern
now self-applying: each contract landing in the debugger sequence
(PV36, PV37, PV38) has surfaced and absorbed its P51 instances within
the same PR — no inert symptom tests left behind.

## P52 — Silent-semantics-after-PV37: typed character lands as IR but downstream effect vanishes

**Status:** RESOLVED 2026-05-09 for the 10-method whitelist (Phase 20-10).
Open for the remainder of the silent-drop list (release/attack/sustain/
decay/crush/distort/shape/amp/detune/octave/tremolo/lfo/legato/unison/
coarse/fine) until follow-up param phase.

**Pattern:** PV37 (wrap-never-drop, 20-04) ensures every chain method
has an IR representation. But if the IR representation is `Code`-with-
via (opaque wrapper) instead of a typed semantic tag, `collect.ts case
'Code'` walks `via.inner` WITHOUT reading `via.method` / `via.args` —
the wrapper preserves source range only, not effect. Downstream
consumers that read event-level fields (`evt.s`, `evt.gain`) see null
because nothing wrote them. PV37's representation honesty creates a
sibling silent-drop class at the SEMANTICS layer.

**Symptom:** `evt.<key> === null` downstream of a chained `.<key>(value)`
invocation in source. The IR has the chain present (PV37 honest); the
effect on event-level fields is missing. Issue #108 manifestation: the
user's `note(...).s("sawtooth")...` rendered all events on a single
`$default` track because `groupEventsByTrack` falls back to `'$default'`
when `evt.s ?? '$default'`. Three synth voices and four drum stems
collapsed into one bucket.

**Detection signal:** Three checks at debugger time:
1. Test the IR representation of the chain — `parseStrudel(code).tag` is
   `'Code'` with `via.method === '<key>'`. Confirmed = PV37 honest.
2. Test the collect output — `collect(parseStrudel(code))[0].<key>` is
   `null`. Confirmed = SEMANTICS silent-drop.
3. Compare to Strudel runtime — `(await evaluate(code)).pattern.queryArc(
   0, 1)[0]` carries a non-null `<key>`. Confirmed = drift between IR
   semantics and Strudel runtime semantics.

If all three: the method is PV37-honest but P52-broken. Promote it to a
typed semantic IR tag in the parser arm.

**The trap (wrong fix):** "Read `via.method` and `via.args` in `collect.
ts case 'Code'`." This couples the opaque wrapper to method-specific
semantics; turns PV37's clean fallback into a switch over method names;
does NOT generalize when the method's argument shape needs structural
introspection (e.g. pattern-args like `.s("<bd cp>")`). The wrapper is
representation-deferred BY DESIGN — coupling it to semantics defeats
PV37's purpose.

**The real fix:** Promote the method to a typed semantic IR tag at the
parser arm (`Param`, `FX`, etc.). The typed arm in `applyMethod`
constructs the tag explicitly with structured `value`; `collect.ts` has
a dedicated case that reads the structured `value` and merges into
`ctx.params` / spreads into the event. This is the SEMANTICS layer of
PV37: representation honesty (PV37) + effect honesty (PV39) = full
observation completeness.

**Family:** Same shape as P33 (silent-drop, REPRESENTATION class —
closed 20-04). P33: "method's typed character vanishes from IR." P52:
"method's typed character is in IR but its effect vanishes from
downstream events." Both are silent. Both are sibling classes — same
detection-style (compare typed source to downstream output), different
root cause (parser layer vs collect layer).

**Cross-ref:** P37 (defer-comment-is-the-bug — the `// walks via.inner`
comment in `collect.ts` near line 334 WAS the bug for the 10
whitelisted methods; it documented the SEMANTICS deferral as if it
were a deliberate choice). P50 (workaround cascade — coupling `case
'Code'` to method-specific semantics would create new symptoms when
pattern-args appear; the typed-arm-promotion sidesteps this entirely).

**REF:** Phase 20-10 PLAN §0; PV39 (the vyapti codifying the
SEMANTICS-completeness sibling layer); `packages/editor/src/ir/
collect.ts:case 'Param':` (the typed-arm fix shape).

### P37: "Defer-comment is the bug" — TODO marking next to silent data loss

**Root cause:** A code site contains an explicit "v0 defers this; v1 will handle" comment, AND the deferred work causes silent data loss in the present tense (not a future feature gap). The comment turns the bug into a feature in the reader's mind: "this is documented, therefore it's not a problem." But the deferred work is exactly what makes downstream consumers behave wrong, RIGHT NOW.

**Detection signal:** A TODO / "for v0" / "future consumer" comment lives directly above a parser/projection/transform site whose output flows to a feature that's silently degraded. Search hits that mention a comment like "X is dropped here for v0 — when a consumer needs Y, fix this" while a feature shipping today already needs Y.

**The trap:** You read the comment and accept the deferral as documentation. Tests pass because they don't probe the deferred dimension. The bug surfaces only via end-user observation (in this case: clicking a sample-track event navigates to line 1 of the file). When you finally trace it, you re-read the same comment and feel relieved it's a known limitation — and risk re-deferring.

**The real fix:** When a defer-comment is found next to a feature already in production, IT IS A BUG, not a TODO. Promote it to an issue immediately. Carry the fix in the same PR as whatever surfaces it. Replace the defer comment with the explainer for what was lifted (so future readers see the v1 contract, not the abandoned v0 deferral).

**Universal principle:** Documentation that defers something is also a contract about what is and isn't supported. A defer-comment + a downstream feature relying on the deferred work are mutually exclusive — one of them is lying.

**REF:** Phase 20-08 follow-up #107 (2026-05-09). `parseStrudel.ts:248-250` had: `// stack(a, b, c) — Argument offsets are dropped here for v0 — when a future consumer needs loc through stack(), splitArgs would need to return slice positions too.` MusicalTimeline click-to-source had needed loc through stack() since Phase 20-01 (line numbers wrong since then; nobody traced to this comment). Surfaced via user observation, fixed in commit 7c64d77 with `splitArgsWithOffsets` helper. Defer-comment replaced with v1 explainer per this protocol.

### P38: Two-state proxy conflates a tri-state model

**Root cause:** The runtime has a tri-state transport model (`stopped | playing | paused`), but downstream consumers only ask one binary question (`isPaused?`). The negation `!isPaused` reads true for BOTH `stopped` and `playing` because the engine is "not paused" in either case. Code that branches on `!isPaused` therefore conflates the two states.

**Detection signal:** A bool-returning accessor named `isX()` / `getX()` is used as a proxy for "the active state." On scrutiny, the runtime has 3+ states, and `!isX()` collapses two of them. A bug surfaces specifically in the underrepresented state (stopped, in this case).

**The trap:** You add a guard like `if (!getIsPaused()) doPlayingThing()`. Tests pass because they exercise paused vs not-paused, but never construct the third state (stopped) explicitly. Symptom appears only on the third path: a behaviour that should be playing-only fires from stopped too. Adding more paused/not-paused guards compounds the trap.

**The real fix:** Expose the missing state explicitly. Don't synthesise it from `!other_state` at every call site. In our case: add `getIsPlaying()` returning `isPlayingState && !getPaused()` directly on the runtime; consume that at every place that wants "actively producing audio." The two-state proxy goes away.

**Universal principle:** Every bool accessor implies a two-state world. If the underlying world has more states, EVERY call site is at risk of conflating two of them. Solution is at the boundary, not the call site.

**REF:** Phase 20-08 follow-up #105 (2026-05-09). `MusicalTimeline.tsx:322` captured `wasPlayingOnScrubStartRef = !getIsPaused()`; for a stopped engine this read true, and release fired `runtime.resume()` → audio started from cycle 0. Fix added `getIsPlaying()` to `LiveCodingRuntime`, threaded through StrudelEditorClient + StaveApp + MusicalTimelineProps, and changed pointerdown to read it directly. Commit d0a59df.

### P39: jsdom-24 PointerEvent constructor swallows init properties

**Root cause:** jsdom 24's `PointerEvent` constructor accepts `PointerEventInit` per the type signature, but on dispatch the produced event has `clientX`, `clientY`, `pointerId`, and `button` reading as `undefined`. Init dict is silently dropped at construction time. RTL's `fireEvent.pointerDown(target, init)` builds the event via this constructor — the init dict never reaches the handler.

**Detection signal:** A pointer-handler test asserts a side effect should fire on `pointerdown` (e.g. mock spy called) but the spy is never called even though the binding is correct. Inserting `console.log(e.button)` inside the handler shows `undefined`. Production guards like `if (e.button !== 0) return` early-return, swallowing the test path.

**The trap:** You suspect React batching, ref staleness, or wrong handler binding. You verify the binding by hand (it's correct). You finally instrument and discover the init dict is dropped.

**The real fix:** Construct the event via `new PointerEvent(...)` (or `MouseEvent` fallback) and force-define each lost property post-construction with `Object.defineProperty(ev, 'pointerId', { value, configurable: true })`, then `target.dispatchEvent(ev)`. Helper shape:

```ts
function dispatchPointer(target: HTMLElement, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', init: { clientX: number; pointerId: number; button?: number }): void {
  const ev = new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, ...init, pointerType: 'mouse' })
  Object.defineProperty(ev, 'pointerId', { value: init.pointerId, configurable: true })
  Object.defineProperty(ev, 'clientX', { value: init.clientX, configurable: true })
  Object.defineProperty(ev, 'button', { value: init.button ?? 0, configurable: true })
  target.dispatchEvent(ev)
}
```

**Family:** P11 variant. P11 catalogued the same trap class for `DragEvent`. P39 is the PointerEvent variant — same fix shape, different event constructor.

**REF:** Phase 20-08 wave α (commit 037a701). `MusicalTimelineScrub.test.tsx:108-140` ships the canonical helper. All 6 of the wave-α scrub tests initially failed silently because `e.button === undefined !== 0` early-returned the handler before any spy was called.

## P53 — `groupEventsByTrack` inferring identity from `evt.s` is a fallback, not a primitive

**Status:** RESOLVED 2026-05-09 for the `$:` and `.p()` track-identity sources (Phase 20-11). Open for future track-identity sources (e.g. `.bus()`, `.scope()` — if added in a future phase).

**ORIGIN:** Phase 20-08 / γ-4 manual gate session — two identical `$: stack(s("hh*8")...)` drum blocks rendered as a single timeline row. Diagnostic walk at CONTEXT §0 traced the collapse to `groupEventsByTrack.ts:41` keying on `evt.trackId ?? evt.s ?? '$default'` — a 3-level fallback ladder. When the parser produced events without a `trackId`, the fallback to `evt.s` bucketed two distinct user-authored tracks together because they happened to play the same sample.

**Trap class:** A consumer infers identity from event content when the producer never asserted it. The inference is structurally lossy: any time two distinct authored sources share content (same `s`, same `note`, etc.) the inference cannot recover the distinction. Sample-derived fallbacks LOOK reasonable in single-track inputs (one bucket, one sample, one row) but silently collapse multi-source inputs that share content.

**Detection signal:** the user has TWO `$:` blocks with identical (or sample-overlapping) contents; the timeline shows ONE row instead of two; audio doubles audibly. Or: a single-source pattern with a chained `.p("custom")` shows up labeled by its sample (`bd`) instead of the user-typed track name (`kick`).

**Wrong fix (cascade trigger — see P50):** "Add `evt.s + evt.gain` or `evt.s + position-in-source` or some other multi-field key to disambiguate." Each compound key is a workaround that papers over the missing primitive. The user can always write a new fixture that collapses the latest key — `$: s("bd").gain(0.3)` twice still collides on `(s, gain)`.

**Real fix:** Populate `evt.trackId` at the parser level using the user's authored identity assertion. The `$:` block index (`d{N}`) IS the user's track-identity claim; preserve it through the IR (PV37 wrap-never-drop model) → collect (`case 'Track'` ctx spread + makeEvent conditional spread) → presentation. The fallback to `evt.s` stays for hand-built IR fixtures (no Track wrapper ever applied) but never fires for parser-derived events.

**Cross-ref:** P33 (silent-drop, REPRESENTATION class — closed Phase 20-04). P50 (workaround cascade — adding a second compound key when the first didn't disambiguate is the canonical cascade trigger). P52 (mount-path) — BOTH MusicalTimeline call sites (`:445` dot + `:510` per-event background) had to swap together; partial migration would partially-mask the trap by colouring half the chrome from the new palette and half from the old.

**Pair-of:** PV40 (track-identity-parser-assigned, codified Phase 20-11). P53 names the trap; PV40 names the contract that closes it.

**REF:** Phase 20-11 PLAN §0; `groupEventsByTrack.ts:41` (the 3-level fallback); `case 'Track'` arm in `collect.ts`; `parseStrudel.ts:97-130` (parser-side identity assignment).

## P54 — Label-trap-at-typical-zoom: chrome bars carry no text

**Class.** Discoverability-failure dressed as discoverability-success.

**ORIGIN:** Phase 20-11 design debate; locked in `20-11-DESIGN-DEBATE.md`. Reviewers reflexively asked "how does the user know which sample plays at this bar?" The naive answer ("label the bar with `evt.s`") works for a single bar-wide selection (a held-zoom screenshot) but the steady-state view at default zoom puts a 1/16 cell at ~30px wide and ~12px tall — too small for any legible glyph.

**Symptom.** A reviewer or contributor suggests adding a `<text>` element inside event rects: "just put the sample name inside each bar." Implementation looks reasonable on a single-event fixture (one wide bar = one readable label). It then degrades silently as the user adds events — labels overflow the cell, get clipped, and at typical zoom ratios are unreadable but visually noisy.

**Detection signal.** Any of:
- Adding a `<text>` / `<span>` element inside an event rect with `font-size ≤ 12`.
- A request like "make the bars carry their note name" / "label the bars with the sample."
- A draft PR that adds a per-bar label child element to the event-render loop.

**Trap (wrong fix).** Adding labels at any size. They will be unreadable at typical zoom. The follow-up instinct is the canonical workaround cascade (see P50): zoom-conditional label rendering → hide-on-overflow → fade-in-on-hover → marquee-scroll. Each step performs accessibility while harming it.

**Real fix.** Apply PV41's 5-channel contract:
1. **Row header carries track-level identity** (chevron + name + swatch dot — readable at default zoom).
2. **Row color carries the track family** (palette slot or user override).
3. **Bar opacity carries gain** (`clamp(evt.gain, 0.15, 1)`).
4. **Bar Y carries pitch** (auto-fit per leaf for melodic; flat for percussive).
5. **Hover tooltip carries the full chain** (native `title=`; pointer-events: none; screen-reader friendly; zero CSS cost).

Per-event identity surfaces through HOVER, never through on-bar text. The 5-channel contract is the correct discoverability mechanism at the chrome's typical zoom.

**Cross-ref:**
- PV41 (5-channel identity contract) — names the contract that closes this trap.
- P50 (workaround cascade) — adding labels then zoom-conditional labels then overflow-hide is the canonical cascade trigger.
- PV35 (musician-vocabulary discipline) — same audience target; P54 is the visual-substrate sibling of PV35's textual discipline.

**REF:** `.planning/phases/20-musician-timeline/20-12-CONTEXT.md` §3 D-01..D-05; `20-11-DESIGN-DEBATE.md` "no bar labels EVER" lock; `20-12-MANUAL-GATE.md` visual check #8 (a label appearing on any bar BLOCKS PR — PV41 violation); `MusicalTimeline.tsx:854-877` (the bar render — note the absence of any text child element by design).

## P55 — Popover commit-then-close ordering: write must fire BEFORE close, never after

**Class.** Single-tick lifecycle race in commit-on-click UI primitives.

**ORIGIN:** Phase 20-12 β-6 — the swatch popover has a single click that performs TWO actions: `onPick(color)` (write the user's choice into trackMeta) and `onClose()` (unmount the popover). If `onClose()` fires first, the unmount can clear in-flight state (focus restoration, anchor refs, transient timers) AND the parent's update loop can run before `onPick` lands, observing a popover that is closing without a write. Symptom: the popover closes but the color does not update; user clicks again, gets the same outcome; concludes the feature is broken. Anticipated trap from BackdropPopover.tsx (Phase 19) — Trap 5 (write storm) is the related trap when the commit fires on `mousemove` instead of click; P55 is the sibling on the close-ordering axis.

**Detection signal.** In a popover whose click handler does both a write and a close:
- `onClose()` is invoked before `onPick()` in the click handler body.
- The popover is unmounted by parent state synchronously inside the same click before the write reaches the store.
- A test asserts only "onPick was called once" + "onClose was called once" without pinning their relative order.

**Trap (wrong fix).** "Defer onPick to a `requestAnimationFrame` so the close can fire first and the write happens 'after the popover is gone'." This papers over the ordering by introducing a different race (the rAF can fire after a navigation event, dropping the write entirely). It also makes the write asynchronous to the click, which breaks `act()` boundaries in tests and forces every consumer test into `await waitFor` shape.

**Real fix.** Two clauses:
1. **Source order:** in the click handler body, call `onPick(color)` FIRST, then `onClose()`. Both are synchronous; the parent's setState calls inside both are React-batched into the same commit, so the write and the close land atomically from React's perspective. The popover unmounts AFTER the parent has observed the new color.
2. **Test pin:** the unit test asserts `onPick.mock.invocationCallOrder[0] < onClose.mock.invocationCallOrder[0]` — pinning the contract directly, not via integration symptom (`bar updates after click`). Without the order pin, a refactor that swaps the source-order would still pass the count assertions but reintroduce the race in production.

**Cross-ref:**
- P50 (workaround cascade) — deferring writes to rAF or microtasks is the canonical workaround; it papers over without resolving.
- PV41 (5-channel identity) — the popover commits CHANNEL 2 (row color) of the contract; a dropped write silently violates PV41.
- BackdropPopover (Phase 19) deferred-attach pattern — same family of single-tick lifecycle hazards in commit-on-click popovers.

**REF:** `.planning/phases/20-musician-timeline/20-12-PLAN.md` §5 γ-3 PART C; `TrackSwatchPopover.tsx` click handler; `TrackSwatchPopover.test.tsx:60-82` ("clicking a swatch calls onPick(color) then onClose()") — the canonical fixture pinning the contract via `mock.invocationCallOrder`.

## P56 — Single-body wrapper hides multi-body structure from depth-walkers (peel-or-miss)

**ORIGIN:** Phase 20-12 hotfix wave (2026-05-10). User's `stack(...).viz(...)` IR ran the timeline through `flattenLeafVoices`, which only recursed on bare `Stack`. The `.viz(...)` chain wrapped the Stack in `Code{via: Stack}`, so the walker saw `Code` (a non-Stack tag) and terminated as a single leaf. Result: 4 chevrons but only 1 sub-row per track when expanded; user clicked "uncollapse" and the row appeared identical to collapsed. Same shape as 20-11's irChildren projection trap — tree depth-walkers that look for ONE multi-body tag and fail to peel through single-body modifiers above it. Recurring pattern; needs codification.

**Detection signal.** Three coincident:
1. The walker has an explicit recursion gate keyed on a single tag (`if (n.tag === 'Stack') ...`).
2. The data passes through a parser/lowering pass that wraps the structural node in single-body modifiers (Param, Fast, Code-with-via, FX, etc.).
3. A user-typed `.method(...)` chain whose lowering wraps the structural node — `.viz()`, `.gain()`, `.fast()`, `.late()`, `.degrade()` — produces an output where the walker terminates one level too high.

The smoking-gun observation is COUNT mismatch: the user wrote `stack(a, b, c)` (3 voices) but the chrome shows 1 leaf. Click-to-expand is a no-op. Same shape as P53 — the fallback is invisible to the user; the feature just looks broken.

**Trap (wrong fix).** "Add `Code` to the recursion gate." Specific to the immediate symptom but doesn't address the class. Next time the user writes `stack(...).gain(0.5)` (Param wrapper) or `stack(...).fast(2)` (Fast wrapper), the walker terminates again. Each new wrapper requires a one-off fix; the trap stays open across the wrapper-tag growth.

**Real fix.** Peel one layer of any single-body uniform-modifier wrapper before terminating. Single-body wrappers (Code-with-via, Param, FX, Fast, Slow, Elongate, Late, Degrade, Ply, Struct, Swing, Shuffle, Scramble, Chop, When, Every, Loop, Ramp) are all "this is a uniform modifier on the inner pattern" — peeling them is structurally safe. NOT peeled: multi-path nodes (Choice, Pick) and structural carriers (Stack, Seq, Cat — they ARE the topology). Code without `via.inner` (parse-failure leaf) is NOT peeled.

The peel set is the same set used in `flattenLeafVoices`'s sister `countLeavesInIR` (collect.ts) — both must agree, or layoutTrackRows' leaf count and the chrome's render leaf indices drift.

**Cross-ref:**
- PV41 (5-channel identity contract) — peel-or-miss in the leaf walker silently breaks channel-1 (sub-row identity).
- P53 (`groupEventsByTrack` `evt.s` fallback) — same class of silent-fallback when a primitive isn't found.
- 20-04 era's `irChildren` projection had a similar shape; the peel-or-miss principle was implicit there but never codified.

**Pair-of:** PV37 (wrap-never-drop) governs the parser side — it must wrap, not drop. P56 is the consumer-side dual: walkers must peel, not terminate. Together they close the producer/consumer loop on opaque-wrapper-around-structural-content.

**REF:** `irProjection.ts:344-411` (`flattenLeafVoices` + `peelSingleBodyWrapper`); `collect.ts:countLeavesInIR` (sister implementation in editor package); `irProjection.test.ts:752-862` (6 wrapper-peel regression tests); commit `5524e70`.

## P57 — Window-relative-static events vs monotonic-runtime begin: identity matching breaks at window boundary

**ORIGIN:** Phase 20-12 hotfix wave (2026-05-10). After `IRSnapshot.events` was changed to `collectCycles(finalIR, 0, WINDOW_CYCLES)`, event begins live in `[0, 2)`. The MusicalTimeline highlight handler matched runtime hap events to chrome events by exact equality on `(irNodeId, begin)`. Strudel's hap stream emits `hap.whole.begin` as the absolute, monotonic cycle index — at cycle 2 begin is 2.x, at cycle 3 it's 3.x, etc. After the playhead wrapped from x=1222 back to x=63 (the visual window boundary), no hap matched any event and bars stopped highlighting. Active-bar count went from "5/5 samples per second" to 0 at t≈3.7s.

**Detection signal.** Identity-match between two sources where:
1. One source emits **window-relative** identity (event.begin ∈ `[0, N)` for a fixed N).
2. The other source emits **monotonic-absolute** identity (hap.begin ∈ `[0, ∞)`, increments forever).
3. The match uses exact equality (`a === b` or `Math.abs(a - b) < ε`).

Symptom: the feature works for the FIRST window pass and silently goes dead after the wrap. No error, no warning — just a behavior cliff at the window boundary. Diagnose by sampling state across multiple window lengths; the cliff is the smoking gun.

**Trap (wrong fix).** "Re-collect on every wrap." Doubles the work for every cycle and creates GC pressure. Or: "subscribe the chrome to a wrap event and re-key all events." Layered ceremony for a simple modular-arithmetic problem. Both paper over without addressing that the two sources have different identity domains.

**Real fix.** Modulo the monotonic source by the window length before equality compare. `hapBegin % WINDOW_CYCLES` folds [0, ∞) into [0, WINDOW_CYCLES), aligned with the static source. Two-line fix at the comparison site, no architecture change.

The deeper rule: when two systems with different identity-time domains must match, ONE of them must adopt the other's convention at the boundary. Static-window-relative is the cheaper convention (no growing state); modulo at the boundary is the cheapest adapter.

**Cross-ref:**
- PV42 (events span equals chrome display window) — defines the window length the modulo folds against. PV42 is the contract; P57 is the trap that violating it (or not adapting to it) lands in.
- P50 (workaround cascade) — re-collecting on every wrap is the canonical workaround; modulo is the diagnosis-first answer.

**REF:** `MusicalTimeline.tsx:608-616` (the modulo line); commit `24b72a4`; verified by Playwright probe over 6s playback (~3.2 windows): active-bar count holds steady at 5/5 samples-per-second through every wrap.

## P58 — Collect arm scales-speed-only instead of replicating events (silent-semantics in collect)

**ORIGIN:** Phase 20-12 hotfix wave (2026-05-10). User's `s("hh*8")` should produce 8 hh events per cycle (Strudel's `*N` mini-shorthand = `pat.fast(N)`). The Fast collect arm at `collect.ts:577` only multiplied `ctx.speed` and walked the body ONCE, producing one event with 1/N duration. Audio runtime correctly fired 8 times per cycle; IR projection saw 1. Same class as P52 (silent-semantics) but in the COLLECT arm rather than the parser.

**Detection signal.** A multi-event Strudel operator is implemented in collect by:
1. Setting `ctx.speed *= factor` (or similar scaling),
2. Walking `ir.body` exactly once,
3. Returning the single-walk events.

If the operator's runtime semantics is "play body N times per cycle" (Fast, fast, `*N`, `!N`, repeat-style), the single walk produces N× fewer events than runtime. User-facing symptom: timeline shows 1 bar where they expected 8; sound correct, viz wrong.

The pre-existing test that pinned the broken behavior (`Fast compresses time` + `note("c d").s("hh*8") → second body event falls outside slot range`) is itself the smoking gun — comments saying "PINNED — future fix updates the expectation when Fast gains repeat semantics" mark a known wrong contract. P37 trigger: defer-comments next to a wrong-but-shipping contract are the bug.

**Trap (wrong fix).** "Just multiply event count." Naive: `for i in 0..N: events.push(walk(body))` without time-shifting produces N events at the SAME begin — no spread across the cycle. Or: scale begin/end after the fact, breaking child Seq's cursor logic.

**Real fix.** Iterate `factor` times. Each iteration walks `ir.body` over a slot of width `ctx.duration / factor` advancing `ctx.time` by that slot. Do NOT also multiply `ctx.speed` — the duration shrink already encodes the "twice as fast" semantic; multiplying speed too would double-shrink Play durations and Seq cursor advance, leaving inter-slot gaps.

```ts
const slotDuration = ctx.duration / factor
for (let i = 0; i < factor; i++) {
  events.push(...walk(ir.body, {
    ...ctx,
    time: ctx.time + i * slotDuration,
    duration: slotDuration,
  }))
}
```

**Cross-ref:**
- P52 (silent-semantics-after-PV37) — same class but parser-side. P58 is the collect-side dual: representation honest, collect interpretation wrong.
- P37 (defer-comment-is-the-bug) — the "future fix updates the expectation when Fast gains repeat semantics" comments next to passing-but-wrong tests are the canonical instance.
- P50 (no fallback ladder) — the speed-scaling shortcut is a fallback; replicating is the primitive.
- PV39 (semantics-as-typed-args) — the operator's typed args (factor) must drive the SEMANTIC count, not just a scaling parameter.

**REF:** `collect.ts:577-633` (Fast/Slow arms post-fix); `PatternIR.test.ts:250-282` (3 collect tests pinning correct N-event output); `integration.test.ts:1267-1283` (corrected `note("c d").s("hh*8")` test); commit `dbeabc5`.

## P59 — Pattern-arg promotion silently violates wrap-as-opaque (consumer reads typed value from a non-typed shape)

**ORIGIN:** Phase 20-12 wave-δ (2026-05-10). User's `s("sine").freq("<200 880>")` Y-staircased on the chrome timeline. The `freq` Param promotion arm (added in α-1 / D-06 to support numeric `.freq(440)` as Y-as-pitch source) used the shared `parseParamArg`, which has THREE accepting arms — literal-number, literal-string, mini-pattern. The third arm wrapped the inner `<200 880>` as a sub-IR; collect resolved it per-cycle to numbers; chrome's `extractPitch.freqToMidi` happily mapped them to MIDI Y. The user wrote what looks like an "opaque parametric" shape (PV37 wrap-never-drop) and saw the chrome silently extract pitch from it.

**Detection signal.** A new Param key gets added to a parser whitelist for ONE specific reason (chrome's pitch axis, audio routing, etc.). The parser uses a SHARED arg-parsing helper that admits multiple value shapes (literal, mini-pattern, etc.). Downstream consumers read the typed value as if the literal arm were the only path, but the mini-pattern arm produces values that satisfy the type signature too. Symptom: a behavior intended for ONE arm fires for a shape the user wrote thinking it would route elsewhere.

**Trap (wrong fix).** "Make `parseParamArg` reject mini-pattern globally." Breaks `s("<bd cp>")`, `n("<0 1 2>")`, every legitimate parametric Param across the codebase. Or: "patch chrome to skip pattern-resolved freqs." Adds a per-key consumer-side gate that future consumers will have to remember; the gate is in the wrong place (consumer, not producer).

**Real fix.** Gate the SPECIFIC Param key at the parser. After `parseParamArg` returns, check whether the KEY's intended semantics matches the value's shape. For `freq` (numeric Hz), accept only `typeof value === 'number'`; pattern values fall through to `wrapAsOpaque`, preserving PV37 in the right place — at the parser, not the consumer.

```ts
const parsed = parseParamArg(args, isSampleKey, baseOffset)
if (!parsed) return wrapAsOpaque(...)
if (method === 'freq' && typeof parsed.value !== 'number') {
  return wrapAsOpaque(...)
}
return IR.param(method, parsed.value, ...)
```

**Cross-ref:**
- PV37 (wrap-never-drop) — the rule the trap silently violates. PV37 says unmodelled REPRESENTATIONS go through wrapAsOpaque; the trap is interpreting the rule too narrowly (only "unmodelled methods", missing "unmodelled value-shapes for known methods").
- P50 (single-decision) — gate is one place, not two. Don't add a SECOND gate at the consumer.
- P54 (label-trap-at-typical-zoom) — pair-of relationship: a chrome surface promising one contract while another path delivers data that breaks it.

**Generalisation.** Whenever a Param-style whitelist is extended for a NEW downstream consumer, audit: do existing arg-parsing arms produce values that satisfy the consumer's READ contract by accident? If yes, gate at the parser per key.

**REF:** `parseStrudel.ts:855-880` (gate); `parseStrudel.test.ts:177-225` (3 wave-δ tests); `MusicalTimeline.tsx:875` (chrome consumer that would have read the bad value); commit `94162a9`.

## P60 — React `onChange` ≡ native `input` for stateful UI controls (auto-close races every drag frame)

**ORIGIN:** Phase 20-12 wave-ε (2026-05-11). Wave-δ shipped a custom `<input type="color">` row in `TrackSwatchPopover` whose React `onChange` handler called both `onPick(value)` and `onClose()`. The author reasoned: "native `change` fires on dismiss, so closing-on-change matches the click-to-pick contract from the 32-swatch grid." Manual gate Check #18: as soon as the user adjusted any color in the OS color panel, the swatch popover unmounted before the picked color could persist.

**Detection signal.** A React handler on a stateful native input (`<input type="color">`, `<input type="range">`, `<input type="number">` typing flow, `<input type="search">` incremental search) attached via JSX `onChange` AND performs a side-effect that wouldn't be safe to fire on every keystroke / drag frame (close a popover, navigate away, send an HTTP request, write to a Y.Map without de-dup). Symptom: the side-effect fires before the user's interaction has converged; the UI feels like it "rejects" the user mid-action.

The trap is specifically that React's `onChange` is **NOT** a 1:1 alias of the HTML `change` event. Per React's documented behavior, `onChange` for form elements maps to the native `input` event — fires on EVERY value change while the user is interacting. Native `change` (which fires once on commit/dismiss for color/range/text-search) has no React shorthand; you have to attach via `ref + addEventListener('change', ...)`.

**Trap (wrong fix).**
- "Use a setTimeout to debounce the close." Papers over the symptom; the close still races interaction patterns the timeout doesn't anticipate (slow mouse drags, accessibility key sequences). Tests will flake.
- "Detect when the OS picker is open and suppress the close." There's no portable way to detect this in browsers — `focus`/`blur` semantics differ across Mac/Win/Linux + native vs. Chromium-rendered pickers.
- "Switch to native `change` via ref." Solves the immediate bug but introduces a different one — many platforms fire `change` on EVERY commit (drag tick on Win), not just dismiss. Cross-platform UX is still inconsistent.

**Real fix.** Decouple "value commit" from "dismiss" entirely.
- `onChange` (= native `input`) writes through `onPick(value)` so the rest of the app live-previews the choice during interaction.
- `onClose` is bound to the user's explicit dismiss intent — outside-click, Escape — NOT to any value-change event.
- The LAST `onPick` value persists; the data store de-duplicates equal writes (Y.Map does this for free per tick) so the per-frame write rate is fine.
- For controls where the live-preview is too expensive (large data writes, expensive renders), debounce or throttle `onPick` BUT keep the dismiss decoupled.

```ts
// WRONG — fires on every drag frame, unmounts before commit
<input type="color" onChange={(e) => { onPick(e.currentTarget.value); onClose() }} />

// RIGHT — live preview on change, dismiss only on explicit user intent
<input type="color" onChange={(e) => onPick(e.currentTarget.value)} />
// (popover's outside-click + Escape listeners handle onClose separately)
```

**Cross-ref:**
- P55 (popover commit-then-close ordering) — applies to discrete-click flows like the 32-swatch cells. P60 is the dual: continuous-interaction inputs need the OPPOSITE rule (decouple commit from dismiss).
- P50 (single-decision) — close decision is one place (the dismiss listeners), not two.
- PV41 channel-2 (palette dot color) — the live-preview behavior P60 enables makes the channel feel responsive.

**Generalisation.** Any React handler attached via JSX `onChange` on a form element should be reviewed for: "does this side-effect tolerate firing on every value tick during interaction?" If no, decouple commit from dismiss; or attach the dismiss-fire handler via ref + native `change` listener.

**REF:** `TrackSwatchPopover.tsx:120-126` (post-fix commented handler); `TrackSwatchPopover.test.tsx:165-216` (live-preview + multi-frame tests); commit `dd42ec6`. React docs: "form elements with onChange use the native `input` event, not `change`" — `react.dev/reference/react-dom/components/input#noteworthy-differences-from-html`.

## P61 — Density slider scales the container, leaves the contents at fixed sizes (one-layer geometry leak)

**ORIGIN:** Phase 20-12 wave-ε (2026-05-11). Wave-δ shipped a sub-row height slider that propagated through `layoutTrackRows` to set each leaf band's `height`. The bar rendered inside the band, however, used a hardcoded `LEAF_BAR_HEIGHT = 6` constant from the wave-γ hotfix. Manual gate Check #19: dragging the slider made the bands tall but the bars stayed thin — a 6px ribbon floating in a 48px box. The slider produced a structurally-incoherent change ("the container got bigger but its contents didn't").

**Detection signal.** A new control (slider, sizer, density toggle) is added that propagates to one geometry value (height, width, font-size, padding). The change reaches the controlled value and one or two derivations, but downstream visual elements that LOGICALLY depend on it (children-that-fill, glyphs-inside, bars-on-top) keep using their pre-slider constants. Symptom: dragging the control produces visible motion at one layer, none at the next.

The trap is that the implementer treated the slider as feeding ONE downstream value (the container) instead of as the SOURCE in a derivation graph. Every dependent value should be a function of the controlled value, not a sibling constant.

**Trap (wrong fix).**
- "Add a second slider for the dependent." Doubles the cognitive load; the user has to keep two values in proportion themselves. Wrong primitive — the dependent SHOULD be derived.
- "Hardcode a different constant for each band height." Lookup table that encodes the function badly.
- "Document the limitation: `LEAF_BAR_HEIGHT is fixed; tune subRowHeight around it`." Defer-comment-is-the-bug (P37 family).

**Real fix.** Replace the dependent's constant with a pure function of the controlled value. Reserve a fraction of the container for non-dependent visuals (axis room, padding, etc.); take the rest:

```ts
// WRONG — bar size constant, container scales independently
const LEAF_BAR_HEIGHT = 6
// ... barHeight = LEAF_BAR_HEIGHT

// RIGHT — bar size derives from container size
const PITCH_RESERVE = 12   // px reserved for pitch motion
function leafBarHeight(bandHeight: number): number {
  return Math.max(MIN_BAR, bandHeight - PITCH_RESERVE)
}
// ... barHeight = leafBarHeight(leaf.height)
```

The reserve constant carries the UX intent ("how much of the band stays for axis motion"); the function name documents that the bar IS a function of the band, not a sibling.

**Cross-ref:**
- P52 family (silent semantics) — the user's mental model said "make sub-rows bigger" = "everything inside gets bigger"; the implementation broke that contract silently.
- PV41 channel-4 (Y-as-pitch) — pitch motion needs preservation when the bar grows; the reserve constant encodes the trade-off.
- P37 (defer-comment-is-the-bug) — "barHeight is fixed for now" is a defer comment that would have hidden this.

**Generalisation.** Any new density / size control needs a downstream-dependent audit: enumerate every constant in the same visual region (bar height, label font-size, gap, glyph size). For each: should it derive from the new control? If yes, rewrite as a function. If no, document why with a comment so the next density change doesn't re-trigger this trap.

**REF:** `MusicalTimeline.tsx:117-124` (post-fix `leafBarHeight` derivation); commit `89ff5fc`.

---

## P62 — External transpiler quietly rewrites the value before the API sees it (Strudel double-quote → mini-Pattern)

**ORIGIN:** Phase 20-11 wave-δ γ-7 manual gate (2026-05-12). 20-11 D-01 specified `.p("name")` as the canonical user idiom for track-id override. The IR parser arm matched a double-quoted string literal and wrapped as a `Track` tag. At eval time, the user's source `.p("kick")` reached Strudel's runtime `.p` as `.p(<Pattern>)` — and Strudel's `.p` calls `id.includes("$")`, which throws `TypeError: k.includes is not a function` on a Pattern. Strudel's transpiler (`@strudel/transpiler/transpiler.mjs:81-89`) eagerly rewrites EVERY double-quoted string literal to `mini(value)` because that's the right default for `s("bd cp")` / `note("c d")`. The 20-11 design and the Strudel transpiler were in disagreement about what `"name"` means inside `.p()`.

**Detection signal.** A chain method's user-facing argument has a TYPE expectation that diverges from the ambient transpiler / preprocessor's behavior. Symptom: an IR-level parser arm matches the literal cleanly; unit tests pass against the parsed shape; the live runtime crashes OR silently drops the call. Stack trace points at a function INSIDE the external runtime (`Ie.f.p` for Strudel) — not at our code. The boundary is the transpiler stage, BEFORE the runtime function executes.

This is a relative of P52 (silent-semantics-after-PV37) but at the EXTERNAL boundary: P52 was about our IR collect arm missing the field projection; P62 is about an external preprocessor mangling the value before our wrapper or the external runtime sees it. Same shape (silent), different layer.

**Trap (wrong fix).**
- "Patch the IR parser arm to also accept single quotes." Necessary but not sufficient — the wrapper at runtime still sees a Pattern object and crashes.
- "Patch the external runtime to accept both types." Not our code; doesn't ship.
- "Document the constraint in the parser comments and ship." Users still write `.p("name")` because that's the natural JS string syntax. Defer-comment-is-the-bug (P37).

**Real fix.** Three-layer remediation, all required:

1. **IR layer:** parser arm accepts BOTH quote styles. The IR-level Track wrap fires regardless of what the user typed, so the timeline label is consistent (the IR is permissive about source style).

2. **Runtime guard layer:** wrap the external runtime's call with `typeof arg !== 'string' → return this` so the transpiler-mangled value no-ops gracefully instead of crashing. The user's chain doesn't blow up; the runtime registration silently fails but the eval completes.

3. **Lint / quick-fix layer:** Monaco diagnostic provider flags the wrong-idiom site at WRITE time with a quick fix to rewrite to the working idiom. Surfaces the contract to the user before they hit eval.

Layer 1 alone gives correct IR but broken runtime. Layer 2 alone makes runtime not crash but the override silently no-ops. Layer 3 alone catches it at write time but doesn't help users who paste working code. All three together close the gap.

**Generalisation.** Any external preprocessor / transpiler that rewrites a user-typed value before it reaches the destination API is a P62 site. Catalogue them: which transformations does Strudel's transpiler apply? `"..."` → `mini()`; backticks → `mini()`; labeled statements → `.p('label')`. Each rewrite is a potential P62. Audit any new chain method against this list.

**Cross-ref:**
- P52 (silent-semantics-after-PV37) — sibling, but at the INTERNAL boundary (collect arm missing the field). P62 is the EXTERNAL-boundary sibling.
- PV37 (wrap-never-drop) — the IR layer's permissiveness in the parser arm is a direct PV37 application: accept the user's typed character, even if a downstream layer can't honor it.
- F-2 follow-up (commit `9033001`) — Monaco lint + quick-fix shipped.

**REF:** Wave-δ fix commit `f4e66b4` (layers 1 + 2); F-2 commit `9033001` (layer 3); Playwright regression `wave-delta-gate.spec.ts` FIXTURE B + B2.

---

## P63 — Yjs lazy-create during render → observer cascade → setState-in-render

**ORIGIN:** Phase 20-11 wave-δ Playwright runs (2026-05-12). `MusicalTimeline.tsx` rendered the timeline via `layoutTrackRows`, which called `collapsedFor(trackId)`, which called `getTrackMeta(fileId, trackId)`. `getTrackMeta` called `ensureTrackMetaMap(fileId)`, and on FIRST call for a file the helper wrote `fileMap.set('trackMeta', new Y.Map())` to the Y.Doc. The write triggered observe cascades; subscribers attached via `useSyncExternalStore` re-evaluated their snapshots and called `setState` on EditorView — DURING the render of MusicalTimeline. React warned: `Cannot update a component (EditorView) while rendering a different component (MusicalTimeline)`. Pre-existing bug (not introduced by wave-δ) but only surfaced because the new Playwright fixtures booted from a clean state and the warning fires on first-render-for-any-file.

**Detection signal.** A getter named `getX(...)` (or `useX(...)`) is called from a component's render or from `useSyncExternalStore.getSnapshot`. The getter, on first call for some key, lazily creates a sub-store on the Y.Doc. Symptom: React warning about cross-component setState during render OR StrictMode tearing OR observable jank on the FIRST visit to a file/key (subsequent visits silent).

The trap: lazy creation IS a legitimate optimization (don't allocate sub-stores until needed). But it must not happen on the READ path. If readers and writers share a single `ensureXMap` helper, every read-during-render becomes a write-during-render.

**Trap (wrong fix).**
- "Defer the read to `useEffect`." Moves the problem: now the first-render snapshot is empty, then `useEffect` writes, then re-render. UX jank.
- "Wrap the write in `setTimeout`." Hides the problem behind a microtask. Still violates the "no doc-write during render" rule, just async.
- "Disable React strict mode warnings." Hides the symptom; the underlying observer cascade still fires.

**Real fix.** Split the helper into two functions with distinct semantics:
- `getXMap(id)` — read-only; returns existing map or null; wires observer lazily if found (observing an existing map is doc-write-free). SAFE during render.
- `ensureXMap(id)` — create-if-absent; mutates the doc; ONLY called from write paths (`setXMeta` and friends).

Readers (`getX`, `subscribeToX`) use the read-only path. When a writer later creates the map, the observer wires at that point and back-fires to all already-registered subscribers via an out-of-band subscriber set.

**Generalisation.** Any Yjs sub-store (Y.Map / Y.Array / Y.Text) that's lazily allocated must obey: **lazy creation lives on the write path; never on the read path**. The reader returns a shared frozen sentinel (e.g. `EMPTY_TRACK_META`) when the sub-store doesn't exist yet — and the sentinel must be ref-stable across reads to satisfy `useSyncExternalStore`'s tearing-detection contract.

**Cross-ref:**
- PV45 (this catalogue, below) — codifies the read-write split as an invariant.
- `feedback_useeffect_per_render_dep.md` — sibling React-Yjs interaction trap.
- PM-architecture entries (`project_pm_architecture.md`) — broader Yjs+React contract.

**REF:** F-4 fix commit `2ef4697`; before-after at `packages/editor/src/workspace/WorkspaceFile.ts` `getTrackMetaMap` vs `ensureTrackMetaMap`.

## P64 — Empty/ghost row in MusicalTimeline → check slotMapRef before the parser

**Symptom:** the bottom-drawer timeline shows a track row with a faded label
and zero note blocks where the user expected the row to be gone (e.g. after
commenting out a `$:` line, or after stopping playback in a state the user
considered "fresh").

**The trap:** infer that the upstream parser (`parseStrudel` / `extractTracks`
in `packages/editor/src/ir/parseStrudel.ts`) failed to filter the commented
line, or produced a stray `Track` wrapper. Run regex sweeps. Edit the parser.
Land a "fix" that doesn't change observed behaviour because the parser was
already correct.

**The real cause:** `MusicalTimeline.tsx:548-561` retains slot indexes across
re-evals via `slotMapRef` + `stableTrackOrder` (per D-04's "stable across
snapshots" contract — the Trap-5 fix from Phase 20-01). A trackId that
disappears from the IR keeps its slot reserved as an empty placeholder; the
row renders with no note blocks but with a faded label. This is INTENTIONAL
for the A/B audition workflow (comment a `$:` while playing to mute a voice
without losing row layout, uncomment to restore).

**Diagnostic walk (first thing to check, before any parser hypothesis):**
1. Run `parseStrudel` on the exact fixture and print `extractTracks` output.
   If track count matches the user's expectation, the parser is innocent.
2. Read `slotMapRef.current` (add a temporary log at `MusicalTimeline.tsx:562`).
   If it contains a trackId that's absent from the current snapshot, you're
   looking at slot retention, not a parser bug.
3. Check transport state. Per Phase 20-12.1, `slotMapRef` clears on the
   `non-null → null` edge of `currentCycle`. If transport is currently
   playing, ghost rows are expected (D-04 audition case). If transport is
   stopped, the edge should have already cleared the map — investigate why
   it didn't (drawer-closed sub-case? rAF loop suspended without poke
   sampling?).

**Why this matters:** F-1 (FOLLOWUPS.md#F-1) was filed against the parser
on 2026-05-11 and misdiagnosed for two days. The fix landed in Phase 20-12.1
on the timeline component, not the parser. Future observers of the same
symptom must check downstream slot retention BEFORE blaming upstream parse.

**ORIGIN:** F-1 misdiagnosis (2026-05-13 reframe in
`.planning/phases/20-musician-timeline/FOLLOWUPS.md:14-51`). Original
hypothesis ("`extractTracks` doesn't skip JS-commented `$:` lines") was
falsified by direct observation of `parseStrudel` output. Real cause was
`slotMapRef` retention per D-04.

**WHY:** without this entry, the next observer of an empty/ghost timeline
row will re-derive the parser hypothesis from scratch. Slot retention is a
parser-output sink, not a parser-bug source — a class of confusion this
entry forecloses.

**HOW:** directs the diagnostic walk to `MusicalTimeline.tsx:548-561` +
`packages/app/src/components/musicalTimeline/stableTrackOrder.ts` first.
Cross-refs Phase 20-12.1 (transport-stop reset), D-04 in
`20-01-CONTEXT.md:53-56`, P63 (Y.Doc render-write — neighbouring code, not
this trap), P52 (mount-path — related general class).

**REF:** Phase 20-12.1 plan + commits on `fix/20-12.1-pause-resets-slot-map`;
diagnostic anchor at `packages/app/src/components/MusicalTimeline.tsx:555-582`
(prevCycleNullRef declaration + stop-edge reset block).

---

## P65 — Transport accessor returns a frozen value after stop (engine-state not gated)

**Symptom:** any consumer that listens for a "transport stopped" signal via the
cycle/time accessor (`getCycle()`, `getCurrentCycle()`, `scheduler.now()`) never
fires its stop-edge logic. The accessor keeps returning the LAST playhead value
forever after `engine.stop()`. Stop-edge reset blocks in `MusicalTimeline.tsx`,
analyser teardown, scrub-position resets — anything keyed on `cycle === null` —
silently no-ops.

**The trap:** assume the accessor "naturally" goes null when the engine stops
because that's what the type signature suggests (`() => number | null`). Wire
a `prev/curr` edge tracker. Write tests that drive `setCurrentCycle(null)`
directly — those pass — and ship. The bug only surfaces against the LIVE engine
(P52 mount-path family).

**The real cause:** Strudel's scheduler (`@strudel/core`) retains
`scheduler.now()` as the last position. `LiveCodingRuntime.getCurrentCycle()`
read it through with `Number.isFinite(v) ? v : null` — but isFinite is true
for the retained value, so null is never returned. The accessor must explicitly
gate on `isPlayingState`.

**Diagnostic walk:**
1. If a "stop-edge" feature works in unit tests (jsdom, manual `setState(null)`)
   but fails in the browser, suspect the accessor — not the consumer.
2. Read the accessor's implementation. If it reads engine internals without
   gating on the engine's own play/stop state, you've found it.
3. Add `if (!isPlayingState) return null` at the top of the accessor. Verify
   the consumer's edge fires in the browser.

**ORIGIN:** Phase 20-12.1 follow-up (2026-05-14). User reported "stop+play
doesn't drop the ghost row" on `fix/20-12.1-pause-resets-slot-map`. The
MusicalTimeline stop-edge reset was correct; `LiveCodingRuntime.getCurrentCycle()`
at `packages/editor/src/workspace/runtime/LiveCodingRuntime.ts:641-644` was the
real culprit.

**WHY:** transport accessors are a chokepoint — many consumers downstream. A
silent-failure here breaks unit-test-passing-but-broken features (T-8 manual
gate from Phase 20-12.1 was the canonical case). One catalogue entry forecloses
a whole class of future "edge listener doesn't fire" investigations.

**HOW:** directs the next observer to read the accessor BEFORE writing more
edge-tracking. Pairs with PV46 (transport accessors must gate on engine state).

**REF:** `packages/editor/src/workspace/runtime/LiveCodingRuntime.ts:641-650`
(post-fix); commit `667615d` on `fix/20-12.1-pause-resets-slot-map`. Related:
P52 (mount-path silent failure class).

---

## P66 — Workspace package's compiled `dist/` is stale → app runs old code

**Symptom:** edits to source in a workspace package (e.g. `packages/editor/src/`)
don't reflect in the running dev server. The user reports a bug that you've
already "fixed", you stare at the patched code, run unit tests (all green),
push commits, force a hard refresh — and still see the OLD behaviour. Hours
wasted iterating on a theory while the actual problem is build caching.

**The trap:** assume HMR (Turbopack / Vite) picks up source changes uniformly
across the monorepo. It does for files the dev server compiles directly (the
top-level app), but NOT for workspace packages whose `package.json` `main` /
`module` / `exports` point to `./dist/*`. The app imports the COMPILED bundle,
which is only refreshed when the package's build step (`tsup`, `tsc`, etc.)
runs.

**The real cause:** `packages/editor/package.json` exports via
`"main": "./dist/index.cjs"` + `"module": "./dist/index.js"`. The app's
`@stave/editor` workspace dependency resolves through these fields, NOT
through `src/`. So Next.js dev server doesn't watch
`packages/editor/src/` — it watches the dist files. Without `tsup --watch`
running, source edits stay invisible.

**Diagnostic walk:**
1. If "fix in source, test pass, dev server still shows old behaviour": check
   the workspace package's `package.json`. If `main`/`module` point to `dist/`,
   you're stale.
2. Confirm with `ls -la packages/<name>/dist/index.js` — timestamp older than
   your source edit means stale.
3. Run the package's build script (`pnpm --filter <pkg> build`) or start its
   watch script (`pnpm --filter <pkg> dev`).

**Workflow rule:** when iterating on a workspace package's source against the
running app, START `pnpm --filter <pkg> dev` in the background BEFORE editing.
tsup's `--watch` flag rebuilds dist on each save; the app's HMR then picks it
up. Without this you'll burn time on a theory that doesn't match what the
browser is running.

**ORIGIN:** Phase 20-12.1 follow-up session (2026-05-13/14). User reported
"the rearrangement is back" after my parser fix had been pushed — symptoms
matched the PRE-fix code. Manual `pnpm --filter @stave/editor build` reproduced
the expected behaviour. tsup `--watch` started for future iterations.

**WHY:** the canonical "I fixed it but it doesn't work" trap in this repo.
Bites every new contributor (and re-bites old ones who forget). Closely
neighbours `feedback_viz_bugs.md` (editor-dist staleness) — but that note
records the lesson; this catalogue entry records the diagnostic recipe.

**HOW:** any "fix not reflected in browser" investigation should check
`packages/<pkg>/dist/index.js` mtime BEFORE checking HMR config, browser
cache, or anything else.

**REF:** `packages/editor/package.json` (`main`/`module`/`exports` fields);
`packages/editor/package.json` scripts `build` (`tsup`) + `dev` (`tsup --watch`).
Related: PK14 (stacked-PR dist conflicts — same dist-as-source-of-truth root),
`feedback_viz_bugs.md` (stale-dist lesson, prior occurrence).

## P67 — Tag-only IR discrimination conflates opaque-`via` wrappers with bare-`Code` fallbacks

**Symptom:** a parser/projection/round-trip code path that branches on
`ir.tag === 'Code'` treats TWO structurally distinct nodes identically:
(a) a genuine unparsed fallback (`Code` with `code: <verbatim>`, no `via`),
and (b) a structural opaque wrapper from `wrapAsOpaque` (`Code` with
`code: ''` + a populated `via: { method, args, inner }` subtree — PV37 /
20-04). The path discards or mis-renders the wrapper as if it were an
unparsed blob, throwing away the inner IR (and its loc, its chain).

**The trap:** `tag === 'Code'` reads as "this is the unstructured escape
hatch" because that was the ONLY meaning before 20-04 introduced the
opaque-via wrapper. The tag was overloaded; the discriminator wasn't
updated. The two cases share a tag but have opposite meanings — one is
"parsing failed here", the other is "parsing succeeded, wrapped for
round-trip fidelity".

**The real cause:** `Code` is a tri-state carried on one tag —
{bare-fallback | opaque-via-wrapper | (lang-tagged embed)}. The
discriminating field is `via`, not `tag`. Any check that means
"is this an unparsed blob?" must be `tag === 'Code' && via === undefined`,
not `tag === 'Code'`.

**Detection signal:** a structured expression (has a recognizable root +
chain) round-trips or projects as if it were opaque; OR a `.via`-bearing
node's `inner` subtree never appears in collect/projection output. Cost
one round-trip in Phase 20-14 γ (cluster-B success surfaced it: once the
multi-line chain walker worked, `parseExpression`'s `rootIR.tag === 'Code'`
guard started discarding the now-structured wrappers).

**The fix:** discriminate on `via`. `tag === 'Code' && via === undefined`
= true bare-fallback. `tag === 'Code' && via !== undefined` = structural
wrapper, walk `via.inner`. Audit every `=== 'Code'` site when adding a new
Code sub-state.

**ORIGIN:** Phase 20-14 γ-wave parser-gap fix (2026-05-15). Surfaced when
cluster-B (multi-line chain walker) succeeded and `parseExpression` began
throwing away wrapAsOpaque wrappers as bare-Code.

**REF:** P33 (silent-drop in applyMethod default arm — same `Code`
overload lineage), PV37 (wrap-never-drop — the invariant the wrapper
serves); `packages/editor/src/ir/parseStrudel.ts` (`wrapAsOpaque`,
`parseExpression` rootIR guard). Ground Truth: 20-14-γ-SUMMARY.md
"Parser-gap fix" §.

## P68 — `tsup --watch` terminates ENTIRELY on a DTS-build failure (does NOT degrade to JS-only watch)

**Symptom:** you start `pnpm --filter @stave/editor dev` (tsup --watch) per
the P66 protocol, edit `packages/editor/src/`, and the consuming app STILL
runs old code — exactly the P66 symptom — even though the watcher was
"running". The committed `dist/index.{js,cjs}` lacks the just-added source
symbol despite the source being correct and tests (run against `src/`)
passing.

**The trap:** assume `tsup --watch` is resilient — that a type error in an
UNRELATED file (here: a pre-existing `error TS7016: Could not find a
declaration file for module '@strudel/mondo'` in `StrudelEngine.ts`) only
fails the `.d.ts` emit and the JS watch keeps rebuilding. It does not. The
DTS worker error propagates and the watch process exits; subsequent source
edits are NOT rebuilt. The watcher LOOKS started (you ran the command) but
is dead. This compounds P66: you followed the P66 fix (start the watch)
and are still stale because the watch silently died on an orthogonal
type error.

**The real cause:** tsup runs the JS bundle and the DTS build; on a DTS
error in watch mode the whole tsup process terminates rather than
continuing JS-only. A pre-existing/unrelated DTS error (missing third-party
`.d.ts`) is enough to take down the watch for ALL packages' source edits.

**Detection signal (cheap, deterministic):** after any
`packages/editor/src/` edit, BEFORE committing, run
`grep -c '<newSymbol>' packages/editor/dist/index.js`. If it returns `0`,
the bundle is stale (watch died or never rebuilt). One-shot
`pnpm --filter @stave/editor build` writes the JS bundle even though it
exits 1 on the DTS step — re-grep: `> 0` confirms the JS DID rebuild
(tsup writes the JS bundle before the DTS step fails). Commit the
JS/CJS+maps; the pre-existing `.d.ts` deletion is unrelated churn, not
yours.

**The fix:** do NOT rely on `tsup --watch` for editor-src work. Per
editor-src commit: one-shot `pnpm --filter @stave/editor build`, then
`grep -c <newSymbol> dist/index.js > 0` as the gate BEFORE `git commit`.
The DTS exit-1 is acceptable iff it is the known pre-existing
`@strudel/mondo` TS7016 (verify the error is that one, not a new one your
change introduced).

**ORIGIN:** Phase 20-15 γ-3 discovered the watch-death; 20-15 V-2
re-confirmed it on the `sound`-alias editor-src change (DTS exit 1, but
`grep -c '(?:s|sound)' dist/index.js` = 3 > 0 → JS bundle WAS written;
committed safely). Extends P66 (stale dist) + PV48 (editor watch-mode
requirement) — P66/PV48 say "start the watch"; P68 says "the watch is not
reliable; verify dist by grep per commit regardless".

**REF:** P66 (stale workspace dist — the parent failure mode), PV48
(editor watch-mode start requirement — the protocol P68 hardens),
`feedback_editor_watch_mode.md`; `packages/editor/tsup.config.ts`,
`packages/editor/src/engine/StrudelEngine.ts:194` (the pre-existing
@strudel/mondo TS7016). Ground Truth: 20-15-SUMMARY.md (γ-3 + V-2).
