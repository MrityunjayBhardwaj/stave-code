---
phase: 20-22
confidence: HIGH
researcher: anvi-researcher
created: 2026-05-26T00:00:00Z
target_issues: [141, 140]
baseline: "main 7ebcef7 — editor 1627/1627, app 417/417; N=500 offset0 = 90.4% (re-measured on current parser)"
upstream_pin: f73b3956
---

# Phase 20-22 Research — close the #141/#140 binding-ref-outside-`stack()`-bare-arg parity gap

## User Constraints (verbatim from 20-22-CONTEXT.md — SACROSANCT)

- **D-01: Textual substitution of the raw RHS text.** Store each
  literal-classified binding's raw RHS text; at arg-parse sites, replace the
  bare ident with that text BEFORE the arg is parsed. One primitive covers
  scalar + string. Matcher-pure — substitution, never evaluation. IR-subtree
  splice stays for Pattern-valued bindings used as roots; the new textual path
  is additive. (Dual-representation-by-kind option rejected.)
- **D-02: Widen `classifyLiteralRhs` to an enumerated arithmetic grammar** over
  numeric literals; substitute raw text. **STRICT enumerated operator set only
  (`/ * + -` between number tokens); NO parens, NO function calls, NO
  identifiers.** If the executor finds the strict grammar can't be bounded
  cleanly → STOP, fall back to pure-literals-only, file arithmetic as a
  follow-up.
- **D-03: Multi-offset distribution sweep (offset 0 + 100 + 250, ~150 distinct
  rows, pin `f73b3956`)** as must-not-regress floor + target gate. Dual gate, no
  bar-lowering: production exemplar(s) STRUCTURED **AND** blended sweep improves
  over baseline with zero per-slice regression.
- LOCKED prior: D-02 matcher-not-interpreter (substitute, NEVER evaluate);
  PV49 loc-fidelity additivity; PV50 stack-threaded optional `bindings`; PV52
  `via===undefined` discriminator + new-arm consumer audit.

---

## CRITICAL FINDING — the #165 class label is STALE (P70 / PK18)

**RUN, not inferred.** I imported `parseStrudel` from source (vite-node, the
same path the bakery classifier uses) and fed it (a) the four CONTEXT-named
repros, (b) all 500 rows of the offset-0 artifact, and (c) isolated sub-shapes.
The `--LsnlgQ6osk`-style ESM-crash on standalone `node require` is why probes
ran under `vitest run` (the proven import path). All probe specs were throwaway
and have been deleted.

### Observation 1 — the four CONTEXT-named repros ALL structure on current main

Using the **exact** bakery verdict discriminator (`isCodeFallback` =
`body.tag==='Code' && via===undefined`, descending one synthetic-Track level):

| hash | verdict on `7ebcef7` | top body |
|---|---|---|
| `-LHtBlF8peGC` | **structured** | `Stack{...}` |
| `-1j62z5xjyCN` | **structured** | `Code[via{m=cpm args="cpm"}]<inner Stack>` |
| `-72eEl7NwK9e` | **structured** | `Code[via{m=cpm args="cpm"}]<inner Stack>` |
| `--LsnlgQ6osk` | **structured** | `Stack{...}` |

None of the four is a Code-fallback at the verdict level today. The 20-17 / 20-18
machinery (bounded fixpoint binding map, Signal/Builder root recogniser,
`cpm`/`arrange`/`chord` arms) already lifts them past the `via===undefined`
fence. **The #165 "24 (50%)" figure was measured at an EARLIER SHA**, before
those landed. Treating "binding-ref-outside-stack = 24 fallbacks" as current fact
would be the exact P70 trap (classification-inference the empirical gate
falsifies).

### Observation 2 — current-main N=500 offset-0 re-measure: 90.4%, binding-class = 8 (not 24)

Running all 500 rows through the verdict discriminator on `7ebcef7`:

```
structured=452  fallback=48  threw=0  pct=90.4%
binding-class fallbacks (live let/const/var, no ${}, no =>): 8
```

