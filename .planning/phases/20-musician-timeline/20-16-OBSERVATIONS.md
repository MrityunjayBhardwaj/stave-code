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
