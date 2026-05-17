# Roadmap: Stave (stave.live)

## Overview

Stave is a renderer-agnostic, engine-agnostic live coding platform delivered as an
embeddable React component library (@stave/editor). The architecture decouples five
independent islands — Language, Visualization, Synthesis, DAW, and Control — connected
by an Entity-Component bus. Any engine, any viz renderer, any synth backend plugs in.

Phases 1-6 shipped the foundation (Monaco, highlighting, 7 p5.js visualizers, VizRenderer
abstraction, per-track data, inline zones). Phase 8 shipped the engine protocol (ECS
components, LiveCodingEditor, multi-engine support). Phase 9 normalized the hap type
across engines. Phase F shipped the Free Monad PatternIR with parsers, interpreters,
and an ECS propagation engine. Phase 10 is in progress (error squiggles, completions,
hover docs shipped; tokenizer remaining). Sonic Pi Web integration is on a feature branch
with a working dual-engine demo.

See THESIS_COMPLETE.md for the full platform vision.
See SONIC_PI_WEB.md for the Sonic Pi browser engine thesis.
See FULL_TRANSPARENCY.md for the provenance/attribution framework.
See artifacts/stave/CLOSED-LOOP-PLAN.md for the substrate-progression plan from current state to closed-loop instrument.

## Primary objective — fully fledged source-level debugger (PIVOT 2026-05-07)

Stave's primary objective is a **fully fledged source-level debugger for
Strudel**, modelled on DWARF / Chrome DevTools / MSVC PDB. The first
production live-coding debugger with breakpoints, click-to-source on any
program point, and faithful runtime ↔ source mapping. The
`IR-DEBUGGER-NORTH-STAR.md` walkthrough is no longer a "read-only slice
of a larger thesis" — it IS the v1 + v2 deliverable.

**Why pivoted.** Bidirectional editing requires either full Strudel
coverage or a Roslyn-style CST — both large, ongoing, fragile against
Strudel upstream churn. Debugging requires a different (smaller)
property set: every observable event carries source provenance; every
runtime hap maps to an IR-node identity; the scheduler can pause on a
condition. Standard practice (gdb on stripped libraries, sourcemaps on
minified JS) does not require modelling the source language — only the
debug-info channel needs to be honest. The coverage gap collapses when
the IR wraps unmodelled fragments as opaque-but-loc-tagged regions.

### v1 + v2 scope

**v1 — Observation honest** (loc-completeness + opaque-fragment
wrapper). Two phases (20-03 + 20-04). After v1: every typed character
has a representation in the IR, every runtime event has a source
range, every visual surface can highlight any program point. Audio
still plays — the debugger has not yet learned to pause it.

**v2 — Identity + breakpoints** (hap → IR-node identity channel +
scheduler breakpoints). Two-to-three phases. After v2: gutter-click
sets a breakpoint condition; scheduler pauses; inspector renders chain
history at the pause point; user resumes.

### Catalogue support

- **PV36** — Loc-completeness (every IR node + every event carries `loc`; no transform may strip).
- **PV37** — Unrecognised chain methods wrap as `Code`-with-loc, never silently drop.
- **PV38** — Every observable hap maps to an IR-node identity.
- **P33** — Silent-drop in `applyMethod`'s `default:` arm (the trap class fixed by PV37).
- **PK13** — Source-level debugger projection lifecycle (parse → loc → collect → publish → run → match → render → break).
- **PV29** — Long-range 5-axis substrate progression remains valid as vision; PV36-38 are the immediate ratchets.
- **PV35** — Audience-classification gate (developer for IR Inspector chain view; musician for timeline / Monaco-highlight). Both consume the same identity channel (PV38).

### Deferred (long-range vision; not deleted)

| Phase | What | Why deferred |
|---|---|---|
| 19 (second half — bidirectional DAW) | Edit DAW → patch IR → re-emit code | Requires full coverage or CST. Both larger than the debugger needs. |
| 20 (Transform Graph as **edit** surface) | React Flow node patcher; bypass/solo; bidirectional edit nodes → IR → code | Read-only Transform Graph survives as the "stack frames" view for the debugger; the *edit* direction is what's deferred. |
| 22 (Audio Analysis + Vocals) | Audio → IR with provenance | Audio→IR is a separate substrate from source→IR. Debugger thesis works on source→IR first; audio→IR rejoins later. |
| 23 (Layer 3 timbre / transparent AI) | Kernel/wavelet representation; normalizing flow synth | Pure synthesis substrate; orthogonal to debugging. |
| Closed-loop milestone | Any sample → IR → code → audio with provenance | Emerges from 22 + 23 + bidirectional-edit, all deferred. |

See `artifacts/stave/CLOSED-LOOP-PLAN.md` (status: deferred) for the
long-range substrate vision; `artifacts/stave/IR-DEBUGGER-NORTH-STAR.md`
(status: feature spec, promoted) for the active debugger contract;
`memory/project_debugger_thesis.md` for the pivot context.

## Substrate progression — long-range vision (deferred 2026-05-07)

> The five-substrate framing below remains the long-range north-star.
> Active prioritization is governed by the debugger primary-objective
> section above. Read this section for "what unlocks once the debugger
> ships," not for "what to plan next."

Stave is not a sequencer plus a debugger; it is a sequencer where the debugger is
built into the medium. The destination is **one IR with multiple views** —
Code, DAW, Viz, Transform Graph, Sound — each editable, each kept honest by
parity verification. The Ableton-class capability ("any sample → manipulate via
code → reconstruct with full provenance") emerges once five substrates are
honest:

| Substrate | Means | Ratchet phase |
|---|---|---|
| **Code** is honest | parser models what users actually type, parity-verified | Tier 4 (19-03 ✓ + 19-04 ✓) + mini-notation finish |
| **Stages** are honest | parser splits into named stages; bugs locate to the stage that introduced them | Phase C (parser decomposition) |
| **Time** is honest | streaming timeline captures + replays past evals; temporal bugs become observable | Streaming timeline (Model B — partially shipped 19-08) |
| **Observation** is honest *(was: Editing — narrowed for v1)* | every IR node carries source loc; every runtime event maps back to source | **Phase 20-03 + 20-04 (active)** |
| **Editing** is honest *(deferred)* | every view is editable; edits round-trip through the IR | Bidirectional DAW (19 second half) + Transform Graph (Phase 20 edit surface) |
| **Sound source** is honest *(deferred)* | audio→IR closed loop; samples carry provenance through transforms back to source | Audio Analysis + Vocals (Phase 22) + Layer 3 timbre (Phase 23) |

When all six land, "Ableton replacement" is not a roadmap line item — it's the
emergent capability of the substrate stack. See `artifacts/stave/CLOSED-LOOP-PLAN.md`
for the detailed sequence, dependencies, decision points, and what unlocks where.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)
- Hyphenated decimal phases (20-03, 20-04): Sub-phases within an existing phase number (e.g. debugger v1 within phase 20)

