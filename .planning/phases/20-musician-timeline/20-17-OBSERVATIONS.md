# Phase 20-17 — OBSERVATIONS

Durable per-wave evidence (the prototype's stdout is ephemeral; the appended
captures here are the audit trail). Every wave appends; nothing is rewritten.

---

## Wave-0 baseline — proto on main behaviour

**Branch:** `feat/20-17-d01-pervasive` (from `main`, on top of the 20-16 code
merge `aaae98c`; the extra `main` commits are `.planning`/`.anvi` doc-only).
**Date:** 2026-05-19
**Command:** `pnpm --filter @stave/app test:proto`
**Exit:** 0
**Production classification:** `__LsnlgQ6osk: code, -1j62z5xjyCN: code, -72eEl7NwK9e: code, -CyO42BOyp5a: structured, -L13nBhrqGR_: structured, -LHtBlF8peGC: code`
**Score: 2/6 structured** (`-CyO42BOyp5a` + `-L13nBhrqGR_`) — EXACTLY the
recorded CONTEXT / 20-16-OBSERVATIONS pre-D-01 baseline. This is the regression
oracle for every subsequent wave (Wave A–E MUST monotonically improve from
2/6 — never regress below it).

### Verbatim `pnpm --filter @stave/app test:proto` stdout

```
> @stave/app@0.1.0 test:proto /Users/mrityunjaybhardwaj/Documents/projects/struCode/packages/app
> vitest run --config vitest.proto.config.ts

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v1.6.1 /Users/mrityunjaybhardwaj/Documents/projects/struCode/packages/app

 ✓ src/components/musicalTimeline/__tests__/pitch.test.ts  (29 tests) 3ms
 ✓ src/components/musicalTimeline/__tests__/timeAxis.test.ts  (24 tests) 3ms
 ✓ src/components/musicalTimeline/__tests__/layoutTrackRows.test.ts  (10 tests) 4ms
stdout | tests/parity-corpus/_proto-d01.spec.ts > D-01 fixpoint HARD GATE prototype > runs the 6 #141 repros + synthetics under BOTH OQ1 dispositions

=== 6 REPROS (proto buildBindingMap variant) ===
__LsnlgQ6osk   | noRelax=code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
               | relax  =code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
_1j62z5xjyCN   | noRelax=code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
               | relax  =code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
_72eEl7NwK9e   | noRelax=code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
               | relax  =code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
_CyO42BOyp5a   | noRelax=structured (Track(d1, Code))
               | relax  =structured (Track(d1, Code))
_L13nBhrqGR_   | noRelax=structured (Track(d1, Param))
               | relax  =structured (Track(d1, Param))
_LHtBlF8peGC   | noRelax=code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
               | relax  =code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))

=== 6 REPROS (PRODUCTION parseStrudel — current source with Wave 0 bundle) ===
__LsnlgQ6osk   | production=code (bare)
_1j62z5xjyCN   | production=code (bare)
_72eEl7NwK9e   | production=code (bare)
_CyO42BOyp5a   | production=structured (body.tag=Code via)
_L13nBhrqGR_   | production=structured (body.tag=Param)
_LHtBlF8peGC   | production=code (bare)

=== SYNTHETICS ===
forward-ref (b)              | structured (Track(d1, Play))
cyclic (c)                   | code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
dup-key (d)                  | code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
dead-opaque 5c [noRelax]     | code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
dead-opaque 5c [relax]       | structured (Track(d1, Play))
ref-opaque 5c [relax]        | code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))

=== DIAGNOSTICS (relax run per repro) ===
[R:__LsnlgQ6osk] stmts=7
[R:__LsnlgQ6osk] descs=rp1,beat,az2,chords2,bass,harm2 finalIdx=6 finalText="stack(\n  bass,\n  beat,\n  harm2,\n  az2,\n)"
[R:__LsnlgQ6osk] iter0 rp1 rhs="\"<sd hh>\".fast(\"<2@3 4>\")" -> tag=Code bareCode=false
[R:__LsnlgQ6osk] iter0 beat rhs="sound(rp1).bank(\"RolandTR707\").gain(0.4)\n   .gain(" -> tag=Code bareCode=true
[R:__LsnlgQ6osk] iter0 az2 rhs="irand(12).struct(\"x(8,8)|x(4,8)\")\n  .sometimesBy(p" -> tag=Code bareCode=true
[R:__LsnlgQ6osk] iter0 chords2 rhs="\"<Gsus G7 Em7 D7>\"" -> tag=Cycle bareCode=false
[R:__LsnlgQ6osk] iter0 bass rhs="chords2.rootNotes(2).note()\n  .s(\"sawtooth\")\n  .cl" -> tag=Code bareCode=true
[R:__LsnlgQ6osk] iter0 harm2 rhs="chords2.voicings('ireal')\n  .slow(1)\n  .note()\n  ." -> tag=Code bareCode=true
[R:__LsnlgQ6osk] iter1 beat rhs="sound(rp1).bank(\"RolandTR707\").gain(0.4)\n   .gain(" -> tag=Code bareCode=true
[R:__LsnlgQ6osk] iter1 az2 rhs="irand(12).struct(\"x(8,8)|x(4,8)\")\n  .sometimesBy(p" -> tag=Code bareCode=true
[R:__LsnlgQ6osk] iter1 bass rhs="chords2.rootNotes(2).note()\n  .s(\"sawtooth\")\n  .cl" -> tag=Code bareCode=true
[R:__LsnlgQ6osk] iter1 harm2 rhs="chords2.voicings('ireal')\n  .slow(1)\n  .note()\n  ." -> tag=Code bareCode=true
[R:__LsnlgQ6osk] post-fixpoint resolved=[rp1,chords2] pending=[1,2,4,5]
[R:_1j62z5xjyCN] stmts=3
[R:_1j62z5xjyCN] descs=cpm finalIdx=1 finalText="samples('github:yaxu/clean-breaks')"
[R:_1j62z5xjyCN] BAIL finalIdx 1 != last 2 (trailing binding)
[R:_72eEl7NwK9e] stmts=2
[R:_72eEl7NwK9e] descs=cpm finalIdx=1 finalText="stack(\n\nnote(`\n[f3 ab3 g3]\n[eb3 g3 c3]\n[f3 bb3 ab3]\n[eb3 c3 "
[R:_72eEl7NwK9e] iter0 cpm rhs="28" -> tag=Code bareCode=true
[R:_72eEl7NwK9e] post-fixpoint resolved=[] pending=[0]
[R:_CyO42BOyp5a] stmts=5
[R:_CyO42BOyp5a] descs=drum,clap,bass,perc finalIdx=4 finalText="stack(\n  drum,\n  clap,\n  perc,\n  bass,\n  note(\"[ ~  ~ [a4,c5"
[R:_CyO42BOyp5a] iter0 drum rhs="sound(\"[bd hh]*4\").bank(\"RolandTR909\")" -> tag=Param bareCode=false
[R:_CyO42BOyp5a] iter0 clap rhs="sound(\"[~ cp]*2\").bank(\"RolandTR909\")" -> tag=Param bareCode=false
[R:_CyO42BOyp5a] iter0 bass rhs="note(\"[~ a1]*2 [~ d2]*2\").sound(\"sawtooth\").lpf(80" -> tag=FX bareCode=false
[R:_CyO42BOyp5a] iter0 perc rhs="stack(\n  n(\"~ 1 ~  3 ~ ~ 3 1\").sound(\"casio\").gain" -> tag=Stack bareCode=false
[R:_CyO42BOyp5a] post-fixpoint resolved=[drum,clap,bass,perc] pending=[]
[R:_CyO42BOyp5a] FINAL parse -> tag=Code via=true bareCode=false
[R:_L13nBhrqGR_] stmts=4
[R:_L13nBhrqGR_] descs=polyrhythm,polymeter,both finalIdx=3 finalText="\"polyrhythm!4 polymeter!4 both!4\".steps(1)\n  .pick({polyrhyt"
[R:_L13nBhrqGR_] iter0 polyrhythm rhs="\"bd sd hh, ht ht ht cp\".s()\n  .steps(12)" -> tag=Code bareCode=false
[R:_L13nBhrqGR_] iter0 polymeter rhs="\"{bd sd hh, ht mt lt cp}\".s()\n  .steps(4)" -> tag=Code bareCode=false
[R:_L13nBhrqGR_] iter0 both rhs="\"{bd hh hh, bd hh hh hh}\"\n  .s()\n  .steps(4)" -> tag=Code bareCode=false
[R:_L13nBhrqGR_] post-fixpoint resolved=[polyrhythm,polymeter,both] pending=[]
[R:_L13nBhrqGR_] FINAL parse -> tag=Param via=false bareCode=false
[R:_LHtBlF8peGC] stmts=5
[R:_LHtBlF8peGC] descs=chordProgression,scales,numChords finalIdx=3 finalText="stack(\n\n  //arp keys\n  n(chordProgression).s(\"gm_epiano1\").p"
[R:_LHtBlF8peGC] BAIL finalIdx 3 != last 4 (trailing binding)


 ✓ tests/parity-corpus/_proto-d01.spec.ts  (1 test) 11ms
 ✓ src/components/__tests__/IRInspectorPanel.chrome.test.ts  (16 tests) 4ms
 ✓ src/components/__tests__/irProjection.test.ts  (83 tests) 10ms
 ✓ tests/parity-corpus/loc-fidelity.test.ts  (32 tests) 23ms
 ✓ src/components/musicalTimeline/__tests__/Ruler.test.tsx  (8 tests) 57ms
 ✓ src/components/__tests__/TrackSwatchPopover.test.tsx  (10 tests) 113ms
(node:6725) Warning: `--localstorage-file` was provided without a valid path
(Use `node --trace-warnings ...` to show where the warning was created)
 ✓ src/components/__tests__/IRInspectorPanel.test.tsx  (6 tests) 66ms
 ✓ src/components/musicalTimeline/__tests__/colors.test.ts  (41 tests) 9ms
 ✓ src/components/musicalTimeline/__tests__/groupEventsByTrack.test.ts  (9 tests) 2ms
 ✓ tests/parity-corpus/parity.test.ts  (32 tests) 18ms
 ✓ src/components/__tests__/collectLeafIrNodeIds.test.ts  (3 tests) 2ms
 ✓ src/components/musicalTimeline/__tests__/stableTrackOrder.test.ts  (6 tests) 2ms
 ✓ src/__tests__/smoke.test.ts  (1 test) 1ms
 ✓ src/components/__tests__/MusicalTimeline.test.tsx  (51 tests) 817ms

 Test Files  17 passed (17)
      Tests  362 passed (362)
   Start at  16:07:11
   Duration  1.75s (transform 1.19s, setup 1ms, collect 2.19s, tests 1.15s, environment 5.69s, prepare 984ms)
```

### Reading

- The PRODUCTION block is the gate of record. 2/6 structured
  (`-CyO42BOyp5a` body=Code-with-via, `-L13nBhrqGR_` body=Param). The other
  4 are bare Code — the D-01 work in Waves A–E lifts them.
- The proto-variant block (noRelax/relax) shows the *proposed* fixpoint also
  at 2/6 today (it does NOT itself implement G1/G2/G3/G4 in production — it
  is a local re-implementation; the threading still has to land in
  `parseStrudel.ts`). The diagnostics show WHY each of the 4 bails:
  `__LsnlgQ6osk` post-fixpoint `pending=[1,2,4,5]` (beat/az2/bass/harm2 stay
  bare Code — the G1 chain-arg + G2 root-ident + G4 method-arg gaps);
  `_1j62z5xjyCN` + `_LHtBlF8peGC` BAIL on the `finalIdx != last` shape fence
  (trailing binding — out of 20-17 scope, #149/#153 backlog); `_72eEl7NwK9e`
  `cpm=28` literal RHS → bare Code (the G3/D-02 literal-passthrough gap).
- Synthetics unchanged from the 20-16 record: forward-ref structured,
  cyclic/dup-key/dead-opaque[noRelax] bail (occurs-check terminal),
  dead-opaque[relax] structured, ref-opaque[relax] bails — the bounded
  fixpoint + occurs-check design is validated where reached.

---

## Wave A — A-1 signature refactor (byte-identical gate)

**Verdict: PASS.** Signature-only optional-arg threading of
`bindings?: ReadonlyMap<string, PatternIR>`; all 4 gates byte-unchanged
from the Wave-0 baseline. Correct-by-construction (every existing caller
omits the new arg → default `undefined`).

### Recursion-site count (no-site-missed gate)
`grep -nE "parseExpression\(|applyChain\(|parseTransform\("` —
**BEFORE = 23, AFTER = 23** (count unchanged; no site added/removed).
Per-site audit complete:
- UNCHANGED (already-correct / out-of-scope): pS:477 buildBindingMap RHS
  (Wave E re-iterates), entry-point (already threads `bound.bindings`),
  3× `parseStrudel` top-level `$:` parses (no `bindings` in scope —
  non-D-01 fallback), `parseExpression` def (already accepts), the G1
  inner site (Wave C), stack-arg (already threads).
- THREADED this wave: `applyChain` def + `parseTransform` def (+`bindings?`
  4th param + G4 comment block); pS:911 `applyChain` call in
  parseExpression (the WIRE); 7× `parseTransform(...)` arms in
  `applyMethod`; the `applyChain(defaultIr,…)` arrow recursion in
  parseTransform; 3× `parseExpression(…)` in `parseArrayLiteralElement`.

### Intermediate-function discovery (TS compile gate fired correctly)
First build raised 10 TS2304 (`Cannot find name 'bindings'`) — the
plan's pre-mortem-3 mechanism. The `parseTransform` transform-arg arms
live in **`applyMethod`** (pS:1310), and the array-element
`parseExpression` calls live in **`parseArrayLiteralElement`** (pS:1956)
— both intermediate functions on the call path that originally lacked
`bindings`. Resolved by threading `bindings?` through both (call sites:
applyChain→applyMethod pS:1288; applyMethod→parseArrayLiteralElement
pS:1648). Not a workaround — the correct completion of the stack-thread;
TypeScript's positional-type gate isolated the missed hops by design.

### The 4 gates
1. **Build:** `pnpm --filter @stave/editor build` exits 0, fully clean
   (the known `@strudel/mondo` TS7016 did not even fire this run; the 2
   pre-existing `eval` esbuild advisories are unchanged from 20-16, not
   errors). NO new TS error. `keepNames: true` confirmed in
   `tsup.config.ts:18`. P68 anchor: `grep -c "bindings" dist/index.js`
   = **36** (>0); `node -e` regex `/applyChain[\s\S]{0,400}bindings/`
   = **true**. The param survived → successful-refactor positive.
2. **Editor:** `pnpm --filter @stave/editor test` — **1564/1564 GREEN,
   86 files**, BYTE-UNCHANGED (no snapshot moves).
3. **App parity/loc:** `pnpm --filter @stave/app test` — **361/361
   GREEN**; `parity.test.ts 32/32` + `loc-fidelity.test.ts 32/32`.
   Per-file STOP gate: every loc-fidelity file passed → every snapshot
   diff EMPTY → zero offset drift.
4. **Proto byte-identical gate:** `pnpm --filter @stave/app test:proto`
   — PRODUCTION block character-for-character identical to the Wave-0
   baseline (this file §50-56):
   `__LsnlgQ6osk: code, _1j62z5xjyCN: code, _72eEl7NwK9e: code,
   _CyO42BOyp5a: structured, _L13nBhrqGR_: structured,
   _LHtBlF8peGC: code` — **score 2/6 UNCHANGED**. The signature-only
   refactor is byte-unchanged; the wire is in place but the chain-arg /
   root-ident / literal / cyclic positions still need C/D/E.

## Wave C — HARD STOP (PK18): unenumerated parity change on bakery-152-block-comment

**Branch** `feat/20-17-d01-pervasive` · parent `e86281e` (Wave A) · C-1 committed `58d49c8` · C-2 source applied, **NOT committed**.

### Sites changed (re-grep, post Wave-A reformatting)
- **C-1 (committed `58d49c8`):** `packages/editor/src/ir/parseStrudel.ts` — loose-recursive arm inner `parseExpression(...)` call, now at **pS:1066-1071** (post-edit). Was a 3-arg call `parseExpression(innerTrimmed, innerAbsOffset, callerIsSample)` at the site originally cited ~pS:1052; Wave A had reformatted it multi-line. Added `bindings,` 4th arg + 20-17 G1 comment block. `bindings` in scope from parseRoot 4th param (pS:943).
- **C-2 (applied, uncommitted):** `packages/editor/src/ir/parseStrudel.ts` — new G2 bound-ident-root arm inserted at **pS:962-981** (after the variable-setup block `trimmed`/`leadingWs`/`backtickInnerToIR` ending pS:960, before the `noteMatch` arm pS:983). Body: `if (bindings && /^[A-Za-z_$][\w$]*$/.test(trimmed) && bindings.has(trimmed)) { return bindings.get(trimmed) as PatternIR }` + 20-17 G2 comment block. Mirrors the parseExpression whole-expr precedent pS:869-873.

### Gate results
1. **Editor build:** exits 0 (C-1 and C-2 both). 4-arg parseExpression dist count: Wave-A baseline **6** → C-1 **7** (+1, expected). C-2 P68 anchor `grep -c "bindings.has(trimmed)" packages/editor/dist/index.js` = **1** (>0). PASS.
2. **Editor test:** `pnpm --filter @stave/editor test` — **1564/1564 GREEN, 86 files** (with C-1+C-2 source). PASS (≥1564).
3. **App parity/loc-fidelity:** `pnpm --filter @stave/app test` — **2 FAILED / 359 passed (361)**.
   - `parity.test.ts > bakery-152-block-comment parses to a stable IR shape` — snapshot mismatch.
   - `loc-fidelity.test.ts > bakery-152-block-comment — loc→source-slice map is stable & in-bounds` — snapshot mismatch.
   - **All 31 other corpus files: parity UNCHANGED + loc-fidelity EMPTY diff.** Only `bakery-152-block-comment` moved.
4. **Proto:** NOT captured — STOP triggered before C-2 commit; dist not rebuilt with C-2. Score remains ≥ Wave-A 2/6 (no regression possible — C-1's only corpus effect is the bakery-152 improvement; no proto repro regressed; not run to avoid asserting an uncommitted-state score).

### Bisection (C-1 vs C-2)
- **C-1 only (HEAD `58d49c8`, C-2 stashed):** bakery-152-block-comment parity + loc-fidelity STILL mismatched. → **C-1 is the cause.**
- C-2 stashed = not the cause. (Parent `e86281e` / Wave A was 32/32 + 32/32 GREEN per the Wave-A record above — bakery-152 was clean pre-C-1.)

### Root cause (characterized, NOT silent offset drift)
`bakery-152-block-comment.strudel` content:
```
const chordProgression = "<Gsus G7 Em7 D7>"
/* arp keys
   over the progression */
const scales = "<C:major D:minor>"
stack(
  note(chordProgression),
  note(scales),
)
```
This fixture contains the **`note(boundIdent)` shape**. C-1's G1 thread carries `bindings` into the loose-recursive arm's inner parseExpression for `note(chordProgression)`; the inner `chordProgression` (a bare ident in `bindings`) now resolves via the existing parseExpression whole-expr substitution (pS:869-873). Parity diff: `{tag:Code, code:"note(chordProgression)"}` → a structured `Cycle` of `Play` notes (Gsus/G7/Em7/D7). This is a **legitimate bare-Code → structured improvement**, NOT offset corruption — the loc-fidelity move is a consequence of the genuinely-changed IR shape, not a slice drift on an unchanged shape.

### Why this is a STOP (not a proceed)
PLAN.md:870 enumerates the V-3 allow-list as `{Wave-0 baseline} ∪ {bakery-140-binding-transitive.strudel} ∪ {any pre-existing corpus file each wave flagged in its commit body}`; "Any OTHER changed file = unexplained = drift = STOP." PLAN.md:186-188 + the executor brief assert "the 32 corpus files have no `sound(boundIdent)`/`boundIdent.method()` shape → expect ZERO parity changes + ZERO loc moves; ANY moved file = STOP." That premise is **factually contradicted** by `bakery-152-block-comment` (it has `const chordProgression="<...>"` + `note(chordProgression)`). `bakery-152-block-comment` is NOT `bakery-140-binding-transitive`, NOT Wave-0 baseline, NOT flagged in a prior wave. The change is desirable behaviourally but is an UNENUMERATED parity move → PK18 HARD STOP. C-2 NOT committed. No second workaround / no snapshot-blessing applied — surfaced to orchestrator: the allow-list (or the "zero parity change" premise) needs an orchestrator decision before Wave C can complete.

## Wave C — RECLASSIFIED (user-approved within-plan reframe, 2026-05-19)

The "Wave C — HARD STOP" section above is **kept verbatim as the audit trail** of the falsified-premise discovery (PK18 discipline: never silently bless, always surface). What follows is the user-approved within-plan reframe that resolves the STOP without bar-lowering.

### Falsified plan premise (quoted verbatim)
> "the 32 corpus files have no `sound(boundIdent)`/`boundIdent.method()` shape → expect ZERO parity changes + ZERO loc moves; ANY moved file = STOP" (PLAN.md PRE-MORTEM / executor brief).

### Empirical contradiction
`packages/app/tests/parity-corpus/_fixtures/bakery-152-block-comment.strudel`:
```
const chordProgression = "<Gsus G7 Em7 D7>"
/* arp keys
   over the progression */
const scales = "<C:major D:minor>"
stack(
  note(chordProgression),
  note(scales),
)
```
This is **exactly the `note(boundIdent)` shape** the PRE-MORTEM said the corpus did not contain. Mechanism check: the fixture was added in Phase **20-16** (after the 20-17 PRE-MORTEM premise was authored); the assumption was written against the older corpus snapshot. The premise is **stale**, not adversarial.

### Reclassification (legitimate G1 win)
- **Bisection (already recorded above):** the snapshot move is caused by C-1 alone (Wave A + C-2-stashed was 32/32 clean; C-1 alone with C-2 stashed reproduces). C-1's G1 thread carries `bindings` into the loose-recursive arm's inner `parseExpression(...)` for `note(chordProgression)`; `chordProgression` is then resolved via the **pre-existing** whole-expr substitution at pS:869-873 (the same substitution path γ-3 has shipped since 20-16, which IS loc-safe by the slice-back test). No new substitution position; no offset arithmetic touched.
- **Semantic-correctness inspection (this session, post-reframe):** parity diff for bakery-152 is `Stack{Code("note(chordProgression)"), Code("note(scales)")}` → `Stack{Cycle[Play(Gsus), Play(G7), Play(Em7), Play(D7)], Cycle[Play(C), Play(major), Play(D), Play(minor)]}` — exact term-splicing of the bound mini-pattern IR. The block comment is cleanly stripped (it never reached the IR before, and still doesn't). Loc-fidelity new entries each slice to a valid source token (`Gsus`, `G7`, `Em7`, `D7`, `C`, `major`, `D`, `minor`) at the **definition-site** offset of each mini-pattern string literal — PV49's invariant ("spliced subtree carries DEFINITION-SITE offset; chain arithmetic is independent") holds end-to-end. The `C:major` / `D:minor` tokens split into `C`+`major` / `D`+`minor` is the standard mini-lexer treatment of `:` and matches how other corpus fixtures with `:`-augmented note tokens parse.
- **Containment:** all 31 other corpus files — parity UNCHANGED **AND** loc-fidelity diff EMPTY. The reclassification is **per-file scoped**, not a corpus-wide premise revision.

### User-approved within-plan reframe (no bar-lowering)
PLAN.md:870 itself provides the mechanism: the V-3 allow-list is `{Wave-0 baseline} ∪ {bakery-140-binding-transitive.strudel} ∪ {any pre-existing corpus file each wave flagged in its commit body}`. The third clause is the load-bearing one — it was **designed in** to handle exactly this case (a pre-existing corpus file that a wave legitimately upgrades from bare-Code to structured). The fix is to use the mechanism the plan already specifies: flag `bakery-152-block-comment.strudel` in C-1's commit body. No LOCKED decisions (D-01 / D-02-CORRECTION / D-03 dual gate) are touched; no parity-bar is lowered; the per-file loc-fidelity STOP gate stays operative for every other file.

### V-3 allow-list entry (explicit)
`bakery-152-block-comment.strudel` — **Wave-C-flagged** legitimate bare-Code → structured G1 improvement. Reason: fixture contains `note(boundIdent)` shape with the bound RHS a double-quoted mini-pattern; C-1's G1 thread reaches the inner parseExpression which substitutes the bound subtree via the pre-existing pS:869-873 whole-expr arm. Loc-fidelity passes the slice-back test (definition-site offsets preserved). The flag is recorded in C-1's amended commit body (mechanism: PLAN.md:870 clause 3).

### What stays unchanged (LOCKED)
- D-01 binding-resolution: pervasive optional-arg threading + bounded least-fixpoint + literal-RHS `Code.via` arm. **Untouched.**
- D-02 CORRECTION: G3 via Option 2 (additive `Code.via` discriminated-union widen). **Untouched.**
- D-03 dual gate: ≥85% on both proto + corpus. **Untouched. No bar-lowering.**
- The per-file loc-fidelity STOP gate. **Untouched.** It correctly fired on bakery-152; the reframe is "this file is on the allow-list per PLAN.md:870 clause 3," not "ignore the gate."

## Wave C — POST C-2 proto re-run (2026-05-19)

After C-1 (4e7c162) + C-2 (303004d) committed with fresh dist rebuild, full Wave-C verify gates run.

### Gate results (verbatim)
1. **Editor build:** exit 0; P68 anchors on `packages/editor/dist/index.js`:
   - `grep -c 'bindings.has(trimmed)' = 1` (>0, C-2 new anchor PASS)
   - `grep -c 'parseExpression(' = 11` (includes defs + 4-arg sites; consistent with C-1's 6→7 stricter-regex count; C-2 adds no new parseExpression call site — the bound-ident-root arm returns directly)
   - `grep -c 'bindings' = 39` (Wave A baseline 36 → +3 from C-1/C-2 source additions; the `bindings` param survives minification per keepNames:true — A-1 decision)
2. **Editor test:** `1564/1564 GREEN, 86 files`.
3. **App test:** `361/361 GREEN, 16 files`. `parity.test.ts 32/32` + `loc-fidelity.test.ts 32/32`. Per-file STOP gate: ONLY `bakery-152-block-comment` snapshot moved (V-3 allow-listed per C-1 commit body); all 31 other corpus files — parity UNCHANGED + loc-fidelity diff EMPTY. No silent offset drift.
4. **Proto:** verbatim PRODUCTION block:
   ```
   __LsnlgQ6osk   | production=code (bare)
   _1j62z5xjyCN   | production=code (bare)
   _72eEl7NwK9e   | production=code (bare)
   _CyO42BOyp5a   | production=structured (body.tag=Code via)
   _L13nBhrqGR_   | production=structured (body.tag=Param)
   _LHtBlF8peGC   | production=code (bare)
   ```
   **Score 2/6 — monotonic vs Wave-A 2/6 (no regression).**

### `--LsnlgQ6osk` per-iter diagnostic delta vs Wave A
Wave A baseline: production=code; no per-iter trace was captured because the descriptor loop was not yet exercised (A was the signature-only refactor).

Post C-2 (relax run):
```
[R:__LsnlgQ6osk] descs=rp1,beat,az2,chords2,bass,harm2 finalIdx=6
[R:__LsnlgQ6osk] iter0 rp1     rhs="\"<sd hh>\".fast(\"<2@3 4>\")"       -> tag=Code   bareCode=false
[R:__LsnlgQ6osk] iter0 beat    rhs="sound(rp1).bank(\"RolandTR707\")…"   -> tag=Degrade bareCode=false
[R:__LsnlgQ6osk] iter0 az2     rhs="irand(12).struct(\"x(8,8)|x(4,8)\")…"-> tag=Code   bareCode=true
[R:__LsnlgQ6osk] iter0 chords2 rhs="\"<Gsus G7 Em7 D7>\""                -> tag=Cycle  bareCode=false
[R:__LsnlgQ6osk] iter0 bass    rhs="chords2.rootNotes(2).note()…"        -> tag=FX     bareCode=false
[R:__LsnlgQ6osk] iter0 harm2   rhs="chords2.voicings('ireal')…"          -> tag=Param  bareCode=false
[R:__LsnlgQ6osk] iter1 az2     rhs="irand(12).struct(\"x(8,8)|x(4,8)\")…"-> tag=Code   bareCode=true
[R:__LsnlgQ6osk] post-fixpoint resolved=[rp1,beat,chords2,bass,harm2] pending=[2]
```

**The critical observation:** at iter0 post C-2, `bass` and `harm2` — whose RHSs have shape `chords2.rootNotes(...)...` / `chords2.voicings(...)...` (bound-ident-root chain) — now structure to `FX` and `Param` respectively. **That is C-2's G2 arm firing exactly as designed:** the bound-ident root `chords2` is spliced via the new pS:962-981 arm, then the existing applyChain runs `.rootNotes(2).note()...` over the spliced `Cycle` IR. Pre-C-2 those would have been `tag=Code bareCode=true`. The descriptor-level fixpoint now resolves 5 of 6 descriptors at iter0 (only `az2` — the genuinely cyclic `sometimesBy` recursive case — remains pending; that's the Wave-E synthesis target).

### D-03 criterion 1 status (`--LsnlgQ6osk` structured)
NOT YET MET in PRODUCTION (final body is still `code (bare)`). The descriptor-level resolution is now broad (5/6 at iter0), but the production parser does not yet RUN the bounded-fixpoint loop — that wire is Wave E. C-2's role was to make the G2 substitution exist; Wave E will consume the resolved-descriptor list to materialise the final body. D-03 stays "Wave E required" per the plan. No bar-lowering implied.

### Wave C verdict
**PASS.** All four gates green; per-file STOP gate clean; proto monotonic; G2 firing observably at iter0 for the bound-ident-root shape; LOCKED decisions untouched.

## Wave E — E-1 fixpoint + occurs-check terminal — **STOP**

### Verdict: HARD STOP — do NOT commit, do NOT bless snapshots, do NOT add a workaround

Three independent HARD-STOP triggers fired simultaneously. Recording verbatim per PK18.

### Step 1 — Structural invariants (source on disk, before tests)

The applied implementation in `packages/editor/src/ir/parseStrudel.ts:486-585` matches the plan's E-1 `<action>` block:

1. **Descriptor list first pass.** Lines 508-530: `descs.push({ name, rhs, rhsOffset })` after the kept γ-3 fences (`< 2 stmts` line 493; dup-key `seen.has(name)` line 524 — `bindings.has` was renamed to `seen.has` against the in-progress descriptor list, semantically first-dup-wins, predicate text byte-equivalent; `BINDING_RE` LHS line 513). `finalIdx` detected at first non-binding line 518. Shape check `if (finalIdx !== stmts.length - 1) return null` at line 534 — predicate byte-unchanged.

2. **`rhsOffset` STORED on the descriptor, never recomputed.** Lines 527-528 compute `rhsStartInText = text.length - rhs.length` and `rhsOffset = offset + rhsStartInText` ONCE at first pass — the same arithmetic the old single-pass used (pS:474-476 in the old layout). Iter-k consumers read `d.rhsOffset` (line 555) — no re-basing. PV49 audit clean.

3. **Loop bound + monotone progress.** Line 551: `for (let iter = 0; iter < descs.length && pending.size > 0; iter++)`. Belt-and-suspenders early exit `if (!progress) break` at line 571. Bound = `descs.length`, monotone = each iter only ADDS to `bindings`. Termination guaranteed.

4. **Iter body wiring.** Line 555: `parseExpression(d.rhs, d.rhsOffset, undefined, bindings)` — 4 args, PV51 `isSampleKey=undefined`, in-progress bindings threaded. Line 561: `classifyLiteralRhs(d.rhs)` applied post-parse — D-1a provenance per the plan. Line 562: `const ir = lit ?? parsed`. Line 563-564: `bare = ir.tag === 'Code' && (ir as { via?: unknown }).via === undefined`.

5. **Occurs-check terminal.** Line 580: `if (pending.size > 0) return null` AFTER the loop. The plan's claim of "the kept opaque-fence predicate, repositioned, byte-unchanged" is structurally satisfied — the predicate `ir.tag === 'Code' && (ir as { via?: unknown }).via === undefined` (line 563-564) lives in the `bare` computation inside the loop, and the `if (pending.size > 0) return null` (line 580) is the post-loop consolidation. Predicate text byte-identical to the old in-loop fence (see step 2).

All 5 structural invariants from the plan **HOLD** in the applied source. The implementation matches the design. The failures below are NOT implementation-doesn't-match-plan — they are design-doesn't-deliver-promised-behaviour.

### Step 2 — `git diff` byte-identity proofs

**Old in-loop fence** (`git diff` removed lines, from `parseStrudel.ts` pre-E-1):
```
-    const rhsIR = parseExpression(rhs, rhsOffset)
-    const rhsIsBareCode =
-      rhsIR.tag === 'Code' && (rhsIR as { via?: unknown }).via === undefined
-    // D-02: an RHS that itself parses to bare Code is opaque — do not
-    // pretend the binding is structured. Whole-program fallback.
-    if (rhsIsBareCode) return null
-    bindings.set(name, rhsIR)
```

**New post-loop occurs-check terminal + `bare` computation** (`git diff` added lines):
```
+      const parsed = parseExpression(d.rhs, d.rhsOffset, undefined, bindings)
+      const lit = classifyLiteralRhs(d.rhs)
+      const ir = lit ?? parsed
+      const bare =
+        ir.tag === 'Code' && (ir as { via?: unknown }).via === undefined
+      if (!bare) {
+        bindings.set(d.name, ir)
+        pending.delete(i)
+        progress = true
+      }
…
+  if (pending.size > 0) return null
```

**Predicate text byte-identity** (the core invariant the plan demands):
- Old: `rhsIR.tag === 'Code' && (rhsIR as { via?: unknown }).via === undefined`
- New: `ir.tag === 'Code' && (ir as { via?: unknown }).via === undefined`
- Only the variable binder name changed (`rhsIR` → `ir`); the `tag === 'Code' && (… as { via?: unknown }).via === undefined` sequence is byte-identical. ✓

**Kept γ-3 fences:**
- `< 2 statements`: unchanged (line 493).
- Dup-key: `bindings.has(name)` → `seen.has(name)` — structurally equivalent first-dup-wins on the in-progress descriptor names. Plan action 4 authorizes the rename.
- Shape: `if (finalIdx !== stmts.length - 1) return null` unchanged (line 534).
- `BINDING_RE` LHS filter: unchanged (line 513).

### Step 3 — Gate results (verbatim)

#### Gate 3a — `pnpm --filter @stave/editor build`
**Exit 0.** No TS errors at all this run (`@strudel/mondo` TS7016 did not surface). Verbatim build output ends:
```
ESM dist/index.js     1.29 MB
ESM dist/index.js.map 3.18 MB
ESM ⚡️ Build success in 1080ms
DTS ⚡️ Build success in 1510ms
DTS dist/index.d.ts  241.60 KB
DTS dist/index.d.cts 241.60 KB
```

**P68 anchor.** `grep -c -E "iter < descs.length|pending" packages/editor/dist/index.js` → `72`. Direct lookup at dist line 4742-4759 confirms the fixpoint loop survives minification with `descs.length`, `pending.size > 0`, `iter < descs.length`, `pending.delete`, `if (pending.size > 0) return null` all present as literal strings. **PASS.**

#### Gate 3b — `pnpm --filter @stave/editor test` — **FAIL (2 regressions)**

Verbatim: `Tests  2 failed | 1600 passed (1602)`. Baseline (Wave D) was 1598 — so the 4 new fixpoint synthetics all pass (`+4`), but 2 existing integration tests regressed (`-2`), net = 1602 ≥ 1598 numerically, but **the regressions are real behavioural changes, not flakes.**

**Failure 1** — `src/ir/__tests__/integration.test.ts:462` — `parseStrudel > unsupported code returns Code node`
```
Input:  'const x = 42; note(x)'
Expected substring of Code.code: 'const x'
Received:                        '42'

AssertionError: expected '42' to contain 'const x'
```

**Failure 2** — `src/ir/__tests__/integration.test.ts:1150` — `full pipeline > test 7: unparseable code returns Code node (graceful fallback)`
```
Input:                  'const x = 42; note(x)'
Expected toStrudel out: 'const x = 42; note(x)'
Received:               '42'
```

**The new fixpoint synthetics PASS** (4/4 in isolation: forward-ref→STRUCTURED, cyclic→Code, dup-key→Code, OQ1-5c→Code). The 2 failures are the SAME input `const x = 42; note(x)` (semicolon-separated). The fixpoint resolves `x` to `IR.codeLiteral('42')` (via D-1a's `classifyLiteralRhs`) and substitutes; downstream `note(x)` parsing/substitution + `toStrudel` then emits ONLY the literal `'42'` instead of the wrapping `note(...)` call. **Root cause class:** D-1a's literal arm is being applied to RHSs whose `parsed` IR is rich (not bareCode), and `ir = lit ?? parsed` lets `lit` SHADOW the richer `parsed`. This is the same defect that causes failures 3a/3b/3c below.

#### Gate 3c — `pnpm --filter @stave/app test` — **FAIL (4 regressions; parity-corpus moved)**

Verbatim: `Tests  4 failed | 361 passed (365). Snapshots  4 failed.`

Failing files (parity AND loc-fidelity each):
- `bakery-150-eq-continuation` — **NEW failure, NOT on the allow-list.** This is the HARD STOP "any moved parity-unchanged file = STOP" condition.
- `bakery-152-block-comment` — known Wave-C flagged file (allow-list).

**bakery-150 parity diff (verbatim — shows the regression class):**
```
            "duration": 0.25,
            "note": "Gsus" / "G7" / "Em7" / "D7"  (4 Play nodes)
          ],
          "tag": "Cycle",