The 90.4% matches #165 — but the **binding sub-class is 8, not 24**. The other
40 fallbacks are non-binding classes (#142 samples-obj-lit, #143 guarded-boot,
`function` decls, `await initHydra`, arrow-fn D-02-correct, `${}` template).
**The actual fixable binding repros on current main are these 8:**

| hash | first live line | true bail mechanism (observed) |
|---|---|---|
| `19iySfKDfQK5` | `let nbars = 4` (then `let aa = \`...\``, `cat`, `transpose`) | mixed: backtick-mini bindings + `cat`/`transpose` builder-root RHS → unresolved binding → occurs-check terminal |
| `1APcTv7DyEkW` | `let bpm = 172/4` | **arithmetic RHS** → `classifyLiteralRhs('172/4')=null` → unresolved → occurs-check terminal (the D-02 target) |
| `1fsSfbWlzbJo` | `cpm(120/4)` then `let main=...`, `let retrograde=main.rev()`, `stack(main,transposition)` | standalone `cpm(...)` is NOT a recognised prelude → buildBindingMap shape-fence (`finalIdx!==stmts.length-1`) |
| `2ErYTSUotoaQ` | `let cpm = 120/4;` + `samples({...})` obj-lit | arithmetic RHS **and** #142 samples-obj-lit prelude |
| `-fCGl4WEIQJD` | `samples({...})` + `const ... = arrange(...)` | #142 + `arrange`/`cat` builder-root RHS |
| `-hOLDE1gYQmP` | `setcps(0.75) //...` + `const`-heavy | trailing-comment-after-prelude + builder roots |
| `0vk9wpBvt6Nd` | `setCps(130/60); // ...` | trailing-comment after `setCps` + arithmetic-in-setter |
| `29W-EtAtwCr-` | `setcps(0.125) //...` + `const deepDrones=note(slow(4,...))` | `slow(...)` builder-root RHS |

### Observation 3 — sub-shape isolation (the bail-site map)

`classifyLiteralRhs` behaviour (observed):
```
classifyLiteralRhs("172/4")      = null     ← D-02 target
classifyLiteralRhs("121.9/60/4") = null     ← D-02 target
classifyLiteralRhs("130/60")     = null     ← D-02 target
classifyLiteralRhs("4")          = "4"       (accepted)
classifyLiteralRhs('"<0 2 4>"')  = "<0 2 4>" (accepted)
classifyLiteralRhs("2*3")        = null     ← D-02 target
classifyLiteralRhs("1 + 1")      = null     ← D-02 target
classifyLiteralRhs("foo(2)")     = null      (CORRECT — stays bareCode)
```

Per CONTEXT sub-shapes (a)-(e), observed bail points:

- **(a) string binding as function-call arg** — `var cp="<0 2 4>"; n(cp)` →
  **already structures** (`Track(Cycle)`). Binding resolves (literal string
  accepted by `classifyLiteralRhs`), `n(cp)` resolves with `cp` substituted.
  **STALE — not a gap.**
- **(b) numeric binding as method arg** — `var n=4; s("bd").slow(n)` →
  **bareCode=false**, body `Code[m=slow args="n"]<Play>`. The binding resolves
  (`4` accepted) so the program structures, **but the `.slow` arg site emits raw
  `args="n"` — the value `4` is NOT textually substituted into the wrapper.**
  Semantically lossy, verdict-structured. This is the D-01 *quality* target, not
  a verdict-flipping target.
- **(c) sub-expression root with chain** — `var scales="<C:minor>"; var n=4;
  scales.slow(n)` → **bareCode=false**, `Code[m=slow args="n"]<inner Cycle>`.
  The bound-ident-root arm (parseStrudel.ts:1248) splices the `scales` subtree;
  `.slow(n)` wraps opaque with raw `args="n"`. **STALE at verdict; D-01 quality
  gap on the arg.**
- **(d) arithmetic RHS** — `let bpm=172/4; s("bd").slow(bpm)` →
  **bareCode=TRUE** (`Track(Code)`). **This is the live verdict-flipping gap.**
