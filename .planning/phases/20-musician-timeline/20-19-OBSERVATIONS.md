---
phase: 20-19
title: buildBindingMap shape-fence relaxation — Wave-by-wave observations
created: 2026-05-20T18:30:00Z
branch: feat/20-19-shape-fence
base_main_sha: 2f27485 (20-18 merge — confirmed in ancestry)
working_main_sha: 00335d2 (planning-doc-only: 5fbafe1 handoff + b5fb170 CONTEXT + 00335d2 RESEARCH+PLAN+CHECK; no production-src commits since 2f27485 — pS: anchors stable)
---

# Phase 20-19 — Observations (Lokayata record; executor verbatim)

## Wave 0 — Re-grep + baselines + #3 RE-CONFIRMATION + backlog classification + curated-set FREEZE

### Branch + ancestry

```
$ git rev-parse --abbrev-ref HEAD
feat/20-19-shape-fence

$ git rev-parse main
00335d2baf4e8592bb94ea3bdf52a1e362209f47

$ git merge-base feat/20-19-shape-fence 2f27485
2f27485fb4a365e1239d87bfbb2313559e8f855b
```

Verdict: branch `feat/20-19-shape-fence` is descended from `00335d2`, which
contains `2f27485` (the 20-18 merge) in ancestry. The three commits between
`2f27485` and `00335d2` are planning-doc-only:

- `5fbafe1` — `:memo: docs(handoff): NEW_SESSION_PROMPT → discuss → plan → execute Phase 20-19`
- `b5fb170` — `:memo: docs(20-19): CONTEXT.md` (Phase 20-19 D-01..D-04 LOCKED)
- `00335d2` — `:memo: docs(20-19): RESEARCH.md + PLAN.md + PLAN-CHECK.md`

No production-src commit on `main` since `2f27485`. The Plan's `pS:` anchors
are stable — no re-grep drift expected. Wave-0 action 2 re-grep verifies.

### Re-grep of live anchors in `packages/editor/src/ir/parseStrudel.ts`

```
$ grep -n "splitTopLevelStatements(\|^const BINDING_RE\|^function buildBindingMap\|finalIdx !== stmts.length - 1\|buildBindingMap(stripped" packages/editor/src/ir/parseStrudel.ts
364:function splitTopLevelStatements(
484:const BINDING_RE = /^(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]+)$/
486:function buildBindingMap(
492:  const stmts = splitTopLevelStatements(body, baseOffset)
534:  if (finalIdx !== stmts.length - 1) return null
660:      const bound = buildBindingMap(stripped.body, stripped.offset)

$ grep -n "PRELUDE_CALL_RE\|GUARDED_BOOT_RE" packages/editor/src/ir/parseStrudel.ts
195:  const PRELUDE_CALL_RE =
228:  const GUARDED_BOOT_RE =
```

Verdict: **every live anchor matches the PLAN's `pS:` citations byte-for-byte.**
No drift. PLAN's wave-A surgery sites valid.

### Locked-STOP marker — `_waveC-grounding.spec.ts:155`

```
$ grep -n "PK18 STOP locked\|expect(struct3" packages/app/tests/parity-corpus/_waveC-grounding.spec.ts
84:  it('records #7 grounded flip + #3 PK18-STOP classification (whole-program shape gap, not chord-arm)', () => {
155:    expect(struct3, '#3 PK18 STOP locked — whole-program still bare due to buildBindingMap shape gap; remove this assertion when the backlog fix lands').toBe(false)
```

Verdict: locked-STOP at line 155 with `.toBe(false)` — matches PLAN line 120
verbatim. Companion positive controls at lines 140-143 unchanged.

### Baselines (pre-fix; on branch HEAD `00335d2`)

**Editor:**

```
$ pnpm --filter @stave/editor test
 Test Files  91 passed (91)
      Tests  1627 passed (1627)
   Duration  3.64s
```

Editor 1627/1627 ✓

**App:**

```
$ pnpm --filter @stave/app test
 Test Files  18 passed (18)
      Tests  387 passed (387)
   Duration  1.44s
```

Includes: `tests/parity-corpus/parity.test.ts  (36 tests)` +
`tests/parity-corpus/loc-fidelity.test.ts  (36 tests)` + rest of app suite.
App 387/387 ✓ (parity-corpus 36 + loc-fidelity 36 + other 315).

**Proto (`--LsnlgQ6osk` post-fixpoint trace):**

```
$ pnpm --filter @stave/app test:proto
 Test Files  19 passed (19)
      Tests  389 passed (389)

[R:__LsnlgQ6osk] post-fixpoint resolved=[rp1,beat,az2,chords2,bass,harm2] pending=[]
[R:__LsnlgQ6osk] FINAL parse -> tag=Stack via=false bareCode=false
```