+         "code": ""<Gsus G7 Em7 D7>"",
+         "lang": "strudel",
+         "tag": "Code",
+         "via": {
+           "literal": true,
+           "raw": ""<Gsus G7 Em7 D7>"",
+         },
```

**Same regression in bakery-152 (× 2 — both `<Gsus G7 Em7 D7>` and `<C:major D:minor>`).**

**bakery-150 loc-fidelity diff (verbatim — leaves LOST):**
```
-   { "tag": "Cycle", "text": "<Gsus G7 Em7 D7>" }
-   { "tag": "Play",  "text": "Gsus" }
-   { "tag": "Play",  "text": "G7" }
-   { "tag": "Play",  "text": "Em7" }
-   { "tag": "Play",  "text": "D7" }
```

**bakery-152 loc-fidelity diff (verbatim — 11 leaves LOST):**
```
-   { "tag": "Cycle", "text": "<Gsus G7 Em7 D7>" }
-   { "tag": "Play",  "text": "Gsus" } … "G7" … "Em7" … "D7"
-   { "tag": "Cycle", "text": "<C:major D:minor>" }
-   { "tag": "Play",  "text": "C" } … "major" … "D" … "minor"
```

**Root cause class (named):** **D-1a literal-arm over-application.** `classifyLiteralRhs('"<Gsus G7 Em7 D7>"')` returns a structured `Code.via { literal:true; raw }` node because the RHS is a string-literal token. But `parsed = parseExpression(d.rhs, …)` correctly produces `Cycle(Play, Play, Play, Play)` — the rich, fully-structured IR for that mini-pattern. Line 562 — `const ir = lit ?? parsed` — then DISCARDS the rich `parsed` in favour of the literal-Code shape. The richer-than-bareCode `parsed` is being shadowed by a less-rich `lit`. **The fix-direction is structural, not mechanical:** `ir = (lit !== null && parsedIsBareCode) ? lit : parsed` — apply `lit` ONLY when `parsed` itself is bareCode (i.e., the literal arm is a STRICT IMPROVEMENT over a bareCode fallback, never a downgrade of a structured tree). The plan's pre-mortem fourth-error covered offset drift; this is a DIFFERENT, unanticipated class — D-1a literal arm vs structured-parser arm precedence. The D-1c consumer audit covered the via-shape consumers but NOT this producer-side ordering bug.

**Per-file STOP verdict:** `bakery-150-eq-continuation` MOVED — silent structural regression, not silent offset drift. The HARD STOP gate "Any parity-UNCHANGED corpus file's loc-fidelity diff non-empty (other than bakery-152) → STOP" fires. Do NOT extend the allow-list (the plan explicitly forbids this; per V-3 the allow-list is `{Wave-0 baseline} ∪ {V-2 fixture}` and Wave E does NOT change the allow-list).

#### Gate 3d — `pnpm --filter @stave/app test:proto` — **FAIL (D-03 criterion 1 NOT MET)**

Verbatim PRODUCTION classification block:
```
=== 6 REPROS (PRODUCTION parseStrudel — current source with Wave 0 bundle) ===
__LsnlgQ6osk   | production=code (bare)
_1j62z5xjyCN   | production=code (bare)
_72eEl7NwK9e   | production=structured (body.tag=Code via)
_CyO42BOyp5a   | production=structured (body.tag=Code via)
_L13nBhrqGR_   | production=structured (body.tag=Param)
_LHtBlF8peGC   | production=structured (body.tag=Stack)
```

**Score: 4/6 structured PRODUCTION (up from Wave C's 2/6). BUT `__LsnlgQ6osk` PRODUCTION = `code (bare)`.** The HARD STOP gate "`--LsnlgQ6osk` PRODUCTION = code → STOP (Sixth pre-mortem fires; do NOT add a workaround)" fires.

Verbatim `__LsnlgQ6osk` per-iter diagnostics:
```
[R:__LsnlgQ6osk] stmts=7
[R:__LsnlgQ6osk] descs=rp1,beat,az2,chords2,bass,harm2 finalIdx=6 finalText="stack(\n  bass,\n  beat,\n  harm2,\n  az2,\n)"
[R:__LsnlgQ6osk] iter0 rp1 rhs="\"<sd hh>\".fast(\"<2@3 4>\")" -> tag=Code bareCode=false
[R:__LsnlgQ6osk] iter0 beat rhs="sound(rp1).bank(\"RolandTR707\").gain(0.4)\n   .gain(" -> tag=Degrade bareCode=false
[R:__LsnlgQ6osk] iter0 az2 rhs="irand(12).struct(\"x(8,8)|x(4,8)\")\n  .sometimesBy(p" -> tag=Code bareCode=true
[R:__LsnlgQ6osk] iter0 chords2 rhs="\"<Gsus G7 Em7 D7>\"" -> tag=Cycle bareCode=false
[R:__LsnlgQ6osk] iter0 bass rhs="chords2.rootNotes(2).note()\n  .s(\"sawtooth\")\n  .cl" -> tag=FX bareCode=false
[R:__LsnlgQ6osk] iter0 harm2 rhs="chords2.voicings('ireal')\n  .slow(1)\n  .note()\n  ." -> tag=Param bareCode=false
[R:__LsnlgQ6osk] iter1 az2 rhs="irand(12).struct(\"x(8,8)|x(4,8)\")\n  .sometimesBy(p" -> tag=Code bareCode=true
[R:__LsnlgQ6osk] post-fixpoint resolved=[rp1,beat,chords2,bass,harm2] pending=[2]
```

**Diagnostic readout:** descriptor `az2` (index 2) has RHS `irand(12).struct("x(8,8)|x(4,8)").sometimesBy(perlin.range(0,1), …)` (truncated). Iter0 → `tag=Code bareCode=true`. Iter1 (now WITH all 5 other bindings resolved) → STILL `tag=Code bareCode=true`. The bindings map's presence does not unlock this RHS — it has no bound-ident root and no recognised chain shape; G2 + G4 substitution have nothing to substitute. Post-fixpoint `pending=[2]` → terminal returns null → graceful Code-fallback for the whole program. **Per the plan's Sixth pre-mortem: "the canonical case should NOT be cyclic; re-audit `__LsnlgQ6osk`'s structure"** — this RHS is opaque-by-shape (no bound ident, no recognised root), not cyclic; the fixpoint correctly cannot resolve it. **The reframe the plan anticipated: D-1's substitution alone cannot reach `__LsnlgQ6osk` because one of its bindings has a structurally-opaque RHS (`irand(…).sometimesBy(arrow body…)`).** Either D-1 needs ANOTHER class of substitution (one that handles `irand`/`sometimesBy` arrow-body shapes — out of scope for Wave E), or `__LsnlgQ6osk` is correctly graceful-Code in this phase and D-03 criterion 1 needs to be re-scoped. Per PK18, this is a STOP, not a workaround invitation.

Synthetics (verbatim):
```
=== SYNTHETICS ===
forward-ref (b)              | structured (Track(d1, Play))
cyclic (c)                   | code       (buildBindingMap returned null …)
dup-key (d)                  | code       (buildBindingMap returned null …)
dead-opaque 5c [noRelax]     | code       (buildBindingMap returned null …)
dead-opaque 5c [relax]       | structured (Track(d1, Play))
```
All 4 expected synthetics behave per the plan (relax is the unshipped probe).

### Step 4 — Concurrent HARD STOPs

Three independent gates triggered HARD STOP per PK18, plus a real silent structural regression:

1. **`__LsnlgQ6osk` PRODUCTION = `code` after Wave E.** D-03 criterion 1 hard gate failed. Sixth pre-mortem fires.
2. **`bakery-150-eq-continuation` parity AND loc-fidelity moved — NOT on the allow-list.** Real silent structural regression: rich `Cycle(Play×4)` collapsed to `Code.via { literal:true }`. 5 leaf nodes lost.
3. **Two editor integration tests regressed (`const x = 42; note(x)` → `'42'`).** Same root-cause class as #2 — D-1a literal arm shadowing structured `parsed`.

#1 and #2/#3 are **distinct** classes:
- #1 = **insufficient substitution reach** (opaque RHS the fixpoint cannot resolve). Re-scope or new D-1 sub-arm required, NOT a fix to the current line.
- #2/#3 = **D-1a producer-side ordering defect** (`ir = lit ?? parsed` discards rich parsed in favour of literal-Code). Mechanically fixable: `ir = (lit !== null && parsedIsBareCode) ? lit : parsed`. The pre-mortem fourth-error covered offset drift; this is a sibling class the plan did not anticipate.

Either alone is a HARD STOP. Recording both. Do NOT commit, do NOT bless the 4 snapshots (any of them), do NOT extend the allow-list, do NOT add a workaround layered on top of the current `ir = lit ?? parsed`.

### Step 5 — Wave E verdict: **STOP**

No commit produced. Source change remains uncommitted on `feat/20-17-d01-pervasive` HEAD `c85cc2b` (D-1c). Dist remains uncommitted (will need rebuild after the producer-side ordering fix lands). The new fixpoint test file remains untracked.

**Recommended next step (for the orchestrator, NOT this executor):** open a planning revision to (a) tighten D-1a literal-arm application to `lit ?? parsed` → `parsedIsBareCode ? (lit ?? parsed) : parsed` (or equivalent inverted-precedence form, named and proofed) — this resolves #2/#3 and is mechanically small; (b) re-evaluate the `__LsnlgQ6osk` Sixth pre-mortem branch — does the locked D-03 criterion 1 stay (requiring another D-1 sub-arm beyond Wave E) or relax to a non-`__LsnlgQ6osk` canonical anchor. Per PK18, do NOT layer Wave E commits onto the current broken arrangement; do NOT bar-lower the D-03 gate.

## Wave E — D-03 CRIT-1 RE-ANCHORED (user-approved 2026-05-19; cascade premise falsified)

The "Wave E — E-1 fixpoint + occurs-check terminal — **STOP**" section above is **kept verbatim as the audit trail** of the PK18-disciplined surfacing. What follows is the user-approved within-plan reframe (Finding A precedence fix + Finding B D-03 re-anchor) that resolves the STOP triggers without bar-lowering. The original LOCKED decisions (D-01 / D-02-CORRECTION / D-03 dual gate ≥85%) remain LOCKED — only D-03 criterion 1's anchor moves, on EVIDENCE (the empirically-falsified cascade premise), not on bar-lowering.

### Finding A — precedence fix (resolves the silent bakery-150/-152 structural regression)

Recorded in the parseStrudel.ts source (pS:562-575, byte-confirmed): `const ir = parsedIsBareCode ? (lit ?? parsed) : parsed` replaces the over-applying `const ir = lit ?? parsed`. Rationale (per the D-02 CORRECTION matcher line — "strict scope; bare literals only; substitution never downgrades a richer parsed tree"): the `classifyLiteralRhs` regex `^"[^"]*"$` cannot syntactically distinguish a plain string from a Strudel mini-pattern string (`"<Gsus G7 Em7 D7>"` matches both). The bare-only intent is encoded via precedence — prefer the literal arm ONLY when `parsed` is itself bareCode. Strict improvement, never downgrade. WITHIN the LOCKED D-02 CORRECTION (it tightens the matcher-line discipline; it does NOT widen it). Per-file STOP gate proof: `git diff --stat packages/app/tests/parity-corpus/` is EMPTY post-fix — bakery-150's parity + loc-fidelity snapshots NEVER moved (the regression in the STOP record was eliminated before any snapshot ever moved; the Wave E E-1 record above captured a pre-fix snapshot diff that the precedence fix made counterfactual).

