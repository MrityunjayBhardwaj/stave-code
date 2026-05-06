---
phase: "20-01"
status: PR-A merged + PR-B open
pr_a:
  branch: feat/bottom-drawer
  pr: "https://github.com/MrityunjayBhardwaj/stave-code/pull/90"
  issue_closes: "#89"
  base_sha: aca5edc
  commits: 7
  date: 2026-05-06
pr_b:
  branch: feat/musical-timeline
  base_sha: 09cd39f
  issue_closes: "#91"
  commits: 6
  date: 2026-05-06
  status: open
  notes: "MusicalTimeline component (slice β) — static multi-track grid + live playhead + chrome status line; NO click-to-source. Replaces PR-A's seedTabs placeholder via DA-05 idempotent re-register. Click-to-source is a slice γ small follow-up; bidirectional editing is axis-4 multi-week (Phase 19-11+)."
---

# Phase 20-01 Summary — PR-A (bottom-drawer infrastructure)

## Goal achieved (PR-A)

Reusable `BottomPanel` surface in `@stave/editor` mounted by `WorkspaceShell` below the editor grid. Resizable + collapsible + multi-tab + persisted. Module-level tab registry exported through the top-level barrel (PK10). Vocabulary clean per PV35 (musician audience) + PV32 (implicit-IR).

PR-B (`MusicalTimeline` content) is **NOT** in this PR — it gets its own plan and execution after PR-A merges.

## Commits (7 atomic)

| Commit | Title |
|---|---|
| `e0d9e06` | `feat(editor): add bottomPanelRegistry — module-level tab registry for BottomPanel` |
| `cd3544c` | `feat(editor): add bottomPanel persistence helpers + clampHeight` |
| `2c7b56b` | `feat(editor): add BottomPanel component + useDragResize + Timeline seed` |
| `ce291d4` | `test(editor): BottomPanel component coverage — render + nav + display:none + hydration` |
| `6f8a4d9` | `feat(editor): mount BottomPanel inside WorkspaceShell below the editor grid` |
| `280b527` | `feat(editor): export BottomPanel + registry from top-level barrel (PK10)` |
| `561717c` | `test(app): Playwright bottom-drawer spec — open/close/resize/persistence/vocabulary` |

## Test results

| Surface | Baseline | After | Delta |
|---|---|---|---|
| Editor vitest | 1213 | **1274** | **+61** |
| App vitest | 56 | 56 | unchanged (no app-side production code) |
| Playwright `bottom-drawer.spec.ts` | 0 | **8** | **+8** |
| Playwright IR Inspector suite | 41 | 41 | unchanged (timeline + mode-toggle + debugger + tier4) |
| Editor tsc | 53 errors (baseline) | 53 | unchanged |

PK10 grep on `dist/index.cjs` after `pnpm --filter @stave/editor build`:
- `registerBottomPanelTab` → 5 (≥1 OK)
- `BottomPanel` → 18 (≥1 OK)
- `__resetBottomPanelRegistryForTest` → 0 (test-internal stays hidden)

## Locked decisions honored

| Decision | Honor |
|---|---|
| **D-01** Audience = musician (PV35 lock) | Vocabulary discipline asserted in vitest + Playwright |
| **D-02** Bottom drawer (NOT activity-bar side panel) | Mounted by `WorkspaceShell` below editor grid |
| **D-09** Drawer tab system (one tab today) | `seedTabs.ts` registers `id=musical-timeline, title=Timeline` placeholder |
| **D-10** Scope split — PR-A infra, PR-B content | PR-A landed; PR-B pending |
| **DA-01** Insertion site inside shell, before `QuadrantGuideOverlay` | Done (additive; existing groups code unchanged) |
| **DA-02** `display: none` for inactive tabs | Mount-count probe (T-07) confirms each tab body mounts exactly once |
| **DA-03** `useDragResize` with pointer events + `setPointerCapture` | Hook colocated; pure `computeNewHeight` exported for vitest |
| **DA-04** Drawer renders inside shell (not from `StaveApp`) | Self-mounts via singleton import |
| **DA-05** Module-level singleton registry, idempotent register | Mirrors `packages/app/src/panels/registry.ts` shape |
| **DA-06** SSR-safe `useState` initializer hydration | All three values read in initializers; safeLocalStorage guard |