- **(e) `var cpm=30` family** — `var cpm=30; stack(s("bd ~ sd ~"))` →
  **bareCode=false** (`Track(Seq)`). Numeric literal resolves; unused binding is
  fine. **STALE — not a gap.** (`-1j62z5xjyCN`/`-72eEl7NwK9e` structure for the
  same reason; their `cpm(cpm)` arg stays raw but the program is structured.)

### Observation 4 — the arithmetic bail is the OCCURS-CHECK TERMINAL, not the ref site

```
let bpm = 172/4 ; stack(s("bd").cpm(bpm))   → bareCode=TRUE
let bpm = 43    ; stack(s("bd").cpm(bpm))   → bareCode=FALSE  (43 accepted)
let bpm = 172/4 ; stack(s("bd"))            → bareCode=TRUE  (bpm UNREFERENCED!)
```

The unreferenced-but-arithmetic case still fails. **Proof:** `buildBindingMap`'s
bounded fixpoint (parseStrudel.ts:614-653) cannot resolve `bpm` — `parseExpression('172/4')`
returns bareCode AND `classifyLiteralRhs('172/4')` returns null → `bpm` never
leaves `pending` → the occurs-check terminal `if (pending.size > 0) return null`
(parseStrudel.ts:653) bails the WHOLE binding map → no binding substitution
happens → `splitRootAndChain` reads `let` as the root ident → whole-program Code
fallback. **One unresolvable binding sinks the entire program**, regardless of
whether/where it is referenced. This is the single highest-leverage lever in the
8-row set: widening `classifyLiteralRhs` to admit arithmetic clears `pending`,
the map builds, the program structures.

---

## Boundary Analysis

| Boundary | What I observed | Confidence | Source |
|---|---|---|---|
| `classifyLiteralRhs` (parseStrudel.ts:119-128) | regex `^-?\d+(\.\d+)?$ \| ^"[^"]*"$ \| ^'[^']*'$`; arithmetic → null | HIGH | RUN |
| `buildBindingMap` fixpoint + occurs-check terminal (547-659) | one unresolvable binding → `return null` → whole-program bare Code | HIGH | RUN (obs 4) |
| `applyMethod` arg sites (1763-2240) | `args` is RAW text; recognised numeric arms `parseFloat(args)`→NaN→`wrapAsOpaque`; `wrapAsOpaque(ir,method,args,callSiteRange)` does NOT consult `bindings` | HIGH | code read |
| bound-ident substitution sites (1131, 1248, 1429-1435) | substitute the **PatternIR subtree**; only fire for whole bare ident, never for an ident embedded in an arg string | HIGH | code read |
| bakery verdict (`_bakery-classify.spec.ts:34-43`) | `via!==undefined` counts as STRUCTURED — verdict only checks ONE level under Track | HIGH | code read |

---

## Technical Findings

### F1 — D-01 raw-text substitution: the binding map ALREADY carries raw text