Proto post-fixpoint = 20-18 PASS state (resolved=[rp1,beat,az2,chords2,bass,harm2] pending=[]) ✓

### Wave 0 — #3 pre-fix RE-CONFIRMATION on `feat/20-19-shape-fence` from `2f27485`

```
$ cd packages/app && pnpm exec vitest run --config vitest.waveC.config.ts
 ✓ tests/parity-corpus/_waveC-grounding.spec.ts  (1 test) 6ms

stdout | tests/parity-corpus/_waveC-grounding.spec.ts > 20-18 Wave C-1 grounded chord/arrange modelling (maintainer-only) > records #7 grounded flip + #3 PK18-STOP classification

=== Wave C-1 grounded chord/arrange modelling — production parseStrudel ===
--- #7 -KLGNJUtyyj1 (arrange final expr) — GROUNDED PASS expected ---
whole-program tag=Track    structured=true
deep-walk Builder/arrange = HIT
  hit.kind=arrange  args="
  [48, stack(
    richter_chords.euclidRot(3,8,"<0 1 6 0 1 …"
  body present? NO (correct — args-RAW-only per Ground Truth §5)
--- #3 -6c1hEXe8Agi (chord-rooted bindings + trailing side-effect) — PK18 STOP recorded ---
whole-program tag=Track    structured=false
deep-walk Builder/chord  = MISS
CLASSIFICATION: whole-program-shape blocker (NOT chain-root) →
  buildBindingMap rejects `bindings*, all(...), finalExpr` shape
  (finalIdx !== stmts.length-1 → returns null → bareCode fallback).
  The chord arm itself WORKS — verified by _waveC-diagnose.spec.ts
  ("proves chord works" probe): stripped-#3 → Track/body.tag=Pick,
  deep Builder/chord HIT, args="\"Am Am\"".
  Disposition: PK18 STOP per plan pre-mortem 2 (PLAN:380).
  Backlog: file issue for buildBindingMap shape-tolerance gap.

 Test Files  19 passed (19)
      Tests  388 passed (388)
```

Verdict: **#3 pre-fix RE-CONFIRMED.** `whole-program tag=Track structured=false`,
`Builder/chord = MISS`. Locked-STOP at line 155 PASSES with `.toBe(false)`.
Wave-A FLIP signal will be: this line BREAKS with `AssertionError: expected
true to be false` after `stripSideEffectStatements` filters out
`all(x=>x.punchcard())`. Companion lines 140-143 (`#7 must flip whole-program
STRUCTURED`) stay GREEN.

### Wave 0 — backlog classification probe ({#156, #159, #149, #147, #153})

Probe executed via `tests/parity-corpus/_wave0-classify.spec.ts` +
`vitest.wave0classify.config.ts`. The `parseStrudel` whole-program tag /
structured-ness is the load-bearing signal; the secondary heuristics
(sideEffectIdx, bindingCount, …) are coarse stmt-segmentation approximations
(D-03 disposition is by `parseStrudel` direct observation).

```
=== Phase 20-19 Wave-0 classification probe ===
hash | issue | first | wpTag | structured | sideEffIdx | binds | finalBind | exprs | CLASS
-HyFCSbuSlq5 | #156 | "// ".room(.099)" @by mot4i x osc()_peterson x hpunq" | Track | true | -1 | 0 | false | 0 | G
-G2drHRNFueu | #159 | "sound ("hh hh hh hh")"                              | Track | false | -1 | 0 | false | 2 | B
-72eEl7NwK9e | #149 | "//"Outrun June 25" @by shadesDrawn"                 | Track | false | -1 | 0 | false | 0 | G
-1j62z5xjyCN | #147 | "//"Riding the 46 Cycles" @by shadesDrawn ..."       | Track | false | -1 | 0 | false | 0 | G
-G2drHRNFueu | #153 | "sound ("hh hh hh hh")"                              | Track | false | -1 | 0 | false | 2 | B
-6c1hEXe8Agi | #158 | "//@title 409"                                       | Track | false | -1 | 0 | false | 0 | G
=== end probe ===
```

### Wave-0 dispositions (by direct observation; D-03 strict)