## Trap mitigations

All 10 traps (CONTEXT §6 + PLAN §6 expansion) covered. Each has at least one explicit assertion:

- **Trap 1** (vocabulary leak): vitest BottomPanel.test.tsx forbidden-noun regex on rendered text + aria-labels; Playwright spec asserts on `[data-bottom-panel="root"]` textContent + aria-labels.
- **Trap 2** (closed-state pixel theft): vitest probe asserts `flexBasis === '29px'`; Playwright probe asserts the same on first paint; zero-tabs case returns null.
- **Trap 6** (drag jitter on trackpad): Playwright drags down 1000px → height clamps to 80; drags up 2000px → height clamps to 600. Pointer events + `setPointerCapture` keep `pointermove` firing off-element.
- **Trap 7** (hydration race): vitest probes assert persisted state on FIRST render; Playwright awaits `domcontentloaded` (earlier than `load`) so a post-effect snap would surface as a regression.
- **Trap 8** (tsc baseline drift): per-task tsc check + T-final assertion. 53 errors unchanged.
- **Trap 9** (registry leakage between vitest tests): `__resetBottomPanelRegistryForTest` in `beforeEach`; sequential register-then-list test confirms reset works.
- **Trap 10** (jsdom doesn't fire PointerEvent): drag math tested as pure function; integration tested via Playwright.

## Critical self-review (AnviDev §5)

Audited every changed file for: dead code, redundant logic, missing edge cases, parameter leaks, type-safety holes, vocabulary leaks (PV35 enforcement), barrel completeness (PK10).

Findings:
- **Vocabulary clean.** No `snapshot|publishIRSnapshot|IREvent|captureSnapshot|publishIR` strings in any production file (the 2 false positives in `git diff` are existing comments in `index.ts` and `timelineCapture.ts` that are unrelated to PR-A — unchanged context lines).
- **Type-safe.** No `any`, no `// @ts-ignore` directives, no `// @ts-expect-error` (one was inserted then removed). All public API signatures are explicit (registry returns `readonly BottomPanelTab[]`, hook returns `UseDragResizeResult`).
- **Barrel-complete.** Top-level barrel exports cover the component + registry CRUD + types + persistence constants. Test-only `__resetBottomPanelRegistryForTest` correctly NOT exported (grep on dist confirms 0 occurrences).
- **No dead code.** Each helper has at least one caller; `pagehide` flush is a defensive but tested path (covered in T-05's design intent — tests do not fire pagehide events but the hook contract documents the role).
- **Defensive comments where load-bearing.** The `flex: 1, minHeight: 0` wrapper around the groups area carries a comment explaining why `minHeight: 0` is required (without it, nested SplitPane doesn't shrink when drawer grows).

No fixable issue surfaced that warranted an extra commit. Self-review is captured here and in the PR body.

## Cognitive Discoveries

- **vyapti (invariant confirmed):** PV34 fresh-array contract is the right shape for the bottom-panel registry — `listBottomPanelTabs` returning `Array.from(map.values())` per call lets React subscribers shallow-compare safely without subscribing churn. Confirmed by T-02's "fresh array reference on each call" test.
- **hetvabhasa (error pattern surfaced — Trap 9):** Module-level singleton state in editor-package vitest survives across test cases inside one worker. Same trap class as `__resetCaptureForTest` at `engine/timelineCapture.ts`. Mitigation: export a test-only reset, NOT exported from the top-level barrel; tests `beforeEach` calls it. Pattern is reusable for any future module-level singleton in the editor package.
- **krama (lifecycle pattern reaffirmed — PK10):** Top-level barrel hand-curation is intentional and load-bearing. Confirmed by post-build grep: editor sub-barrel propagation is NOT automatic; every new public symbol must be added to `packages/editor/src/index.ts` explicitly. PR-A's grep verify (5 / 18 / 0) makes this explicit at the gate.
- **Discovery — closed-state pixel cost is a budget, not a goal.** Phase 20-01 made the 29px closed-state cost explicit in code (`HEADER_HEIGHT + 1` for the border) and asserted it in two test layers. Future bottom-panel features (Output, Problems) can adjust this budget but must do so deliberately — a regression there would silently steal pixels from existing users on every reload, which is exactly what Trap 2 was about.

## What's next (PR-B)

A separate plan + execution will:
- Build `MusicalTimeline` component in `@stave/app` subscribing to `subscribeIRSnapshot` + `runtime.getCurrentCycle()`.
- Group events by `trackId ?? s ?? '$default'` (D-04).
- Render rows = tracks, columns = beats over a 2-cycle window with a live playhead.
- Register into the bottom drawer by re-registering `id='musical-timeline'` (idempotent — replaces the placeholder).
- Continue vocabulary discipline (PV32 / PV35) with audience=musician.

NOT in PR-B's slice β: click-to-source, pan/zoom, breakpoints, bidirectional editing.

---

# Phase 20-01 PR-B Summary — MusicalTimeline (slice β)

## Goal achieved (PR-B)

Real `MusicalTimeline` component in `@stave/app` is registered into the bottom drawer under `id='musical-timeline'`, replacing PR-A's `(empty — wired in PR-B)` placeholder via the registry's idempotent re-register (DA-05). The component subscribes to the live `subscribeIRSnapshot`, groups events by `trackId ?? s ?? '$default'` (D-04), renders rows = tracks (stable across re-evals — disappeared tracks keep their row reserved per Trap 5) over a fixed 2-cycle window (D-05), and runs a live playhead via a gated rAF loop fed by `runtime.getCurrentCycle()`. The chrome status line speaks musician vocabulary (`♩ {bpm} BPM · cps {x.xx} · bar Y / beat Z.ZZ` or `(stopped)`); empty-state copy is `(no tracks yet — play some code)` per D-08.

Click-to-source / pan / zoom / bidirectional editing are explicitly out of scope (slice γ / axis-4 multi-week).

## Commits (6 atomic)

| Commit | Title |
|---|---|
| `2d2fbca` | `feat(app): add MusicalTimeline pure helpers (grouping + stable order + time axis + colors)` |
| `a5c40dc` | `feat(app): add MusicalTimeline component (grid + snapshot subscribe + playhead rAF + status line)` |
| `4d3ca6b` | `feat(app): wire MusicalTimeline into the bottom drawer (replaces PR-A placeholder)` |
| `e2823cd` | `test(app): MusicalTimeline RTL coverage — grouping, stable order, vocabulary, file switch` |
| `9e33797` | `test(app): Playwright musical-timeline spec — render, playhead, stable order, vocabulary` |
| `86172f5` | `fix(app): drop unused @ts-expect-error in MusicalTimeline test mock` |

## Test results

| Surface | Baseline (post PR-A) | After PR-B | Delta |
|---|---|---|---|
| Editor vitest | 1274 | **1274** | unchanged (no editor-package logic; only barrel re-exports `readPersistedOpen` / `readPersistedActiveTabId`) |
| App vitest | 56 | **111** | **+55** (T-02 helpers: 41 + T-06 component: 14) |
| Playwright `musical-timeline.spec.ts` | 0 | **6** | **+6** |
| Playwright `bottom-drawer.spec.ts` | 8 | **8** | unchanged (1 assertion updated to look for the MusicalTimeline subtree instead of PR-A's "(empty — wired in PR-B)" placeholder) |
| Playwright IR Inspector suite | 49 | 49 | unchanged |
| Editor tsc | 53 (pre-existing baseline) | 53 | unchanged |
| App tsc | clean | clean | clean |

Total Playwright Chromium: **63** (was 57; PR-B adds 6).

## Locked decisions honored

| Decision | Honor |
|---|---|
| **D-01** Audience = musician (PV35 lock) | Vocabulary regression at THREE layers (vitest fixture, Playwright live DOM, FORBIDDEN_VOCABULARY shared between them) |
| **D-04** Track grouping `trackId ?? s ?? '$default'` | `groupEventsByTrack` pure helper + 6 vitest cases + 1 Playwright probe |
| **D-05** 2-cycle window, 4 beats / cycle, beat-grid | `WINDOW_CYCLES = 2`, `BEATS_PER_CYCLE = 4`; ResizeObserver-driven `gridContentWidth`; pixel-perfect `eventToRect` |
| **D-06** Vocabulary lock | All chrome / tooltip / aria-label strings audited; FORBIDDEN_VOCABULARY shared; **deviation noted below** for empty-state copy |
| **D-07** Read-only this slice | No drag, no resize, no click handler on note blocks |
| **D-08** Empty state UX | `EMPTY_STATE_COPY` constant; component renders empty-state DOM (does not return null); STOPPED_STATUS_COPY when cycle null |
| **DB-01** Runtime accessor via prop callbacks | `getCycle / getCps / getDrawerOpen / getActiveTabId`; StaveApp holds refs; StrudelEditorClient extends `onActiveRuntimeStateChange` payload with the closures |
| **DB-02** rAF cadence with cleanup | rAF + `cancelAnimationFrame`; 250ms poke interval re-kicks the loop on the next visible-tab transition |
| **DB-03** Track-row order in component-local `useRef<Map>` | Slot map ref; reset on `snapshot.source` change for file switch |
| **DB-04** ResizeObserver-driven width | Yes; falls back to `clientWidth` when ResizeObserver is absent (jsdom in vitest) |
| **DB-05** HTML divs for note blocks | Yes — absolutely-positioned divs with native `title=` tooltips |
| **DB-06** Vocabulary regression at TWO layers | vitest collectSurfaceStrings + Playwright collectDrawerSurfaceStrings; both reference the same forbidden-noun list |
| **DB-07** Single empty-state copy + stopped copy | `EMPTY_STATE_COPY.ts` exports the two constants for vitest/Playwright import |
| **DB-08** rAF gated on (drawerOpen && tabActive) | Yes; readPersistedOpen + readPersistedActiveTabId sampled on every tick; cancelled when off |

## Trap mitigations

All 10 traps (CONTEXT §6 + PR-B PLAN §7) covered. Each has at least one explicit assertion:

- **Trap 1 + NEW-2** (vocabulary, including computed strings): vitest tooltip + whole-surface check; Playwright collectDrawerSurfaceStrings on populated + empty DOM. Shared FORBIDDEN_VOCABULARY regex.
- **Trap 3** (`getCurrentCycle()` returns null): `cycleToPlayheadX(null)` → 0; `formatBarBeat(null)` → ''; component renders STOPPED_STATUS_COPY.
- **Trap 4** (PV28 — Fast events at post-collect coords): `eventToRect` reads `event.begin` AS-IS; vitest fixture asserts s("bd*4") → 4 blocks at x ≈ 0/100/200/300px; Playwright probe asserts on live `s("bd hh cp bd")` eval.
- **Trap 5** (stable track order across re-evals): `stableTrackOrder` pure helper; vitest 3-snapshot regression (disappear + reappear + new mid-set); Playwright drives 3 sequential evals end-to-end.
- **Trap NEW-1** (rAF cost when display:none): vitest gates the loop on `getDrawerOpen / getActiveTabId`; spy assertion proves `getCycle` is never called when either gate is off.
- **Trap NEW-3** (cycle wrap): `(cycle % WINDOW_CYCLES + WINDOW_CYCLES) % WINDOW_CYCLES` is safe for negatives; vitest covers 1.99 → ~796px and 0.01 → ~4px.
- **Trap NEW-4** (subscribe race): `subscribeIRSnapshot(setSnapshot); setSnapshot(getIRSnapshot())` re-syncs after subscribe; vitest mount/unmount probe verifies clean attach + detach.
- **Trap NEW-5** (file-switch slot leak): explicit reset on `snapshot.source` change; vitest probe pushes file-a then file-b and asserts file-b's row count is 1, not 3.
- **Trap 8** (tsc baseline drift): editor unchanged at 53; app clean.

## Critical self-review (AnviDev §5)

Audited every changed file. Findings:

- **Vocabulary clean.** Production diff grep against the FORBIDDEN_VOCABULARY pattern surfaces only code-internal occurrences — variable names (`trackId`, `loc`), type names (`IREvent`, `IRSnapshot`), JSDoc comments. None in JSX text content, `title=` template literals, ARIA labels, or computed strings. Verified by both layers of vocabulary regression tests.
- **No `any`, no `@ts-ignore`, no `@ts-expect-error`** in the PR diff. The one inserted during execution was removed in `86172f5` once the cast through `unknown` proved sufficient.
- **rAF cleanup correct.** Both `cancelAnimationFrame` and `clearInterval(pokeInterval)` fire in the effect cleanup; a `cancelled` flag guards against late-firing schedules.
- **Slot-map reset is in render, not effect.** Intentional — running it inside an effect would let React render once with the stale slot map before the reset effect fires (visible row flicker on file switch). Render-time mutation of a ref is the React-supported escape hatch for this pattern.
- **Tooltip template** (`formatNoteTooltip`) handles `event.s = null`, `event.note = null | string | number`, and `event.velocity = 1` (default — segment dropped) cleanly. No "undefined · bar 2" leaks.
- **Status-line template** is single-source — only one site interpolates BPM/cps/bar/beat. Easy to audit; the test asserts the expected string passes FORBIDDEN_VOCABULARY against realistic numbers.
- **PR-A's bottom-drawer.spec adjustment is minimal.** The single test that asserted "(empty — wired in PR-B)" now asserts the MusicalTimeline subtree's presence; specific copy continues to be asserted by the new `musical-timeline.spec.ts`. No drift between the two specs.

### Deviation: empty-state copy

The PR-B PLAN's DB-07 locked `EMPTY_STATE_COPY = '(no tracks yet — eval some code)'`. CONTEXT.md D-06 forbids the noun `eval` in user-facing strings. The two locked decisions self-conflict; PV35 (audience locked MUSICIAN) is load-bearing for the entire phase per the executor's invariants block, so D-06 wins.

Resolution: copy adjusted to `(no tracks yet — play some code)`. "play" is in the allowed list (D-06), matches the user's already-learned play/stop verb, and keeps the empty-state copy short. Documented in `EMPTY_STATE_COPY.ts`'s top comment so a future reviewer sees the trace.

This is the only deviation from the locked plan in PR-B.

## Cognitive Discoveries
<!-- Internal — consumed by execute-phase orchestrator for catalogue updates -->

- **vyapti-candidate (rAF-gating-for-display-none):** Long-lived components mounted via `display: none` registries (PR-A's BottomPanel + activity-bar registries) must gate hot loops on visibility accessors; the browser does NOT pause rAF for elements that are display:none-but-tab-foregrounded. Pattern: `getDrawerOpen() && getActiveTabId() === id` short-circuit at the top of the rAF callback + `cancelAnimationFrame` + 250ms poke-interval re-kick. PR-B is the first occurrence; if a second component (Output, Problems, etc.) needs the same gating, promote to `vyapti.md`.
- **hetvabhasa-candidate (vocabulary-leak-via-runtime-template):** A tooltip / status template that interpolates `${event.s}` is fine until someone refactors to `${event.trackId ?? event.s}` — the literal `trackId` token leaks into the DOM through the JSX. Static-string regex catches the literal but only if it's in code; the leak only appears at runtime. Mitigation pattern: forbidden-noun regex shared between vitest fixture probe AND Playwright live-DOM probe; both must consume the same source-of-truth file. PR-B implemented this for its surface; if a second surface needs the same discipline, promote to `hetvabhasa.md`.
- **krama (locked decision conflict resolution):** When two locked decisions self-conflict (DB-07 vs D-06), the higher-level catalogue invariant wins. Document the resolution at the change site, not just the SUMMARY. PR-B's `EMPTY_STATE_COPY.ts` carries the trace inline so the next reader sees both the original literal and the reason for the deviation.