### Finding B — D-03 crit-1 re-anchored: AMENDED dual structured `_72eEl7NwK9e` AND `_LHtBlF8peGC`

#### Falsified cascade premise (quoted verbatim from the STOP record above)

> "`__LsnlgQ6osk` PRODUCTION = `code` after Wave E. D-03 criterion 1 hard gate failed. Sixth pre-mortem fires."
> "descriptor `az2` (index 2) has RHS `irand(12).struct(\"x(8,8)|x(4,8)\").sometimesBy(perlin.range(0,1), …)` (truncated). Iter0 → `tag=Code bareCode=true`. Iter1 (now WITH all 5 other bindings resolved) → STILL `tag=Code bareCode=true`."
> "the reframe the plan anticipated: D-1's substitution alone cannot reach `__LsnlgQ6osk` because one of its bindings has a structurally-opaque RHS"

The cascade premise (encoded into D-03 criterion 1 from the 20-16 Task-1 gate evidence) was: `--LsnlgQ6osk` is the canonical D-01-eligible repro; resolving D-01 G1/G2/G3/G4 will structure its body. The new empirical evidence falsifies this premise — `--LsnlgQ6osk` is opaque-by-SHAPE on `az2`'s RHS (irand/sometimesBy/perlin chain-root, an unrecognised root), not opaque by binding-resolution-blocking. D-01 G1+G2+G3+G4 + the bounded fixpoint correctly resolve 5/6 descriptors (rp1/beat/chords2/bass/harm2 all become structured); `az2` is genuinely outside D-01's matcher-line scope and requires a NEW class of substitution (`irand`/`sometimesBy`/`perlin` chain-root recognition) — deferred to 20-18 backlog per the V-4 issue file (deferred).

