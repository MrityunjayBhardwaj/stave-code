---
phase: 20-16
task: 1 (HARD GATE — D-01 Lokāyata prototype)
verdict: GATE FAILED
created: 2026-05-18
prototype: /tmp/proto-d01-fixpoint.spec.ts (run as packages/app/tests/parity-corpus/_proto-d01.spec.ts under vitest.proto.config.ts; vite-node import of editor SOURCE — identical mechanism to _bakery-classify.spec.ts:11-19)
---

# Phase 20-16 — Task 1 HARD GATE Observations

**VERDICT: GATE FAILED.** The D-01 least-fixpoint design is sound in
isolation (the synthetic gates all pass), but the core CONTEXT D-01
assumption — *"the D-01 fixpoint closes the dominant 6/14 real-world
#141 class"* — is **CONTRADICTED BY OBSERVATION**. 4 of the 6 measured
#141 repros never reach the fixpoint at all: they bail at the
statement-shape fence (`finalIdx != last`) BEFORE the binding loop,
because `splitTopLevelStatements` (pS:290-355) splits **leading-dot
multi-line chain continuations** into phantom standalone statements.
This is a *different, prior gap* than the one D-01 was designed to close.

Per the plan's HARD GATE clause and the orchestrator `<critical_gate>`:
do NOT proceed to Wave A; the plan needs redesign, not push-through.

---

## How the prototype was run (observation, not inference)

- Prototype: a local re-implementation of the proposed A-1 descriptor
  list + A-2 bounded least-fixpoint variant, with an OQ1-relaxation
  toggle. It does NOT edit `parseStrudel.ts`. It copies
  `splitTopLevelStatements` + `BINDING_RE` BYTE-FOR-BYTE from
  parseStrudel.ts and uses the exported `parseExpression` (4th `bindings`
  arg) for the RHS parse and the final-expr parse — exactly the
  production substitution machinery.
- Import path: `../../../editor/src/ir/parseStrudel` under vite-node via
  a throwaway `vitest.proto.config.ts` (merges `vitest.config.ts`,
  include = the proto spec only). Same proven import the classifier uses;
  the `@stave/editor` barrel crash (gifenc) was avoided. The prototype
  RAN (it did not crash on import) — the gate is observed, not inferred.
- 6 repros extracted from the gitignored V-1 file
  `samples-2026-05-15T23-13-07-584Z.json` (stamp verified, SHA
  f73b395648645aabe699f91ba0989f35a6fd8a3c, N=50) by `hash`.

## Raw prototype output (verbatim)

```
=== 6 REPROS ===
__LsnlgQ6osk   | noRelax=code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
               | relax  =code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
_1j62z5xjyCN   | noRelax=code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
               | relax  =code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
_72eEl7NwK9e   | noRelax=code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
               | relax  =code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
_CyO42BOyp5a   | noRelax=structured (Track(d1, Code))
               | relax  =structured (Track(d1, Code))
_L13nBhrqGR_   | noRelax=code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
               | relax  =code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
_LHtBlF8peGC   | noRelax=code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
               | relax  =code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))

=== SYNTHETICS ===
forward-ref (b)              | structured (Track(d1, Play))
cyclic (c)                   | code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
dup-key (d)                  | code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
dead-opaque 5c [noRelax]     | code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
dead-opaque 5c [relax]       | structured (Track(d1, Play))
ref-opaque 5c [relax]        | code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))

=== DIAGNOSTICS (relax run per repro) ===
[R:__LsnlgQ6osk] stmts=32
[R:__LsnlgQ6osk] descs=rp1,beat finalIdx=2 finalText=".gain(perlin.range(0.3,0.8))"
[R:__LsnlgQ6osk] BAIL finalIdx 2 != last 31 (trailing binding)
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
[R:_L13nBhrqGR_] stmts=11
[R:_L13nBhrqGR_] descs=polyrhythm finalIdx=1 finalText=".steps(12)"
[R:_L13nBhrqGR_] BAIL finalIdx 1 != last 10 (trailing binding)
[R:_LHtBlF8peGC] stmts=9
[R:_LHtBlF8peGC] descs=chordProgression,scales,numChords finalIdx=3 finalText="stack(\n\n  //arp keys\n  n(chordProgression).s(\"gm_epiano1\").p"
[R:_LHtBlF8peGC] BAIL finalIdx 3 != last 8 (trailing binding)
```

Independent confirmation of the segmenter behavior (raw
`splitTopLevelStatements` logic over a minimal `--LsnlgQ6osk` slice):

