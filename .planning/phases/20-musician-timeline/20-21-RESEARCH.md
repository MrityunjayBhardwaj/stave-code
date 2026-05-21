---
phase: 20-21
title: Final-residual `-7LU6zgzViSM` — actual blocker is `// comment` with unbalanced apostrophe inside chain-method args (NOT the guarded-boot prelude); backlog audit probe shapes
created: 2026-05-21T20:10:00Z
confidence: HIGH (RUN-grounded; 9 bisect waves; root cause cited at parseStrudel.ts:2598-2628 + :2664-2747)
researcher: anvi-researcher
upstream_pin_sha: f73b395648645aabe699f91ba0989f35a6fd8a3c
ground_truth_class: INTERNAL (D-02 → no upstream RESEARCH needed; the fix is purely in our parser's char-by-char walkers — they do not skip `//` line comments before string-quote detection, so an odd-count apostrophe inside a comment puts the walker into an unterminated string state)
p70_occurrence: YES — occurrence-9. The 20-16 cascade classified `#143` as "guarded-boot recognition gap"; the actual blocker is in `findMatchingParen` / `splitArgsWithOffsets` (chain-arg walkers), which `#143` never named.
---

# Phase 20-21 RESEARCH — final residual + backlog audit

## Falsification trail (what's GROUNDED vs INFERRED)

| Claim | Grounding | Confidence |
|---|---|---|
| The actual gate-bearing blocker is NOT the guarded-boot prelude (the 20-16 V-2 `GUARDED_BOOT_RE` ship DOES match the first line of `-7LU6zgzViSM` correctly) | RUN — V4 (drop first line entirely) still bareCodes; V0 with no metadata + minimum body STRUCTURES; the first-line URL comment is irrelevant | HIGH (RUN) |
| The actual gate-bearing blocker is NOT the trailing `// @version 1.0` | RUN — V9 (no guarded-boot, keep `@version`) bareCodes only because its body has no recognised root; V8 (keep URL comment + min body + no `@version`) STRUCTURES; V14 (body-only, no `@version`) STILL bareCodes | HIGH (RUN) |
| The blocker lives inside the BODY, specifically inside the second `.layer(...)` arrow argument | RUN — `V0 arrow2-simple` (replace second arrow's multi-line chain with `x=>n("b").set(x)`) flips to STRUCTURED (`Code-via{cpm}`); `V0 arrow1-simple` (replace first arrow only) stays BARECODE | HIGH (RUN) |
| The blocker is an **odd-count apostrophe (`'`) inside a `// line comment`** in chain-method args. The walker enters string-mode at the first `'`, never sees a matching close, returns `-1`/unterminated → upstream chain-arg parser falls back to bareCode | RUN — W1 (single `// ma'am`) BARECODES; W3 (V0 shape minus the apostrophe comment) STRUCTURES; A8 (two `ma'am ma'am` = 4 apostrophes, EVEN) STRUCTURES; W4/W5 (single apostrophe in comment) BARECODES | HIGH (RUN) |
| Root cause is `findMatchingParen` (parseStrudel.ts:2598-2628) and `splitArgsWithOffsets` (parseStrudel.ts:2664-2747): both walk character-by-character treating `'` `"` `` ` `` as string-delimiters but do NOT skip `// line comments` before the string-quote test | GREP — read both functions; neither contains a `if (ch === '/' && next === '/')` skip branch like the prelude scan and segmenter walker DO (parseStrudel.ts:414-417 in segmenter; pS:1083-1088 in `skipWhitespaceAndLineComments` primitive) | HIGH (GREP + RUN) |
| Fix shape is to add `//`-comment-skipping to BOTH walkers (call `skipWhitespaceAndLineComments` or inline a `//` skip branch matching the segmenter's existing shape at pS:414-417); pure recogniser extension; no new IR shape; no PV52/PV54 trigger; PV49-spirit extension (whitespace + line-comment tolerance) but at a NEW call-site class (chain-arg walker, NOT inter-element scan) | INFERRED from grounded mechanism + the existing PV49 pattern in `skipWhitespaceAndLineComments` (pS:1075-1094) which IS the right primitive for inter-token tolerance | MEDIUM (INFERRED; executor Wave 0 RE-CONFIRMS on production exemplar) |
| Backlog `#143` should be RE-OPENED then closed by THIS phase's PR with a new title/body reflecting the actual class (apostrophe-in-comment-inside-chain-args), NOT the original guarded-boot framing | INFERRED from the P70 occurrence-9 framing (cascade-misclassification); the executor's `gh issue` calls handle the wording | MEDIUM (INFERRED) |
| `#153` (multi-top-level bare statements) already structures on real main per 20-20 Wave 0; this audit RE-CONFIRMS via the executor's RUN-classify probe and CLOSES-as-superseded | INFERRED from 20-20 OBSERVATIONS records | MEDIUM (INFERRED; executor RUN re-confirms) |

## R-1 — The bisect probe and its observed outcome

**Probe file (created + run + deleted by RESEARCH, executor will re-create similarly for Wave 0 RE-CONFIRMATION):** `packages/editor/src/_wave0-classify-20-21.spec.ts` (mirrors the 20-19/20-20 `_wave0-classify-*.spec.ts` convention).

**Probe shape:** import `parseStrudel` from the editor source path, run on progressive variants, log `body.tag` + `body.via?.method` + `isCodeFallback(ir)` per variant. The bakery classifier (`packages/app/tests/parity-corpus/_bakery-classify.spec.ts:32-41`) defines `isCodeFallback` = `body.tag === 'Code' && body.via === undefined` — `Code` with `via` is STRUCTURED.

### Wave 1 (the 20-21 CONTEXT pre-mortems — all FALSIFIED)

| Variant | Body shape | Verdict |
|---|---|---|
| V0 full exemplar | `body.tag=Code via=undefined` | **bareCode** ← gate-bearing baseline |
| V1 drop trailing `// https://...` URL comment | `Code, via=undefined` | bareCode (URL comment is NOT the blocker) |
| V2 drop trailing `// @version 1.0` | `Code, via=undefined` | bareCode (trailing `@version` is NOT the blocker) |
| V3 drop BOTH V1+V2 | `Code, via=undefined` | bareCode |
| V4 drop entire first line (guarded-boot) | `Code, via=undefined` | bareCode (guarded-boot is NOT the blocker) |

### Wave 2 (body-vs-prelude factoring)

| Variant | Verdict | Signal |
|---|---|---|
| V6 min-body, keep ALL prelude (URL + title + license, drop only `@version`) | STRUCTURED (`Play`) | Prelude alone is fine |
| V8 keep trailing URL comment + minimum body + no `@version` | STRUCTURED (`Fast`) | Trailing URL alone is fine |
| V9 NO guarded-boot, body + trailing `@version` | bareCode | `@version` after a body-that-doesn't-structure is consequence, not cause |
| V14 V0's full body alone (no prelude, no `@version`) | bareCode | **Body is the blocker** |

### Wave 3 (`.cpm` chain bisect — false signal that taught discrimination)

`stack(sound("bd")).cpm(28)` returns `Code` BUT with `via { method: 'cpm', inner: Play }`. That is the legitimate `wrapAsOpaque` shape (parseStrudel.ts:73-86) for unrecognised chain methods. `isCodeFallback` returns FALSE — STRUCTURED. So `.cpm` is NOT the blocker; it's a red herring (`Code-with-via` ≠ `bareCode`).

### Wave 4 (arrow-by-arrow strip — pins the blocker to arrow2)

| Variant | Verdict |
|---|---|
| V0 first arrow replaced with `x=>n("a").set(x)` | bareCode (still bad) |
| V0 second arrow replaced with `x=>n("b").set(x)` | **STRUCTURED** (`Code-via{cpm}`) |
| V0 both arrows simplified | STRUCTURED |

→ Blocker is INSIDE the second arrow's multi-line chain.

### Wave 5 (apostrophe-in-comment isolation — THE ROOT CAUSE)

Probe shape: a synthetic `stack( stack(sound("bd")).bank("R"), stack(chord("<G#m>").dict("ireal").layer( x=>n("a").set(x), <VARYING ARROW2> )) ).cpm(28)`.

| Arrow2 body | Verdict |
|---|---|
| `x=>n("b").set(x)` | STRUCTURED (`Code-via{cpm}`) |
| `x=>n("b").set(x)\n        // ma'am\n        .mode("c4")` | **bareCode** ← single apostrophe in comment flips it |
| Full V0 arrow2 (multi-line `.off` chain + `ma'am` comment) | bareCode |
| Full V0 arrow2 WITHOUT the `ma'am` comment | STRUCTURED (`Code-via{cpm}`) |
| `x=>n(...)\n    // ma'am ma'am\n    .mode("c4")` (TWO apostrophes — even count) | STRUCTURED |

**Conclusion: an ODD-count apostrophe inside a `//` line comment that lives inside chain-method arg parsing → walker enters unterminated string state → `findMatchingParen` returns `-1` OR `splitArgs` mis-attributes commas → upstream bails to bareCode.**

The exemplar `-7LU6zgzViSM` contains `// This is a green piece ma'am, we offset everything here o_0` inside the second `.layer()` arrow body. That comment has exactly one `'` → odd → blocker.

## R-2 — Mechanism diagnosis (file:line)

Two char-by-char walkers in `parseStrudel.ts` handle string-quote detection but **do NOT skip `// line comments` before testing for string delimiters**:

### Site 1: `findMatchingParen` (parseStrudel.ts:2598-2628)

```ts
function findMatchingParen(str: string, startIdx: number): number {
  let depth = 0
  let inString = false
  let stringChar = ''
  for (let i = startIdx; i < str.length; i++) {
    const ch = str[i]
    if (inString) {
      if (ch === stringChar && str[i - 1] !== '\\') inString = false
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {  // ← enters string mode on `'` inside `// ma'am`
      inString = true
      stringChar = ch
      continue
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}
```

When called on a chain-arg containing `// ma'am`, the walker:
1. Sees `/` (not a string delimiter, no `//` skip exists) — does nothing structural, just iterates.
2. Sees the second `/` — same.
3. Iterates through ` ma`.
4. Sees `'` — enters string-mode with `stringChar = "'"`.
5. Iterates `am, we offset…` waiting for a closing `'`. If a closing `'` happens later in the source (e.g. `'undefined'` in a STRING literal of the outer code), it may CLOSE string mode at the wrong position — corrupting depth tracking. If no closing `'` exists at all, the function reaches EOF with depth never returning to 0 → returns `-1`.

`findMatchingParen` is called from `splitRootAndChain` (pS:2541), `extractParenContent` (pS:2638), and the chain-arg paths in `parseRoot` (pS:1305, 1399, 1491, 1618). When it returns `-1`, the caller cannot determine where the root call ends and falls back to bareCode.

### Site 2: `splitArgsWithOffsets` (parseStrudel.ts:2664-2747)

```ts
function splitArgsWithOffsets(argsStr: string): Array<{ value: string; offset: number }> {
  // ...
  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i]
    if (inString) { /* ... */ }
    if (ch === '"' || ch === "'" || ch === '`') {   // ← same bug
      inString = true
      stringChar = ch
      // ...
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++
    // ...
    if (ch === ',' && depth === 0) { pushCurrent(); /* ... */ }
  }
}
```

Same class of bug. Called from `splitArgs` (pS:2647), which is used by `.layer` (pS:1841), `.pick` array literals (pS:2098), and `splitFirstArg` (pS:2753). When the apostrophe in a `// comment` puts the walker into string-mode, subsequent commas inside the same conceptual line are NOT detected as arg separators → the args mis-split → caller bails to opaque/bareCode.

### Reference walkers that DO handle `//` correctly

For provenance and to show this is a known-good shape:

- **`stripParserPrelude`'s depth walker** (parseStrudel.ts:266-317) is a different walker that handles MULTI-LINE prelude calls. It does NOT have `//` skipping because preludes don't contain inline `// comments` in our corpus (they're whole-line skipped by the outer loop at pS:246).
- **`splitTopLevelStatements`** (parseStrudel.ts:414-417) DOES handle `//` correctly:
  ```ts
  if (ch === '/' && body[i + 1] === '/') {
    while (i < body.length && body[i] !== '\n') i++
    continue
  }
  ```
- **`skipWhitespaceAndLineComments`** primitive (parseStrudel.ts:1075-1094) is the PV49 reference: consumes whitespace + `//` line comments to EOL+newline. This is what `applyChain`'s inter-method scan uses (pS:1714).

The fix is to apply the SAME `//` skip branch from `splitTopLevelStatements` into the two walkers at Site 1 + Site 2. PV49-spirit: line-comment tolerance at a new walker site.

## R-3 — Recommended fix shape

**Class:** INTERNAL (D-02 outcome 1 from the CONTEXT — clean single-blocker; the fix is local to our parser; NO upstream RESEARCH needed; the Strudel transpiler handles `// comments` natively via `acorn.parse` upstream, so OUR parser is the divergent point).

**Surface:** parseStrudel.ts — two helper functions.

### Fix 1: `findMatchingParen` (parseStrudel.ts:2598-2628)

Pre:
```ts
for (let i = startIdx; i < str.length; i++) {
  const ch = str[i]
  if (inString) {
    if (ch === stringChar && str[i - 1] !== '\\') inString = false
    continue
  }
  if (ch === '"' || ch === "'" || ch === '`') { /* ... */ }
  // ... paren depth ...
}
```

Post:
```ts
for (let i = startIdx; i < str.length; i++) {
  const ch = str[i]
  if (inString) {
    if (ch === stringChar && str[i - 1] !== '\\') inString = false
    continue
  }
  // 20-21 (#143 re-pose) — `//` line comments mask string-quote semantics.
  // An odd-count apostrophe inside a `// comment` (e.g. `// ma'am`) must
  // NOT put the walker into string mode. PV49-spirit: line-comment
  // tolerance at the chain-arg walker site (vs the existing site at
  // splitTopLevelStatements:414-417). Consume to EOL.
  if (ch === '/' && str[i + 1] === '/') {
    i += 2
    while (i < str.length && str[i] !== '\n') i++
    continue   // i++ in for-header lands on \n which advances normally
  }
  if (ch === '"' || ch === "'" || ch === '`') { /* ... */ }
  // ... paren depth ...
}
```

### Fix 2: `splitArgsWithOffsets` (parseStrudel.ts:2664-2747)

Pre:
```ts
for (let i = 0; i < argsStr.length; i++) {
  const ch = argsStr[i]
  if (inString) { /* ... */ }
  if (ch === '"' || ch === "'" || ch === '`') { /* ... */ }
  if (ch === '(' || ...) { depth++; ... }
  if (ch === ',' && depth === 0) { pushCurrent(); ... }
}
```

Post — add the same skip BEFORE the string-quote test:
```ts
for (let i = 0; i < argsStr.length; i++) {
  const ch = argsStr[i]
  if (inString) { /* ... */ }
  if (ch === '/' && argsStr[i + 1] === '/') {
    // 20-21 (#143 re-pose) — consume `// comment` to EOL so an odd-count
    // apostrophe inside the comment doesn't corrupt string-mode tracking,
    // and so a `,` inside a comment is not mis-counted as an arg separator.
    // The comment chars stay in `current` (the slice contract for the arg
    // text is unchanged — comment lines are preserved verbatim inside the
    // arg's body). Mirrors splitTopLevelStatements:414-417 exactly.
    if (current.length === 0) currentStart = i
    while (i < argsStr.length && argsStr[i] !== '\n') {
      current += argsStr[i]
      i++
    }
    if (i < argsStr.length) {
      current += argsStr[i]   // newline goes into current too
    }
    continue
  }
  if (ch === '"' || ...) { /* ... */ }
  // ... rest unchanged ...
}
```

**PV49 spirit:** line-comment tolerance at a new walker call site. Mirrors the existing `splitTopLevelStatements` skip exactly. The PV49 catalogue addendum should note this as an additive occurrence at a new site class (chain-arg walker, not inter-element-scan).

**PV50:** no new state. Both walkers are stack-local; no module-level changes.

**PV52 / PV54:** NOT triggered. No new IR shape; no new top-level PatternIR tag.

**Loc-fidelity:** the offset arithmetic is unchanged for the no-comment case (a `current` that never contained a `//` is byte-identical pre/post; `currentStart` is set on first non-whitespace contribution same as before). The 20-15 α-4 OFFSET CONTRACT in `splitArgsWithOffsets` (pS:2685-2693) is preserved: `consumed` is still computed from the same `current` and the slice/offset stay in lockstep.

**Why two sites (not one):** `findMatchingParen` is on the root-boundary path (where does the call end?); `splitArgsWithOffsets` is on the arg-comma path (how to split sibling args?). Both are exercised by `-7LU6zgzViSM`'s `.layer(arrow1, arrow2)` — the outer chord call's paren-close (`)`) requires `findMatchingParen` to skip past arrow2's comment, AND the `,` between arrow1 and arrow2 requires `splitArgsWithOffsets` to not mis-attribute string state. The fix is symmetric across both.

## R-4 — Backlog audit per-issue probe shapes

The audit is CLASSIFY-only per D-03 (CONTEXT). Each per-issue probe is a RUN-classify spec the executor adds (mirroring the Wave-0 spec shape) plus a `gh issue comment` + `gh issue close` (where applicable). No fixes outside the gate-bearing class.

### Issue #156 — "20-17 V-1 N=50 measurement surfaced 1 uncategorised Code-fallback — triage and classify"

**Title:** triage placeholder filed by 20-17 V-4 for 1 uncategorised sample in the 2026-05-19 fresh measurement.

**Probe:** the original artifact (`samples-2026-05-19T13-24-45-538Z.json`) was the 20-17 measurement; 20-18 / 20-19 / 20-20 shipped multiple chain-root + segmenter + side-effect-strip fixes since then. The CURRENT 2026-05-21 measurement (`samples-2026-05-21T12-51-24-407Z.json`, 49/50) has only `-7LU6zgzViSM` as residual.

```ts
// 20-21 Wave 0 RUN-classify probe for #156
// Re-run the 20-17 artifact through the CURRENT parser and capture
// per-sample verdicts. Compare with the 20-17-recorded
// "uncategorised" hash.
import fs from 'node:fs'
import { parseStrudel } from './ir/parseStrudel'
const j = JSON.parse(fs.readFileSync('packages/app/tests/parity-corpus/.bakery-runs/samples-2026-05-19T13-24-45-538Z.json', 'utf8'))
const isFB = (ir: any) => {
  const b = ir?.tag === 'Track' ? ir.body : ir
  return b?.tag === 'Code' && b.via === undefined
}
for (const s of j.samples) {
  console.log(s.hash, isFB(parseStrudel(s.code)) ? 'CODE' : 'STRUCTURED')
}
```

**Expected disposition decision tree:**
- If the 2026-05-19 "uncategorised" hash now STRUCTURES on current main → CLOSE-as-superseded (the 20-18/20-19/20-20 work incidentally closed it).
- If it still bareCodes AND the auto-classifier in `parity-bakery.mjs` now matches it to a known class → REFINE issue with the matched class.
- If it still bareCodes AND remains uncategorised → REFINE issue with the executed observation + sample's first-line shape; leave open for 20-22+.

**Expected outcome:** CLOSE-as-superseded (high prior — 20-17 had ~14% residual; current is 2%, so most 20-17 residuals were closed by intervening phases).

### Issue #153 — "parseStrudel: multiple sibling bare top-level pattern statements → Code-fallback (20-16 V-1 backlog)"

**Title:** the `sound("hh*4")\nsound("[bd bd][sd bd] bd sd")` shape — two top-level pattern statements with no `stack(...)` wrap, no `let/const/var` binding.

**Probe:**
```ts
// 20-21 Wave 0 RUN-classify probe for #153
import { parseStrudel } from './ir/parseStrudel'
const src = `sound("hh hh hh hh")\nsound("[bd bd][sd bd] bd sd")\n\n// @version 1.0`
const ir: any = parseStrudel(src)
const b = ir?.body ?? ir
console.log('body.tag=', b.tag, 'via=', b.via?.method)
// Also: the upstream LAST-WINS verdict from 20-20 — single-stmt
// `sound("a")` already structures; two siblings should also structure if
// the implicit-stack recognition shipped in 20-20.
```

**Expected disposition decision tree:**
- If body STRUCTURES (tag !== 'Code' OR via !== undefined) → CLOSE-as-superseded. 20-20 RESEARCH §R-4 records the 20-20 Wave-0 verdict on `sound("a")\nsound("b")` already structuring; this audit re-confirms on real main.
- If still bareCodes → REFINE with current observation; leave open. NOT in this phase's fix scope (different class — would need `buildBindingMap` wrap-implicit-stack, which is out per CONTEXT OUT-of-scope item).

**Expected outcome:** RE-CONFIRM via RUN; likely CLOSE-as-superseded if 20-20's implicit-multi-stmt-handling actually shipped (verify by reading the 20-20 SUMMARY before closing).

### Issue #149 — "parseStrudel: note(`template-literal`) root + .cpm(binding) — secondary blockers for -72eEl7NwK9e / -1j62z5xjyCN (20-16 Task-1 backlog, D-03 discipline)"

**Title:** two specific Bakery hashes with template-literal `note(\`...\`)` root + `.cpm(<binding>)` chain.

**Probe (per hash):**
```ts
// 20-21 Wave 0 RUN-classify probe for #149
// Note: -1j62z5xjyCN was bonus-closed in 20-19 per the project memory.
// Remaining target is -72eEl7NwK9e (or any current-sample equivalent).
import { parseStrudel } from './ir/parseStrudel'
import fs from 'node:fs'
const samples = JSON.parse(fs.readFileSync('packages/app/tests/parity-corpus/.bakery-runs/samples-2026-05-21T12-51-24-407Z.json', 'utf8'))
for (const target of ['-72eEl7NwK9e', '-1j62z5xjyCN']) {
  const row = samples.samples.find((s: any) => s.hash === target)
  if (!row) { console.log(target, 'NOT IN current sample'); continue }
  const ir: any = parseStrudel(row.code)
  const b = ir?.body ?? ir
  console.log(target, 'body.tag=', b.tag, 'via=', b.via?.method)
}
```

**Expected disposition decision tree:**
- If hashes are NOT in current 2026-05-21 sample → the Bakery sample population has rotated; the originally-identified blockers may have aged out; CLOSE-as-stale or REFINE with current-sample equivalents.
- If hashes are present + STRUCTURE → CLOSE-as-superseded.
- If hashes are present + bareCode → REFINE with current observation; if the bareCode is in the SAME class as `-7LU6zgzViSM`'s apostrophe-in-comment fix, BONUS-CLOSE inside this phase; otherwise leave open.

**Expected outcome:** STALE on `-1j62z5xjyCN` (per memory — bonus-closed 20-19). Live-RUN on `-72eEl7NwK9e` to confirm. Likely REFINE-or-CLOSE per actual verdict.

### Issue #147 — "parseStrudel: capture samples() registrations into a side-channel (autocomplete/alias substrate)"

**Title:** the DEFERRED other half of `#142` (the strip-only ship): capture `samples(...)` registered names into a side-channel for a future autocomplete/alias consumer.

**Probe:** NONE — this is a FEATURE, not a parser bug. The 20-16 D-03 strip-only decision intentionally deferred the capture half.

**Expected disposition decision tree:**
- This is OUT-OF-SCOPE for the 20-21 audit class (the audit is parity-class triage; #147 is a product-feature decision).
- REFINE the issue body with a comment noting "still deferred; awaits autocomplete/alias consumer to define the capture shape; no parser change pending."
- OR CLOSE-as-feature-out-of-scope if the user wants to retire the placeholder.

**Expected outcome:** REFINE-with-product-note. Do NOT close without user sign-off (the issue is a deliberate feature placeholder, not a bug residue).

## R-5 — Permanent CI fixture shape

**Class:** chain-arg walker tolerance to `//` line comments containing odd-count apostrophes. Two fixtures, mirroring the 20-19/20-20 positive + NEGATIVE-control cadence.

### `bakery-143-apostrophe-in-chain-arg-comment.strudel` (positive — STRUCTURED post-fix)

Minimal distillation: the apostrophe-in-`//`-comment inside a `.layer(arrow, arrow)` arg.

```
stack(
  stack(sound("bd")).bank("R"),
  stack(chord("<G#m>").dict("ireal").layer(
    x=>n("a").set(x),
    x=>n("b").set(x)
        // ma'am
        .mode("c4"),
  ))
).cpm(28)
```

**Asserts:** `parseStrudel(src).body.tag !== 'Code'` OR `parseStrudel(src).body.via !== undefined` (the `.cpm` `via`-wrap is acceptable per the structured-opaque shape).

Stretch shape (closer to the actual exemplar — closes the gate-bearing FLIP claim):
```
stack(
  stack(sound("bd")).bank("R"),
  stack(chord("<G#m>").dict("ireal").layer(
    x=>n("a").set(x).mode("c2"),
    x=>n(run(4).rev()).set(x)
      // This is a green piece ma'am, we offset everything here o_0
      .off(1/8, x=>x.add(7))
      .mode("c4")
      .jux(rev),
  ))
).cpm(28)
```

### `bakery-143-NEGATIVE-no-apostrophe-comment.strudel` (negative-control — STRUCTURED both pre + post)

Same shape minus the apostrophe-comment:

```
stack(
  stack(sound("bd")).bank("R"),
  stack(chord("<G#m>").dict("ireal").layer(
    x=>n("a").set(x),
    x=>n("b").set(x)
        // maam
        .mode("c4"),
  ))
).cpm(28)
```

**Asserts:** same `body.tag !== 'Code' || body.via !== undefined`. Pre-fix this STRUCTURES (proven by W3); post-fix it MUST still STRUCTURE (no regression). If post-fix the positive STRUCTURES while the NEGATIVE bareCodes, the fix's `//` skip is over-consuming — STOP, re-pose.

### Optional: rename the existing `bakery-143-guarded-boot.strudel`

The existing fixture (`packages/app/tests/parity-corpus/bakery-143-guarded-boot.strudel`) still validates `GUARDED_BOOT_RE` and is keeping a useful invariant alive. Recommend KEEPING it (its provenance is the 20-16 V-2 ship; removing it would lose that anti-drift). Rename in spirit by adding a note to BAKERY-FIXTURES.md clarifying the 143-prefix is now split across TWO classes (guarded-boot recognition + apostrophe-in-comment chain-arg walker).

## R-6 — Gate measurement plan

Mirror 20-19/20-20 §R-7:

1. **Editor tests:** `pnpm --filter @stave/editor test` — must hold 1627/1627 pre + post; the fix is purely additive (`//`-skip branch added; existing branches untouched), so no test count change is expected.
2. **App tests:** `pnpm --filter @stave/app test` — must hold 413/413 (parity-corpus 48 + loc-fidelity 48) pre. Post-fix: +2 corpus rows (positive + NEGATIVE-control fixture) + +2 loc-fidelity rows (one per fixture) → expected 417/417.
3. **Parity:bakery N=50:** `pnpm parity:bakery --n 50` with upstream pin `f73b395648645aabe699f91ba0989f35a6fd8a3c` and a FRESH ISO stamp. Arithmetic: 49 + 1 = 50/50 = 100.0%. Floor (must-not-regress): 49/50 = 98.0%.
4. **Cross-wave loc-fidelity STOP gate (V-3 cadence):** full-corpus per-file loc-fidelity probe verifies no offset arithmetic drift from the new `//` skips in the two walkers. The fix is loc-additive by construction (no slice repositioning; the skip consumes chars into `current` for `splitArgsWithOffsets` and just increments `i` for `findMatchingParen`).

### New P68 grep anchors (added to the catalogue post-ship)

- `findMatchingParen.*\/\/[^\\n]*\\n` — assert the `//` skip branch is present in `findMatchingParen`.
- `splitArgsWithOffsets.*\/\/[^\\n]*\\n` — assert the `//` skip branch is present in `splitArgsWithOffsets`.
- `// 20-21 \(#143 re-pose\)` — anchor the provenance comment.

## R-7 — Pre-mortems (5 ways this plan goes wrong)

### PM 1: RESEARCH bisect misses a SECOND blocker

The 20-21 Wave 5 isolates the apostrophe-in-comment blocker, BUT the fix may not fully flip the production exemplar if there's a SECOND class hidden behind it (e.g. once the apostrophe-comment is handled, the chain-arg walker successfully parses the layer args, exposes some OTHER bareCode trigger downstream). Mitigation: PLAN's Wave A includes a post-fix RE-CONFIRMATION probe on the FULL `-7LU6zgzViSM` source. If the FULL exemplar still bareCodes post-fix, Wave A re-bisects on the post-fix source. The 20-21 D-01 stage-2 PK16 stage-trace fallback applies. PK18 STOP if a third pose surfaces.

### PM 2: Fix doesn't flip the production exemplar (encoding / line-endings)

RESEARCH ran the bisect on TS-string-literal variants. The production exemplar comes from the Bakery samples JSON (real CRLF? UTF-8 BOM? smart-quote `'` U+2019 vs ASCII `'` U+0027?). Mitigation: Wave 0 RE-CONFIRMATION runs the bisect probe variants on the EXACT exemplar source loaded from the samples JSON, not from a TS string literal. Compare the first-failure variant from RESEARCH with the production exemplar character-by-character if disagreement appears.

### PM 3: P50 workaround cascade

If a Wave A probe shows the fix doesn't flip and the urge fires to add a second `//`-skip elsewhere or to extend the apostrophe-handling logic with special cases — STOP. The framing is wrong; re-pose D-01 with the new evidence. Single decision per cycle.

### PM 4: Loc-fidelity drift from the `splitArgsWithOffsets` `//` skip

`splitArgsWithOffsets` keeps `currentStart` and `current` in lockstep (the OFFSET CONTRACT at pS:2685-2693). The fix appends comment chars to `current` while incrementing `i`; the `currentStart` is set on the FIRST non-skip contribution. If a comment is the FIRST char of an arg (after the `,`), `currentStart` would be set TO the comment's `/` position, then the comment chars are pushed, then real arg chars are pushed. The trim() in `pushCurrent` (pS:2696) AND the `consumed = skipWhitespaceAndLineComments(current, 0)` (pS:2694) handle the leading comment skip correctly — `consumed` advances past the comment, and `offset` is `currentStart + consumed` which lands on the real arg's first char. So PV49's offset invariant holds. Mitigation: a unit test asserting `splitArgsWithOffsets("/*never*/x=>1, /*comment*/y=>2")` returns offsets at the `x` and `y` positions, not at the `/`s. Add to the existing `splitArgsWithOffsets.test.ts` (if absent, create as part of V-2).

### PM 5: V-1 fresh measurement comes in below 49/50 (regression)

Closing `-7LU6zgzViSM` should move parity 49 → 50. If a regression appears (≤ 48/50), the `//` skip is consuming MORE than intended — e.g. consuming past a string-literal that contains `//` as part of its content (e.g. `note("a // b")` — but inside `inString === true` the `//` check is gated by `if (inString) continue` BEFORE the `//` check, which is the intended order; the fix preserves this). Mitigation: D-04 floor is 49/50; PK18 STOP on any regression; diff fresh vs baseline sample-by-sample; never amend floor downward.

## Anticipated gray areas

**None new** — D-01..D-04 from the CONTEXT are sufficient. The Wave 5 bisect's apostrophe-in-comment isolation makes:

- D-01 outcome → Outcome 1 (clean single-blocker — apostrophe-in-comment chain-arg walker class).
- D-02 outcome → Internal class (no upstream RESEARCH; the fix is in our parser's char-by-char walkers, which diverge from Strudel's `acorn.parse`-based JS parsing in the trivial way of "we hand-rolled walkers and forgot to skip `//`"; no Strudel-semantics question).
- D-03 outcome → gate-bearing fix scope is `findMatchingParen` + `splitArgsWithOffsets`; the backlog audit is CLASSIFY-only per the per-issue probes in R-4.
- D-04 outcome → dual gate 100% + must-not-regress 98%; arithmetic 49 + 1 = 50.

The 20-21 CONTEXT's pre-mortem candidates (trailing-URL-comment / `@version` / depth-walker exit) are all FALSIFIED by Wave 1-2. The CONTEXT's primary working hypothesis (`stripParserPrelude` depth-walker exit needs `//`-tolerance) is FALSIFIED by V4 (drop first line, still bareCodes). This is **P70 occurrence 9 confirmed** — the 20-16 cascade classified `#143` as "guarded-boot recognition gap," but the actual blocker for `-7LU6zgzViSM` is a different class entirely (chain-arg walker comment-tolerance). The GUARDED_BOOT_RE ship in 20-16 is still correct for the prelude-recognition surface, but it never closed `-7LU6zgzViSM` because that exemplar's body has an additional, independent blocker. Add as P70 occurrence-9 to the hetvabhasa catalogue post-ship.

## Catalogue addenda planner should write post-ship

- **P70 occurrence-9** — `#143` classified as guarded-boot recognition gap by 20-15/20-16; actual blocker for `-7LU6zgzViSM` is apostrophe-in-comment-inside-chain-arg walker; 20-21 RESEARCH bisect surfaced the truth via 9-wave progressive strip. Lesson: when an exemplar STILL bareCodes after a recognition extension ships, RUN the bisect on the exemplar BEFORE accepting the close — don't trust shape-matching alone.
- **PV49 addendum (20-21)** — line-comment tolerance extension to chain-arg walker site: `findMatchingParen` + `splitArgsWithOffsets`. Mirrors the existing `splitTopLevelStatements` skip at pS:414-417.
- **PK16** — no stage-number change; the fix lives in stage-2 helpers (chain-arg walkers).
- **PK17** — friction-first; the audit sweep is a step-2-pass classify activity (NOT a fix activity).

## Files cited (absolute paths)

- `/Users/mrityunjaybhardwaj/Documents/projects/struCode/packages/editor/src/ir/parseStrudel.ts` (gate-bearing surface)
  - `findMatchingParen` pS:2598-2628 (Site 1 fix)
  - `splitArgsWithOffsets` pS:2664-2747 (Site 2 fix)
  - `splitTopLevelStatements` pS:414-417 (reference `//` skip)
  - `skipWhitespaceAndLineComments` pS:1075-1094 (PV49 primitive)
  - `wrapAsOpaque` pS:73-86 (returns `tag: 'Code'` with `via`; STRUCTURED per classifier)
  - `GUARDED_BOOT_RE` pS:228-229 (20-16 V-2 ship; correct for prelude; not the blocker)
  - `applyMethod` switch pS:1777+ (the `.cpm` red-herring path — defaults to `wrapAsOpaque`)
- `/Users/mrityunjaybhardwaj/Documents/projects/struCode/packages/app/tests/parity-corpus/_bakery-classify.spec.ts` lines 32-41 (the `isCodeFallback` definition)
- `/Users/mrityunjaybhardwaj/Documents/projects/struCode/packages/app/tests/parity-corpus/.bakery-runs/samples-2026-05-21T12-51-24-407Z.json` (current 50-sample artifact; `-7LU6zgzViSM` row contains the canonical exemplar source)
- `/Users/mrityunjaybhardwaj/Documents/projects/struCode/packages/app/tests/parity-corpus/bakery-143-guarded-boot.strudel` (existing 20-16 V-2 fixture; recommended to KEEP unchanged)
- `/Users/mrityunjaybhardwaj/Documents/projects/struCode/packages/app/scripts/parity-bakery.mjs` (parity harness driver; per-sample classifier output)
- `/Users/mrityunjaybhardwaj/Documents/projects/struCode/.planning/phases/20-musician-timeline/20-21-CONTEXT.md` (D-01..D-04 locked)
- `/Users/mrityunjaybhardwaj/Documents/projects/struCode/.anvi/hetvabhasa.md` (P70 cadence rows; P50; P67; P68; P69)
- `/Users/mrityunjaybhardwaj/Documents/projects/struCode/.anvi/vyapti.md` (PV49 addenda; PV50; PV52; PV54)
- `/Users/mrityunjaybhardwaj/Documents/projects/struCode/.anvi/krama.md` (PK16/PK17/PK18 cadence)

## RESEARCH COMPLETE

**Output:** `.planning/phases/20-musician-timeline/20-21-RESEARCH.md`
**Confidence:** HIGH (9-wave RUN-grounded bisect; root cause cited at parseStrudel.ts:2598-2628 + :2664-2747; mechanism reproduced + falsified in matched negative-control)
**Boundaries scanned:** 4 (prelude-strip, chain-arg walker, chain-method switch, parity classifier)
**Risks identified:** 5 (PM 1-5 above)
**P70 occurrence:** YES — occurrence-9 (cascade-misclassification of `#143`)
**External research needed:** NO (D-02 internal class)