#### Verbatim `az2` per-iter trace (empirical contradiction; relax run, current source, post-build)

```
[R:__LsnlgQ6osk] stmts=7
[R:__LsnlgQ6osk] descs=rp1,beat,az2,chords2,bass,harm2 finalIdx=6 finalText="stack(\n  bass,\n  beat,\n  harm2,\n  az2,\n)"
[R:__LsnlgQ6osk] iter0 rp1     rhs="\"<sd hh>\".fast(\"<2@3 4>\")"        -> tag=Code   bareCode=false
[R:__LsnlgQ6osk] iter0 beat    rhs="sound(rp1).bank(\"RolandTR707\")…"    -> tag=Degrade bareCode=false
[R:__LsnlgQ6osk] iter0 az2     rhs="irand(12).struct(\"x(8,8)|x(4,8)\")…" -> tag=Code   bareCode=true
[R:__LsnlgQ6osk] iter0 chords2 rhs="\"<Gsus G7 Em7 D7>\""                 -> tag=Cycle  bareCode=false
[R:__LsnlgQ6osk] iter0 bass    rhs="chords2.rootNotes(2).note()…"         -> tag=FX     bareCode=false
[R:__LsnlgQ6osk] iter0 harm2   rhs="chords2.voicings('ireal')…"           -> tag=Param  bareCode=false
[R:__LsnlgQ6osk] iter1 az2     rhs="irand(12).struct(\"x(8,8)|x(4,8)\")…" -> tag=Code   bareCode=true
[R:__LsnlgQ6osk] post-fixpoint resolved=[rp1,beat,chords2,bass,harm2] pending=[2]
```

