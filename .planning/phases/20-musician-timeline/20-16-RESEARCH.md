---
phase: 20-16
confidence: HIGH
researcher: anvi-researcher
created: 2026-05-18
consumed_by: anvi-planner
closes: ["#140", "#141", "#142", "#143", "#144"]
spun_out: ["#147"]
upstream_pin_sha: f73b395648645aabe699f91ba0989f35a6fd8a3c
baseline_parity: "72.0% (36/50, N=50, 2026-05-15T23-13-07Z)"
---

# Phase 20-16 Research — close the next Bakery parser-gap classes

Every behavioral claim cites `file:line` in
`packages/editor/src/ir/parseStrudel.ts` (abbreviated `pS:`) or the named
file. Source read directly, not inferred.

## User Constraints (verbatim from 20-16-CONTEXT.md — LOCKED, do not relitigate)

- **D-01**: generalize `buildBindingMap` substitution (#140 + #141, dominant
  6/14 class) as a **monotone least-fixpoint over a substitution lattice,
  stratified by an occurs-check** (Datalog *discipline*, NOT engine/
  evaluator). Matcher line: *least-fixpoint term SUBSTITUTION, never term
  EVALUATION*. Guarantees-by-construction: total, PTIME, order-independent
  (D-02 dissolves), cycle/occurs-check → graceful Code bail. The opaque-RHS
  fence (`buildBindingMap` pS:388-392) is KEPT. Destructuring/arrow-fn/`${}`
  RHS stay correct Code-fallback. HARD GATE: ~30-line prototype over 6
  measured #141 repros + 1 synthetic cyclic + dup-key, BEFORE impl.
- **D-02**: no `var` hoisting; redeclaration (dup key) → graceful Code bail
  via functional-dependency check.
- **D-03**: `samples({...})` / `samples('github:…')` / `samples('https://…')`
  + #143 guarded `typeof X!=='undefined' && X(...)` → STRIP-ONLY (extend
  multi-line boot-call depth walker). Sample-name capture OUT → #147.

## Boundary Scan (dharana)

The phase touches exactly three boundaries on the pure-`parseStrudel` →
`propagation.ts:73-87` → `patternIR` → `collect` → `irEvents` →
MusicalTimeline + IR Inspector + `toStrudel` consumer chain. A
silently-wrong tree poisons all four consumers at once — this is why the
matcher-not-interpreter line is load-bearing (CONTEXT, 20-15-SUMMARY:20-24).