| Issue | Hash | wpTag | Structured | Class (observed) | Disposition |
|---|---|---|---|---|---|
| #156 | `-HyFCSbuSlq5` | Track | **TRUE** | already-structured (Hydra in line-1 comment; rest is plain Strudel) | **NOT a fallback** — already passes baseline. Stays backlog as already-handled. No 20-19 action. |
| #159 | `-G2drHRNFueu` | Track | false | **B/D** (multi-top-level + tokenizer-whitespace `sound ("...")` ) | **stays backlog** — tokenizer-whitespace fence is upstream of `buildBindingMap`; multi-top-level is a separate class. NOT shape-fence. |
| #149 | `-72eEl7NwK9e` | Track | false | **F** (chain-arg binding-ref outside stack — `var cpm = 28; stack(...).cpm(cpm)`) | **stays backlog** — chain-arg ref via `.cpm(cpm)` is a SEPARATE class (chain-root recognition of binding inside a chain-method arg). NOT shape-fence. |
| #147 | `-1j62z5xjyCN` | Track | false | **F + SHAPE-FENCE-COUPLED** (`var cpm = 30; samples('github:...'); stack(...).cpm(cpm)` — both #158-class side-effect AND #149-class chain-arg) | **stays backlog** — even if 20-19's filter removes `samples(...)`, the `.cpm(cpm)` chain-arg still needs #149's fix to reach STRUCTURED. Filter alone insufficient. D-03 strict — not in-scope for 20-19. |
| #153 | `-G2drHRNFueu` | Track | false | **B** (multi-top-level — same hash as #159) | **stays backlog** — duplicate of #159 at the hash level (`-G2drHRNFueu` is BOTH #159's exemplar AND #153's). |
| #158 | `-6c1hEXe8Agi` | Track | false | **A** (SHAPE-FENCE — `bindings*, all(...), finalExpr`) | **IN-SCOPE — target.** Wave A will flip this to STRUCTURED. |

