# Phase 20-15 — Wave γ Observations

## γ-1: G5 false-positive matrix (Lokāyata probe, #138 acceptance artifact)

Prototype: generalized regex `/^[ \t]*(\/\/[ \t]*)?([A-Za-z_$][\w$]*)\s*:/gm`
PLUS a depth+string+keyword guard reusing the `stripParserPrelude`
pS:151-212 walker discipline (paren/brace/bracket depth + string/template/
comment state scanned `code[0..m.index)`). Probe scripts:
`/tmp/gamma1-probe.mjs`, `/tmp/gamma1-probe2.mjs`. **Observed, not inferred.**

### Matrix (each row's ACTUAL rejector — empirically observed)

| Construct | Rejected by | Observation |
|---|---|---|
| single-line `{ a: 1 }` | regex anchor (`{ ` precedes ident, not `^[ \t]*ident`) | raw regex did NOT match (0 hits in row) |
| multi-line `stack({\n a:1,\n b:2\n})` | **depth guard** (depth 2) | `a`,`b` → REJECT depth 2; `p1` ACCEPT |
| ternary `x ? y : z` | regex `\s*:` fails (next char `?`) | raw regex did NOT match |
| single-line `"https://foo.bar"` | regex anchor (`"` precedes ident) | raw regex did NOT match |
| multi-line `` s(`bd:3\nhh:2`) `` | **string guard** (inString) | `hh` → REJECT inside string |
| `s("bd:3")` | regex `\s*:` fails (`s` ident → `(`) | raw regex did NOT match |
| `const t: number = 3` | regex `\s*:` fails on `const` ident; `const` ∈ RESERVED; G1 consumes binding line | raw regex did NOT match `t:` |
| bare `bd:3` (top-level) | NOT rejected — documented low-risk | ACCEPT (acknowledged below) |
| `p1: s("bd")` | ACCEPTED — the only true track label | correct |

### Load-bearing finding

The single-line false-positives (`{a:1}`, ternary, string URL, `s("bd:3")`,
`const x:`) are rejected by the **regex shape itself** (anchor + `\s*:`
adjacency) — the raw regex matched only 2 of 7 corpus rows. The depth/string
guard is the load-bearing rejector for the **multi-line** forms
(`stack({\n a:1 })` → depth 2; `` s(`…\nhh:2`) `` → inString) where the
inner colon-bearing token DOES sit at a physical line start. Both proven.

Mixed `$:` + `name:` (both physical orders) → both captured, source-order
preserved (`$` ∈ `[A-Za-z_$]` so `$:` keeps exact current behavior).

### Residual (documented low-risk, accepted)

A bare `bd:3` at top-level statement position is ACCEPTED by the guard set.
This is **not valid standalone Strudel** — sample indices only appear inside
`s("…")` strings (which the string guard rejects). A program whose top-level
statement is literally `bd:3` would already be Code-fallback today; treating
`bd` as a (degenerate) track label is no worse than the status quo and not a
real-world Bakery shape. Accepted per the research matrix row
("low risk, document").

### Guard set (proven sufficient on the corpus)

1. match at statement depth 0 (not inside `{}`/`()`/`[]`)
2. not inside a string/template/comment
3. identifier not a reserved non-track keyword (`default`/`case`/`const`/
   `let`/`var`)

γ-2 proceeds with this validated guard.

## γ-2: G5 generalized extractTracks + full label→trackId→slot wiring (#138, D-01)

Observed via vitest probe importing parseStrudel/collect from editor SOURCE
(parity.test.ts style — avoids the `@strudel/core` raw-node ESM issue).

### Full wiring trace (OBSERVED, not inferred)

`parseStrudel('p1: s("bd")\np2: s("hh")')` →
`Stack[Track(trackId='p1', loc=[{0,12}], body=Play),
       Track(trackId='p2', loc=[{12,23}], body=Play)]`
→ `collect` events: `p1`→`dollarPos:0`, `p2`→`dollarPos:12` (DISTINCT,
equal to label-line start offsets) → MusicalTimeline slotKey `$${pos}`
distinct `["$0","$11"]`. The label IS the trackId AND the slot is
source-anchored — exactly D-01. Same `dollarStart`→`collect.ts:447`
OUTER-WINS→`event.dollarPos`→`$${pos}` mechanism `$:` uses, NOT parallel.

### FLAG-3 interleave (BOTH physical orders)

- b-i `$: s("bd")\np2: s("hh")` → `Track(d1)` (label `$`→`d1`,
  byte-identical legacy) + `Track(p2)`; `$.dollarStart(0) < p2(11)` ✓
- b-ii REVERSED `p2: s("hh")\n$: s("bd")` → `Track(p2)` + `Track(d2)`;
  `p2.dollarStart(0) < $(12)` ✓ — source order preserved either way.

### False-positive guard live

- single-line `{ a: 1 }\np1: s("bd")` → ONLY `p1` Track (`a:` rejected by
  regex anchor)
- multi-line `stack({\n a:1\n})\np1: s("bd")` → ONLY `p1` dollarStart 18
  (`a:` rejected by **depth guard** — the load-bearing case)

### #138 repro before/after