```
0 "const rp1 = \"<sd hh>\".fast(\"<2@3 4>\")"
1 "const beat = sound(rp1).bank(\"RolandTR707\").gain(0.4)"
2 ".gain(perlin.range(0.3,0.8))"          <-- leading-dot continuation = phantom statement
3 ".adsr(\"[.015 0.1]:.1:[0.8 0.4]\")"     <-- phantom statement
4 "const chords2 = \"<Gsus G7 Em7 D7>\""
5 "stack(\n  beat,\n)"
```

## 6-repro classification table (OBSERVED)

| repro | verdict | reaches fixpoint? | root cause (observed) | OQ implicated |
|---|---|---|---|---|
| `--LsnlgQ6osk` | code (both) | **NO** | leading-dot chain continuation split → `finalIdx=2` (`.gain(...)`) `!= last 31` → statement-shape fence (pS:395-398) bail BEFORE the binding loop | **new gap: segmenter, not D-01** |
| `-1j62z5xjyCN` | code (both) | **NO** | `finalIdx=1` (`samples('github:…')`) `!= last 2` → shape fence; also #142 strip dependency (the `samples('github:…')` is not prelude-stripped) | new gap (segmenter) + #142 |
| `-72eEl7NwK9e` | code (both) | YES | only binding `var cpm=28` (RHS `28` → bareCode). Relax DROPS it (cpm IS referenced by `.cpm(cpm)` so NOT eligible — correct), and the final `stack(...).cpm(cpm)` itself parses to **bare Code** (multi-line `note(\`…\`)` + arithmetic). NOT a D-01 win even with relax | OQ1: this is #142/#143-class + a `note(\`…\`)` template-root gap, NOT D-01 |
| `-CyO42BOyp5a` | **structured** (both) | YES | all 4 bindings resolve (`drum/clap/bass/perc`); final `stack(...)` → `Code` **with `via`** = structured per P67. Grounds WITHOUT D-01 relaxation | OQ3: grounds under plain RHS-threading; reveals NO new micro-gap |
| `-L13nBhrqGR_` | code (both) | **NO** | `finalIdx=1` (`.steps(12)` leading-dot continuation) `!= last 10` → shape fence | new gap (segmenter) |
| `-LHtBlF8peGC` | code (both) | **NO** | `finalIdx=3` (the `stack(` IS at idx 3, but continuations + trailing `/* */` block make `last=8`) → shape fence | new gap (segmenter) |

**Score: 1/6 structured, and that 1 (`-CyO42BOyp5a`) does NOT use D-01
(it grounds under the EXISTING γ-3 RHS parse threaded — it is an OQ3
"already grounds" case, not a D-01-eligible win).** The genuine
D-01-eligible transitive repro (`--LsnlgQ6osk`: `const beat =
sound(rp1)…` referencing earlier `rp1`) is **NOT** closed by D-01 —
it never reaches the fixpoint.

## Synthetic gates (b)/(c)/(d) + OQ1 5c pair — OBSERVED

| gate | expected | observed | pass |
|---|---|---|---|
| (b) forward-ref `const a=b; const b=n("0"); stack(a)` | structured | `structured (Track(d1, Play))` | ✓ |
| (c) cyclic `const a=b; const b=a; stack(a,b)` | graceful Code | `code` (occurs-check terminal: both stay bare-Code post-fixpoint → opaque fence) | ✓ |
| (d) dup-key `var x=n("0"); var x=n("1"); stack(x)` | graceful Code | `code` (stmtIndex-keyed first-dup-wins) | ✓ |
| OQ1 5c dead-opaque `var d=makeBass(); const p=n("0"); stack(p)` [relax] | structured | `structured (Track(d1, Play))` | ✓ |
| OQ1 5c ref-opaque `const p=makeBass(); stack(p)` [relax] | graceful Code | `code` (fence fires — `p` IS referenced) | ✓ |

The fixpoint MECHANISM is correct where it is reached. The OQ1
relaxation is correctly bounded (dead-opaque grounds; referenced-opaque
still bails). **But the mechanism is unreachable for the dominant
real-world class** because the statement segmenter mis-splits first.

## OQ dispositions (resolved FROM observed results)