**No backlog row is purely Class A (shape-fence alone).** #147 is the closest
adjacent (it is shape-fence-coupled with #149's chain-arg pattern), but the
chain-arg pattern is a separate phase. The Wave 0 disposition is therefore:

- **In-scope:** #158 only (the target).
- **Bonus closes:** none expected from this phase (no Class-A backlog row).
- **Stays backlog:** {#156 not-a-fallback, #159, #149, #147, #153}.

No re-pose to user required: every observed class matches the
pre-classification in RESEARCH §R-2.

### FROZEN curated-set membership (Wave 0 lock — D-01)

R-1 audited 10 tokens; observation of #158 and #147 needs:

- `#158 -6c1hEXe8Agi` → `all(x=>x.punchcard())` → needs `all` in the set.
- `#147 -1j62z5xjyCN` → `samples('github:yaxu/clean-breaks')` → needs `samples` in the set (even though #147 stays backlog, its side-effect stmt is part of the shape-fence class; future re-classification post-#149 would have the filter already covering it).

The full FROZEN set (locked here, matches R-1 verbatim):

```
all, samples, setcps, setCps, setcpm, setCpm, useRNG,
setVoicingRange, initAudio, aliasBank
```

No Wave-0 row needs a token OUTSIDE this set. `each` (RESEARCH §2.1 adjacent
class) is NOT triggered by any observed backlog row — stays out per D-03
strict + R-1 conservative lock. `hush`, `cpm` excluded per RESEARCH §2.3.

### Expected V-3 allow-list (pre-allocated Wave 0)

The parity-CHANGED set across all 5 phase commits is expected to be:

- **11 new fixtures** (Wave C): `bakery-158-{all,samples,setcps,setCps,setcpm,setCpm,useRNG,setVoicingRange,initAudio,aliasBank}-shape-fence.strudel` + `bakery-158-NEGATIVE-no-sideeffect.strudel`.
- **0 Class-A backlog rows** (no bonus closes; per disposition table above).
- **0 #3-corresponding corpus file** (`-6c1hEXe8Agi` is a Bakery sample hash, not an existing `*.strudel` corpus file; 20-18 V-3 confirmed it was NOT in the moving set).

**Cross-wave V-3 STOP gate:** every parity-UNCHANGED file's loc-fidelity diff
EMPTY; parity-CHANGED set ⊆ the 11-fixture allow-list. Any other moved file =
silent drift = STOP.

### Wave 0 — done

Branch `feat/20-19-shape-fence` from `00335d2` (ancestor `2f27485`); baselines
RE-OBSERVED (editor 1627/1627, app 387/387, proto 20-18 PASS); #3 pre-fix
`structured=false / Builder/chord = MISS` RE-CONFIRMED on real branch HEAD;
backlog classification table written VERBATIM (no Class-A bonus closes; one
A+F-coupled row #147 stays backlog per D-03 strict); FROZEN curated-set
membership locked (matches R-1's 10 tokens; no extension required); V-3
allow-list pre-allocated (11 new Wave-C fixtures + 0 backlog + 0 #3-corpus).
NO production src changed.

---

## Wave A — `stripSideEffectStatements` helper landed; locked-STOP BREAKS LOUDLY

### Anchor re-grep (live; pre-edit)

```
$ grep -n "splitTopLevelStatements(\|^const BINDING_RE\|^function buildBindingMap\|finalIdx !== stmts.length - 1\|buildBindingMap(stripped" packages/editor/src/ir/parseStrudel.ts
364:function splitTopLevelStatements(
484:const BINDING_RE = /^(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]+)$/
486:function buildBindingMap(
492:  const stmts = splitTopLevelStatements(body, baseOffset)
534:  if (finalIdx !== stmts.length - 1) return null
660:      const bound = buildBindingMap(stripped.body, stripped.offset)
```

No drift from Wave 0. Surgery sites valid.

### Surgery shape (D-02 — additive-only)

**Deviation from PLAN action 3 placement (recorded for transparency):**
PLAN action 3 says place the regex+provenance block "immediately AFTER the
`GUARDED_BOOT_RE` block (current `pS:228-229`)" — but that location is INSIDE
`stripParserPrelude`'s function body (`PRELUDE_CALL_RE` and `GUARDED_BOOT_RE`
are local consts inside that function). The new `stripSideEffectStatements`
helper (PLAN action 4) is MODULE-scoped (called from `buildBindingMap`), and
must see `SIDE_EFFECT_CALL_RE` at module scope. **Resolution:** I placed BOTH
the regex+provenance block AND the helper at module scope, between the close
of `splitTopLevelStatements` (line 481-482) and `BINDING_RE` (line 484). The
provenance block notes this scope-placement structural choice explicitly. The
WIRE at the preamble is unchanged: PLAN action 5's one-line edit at `pS:492`
remains.

Diff stats:

```
$ git diff --stat packages/editor/src/ir/parseStrudel.ts
 packages/editor/src/ir/parseStrudel.ts | 65 ++++++++++++++++++++++++++-
 1 file changed, 64 insertions(+), 1 deletion(-)
```

**One deletion** = the original `const stmts = splitTopLevelStatements(body, baseOffset)` line. **Replacement** = three lines: `const stmts = stripSideEffectStatements(\n    splitTopLevelStatements(body, baseOffset),\n  )`. **64 insertions** = regex + provenance block + helper function + the wire-replacement lines. Zero edits to `splitTopLevelStatements`, `buildBindingMap`'s loop / fixpoint / occurs-check / shape guard at line 534, callsite at line 660, `PRELUDE_CALL_RE`, `GUARDED_BOOT_RE`, or any 20-18 chain-root code.

### P68 build hygiene — one-shot build + 4 literal-token greps

```
$ pnpm --filter @stave/editor build
…
ESM ⚡️ Build success in 947ms
CJS ⚡️ Build success in 947ms
DTS ⚡️ Build success in 1433ms
```

Build clean. Known `@strudel/mondo` TS7016 did NOT fire this run (already
fixed in 20-15 #145). The `eval` warnings at `dist/index.js:1007:40` and
`:1030:42` are pre-existing (not from 20-19).

```
$ grep -c stripSideEffectStatements packages/editor/dist/index.js  -> 3
$ grep -c useRNG               packages/editor/dist/index.js       -> 2
$ grep -c setVoicingRange      packages/editor/dist/index.js       -> 2
$ grep -c aliasBank            packages/editor/dist/index.js       -> 5
```

All 4 minification-stable anchors `> 0`. ✓

### Wave-A throwaway probe (strict-widen + false-positive + #3 round-trip)

Probe spec at `packages/app/tests/parity-corpus/_waveA-strip-probe.spec.ts`
(throwaway; deleted after this record), executed via
`vitest.waveAprobe.config.ts`. VERBATIM stdout:

```
(i) strict-widen: 8/8 curated stmts matched by SIDE_EFFECT_CALL_RE

(ii) false-positive guards: 3/3 binding-shape stmts PRESERVED

(iii) #3 round-trip — parseStrudel(verbatim #3) flips STRUCTURED via chord arm
#3 wpTag=Track  body.tag=Pick  body.bareCode=n/a  body.code?.len=n/a
#3 deep-walk Builder/chord hits = 4
#3 hit[0].args = "\"Am Am\""

 ✓ tests/parity-corpus/_waveA-strip-probe.spec.ts  (3 tests)
```

All 3 probe assertions PASS:
- (i) 8/8 curated side-effect stmts dropped by `SIDE_EFFECT_CALL_RE`.
- (ii) 3/3 binding-shape false-positives (`let allChords=…`, `let samplesMap={}`, `const setcpsLater=(x)=>x`) PRESERVED.
- (iii) #3 round-trip: `body.tag='Pick'`, `body.bareCode` not true, NO long bareCode body, **4 Builder/chord hits** (vs. 0 pre-fix), `hit[0].args = "\"Am Am\""` — exact match to the 20-18 stripped-#3 evidence.

### Test gates

**Editor (default test runner):**

```
$ pnpm --filter @stave/editor test
 Test Files  91 passed (91)
      Tests  1627 passed (1627)
```

Editor 1627/1627 UNCHANGED ✓.

**App (default test runner — excludes `_waveC-grounding.spec.ts`):**

```
$ pnpm --filter @stave/app test
 Test Files  18 passed (18)
      Tests  387 passed (387)
```

App default 387/387 UNCHANGED ✓ — parity-corpus 36 + loc-fidelity 36 + other
315. Per-file loc-fidelity STOP gate clean (every snapshot byte-unchanged;
PV49 carries by construction since the filter operates on the array, not the
source string).

**App wave-C config (INCLUDES `_waveC-grounding.spec.ts` — the locked-STOP marker):**

```
$ cd packages/app && pnpm exec vitest run --config vitest.waveC.config.ts
…
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/parity-corpus/_waveC-grounding.spec.ts > 20-18 Wave C-1 grounded chord/arrange modelling (maintainer-only) > records #7 grounded flip + #3 PK18-STOP classification (whole-program shape gap, not chord-arm)
AssertionError: #3 PK18 STOP locked — whole-program still bare due to buildBindingMap shape gap; remove this assertion when the backlog fix lands: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ tests/parity-corpus/_waveC-grounding.spec.ts:155:154

 Test Files  1 failed | 18 passed (19)
      Tests  1 failed | 387 passed (388)
```

**This is the EXPECTED LOUD BREAK at exactly `_waveC-grounding.spec.ts:155`.**
The locked-STOP marker asserted `struct3 === false` (the pre-fix state); the
helper has now flipped #3 STRUCTURED, so `struct3 === true`, and the assertion
fires `expected true to be false`. **This is the crit-1 FLIP signal** — Wave A's
job. Companion lines 140-143 (#7 positive controls) stay GREEN unchanged.

**Note on the PLAN's "386/387 with 1 failure" math:** the default app suite
runner excludes underscore-prefixed maintainer specs, so the locked-STOP
marker is NOT part of the default 387 count. Under the wave-C config (which
INCLUDES the spec), the count goes from baseline 388 GREEN → 387 GREEN + 1
FAIL = the same outcome the PLAN named, expressed in the wave-C-config
context. Wave B's assertion-sense flip restores wave-C config to 388/388 GREEN
and leaves the default 387/387 unchanged.

### Per-file loc-fidelity STOP gate (Wave A)

The 36 loc-fidelity tests in the default suite all PASSED unchanged. No
snapshot moved. PV49 carries: the filter is a `filter()` on the stmts array,
which removes items; the remaining items' `offset` fields are byte-unchanged;
the source string is never mutated; every offset that flows out of
`buildBindingMap` is byte-identical to what would flow if the user had
hand-deleted the side-effect line.

### Proto trace

```
$ pnpm --filter @stave/app test:proto | grep LsnlgQ6osk
[R:__LsnlgQ6osk] post-fixpoint resolved=[rp1,beat,az2,chords2,bass,harm2] pending=[]
[R:__LsnlgQ6osk] FINAL parse -> tag=Stack via=false bareCode=false
```

Proto post-fixpoint trace UNCHANGED from Wave 0 baseline (the `--LsnlgQ6osk`
sample has no curated side-effect statement — `samples({...})` would have
been stripped, but `--LsnlgQ6osk` doesn't have one; the trace is identical).

### Wave A — done (REPEATED HEADER — see end of section)

---

## Wave B — locked-STOP assertion-sense FLIP (the `.toBe(false)` → `.toBe(true)` one-character change)

### The edit (`_waveC-grounding.spec.ts:155`)

The assertion was:

```ts
expect(struct3, '#3 PK18 STOP locked — whole-program still bare due to buildBindingMap shape gap; remove this assertion when the backlog fix lands').toBe(false)
```

becomes:

```ts
expect(struct3, '#3 20-19 FLIP RECORDED — whole-program STRUCTURED via chord recogniser arm (closes #158); if this fails, either `stripSideEffectStatements` dropped a stmt it should not have OR the chord arm regressed').toBe(true)
```

The narrative comment block at lines 145-154 was rewritten to record the FLIP
state ("20-19 (#158) FLIP RECORDED. 20-18 Wave C grounded the chord arm via
the stripped-#3 probe …; 20-19 ships `stripSideEffectStatements` … #3 now
flips whole-program STRUCTURED via the same chord/arrange recogniser arm that
20-18 grounded"). The historical Wave-C narrative ABOVE is preserved as
load-bearing context for future debuggers — the chord arm was correct in
20-18; the 20-19 shape-fence relaxation unblocks the whole-program flip.

### Gates

```
$ git diff --name-only
packages/app/tests/parity-corpus/_waveC-grounding.spec.ts
```

Exactly one file changed.

```
$ cd packages/app && pnpm exec vitest run --config vitest.waveC.config.ts
 Test Files  19 passed (19)
      Tests  388 passed (388)
```

Wave-C config: **388/388 GREEN** (was 1 failed + 387 passed on Wave-A HEAD →
the EXPECTED Wave-A failure is now PASS; companion lines 140-143 stay GREEN).

```
$ pnpm --filter @stave/app test
 Test Files  18 passed (18)
      Tests  387 passed (387)
```

App default 387/387 unchanged (the wave-C grounding spec is underscore-
prefixed, excluded from default include — its flip does not change the
default count).

```
$ pnpm --filter @stave/editor test
 Test Files  91 passed (91)
      Tests  1627 passed (1627)
```

Editor 1627/1627 unchanged.

### Per-file loc-fidelity STOP gate (Wave B)

Inside `pnpm --filter @stave/app test` the loc-fidelity suite ran 36/36; no
snapshot moved. The Wave-B edit is in a spec file (no production source
change), so PV49 is structurally untouchable this wave.

### Wave B — done (REPEATED HEADER — see end of section)

---

## Wave C — Permanent CI fixtures (11 total)

### Fixture vendoring

11 fixtures vendored under `packages/app/tests/parity-corpus/`:

- 10 token fixtures (one per `SIDE_EFFECT_CALL_RE` member): `bakery-158-{all,samples,setcps,setCps-camel,setcpm,setCpm-camel,useRNG,setVoicingRange,initAudio,aliasBank}-shape-fence.strudel`.
- 1 negative-control: `bakery-158-NEGATIVE-no-sideeffect.strudel`.

**Filename convention note:** macOS APFS/HFS+ is case-insensitive by
default; `bakery-158-setcps-shape-fence.strudel` and
`bakery-158-setCps-shape-fence.strudel` would collide. Per the existing
20-15 V-3 precedent (`bakery-G2-setCpm-camel.strudel`,
`bakery-G2-setCps-camel.strudel`), camelCase variants get a `-camel`
slug suffix instead of relying on case-only filenames.

**Faithful-distillation shape** (template):

```strudel
const padsbell = chord("Am Am").voicing().sound('gm_celesta:3').color('blue')
    .attack(0.03).sustain(0.6).release(0.8)
    .room(1).size(4)
    .lpf("500 200").lpenv(4).lpattack(0.2)

<TOKEN>(<MINIMAL VALID ARG>)

stack(padsbell)
```

The chord-rooted RHS hits the 20-18 `CHAIN_ROOT_RECOGNISER` chord arm;
the `stack(binding-ref)` finalExpr matches the existing structured
final-expr arm; the side-effect intermediate is removed by 20-19's
filter; the program shape becomes `[binding, finalExpr]` which the
existing pS:534 shape guard accepts. Per-token arg shapes grounded
against R-1's upstream-signature table (use single quotes per P62 /
`feedback_strudel_quote_style.md`).

**Initial fixture design (deviation recorded — pre-mortem 2 of R-8 fired):**

The first attempt used `let intro=s('bd hh sd hh'); let core=s('bd*2 hh*4'); <SIDE_EFFECT>; '<0 1>'.pick([intro,core])` — a simpler shape. Both the side-effect-bearing fixtures AND the negative-control parsed as `tag=Track body.tag=Code` (bareCode). **Direct observation revealed the cause:** the `'<0 1>'.pick([id,id])` final expression is not in the structured chain-root recogniser (the production parser falls through to bareCode for this finalExpr regardless of whether the filter ran). The first fixture design therefore had ZERO test signal — the snapshot was identical pre-and-post-filter.

**Resolution:** rewrote all 11 fixtures using the proven `chord("Am Am").voicing().sound(...)` chord-rooted RHS + `stack(binding)` finalExpr shape — the EXACT 20-18 `bakery-chord-voicing-root.strudel` template, which is documented working. The 10 positive fixtures + 1 negative-control all now parse STRUCTURED `Code.via` cascade. The negative-control's snapshot body is BYTE-IDENTICAL to each positive fixture's (modulo trivial loc differences) — proving the filter produces a `[binding, finalExpr]` stmts array equivalent to the user hand-deleting the side-effect line. **Disposition:** this fixture-design observation is captured in the FIXTURE-COMMIT and the BAKERY-FIXTURES.md update; the chord-rooted shape is the canonical 20-19 fixture template (mirror this for any future 20-19 token additions).

### parity-refresh exclusion

```
$ node packages/app/scripts/parity-refresh.mjs --dry-run
# unchanged: 16   changed: 0   missing: 0
# no drift — corpus is in sync with the targeted upstream SHA.
```

0 missing for `bakery-158-*` — the structural exclusion guard at
`parity-refresh.mjs:68-75` (any `bakery-*` prefix triggers throw if added
to TARGETS) covers the new slugs by construction.

### Snapshot capture + gates

```
$ pnpm --filter @stave/app test
  Snapshots  22 updated   (after one-shot -u capture; subsequent runs no -u)

 Test Files  18 passed (18)
      Tests  409 passed (409)
```

App **409/409 GREEN** (parity-corpus 47 + loc-fidelity 47 + other 315
= 36+11 + 36+11 + 315 = 409 ✓).

Snapshot bodies (parity-test.ts.snap inspection):

```
bakery-158-all-shape-fence:        body.tag=Code body.via=PRESENT (chord cascade)
bakery-158-NEGATIVE-no-sideeffect: body.tag=Code body.via=PRESENT (chord cascade)
bakery-158-samples-shape-fence:    body.tag=Code body.via=PRESENT (chord cascade)
bakery-158-aliasBank-shape-fence:  body.tag=Code body.via=PRESENT (chord cascade)
…
```

All 11 fixtures structure to the same `Code.via` cascade. The
negative-control's snapshot is byte-equivalent in body shape to the 10
positive fixtures (109 lines each in the snap file) — the filter
mechanism is the gate, the bindings substrate works.

### Per-file loc-fidelity STOP gate (Wave C)

The 36 pre-existing loc-fidelity snapshots were NOT touched by Wave C
(verified by the `Snapshots 22 updated` count — exactly 11 new
parity-test snapshots + 11 new loc-fidelity snapshots, NO pre-existing
snapshots updated). The 22 updated are exclusively the new fixtures.

### Editor unchanged

```
$ pnpm --filter @stave/editor test
 Test Files  91 passed (91)   Tests  1627 passed (1627)
```

### Wave C — done (REPEATED HEADER — see end of section)

---

## Wave V-1 — AMENDED-D-04 dual-gate measurement

### One-arg oracle invariant

```
$ grep -n 'parseStrudel(s\.' packages/app/tests/parity-corpus/_bakery-classify.spec.ts
77:        fallback = isCodeFallback(parseStrudel(s.code))
```

EXACTLY one arg ✓ (the 20-18 Wave-E hardened invariant). 20-19's helper
landed via `buildBindingMap`'s preamble (not via opts threading) — this
invariant is structurally unchanged.

### Fresh PK17 step-6 measurement

```
$ pnpm parity:bakery --n 50
…
# === REAL-WORLD PARITY ===
# N (measured):     50
# structured:       48
# Code-fallback:    2
# real-world %:     96.0%   (structured / N)

# === NEW fallback classes (BACKLOG — NOT fixed this phase, D-03) ===
#   [1x] BACKLOG #143: guarded boot expr typeof X && X(...)
#   [1x] NEW: uncategorised — needs manual triage (file an issue per AnviDev)

# artifact (gitignored, dated/SHA'd): packages/app/tests/parity-corpus/.bakery-runs/samples-2026-05-20T13-22-13-320Z.json
# result:                              packages/app/tests/parity-corpus/.bakery-runs/result-2026-05-20T13-22-13-320Z.json
```

**Fresh stamp:** `2026-05-20T13-22-13-320Z`
**UPSTREAM_SHA:** `f73b395648645aabe699f91ba0989f35a6fd8a3c` (unchanged
from baseline pin — same as `CORPUS-SOURCE.md`).
**Structured:** **48/50 = 96.0%** (was 46/50 = 92.0% baseline → +4pp)
**Fallback count:** 2 (was 4; -2)

### Per-row diff vs `result-2026-05-19T20-17-24-486Z.json`

| Hash | Issue | Baseline | Fresh | Disposition |
|---|---|---|---|---|
| `-6c1hEXe8Agi` | #158 | code | **structured** | ✓ expected flip (the target — `all(x=>x.punchcard())` stripped; chord arm fires) |
| `-1j62z5xjyCN` | #147 / #141 / #140 | code | **structured** | **BONUS** — Wave-0 pre-classified as F+SHAPE-FENCE-coupled (predicted to need #149 ALSO); fresh observation shows the filter alone is sufficient to flip this row. P70 occurrence-8 candidate (cascade classification was wrong, in the bonus direction). D-03 explicitly accepts non-A → A reclassification as bonus close. |
| `-7LU6zgzViSM` | #143 | code | code | unchanged (guarded-boot was shipped in 20-15 but this baseline row remains a fallback — pre-existing baseline state; not a 20-19 regression) |
| `-G2drHRNFueu` | #159 / #153 | code | code | unchanged (multi-top-level / tokenizer-whitespace; stays backlog per D-03 strict) |

**46 baseline-structured rows:** ALL still structured in the fresh measurement. ZERO regressions. Verified by the parity-bakery output showing 48 OK + 2 COD = 50 total, with the two COD being known-backlog rows (#143 baseline + #159 backlog).

### Dual-gate check on the same HEAD SHA (Wave-C HEAD `80952c1`)

| Crit | Status |
|---|---|
| **crit-1 HARD** (`_waveC-grounding.spec.ts:155` PASSES with `.toBe(true)`) | ✓ PASSING (wave-C config 410/410 GREEN; companion lines 140-143 GREEN) |
| **crit-2 HARD** (fresh ≥ 47/50 = 94.0% AND ≥ 46/50 = 92.0% floor) | ✓ **48/50 = 96.0%** — beats both thresholds |
| **No bar-lowering / no second-workaround / no scope-expansion** | ✓ The phase shipped only the curated-list filter; no premise was bar-lowered; no Wave-0 backlog row was scope-expanded into the in-scope set (the `-1j62z5xjyCN` flip was a BONUS by direct observation, NOT a scope decision). |

### Re-run crit-1 on merge-candidate HEAD

```
$ cd packages/app && pnpm exec vitest run --config vitest.waveC.config.ts
 Test Files  19 passed (19)
      Tests  410 passed (410)
```

Wave-C config 410/410 (parity-corpus 47 + loc-fidelity 47 + grounding spec
1 + other 315). `_waveC-grounding.spec.ts:155` PASSES with `.toBe(true)`.

### V-1 verdict

**BOTH crit hold on the SAME HEAD SHA `80952c1`.** Phase 20-19 passes
the D-04 dual gate cleanly:

- crit-1: #3 `-6c1hEXe8Agi` whole-program STRUCTURED via chord arm; locked-STOP flipped + PASSING.
- crit-2: 48/50 = 96.0% (≥ 94.0% AND ≥ 92.0% floor); +4pp over baseline; no regressions on the 46 baseline-structured rows.
- bonus: `-1j62z5xjyCN` flipped to STRUCTURED — the FROZEN curated-set `samples` token stripped its `samples('github:yaxu/clean-breaks')` line, and the rest of its shape (`var cpm = 30; stack(...).cpm(cpm)`) was structured by existing 20-17 / 20-18 machinery. The Wave-0 prediction that the `.cpm(cpm)` chain-arg would block was falsified — direct observation wins (P70 occurrence 8 in the BONUS direction; documents in catalogue addenda).

**No PK18 re-pose required.** The phase ran clean.

11 permanent CI fixtures vendored (10 token + 1 negative-control) in
canonical chord-rooted shape; BAKERY-FIXTURES.md updated with the
20-19 section + the per-fixture table + the negative-control's role;
auto-discovery picked up the new files (parity 36→47, loc-fidelity
36→47); total app test count 387→409 GREEN; per-file loc-fidelity STOP
gate clean (no pre-existing snapshot moved; 22 new snapshots = 11 × 2
suites); structural exclusion from `parity-refresh.mjs` confirmed.
Initial fixture design was reworked after direct observation showed the
naive `'<0 1>'.pick([id,id])` finalExpr did not structure on the
negative-control either; the resolved chord-rooted shape is now the
canonical 20-19 fixture template.

`_waveC-grounding.spec.ts:155` flipped `.toBe(false)` → `.toBe(true)` with
updated diagnostic message + narrative comment block recording the FLIP state;
wave-C config 388/388 GREEN (was 387 passed + 1 failed on Wave-A HEAD);
companion lines 140-143 GREEN unchanged; app default 387/387 unchanged;
editor 1627/1627 unchanged; per-file loc-fidelity STOP gate clean.

`SIDE_EFFECT_CALL_RE` + `stripSideEffectStatements` helper landed at module
scope (between `splitTopLevelStatements` close and `BINDING_RE`) with the full
provenance block (Codeberg SHA pin `f73b3956` + 10 per-token file:line
citations); wired into `buildBindingMap`'s preamble at line 492 (additive
ONE-line semantically; three physical lines after prettier); `git diff`
additive-only (64+/1- — the deletion is the original wire line, replaced by
the new wire's three lines); P68 build hygiene clean with 4 minification-
stable greps > 0; Wave-A throwaway probe recorded VERBATIM with all 3
assertions GREEN (strict-widen 8/8, false-positive 3/3, #3 round-trip flipped
STRUCTURED with 4 chord HITs at args=`"Am Am"`); editor 1627/1627; app
default 387/387 unchanged; wave-C config 1 failed + 387 passed (the EXPECTED
loud break at line 155 — the crit-1 FLIP signal); proto unchanged; per-file
loc-fidelity STOP gate clean.