**Status markers:**
- `[x]` shipped, `[ ]` open, `[~]` deferred (long-range vision; not actively planned — see header for reason).

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Active Highlighting** - Notes in the Monaco editor light up in sync with the audio scheduler (completed 2026-03-21)
- [x] **Phase 2: Pianoroll Visualizers** - Rolling pianoroll canvas + inline view zones + toolbar layout wired (completed 2026-03-22)
- [x] **Phase 3: Audio Visualizers** - Scope, FScope, Spectrum, Spiral, Pitchwheel, Wordfall canvas visualizers (completed 2026-03-22)
- [x] **Phase 4: VizRenderer Abstraction** - Replace p5-coupled SketchFactory with renderer-agnostic VizRenderer interface (completed 2026-03-22)
- [x] **Phase 5: Per-Track Data** - Expose per-track PatternSchedulers via monkey-patching Pattern.prototype.p (completed 2026-03-22)
- [x] **Phase 6: Inline Zones via Abstraction** - Per-pattern .viz("name") opt-in replacing blanket inlinePianoroll prop (REPLANNED 2026-03-23) (completed 2026-03-22)
- [x] **Phase 8: Engine Protocol** - ECS components, LiveCodingEngine, LiveCodingEditor, DemoEngine, VizDescriptor.requires[] filtering, engine-agnostic viewZones (completed 2026-03-25)
- [x] **Phase 9: Normalized Hap Type** - NormalizedHap interface, engine-agnostic sketches and highlighting (completed 2026-03-25)
- [x] **Phase F: Free Monad PatternIR** - PatternIR ADT (15 node types), parseMini, parseStrudel, collect/toStrudel interpreters, ECS propagation engine, StrudelEngine integration (completed 2026-03-28)
- [ ] **Phase 7: Additional Renderers** - Canvas2D renderer, HydraEngine (visual LiveCodingEngine), Level 1 DAW timeline
- [ ] **Phase 10: Monaco Intelligence** - Strudel tokenizer, completions, hover docs, error squiggles (10-01 + 10-02 shipped)
- [x] **Phase 10.1: Viz Editor v0.1.0+** - Tab groups + splits (VS Code-style), multi-model Monaco, VizPreset/IndexedDB, vizCompiler (code→descriptor), hot reload, VizDropdown (grouped, replaces icon bar), preview modes (panel/inline/bg/pop-out), tab dragging between groups, resizable splits, bundled/user ID namespacing with auto-versioning. See artifacts/stave/VIZ-EDITOR-DESIGN.md. INSERTED. (merged via PR #2 on 2026-04-09)
- [ ] **Phase 10.2: Workspace Shell Refactor** - Single-editor-per-view architecture (markdown-preview model). Split current StrudelEditor/LiveCodingEditor/VizEditor into uniform `EditorView` (Monaco only) + `PreviewView` (file-extension-aware, hot-reloads on change). Preview provider registry. WorkspaceAudioBus singleton (pattern previews publish, viz previews consume). Generic tab/group/split shell that holds any view. Removes per-group `previewMode` state — preview becomes a separate view opened via command. INSERTED 2026-04-08. See artifacts/stave/IDE-SHELL-DESIGN.md §1-3.
- [ ] **Phase 10.3: IDE Shell** - MenuBar (File/Edit/View/Run/Preferences/Help with dropdowns), FileExplorer (left sidebar, tree view, context menu, drag-drop), VirtualFileSystem (IndexedDB-backed, generalizes VizPresetStore — files/folders/recent/rename/delete/import-export), CommandPalette (Cmd+K / Cmd+Shift+P fuzzy over all actions), StatusBar (BPM/errors/live-mode/active-engine), Settings dialog (themes/hotkeys), ProjectManifest (stave.project.json, .zip export). Built on top of 10.2's workspace shell. INSERTED 2026-04-08. See artifacts/stave/IDE-SHELL-DESIGN.md §4-7.
- [ ] **Phase 11: Library Polish + Publish** - tsup build, README, publish @stave/editor to npm
- [ ] **Phase 12: Synth Invariance** - SynthBackend interface, SuperSonicBackend, SuperdoughBackend, MidiBackend
- [ ] **Phase 13: External Sync** - SyncComponent, LinkBridge (WebRTC), MidiInput
- [ ] **Phase 14: Recording & Export** - Engine-agnostic Recorder, WAV export, stem export
- [ ] **Phase 15: Provenance** - SessionLog, Ed25519 signing, WAV metadata embedding
- [ ] **Phase 16: Collaboration** - Yjs CRDT + WebRTC, cursor presence, shared tempo via Link
- [ ] **Phase 17: UI Bento Box** - Slider/knob/XY pad controls, MIDI CC mapping, slider() DSL
- [ ] **Phase 18: Composr Integration** - Replace iframe with <StrudelEditor>, renderStems, per-stem export
- [~] **Phase 19: Pattern IR pipeline (foundation shipped; bidirectional half DEFERRED 2026-05-07)** - Shipped: Pattern IR types (19-01 ✅), Pass Instrumentation v1 (19-02 ✅), Tier 4 first half — `jux`/`off`/`degrade`/`late`/`chunk`/`ply` (19-03 ✅, PR #69), Tier 4 second half — `layer`/`struct`/`swing`/`pick`/`shuffle`/`scramble`/`chop` (19-04 ✅, PR #73), `loc` + `userMethod` on non-Play tags (19-05 ✅), implicit-IR projection in Inspector (19-06 ✅), streaming timeline + capture buffer (19-07/08 ✅, PRs #86+#87). **Deferred (per debugger thesis 2026-05-07):** bidirectional DAW second half — IRNodeMeta provenance, Poly backward maps, DawVizRenderer interactive editing, BidirectionalBinding, code synthesis tiers, AudioRegion node. Reach after debugger v2 ships. See artifacts/stave/STAVE-STUDIO-DESIGN.md §5-6 (status: deferred), artifacts/stave/IR-TIER-4-FORCED-TAGS.md.
- [x] **Phase 20-01 / 20-02: Musician Timeline (foundation)** - Bottom drawer + MusicalTimeline slice β shipped (PR #90 + #92, main e683315). Visual polish to Variant A mockup parity shipped (PR open as of 2026-05-07 — feat/musical-timeline-mockup-skin). Audience: musician (PV35-locked). The first user-facing surface that the debugger projection (PK13) renders to.
- [ ] **Phase 20-03: Loc-completeness across IR (debugger v1 — first half)** — Every `applyMethod` arm constructs IR nodes with `loc` (via `tagMeta` or literal-shape — see PK12). Every collect arm propagates `loc` onto produced events. Click-to-source resolves for *any* event in the timeline / piano roll to its exact source range — including transforms, not just leaf Plays. The `feat/musical-timeline-mockup-skin` branch already carries 5 click-to-source commits (`cc19d5b`, `571898d`, `599826c`, `e71627e`, `eab49d5`) — these become the first slice (slice γ) of this phase, retroactively scoped here. Remaining: extend loc-attribution to all non-Play tag constructions; propagate through every collect arm uniformly; add review-time gap check ("does this construction call `tagMeta`?"). Closes G3 from the IR-vs-Strudel disparity catalog. Codified as **PV36** (loc-completeness contract). See `memory/project_debugger_thesis.md`, `artifacts/stave/IR-DEBUGGER-NORTH-STAR.md`.
- [ ] **Phase 20-04: Opaque-fragment wrapper (debugger v1 — second half)** — `applyMethod`'s `default:` arm wraps the receiver as `Code`-with-loc node carrying the entire `.method(args)` call-site range and a back-pointer to the inner IR. `toStrudel` round-trips the wrapper verbatim. Inspector renders `[opaque: .release(0.3)]` with the inner IR still inspectable. Removes the silent-drop trap class for ~25 currently-unrecognised chain methods (`.s`, `.n`, `.note`, `.bank`, `.scale`, `.release`, `.attack`, `.sustain`, `.decay`, `.shape`, `.amp`, `.detune`, `.octave`, `.tremolo`, `.lfo`, `.legato`, `.unison`, `.coarse`, `.fine`, `.add`, `.sub`, `.mul`, `.div`, `.range`, `.outside`, `.inside`, `.zoom`, `.compress`). Closes K1/K2/K3 + B1 from the disparity catalog. Codified as **PV37** (wrap-never-drop) + **P33** (silent-drop trap class). After this phase: every typed character has a representation in the IR. The MLIR-opaque-op pattern applied to Strudel chains.
- [ ] **── Debugger v1 milestone: every typed character has a representation in the IR; click-to-source resolves anywhere ──** (emerges from 20-03 + 20-04 landing together)
- [ ] **Phase 20-05+: Debugger v2 (engine ↔ IR identity + scheduler breakpoints)** — Every NormalizedHap carries `irNodeId`; runtime → IR-node lookup is byte-stable across `query()` calls within a snapshot's lifetime (PV38). Live source-range highlighting on hap dispatch (Monaco highlights the exact `loc` range when audio plays — reverse direction of click-to-source). Gutter-click registers a breakpoint condition; scheduler pauses; inspector renders chain history at the pause point. Audio-pause UX needs design (silence on break vs hap-by-hap stepping with audio still flowing vs freeze-mode with last grain looping). Two-to-three sub-phases. After v2: stave is the first production live-coding source-level debugger. See `memory/project_debugger_thesis.md` v2 scope.
- [ ] **Phase 20-10: Param-method promotion — close the silent-semantics gap (closes #108)** — Promote the issue #108 starter-set of chain methods (`s, n, note, gain, velocity, color, pan, speed, bank, scale`) from `Code`-with-via wrappers to a typed `Param` IR tag carrying `{ key; value: string | number | PatternIR; rawArgs; body; loc; userMethod }`. Mirrors 19-03/19-04 typed-method shape. The collect arm injects the resolved value into `ctx.params` before walking the body — `evt.s = "sawtooth"` after `.s("sawtooth")`. Pattern-arg form (`.s("<bd cp>")`) is in scope: inner mini parsed via `parseMini` into a sub-IR; collect queries the sub-IR at `ctx.time` for per-event resolution. `toStrudel` round-trips `.${userMethod}(${rawArgs})` byte-equal — same discipline as Code-with-via. Migrates existing FX-group arms for `gain/pan/speed` to the new tag (single source of truth). PV37 stays intact for the remainder of the silent-drop list (release/attack/sustain/decay/crush/distort/etc.) — those ship in a follow-up phase reusing this substrate. Codifies a NEW vyapti: "param-bearing chain methods MUST inject into ctx.params before projection" — pair with PV37 (PV37 = REPRESENTATION completeness; new = SEMANTICS completeness). After this phase: the user's fixture from #108 produces 7 distinct timeline tracks {sawtooth, sine, square, hh, bd, sd, cp}; Inspector chrome distinguishes Param (sample-bucket / track-defining) from FX (audio-effect chip) per PV35 musician audience. CONTEXT at `.planning/phases/20-musician-timeline/20-10-CONTEXT.md`. Three waves: α parser+collect+IR shape, β toStrudel+Inspector chrome+pattern-arg sub-IR, γ end-to-end fixture + round-trip + chrome snapshot. See issue #108, `memory/project_phase_20_musician_timeline.md` "Architecture notes for the #108 fix".
- [ ] **Phase 20-11: Track substrate — `$:` → trackId + palette of 32** — Auto-assign `evt.trackId` from `$:` position in the parser (`d1`, `d2`, ... or `.p("name")` if user-typed). `groupEventsByTrack` already prefers `trackId` over `s` (groupEventsByTrack.ts:41); the parser just doesn't populate it today. Two `$:` blocks with identical samples render as two distinct rows (closes the duplicate-`$:`-collapse bug surfaced in 20-10 γ-4). Track color from palette of 32 (Ableton-16, Logic-16, Reaper-unbounded — 32 is the sweet spot). Foundational for 20-12 chrome work. CONTEXT in `.planning/phases/20-musician-timeline/20-11-DESIGN-DEBATE.md`.
- [ ] **Phase 20-12: Track chrome — collapsible rows, no bar labels, opacity=velocity, Y=pitch** — Replace evt.s-keyed bucketing with proper track chrome. Collapsible rows (collapsed = one glued row; expanded = sub-rows per stack-arg voice; Ableton group-track + drum-rack model). NO labels on bars (12px-wide bars at typical zoom can't fit text); identity via row header (left rail), row color (track-derived), bar opacity (velocity/gain), bar Y position (pitch for melodic voices), hover tooltip (full chain). Strudel's musical primitives — `s`, `note`, `n`, `freq`, `chord` — all participate; melodic voices use Y-as-pitch within a sub-row, not multiple sub-rows-per-pitch. Depends on 20-11. Open questions parked in DESIGN-DEBATE.md (custom-color persistence, collapsed-state persistence, silent-prefix rendering verify). **STATUS 2026-05-10:** chrome SHIPPED LOCAL on `feat/20-12-track-chrome` (17 commits, head 25af931). All 6 D-* decisions verified — PV41 5-channel contract codified, P54 label-trap + P55 popover-order codified. Editor 1515 / App 277. Gated on manual γ-5 visual gate + 20-10 → 20-11 → 20-12 PR sequence. See `20-12-SUMMARY.md`.
- [ ] **Phase 20-12.1: Pause-resets slot map (INSERTED 2026-05-13)** — Fix the F-1 misdiagnosis surfaced post-merge of #117/#118: the "empty `d2` ghost row with faded label" symptom that F-1 attributed to `extractTracks` is actually `MusicalTimeline.tsx:561` + `stableTrackOrder.ts` retaining the slot of a disappeared trackId across re-evals (D-04 design — Trap 5 fix from Phase 20-01). The current rule "every disappeared trackId stays reserved forever (until file switch)" is right for the A/B audition workflow (comment a `$:` to compare, uncomment to restore row order) but wrong for permanent removal (no clean way to release ghost rows without switching files). Proposed UX rule: **ghost rows persist only during live hot-reload (transport playing); transport stop clears the slot map so the next play snaps to the current IR's tracks.** One-file behavior change to MusicalTimeline.tsx (add a second reset trigger keyed on playing→stopped edge alongside the existing source-change reset at line 554) + amended D-04 catalogue entry + 3 new stableTrackOrder/MusicalTimeline tests covering: (a) stop→play with same IR yields same order, (b) stop→play after commenting `$:` drops the ghost row, (c) hot-reload while playing keeps the ghost row (D-04 unchanged for the audition case). Depends on 20-12. Anticipated traps: P52 (mount-path — does the transport-state seam exist in `props.getHapStream()` / a sibling accessor, or does it need to be added?), P63 (Y.Doc writes during render — slotMap reset must not write to Y.Doc, only to the local ref). See `.planning/phases/20-musician-timeline/FOLLOWUPS.md#F-1` for the original (misdiagnosed) finding and the observation-driven reframe.
- [ ] **Phase 20-14: Strudel.cc parity (eval-scope mirror + sample/alias layer) (issue #110)** — Any program that runs on strudel.cc/bakery should run on stave with the same audible + visual result. Mirror upstream's REPL bootstrap (read `tidalcycles/strudel` website/src/repl/ init, enumerate every `evalScope` / `samples` / `register*()` call), copy into `StrudelEngine.init()` with config-gated tiers (audio-pure default; Csound / MIDI / OSC opt-in). Add alias layer (`s("piano") → gm_piano`, `s("kick") → bd`) so bare names resolve to registered GM soundfonts. Pin with parity smoke test (10-20 canonical strudel.cc examples → assert IR shape + bar count + event count match). Discovery context: 20-12 manual-gate found `s("piano")` fails because GM names are `gm_*`-prefixed and Dirt-Samples has no `piano` folder. Three waves anticipated: α bootstrap mirror + tier flags, β alias layer + soundMap wrapper, γ parity smoke test corpus + CI gate. Out of scope v1: Bakery UI (sample-pack sharing), Csound bundle by default. **STATUS 2026-05-15:** α/β/γ all SHIPPED LOCAL as stacked PRs #123 → #131 → #133 (closes #110 at γ merge). Upstream moved GitHub→Codeberg (`uzu/strudel` @ SHA `f73b3956`). α loaded the missing manifests + `Pattern.prototype.piano` + 8-flag tier schema; β added the 30-entry hand-curated alias layer + Strategy-A intercept + tier UI (MIDI live, 7 scaffolded → follow-ups #124–#130) + friendly-error integration; γ vendored a 16-tune structural-parity corpus + CI gate + `pnpm parity:refresh`. γ surfaced + fixed 3 parser gaps (prelude strip, bare-string-as-pattern, multi-line chains) → 15/16 corpus tunes now structured (was 0/16). Residual: arpoon recursive-args (#132). See `20-14-{CONTEXT,RESEARCH,PLAN,α/β/γ-SUMMARY}.md`, issue #110.

- [x] **Phase 20-15: Strudel.cc parity hardening** — SHIPPED-LOCAL 2026-05-16 (`feat/20-15-parity-hardening`, 17 commits, NOT yet PR'd). All 6 gap classes closed (G1#134 γ-3, G2#135 α-1, G3#136 β-3, G4#137 α-4, G5#138 γ-2 + full D-01 timeline wiring, #132 β-2). **Real-world Bakery parity 4/10 (40%) → 72.0% (36/50, N=50 fresh Supabase, dated+SHA'd)**, independently re-verified. PV49 shared-walker substrate realized; PV51 (isSampleKey recursion) + P68 (tsup-watch-dies-on-DTS, root-caused & fixed via #145) catalogued. ≥9/10 known set; loc-fidelity 25/25 (pre-mortem drift provably absent); editor 1564/1564; 11/16 corpus byte-unchanged + 5 GOAL-permitted bare-Code→structured improvements. New friction → backlog #140–#145 (NOT fixed — scope discipline); γ-4 dropped (#140). Verifier verdict: GOAL ACHIEVED (2 pre-PR cleanups resolved). Original plan ↓ — A 2026-05-15 stress test of 10 live patterns from strudel.cc's Bakery (Supabase `code_v1` backend) measured **4/10 structurally parsed** — far below the curated corpus's 15/16, because real community code is messier than canonical examples. The misses decomposed into 5 named, reproducible parser-gap classes plus the deferred recursive-args gap from 20-14. This phase closes them. **Gaps:** G1 top-level `let`/`const` bindings + variable references (#134, 2/10, highest frequency, hardest — needs a mini symbol table / inline expansion); G2 `setcpm` and the `set*` family missing from `stripParserPrelude`'s skip set (#135, trivial ~1-line + the α-6 settingPatterns audit as authoritative source); G3 backtick template-literal string args incl. multi-line mini-notation (#136, root-matcher + bare-string arm, `${}`-interpolation → graceful fallback); G4 comment-only lines between `stack()` args (#137, arg-splitter doesn't strip interior `//` lines); G5 named-label `name: pattern` syntax (#138, generalize `extractTracks`'s `$:` regex with `:`-ambiguity false-positive guards — wires named tracks directly into the PR #116/#119 trackId/slot substrate); plus #132 recursive parsing inside `note`/`n`/`s` args (nested mini-with-chain — the arpoon residual). **Three waves:** α cheap-wins + shared substrate (G2 skip-set; extract a shared `skipWhitespaceAndLineComments(src,pos)` walker used by prelude + chain + arg-splitter per the γ-SUMMARY vyapti candidate; G4 consumes it); β root-matcher extensions (G3 backtick + #132 recursive args — same `parseRoot` surface, bundle); γ statement-level (G5 named labels via generalized `extractTracks` + false-positive matrix; G1 binding map + inline expansion — hardest, last). **Verification:** promote the 10-pattern Bakery probe to a permanent regression corpus subset (the 6 failing fixtures vendored alongside the 16 canonical tunes); target ≥9/10 structured; all existing 15/16 + corpus snapshots unchanged. **Out of scope:** template-literal `${}` interpolation evaluation (real JS — Code-fallback is correct), function/arrow-fn bindings, destructuring binds, a full JS parser (the structural matcher stays a matcher). **Inheritable substrate:** the shared whitespace/comment walker (3 existing callers + future splitArgs-style walkers); the binding map (reusable by any future "resolve references" / macro-expansion feature); named-label→trackId wiring (the timeline most wants this — label IS the track name, no `.p()` needed). Depends on 20-14 (α/β/γ merged — builds directly on the prelude/bare-string/chain parser work). See issues #132, #134, #135, #136, #137, #138 + the 2026-05-15 Bakery stress-test note in `memory/project_phase_20_musician_timeline.md`.

- [~] **Phase 20-13: Structure view as toggle (bundled-cycles overview) — DEFERRED 2026-05-09 (speculative)** — Alt view mode that collapses identical consecutive cycles into bundled cells with "cycle X/N" counter tags. Trackers (Renoise pattern matrix) precedent. Default stays Cycle view (linear, live-coding native); Structure view is a toggle for song-overview / composition review. Only collapses where bundling helps — `degrade()`/`shuffle()`/`scramble()`/`sometimes()`/`rand()` produce unique cycles every cycle and render linearly within Structure view automatically. GLOBAL alignment (bundle boundaries = where ANY track changes; not per-row). Mechanics: cycle hash via JSON-stringify after sort, look-ahead N cycles (default 10), scrub-within-bundle advances counter. Out of scope: arrangement-view semantics (drag clips to absolute bars) — Strudel has no absolute-time placement primitive; that's a separate much-larger product question. Status: speculative; ship only on clear demand. CONTEXT in DESIGN-DEBATE.md.
- [ ] **Phase 20-09: Bake-and-scrub — scrub becomes real seek** — Replace 20-08's preview-only scrub (release snaps the playhead back to the engine's pre-scrub cycle because cyclist exposes no seek-on-resume API per S1) with sample-accurate seek over a pre-rendered audio buffer. After Effects RAM-preview model: bake the active pattern over an N-cycle window via WebAudio's `OfflineAudioContext`, cache the resulting `AudioBuffer` keyed on `(effective-pattern-hash, cycle-range, sampleRate, sample-set-hash)`, and route the 20-08 scrub release path to an `AudioBufferSourceNode.start(when, drop-offset)`. Drop position becomes the actual playback position. Three waves (mirrors 20-08's α/β/γ): α offline-render path (`bakePattern(pattern, cycleRange, sampleRate) → Promise<AudioBuffer>`, no UI, deterministic per RNG-chain seed); β release-path fork (fresh bake → buffer source; stale → fall back to 20-08 preview-only; staleness indicator on timeline); γ live-mode handoff state machine (`live | baking | scrubbing | resuming`). Anticipated trap classes: P11 re-application (AudioWorklet portability to OfflineAudioContext), T13 (state machine via refs not deps), P52 (mount-path: AudioBufferSourceNode mounts on LIVE AudioContext, not offline one — direct-observation gate before commit), new candidate (deterministic seeded RNG per cycle position so two bakes produce identical buffers, per `feedback_strudel_rng_chain.md`). Out of scope v1: sliding-window continuous bake, export-to-wav (the bake produces an AudioBuffer that COULD be encoded — defer), bake-while-editing, cross-pattern transitions. Inheritable substrate: `bakePattern()` is reusable by export-to-wav / A/B audition / offline analysis (axis 5d roadmap); the transport-mode state machine is the substrate any future "loop this cycle" / "audition before commit" feature builds on. Depends on 20-08, Phase 7 (AudioWorklet), Phase F (PatternIR cache key).
- [~] **Phase 20 (Transform Graph as edit surface) — DEFERRED 2026-05-07** - React Flow node patcher (visual free monad), bypass/solo toggles, bidirectional (edit nodes → IR → code). The read-only Transform Graph survives as the **chain-history "stack frames"** view for the debugger; the *edit* direction is what's deferred. See STAVE-STUDIO-DESIGN.md §4.
- [ ] **Phase 21: Indian Classical** - Tala Circle VizRenderer, bol notation, tihai verification, layakari via fast() slider
- [~] **Phase 22: Audio Analysis + Vocals — DEFERRED 2026-05-07** - Audio→IR with provenance. Re-enters after debugger v2 ships. Originally the upstream half of the Ableton-replacement loop. See STAVE-STUDIO-DESIGN.md §6-7 (status: deferred), artifacts/stave/CLOSED-LOOP-PLAN.md (status: deferred).
- [~] **Phase 23: Transparent AI / Layer 3 timbre — DEFERRED 2026-05-07** - Kernel/wavelet representation; normalizing flow synth; training-data attribution. Pure synthesis substrate; orthogonal to debugging. Re-enters after debugger ships. See STAVE-STUDIO-DESIGN.md §3, artifacts/stave/CLOSED-LOOP-PLAN.md (status: deferred).

- [~] **── Closed-loop milestone: any sample → IR → code → audio with provenance ── DEFERRED 2026-05-07** (emerges from 19 second half + 20 edit + 22 + 23, all deferred until debugger v2 ships)

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
**Plans:** 1/1 plans complete
Plans:
- [x] 05-01-PLAN.md — TDD: getTrackSchedulers() with setter-intercept pattern capture

### Phase 6: Inline Zones via Abstraction (REPLANNED)
**Goal**: Replace the blanket `inlinePianoroll` prop with per-pattern `.viz("name")` opt-in. Register `.viz()` on Pattern.prototype during evaluate(), capture viz requests per track, and refactor viewZones.ts to create zones only for opted-in patterns with the correct viz type resolved from VizDescriptor[].
**Depends on**: Phase 4, Phase 5
**Requirements**: ZONE-01, ZONE-02, ZONE-03, ZONE-04
**Success Criteria** (what must be TRUE):
  1. `.viz("pianoroll")` chained on a pattern causes an inline zone with pianoroll to appear after that pattern's block
  2. Patterns without `.viz()` get no inline zone
  3. Any viz type from DEFAULT_VIZ_DESCRIPTORS works (e.g. `.viz("scope")`, `.viz("spectrum")`)
  4. Zone appears after the LAST LINE of the pattern block (not after the `$:` line)
  5. InlineZoneHandle pause/resume lifecycle works (pause on stop, resume on play)
  6. `inlinePianoroll` prop removed from StrudelEditorProps
**Plans:** 2/2 plans complete
Plans:
- [x] 06-01-PLAN.md — Register .viz() capture in StrudelEngine + refactor viewZones.ts to opt-in + update tests
- [x] 06-02-PLAN.md — Wire StrudelEditor with vizRequests, remove inlinePianoroll prop, visual verification

### Phase 7: Additional Renderers + Hydra Engine
**Goal**: HydraEngine (proves visual component), Canvas2D renderer (lightweight), Level 1 DAW timeline (read-only, requires queryable).
**Depends on**: Phase 8
**Success Criteria** (what must be TRUE):
  1. HydraEngine implements LiveCodingEngine with visual component (canvas passthrough)
  2. VizPicker disables all audio/streaming viz for Hydra, shows "Hydra Output" only
  3. Canvas2DVizRenderer renders basic pianoroll without p5 dependency
  4. Level 1 DAW VizRenderer: multi-track timeline, playhead, zoom, requires: ['queryable']
**Plans:** TBD

### Phase 8: Engine Protocol (COMPLETE — 2026-03-25)
**Goal**: Define the LiveCodingEngine interface with Entity-Component architecture. Refactor StrudelEngine. Create LiveCodingEditor. Build DemoEngine. Make inline viz engine-agnostic.
**Depends on**: Phase 5
**Success Criteria** (all TRUE):
  1. LiveCodingEngine interface with 5 core methods + ECS components bag
  2. StrudelEngine implements LiveCodingEngine without behavioral change
  3. LiveCodingEditor accepts engine prop (not hardcoded to Strudel)
  4. StrudelEditor is thin wrapper around LiveCodingEditor
  5. DemoEngine proves interface with streaming + audio + inlineViz (no queryable)
  6. VizRenderer.mount() accepts Partial<EngineComponents> (component bag)
  7. VizDescriptor.requires[] filters VizPicker by available components
  8. viewZones.ts is engine-agnostic (reads inlineViz component, no $: scanning)
  9. All 140 tests pass, conformance suite added
**Plans:** 3/3 plans complete (08-01, 08-02, 08-03)
Plans:
- [x] 08-01-PLAN.md — LiveCodingEngine interface + StrudelEngine conformance + LiveCodingEditor + StrudelEditor wrapper + exports (5 tasks)
- [x] 08-02-PLAN.md — VizRenderer component bag + VizDescriptor.requires[] + VizPicker filtering + engine-agnostic viewZones + tests (7 tasks)
- [x] 08-03-PLAN.md — DemoEngine + conformance tests + integration verification (4 tasks)

**Also shipped (unplanned, on feat/sonic-pi-engine branch):**
- SonicPiEngine adapter wrapping sonicPiWeb (streaming + audio + inlineViz)
- Dual-engine demo app (Strudel ↔ Sonic Pi tabs)
- viz :scope DSL parsing in adapter (stripped before engine sees it)
- SuperSonic loaded via bundler-proof dynamic import from CDN

### Phase 9: Normalized Hap Type
**Goal**: Define a normalized Hap interface that engines map their native events to. Viz layer and highlighting become truly engine-agnostic — sketches and active highlighting work with any engine's events without modification.
**Depends on**: Phase 8
**Requirements**: HAP-01, HAP-02, HAP-03, HAP-04, HAP-05
**Success Criteria** (what must be TRUE):
  1. NormalizedHap interface defined (begin, end, endClipped, note, freq, s, gain, velocity, color) and exported from index.ts
  2. StrudelEngine maps Strudel haps to NormalizedHap via normalizeStrudelHap() in PatternScheduler.query()
  3. All 4 queryable sketches (Pianoroll, Spiral, Pitchwheel, Wordfall) consume NormalizedHap — no raw Strudel hap access
  4. HapStream.emitEvent(event: HapEvent) added — engines emit HapEvents directly without constructing Strudel-specific hap objects. Legacy emit() preserved for backward compat. HapEvent.hap made optional.
  5. DemoEngine and SonicPiEngine adapter use emitEvent() directly — no fake Strudel hap construction
**Plans:** 3 plans
Plans:
- [x] 09-01-PLAN.md — NormalizedHap type + normalize function + PatternScheduler contract + StrudelEngine wrappers + index.ts export (5 tasks)
- [x] 09-02-PLAN.md — Migrate all 4 queryable sketches to consume NormalizedHap (5 tasks)
- [x] 09-03-PLAN.md — HapStream.emitEvent() + HapEvent cleanup + DemoEngine/SonicPiAdapter updates (4 tasks)

### Phase F: Free Monad PatternIR (COMPLETE — 2026-03-28)
**Goal**: Ship a universal Pattern IR based on free monads — a tree ADT with 15 node types, parsers for mini-notation and Strudel code, interpreters (collect → IREvent[], toStrudel → code string), JSON serialization, and an ECS propagation engine wired into StrudelEngine.
**Depends on**: Phase 8
**Success Criteria** (all TRUE):
  1. PatternIR ADT with 15 node types (Pure/Seq/Stack/Play/Sleep/Choice/Every/Cycle/When/FX/Ramp/Fast/Slow/Loop/Code) and IR.* smart constructors
  2. collect interpreter walks the tree → IREvent[] with time accumulation, multiplicative speed, FX/Ramp param override
  3. toStrudel interpreter produces idiomatic Strudel code (mini-notation collapse, stack indentation, method chains)
  4. JSON round-trip serialization with schema versioning (patternir/1.0)
  5. parseMini: recursive descent for mini-notation (sequences, rests, cycles, sub-sequences, repeat, sometimes)
  6. parseStrudel: structural matcher for Strudel code (note/s/stack, $: syntax, method chain walking, Code fallback)
  7. ECS propagation engine: ComponentBag, System interface with strata, propagate() with stratum ordering
  8. StrudelEngine.evaluate() runs propagation, exposes ir component on EngineComponents
  9. 110+ new tests, 281 total passing
**Plans:** 2/2 plans complete
Plans:
- [x] F-01-PLAN.md — PatternIR ADT, collect/toStrudel interpreters, JSON serialization, 77 tests
- [x] F-02-PLAN.md — parseMini, parseStrudel, propagation engine, StrudelEngine integration, 33 integration tests

### Phase 10: Monaco Intelligence (IN PROGRESS)
**Goal**: The Monaco editor understands Strudel code — syntax elements get distinct colors, users get completions for functions and note names, hovering a function shows docs, and evaluation errors appear as red squiggles.
**Depends on**: Phase 4
**Requirements**: MON-01, MON-02, MON-03, MON-04, MON-05, MON-06, MON-07, MON-08, MON-09
**Success Criteria** (what must be TRUE):
  1. Strudel functions (note, s, gain, stack, every, jux, fast, slow, etc.) are highlighted in blue; note names in green; mini-notation operators distinctly colored
  2. Typing a dot after a pattern value shows a completion list of all chainable Strudel functions with their signatures
  3. Inside `note("...")` or `s("...")`, completions offer context-appropriate values (note names, oscillator types, percussion names)
  4. After an evaluate() error, the error location is underlined with red squiggles in Monaco; hovering shows the message
  5. Hovering a Strudel function name shows a documentation popup with the function signature and an example
**Plans:** 2/TBD plans complete
Plans:
- [x] 10-01 — Eval error squiggles via setModelMarkers
- [x] 10-02 — Dot completions, note completions, hover docs
- [ ] 10-03 — Strudel tokenizer / syntax highlighting (TBD)

### Phase 10.1: Viz Editor v0.1.0+ (COMPLETED 2026-04-08)
**Goal**: Users can author custom visualizations (Hydra shaders, p5 sketches) in a dedicated editor with hot-reload preview, save them to local storage, and reference them by name from pattern code via `.viz("name")`.
**Depends on**: Phase 4 (VizRenderer abstraction), Phase 8 (engine protocol)
**Branch**: feat/viz-mode-renderer-convention
**Success Criteria** (what is TRUE):
  1. `VizPreset` type + `VizPresetStore` (IndexedDB) — CRUD for user-authored viz presets
  2. `vizCompiler` compiles code strings → `VizDescriptor` for both hydra and p5 renderers (uses `new Function()` for dynamic eval)
  3. `VizDropdown` replaces icon-bar `VizPicker` — grouped by renderer, custom presets marked with star, "+ New Viz" entry
  4. `VizEditor` component with multi-tab Monaco (one model per tab), hydra/p5 syntax highlighting, Ctrl+S save
  5. N-group split layout via zero-dependency `SplitPane` (resizable dividers, min-size clamping)
  6. Tab dragging between groups via HTML5 DnD (drop zones outline accent color)
  7. Four preview modes per group: panel (40% side), inline (150px below), background (canvas behind transparent editor), popout (separate browser window with audio bridge via `usePopoutPreview`)
  8. Hot reload pipeline: code change → 300ms debounce → recompile → re-mount renderer with current audio components
  9. User presets seeded into pattern editor descriptor list at app startup (merged with `DEFAULT_VIZ_DESCRIPTORS`)
  10. Theme tokens applied via `applyTheme()` on container ref (CSS variables resolve correctly when used standalone)
**Files shipped**: `vizPreset.ts`, `vizCompiler.ts`, `VizDropdown.tsx`, `VizEditor.tsx`, `editor/SplitPane.tsx`, `editor/EditorGroup.tsx`, `editor/PopoutPreview.tsx`, `editor/vizEditorTypes.ts`. LiveCodingEditor wired to merge user descriptors.
**Lessons (catalogue updates)**:
  - hetvabhasa: P6 (CSS variables undefined when standalone — must `applyTheme()` on container)
  - hetvabhasa: P7 (preview shows only background when no scheduler — preview code must have a "demo mode" fallback)
  - krama: PK5 (viz hot-reload lifecycle — debounce → compile → destroy → mount)

### Phase 10.2: Workspace Shell Refactor (NEXT — INSERTED 2026-04-08)
**Goal**: Refactor `StrudelEditor`, `LiveCodingEditor`, and `VizEditor` into a uniform single-editor-per-view architecture (markdown-preview model). One workspace shell holds any kind of view; previews are independent views opened via command, not state inside an editor group.
**Depends on**: Phase 10.1
**Why**: The current 3-component split (StrudelEditor / LiveCodingEditor / VizEditor) has duplicated tab/preview logic, can't compose (e.g., "edit pattern A while previewing viz B"), and won't accept a menu bar / file explorer cleanly. The refactor unifies them along the seam VS Code already validates: editors are pure code views, previews are first-class sibling views.
**Success Criteria**:
  1. `EditorView` component — Monaco only, language-aware (strudel, sonicpi, hydra, p5js, markdown). No embedded preview, no audio engine wiring.
  2. `PreviewView` component — file-extension-aware. Renders the right preview for the active file via a `PreviewProviderRegistry`.
  3. `PreviewProvider` registry: `{ extensions, label, render }` entries. Built-in providers: `STRUDEL_RUNTIME`, `SONICPI_RUNTIME`, `HYDRA_VIZ`, `P5_VIZ`, `MARKDOWN_HTML`.
  4. `WorkspaceShell` — generic tab/group/split layout (refactored from current `EditorGroup`/`SplitPane`). Holds any view, not just viz tabs. Tab drag-and-drop works between any views.
  5. `WorkspaceAudioBus` singleton — pattern preview views publish `{ hapStream, analyser, scheduler }` when running; viz preview views consume the latest published bus.
  6. Commands wired: "Open Preview to Side" (Cmd+K V), "Toggle Background Preview" (Cmd+K B), "Open Preview in New Window" (Cmd+K W).
  7. Existing `StrudelEditor` / `LiveCodingEditor` / `VizEditor` exports preserved as thin compositions over the new primitives (backwards compat for embedders).
  8. App page rewired to use `WorkspaceShell` directly. The 3-tab top bar (strudel/sonicpi/viz) goes away — all 4 tabs (`pattern.strudel`, `pattern.sonicpi`, `pianoroll.p5`, `pianoroll.hydra`) live in the same shell.

### Phase 10.3: IDE Shell (INSERTED 2026-04-08)
**Goal**: A real IDE shell on top of the workspace — menu bar, file explorer, command palette, status bar, settings — without forking VS Code or pulling a heavy IDE framework.
**Depends on**: Phase 10.2
**Why not port to VS Code web?**: VS Code's file-centric model fights our live-coding UX (`.viz()` inline zones, audio engine sharing, multi-engine bus). Build vs port trade documented in artifacts/stave/IDE-SHELL-DESIGN.md §1. Decision: build lightweight on Monaco; selectively pull `@codingame/monaco-vscode-api` later only if extension support becomes a need.
**Success Criteria**:
  1. `MenuBar` — File / Edit / View / Run / Preferences / Help. Each opens a dropdown with keyboard shortcuts shown. Menu items dispatch commands through the same registry as the command palette.
  2. `FileExplorer` — left sidebar, tree view of `VirtualFileSystem`. Context menu (rename / duplicate / delete / reveal). Drag files into editor groups to open. Folders can collapse/expand.
  3. `VirtualFileSystem` — generalizes `VizPresetStore` from "presets" to a full IndexedDB-backed FS. Files have `path`, `content`, `language`, `metadata`. Folders are virtual (path prefixes). Supports recent files, rename, delete, import/export.
  4. `CommandPalette` — Cmd+K / Cmd+Shift+P, fuzzy search over a global `CommandRegistry`. All menu actions, file open, viz commands, settings registered as commands.
  5. `StatusBar` — bottom strip. Shows BPM, error count, live mode indicator, active engine, current file's git-like status (clean/dirty), language mode.
  6. `Settings` dialog — themes (dark/light/custom), keybindings, default audio device, default viz config. Persisted to IndexedDB.
  7. `ProjectManifest` — `stave.project.json` describing files in the workspace, default file bindings, project-level settings. Import/export as `.zip`.
  8. File types supported: `*.strudel`, `*.sonicpi`, `*.hydra`, `*.p5`, `*.md`, future: `*.wav`/`*.mp3` (sample preview).
**Out of scope** (deferred to a later phase): real Git integration, multi-workspace, extension API, terminal, debugger.

### Phase PM-1: Local Persistence (COMPLETE 2026-04-12, commits 6a47c03 + b65e98c + 1433fec)
**Goal**: Browser refresh no longer loses work. The WorkspaceFile store is backed by Yjs + y-indexeddb so all file content persists to IndexedDB locally. No accounts, no cloud, no UI changes.
**Depends on**: Phase 10.2
**Success Criteria** (all TRUE, shipped):
  1. ✅ `WorkspaceFile` store public API unchanged (`createWorkspaceFile`, `getFile`, `setContent`, `subscribe`)
  2. ✅ File content survives browser refresh — verified via Playwright probe
  3. ✅ New `seedWorkspaceFile` function for persistence-aware create-or-load
  4. ✅ Y.Text used for content from day one
  5. ✅ 763/763 existing tests still pass
  6. ✅ `initProjectDoc(projectId)` async init with y-indexeddb + `whenSynced` gate
  7. ✅ No UI changes — shell/tabs/layout/previews work identically

### Phase PM-2: Project Lifecycle + Sidebar (COMPLETE 2026-04-12, commit 4f57aa6 + 303f3b5)
**Goal**: Users can create, name, switch between, and delete multiple projects.
**Success Criteria** (all TRUE, shipped):
  1. ✅ `projectRegistry.ts` — IDB metadata store separate from Y.Doc content
  2. ✅ `StaveApp` outer wrapper with ProjectSidebar + StrudelEditorClient
  3. ✅ Switching projects swaps the active Y.Doc atomically (via resetFileStore + switchProject)
  4. ✅ First-run bootstrap auto-creates "Untitled" project
  5. Note: initial UX had project list in sidebar — replaced in PM-2.5 with file tree + project switcher modal

### Phase PM-2.5: VS Code-style UX (COMPLETE 2026-04-13, commits 23f55f0 through 371db18)
**Goal**: Replace project-list sidebar with proper VS Code layout — menu bar, file tree for current project, template picker modal.
**Success Criteria** (all TRUE, shipped):
  1. ✅ MenuBar with File / Edit / View / Help (dropdowns close on click-outside or Escape)
  2. ✅ FileTree: files + folders (folders derived from paths), +/📁 buttons, inline rename, context menu, file-type icons
  3. ✅ TemplateModal: Unreal-style card grid (Starter, Strudel, Sonic Pi, Hydra, Blank)
  4. ✅ ProjectSwitcherModal: project list with rename/delete and last-opened timestamps
  5. ✅ Bidirectional tree↔tab sync (WorkspaceShell forwardRef + onActiveTabChange)
  6. ✅ Drag-drop files into/out of folders (cascade rename for folders)
  7. ✅ Resizable sidebar (drag handle, clamped [160, 600], persisted to localStorage)
  8. ✅ Sidebar height matches editor (588px root = 28 menu + 560 editor)
  9. ✅ First-run seeds Starter template automatically

### Phase PM-3: Within-folder reordering (NEXT)
**Goal**: Users can drag files to reorder them within a folder (not just between folders).
**Needs**: `fileOrder: Y.Map<folderPath, Y.Array<fileId>>` added to the project Y.Doc schema.
**Plans:** 0/TBD

### Phase PM-2: Project Lifecycle + Sidebar
**Goal**: Users can create, name, switch between, and delete multiple projects. A new `StaveApp` wrapper renders a `ProjectSidebar` alongside the existing `WorkspaceShell`.
**Depends on**: PM-1
**Success Criteria** (what must be TRUE):
  1. `ProjectRegistry` manages project metadata in a separate IDB store (fast list at startup)
  2. Create / load / rename / duplicate / delete project operations
  3. `StaveApp` outer component: `ProjectSidebar` + `WorkspaceShell`
  4. Switching projects swaps the active Y.Doc atomically
  5. First-run bootstrap: auto-create "Untitled" project on empty IDB
**Plans:** 0/TBD

### Phase PM-3: Folders + File Tree
**Goal**: Files have full paths (`sketches/main.strudel`), folder structure is derived from paths, sidebar shows a file tree with drag-drop reorder and rename cascades.
**Depends on**: PM-2
**Plans:** 0/TBD

### Phase PM-4: Snapshots (Version History)
**Goal**: Named version snapshots stored as binary Y.Doc state in IDB. Auto-snapshot on 60s idle. Explicit "Save Version" button. History sidebar with preview + restore.
**Depends on**: PM-1
**Plans:** 0/TBD

### Phase PM-5: Share-by-URL + Export .zip
**Goal**: Small projects share via base64-in-URL-fragment. All projects export as .zip with stave.json manifest. Import from .zip creates a new project.
**Depends on**: PM-2
**Plans:** 0/TBD

### Phase PM-6: Templates Registry
**Goal**: Hard-coded templates (blank, strudel-starter, hydra-starter, p5-starter, sonicpi-starter). "New Project" dialog shows template picker. User-created and marketplace templates deferred.
**Depends on**: PM-2
**Plans:** 0/TBD

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
**Plans:** TBD

## Progress

**Execution Order:**
1→2→3→4→5→6→8→9→F→10→10.1→11 (ship staveCoder) → 12-17 (Studio alpha) → 19-20 (multi-view) → 22 (audio input)
Phase 7 can run in parallel with later phases.

| Phase | Plans | Status | Completed |
|-------|-------|--------|-----------|
| 1. Active Highlighting | 2/2 | Complete | 2026-03-21 |
| 2. Pianoroll Visualizers | 3/3 | Complete | 2026-03-22 |
| 3. Audio Visualizers | N/A | Complete | 2026-03-22 |
| 4. VizRenderer Abstraction | 2/2 | Complete | 2026-03-22 |
| 5. Per-Track Data | 1/1 | Complete | 2026-03-22 |
| 6. Inline Zones via Abstraction | 2/2 | Complete | 2026-03-22 |
| 8. Engine Protocol | 3/3 | Complete | 2026-03-25 |
| 9. Normalized Hap Type | 3/3 | Complete | 2026-03-25 |
| **F. Free Monad PatternIR** | **2/2** | **Complete** | **2026-03-28** |
| **10. Monaco Intelligence** | **2/TBD** | **In progress** | - |
| 7. Additional Renderers + Hydra | 0/TBD | Not started | - |
| **10.1 Viz Editor** (INSERTED) | **0/TBD** | **Not started** | - |
| **── staveCoder ships here (v0.1.0 on npm) ──** | | | |
| 11. Library Polish + Publish | 0/TBD | Not started | - |
| **── Stave Studio phases below ──** | | | |
| 12. Synth Invariance | 0/TBD | Not started | - |
| 13. External Sync (Link, MIDI, OSC) | 0/TBD | Not started | - |
| 14. Recording & Export (WAV, stems) | 0/TBD | Not started | - |
| 15. Provenance (session log, signing) | 0/TBD | Not started | - |
| 16. Collaboration (Yjs CRDT, WebRTC) | 0/TBD | Not started | - |
| 17. UI Bento Box (sliders, knobs, MIDI CC) | 0/TBD | Not started | - |
| 18. Composr Integration | 0/TBD | Not started | - |
| 19. Pattern IR pipeline + Bidirectional DAW | — | **In progress** | - |
| &nbsp;&nbsp;19-01. Pattern IR types + backward-compat | 1/1 | Complete | 2026-04-15 |
| &nbsp;&nbsp;19-02. Pass Instrumentation v1 (multi-tab Inspector) | 1/1 | Complete | 2026-05-02 |
| &nbsp;&nbsp;19-03. Tier 4 JS API — first half (jux/off/degrade/late/chunk/ply) | 1/1 | **Complete** (PR #69 merged) | 2026-05-03 |
| &nbsp;&nbsp;19-04. Tier 4 JS API — second half (layer/struct/swing/pick/shuffle/scramble/chop) | 12/12 | **Complete** (PR #73 merged) | 2026-05-04 |
| &nbsp;&nbsp;19-05. `loc` + `userMethod` on every non-Play IR tag (closes Subtlety C from PRE-01) | 13/13 | **Complete** (PR #77 merged) | 2026-05-04 |
| &nbsp;&nbsp;19-06. Inspector — Strudel-vocabulary tree projection + IR-mode toggle (consumes 19-05's `userMethod`) | 6/6 | **Complete** (PR #78 merged) | 2026-05-04 |
| &nbsp;&nbsp;19-07. Parser stage decomposition — RAW / MINI-EXPANDED / CHAIN-APPLIED / FINAL (axis 2 advance per PV29; "Phase C" in §Substrate-Honesty) | 19/19 | **Complete** (PR-A: PR #80 merged; PR-B: ready to PR — `feat/parser-stages-chain`) | 2026-05-05 |
| &nbsp;&nbsp;19-08+. Bidirectional DAW (IRNodeMeta, backward maps, DawVizRenderer, code synthesis) | 0/TBD | Not started | - |
| &nbsp;&nbsp;20-09. Bake-and-scrub (OfflineAudioContext → AudioBufferSourceNode; closes 20-08 preview-only gap) | 0/TBD | Not started | - |
| &nbsp;&nbsp;20-10. Param-method promotion — typed `Param` tag for s/n/note/gain/velocity/color/pan/speed/bank/scale; closes #108 silent-semantics gap; codifies semantics-completeness vyapti pair-of PV37 | TBD | **LOCAL** (γ-4 manual gate pending) | - |
| &nbsp;&nbsp;20-11. Track substrate — `$:` → trackId + palette of 32; closes duplicate-`$:` collapse bug | TBD | **LOCAL** (γ-7 manual gate pending) | - |
| &nbsp;&nbsp;20-12. Track chrome — collapsible rows, no bar labels, opacity=velocity, Y=pitch; depends on 20-11 | 17/17 | **LOCAL** (γ green; manual γ-5 visual gate pending) | 2026-05-10 |
| &nbsp;&nbsp;20-12.1. Pause-resets slot map (INSERTED 2026-05-13; re-frames F-1 from parser bug to D-04 retention UX) | 0/TBD | Not started | - |
| &nbsp;&nbsp;20-13. Structure view (bundled-cycles overview as toggle); speculative, ship-on-demand | 0/TBD | **Deferred** | - |
| &nbsp;&nbsp;20-14. Strudel.cc parity (eval-scope mirror + alias layer + corpus gate); closes #110 | 19/19 | **LOCAL** (stacked PRs #123→#131→#133; closes #110 at γ merge) | 2026-05-15 |
| &nbsp;&nbsp;20-15. Strudel.cc parity hardening (5 Bakery gaps #134–#138 + recursive args #132); depends on 20-14 | 0/TBD | Not started | - |
| 20. Transform Graph (React Flow node patcher, bypass/solo) | 0/TBD | Not started | - |
| 21. Indian Classical (tala circle, bol, tihai) | 0/TBD | Not started | - |
| 22. Audio Analysis (audio→IR, AudioRegion, vocals, closed loop) | 0/TBD | Not started | - |
| 23. Transparent AI (kernel/wavelet Layer 3, attribution) | 0/TBD | Not started | - |
| **── Project Management System phases below ──** | | | |
| PM-1. Local Persistence (Yjs + y-indexeddb) | 1/1 | **Complete** | 2026-04-12 |
| PM-2. Project Lifecycle + Sidebar | 1/1 | **Complete** | 2026-04-12 |
| PM-2.5. VS Code-style UX (MenuBar, FileTree, Templates, Drag-drop, Resize) | 1/1 | **Complete** | 2026-04-13 |
| PM-3. Within-folder reordering (fileOrder in Y.Doc) | 0/TBD | **Next** | - |
| PM-4. Snapshots (Version History) | 0/TBD | Not started | - |
| PM-5. Share-by-URL + Export .zip | 0/TBD | Not started | - |
| PM-6. Templates Registry (user-saved, marketplace) | 0/TBD | Basic version shipped in PM-2.5 | - |
| PM-7. Google OAuth + Cloud Sync (Phase 2) | 0/TBD | Not started | - |
| PM-8. Marketplace + Lemon Squeezy (Phase 2) | 0/TBD | Not started | - |
| PM-9. WebRTC Multiplayer (Phase 3) | 0/TBD | Not started | - |

### Phase 12: --help

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 11
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 12 to break down)
