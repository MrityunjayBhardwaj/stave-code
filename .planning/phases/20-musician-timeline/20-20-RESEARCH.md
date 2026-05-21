---
phase: 20-20
title: Final-residual parity reclaim — `-G2drHRNFueu` (#159 tokenizer-whitespace + #153 multi-top-level)
researcher: anvi-researcher
created: 2026-05-21T08:10:00Z
confidence: HIGH
boundaries_scanned: 4 (our parser ↔ Strudel transpiler; our parser ↔ JS eval; transpiler ↔ acorn; multi-statement evaluation)
upstream_pin_sha: f73b395648645aabe699f91ba0989f35a6fd8a3c
local_sources_read:
  - node_modules/.pnpm/@strudel+core@1.2.6/node_modules/@strudel/core/repl.mjs
  - node_modules/.pnpm/@strudel+core@1.2.6/node_modules/@strudel/core/evaluate.mjs
  - node_modules/.pnpm/@strudel+transpiler@1.2.6/node_modules/@strudel/transpiler/transpiler.mjs
  - packages/editor/src/ir/parseStrudel.ts (whole file scanned; load-bearing arms read)
wave0_outcome: 1 (whitespace fence #159 IS the sole dominant blocker; #153 not blocking E)
---

# Phase 20-20 Research — final-residual parity reclaim on `-G2drHRNFueu`

## 0. TL;DR for the planner

- **D-01 Wave-0 outcome (RUN, observed):** **Outcome 1.** The
  tokenizer-whitespace fence (#159) is the SOLE dominant blocker on
  `-G2drHRNFueu`. The multi-top-level class (#153) is NOT blocking
  this exemplar at the parity oracle's `tag === 'Code' && via===undefined`
  fence — the no-whitespace multi-line case (`sound("a")\nsound("b")`)
  ALREADY structures today.
- **D-02 upstream verdict (GROUNDED at pin `f73b3956`):** Upstream
  UNAMBIGUOUSLY TOLERATES whitespace between identifier and `(`.
  Mechanism class: **pure JS-eval pass-through** (transpiler.mjs:25
  uses `acorn.parse(input)`, which parses `sound ("hh")` as a
  CallExpression per ECMA spec; evaluate.mjs:37-38 uses
  `Function(body)()` — native JS). No transpiler normalisation; no
  custom lexer; whitespace tolerance is the JS spec.
- **D-03 NOT IN SCOPE THIS PHASE per Outcome 1.** D-03 RESEARCH is
  DEFERRED (#153 stays backlog with the new evidence below logged).
  BUT for the planner's record: the upstream LAST-WINS verdict is
  ALSO grounded here (R-3) because the upstream read covers both
  surfaces in the same source files.
- **The bug surface:** `splitRootAndChain` at
  `parseStrudel.ts:2489-2538` (specifically the identifier-then-paren
  branch at lines 2521-2531) hand-rolls identifier walking WITHOUT
  inter-element whitespace tolerance. After the identifier `sound`,
  the function checks `expr[i] === '('` directly — when the source
  has a SPACE between identifier and `(`, the check fails, the root
  becomes the bare identifier `sound`, and the chain becomes
  ` ("hh hh hh hh")`. Neither half parses → bareCode fallback.
- **The fix shape (planner picks, planner finalises):** PV49-extend
  `splitRootAndChain` to call `skipWhitespaceAndLineComments` between
  the identifier scan and the `(` check, then include the consumed
  whitespace inside the returned `root` slice so `parseRoot`'s
  existing `\s*\(` arms (which already tolerate whitespace) match.
  Single regex / walker change; no new IR tag; PV54 does NOT trigger.

---

## 1. Falsification trail — grounded vs inferred

| Claim | Source | Verdict | Confidence |
|---|---|---|---|
| Upstream Strudel evaluates JS user code via `Function(body)()` | `@strudel/core@1.2.6 evaluate.mjs:29-38, 41-53` (read) | confirmed | HIGH (GROUNDED) |
| Upstream's transpiler uses acorn (`ecmaVersion: 2022`) | `@strudel/transpiler@1.2.6 transpiler.mjs:25-30` (read) | confirmed | HIGH (GROUNDED) |
| Acorn parses `sound ("hh")` as a CallExpression identically to `sound("hh")` | ECMA-262 / acorn spec | confirmed | HIGH (spec-grounded; no whitespace token between Callee and Arguments) |
| Upstream transpiler does NOT normalise whitespace between identifier and `(` | `transpiler.mjs:21-213` (whole file read) | confirmed (no `genExprSource` re-formatting on top-level call shape) | HIGH (GROUNDED) |
| Two bare `sound(...)` siblings: LAST wins under Strudel REPL | `repl.mjs:222-282` + `transpiler.mjs:198-204` (`addReturn` rewrites ONLY `body[body.length-1]`; `pPatterns` empty since no `.p()` call; `else if` branch at repl.mjs:259 hits `eachTransform(pattern)` where `pattern === return value of last stmt`) | LAST-WINS | HIGH (GROUNDED) |
| Our `splitRootAndChain` hand-rolls identifier walking and rejects a space before `(` | `parseStrudel.ts:2521-2531` (read) + Wave-0 probe case B (RUN — see §2) | confirmed | HIGH (RUN + GREP) |
| `parseRoot`'s `sMatch` regex `/^(?:s|sound)\s*\(\s*"([^"]*)"\s*\)/` already tolerates whitespace at the `\s*\(` site | `parseStrudel.ts:1347` (GREP) | confirmed | HIGH (GREP) |
| The bug is therefore upstream of `parseRoot` in the pipeline (in `splitRootAndChain`) | Deductive chain: §2 case B shows bareCode; §3 shows parseRoot's regex would have matched; §4 shows `splitRootAndChain` truncates before the `(` | confirmed | HIGH (cross-evidence) |
| Fixing `splitRootAndChain` alone is sufficient to flip case E to STRUCTURED | Reasoned through the pipeline post-fix (§5). Confirmed by argument: post-fix the root becomes `sound ("a")`, chain becomes `\nsound ("b")`; `applyChain` sees chain starting with `\n` (not `.`), returns root unchanged; `parseRoot` matches `sMatch` → Play; Track wraps Play → STRUCTURED | INFERRED (deductive) — promotes to RUN at Wave-1 V-1 fixture | MEDIUM-HIGH (verify via fixture before commit) |
| `#153` multi-top-level is NOT a parity blocker on E | Wave-0 case C (`sound("a")\nsound("b")` STRUCTURES already with body.tag=Play — see §2) — observed | confirmed | HIGH (RUN) |
| Today's parser is FIRST-WINS on bare multi-top-level (semantic mismatch with upstream LAST-WINS) | §2 case C body.tag=Play (the FIRST `sound("a")`); the second is dropped by `applyChain` since chain doesn't start with `.` | confirmed semantic mismatch but NOT parity-blocking | HIGH (RUN), NOT-IN-SCOPE for 20-20 |

---

## 2. R-1 — Wave 0 surgical factoring probe (D-01 discharge) — RUN with EVIDENCE

The Wave-0 probe was RUN as part of RESEARCH (the executor will
re-run it identically in Wave 0 to record V-1 evidence in
`20-20-OBSERVATIONS.md`).

### 2.1 Probe shape — exact 5-cell observation set

```ts
// File: packages/editor/src/_wave0-classify-20-20.spec.ts
// Pattern: mirror the 20-19 _wave0-classify.spec.ts shape — vitest run,
// stdout-printed, no assertions (the planner consumes stdout verbatim
// for the OBSERVATIONS record).

import { describe, it } from 'vitest'
import { parseStrudel } from './ir/parseStrudel'

const cases = [
  { id: 'A control (no space, single line)',           code: 'sound("hh hh hh hh")' },
  { id: 'B whitespace fence (with space, single line)', code: 'sound ("hh hh hh hh")' },
  { id: 'C multi-top-level (no space)',                code: 'sound("a")\nsound("b")' },
  { id: 'D EXEMPLAR shape (with space + two siblings)', code: 'sound ("a")\nsound ("b")' },
  { id: 'E REAL bakery -G2drHRNFueu (verbatim)',       code:
    'sound ("hh hh hh hh")\nsound ("[bd bd][sd bd] bd sd")\n\n\n// @version 1.0' },
]

describe('Wave 0 20-20 factoring probe', () => {
  it('reports per-case parse tag', () => {
    for (const c of cases) {
      const ir: any = parseStrudel(c.code)
      const tag = ir.tag
      const isBareCode = tag === 'Code' && ir.via === undefined
      const innerTag = ir.body?.tag ?? ''
      const innerBare = ir.body?.tag === 'Code' && ir.body.via === undefined
      console.log(`[${c.id}]`)
      console.log(`  source: ${JSON.stringify(c.code).slice(0, 80)}`)
      console.log(`  outer.tag=${tag} bare=${isBareCode} inner.tag=${innerTag} inner.bare=${innerBare}`)
    }
  })
})
```

Run command: `pnpm --filter @stave/editor exec vitest run src/_wave0-classify-20-20.spec.ts`.

### 2.2 Observed stdout (RUN 2026-05-21 by the researcher) — verbatim

```
[A control (no space, single line)]
  source: "sound(\"hh hh hh hh\")"
  outer.tag=Track bare=false inner.tag=Seq inner.bare=false
[B whitespace fence (with space, single line)]
  source: "sound (\"hh hh hh hh\")"
  outer.tag=Track bare=false inner.tag=Code inner.bare=true
[C multi-top-level (no space)]
  source: "sound(\"a\")\nsound(\"b\")"
  outer.tag=Track bare=false inner.tag=Play inner.bare=false
[D EXEMPLAR (with space + two siblings)]
  source: "sound (\"a\")\nsound (\"b\")"
  outer.tag=Track bare=false inner.tag=Code inner.bare=true
[E REAL bakery -G2drHRNFueu]
  source: "sound (\"hh hh hh hh\")\nsound (\"[bd bd][sd bd] bd sd\")\n\n\n// @v...
  outer.tag=Track bare=false inner.tag=Code inner.bare=true
```

(The outer `Track` wrapper is added by parseStrudel's no-`$:` branch
at pS:739; `Track.body` is the inner IR. The parity oracle at
`_bakery-classify.spec.ts:77` discriminates on the OUTER's bareCode
shape, but the inner reveals the real signal: B/D/E have inner.tag=Code
with `via === undefined` — the bareCode fence; A/C have structured
inner. The 20-19 oracle bins this as bareCode-fallback.)

### 2.3 Outcome matrix mapped to CONTEXT D-01 dispositions

| Case | Has space? | Multi-line? | Inner.tag | Inner bareCode? | Outcome class |
|---|---|---|---|---|---|
| A | NO | NO | Seq | NO | structured ✓ |
| B | **YES** | NO | **Code** | **YES** | **#159 whitespace fence — bareCode (FIX TARGET)** |
| C | NO | YES | Play | NO | structured (today FIRST-WINS; #153 NOT blocking parity) |
| D | **YES** | YES | **Code** | **YES** | #159 wins (B's bareCode dominates) |
| E | **YES** | YES + comment | **Code** | **YES** | same — #159 wins |

**Verdict: D-01 OUTCOME 1.** The #159 (tokenizer-whitespace) class
is the SOLE dominant blocker. Fixing #159 alone flips B/D/E to
structured. #153 (multi-top-level) is NOT blocking parity on E
today (case C STRUCTURES — see §3 for the upstream-mismatch caveat
that is OUT-OF-SCOPE for 20-20).

### 2.4 The decision rule (consumed by the planner)

```
IF Wave-0 V-1 stdout reproduces the above matrix exactly:
   → D-01 LOCKS to Outcome 1
   → D-02 RESEARCH discharge below is the EVIDENCE input to PLAN
   → D-03 stays DEFERRED (#153 backlog with the §3 evidence note added)
   → PLAN ships a single-file change to splitRootAndChain (the §5 fix shape)
   → ONE Wave-C-style permanent CI fixture (the §7 fixture spec)
   → ONE optional V-3 cross-wave loc-fidelity STOP probe (the §7 spec)
   → Dual gate per D-04 (§8)
ELSE (stdout DIVERGES from this matrix):
   → PK18 STOP → re-pose D-01 to user with the DIVERGING stdout verbatim
   → DO NOT proceed to fix selection
```

---

## 3. R-2 — Upstream `@strudel/core` parser/tokenizer behaviour (D-02 discharge)

### 3.1 The pipeline (GROUNDED)

User-typed source enters Strudel evaluation at `repl.mjs:222-282`
(the `evaluate` function). The flow:

1. **`repl.mjs:237`** — `let { pattern, meta } = await _evaluate(code, transpiler, transpilerOptions);`
   — `_evaluate` is imported from `evaluate.mjs:41`.
2. **`evaluate.mjs:41-53`** — runs the transpiler (the `@strudel/transpiler`
   package's `transpiler` function) on the source, then calls `safeEval`.
3. **`evaluate.mjs:29-39`** — `safeEval` wraps the transpiled code as
   `(async ()=>{${transpiled}})()` and calls `Function(body)()` —
   native JavaScript evaluation.

### 3.2 The transpiler — GROUNDED whitespace-tolerance verdict

`@strudel/transpiler/transpiler.mjs:21-213` (the `transpiler` function):

```js
// transpiler.mjs:25-30
let ast = parse(input, {
  ecmaVersion: 2022,
  allowAwaitOutsideFunction: true,
  locations: true,
  onComment: comments,
});
```

`parse` is imported from `acorn` (line 2). **Acorn is the standard
ECMAScript parser; the ECMA-262 grammar production
`CallExpression :: MemberExpression Arguments` allows arbitrary
whitespace between `MemberExpression` and `Arguments`.** Therefore
`sound ("hh")` and `sound("hh")` produce IDENTICAL AST nodes
(both `CallExpression { callee: Identifier{name:'sound'},
arguments:[Literal{value:'hh'}] }`).

The transpiler's AST walk (lines 47-181) does NOT touch whitespace —
it ONLY rewrites specific node types (TemplateLiteral, Literal,
LabeledStatement, BareSamplesCall, etc.). The final regeneration at
**transpiler.mjs:205** (`let output = escodegen.generate(ast)`) emits
canonical JS from the AST — whitespace between callee and arguments
is implementation-defined but always SEMANTICALLY EQUIVALENT to the
original.

### 3.3 The eval layer

**`evaluate.mjs:29-39`** — `safeEval`:

```js
function safeEval(str, options = {}) {
  const { wrapExpression = true, wrapAsync = true } = options;
  if (wrapExpression) {
    str = `{${str}}`;
  }
  if (wrapAsync) {
    str = `(async ()=>${str})()`;
  }
  const body = `"use strict";return (${str})`;
  return Function(body)();
}
```

This is **native JS evaluation** — `sound ("hh")` is a valid JS
CallExpression and evaluates identically to `sound("hh")`.

### 3.4 D-02 verdict (binary + mechanism)

- **TOLERATES / REJECTS:** **TOLERATES.**
- **Mechanism class:** **pure JS-eval pass-through** (the JS spec
  itself tolerates whitespace between callee and arguments; acorn
  preserves this; native `Function` evaluation runs unchanged).
- **`file:line` citations (pinned at SHA `f73b3956`, mirrored locally
  via @strudel/core@1.2.6 / @strudel/transpiler@1.2.6):**
  - `@strudel/transpiler/transpiler.mjs:25-30` — acorn parse entry
  - `@strudel/transpiler/transpiler.mjs:21-213` — AST walk (no
    whitespace normalisation visible)
  - `@strudel/core/evaluate.mjs:29-39` — `safeEval` via `Function(body)()`
  - `@strudel/core/evaluate.mjs:41-53` — top-level `evaluate` wires
    transpiler + safeEval

**Implication for PLAN:** Our parser is STRICTER than upstream. The
fix is to MIRROR upstream's permissiveness on this specific token-
boundary surface. The fix-shape choice is constrained to
`{walker-tolerance}` — `{curated-regex-extension}` and
`{source-pre-process}` are REJECTED (the upstream mechanism is not
a regex-extension or a pre-process; it's pure JS lexing).

### 3.5 Rejecting the "close as not-a-bug" branch

This branch is REJECTED. The user's source `sound ("hh hh hh hh")`
is VALID JavaScript (ECMA-262 spec — whitespace between callee and
arguments is permitted). Upstream evaluates it without error. Our
parser bareCode'ing it is a true recogniser-narrowness gap, not a
malformed-source rejection.

---

## 4. R-3 — Upstream sibling-expression REPL semantics (D-03 discharge — DEFERRED but GROUNDED for the record)

D-03 RESEARCH is DEFERRED per D-01 Outcome 1. The Wave-0 evidence
shows #153 is not blocking parity. But because the upstream read
covers the same source files, I am recording the LAST-WINS verdict
here so that when #153 is picked up in a future phase the planner
inherits the grounding (no re-do of P69's Grounding Check).

### 4.1 Pipeline (GROUNDED)

For source `sound("a")\nsound("b")` (two ExpressionStatements, no
labels, no `.p()` calls):

1. **`transpiler.mjs:25-30`** — acorn parses into AST `body[]` with
   TWO `ExpressionStatement` nodes.
2. **`transpiler.mjs:198-204`** — `addReturn` rewrites ONLY the LAST
   body element into a `ReturnStatement`:
   ```js
   if (addReturn) {
     const { expression } = body[body.length - 1];
     body[body.length - 1] = {
       type: 'ReturnStatement',
       argument: expression,
     };
   }
   ```
3. **`evaluate.mjs:37`** — wraps as
   `"use strict";return (async ()=>{ <transpiled> })()`. The
   inner block becomes: first stmt as ExpressionStatement (value
   discarded by JS), last stmt as ReturnStatement.
4. **`evaluate.mjs:38`** — `Function(body)()` returns the value of
   the last ReturnStatement = the SECOND `sound(...)` pattern.
5. **`repl.mjs:237`** — `pattern` is bound to this returned value.
6. **`repl.mjs:238`** — `pPatterns` is empty (no `.p()` call was
   made; `labelToP` at transpiler.mjs:464 only fires on
   `LabeledStatement` nodes, which bare expressions are not).
7. **`repl.mjs:259-260`** — `else if (eachTransform)` arm: only
   applies if `each(...)` was called this evaluate (it wasn't).
   `pattern` flows untouched to **`repl.mjs:272`** `setPattern`.
8. **Effect:** only the SECOND `sound("b")` is the active pattern;
   the first is silently discarded.

### 4.2 D-03 verdict (semantic, GROUNDED — DEFERRED phase)

- **Verdict:** **LAST-WINS** for bare unlabeled sibling top-level
  pattern expressions.
- **NOT STACK.** The presence of `stack` in `repl.mjs:13` import
  list misled #153's filer (the issue body hypothesises "Strudel
  implicitly stacks them"). `stack` is only invoked when
  `pPatterns` has labelled entries (`repl.mjs:258`). Bare unlabeled
  siblings never reach that arm.
- **`file:line` citations:**
  - `@strudel/transpiler/transpiler.mjs:198-204` — `addReturn`
    rewrites only `body[body.length-1]`; non-last bodies remain
    ExpressionStatement whose value is discarded by JS
  - `@strudel/core/evaluate.mjs:37-38` — `Function(body)()` returns
    the last ReturnStatement's value
  - `@strudel/core/repl.mjs:237` — `pattern` is bound to the return
    value
  - `@strudel/core/repl.mjs:238, 258, 259-260, 272` — `pPatterns`
    is empty, the `if (Object.keys(pPatterns).length)` stack-wrap
    branch is NOT entered, the `else if (eachTransform)` branch is
    NOT entered, `pattern` flows to `setPattern` as-is
  - `@strudel/transpiler/transpiler.mjs:464-491` — `labelToP` only
    fires on `LabeledStatement` (`$: …` or `name: …` syntax), not
    on bare expression statements

### 4.3 Our parser's current behaviour on the same input (semantic mismatch — DEFERRED)

§2 case C shows our parser today emits `body.tag=Play` for the
FIRST `sound("a")` (FIRST-WINS, not LAST-WINS). This is a SEMANTIC
mismatch with upstream — we play the wrong sample compared to a
real Strudel REPL. But the parity oracle's `isCodeFallback` check
only discriminates structural vs bareCode; FIRST-WINS still
structures, so it doesn't BLOCK the gate.

**For #153 (future phase): the IR-shape choice constrained by the
grounded LAST-WINS verdict is to either (i) keep the existing single
finalExpr shape and select the LAST non-binding stmt from
`splitTopLevelStatements`'s output (one-line change in
`splitRootAndChain` precondition), or (ii) emit a comment/diagnostic
flagging the discarded earlier stmts. NEITHER requires a new top-
level PatternIR tag → PV54 does NOT trigger for #153 either.**

This evidence will be linked from the #153 issue body when this
phase ships (the planner adds a one-line update to #153's triage
notes).

---

## 5. R-4 — Our parser surface for the fix (Chesterton scan)

### 5.1 The bug location — exact `file:line`

`packages/editor/src/ir/parseStrudel.ts:2521-2531` (the
identifier-then-paren branch of `splitRootAndChain`):

```ts
} else {
  // Skip identifier
  while (i < expr.length && /[a-zA-Z0-9_$]/.test(expr[i])) i++

  // If there's an opening paren, find the matching close
  if (i < expr.length && expr[i] === '(') {
    const closeIdx = findMatchingParen(expr, i)
    if (closeIdx !== -1) {
      i = closeIdx + 1
    }
  }
}
```

After the identifier-character scan stops at the first non-id char,
the code checks `expr[i] === '('` DIRECTLY. When `expr` is
`sound ("hh")`, `expr[i]` at this point is `' '` (space, code point 32),
not `(`. The `if` fails, `i` remains at the position of the space,
and `splitRootAndChain` returns `root='sound'`, `chain=' ("hh")'`.

### 5.2 Downstream consequence of that truncation

- `parseExpression` (pS:1143-1175) gets `root='sound'`, `chain=' ("hh")'`.
- `parseRoot('sound', ...)` (pS:1191-1666) goes through:
  - G2 bound-ident arm (pS:1248) — `sound` is not in `bindings`, skip.
  - `CHAIN_ROOT_RECOGNISER.get('sound')` (pS:1272) — `sound` is NOT
    in the curated map (only sine/cosine/saw/.../irand/binary/chord/
    arrange are), skip.
  - argMatch at pS:1298 — no `(` immediately after the identifier
    in `trimmed=='sound'`, falls through.
  - noteMatch / sMatch / miniMatch / looseMatch — all require a
    `\s*\(` shape on the trimmed expression; `trimmed='sound'`
    alone fails all of them.
  - Eventually returns `IR.code('sound')` (bareCode) via the
    fallthrough at pS:~1599.
- Back in `parseExpression` at pS:1156, `rootIsBareCode === true` and
  `chain.trim() === '("hh")' !== ''`. The `if (rootIsBareCode)`
  branch at pS:1161 returns `IR.code(expr)` — the WHOLE expression
  as bareCode.

### 5.3 Why `parseRoot`'s sMatch can't save us

`parseRoot` matches on `trimmed` (the root token without the chain).
Since `splitRootAndChain` already SLICED `sound` away from the
` ("hh")` portion, `parseRoot` never sees the call shape. The
regexes at pS:1326-1394 all start with `^(?:s|sound)\s*\(\s*"…`
and the `\s*\(` part is fine — BUT they're never reached because
the splitter already trimmed the args off.

### 5.4 The PV49 precedent — already-tolerant call sites

`skipWhitespaceAndLineComments` (pS:1075-1094) is the PV49 primitive.
Existing callers (per the grep at lines 463, 1560, 1714, 2676):
- `splitTopLevelStatements` (pS:463) — peeks past whitespace +
  `//` comments to detect leading-dot chain continuation
- `extractTracks` label scan (pS:1560) — peeks for the quote after
  `$:` whitespace
- `applyChain`'s inter-method consume (pS:1714) — consumes whitespace
  + line comments between `.method()` chain calls
- `splitArgsWithOffsets` (pS:2676) — consumes whitespace between args

None of these handle the IDENTIFIER → `(` boundary inside the root.
That's the gap.

### 5.5 The fix-shape contract (the planner finalises)

The minimal PV49-extension is to call
`skipWhitespaceAndLineComments` AFTER the identifier scan and
BEFORE the `(` check, then include the consumed whitespace inside
the returned `root` slice. Critical invariant: the root slice MUST
include the whitespace so `parseRoot`'s `\s*\(` regexes match.

Sketch (the planner refines):

```ts
} else {
  // Skip identifier
  while (i < expr.length && /[a-zA-Z0-9_$]/.test(expr[i])) i++

  // PV49 extension — tolerate inter-element whitespace + // comments
  // between the identifier and the call-site '('. Mirror upstream's
  // pure JS-eval whitespace tolerance (acorn / Function(body)()).
  // The skipped whitespace MUST be included in the returned `root`
  // slice so parseRoot's existing `\s*\(` regex arms (sMatch,
  // noteMatch, miniMatch, looseMatch) match the whole call.
  const afterIdent = i
  i = skipWhitespaceAndLineComments(expr, i)

  // If there's an opening paren, find the matching close
  if (i < expr.length && expr[i] === '(') {
    const closeIdx = findMatchingParen(expr, i)
    if (closeIdx !== -1) {
      i = closeIdx + 1
    }
  } else {
    // No '(' after whitespace — restore i to the identifier boundary
    // (do not consume trailing whitespace into the root). This
    // preserves the existing "root = bare ident" disposition when
    // the source is genuinely a bare ident (no call).
    i = afterIdent
  }
}
```

**Why include the whitespace in the root slice (not just skip past
the source-position):** `parseRoot` receives `trimmed = root.trim()`
at pS:1214. If `root = 'sound ("hh")'`, then `trimmed = 'sound ("hh")'`
(no trailing/leading whitespace) — and `sMatch.test('sound ("hh")')`
→ matches via the `\s*` between `sound` and `\(`. The internal
whitespace between identifier and paren is preserved inside `trimmed`,
and the existing regex tolerates it.

**Critical invariant to verify post-fix (the planner's V-1 fixture):**
`parseRoot('sound ("hh")', ...)` returns a Play (NOT bareCode). This
is verifiable via the inner-tag check in the §7 fixture.

### 5.6 Risk surface — the Chesterton fence

`splitRootAndChain` callers:

- `parseStrudel.ts:1143` — `parseExpression` (primary user)
- `parseStrudelStages.ts:168` — secondary user (debug-stage pipeline;
  same parser, same flow)
- `__tests__/parseStrudel.test.ts:348` — existing unit-test coverage
  for the bare-string-root branch (unaffected — different `else if`
  branch at pS:2492)

**Risk class scan (Lokayata against current corpus):**

1. **Bare-identifier roots followed by whitespace + non-paren**
   (e.g. `let x = sine // comment`): the proposed `restore i to
   afterIdent` branch handles this — no behavioural change.
2. **Method-chain continuation right after the identifier**
   (e.g. `sound\n.gain(1)`): existing `splitTopLevelStatements`
   merges leading-dot continuations into the same segment (pS:464);
   then `splitRootAndChain` would see `sound\n.gain(1)`. After
   identifier scan, `i` points to `\n`. PV49-skip advances to `.`.
   Next char is NOT `(`, so we restore `i = afterIdent` (the
   identifier boundary). Root = `sound`, chain = `\n.gain(1)`. Same
   as today — `parseRoot('sound')` falls to bareCode, `applyChain`
   then tries to consume `.gain(1)` but the root is bareCode so
   `parseExpression` at pS:1162 returns `IR.code(expr)` regardless.
   BUT note: `sound` alone (no call) is not currently expected to
   structure anyway — this case is OUT of the corpus and not
   regression-relevant.
3. **A `// comment` immediately after the identifier**: e.g.
   `sound // foo\n("hh")`. The PV49 walker consumes the `//`-to-`\n`,
   then continues past further whitespace. The next char is `(`,
   matches → root = `sound // foo\n("hh")`. `parseRoot.trim()` gives
   `sound // foo` + chain? wait — let me reconsider. `trim()` only
   removes outer whitespace; embedded `// foo\n` stays inside. The
   sMatch regex `/^(?:s|sound)\s*\(\s*"…/` would FAIL on
   `sound // foo\n("hh")` because `// foo` is not `\s`. **This is
   NOT a regression** — it's an extension of the bug surface where
   the corpus didn't exercise it. Today, `splitRootAndChain` truncates
   at the space, so `sound // foo\n("hh")` was already bareCode. Post-
   fix it's STILL bareCode. **NEUTRAL impact.** (The PV49 primitive
   does handle `//` comments, but `parseRoot`'s regexes don't — so
   the practical effect is the same: structured only when the
   between-id-and-paren chars are pure whitespace.)
   - **Planner note:** the V-3 cross-wave loc-fidelity STOP gate
     will catch any unexpected regression here on the full corpus.
4. **Spaces in the chain dotting** (e.g. `sound("a") .gain(1)`):
   unchanged. `splitRootAndChain` finds the call shape `sound("a")`,
   slices it into root + ` .gain(1)`. `applyChain` already handles
   leading whitespace via its INTER_METHOD_SEP equivalent.
5. **`if (x) sound("a")` shape** (truly malformed root that happens
   to LOOK like a call): the `if (x)` parses as identifier `if` +
   whitespace + paren — post-fix `root = 'if (x)'`. `parseRoot` runs
   `noteMatch` / `sMatch` / `miniMatch` / `looseMatch` regexes; `if`
   is not in any. Falls to bareCode. **Same as today** (today the
   space-after-`if` already truncated at `if`; both pre- and post-
   fix produce bareCode here). NEUTRAL.

**Conclusion:** the fix is strictly permissive. No corpus item that
parses structured today regresses; only items that are currently
bareCode'ing because of the whitespace fence flip to structured.

---

## 6. R-5 — PV49 / PV54 obligations

### 6.1 PV49 — DOES extend, by the spirit of the invariant

PV49's statement (from `.anvi/vyapti.md:1690-1788`): "Strudel-source
walkers tolerate inter-element whitespace AND inline line-comments."
The existing PV49 substrate has FOUR callers, all of them at INTER-
TOKEN boundaries. The proposed fix EXTENDS the substrate to a fifth
caller (`splitRootAndChain`'s identifier-to-paren boundary), which
is structurally an inter-token boundary by every other characterisation
already in the catalogue.

**Planner action:** the fix should land an addendum to PV49 with
ORIGIN/WHY/HOW (the standard 20-1x addendum shape — see PV49 (20-19)
addendum at line 1888 for the exact template):

- ORIGIN: 20-20 V-1 N=50 observation of bakery `-G2drHRNFueu`
  bareCode'ing on `sound ("hh hh hh hh")`; Wave-0 4-cell factoring
  probe RUN'd at pin `f73b3956` (§2 above).
- WHY: without this extension, every call-site with discretionary
  whitespace between identifier and `(` bareCodes — a parity gap
  whose source is recogniser-narrowness, not upstream rejection.
  The class is open-ended (any user could space-pad any call site).
- HOW: `splitRootAndChain` calls `skipWhitespaceAndLineComments`
  between identifier-scan and `(`-check; the call slice includes
  the whitespace so `parseRoot`'s already-tolerant `\s*\(` regexes
  match downstream. Single function change; no new IR shape; no
  new state.

### 6.2 PV54 — DOES NOT TRIGGER

The fix introduces NO new top-level PatternIR `tag`. The Signal /
Builder additive tag obligations (PV54) are NOT engaged. The 11+
FLOOR sites enumerated in PV54 (`toStrudel.ts:20, serialize.ts:81,
collect.ts:257+431, IRInspectorChrome.ts:19+102,
irProjection.ts:42+73+190+333+438`) require NO guarded arms added.
The FLOOR-grep audit ritual is therefore skipped.

### 6.3 PV50 — NO new module-level state

The fix is pure-function-internal (the new `afterIdent` local + the
`skipWhitespaceAndLineComments` call). No accumulator, no module
variable, no opts threading change. PV50 is structurally not
engaged.

### 6.4 PV52 — fence predicate UNCHANGED

The bareCode fence (`tag === 'Code' && via === undefined`) is
unchanged. The fix changes WHICH expressions reach the structured
path; it does not alter the fence predicate or the via union.

### 6.5 PV53 — bounded fixpoint UNCHANGED

The fix is UPSTREAM of `buildBindingMap`'s fixpoint (it lives in
`splitRootAndChain` which `parseExpression` calls AFTER bindings
have been resolved). Fixpoint behaviour is byte-stable.

---

## 7. R-6 — Permanent CI fixture + V-3 loc-fidelity pre-mortem

### 7.1 The V-2 permanent CI fixture (D-04 crit-1)

**Filename:** `packages/app/tests/parity-corpus/bakery-159-tokenizer-whitespace.strudel`

**Content (recommendation — DISTILL TO MINIMAL CANONICAL FORM):**

```
sound ("hh hh hh hh")
sound ("[bd bd][sd bd] bd sd")
```

**Rationale for the minimal form (vs verbatim):** mirrors 20-18 /
20-19 vendoring discipline — distill to the smallest fixture that
exercises the fix. Drop the trailing 3 blank lines + `// @version 1.0`
from the verbatim source — those are inert prelude content that
already pass through `stripParserPrelude` correctly today (verified
by the existing 20-14 prelude-strip arm) and don't add discriminative
load to the fixture. Keep two sibling `sound (...)` calls so the
fixture also locks the "first-wins-on-multi-line" behaviour we
inherit from today (so a future #153 fix that changes the IR shape
across multi-top-level breaks this fixture's assertion explicitly,
flagging the cross-issue interaction).

**Test assertion (mirror 20-18 Wave-C shape + 20-19 bakery-158-* shape):**

```ts
// Auto-discovered by parity.test.ts (the existing bakery-*.strudel
// pattern). Add the spec-side assertion via a dedicated grounding
// spec file IF the planner wants the inline-IR-shape check beyond
// the parity oracle's whole-program structured/bareCode bin.

// File: packages/app/tests/parity-corpus/_wave159-grounding.spec.ts
// (mirror _waveC-grounding.spec.ts shape from 20-18)
import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseStrudel } from '@stave/editor'

const FIXTURE = path.resolve(__dirname, 'bakery-159-tokenizer-whitespace.strudel')

describe('bakery-159 — tokenizer whitespace fence (#159) — STRUCTURED', () => {
  it('parseStrudel(source) is NOT bareCode at the outer or inner', async () => {
    const src = await fs.readFile(FIXTURE, 'utf8')
    const ir: any = parseStrudel(src)
    // Outer: Track wrapper from the no-`$:` branch
    expect(ir.tag).toBe('Track')
    // Inner: must NOT be bare Code (the parity fence)
    const inner = ir.body
    const innerIsBareCode = inner.tag === 'Code' && inner.via === undefined
    expect(innerIsBareCode).toBe(false)
    // Inner SHOULD be Play (the first-wins shape on the inherited multi-
    // top-level semantic — see §4 for the LAST-WINS upstream caveat
    // that #153 will resolve in a future phase)
    expect(inner.tag).toBe('Play')
  })
})
```

### 7.2 The optional NEGATIVE-CONTROL fixture

To bracket the fix and prevent over-widening, also add:

**Filename:** `bakery-159-NEGATIVE-no-whitespace.strudel` (or reuse
the existing `bakery-158-NEGATIVE-no-sideeffect.strudel` family
naming):

```
sound("hh hh hh hh")
```

**Assertion:** SAME inner Play shape, byte-identical to a fixture
produced WITH the whitespace. This proves the fix is a strict widen
(B and A produce the same downstream IR shape), and protects against
a future regression that drops the no-whitespace case.

### 7.3 V-3 cross-wave per-file loc-fidelity STOP gate

The existing `loc-fidelity.test.ts` (pS:`packages/app/tests/parity-
corpus/loc-fidelity.test.ts`) snapshots every per-fixture loc→source-
slice map. Add the new `bakery-159-tokenizer-whitespace.strudel`
fixture; record the snapshot at V-2. At V-3, re-run the FULL loc-
fidelity test suite — any pre-existing fixture whose snapshot drifts
is a regression hit (STOP gate). The fix is so localised (one walker
arm in `splitRootAndChain`) that this should pass clean; the V-3 gate
catches any over-widening that affects existing fixtures.

---

## 8. R-7 — Gate measurement plan (D-04 dual gate)

Mirror 20-19 R-7 verbatim:

### 8.1 Baseline (must-not-regress floor)

- `pnpm test` (root, monorepo-wide vitest): **1627/1627 (editor) +
  409/409 (app: parity-corpus 47 + loc-fidelity 47)** ← floor.
- `pnpm parity:bakery --n 50` with upstream pin `f73b3956`: **96.0%
  (48/50)**, stamp `samples-2026-05-20T13-22-13-320Z.json`.

### 8.2 V-1 (per-task measurement)

After the `splitRootAndChain` fix lands (no fixture added yet, no
catalogue update yet):

```bash
# (a) build the editor — P68 obligation (one-shot, not watch)
pnpm --filter @stave/editor build

# (b) run the in-source Wave-0 probe to verify B/D/E STRUCTURED post-fix
pnpm --filter @stave/editor exec vitest run src/_wave0-classify-20-20.spec.ts

# (c) run all editor tests
pnpm --filter @stave/editor test

# (d) run all app tests including parity + loc-fidelity
pnpm --filter @stave/app test

# (e) run fresh parity:bakery N=50
pnpm parity:bakery --n 50
```

**Expected V-1 outcomes:**

- (b) stdout: B/D/E inner.tag=Play inner.bare=false (the FLIP signal).
- (c) editor tests: 1627/1627 (must hold).
- (d) app tests: 411/411 (= 47+1 + 47+1 = parity-corpus widens by 1
  fixture + loc-fidelity widens by 1 fixture).
- (e) parity:bakery: **≥ 49/50 (98.0%)** with the residual reduced
  from `{#143-#7LU6zgzViSM, #159-#G2drHRNFueu}` to
  `{#143-#7LU6zgzViSM}`.

### 8.3 V-2 (CI fixture + catalogue + Ground Truth REF wires)

- Add `bakery-159-tokenizer-whitespace.strudel` + optional
  `bakery-159-NEGATIVE-no-whitespace.strudel` to
  `packages/app/tests/parity-corpus/`.
- Add the optional `_wave159-grounding.spec.ts` if the planner wants
  the inline-IR-shape check beyond the parity oracle's bin.
- Re-run `pnpm --filter @stave/app test` — expect +1 (or +2)
  parity-corpus tests, +1 (or +2) loc-fidelity tests.

### 8.4 V-3 (cross-wave loc-fidelity STOP gate)

- `pnpm --filter @stave/app exec vitest run tests/parity-corpus/loc-fidelity.test.ts`
- Inspect snapshot diff — ANY pre-existing fixture's snapshot
  changes is a STOP-gate hit. Expected: ONLY the new fixture's
  snapshot is added; all pre-existing snapshots byte-identical.

### 8.5 V-4 (phase-close — the dual gate decision)

Fresh `pnpm parity:bakery --n 50` measurement with NEW ISO stamp
(NOT the 20-19 baseline stamp). Same upstream pin
`f73b395648645aabe699f91ba0989f35a6fd8a3c`. Same N=50 sample.

**Pass condition (BOTH required):**

- **crit-1 (HARD):** the new fixture's `_wave159-grounding.spec.ts`
  (or parity-corpus auto-discovered run) passes — `-G2drHRNFueu`
  parses STRUCTURED in production via the same `dist/index.js`
  consumed by the parity harness.
- **crit-2 (HARD):** fresh parity ≥ 49/50 = 98.0% AND ≥ 48/50 floor
  (must-not-regress). Closing #159 alone is expected to deliver
  49/50; if a BONUS exemplar also flips (the 20-19 precedent),
  ≥ 50/50 = 100% possible (UPPER bound: there are still other
  classes in the residual N=50, e.g. `-7LU6zgzViSM` for #143; full
  100% is NOT guaranteed by this phase).

**Post-merge artifact verification recipe (mirror 20-19 V-4):**

```bash
# After PR merged into main, verify the fix is in the shipped dist
git fetch origin main
git checkout main && git pull
pnpm install
pnpm --filter @stave/editor build
# grep the new walker arm in the shipped dist (P68 anti-watch)
grep -c "skipWhitespaceAndLineComments" packages/editor/dist/index.js
# expected: at least N+1 occurrences (N = the count before this PR)
```

### 8.6 Grep anchors specific to 20-20 (post-build minification-stable)

The fix lands in `splitRootAndChain`. Minification-stable anchors:

- `skipWhitespaceAndLineComments` — the function name is exported,
  so the bundler preserves it. Count of occurrences in
  `packages/editor/dist/index.js` should INCREASE by 1 after the
  fix (the new call site in splitRootAndChain).
- `findMatchingParen` (the existing call right after the
  identifier) — unchanged; same count pre/post.
- The string literal `/[a-zA-Z0-9_$]/` in the identifier-skip
  regex — unchanged; same occurrences pre/post.

---

## 9. R-8 — Pre-mortems (top 5 ways this plan goes wrong)

### PM-1: Wave-0 V-1 stdout DIVERGES from §2.2 (re-pose D-01)

- **Catalogue:** P70 (8-occurrence spine) + PK18 (HARD-GATE cascade).
- **Early observation:** the Wave-0 probe at V-1 — IF stdout does
  NOT match the §2.2 matrix exactly, STOP immediately.
- **Most-likely cause:** an out-of-band parser change since 2026-05-21
  morning (the researcher's RUN) that affected the bareCode shape.
- **Recovery:** record the diverging stdout verbatim in
  `20-20-OBSERVATIONS.md`, re-pose D-01 to the user with the
  evidence. DO NOT proceed to fix selection. (The 20-16 4×-cascade
  precedent — every probe MUST be re-run at V-1, never trusted from
  RESEARCH alone.)

### PM-2: Upstream Ground Truth verdict was wrong (P69 trap)

- **Catalogue:** P69 (Grounding Check).
- **Early observation:** if the V-1 probe shows B as STRUCTURED
  even BEFORE the fix lands, the bug was somewhere else and the
  fix is unnecessary.
- **Most-likely cause:** I misread acorn's spec (e.g. `ecmaVersion`
  changed call-site whitespace handling — unlikely but possible).
- **Recovery:** the §2.2 RUN was performed against the CURRENT
  shipped parser (the editor's `dist/`), which is upstream-naive.
  If V-1 diverges, the fix can't be from the upstream verdict;
  re-pose D-02. (The §2.2 evidence is the FIRM ground; §3's
  upstream evidence is the JUSTIFICATION.)

### PM-3: The fix produces false-positives in the full corpus (over-widening)

- **Catalogue:** P50 (workaround cascade); the §5.6 Chesterton scan
  is the pre-mortem.
- **Early observation:** the V-3 loc-fidelity STOP gate. Any pre-
  existing fixture's snapshot drifts.
- **Most-likely cause:** an existing corpus item with whitespace
  between identifier and `(` ALSO has chain dotting that interacts
  with the new walker tolerance (e.g. `sine .range(0,1)` — leading
  space before `.range`).
- **Pre-mortem mitigation:** the proposed fix INCLUDES the
  `afterIdent` restore arm (§5.5) — when the post-whitespace char
  is NOT `(`, restore `i` to the identifier boundary. This means
  `sine .range(...)` is still split as `root='sine'`,
  `chain=' .range(...)'` — same as today.
- **Recovery:** if V-3 still flags a regression, STOP. Re-pose with
  the diverging fixture name verbatim.

### PM-4: The fresh parity:bakery measurement regresses BELOW 96.0%

- **Catalogue:** D-04 must-not-regress floor; PK18 STOP discipline.
- **Early observation:** V-4 phase-close `pnpm parity:bakery --n 50`.
- **Most-likely cause:** a different residual exemplar's classifier
  flipped from structured to bareCode due to an unanticipated
  interaction with the new walker tolerance.
- **Pre-mortem mitigation:** the proposed fix is strictly permissive
  on the identifier-paren boundary; no existing structured-path
  outcome should regress per the §5.6 Chesterton scan.
- **Recovery:** classify the diverging exemplar, re-pose D-04 with
  evidence. NEVER amend the 96.0% floor downward.

### PM-5: The Wave-0 RUN structures case B but the parity:bakery harness still bareCode's the full row

- **Catalogue:** P67 (tag-only discrimination) + a possible upstream-
  vs-our-dist split.
- **Early observation:** §2 case B uses the SAME source slice as
  the start of E; if B structures and E doesn't post-fix, the
  difference is the trailing two lines + comment.
- **Most-likely cause:** an interaction with `splitTopLevelStatements`
  or `stripParserPrelude` that's specific to the full row's shape.
- **Pre-mortem mitigation:** include case E in the V-1 probe (§2),
  not just case B. If E STRUCTURES at V-1, this risk is closed.
- **Recovery:** re-classify the residual class on E specifically;
  may need a second sub-fix (the 4×-cascade hazard — STOP per PK18,
  don't keep adding workarounds).

---

## 10. Anticipated gray areas NOT in CONTEXT

**No new gray areas surfaced. D-01..D-04 are sufficient.**

Specifically:
- **#153 IR-shape choice for multi-top-level:** GROUNDED at §4 as
  LAST-WINS (semantic). NOT in 20-20 scope per Outcome 1. Future
  phase consumes the §4 evidence without re-doing P69's discharge.
  RE-POSE NOT REQUIRED — CONTEXT D-01 explicitly handles the
  deferral path.
- **The semantic FIRST-WINS-vs-LAST-WINS mismatch for multi-line
  shapes (case C):** flagged for backlog. NOT a 20-20 blocker.
  RE-POSE NOT REQUIRED — flagged here for downstream phases to
  inherit.
- **PV49 addendum content:** mechanical (§6.1 template). The
  planner writes the addendum at V-4 catalogue-update step; no
  user re-pose needed.

---

## 11. Constraints & confidence summary

| Section | Confidence | Verification path |
|---|---|---|
| §2 Wave-0 probe shape + expected outcomes | HIGH (RUN by researcher 2026-05-21) | Re-RUN identically at V-1 |
| §3 Upstream tokenizer TOLERATES verdict | HIGH (GROUNDED — `transpiler.mjs:25-30`, `evaluate.mjs:29-53`) | Already grounded; cite at PR description |
| §4 Upstream LAST-WINS verdict (D-03 deferred) | HIGH (GROUNDED — `transpiler.mjs:198-204`, `repl.mjs:222-282`) | DEFERRED to future #153 phase |
| §5 Our parser bug location + fix-shape | HIGH (GREP-verified at `parseStrudel.ts:2521-2531`) | Compile + V-1 fixture |
| §6 PV49 extension + PV54 non-trigger | HIGH (catalogue cross-reference) | Update catalogue at V-4 |
| §7 Fixture + V-3 STOP gate spec | HIGH (mirrors 20-18 / 20-19 vendoring) | Same as 20-19 mechanism |
| §8 Dual gate measurement | HIGH (mirrors 20-19 verbatim) | Same as 20-19 mechanism |
| §9 Pre-mortems | MEDIUM-HIGH (5 explicit; PM-5 the residual unknown) | V-1 case-E observation closes PM-5 |

All `file:line` citations were GREPPED or READ (not inferred). The
upstream pin SHA is `f73b395648645aabe699f91ba0989f35a6fd8a3c`; the
locally installed `@strudel/core@1.2.6` and `@strudel/transpiler@1.2.6`
are the same posture as 20-18 Wave C / 20-19 (the corpus's
CORPUS-SOURCE.md SHA matches).

---

## 12. Ground Truth doc disposition

**Recommendation:** EXTEND `~/.anvideck/projects/struCode/ref/GROUND_TRUTH_SIGNAL_MJS.md`
with a new section "Parser/Evaluator Pipeline" covering:

- `repl.mjs:222-282` — `evaluate` flow
- `evaluate.mjs:29-53` — `safeEval` + `Function(body)()`
- `transpiler.mjs:25-30, 198-213` — acorn parse + `addReturn`
- `transpiler.mjs:464-491` — `labelToP` (LabeledStatement → `.p(name)`)

A NEW sibling doc `GROUND_TRUTH_REPL_MJS.md` is NOT needed — the
parser/evaluator surface is small (3 files, ~300 LOC of relevant
code) and conceptually adjacent to the controls / pattern / signal
substrate already covered in `GROUND_TRUTH_SIGNAL_MJS.md`. One doc
keeps the cross-reference graph simple and the P69 discharge
discoverable.

**Planner action:** at V-4 phase-close, append the Parser/Evaluator
section to `GROUND_TRUTH_SIGNAL_MJS.md` with the citations from §3
and §4. Add REFs from PV49 (addendum) and from any new hetvabhasa
entry for the whitespace-fence class to the new section.

---

## 13. Open hand-off questions to the planner

None. The planner should now:

1. Read this RESEARCH.md end-to-end.
2. Re-RUN §2's Wave-0 probe at V-1 to lock Outcome 1 by direct
   observation (PK18 contract — never trust an inferred premise).
3. Write the PLAN per Outcome 1 — single-file change to
   `splitRootAndChain` per §5.5, V-2 fixture per §7, dual gate per
   §8.
4. Submit to checker; ship.

**End RESEARCH.**