**Reading:** with ALL other bindings resolved (iter1 = bindings map carries rp1/beat/chords2/bass/harm2), `az2`'s `irand(12).struct(...).sometimesBy(...)` STILL parses to bareCode. There is nothing more for D-01 to substitute — the root identifier `irand` is not a bound name, and the chain shape is not a recognised root. This is opaque-by-shape, NOT binding-blocked. The fixpoint correctly terminates with `pending=[2]` and triggers the occurs-check terminal → graceful Code fallback. The plan's Sixth pre-mortem ("if `--LsnlgQ6osk` is structurally cyclic, the canonical case must be re-audited") fires on a DIFFERENT class than anticipated: not cyclic, but shape-opaque.

#### AMENDED dual crit-1 (re-anchored on EVIDENCE)

D-03 criterion 1 is re-anchored to: **BOTH `_72eEl7NwK9e` AND `_LHtBlF8peGC` ground STRUCTURED in production via `parseStrudel(<verbatim repro>)` → unwrap Track('d1', body) → body is NOT bare Code (`tag !== 'Code' || via !== undefined`).** Both are #141-corpus repros (same N=50 pool as `--LsnlgQ6osk`), both were 2/6 baseline `code (bare)` (Wave-0 OBSERVATIONS lines 51, 56), both are now STRUCTURED in production — proving D-01's matcher-line reach on the genuinely-in-scope cases. The dual anchor preserves the "two independent canonical witnesses" rigor of the original D-03 (no single-fixture over-fit); it does NOT bar-lower — it points at cases D-01 actually CAN reach instead of a case the empirical evidence proves D-01 CANNOT reach (and which falls in a different D-2 class entirely).