The binding-map value is `PatternIR`. For a literal binding, `classifyLiteralRhs`
already produces `Code{via:{literal:true; raw:"<verbatim>"}}` and stores it
(parseStrudel.ts:624-639). **The raw text the arg site needs is already present
in the resolved IR node** — it is `(bindings.get(name).via as {raw}).raw` when
`'literal' in via`. D-01 does NOT require a parallel `Map<string,string>` nor a
new `{ir,rawText}` value shape. **Recommendation: option (iii) — read the raw
text off the existing literal-arm `via.raw`.** This is the leanest path and adds
ZERO consumer-audit surface (no new binding-map value shape → PV52 obligation is
limited to the existing union, already audited in 20-17 D-1c).

  - The arg-site substitution lives where the arg string is consumed BEFORE
    re-parse. Two consumer classes:
    1. **Recognised numeric/literal arms** (`fast`/`slow`/`cpm`/`euclidRot`/…):
       before `parseFloat(args.trim())`, if `args.trim()` is a bare ident in
       `bindings` whose resolved node is a literal arm, replace `args` with
       `via.raw` and re-run the numeric parse. `.slow(numChords)` →
       `.slow(4)` byte-for-byte (the named acceptance check in the
       classifyLiteralRhs docstring, parseStrudel.ts:110-112).
    2. **Opaque-wrap arms** (`wrapAsOpaque` for unrecognised methods, e.g.
       `.cpm(bpm)`): substitute the raw text into the `args` string passed to
       `wrapAsOpaque` so `via.args` reads `"43"` (well — `"172/4"` raw, never
       `43`) instead of `"bpm"`. This is the round-trip/code-invariance fix; it
       does NOT flip the verdict (already structured once the binding resolves)
       but it is required for D-01's stated semantic.

  - **The single primitive:** a helper `substituteBoundIdentInArg(args, bindings)`
    that, when `args.trim()` is exactly a bare ident present in `bindings` AND
    the resolved node is the `{literal:true; raw}` arm, returns `via.raw`;
    otherwise returns `args` unchanged. Scalar + string covered identically
    (both are literal-arm nodes). Pattern-valued bindings are NOT substituted as
    text (they have no `via.raw`) — they keep the subtree-splice path. This is
    exactly CONTEXT D-01's "one primitive covers scalar + string; subtree splice
    stays for Pattern-valued."

### F2 — PRIMARY RISK: textual substitution and loc-fidelity (PV49)

**This is the load-bearing risk the planner must resolve.**

