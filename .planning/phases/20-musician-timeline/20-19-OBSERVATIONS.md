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