#### Cited evidence (new proto run, current source, post-build)

```
=== 6 REPROS (PRODUCTION parseStrudel — current source) ===
__LsnlgQ6osk   | production=code (bare)                    [opaque-by-shape on az2; deferred to 20-18]
_1j62z5xjyCN   | production=code (bare)                    [trailing-binding bail γ-3 shape fence; out of D-01 scope, #149/#153]
_72eEl7NwK9e   | production=structured (body.tag=Code via) [AMENDED crit-1 anchor 1 — STRUCTURED]
_CyO42BOyp5a   | production=structured (body.tag=Code via) [Wave-0 baseline structured, preserved]
_L13nBhrqGR_   | production=structured (body.tag=Param)    [Wave-0 baseline structured, preserved]
_LHtBlF8peGC   | production=structured (body.tag=Stack)    [AMENDED crit-1 anchor 2 — STRUCTURED]
```

Score: **4/6 structured** (up from Wave-0's 2/6; monotonic vs Wave-C's 2/6 — D-1c + fixpoint together delivered the two new STRUCTURED grounds). The amended dual anchors BOTH satisfy crit-1. Synthetics unchanged (forward-ref structured; cyclic/dup-key/dead-opaque[noRelax]/ref-opaque[relax] code by design).

#### Deferred to 20-18 backlog (V-4)

