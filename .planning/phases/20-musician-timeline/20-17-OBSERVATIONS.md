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