- **20-17's IR-subtree splice preserves offsets by carrying the DEFINITION-SITE
  loc on the spliced subtree** (parseStrudel.ts:1238-1243; the chain arithmetic
  at the use site is independent of the root's internal offset). The substituted
  subtree's `loc.start` points into the binding's RHS at its definition site —
  the source text is NEVER mutated, so `src.slice(loc.start, loc.end)` still
  matches (PV49 holds by construction).

- **Textual substitution is DIFFERENT and does NOT have this property.** If we
  replace the bare ident `bpm` (3 chars) with `172/4` (5 chars) inside an arg
  string and then *re-parse that mutated string with the use-site offset*, every
  loc derived from the mutated string is computed against a string that no longer
  matches the original source — `loc.start` lands at a position that does not
  exist in the user's source, or points at the wrong characters. **A naive
  `args.replace(ident, raw)` followed by offset arithmetic against the use site
  silently breaks the loc-fidelity contract** (the 20-15/20-16 pre-mortem: "right
  tokens, wrong absolute index").

- **Mitigations (in order of preference — planner picks):**
  1. **Substitute only into value-only positions that produce NO loc-bearing
     leaf.** For recognised numeric arms (`.slow`/`.cpm`/etc.), the substituted
     text becomes a `parseFloat` operand — it produces a `Fast`/`Slow`/opaque
     node whose `loc` is the `callSiteRange` (the `.slow(...)` span in the
     ORIGINAL source), NOT a position inside the substituted text. The factor `4`
     is stored as a number, carries no loc. **Risk-free for numeric arms** — the
     substituted text never becomes a loc anchor; the tag's loc is the unchanged
     call-site range. Confirmed by reading the `fast`/`slow` arms
     (parseStrudel.ts:1778-1788): `IR.fast(n, ir, tagMeta(method, callSiteRange))`
     — loc comes from `callSiteRange`, value from the parsed number.
  2. **For opaque-wrap arms, store the raw text in `via.args` WITHOUT shifting
     any loc.** `wrapAsOpaque`'s `via.args` is a code-invariance string, not a
     loc anchor (PV37 wrapper loc = `callSiteRange`). Substituting `via.args`
     from `"bpm"` to `"172/4"` changes the round-trip text but NOT any
     `loc.start`. **Risk-free** as long as the wrapper's `callSiteRange` (the
     ORIGINAL `.cpm(bpm)` span) is kept unchanged — which it must be, since the
     range is computed before `applyMethod` (parseStrudel.ts:1730-1734) and is
     not derived from `args`.
  3. **NEVER re-parse a mutated arg string with use-site offsets to produce
     loc-bearing leaves.** If a sub-shape would require the substituted text to
     become a mini-notation atom with its own loc (e.g. `n(stringBinding)` where
     the string must `parseMini` into per-note Play leaves), substitution MUST
     carry the DEFINITION-SITE offset of the binding's RHS, exactly like the
     subtree splice — i.e. it degenerates back to the subtree-splice path. **The
     observed sub-shape (a) `n(cp)` already structures via this exact splice
     path, so no new textual re-parse-with-loc is needed for it.**

  **Conclusion:** D-01 textual substitution is loc-safe IFF it is confined to
  (1) value operands of recognised numeric arms (loc = call-site range, value =
  parsed scalar) and (2) `via.args` round-trip text on opaque wrappers (not a loc
  anchor). It is loc-UNSAFE the moment a substituted string is re-parsed into
  loc-bearing leaves at the use site. The planner must fence the primitive to
  positions (1)+(2) and explicitly forbid position-(3) re-parse — or route
  position-(3) through the existing subtree splice (which already works for the
  observed string-arg case).

### F3 — D-02 enumerated-arithmetic grammar

The STRICT closed grammar (matcher-not-interpreter — substitute raw, never
evaluate):

```
arith   := number (ws op ws number)+        ; at least one operator (a lone
                                              number already matches the
                                              existing ^-?\d+(\.\d+)?$ arm)
op      := '/' | '*' | '+' | '-'            ; the EXACT four-token set
number  := -?\d+(\.\d+)?                     ; the existing number token
ws      := [ \t]*                            ; optional inter-token spaces only
```

Precise regex (anchored, whole-string):
```js
const NUM = String.raw`-?\d+(?:\.\d+)?`
const ARITH_RHS = new RegExp(`^${NUM}(?:[ \\t]*[/*+\\-][ \\t]*${NUM})+$`)
```

- **Enumerated boundary (what is IN):** `172/4`, `121.9/60/4`, `130/60`,
  `2*3`, `1 + 1`, `60/4`, `120 / 8`. (Spaces around ops allowed; matches
  `172/4` and `120 / 4`.)
- **Explicitly OUT (stays bareCode → graceful):** parens `(1+2)/3`, calls
  `foo(2)`, idents `bpm/2`, `${}` templates, `2**3`/`%`/`<<` (not in the op
  set), trailing/leading op, empty. Each excluded shape falls through to the
  existing `null` return → unresolved binding → graceful Code (or, for the
  literal arm precedence, never downgrades a richer parse).
- **Substitute the matched text VERBATIM** (`via.raw = t`, the trimmed source
  string) — Strudel evaluates `172/4` natively at runtime; the IR records the
  raw arg, never computes `43`. This is consistent with the LOCKED D-02
  matcher-not-interpreter line and with the existing literal-arm `raw` contract.
- **STOP condition (CONTEXT-mandated):** if the executor finds the grammar
  cannot be bounded cleanly — e.g. the corpus surfaces `bpm/2` (ident operand,
  which is a SECOND binding-ref, recursive) or paren grouping that tempts
  scope-creep — STOP, ship pure-literal-only (the existing arm), file arithmetic
  as a follow-up issue. The grammar above is closed and bounded (no recursion,
  no idents, no calls); the trap is widening it to operand-idents or parens.
- **Placement:** widen `classifyLiteralRhs` to test `ARITH_RHS` alongside the
  existing `isNum`/`isDq`/`isSq`. The precedence guard at parseStrudel.ts:633-635
  (`parsedIsBareCode ? (lit ?? parsed) : parsed`) is unchanged — arithmetic RHS
  parses to bareCode, so `lit` (the new arith arm) wins, never downgrading a
  richer parse. **PV52/PV53 hold: the new `raw` is the SAME `{literal:true; raw}`
  arm shape, not a new union arm** → no new consumer-audit surface.

### F4 — verdict semantics (read before scoping)

The bakery verdict (`_bakery-classify.spec.ts`) only inspects ONE level under
the synthetic Track. A `via`-wrapped top-level body counts STRUCTURED even if the
binding value is semantically lost in a deeper opaque wrapper. **Consequence for
D-03:** the D-02 arithmetic fix DOES flip verdicts (it clears the occurs-check
terminal → whole-program Code → structured). The D-01 arg-text fix mostly does
NOT flip verdicts (those programs already structure) — it is a round-trip /
code-invariance / semantic-honesty improvement. The planner should not expect
D-01-alone to move the blended sweep %; the verdict-moving lever is D-02
arithmetic + the occurs-check interaction. Anchor D-03's "exemplar STRUCTURED"
gate on an **arithmetic-RHS exemplar** (`1APcTv7DyEkW` `let bpm=172/4`), not on a
`.slow(n)` arg-text case.

---

## Invariants

**Existing (must hold):**
- **PV49** loc-additivity at every new site. F2 is the precise application: the
  substitution primitive must NOT create loc anchors from mutated strings.
- **PV50** `bindings` is a trailing optional param, never module state. The
  arg-site primitive reads from the already-threaded `bindings` param.
- **PV52** `tag==='Code' && via===undefined` is THE bare-Code fence, byte-
  identical across ~8 consumers. The D-02 arith arm reuses the EXISTING
  `{literal:true; raw}` union arm → no new arm → PV52 obligation NOT newly
  triggered (already audited 20-17 D-1c).
- **PV53** binding substitution = pervasive optional-arg threading + bounded
  least-fixpoint. The arith widen lives inside `classifyLiteralRhs`, consumed by
  the EXISTING fixpoint loop; no new recursion site. The arg-site primitive must
  thread `bindings` (already in scope at every `applyMethod`/`wrapAsOpaque`
  caller).

**Newly relevant (this phase depends on):**
- **NEW INV candidate:** "textual raw-RHS substitution may only target value
  operands (loc = call-site range) and round-trip `via.args` (not a loc anchor);
  it may NEVER re-parse a mutated string into loc-bearing leaves at the use
  site." This is the F2 fence. If the phase ships it, codify as a PV addendum to
  PV49/PV53. (Promote only on recurrence per dharana-spec; flag as candidate.)

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Loc-fidelity break from textual substitution (F2)** | HIGH (primary) | Fence the primitive to value-operand + via.args positions; forbid mutated-string re-parse with use-site offsets; route string→mini-leaf cases through the existing subtree splice. Per-file loc-fidelity STOP gate (empty-diff vs baseline) on every commit. |
| **D-02 scope-creep into interpreter** (P70 / #140 γ-4 pre-mortem) | HIGH | Closed enumerated grammar (F3); operand-idents/parens/calls explicitly OUT; STOP→pure-literal if the corpus tempts widening. |
| **Trusting the stale #165 "24" figure** (P70/PK18) | HIGH | DONE — re-measured on current main: binding-class = 8, not 24. Anchor D-03 on observed current repros (`1APcTv7DyEkW`), not the stale label. |
| **D-01-alone shows no sweep movement** (F4) | MEDIUM | Expected — D-01 mostly improves already-structured programs. The verdict-moving lever is D-02 arithmetic. Don't bar-lower if D-01 shows 0 sweep delta; that's correct. |
| **PV52 consumer drift if value shape changes** | LOW (avoided) | Recommended F1 option (iii) reuses the existing `via.raw` — no new binding-map value shape, no new union arm. |
| **Mixed-mechanism repros** (`19iySfKDfQK5`, `-fCGl4WEIQJD`) bail on builder-root RHS (`cat`/`arrange`/`transpose`), not arithmetic | MEDIUM | OUT of scope per CONTEXT (these are #156/builder-root classes). D-02 arithmetic + D-01 will NOT close them; do not chase (P70 scope-discipline). Flag as residual in SUMMARY. |
| **`cpm(120/4)` standalone-setter shape-fence** (`1fsSfbWlzbJo`) | MEDIUM | OUT — this bails on `buildBindingMap` shape-fence (non-binding non-final statement), same class as 20-18 #158/#3, deferred to backlog. NOT a binding-RHS gap. |

---

## D-03 Multi-offset gate harness

**Confirmed usage** (parity-bakery.mjs:56-99): `pnpm parity:bakery --n N --offset M`.
`--offset M` selects the PostgREST window (`order=hash.asc&limit=N*2&offset=M`);
`--n N` is the post-trim sample target. Artifact stamp records the offset:
`samples-offset{M}-{ISO}.json` (offset 0 omits the prefix). The artifact JSON
header carries `{ stamp, UPSTREAM_SHA, column, offset, samples }`.

**Exact commands (pin `f73b3956`, ~50 distinct rows per slice → ~150 blended):**
```
pnpm parity:bakery --n 50 --offset 0
pnpm parity:bakery --n 50 --offset 100
pnpm parity:bakery --n 50 --offset 250
```

**Baseline per-slice (re-confirm at phase start — #165 numbers were a
different-SHA spot check; the N=500 offset-0 is 90.4% re-measured here):**
| slice | #165-recorded | note |
|---|---|---|
| offset 0 (N=50) | 100% | the historically-pinned lucky window |
| offset 100 (N=50) | 92% | |
| offset 250 (N=50) | 84% | |

**Blended-gate computation:** sum structured across the three 50-row slices /
150 total (each slice is a distinct hash-window — no overlap; offsets 0/100/250
on `hash.asc`). Record per-slice + blended in the SUMMARY. **Dual gate:**
(1) the arithmetic exemplar `1APcTv7DyEkW` flips bare-Code → structured (RUN
assertion), AND (2) blended-150 ≥ recorded baseline with zero per-slice
regression. **No bar-lowering** (P70/PK18): if a slice regresses, STOP and
diagnose — do not lower the floor.

**Note:** the offset-0 artifact already on disk
(`samples-distvalidate-offset0-2026-05-22...json`) is reusable for the offset-0
slice without a fresh network pull; offsets 100/250 need fresh pulls (gitignored
`.bakery-runs/`).

---

## Consumer-audit obligation (PV52)

If D-01 keeps the binding-map value as `PatternIR` and reads `via.raw` off the
existing literal arm (recommended F1 option iii), **the value shape does NOT
change** — no new `bindings.get()` consumer audit is triggered beyond the
existing ones. The `bindings.get()` / `bindings.has()` consumer sites (for
completeness):

- `parseExpression` whole-expr (parseStrudel.ts:1131-1132) — subtree splice
- `parseRoot` bound-ident root (1248-1249) — subtree splice
- `buildBindingMap` fixpoint `bindings.set` / `seen.has` (587-639)
- threaded `bindings?` param readers (no `.get`): `applyChain` (1681),
  `applyMethod` (1775), `parseTransform` (1681-1796 callers), array-element
  `parseExpression` (1478), inner chained `parseExpression` (1429-1435)

**The NEW reader** is the arg-site substitution primitive — it calls
`bindings.get(ident)` and reads `via.raw`. It MUST guard the `Code.via`
discriminated union (`'literal' in via`) before reading `raw`, and return the arg
unchanged for the opaque-wrapper arm (`via.inner` present) and for Pattern-valued
(non-`Code`) bindings. This is the single new PV52/PV53 audit point.

**If the planner instead chooses option (i) `{ir, rawText}` or (ii) a parallel
`Map<string,string>`** — then EVERY `bindings.get()` site above must be
re-audited for the new shape, and the `ReadonlyMap<string, PatternIR>` type
signature changes ripple through ~10 threaded sites (PV50/PV53 grep). **F1
recommends against this** — option (iii) is strictly leaner and avoids the
ripple.

---

## Recommended Approach (wave sequencing)

- **Wave 0 — RUN + vendor the gate oracle (DONE in research; re-confirm in
  phase).** Re-measure the three slices on `7ebcef7` to pin the blended baseline.
  Vendor the arithmetic exemplar `1APcTv7DyEkW` (`let bpm=172/4`) and one
  arg-text exemplar as permanent regression fixtures
  (`packages/app/tests/parity-corpus/bakery-141-arith-rhs.strudel`,
  `bakery-141-binding-arg-text.strudel`). The per-row probe pattern in this
  research (vite-node import of `parseStrudel` + the `isCodeFallback`
  discriminator) is the oracle shape.
- **Wave A — D-02 arithmetic widen (the verdict-mover).** Add `ARITH_RHS` to
  `classifyLiteralRhs` (F3). This is a single-function additive change consumed
  by the existing fixpoint; reuses the `{literal:true; raw}` arm (no new union,
  no PV52 ripple). Acceptance: `1APcTv7DyEkW` flips structured; the `arith_unused`
  occurs-check case resolves. STOP-gate: if the corpus surfaces operand-idents
  → ship pure-literal-only, file follow-up.
- **Wave B — D-01 arg-site textual substitution (semantic/round-trip honesty).**
  The `substituteBoundIdentInArg(args, bindings)` primitive (F1 option iii),
  fenced to value-operands + `via.args` (F2). Wire into the recognised numeric
  arms (before `parseFloat`) and `wrapAsOpaque` callers. Acceptance:
  `.slow(numChords)` → `.slow(4)` byte-for-byte; `.cpm(bpm)` via.args carries the
  raw RHS, not `"bpm"`. Per-file loc-fidelity empty-diff STOP gate.
- **Wave C — D-03 dual gate + CI fixtures + per-file loc-fidelity STOP gate.**
  Run the three-slice sweep, compute blended-150, assert no per-slice
  regression, assert exemplar flip. Vendor fixtures (Wave 0). Record per-slice +
  blended + stamp + SHA in SUMMARY (V-4 discipline).
- **Build hygiene (P68):** one-shot `pnpm --filter @stave/editor build` +
  minification-stable literal grep on `dist/index.js` before every editor-src
  commit; `pnpm --filter @stave/editor dev` (tsup --watch) running while editing.

---

## Confidence + Open Questions for the planner

**Overall confidence: HIGH** — every behavioral claim is RUN (vite-node
`parseStrudel` import + the exact bakery verdict discriminator), not cited. The
stale-classification correction (Obs 1+2) is the most consequential finding and
is directly observed.

**Open questions:**
1. **D-03 baseline drift.** The #165 per-slice numbers (100/92/84) were a
   different-SHA spot check; the binding-class has shrunk 24→8 on current main.
   The planner should re-run all three slices at phase start to pin the TRUE
   current blended baseline before setting the target — the D-02 arithmetic fix
   may move the blended % less than #165's "→95.2%" projection implies, because
   most of the 24 are already closed.
2. **Arithmetic frequency in offsets 100/250.** I measured the binding-class on
   offset-0 (8 rows). The arithmetic sub-shape's frequency in the 100/250 windows
   is unmeasured (those artifacts aren't on disk). The planner's Wave 0 sweep
   will surface it; if arithmetic is rare across all three slices, D-02's
   verdict-movement may be small — but it is still the correct fix for the class
   and a permanent fixture wall.
3. **Mixed-mechanism rows.** `19iySfKDfQK5`/`-fCGl4WEIQJD` bail on `cat`/
   `arrange`/`transpose` builder-root RHS, not arithmetic. CONTEXT scopes these
   OUT (#156/builder territory). Confirm the planner agrees they stay residual
   and are not chased (P70 scope discipline).
4. **`via.args` round-trip vs. verdict.** D-01's arg-text substitution improves
   round-trip/code-invariance but does NOT flip verdicts. Confirm the planner
   accepts D-01 landing with ~0 sweep delta as success (it satisfies the LOCKED
   D-01 semantic), gated instead on the byte-for-byte `.slow(4)` acceptance test.