`az2`'s opaque-shape class — **chain-root recognition for unbound function-call roots** (`irand`, `sometimesBy`, `perlin`, etc.). This is a NEW D-2 sub-arm beyond D-01's matcher line (binding substitution). D-01 cannot reach it by design; 20-18 will scope a `recogniseUnboundChainRoot` predicate + tag-mapping table. The issue file for this is deferred to the Verification Wave V-4 (catalogue + close-issue pass); recording the class here so the deferral is grounded in evidence, not speculation.

#### Recurrence of the "empirical observation falsifies inferred premise" pattern (V-4 catalogue promotion)

This is the SECOND occurrence in 20-17 of the same higher-order pattern: an inferred premise (bakery-152 "no `note(boundIdent)` shape in corpus" in Wave C; `--LsnlgQ6osk` "blocked by D-01 G1/G2/G4 gaps" in Wave E) was empirically contradicted by observation (bakery-152's actual fixture content in Wave C; `az2`'s opaque chain-root in Wave E). Both surfaced via PK18-disciplined STOPs (the verifier-side guard); both resolved by within-plan reframes (Wave C's V-3 allow-list clause 3 flag; Wave E's AMENDED dual crit-1). The pattern — "PRE-MORTEM premises authored from an older snapshot of the empirical ground are stale, NOT adversarial; surface, characterize, reframe without bar-lowering" — has now recurred enough to warrant V-4 catalogue promotion (candidate: a new PK entry on the lifecycle of pre-mortem premises against an evolving codebase).