- **OQ1 (dead-binding sub-case).** Observed: `-72eEl7NwK9e` and
  `-1j62z5xjyCN` are NOT D-01 wins. `-72eEl7NwK9e` reaches the fixpoint
  but its final `stack(...).cpm(cpm)` parses to bare Code independent of
  the binding (multi-line `note(\`…\`)` template root + the `.cpm(cpm)`
  arithmetic) — the OQ1 relaxation does not and cannot rescue it (`cpm`
  IS referenced by `.cpm(cpm)`, so it is correctly NOT eligible).
  `-1j62z5xjyCN` never reaches the fixpoint (segmenter + #142).
  **Disposition: the OQ1 relaxation is sound and correctly bounded (5c
  synthetics pass), but it closes ZERO of the 6 measured repros. It is
  not the fix vehicle for any of them. Neither (i) nor (ii) of the
  plan's OQ1 menu applies — the real blockers are (A) the segmenter
  leading-dot split [4/6] and (B) #142 strip + a `note(\`…\`)` template
  root gap [the cpm cases].**
- **OQ3 (`-CyO42BOyp5a`).** Observed: grounds STRUCTURED under the
  existing RHS-threading (the partial map threaded into the RHS parse).
  Reveals **no** 4th micro-gap. It is the one repro that works — and it
  works because its bindings are single-line / correctly brace-balanced
  so the segmenter does not mis-split them. **Disposition: OQ3 resolved
  — `-CyO42BOyp5a` is already-structured; it is evidence the fixpoint
  threading is correct, NOT evidence D-01 closes the class.**
- **OQ2 (#142 code-change-needed)** — not reached (Wave B blocked by
  the failed gate). Deferred to the redesign.
- **OQ4 (fixpoint/dup-key declaration-identity)** — RESOLVED by
  observation: dup-key keyed on stmtIndex first-dup-wins fires correctly
  on the synthetic and does NOT misfire across fixpoint iterations
  (forward-ref re-iterates `a` across iter0/iter1 and still grounds).
- **OQ5 (order-independence)** — RESOLVED by observation: forward-ref
  `const a=b; const b=n("0"); stack(a)` grounds structured. The
  substitution fixpoint is order-independent as designed.

## The structural finding (root cause, one sentence)

**`splitTopLevelStatements` (pS:290-355) treats a newline at brace
depth 0 as an unconditional statement boundary, so a leading-dot
multi-line method chain continuation (`\n  .gain(...)`) becomes a
phantom standalone statement — which makes `buildBindingMap`'s
`finalIdx != stmts.length-1` shape fence (pS:395-398) bail the WHOLE
program before the binding loop runs; D-01 (a fixpoint *around the RHS
parse*) is downstream of this and therefore cannot close the dominant
#141 real-world class.**

## Why this is GATE FAILED, not a workaround opportunity

The plan's HARD GATE acceptance (a) is "the D-01-eligible repros ground
to correct structured trees." Observed: they do not (1/6, and that 1 is
not D-01-eligible). The CONTEXT D-01 rationale rests on RESEARCH's claim
that the dominant blocker is the opaque-RHS fence on a
binding-references-binding RHS. The prototype shows the dominant blocker
is *upstream of bindings entirely* — the statement segmenter. Adding the
D-01 fixpoint would be a second mechanism that does not address the
observed root cause (base-layer reactivity check: "do not add a fix that
does not address the root cause"). Per `<critical_gate>`: STOP, redesign.

## Recommended redesign direction (for the next plan-phase, NOT executed here)

The observed root cause points at a **prior, narrower** fix that would
make the D-01 fixpoint actually reachable:

1. **Segmenter fix (the real dominant gap):** `splitTopLevelStatements`
   must NOT break on a newline when the NEXT non-whitespace token is a
   `.` (leading-dot chain continuation) — a JS line-continuation /
   ASI-aware rule. This is the gap that blocks 4/6. It is a bounded
   recognition change (peek past whitespace/comments for a leading `.`),
   testable in isolation, and orthogonal to the binding fixpoint.
2. Re-run THIS prototype after the segmenter fix to observe whether the
   4 now reach (and pass) the D-01 fixpoint. Only then is D-01's
   payoff measurable.
3. `-72eEl7NwK9e` / `-1j62z5xjyCN` additionally need #142 strip + a
   `note(\`template\`)` root gap — separate classes, separate scope
   calls (D-03 discipline: file as backlog, do not bundle).
4. The D-01 fixpoint design itself is VALIDATED for when it IS reached
   (forward-ref / cyclic / dup-key / OQ1-bounded all pass) — preserve
   the design; the redesign is about SEQUENCING (segmenter first), not
   about D-01 being wrong.

The 20-15 baseline (72.0% / N=50 / sha f73b3956 / 2026-05-15) is
unchanged — no source was modified in this task.

---

# POST-SEG-1 RE-RUN (2026-05-18, gate iteration 2)

**VERDICT: GATE FAILED AGAIN.** SEG-1 (`splitTopLevelStatements` leading-dot peek via PV49 primitive) IS a correct, narrow fix — it eliminates the leading-dot phantom-split — but the dominant 6/14 #141 class has **at least 3 compounding segmenter recognition gaps**, not 1. The gate's GATE-PASS criterion ("`--LsnlgQ6osk` grounds STRUCTURED") is not met; SEG-1 alone reduces phantoms but does not unblock the dominant repro.

## SEG-1 effect (observed)

Editor: 1564/1564 GREEN. Parity-corpus: 25/25 + loc-fidelity 25/25 (per-file STOP gate VACUOUSLY GREEN — no existing corpus snapshot moved). SEG-1 implementation: `parseStrudel.ts:346` split — `;` flushes always; `\n` peeks via `skipWhitespaceAndLineComments(body, i+1)`; if next char is `.`, do not flush. Build-hygiene gate (P68): one-shot build OK; grep verifies the compiled output (`dist/index.js:4513-4521`).

## Post-SEG repro classification (verbatim diagnostics)

| repro | pre-SEG | post-SEG | verdict | new finding |
|---|---|---|---|---|
| `--LsnlgQ6osk` | stmts=32 `descs=rp1,beat` finalIdx=2 `.gain(...)` | stmts=8 `descs=rp1,beat,az2,chords2,bass` finalIdx=5 `"const harm2 ="` | **STILL code** | `=`-continuation phantom (#150) |
| `-1j62z5xjyCN` | stmts=3 descs=cpm finalIdx=1 `samples('github:…')` | **UNCHANGED** stmts=3, same bail | code | #142 (samples strip); SEG-1 inapplicable |
| `-72eEl7NwK9e` | stmts=2 (reaches fixpoint, bails on opaque) | **UNCHANGED** stmts=2 | code | #149 (template-root + `.cpm(binding)`); SEG-1 inapplicable |
| `-CyO42BOyp5a` | structured | **structured** | structured | already-grounds (no D-01 needed) |
| `-L13nBhrqGR_` | stmts=11 finalIdx=1 `.steps(12)` | stmts=5 `descs=polyrhythm,polymeter` finalIdx=2 `"// poly rhythm + meter in one!"` | **STILL code** | comment-only phantom (#151) |
| `-LHtBlF8peGC` | stmts=9 finalIdx=3 `stack(...` | stmts=6 `descs=chordProgression,scales,numChords` finalIdx=3 `stack(...` (correct), but finalIdx 3 != last 5 | **STILL code** | trailing `/* … */` block comment NOT skipped by segmenter (#152) |

## The 3 new compounding segmenter gaps (filed, not fixed)

- **#150 `=`-continuation:** `const harm2 = \n  chords2.voicings('ireal')…` — `=` at end of line is NOT a JS statement terminator; the next line is the RHS. Fix surface: at `parseStrudel.ts:346` `\n` branch, ALSO suppress flush iff the **preceding** non-ws/non-`//` char (looking backward) is `=` (and likely `,`, `(`, `[`, `{`, `?`, `:` — but `(`/`[`/`{` are already depth-guarded). Narrow recognition extension on the matcher line.
- **#151 comment-only phantom:** a `// comment` on its own line becomes a phantom segment because `flush()` keeps any segment with `raw.trim().length > 0`. Fix surface: at `flush()` (pS:305-312), additionally skip segments whose trim is entirely `//`-prefixed comment lines (no executable content). Or: in the segmenter's `//` skip-to-EOL, consume the trailing `\n` BEFORE the depth-0 flush check. Either preserves loc-offset semantics.
- **#152 block-comment not skipped:** `/* … */` blocks are not recognized; the segmenter walks their content as code, and any `\n` at depth 0 inside the block flushes. Fix surface: at the segmenter's comment-recognition site (currently only `//` at pS:326-329), add a `/*`/`*/` block-comment skip identical to `//`'s structure. Narrow.

## Synthetics post-SEG-1 (re-confirmed)

- (b) forward-ref: structured ✓
- (c) cyclic: graceful Code (occurs-check terminal) ✓
- (d) dup-key: graceful Code ✓
- (5c) dead-opaque + relax: structured ✓; ref-opaque + relax: graceful Code ✓

D-01 mechanism is still validated where reached. The blocker is upstream segmenter completeness, not D-01.

## Decision required (escalated to user)

The PLAN's GATE-PASS criterion is unmet. Three options:

- **(A) Expand Wave 0 to SEG-1 + #150 + #151 + #152.** All four are narrow, same-surface recognition extensions; bundle them, re-run the gate. Cleanest if the user wants D-01 to actually unblock in this phase.
- **(B) Land SEG-1 alone, file #150/#151/#152 as backlog, defer D-01 to a later phase.** Most disciplined per scope; loses D-01's payoff for now.
- **(C) Reframe 20-16 as a "segmenter robustness" phase, do all four fixes + measurement, defer D-01 + #142/#143/#144 to 20-17.** Cleanest reframing.

SEG-1 is preserved in the working tree (uncommitted, ready to be committed alone or expanded into a bundle). Pre-existing baselines unchanged.

---

# POST-WAVE-0-BUNDLE RE-RUN (2026-05-18, gate iteration 3)

**VERDICT: Wave 0 IS COMPLETE AND CORRECT. The bottleneck shifts to D-01 mechanism completeness — narrower than CONTEXT assumed.** All 4 segmenter fixes (#148+#150+#151+#152) are implemented, mirrored in the prototype, build-hygiene gate passed (P68), editor 1564/1564 GREEN, app/parity 347/347 GREEN, per-file STOP gate vacuously green (no existing snapshot moved). One new D-01-eligible repro (`-L13nBhrqGR_`) grounds structured — real PK17-step-4 progress.

## Wave 0 bundle implementation

- **#148** parseStrudel.ts:346 `;` branch (unconditional flush) + `\n` branch (peek-forward via `skipWhitespaceAndLineComments` for `.` continuation).
- **#150** same `\n` branch: backward-peek skipping whitespace from `i-1` to `segStart`; if last non-ws char is `=`, suppress flush.
- **#151** `flush()` augmented: strip `/* … */` blocks + `// …` line comments from `raw`; if residue is empty/whitespace, skip the segment (no phantom comment-only statements).
- **#152** new branch in comment-recognition (mirrors `//` skip's structure): if `ch === '/' && body[i+1] === '*'`, walk to `*/`, consume the closing `*/`, continue (no flush inside the block).

## Production-pipeline classification (the truth, not the proto)

| repro | pre-Wave-0 | post-Wave-0 (production) | delta |
|---|---|---|---|
| `--LsnlgQ6osk` | code | **code (still)** | segmentation now perfect (7 stmts, 6 bindings + final stack); D-01 mechanism doesn't substitute in `sound(ident)` / `chords2.method(...)` positions |
| `-1j62z5xjyCN` | code | code | #142 strip needed (samples('github:…')); SEG-1/150/151/152 inapplicable |
| `-72eEl7NwK9e` | code | code | #149 (template-root + `.cpm(binding)`); D-01 not the fix vehicle |
| `-CyO42BOyp5a` | structured | structured | stable |
| `-L13nBhrqGR_` | code | **structured (NEW WIN)** | Wave 0 unblocked it — segmenter fixes alone were sufficient |
| `-LHtBlF8peGC` | code | **code (still)** | segmentation now correct; production's pre-D-01 `buildBindingMap` opaque-fences on `var numChords = 4` (a number-literal RHS parses bareCode, fires the fence) |

**Score: 2/6 production-structured** (was 1/6 post-SEG-1, was 1/6 pre-SEG-1).

## The bottleneck has shifted: D-01 mechanism completeness

CONTEXT D-01 stated *"the substitution primitive is ALREADY BUILT"* (re-entrant `parseExpression` with `bindings` arg at pS:758, whole-ident substitution at pS:779-784 per RESEARCH, stack-arg threading at pS:1009 per RESEARCH). The prototype's iter1 on `--LsnlgQ6osk` falsifies that for non-stack-arg positions:

```
[R:__LsnlgQ6osk] iter1 beat rhs="sound(rp1).bank(\"RolandTR707\")..." -> tag=Code bareCode=true   (rp1 IS resolved, but sub doesn't reach into sound(rp1))
[R:__LsnlgQ6osk] iter1 bass rhs="chords2.rootNotes(2).note()..."     -> tag=Code bareCode=true   (chords2 IS resolved, but sub doesn't reach root-ident `chords2.method(...)`)
[R:__LsnlgQ6osk] iter1 harm2 rhs="chords2.voicings('ireal')..."      -> tag=Code bareCode=true   (same — root-ident position)
[R:__LsnlgQ6osk] iter1 az2 rhs="irand(12).struct(\"x(8,8)|x(4,8)\")…" -> tag=Code bareCode=true   (no binding refs! parser doesn't recognise irand(...) root form?)
```

Two newly-observed D-01 mechanism gaps:
- **D-01-G1: Chain-arg substitution.** `sound(rp1)` with `rp1` resolved → still bareCode. The `bindings` arg doesn't reach into chain-arg positions inside calls like `sound(...)` / `n(...)` / `note(...)` etc. (Only stack-arg threading per RESEARCH.) Need: thread `bindings` into the recursive `parseExpression`/`parseRoot` arms that parse fn-call inner args.
- **D-01-G2: Root-ident substitution.** `chords2.rootNotes(2).note()` with `chords2` resolved → still bareCode. `parseRoot` (pS:837) doesn't have an arm that recognises a *bound* ident as a root (it has arms for `"…"`, `` `…` ``, `ident(…)`, etc.). Need: an arm that, when the root token is a bare ident present in `bindings`, splices the bound IR as the root and applies the chain.
- **D-01-G3 (separate):** opaque-RHS fence on a number-literal RHS (`var numChords = 4`). `4` parses to bareCode → fence fires → `-LHtBlF8peGC` bails even though `numChords` is correctly referenced and the use position (`.slow(numChords)`) would happily accept a Code passthrough. Need: either parseExpression recognises number/string literals as non-opaque, OR the opaque fence is bypassed for chain-arg-position references (similar to the OQ1 relaxation but for "literal-RHS referenced from a chain-arg position").

Plus `az2`'s `irand(12).struct(...)` bareCode despite no bindings — suggests `irand` isn't a recognised root form either (a separate parseRoot gap, file as new issue if it matters; for D-01 it's orthogonal).

## What this changes for the plan

- **Wave 0 (4 segmenter fixes) is COMPLETE and CORRECT** — implemented, tested, no regression, 1 new D-01-eligible repro grounds. Ship it.
- **Wave A (D-01) original framing is INCOMPLETE.** The "primitive already built" claim was right for stack-arg bare-ident substitution (`stack(bound,bound,bound)`) but wrong for the chain-arg and root-ident positions that dominate real Bakery code. A-2's "bounded fixpoint iteration" alone won't unblock `--LsnlgQ6osk` (the canonical D-01 transitive repro); D-01-G1 + D-01-G2 need their own design + implementation.
- **`-LHtBlF8peGC` (`var numChords = 4`)** is independently blocked by D-01-G3 (literal-RHS opaque) — a small targeted fix; possibly fold into Wave A.

## Decision required (escalated to user)

Wave 0 stands. For D-01:

- **(A) Pause + investigate D-01 mechanism (Wave A-0):** before committing to A-1/A-2, deepen the surface scan into `parseRoot`/`parseExpression`/chain-arg recursion. Map where `bindings` actually reaches vs where it doesn't. Then revise A-1/A-2 to also implement D-01-G1 + D-01-G2 (broader than current spec). HIGHEST confidence path to actually unblocking `--LsnlgQ6osk`.
- **(B) Ship Wave 0 alone (small 20-16), defer Wave A entirely to 20-17:** the smallest honest phase given the cascade. Closes #148+#150+#151+#152, picks up 1 new D-01-eligible repro + presumably more in the wider Bakery population (segmenter fixes affect many code shapes). 20-17 = D-01 phase with proper mechanism investigation.
- **(C) Proceed with Wave A as planned, accepting partial D-01 payoff:** A-1/A-2 will be correct for stack-arg bare-ident bindings (the γ-3 case) but won't move `--LsnlgQ6osk`. We get a smaller-than-hoped D-01 win + #142/#143/#144. Most consistent with the resequenced plan but knowingly partial.

Wave 0 source change is in the working tree, uncommitted (parseStrudel.ts modified). Editor 1564 + parity 50 baselines hold. The 4 new issues #148/#150/#151/#152 should be reflected in the commit message when Wave 0 lands.

---

# WAVE A-0 — D-01 mechanism investigation (2026-05-18, user-requested deep scan)

**FINDING: CONTEXT D-01's load-bearing premise is FALSIFIED by source scan.** CONTEXT/RESEARCH stated *"parseExpression is ALREADY re-entrant with a bindings arg; D-01 is a fixpoint ITERATION around the existing RHS parse, NOT a new evaluator — keep the change minimal."* The scan shows `bindings` is a **narrow stack-arg hook**, not a pervasive substitution context. D-01 done correctly is a parser-wide threading refactor.

## The complete `bindings` reach map (parseStrudel.ts, current source)

REACHES (substitution works):
- `parseExpression:832-837` — WHOLE-expression bare ident (`expr.trim()` is exactly `/^[A-Za-z_$][\w$]*$/` and in map). Covers `stack(p1)` single-arg unwrap.
- `parseRoot:1061-1062` — the `stack(a,b,c)` arg loop: each arg via `parseExpression(a.value, …, bindings)`. The γ-3 / #134 case (`stack(boundId, boundId)`).

DOES NOT REACH (4 gaps, exact sites):
- **D-01-G1 (chain-arg).** `parseStrudel.ts:1015` — the loose recursive arm for `note|n|s|sound|mini(...)` calls `parseExpression(innerTrimmed, innerAbsOffset, callerIsSample)` — the 4th `bindings` arg is OMITTED. So `sound(rp1)` with `rp1` resolved still parses `rp1` bare → bareCode. One-line-ish fix (add `, bindings`), but see G4 — it must also be threaded onward.
- **D-01-G2 (root-ident).** `parseRoot` (arms start ~pS:921) has note/n/s/sound/mini/stack/backtick arms but NO "bare ident bound in `bindings` → splice bound IR as root" arm. `chords2.rootNotes(2).note()` splits to root=`chords2` (not whole-expr, so pS:833 misses it) + chain; `parseRoot('chords2', …, bindings)` matches no arm → bareCode. Fix: add a bound-ident-root arm in parseRoot (before the note/n arm), returning `bindings.get(trimmed)` then letting applyChain run.
- **D-01-G3 (literal RHS opaque).** `var numChords = 4`: buildBindingMap parses RHS `4` → parseRoot('4') matches no arm → bareCode → the opaque-RHS fence (pS:~440) returns null → whole program bails. A numeric / quoted-string literal is a VALID value, not opaque. Fix options: (a) parseExpression recognises bare number/string literals as a non-opaque passthrough IR; (b) buildBindingMap treats a literal-shaped RHS as non-opaque. (a) is more correct but ripples; (b) is narrower. Needs a design call.
- **D-01-G4 (method-arg / applyChain).** `parseExpression:874` calls `applyChain(rootIR, chain, chainOffset)` with NO bindings arg. So `.slow(numChords)` / `.scale(scales.slow(numChords))` inside a chain NEVER substitutes. `-LHtBlF8peGC` needs this (numChords used in `.slow(numChords)`). This is the deepest gap: applyChain + parseTransform + every nested-arg recursion must thread `bindings`. This is the "pervasive context" refactor.

## Scope reality (the honest correction to CONTEXT)

D-01 that actually moves the dominant real-world #141 class = thread `bindings` as a **pervasive parse context** through the full recursive descent: `parseExpression → splitRootAndChain → parseRoot (all arms incl. a NEW bound-ident-root arm) → applyChain → parseTransform → nested parseExpression`. Plus the G3 literal-passthrough decision. This is a real signature + recursion refactor of the core parser, NOT "a bounded fixpoint iteration around an existing primitive." The CONTEXT D-01 design (A-1 behavior-identical refactor + A-2 fixpoint loop) is necessary but FAR from sufficient — A-2's "iterate the RHS parse" only helps if the RHS parse itself can resolve refs, which (G1/G2/G4) it cannot today.

The fixpoint is still needed (binding-references-binding ordering), but it sits ON TOP of a substitution mechanism that must first be made pervasive. Sequencing: pervasive-threading (G1+G2+G3+G4) → THEN the bounded fixpoint → THEN occurs-check/OQ1.

## Estimated blast radius

- G1: 1 call site (+bindings arg + ensure recursion carries it).
- G2: 1 new arm in parseRoot (~5 lines, mirrors pS:833 logic but for root token).
- G3: 1 design decision + ~3-10 lines (literal passthrough).
- G4: the big one — `applyChain` signature + every internal `parseExpression`/`parseTransform` recursion gains a `bindings` param threaded through. Multiple call sites; the loc/offset contract (PV49 additivity) must hold at each. This is where "minimal change" was wrong.

Editor 1564/1564 + parity-corpus 50/50 still hold (Wave 0 only; no D-01 code written — investigation only, observation over inference).

## Decision required (escalated to user)

D-01 is bigger than CONTEXT scoped. Options:

- **(A) Full pervasive-threading D-01 in 20-16** (G1+G2+G3+G4 + fixpoint + occurs-check). Correct and complete; closes the dominant class. Largest change; the core parser's recursion all gains a `bindings` context. Re-gate after.
- **(B) Reframe: 20-16 = Wave 0 + Wave B/C (#142/#143/#144, D-01-independent) + fresh measurement; D-01 → dedicated 20-17** with pervasive-threading as its explicit design (not "minimal change"). Most honest given the cascade; ships Wave 0 + the cheap strip/root wins now; D-01 gets the design attention it needs.
- **(C) Minimal D-01 (G1+G2 only, skip G3/G4)** — closes `--LsnlgQ6osk`-like chain-arg/root-ident cases but NOT `-LHtBlF8peGC` (needs G3+G4). Partial, but bigger than γ-3. Re-gate to measure exactly which repros it moves.

Wave 0 remains shipped on-branch (committed ff93c65). No D-01 source written.

---

# WAVE B — Task B-1 OQ2 OBSERVATION (2026-05-18, REFRAMED scope)

**OQ2 DECISION: #142 needs NO code change — FIXTURE-ONLY.** Established by
direct observation of the EXISTING `stripParserPrelude` (pS:126) run via
vite-node against the VERBATIM issue-body repros, NOT by inference.

## Cited verbatim from `gh issue view 142`

> 1. `samples({ o0: 'samples/ocean/ocean_00.wav', o1: ... })` — multi-line
>    **object-literal** arg (sample `-P398OK_eprf`).
> 2. `samples('github:yaxu/clean-breaks')` /
>    `samples('https://raw.githubusercontent.com/...')` co-occurring with
>    `var cpm=30; stack(...)` (samples `-1j62z5xjyCN`, `-6c1hEXe8Agi`,
>    `-HyFCSbuSlq5`) — here the binding (#141) is the primary blocker, but
>    the multi-line `samples(...)` prelude recognition is a secondary
>    contributor.

(Named Bakery hash `-P398OK_eprf` is NOT in the local V-1 file — the issue
body is the ground-truth fixture source, 20-15 V-2 lesson.)

## Cited verbatim from `gh issue view 143`

> ```
> typeof setDefaultVoicings !== 'undefined' && setDefaultVoicings('legacy') // ...
> // @title ...
> stack( ... )
> ```

(Named Bakery hash `-7LU6zgzViSM` is NOT local — issue body is ground truth.)

## Verbatim `stripParserPrelude` + `parseStrudel` output (observed, not inferred)

```
--- #142 single-line objlit ---
offset=80   body=<<<s("o0 o1")>>>                    parseStrudel → tag=Seq  via=undefined
--- #142 multi-line objlit ---
offset=84   body=<<<s("o0 o1")>>>                    parseStrudel → tag=Seq  via=undefined
--- #142 samples('github:…') ---
offset=36   body=<<<var cpm = 30\nstack(s("bd"))>>>  parseStrudel → tag=Code via=undefined
--- #142 samples('https://…') ---
offset=71   body=<<<s("bd")>>>                        parseStrudel → tag=Play via=undefined
--- #143 guarded boot ---
offset=0    body=<<<typeof setDefaultVoicings… [UNCHANGED]>>>  parseStrudel → tag=Code via=undefined
```

## Decision

- **#142 — code change needed: NO (fixture-only).** The EXISTING depth
  walker (pS:182-250) already brace-balances the object-literal `{…}` arg
  (single-line AND multi-line: bodies start exactly at the musical expr,
  offsets 80/84 correct) and already consumes the `samples('github:…')` /
  `samples('https://…')` string forms (offsets 36/71 correct; the
  `'github:…'` residual `var cpm = 30` Code-fallback is the #141 binding
  blocker — D-01, REMOVED to 20-17 per REFRAME — NOT a #142 strip gap).
  `samples` is already in `PRELUDE_CALL_RE` (pS:159); the multi-line depth
  walker's `{`/`[`/`(` tracking (pS:214-220) is shape-agnostic, so the
  object-literal arg was always consumed. #142's "secondary contributor"
  is closed by the existing walker; B-2 vendors a regression fixture only.
- **#143 — code change needed: YES (always, per plan).** offset=0, body
  UNCHANGED, `parseStrudel → tag=Code via=undefined`: the
  `typeof X !== 'undefined' && X(...)` line is NOT matched by
  `PRELUDE_CALL_RE` (line starts with `typeof`, not a recognised call) →
  the whole program falls to Code-fallback even though `stack( s("bd") )`
  is fully parseable. B-2 adds the second line-classifier.

Observation mechanism: a throwaway `tests/parity-corpus/_probe-b1.test.ts`
(deleted post-observation) using the proven `../../../editor/src/ir/parseStrudel`
deep-path import — byte-identical parser to CI. No source modified.