| Boundary | What it transforms | What I DO NOT know → resolved by | Confidence |
|---|---|---|---|
| **B1 stage-0.5 binding boundary** (`buildBindingMap` pS:359, call site pS:452-466) | body string → `{bindings: Map<name,PatternIR>, finalExpr, finalOffset}` or `null`. RHS parsed at definition-site offset (pS:386-387) so `loc` stays valid against ORIGINAL source. | the fixpoint surface: today substitution is single-pass map-build then point-substitution. Generalizing to a least-fixpoint over the binding map. **RESOLVED below from source.** | HIGH (read pS:359-404, 452-468, 779-784, 1001-1010) |
| **B2 stage-1 prelude boundary** (`stripParserPrelude` pS:126, `PRELUDE_CALL_RE` pS:158-159, depth walker pS:182-250) | code string → `{body, offset}`, recognised boot calls (incl. multi-line, depth-tracked) stripped. | whether the existing depth walker already brace-balances object-literal args (#142) and whether `typeof X && X(...)` (#143) is line-classifiable. **RESOLVED below.** | HIGH (read pS:126-257) |
| **B3 root-recognition boundary** (`splitRootAndChain` pS:1855, `parseRoot` pS:837) | trimmed expr → `{root, chain}`; root → PatternIR. | how `("...")` parenthesized-string root + leading-dot chain fails. **RESOLVED below.** | HIGH (read pS:1855-1904) |

**Boundary-pair (THEIR side):** the parity-corpus vitest gate
(`parity.test.ts`) **strips `loc`** via `normalize.ts` — it is BLIND to
offset drift by construction (`loc-fidelity.test.ts:11-16`). The
loc-fidelity harness is the complementary gate that slices each node's
`[start,end]` out of ORIGINAL source and snapshots the token text
(`loc-fidelity.test.ts:18-30`). **Any loc-fidelity-only diff = silent
offset drift = the phase pre-mortem = STOP.**

---

## D-01 Fixpoint Surface — grounded design

### How substitution works TODAY (γ-3, the thing being generalized)

There are exactly **two** substitution sites, both gated on the
`bindings` map being threaded:

1. **Whole-expression bare-ident** — `parseExpression` pS:779-784: if the
   *entire* trimmed expr is a bare identifier present in `bindings`,
   return `bindings.get(id)` directly (definition-site subtree, loc
   preserved).
2. **`stack()` bare-ident arg** — `parseRoot` pS:1001-1010: each
   `stack(...)` arg is parsed via
   `parseExpression(a.value, innerAbsOffset + a.offset, undefined, bindings)`.
   The bare-ident case folds back into site (1) through the recursion.

`bindings` is built ONCE in `buildBindingMap` (pS:359-404): split
top-level statements (pS:290-355), match each against `BINDING_RE`
(pS:357 — `/^(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]+)$/`,
**`var` is ALREADY in the regex**), parse each RHS via
`parseExpression(rhs, rhsOffset)` **with NO bindings arg** (pS:387 — this
is the gap: a RHS that references an earlier binding is NOT resolved
because the map isn't threaded into the RHS parse), store in the map.

**The γ-3 limitation, exactly:** the RHS parse at pS:387 passes no
`bindings`. So `const beat = sound(rp1)...` parses `rp1` as a bare ident
→ bare Code → the **opaque-RHS fence at pS:388-392 returns `null`** → the
*whole program* falls to Code. This is why #141's transitive cases
(`--LsnlgQ6osk`, `-CyO42BOyp5a`, `-L13nBhrqGR_`, `-LHtBlF8peGC`) fail.

### The minimal change to make it a least-fixpoint

**Concrete fact/rule shape (Datalog discipline, NOT a Datalog engine):**

- A **fact** is a resolved binding: `resolved(name) :- PatternIR` where
  the IR contains no unresolved bound-ident leaf.
- A **rule** is: `resolved(name)` iff `parseExpression(rhs[name],
  rhsOffset[name], undefined, currentResolvedMap)` returns a
  non-bare-Code IR in which every bound identifier it referenced was
  already in `currentResolvedMap`.
- The **lattice** is the powerset of resolved names ordered by inclusion;
  ⊥ = ∅, the immediate-consequence operator T adds every name whose RHS
  resolves given the current set. Monotone (adding facts never removes
  them) → least fixpoint exists and is reached in ≤ N iterations
  (PTIME — CONTEXT D-01 guarantee).

**Smallest code delta (surface only — NOT proposing code):** replace the
single forward pass over `stmts` in `buildBindingMap` (pS:370-394) with a
**bounded outer loop** (≤ N iterations, N = binding count) that re-attempts
each still-unresolved binding's RHS parse, threading the *partially
resolved* map into the RHS `parseExpression` call (the `bindings` arg at
pS:387 changes from absent to the in-progress map). `parseExpression` is
**ALREADY re-entrant with a bindings arg** (pS:771 signature, pS:779-784
whole-ident substitution, pS:1009 stack-arg threading) — the substitution
machinery exists; only the RHS parse loop needs to iterate.

This is the key grounded fact for the planner: **the substitution
primitive is already built and threaded; D-01 is a fixpoint *iteration*
around the existing RHS parse, plus an occurs-check and a dup-key check.
It is NOT a new evaluator.**

### Occurs-check (cycle handling — CONTEXT D-01 guarantee)

A binding whose RHS still references an unresolved name after N iterations
is non-stratifiable (`a→b, b→a`, or `a→a`). Detection: after the bounded
loop, if any binding remains unresolved (its RHS parse still returns
bare-Code with an unresolved ref) → the existing **opaque-RHS fence at
pS:388-392 fires unchanged → whole-program graceful Code bail.** The
occurs-check is therefore **the existing fence, now reached only after
the fixpoint cannot make progress** — not a new special case. This is the
textbook answer the CONTEXT names.

### Dup-key / functional-dependency check (D-02 redeclaration)

ALREADY PRESENT and must be PRESERVED: `if (bindings.has(name)) return
null` at **pS:382-383**. Two facts for one key → binding relation is not
a function → whole-program Code bail. The fixpoint generalization MUST
keep this check firing on first duplicate (it currently runs inside the
single pass; under the iterated loop it must still reject a duplicate
*name*, not a re-attempt of the *same* binding — the planner must
distinguish "re-iterating binding i" from "binding i and binding j share
a name").

### Offset/loc preservation when splicing a sub-tree (the pre-mortem gate)

The RHS is parsed at its **own definition-site absolute offset**:
`rhsOffset = offset + rhsStartInText` (pS:385-386), where `offset` is the
statement's absolute offset from `splitTopLevelStatements` (pS:309 —
`baseOffset + segStart + lead`, additive from ORIGINAL source). When the
resolved subtree is spliced into a hole (a `stack` arg or whole-expr
ident), **the spliced subtree carries its definition-site loc unchanged**
— click-to-source lands on the DEFINITION (R6, pS:276-277, 1007). This is
correct and must be preserved: the fixpoint does NOT re-offset spliced
subtrees; it reuses the already-correctly-offset IR from the map. **The
loc-fidelity harness is the gate that proves no drift occurred** (see
Verification).

### Which existing fences STAY (Chesterton — pS:382-398)

The fixpoint generalizes *where* substitution applies and *when*
resolution iterates. It MUST NOT remove any of:

| Fence | Line | What it bails on | D-01 disposition |
|---|---|---|---|
| Dup-key / redeclaration | pS:382-383 | `bindings.has(name)` | **KEEP** — functional-dependency check (D-02) |
| Opaque-RHS | pS:388-392 | RHS parses to bare Code (`tag==='Code' && via===undefined`) | **KEEP** — now also serves as the occurs-check terminal (cycle → still-bare after fixpoint → bail) |
| Not "bindings* then one expr" — final-expr-not-last | pS:395-398 | `finalIdx===-1` (all bindings, no expr) OR `finalIdx !== stmts.length-1` (trailing binding after the final expr) | **KEEP** — shape constraint, orthogonal to resolution order |
| `< 2` statements | pS:366 | need ≥1 binding + 1 final expr | **KEEP** |
| Destructuring / non-single-ident LHS | pS:357 `BINDING_RE` `([A-Za-z_$][\w$]*)` | `{a}=`/`[a]=` won't match group 1 → `bm` null → treated as final expr → shape fence | **KEEP** — correct Code-fallback, not a gap (CONTEXT "Out") |
| Arrow-fn / `${}` RHS | pS:388-392 via parseExpression returning bare Code | RHS is `()=>...` or backtick `${}` → bare Code → opaque fence | **KEEP** — D-02/D-04 correct Code-fallback |

P67 discrimination (`tag==='Code' && via===undefined` = bare-Code;
Code-with-`via` = structured) at pS:388-389, 460-461, 805-806 is the
load-bearing predicate; it is correct as-is and must not be weakened.

---

## Lokāyata HARD GATE — repro acquisition path (CONCRETE)

**The 6 measured #141 repros are LOCALLY AVAILABLE — no re-run needed.**

File:
`packages/app/tests/parity-corpus/.bakery-runs/samples-2026-05-15T23-13-07-584Z.json`
(87 176 bytes, gitignored per `.gitignore:52-56`). Structure verified:
top keys `{stamp, UPSTREAM_SHA, column, samples}`; `stamp =
"2026-05-15T23-13-07-584Z"`, `UPSTREAM_SHA =
"f73b395648645aabe699f91ba0989f35a6fd8a3c"`, `column = "code"`;
`samples` is a 50-element array of `{hash, code}`.

All 6 repro IDs present, looked up by the **`hash`** field (NOT `id`):

| hash | code len | shape (read from source) |
|---|---|---|
| `--LsnlgQ6osk` | 1071 | `setcps(1)` + `const rp1 = "<sd hh>".fast(...)` + `const beat = sound(rp1)...` + `const az2 = ...` + `const chords2 = …` — **transitive: RHS references earlier binding (`rp1` inside `sound(rp1)`)** |
| `-1j62z5xjyCN` | 1979 | `var cpm = 30;` + **`samples('github:yaxu/clean-breaks')`** + `stack(...)` — primary blocker is the multi-line `samples('github:…')` strip (#142) + dead `var cpm` binding; NOT transitive |
| `-72eEl7NwK9e` | 1462 | `var cpm = 28;` + `stack(...)` — **dead numeric binding kills whole program via opaque-RHS fence** (`28` → bare Code → pS:388-392 null). #141-class |
| `-CyO42BOyp5a` | 662 | all-`const`, RHS `sound(...)`/`note(...)`/`stack(...)` (structured), final `stack(drum,clap,perc,bass,note(...)).cpm(135/4)` — γ-3 should partly work; OPEN Q below |
| `-L13nBhrqGR_` | 362 | `const polyrhythm = "...".s().steps(12)` etc., final `"...".steps(1).pick({polyrhythm,polymeter,both})` — **bound idents inside an OBJECT-LITERAL arg `.pick({...})`, NOT a stack arg** |
| `-LHtBlF8peGC` | 929 | `var chordProgression="..."` etc., `stack( n(chordProgression).s(...)... )` — **bound ident as a FUNCTION-CALL arg `n(chordProgression)`, NOT a bare stack arg** |

**Extraction command for the planner's ~30-line prototype** (no network):
```
node -e "const d=require('./packages/app/tests/parity-corpus/.bakery-runs/samples-2026-05-15T23-13-07-584Z.json'); for(const h of ['--LsnlgQ6osk','-1j62z5xjyCN','-72eEl7NwK9e','-CyO42BOyp5a','-L13nBhrqGR_','-LHtBlF8peGC']) require('fs').writeFileSync('/tmp/repro'+h.replace(/[^A-Za-z0-9]/g,'_')+'.strudel', d.samples.find(x=>x.hash===h).code)"
```
The prototype must import `parseStrudel` from the editor SOURCE path
(`../../../editor/src/ir/parseStrudel`) under vite-node — the
`@stave/editor` barrel crashes standalone node via `@strudel/draw →
gifenc` CJS/ESM (documented `_bakery-classify.spec.ts:11-18`,
`parity.test.ts:31-38`). Use the same import the classifier uses.

**Prototype must confirm (CONTEXT D-01 HARD GATE):**
(a) the 6 ground to **non-bare-Code** structured trees (use the
`isCodeFallback` discriminator at `_bakery-classify.spec.ts:34-46`:
unwrap synthetic `Track('d1',body)`, body is fallback iff
`tag==='Code' && via===undefined`);
(b) a synthetic `const a=b; const b=a; stack(a,b)` bails to graceful Code
via the occurs-check terminal (opaque-RHS fence reached after fixpoint);
(c) a synthetic `var x=n("0"); var x=n("1"); stack(x)` bails via the
dup-key check (pS:382-383).
If the prototype fails, the core assumption is wrong → redesign before
implementing.

**Caveat the planner must note:** `-1j62z5xjyCN` and `-72eEl7NwK9e` are
NOT pure D-01 wins — `-72eEl7NwK9e`'s only binding is `var cpm=28;` (a
dead numeric never referenced); under D-01 its RHS `28` still parses to
bare Code → opaque-RHS fence → bail UNLESS the final `stack(...)` resolves
without needing `cpm`. This is a **dead-binding** sub-case: the
opaque-RHS fence (pS:388-392) currently kills the whole program when ANY
binding RHS is opaque even if that binding is never referenced in the
final expr. The planner must decide (OPEN Q1) whether D-01's "skip
unreferenced opaque bindings" is in-scope (it would close `-72eEl7NwK9e`
and the dead-`var cpm` half of `-1j62z5xjyCN`) or whether those two are
classified as #142-blocked (their `samples('github:…')` / strip path is
the real fix vehicle). The 6-repro prototype will reveal which.