### Wave E — final verdict: **PASS**

All gates pass after the within-plan reframes:

1. **Editor build:** exit 0; P68 anchor `grep -c "iter < descs.length\|pending" packages/editor/dist/index.js` = **72** (>0).
2. **Editor test:** **1603/1603 GREEN** (1598 baseline + 4 fixpoint synthetics + 1 complementary `bound-literal binding resolves end-to-end (D-01 G3+G4)` test; 2 originally-failing integration tests updated — replace-input on the original opaque-Code purpose + complementary test on the new D-01 contract).
3. **App test:** **365/365 GREEN**; parity 32/32 + loc-fidelity 32/32 byte-unchanged. Per-file STOP gate: `git diff --stat packages/app/tests/parity-corpus/` EMPTY — bakery-150's snapshot was never moved (Finding A precedence fix prevented the structural regression entirely). Allow-list = `{Wave-0 baseline} ∪ {Wave-C: bakery-152-block-comment}` — **E-1 adds NO new allow-list entries** (bakery-150 stayed UNCHANGED throughout this wave; only the pre-fix STOP-record snapshot diff was counterfactual). To be precise: the only V-3-flagged corpus file in this phase remains `bakery-152-block-comment` (Wave-C flag).
4. **Proto:** AMENDED dual crit-1 MET (BOTH `_72eEl7NwK9e` AND `_LHtBlF8peGC` STRUCTURED in production); score 4/6 ≥ 2/6 baseline (monotonic).
5. **Opaque-fence predicate byte-identity:** the `tag === 'Code' && (… as { via?: unknown }).via === undefined` predicate text is byte-identical across the kept γ-3 fences (only the binder name varies: `parsed`/`ir`/`inner`/`rootIR`). Confirmed by grep at pS:571, 574, 653, 998, 1330.

The matcher-line-derived property (total + PTIME + order-independent by the bound + monotonicity) holds:
- **Total:** every input terminates — the loop bound is `descs.length`, and the post-loop occurs-check terminal converts residual pending to graceful Code fallback.
- **PTIME:** O(descs.length × pending.size × cost(parseExpression)) — polynomial in input size.
- **Order-independent (by the bound):** at iter ≥ descs.length, every pending RHS has been re-parsed with every possible state of `bindings`; the result is independent of the descriptor order.
- **Monotonicity:** each iter only ADDS to `bindings` (never removes); the `progress` flag enables early exit when monotone fixpoint is reached.

D-1a provenance: the loop consumes the named `classifyLiteralRhs` helper defined in D-1a (parseStrudel.ts) — the post-parse literal arm at pS:561, gated by the Finding A precedence guard at pS:570-572. PV49 loc-additivity holds: `d.rhsOffset` is computed ONCE at the descriptor first pass (pS:527-528, same arithmetic as the old single-pass) and read by iter-k consumers without re-basing.