- BEFORE (HEAD parent 9e2a384): `dollarRe = /^[ \t]*(\/\/[ \t]*)?\$:/gm`
  literal `$:` only → `drum:`/`bass:` never match → `extractTracks` `[]` →
  `splitRootAndChain` reads `drum` as root → Code-fallback.
- AFTER: `parseStrudel('drum: s("bd sd")\nbass: note("c2 e2")')` →
  `Stack[Track('drum', body=Seq), Track('bass', body=Seq)]` structured.

### P67 both directions

- SUCCESS `p1: s("bd sd")` → `Track(p1, body=Seq, via=undefined)` —
  structured, NOT unparsed blob.
- BARE-FALLBACK `p1: someUnparseableThing(@@@)` →
  `Track(p1, body=Code, via=undefined)` — canonical bare-Code shape, NOT
  half-wrapped, AND still a Track (topology-preserving). Chokepoint
  honoured in the failure direction.

### RAW consumer (parseStrudelStages) tuple intact

`extractTracks('p1: s("bd")')` →
`[{expr:'s("bd")', offset:4, dollarStart:0, end:11, commented:false,
   label:'p1'}]` — `label` APPENDED; `dollarStart`/`end` unshifted (RAW
consumer reads by field, additive contract held).

### Regression oracle (γ-2)

parity-corpus 34/34 (no churn, zero `-u`) · editor 1564/1564 · timeline
specs 178/178 (MusicalTimeline.test.tsx 51/51, no flake). Deferred
trackMeta-by-slotKey re-keying NOT reopened (D-01 scope guard held).

## γ-3: G1 minimal stack()-of-bare-idents binding partial (#134, D-02)

NEW PK16(b) stage 0.5 (`buildBindingMap`) — AFTER prelude-strip, BEFORE
splitRootAndChain. Splits top-level statements (depth/string-aware,
lexStateAt-discipline reuse), matches
`^(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]+)$`, parses each
RHS via parseExpression (definition-site loc, R6), threads a
`ReadonlyMap<string,PatternIR>` parseExpression→parseRoot→stack-arg.

### D-02 boundary PROVEN (observed via vitest source-import probe)

| Case | Result | Verdict |
|---|---|---|
| (a) `let p1=n("0 2").s("piano")\nstack(p1)` | `Track(d1, Param)` structured, threw=false | ✓ structured |
| (b) #134 `let p1=…\nlet p2=…\nstack(p1,p2)` | `Track(d1, Stack[Param, Seq])` structured | ✓ #134 closed |
| (c) use-before-def `stack(p1)\nlet p1=n("0")` | `Track(d1, Code)` bareCode, threw=false | ✓ graceful Code |
| (d) reassignment `let p1=…\nlet p1=…` | `Track(d1, Code)` bareCode, threw=false | ✓ graceful Code |
| (e) `const p1=s("bd")\nstack(p1)` | `Track(d1, Play)` structured | ✓ structured |
| (f) destructuring `let {a}=foo` | `Track(d1, Code)` bareCode, threw=false | ✓ graceful Code |
| (g) arrow-fn rhs `let f=(x)=>x.fast(2)` | `Track(d1, Code)` bareCode, threw=false | ✓ graceful Code |
| (h) opaque rhs `let p1=someUnknownThing(@@)` | `Track(d1, Code)` bareCode, threw=false | ✓ graceful Code |
| P67 | (a) substituted subtree tag=Param, via=undefined, isBareCode=false | ✓ structured IR |

Every D-02 violation → graceful single Code node, NEVER a throw, NEVER
partial-eval. Matcher-not-interpreter line held exactly.

### #134 before/after

- BEFORE (9e2a384): no buildBindingMap; `let/const` NOT prelude-stripped
  (pS comment) → `splitRootAndChain` reads `let` as root → whole-program
  Code-fallback.
- AFTER: `let p1=n("0 2").s("piano")\nlet p2=s("bd hh")\nstack(p1,p2)` →
  `Track(d1, Stack[Param, Seq])` structured.

### Regression oracle (γ-3)

parity-corpus 34/34 (no churn, zero `-u` — no corpus tune uses top-level
let/const; buildBindingMap returns null and falls through) · editor
1564/1564 · timeline specs 178/178 (no flake).

## γ-4: STRETCH general inline-expansion map — DROPPED

**Decision: DROPPED** (explicitly droppable per plan; GOAL unaffected —
γ-3 covers the measured 2/10).

Reasons:
1. Generalizing substitution beyond the stack-arg hook widens the
   consumer surface into `splitRootAndChain` — the most-shared scanner,
   also touched by α-3 / β-3 / G4 — the exact HIGH-risk scope-creep the
   plan's γ-4 pre-mortem names ("this task IS the scope-creep risk").
2. The target shape (general bare-ident `a.fast(2)`) is NOT in the
   measured 2/10 Bakery set; γ-3's `stack(p1,p2)` partial covers the
   measured frequency.
3. The phase GOAL (real-world parity materially up + ≥9/10 known set) is
   already met by γ-3 + the rest of the wave.

Backlog issue filed: **#140** (AnviDev issue-before-fix). No code change,
no commit for γ-4. Deferred trackMeta-by-slotKey re-keying confirmed NOT
reopened across the entire wave (D-01 scope guard held).