---

## #142 / #143 Strip Walker Surface — minimal extension

`stripParserPrelude` (pS:126-257) already does a **full
paren/brace/bracket + string-aware depth walk across newlines**
(pS:182-250). It tracks `(`/`[`/`{` as depth-up (pS:214-219),
`)`/`]`/`}` as depth-down (pS:220-237), strings/templates as opaque
(pS:208-213), and closes a call when depth returns to 0 after a `(` was
seen (pS:226-235), consuming a trailing `;` (pS:228-230). **So a
multi-line `samples({ o0:'...', o1:'...' })` object-literal arg is
ALREADY brace-balanced by the existing walker** — the only gate is the
LINE classifier `PRELUDE_CALL_RE` at **pS:158-159**:
`/^[ \t]*(?:samples|useRNG|setcps|setCps|setcpm|setCpm|setVoicingRange|initAudio|aliasBank)\s*\(/`.

- **#142 `samples({...})` / `samples('github:…')` / `samples('https://…')`:**
  `samples` is ALREADY a recognised token (pS:159). The regex matches
  `^[ \t]*samples\s*\(` regardless of the arg shape — so a `samples({...})`
  or `samples('github:...')` line **is already classified and the depth
  walker already brace-balances it.** The grounded question for the
  planner: **does #142 actually need a code change at all, or is it
  already stripped and the real blocker is the co-occurring `var`
  binding (#141)?** Evidence: `-1j62z5xjyCN` has `samples('github:...')`
  AND `var cpm=30;` — the issue text itself (#142) says "here the binding
  (#141) is the primary blocker... multi-line `samples(...)` is a
  *secondary* contributor". OPEN Q2: the planner MUST run the existing
  `stripParserPrelude` against the literal `samples({...})` repro
  (`-P398OK_eprf`, named in #142 — but that hash is NOT in the V-1 file;
  re-run or synthetic needed) to determine whether the walker already
  handles it. The narrow risk: a `samples('github:...')` whose call spans
  to a line that does NOT end at depth 0 (e.g. trailing chain) — but
  boot `samples(...)` calls are statements, not chained.
- **#143 guarded boot expr `typeof X !== 'undefined' && X(...)`:** this is
  **NOT** matched by `PRELUDE_CALL_RE` (the line starts with `typeof`, not
  a recognised call token). The minimal extension is a **second line
  classifier** recognising the exact guarded-call shape
  `^[ \t]*typeof\s+\w+\s*!==?\s*['"]undefined['"]\s*&&\s*\w+\s*\(` (the
  same shape the V-1 classifier already detects at
  `_bakery-classify.spec.ts:54`). Once classified, the EXISTING depth
  walker (pS:182-250) consumes the `&& X(...)` call to depth 0 unchanged.
  This is a **recognition extension, not evaluation** (issue #143 scope
  note confirms). Repro: `-7LU6zgzViSM` ("Doubly-Linked Liszt", named in
  #143) — NOT in the V-1 file; synthetic from the issue body
  (`typeof setDefaultVoicings !== 'undefined' && setDefaultVoicings('legacy')`)
  is the fixture source per BAKERY-FIXTURES provenance discipline (use
  the issue's VERBATIM repro — 20-15 V-2 lesson, `_bakery-classify` /
  PV49 alias corollary).

**R2 anti-drift (CONTEXT, BAKERY-FIXTURES:30-45, krama PK16 "Common
violation"):** the prelude skip-set is HAND-MAINTAINED (no programmatic
cross-ref — upstream not vendored). Any new recognised shape needs (a) a
code comment citing the upstream file + Codeberg SHA `f73b3956`
(pattern: pS:130-157 setter-family provenance block), and (b) **one CI
fixture per shape** (`bakery-142-samples-objlit.strudel`,
`bakery-143-guarded-boot.strudel`) auto-discovered by
`parity.test.ts`/`loc-fidelity.test.ts` like the existing 8.

---

## #144 Parenthesized-root Surface — narrowest fix

`splitRootAndChain` (pS:1855-1904) handles exactly three root shapes:
`"..."` bare-string (pS:1858-1869), `` `...` `` backtick (pS:1870-1886),
or identifier-then-`(...)` (pS:1887-1898). A leading **`(`** falls into
the `else` identifier branch (pS:1887): `/[a-zA-Z0-9_$]/` skip consumes
nothing (`(` is not an ident char), then pS:1892 checks `expr[i] === '('`
→ true → `findMatchingParen` (pS:1946) returns the close of `("...")` →
`root = "(\"...\")"`, `chain = ".mul(60).freq()..."`. So `root` is
`("1*1, ... 16*16")` — `parseRoot` (pS:837) has **no arm for a
parenthesized-string root**: none of the `note|n` (pS:869), `s|sound`
(pS:890), `mini` (pS:909), loose-recursive (pS:937), `stack` (pS:988)
regexes match `(` at position 0 → falls through to the bare
`IR.code(trimmed)` fallback. → whole-expr Code (`--cHhfOZ6ON1`).

**Narrowest fix surface (CONTEXT: ONLY `( <string-literal> )`, NOT
arbitrary parenthesized JS):** a new `parseRoot` arm matching
`/^\(\s*("[^"]*"|`[^`]*`)\s*\)/` — strip the wrapping parens, recurse
the inner string literal through the existing bare-string / backtick root
logic (the inner `"1*1, ..."` is a plain mini string → `parseMini`). The
leading-dot multi-line chain continuation is **already handled** —
`applyChain` walks `.method(...)` runs and `splitRootAndChain` already
sliced the chain correctly at pS:1895-1902 (the `(` branch's
`findMatchingParen` + `expr.slice(i)`). The ONLY gap is the
`parseRoot` recognition of `( <string-lit> )` as a mini-root. **Offset
math:** the inner string starts at `(`-index + 1 + leading ws within the
parens; thread `baseOffset + leadingWs + <inner-quote-idx+1>` exactly as
the existing `note`/`s` arms do (pS:872-873, 892-893) so loc stays valid.

Repro `--cHhfOZ6ON1` — NOT in the V-1 file; synthetic from issue #144's
verbatim body is the fixture (`bakery-144-paren-root.strudel`).

---

## Verification Substrate (PK17 step 6) — exact commands + STOP gate

Baseline gates (CONTEXT, 20-15-SUMMARY): editor **1564/1564**,
parity-corpus **50/50** (25 files × 2 specs), real-world **72.0% N=50 sha
f73b3956 dated 2026-05-15T23-13-07Z**, loc-fidelity full-corpus
empty-diff.

| Gate | Command (from repo root) | Pass criterion |
|---|---|---|
| Editor suite | `pnpm --filter @stave/editor test` | 1564+ /1564+ (grows with new tests; never < 1564) |
| Parity-corpus + loc-fidelity (CI gate) | `pnpm --filter @stave/app test` | 50/50+ (parity.test.ts + loc-fidelity.test.ts + the inert `_bakery-classify` self-skips). **loc-fidelity diff MUST be empty** |
| Build hygiene (P68/PV48, BEFORE each editor-src commit) | `pnpm --filter @stave/editor build` then `grep -c <newSymbol> packages/editor/dist/index.js` | grep count > 0 (tsup --watch dies silently on DTS failure — P68) |
| Real-world re-measure (PK17 step 6 — FRESH sample, network) | `pnpm parity:bakery` (optionally `--n 50`) | new % materially > 72.0%; cite N + stamp + UPSTREAM_SHA from the printed footer. **FRESH rows — never re-measure on the V-1 file you prototyped against (PK17: "step 6 = FRESH ~50-sample re-measure, NEVER re-measure on samples you fixed for")** |

**`pnpm parity:bakery`** (`parity-bakery.mjs`) pulls FRESH live
`code_v1` Supabase rows, writes a new dated/SHA'd JSON to
`.bakery-runs/` (gitignored), and invokes the classifier spec via
`pnpm --filter @stave/app exec vitest run --config
vitest.bakery.config.ts` with `BAKERY_SAMPLES`/`BAKERY_RESULT` env
(`parity-bakery.mjs` tail). Exit 0 on network success regardless of % —
it is a measurement tool, not a gate. Network failure → non-zero, do NOT
fabricate a % (`parity-bakery.mjs:main().catch`).

**THE pre-mortem STOP gate (CONTEXT, loc-fidelity.test.ts:1-30):**
`parity.test.ts` strips `loc` via `normalize.ts` → it is BLIND to offset
drift. `loc-fidelity.test.ts` slices every node's `[start,end]` out of
ORIGINAL source and snapshots the token text. **A walker reroute that
shifts absolute offsets but consumes the right tokens leaves parity GREEN
and loc-fidelity RED. If the full-corpus loc-fidelity diff is non-empty
AND the only change is loc-fidelity (parity unchanged) → that is silent
offset drift → STOP, do not commit, return to diagnosis.** Run before
AND after the binding-fixpoint change and the strip-walker change.

**Permanent fixtures to vendor (PK17 step 6 / BAKERY-FIXTURES
discipline):** distil minimal repros from #140–#144 into
`bakery-140-binding-transitive.strudel`,
`bakery-142-samples-objlit.strudel`, `bakery-143-guarded-boot.strudel`,
`bakery-144-paren-root.strudel` (#141 is the frequency evidence for
#140, covered by the #140 fixture; one fixture per CLOSED class). Each is
auto-discovered by `parity.test.ts`/`loc-fidelity.test.ts` and asserts
structured (not bare-Code) IR. Use the issue's VERBATIM repro (20-15 V-2
lesson: the ad-hoc paraphrase missed the `sound`-alias gap).

**NEW fallback classes at re-measure → BACKLOG issues, NOT fixed** (D-03
scope discipline, CONTEXT "Verification"). The classifier
(`_bakery-classify.spec.ts:48-67`) prints them; file an issue per
AnviDev, do not fix in 20-16.

---

## Open Questions the Planner MUST Resolve

1. **Dead-binding sub-case (HIGH — blocks 2 of 6 repros).** The
   opaque-RHS fence (pS:388-392) kills the WHOLE program when ANY binding
   RHS is bare-Code, even if that binding is never referenced in the
   final expr (`var cpm=28; stack(...)` → `-72eEl7NwK9e`,
   `-1j62z5xjyCN`). Is "skip/ignore unreferenced opaque bindings" in
   D-01's scope (it would close these two via the fixpoint never needing
   them), or are these two classified as #142-blocked and the fence stays
   exactly as-is? The CONTEXT keeps the opaque-RHS fence "exactly as
   γ-3"; relaxing it for *unreferenced* bindings is arguably a fixpoint
   property (a binding the least-fixpoint never needs to resolve the
   final expr is not opaque-relevant) — but this widens blast radius.
   **The 6-repro prototype (HARD GATE) will reveal which repros need
   this; resolve the scope call from the prototype's observed results,
   not from inference.**
2. **#142 — is a code change even needed?** `samples` is already in
   `PRELUDE_CALL_RE` (pS:159) and the depth walker already brace-balances
   `{...}` (pS:214-237). The planner must run the existing
   `stripParserPrelude` against a literal `samples({ o0:'...' })`
   multi-line repro (synthetic or re-run for `-P398OK_eprf`) and OBSERVE
   whether it already strips. If it does, #142 is closed by the #141
   binding fix alone (the co-occurring `var` was the real blocker) and
   only a regression FIXTURE is needed. **Observe, do not infer.**
3. **`-CyO42BOyp5a` why-fallback.** All-`const` with structured RHS and
   bare-ident stack args — γ-3 *should* substitute `drum,clap,perc,bass`.
   The likely blocker is `note(...)`/`sound(...)` args (not bound idents,
   parse directly — fine) OR the `.cpm(135/4)` arithmetic chain arg OR
   the `const perc = stack(...)` RHS being multi-line (does
   `splitTopLevelStatements` pS:290-355 keep it one statement? depth-aware
   `\n` split at pS:346 only flushes at depth 0 — a multi-line `stack(`
   keeps depth>0 so it stays one statement; should be OK). The planner
   must run γ-3 against `-CyO42BOyp5a` and observe the actual failure
   before designing — it may already pass under D-01's RHS-threading, or
   reveal a 4th micro-gap.
4. **Fixpoint iteration vs. dup-key interaction.** Under the bounded
   re-iteration loop, `bindings.has(name)` (pS:382-383) must reject a
   duplicate *declaration* but NOT a *re-attempt* of the same binding
   across fixpoint iterations. The planner must define the iteration
   structure so the functional-dependency check keys on declaration
   identity (statement index), not on map-membership-during-iteration.
5. **Statement-order independence verification.** D-01 claims
   order-independence dissolves D-02. The prototype's synthetic set MUST
   include a forward-ref case (`stack(a); ... ` — actually `const a=b;
   const b=n("0"); stack(a)`) to OBSERVE that the fixpoint resolves it
   correctly (not just "should"). One direct observation, not inference.

## Catalogue updates expected (CONTEXT, for planner awareness)

- **vyapti (NEW)** — "binding resolution is a least-fixpoint term
  SUBSTITUTION, never term EVALUATION; total/PTIME/order-independent by
  construction; cycle → occurs-check terminal = the kept opaque-RHS
  fence". PV49 span addendum if a new line-classifier is added for #143.
- **krama PK16** — stage-0.5 amendment: `buildBindingMap` is now a
  bounded fixpoint loop (≤ N iterations) over the RHS parse, not a single
  forward pass; the opaque-RHS fence is reached only post-fixpoint.
- **PK17** — this cycle's measured numbers (fresh % + N + stamp + SHA).
- **hetvabhasa** — if the dead-binding sub-case (OQ1) or the
  fixpoint/dup-key interaction (OQ4) takes >1 attempt, add the pattern.

---

## RESEARCH COMPLETE

**Output:** `.planning/phases/20-musician-timeline/20-16-RESEARCH.md`
**Confidence:** HIGH (every behavioral claim grounded to `pS:`/named
file:line, read directly; 6 repros located + shape-classified from source)
**Boundaries scanned:** 3 (B1 stage-0.5 binding, B2 stage-1 prelude, B3
root recognition) + 1 boundary-pair (parity-corpus loc-blindness vs
loc-fidelity harness)
**Risks identified:** 5 open questions (OQ1 dead-binding HIGH/blocks 2
repros; OQ2 #142-no-op-possible; OQ3 -CyO42BOyp5a unknown; OQ4
fixpoint/dup-key; OQ5 order-independence observation) — all flagged
"observe, do not infer"
**Lokāyata gate:** repros LOCALLY AVAILABLE (no re-run) at
`.bakery-runs/samples-2026-05-15T23-13-07-584Z.json`, lookup by `hash`;
exact extraction command provided
