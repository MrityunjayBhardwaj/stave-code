# Predicate audit — `ir/parseStrudel.ts`

Every anchored regular expression in `parseStrudel.ts`, the question it answers, and the
system that owns the right answer.

This file is a **census, not a plan**. It exists so that "find the next parser bug" becomes
"close a finite list". Nothing here changes behaviour, and no entry is an instruction to
refactor — the sequencing lives in the issue.

`predicateAudit.test.ts` re-derives the census from the source on every run and fails if the
two disagree, so a new predicate cannot be added without appearing here first.

---

## Why this file exists

`parseStrudel.ts` decides things about JavaScript source text and about Strudel's vocabulary.
It answers those questions itself, in hand-written regular expressions. Every other module in
the parse path asks somebody who already knows:

| module | asks | anchored regexes | lines |
|---|---|---|---|
| `ir/parseMini.ts` | krill | **0** | 397 |
| `ir/collect.ts` | — | **0** | 1419 |
| `ir/parseStrudelStages.ts` | — | **0** | 377 |
| `visualEdit/chunkDetect.ts` | acorn | **0** | 496 |
| `visualEdit/arrange/parse.ts` | acorn | **0** | 223 |
| **`ir/parseStrudel.ts`** | **nobody** | **42** | **3335** |

Every module that delegates has zero. The one that does not has forty-two. `parseMini.ts` is
the controlled before/after: 512 lines with a hand-rolled tokenizer, 397 lines and no anchored
regexes after it was rebuilt on krill.

(The five zeroes are a negative result, so they carry a control arm: the same query finds
anchored regexes in fifteen other `.ts` files in this package, and `parseMini.ts` retains two
*unanchored* single-character scans — `/[0-9.]/` and `/\s/` at `parseMini.ts:302,377` — which
locate a boundary rather than decide what a token means.)

### The failure mode is silence

A regular expression cannot express an infinite grammar, so every transcription here is
incomplete by construction. None of them throw. Three things happen instead, in increasing
order of harm:

1. **The node opaques.** It becomes `Code`, keeps its bytes, and loses its structure. Honest,
   and visible in the parity counts.
2. **The node changes meaning.** `.s("drum/kit")` stops being a literal sample name and is
   re-read as mini-notation.
3. **The node silently disappears.** `.every(2, fast(2*2))` produces an `Every` wrapping the
   *untransformed* pattern. There is no `Code` marker, no count movement, and no error — the
   IR simply asserts a transform that the source does not contain, and the view draws it.

Class 3 is the reason counting these is worth more than fixing them one at a time.

### How to read the "known-incomplete" column

Every case marked **observed** was run through `parseStrudel` against a control arm that
differs only in the property under test, and the two IR tag-paths compared. Cases marked
**reasoned** follow from the regex but were not run. Nothing here is asserted from reading
the regex alone without saying so.

---

## Category A — JavaScript syntax · owner: **acorn**

26 of the 42. `acorn` is already a dependency and is already used to parse this same source
text, three times, in `visualEdit/`. The package parses one document two different ways.

### A1 · "is this token a bare identifier?" — 4 sites

`substituteBoundIdentInArg:257` · `parseExpression:1313` · `parseRoot:1519` · `parseRoot:1959`

Owner: acorn (`Identifier`). **Transcribed.**

Known-incomplete: **observed** — a non-ASCII identifier is not recognised. `const café =
note("c3")` / `stack(café)` opaques the whole program; the ASCII control arm `cafe` yields a
structured `Play`. JS identifiers admit the full `ID_Start`/`ID_Continue` Unicode sets;
`[A-Za-z_$][\w$]*` admits a 63-character subset.

```regex
4x  /^[A-Za-z_$][\w$]*$/
```

### A2 · "is this a call expression, and what is the callee?" — 2 sites

`parseRoot:1579` · `parseRoot:1927`

Owner: acorn (`CallExpression.callee`). **Transcribed.**

Known-incomplete: **reasoned** — a computed or member callee (`lib.note(…)`, `fns["note"](…)`)
does not match, and a comment between callee and parenthesis (`note /*x*/ (…)`) does not match.

```regex
2x  /^([A-Za-z_$][\w$]*)\s*\(/
```

### A3 · "is this a variable declaration, and what are its name and initialiser?" — 1 site

`BINDING_RE:691`

Owner: acorn (`VariableDeclaration`). **Transcribed.**

Known-incomplete: **reasoned** — one declarator only (`const a = 1, b = 2` captures `a` and
the rest of the line as its initialiser), no destructuring, no `=` inside a preceding comment.

```regex
1x  /^(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]+)$/
```

### A4 · "is this an arrow function, and what is its body?" — 1 site

`parseTransform:2791`

Owner: acorn (`ArrowFunctionExpression`). **Transcribed.**

Known-incomplete: **observed, and this one fails silently (class 3 above)** — the parameter
must be a *single lowercase letter*. `.every(2, pp => pp.fast(2))` and `.every(2, (x) =>
x.fast(2))` both lose the `Fast` node entirely, against a control arm `x => x.fast(2)` that
keeps it. No opaque marker is emitted; the transform is simply absent from the IR.

```regex
1x  /^[a-z]\s*=>\s*[a-z]\s*\.(.+)$/
```

### A5 · "is this a string literal, and what is inside it?" — 15 sites

`classifyLiteralRhs:206,207` · `parseRoot:1714,1715,1815,1829,1837,1864` · `applyMethod:2175,2506,2596` ·
`parseParamArg:2838 (×2), 2844 (×2)`

Owner: acorn (`Literal` / `TemplateLiteral`). **Transcribed**, fifteen times, in six spellings
of the same question.

Known-incomplete: **observed** —
- An escaped quote terminates the string early. `.s("b\"d")` opaques; the control `.s("bd")`
  yields `Param:s`.
- Single quotes are accepted in some arms and not others, so support depends on which arm the
  text reaches. `.mask('1 0')` and `.struct('1 0')` opaque, while the double-quoted controls
  give `When` and `Struct`.
- The two charset-restricted arms at `2596` and `2838` decide meaning, not just shape:
  `.p("café")` opaques (control `.p("lead")` gives a `Track`), and `.s("drum/kit")` falls
  through to the mini-notation arm and is re-parsed as a pattern rather than a sample name
  (control `.s("bd")` stays a literal) — class 2.

Also **reasoned**: no escape sequence is ever decoded, so `"\n"` reaches the IR as two
characters; and `${…}` inside a backtick arm is treated as literal text.

```regex
4x  /^"([^"]*)"$/
2x  /^"[^"]*"$/
2x  /^'([^']*)'$/
1x  /^'[^']*'$/
1x  /^`([^`]*)`$/
1x  /^`[^`]*`$/
1x  /^\(\s*("[^"]*"|'[^']*'|`[^`]*`)\s*\)$/
1x  /^(?:"([a-zA-Z0-9_\-][a-zA-Z0-9_:.\- ]*?)"|'([a-zA-Z0-9_\-][a-zA-Z0-9_:.\- ]*?)')$/
1x  /^"([a-zA-Z0-9#_:-]*?)"$/
1x  /^'([a-zA-Z0-9#_:-]*?)'$/
```

### A6 · "is this statement a guarded call?" — 1 site

`stripParserPrelude:375` (`GUARDED_BOOT_RE`)

Owner: acorn (`ExpressionStatement` → `LogicalExpression` → `UnaryExpression`). **Transcribed.**
Recognises exactly one idiom, `typeof X !== 'undefined' && X(…)`, and the comment above it
already records that it is hand-maintained with no programmatic cross-reference.

Known-incomplete: **reasoned** — any other guard spelling (`if (typeof X !== 'undefined')`,
`X?.()`, `globalThis.X && X()`) is not recognised.

```regex
1x  /^[ \t]*typeof\s+\w+\s*!==?\s*['"]undefined['"]\s*&&\s*\w+\s*\(/
```

### A7 · "where does a line comment end?" — 1 site

`splitTopLevelStatements:537`

Owner: acorn (comment ranges via `onComment`). **Transcribed.**

Known-incomplete: **reasoned** — `//` inside a string or regex literal is treated as the start
of a comment, so `note("http://x")` loses the rest of the line during statement splitting.
(This runs on a copy used only to decide whether a segment is comment-only, which is what has
kept it from doing visible damage.)

```regex
1x  /\/\/.*$/
```

### A8 · "is this a labelled statement, and what is the label?" — 1 site

`extractTracks:1169`

Owner: acorn (`LabeledStatement`) for the syntax; the `$:` / named-track *convention* is
Strudel's. **Transcribed.** This site already carries a hand-written guard rejecting matches
inside brackets, strings and templates — which is the shape of the problem: a regex that needs
a second regex to undo its false positives is doing a parser's job.

Known-incomplete: **reasoned** — a label whose identifier is non-ASCII (as A1), and any `:`
adjacency the guard's bracket/string tracking does not model.

```regex
1x  /^[ \t]*(\/\/[ \t]*)?([A-Za-z_$][\w$]*)\s*:/gm
```

---

## Category B — Strudel vocabulary · owner: **`controls.mjs` / `signal.mjs` / krill**

16 of the 42. These ask "is this name one of Strudel's?" — the same question #928 routed
through `controls.mjs` for controls and #953 re-derived from `signal.mjs` for chain roots.
The remaining sixteen have not had that treatment.

### B1 · "is this call a pattern source, and what is its mini string?" — 10 sites

`parseRoot:1607,1614,1625` (`note`/`n`) · `1639,1645,1653` (`s`/`sound`) · `1666,1672,1679` (`mini`) ·
`1701` (the loose fallback)

Owner: `@strudel/core` `controls.mjs` for the names, krill for the string. **Transcribed** — and
transcribed as a 3×3 grid, because each of three name-groups is spelled once per quote style.
The count is a product of two independent transcriptions, which is why it is the largest
cluster in the file.

Known-incomplete: **reasoned** — the name list is a hand-picked five (`note`, `n`, `s`,
`sound`, `mini`) out of ~270 controls, so every other control reaching this position takes the
fallback path; and the argument must be a single bare string literal, so `note("c3" + x)` or
`note(seq)` does not match.

```regex
1x  /^(?:note|n)\s*\(\s*"([^"]*)"\s*\)/
1x  /^(?:note|n)\s*\(\s*`([^`]*)`\s*\)/
1x  /^(?:note|n)\s*\(\s*'([^']*)'\s*\)/
1x  /^(?:s|sound)\s*\(\s*"([^"]*)"\s*\)/
1x  /^(?:s|sound)\s*\(\s*`([^`]*)`\s*\)/
1x  /^(?:s|sound)\s*\(\s*'([^']*)'\s*\)/
1x  /^mini\s*\(\s*"([^"]*)"\s*\)/
1x  /^mini\s*\(\s*`([^`]*)`\s*\)/
1x  /^mini\s*\(\s*'([^']*)'\s*\)/
1x  /^(note|n|s|sound|mini)\s*\(/
```

### B2 · "is this call a time-sequencing combinator?" — 1 site

`parseTimeSequenceRoot:1411`

Owner: `@strudel/core` (the exported combinator set). **Transcribed** as a list of four.

Known-incomplete: **reasoned** — `timeCat`, `stepcat`, `seq`, `polymeter` and the rest of the
family are absent, and take the opaque path.

```regex
1x  /^(arrange|cat|slowcat|fastcat)\s*\(/
```

### B3 · "is this call `stack`?" — 1 site

`parseRoot:1764`

Owner: `@strudel/core`. **Transcribed.**

Known-incomplete: **observed** — the match is anchored at position 0 of the trimmed text, so a
leading block comment defeats it: `/*x*/stack(note("c3"))` opaques the whole program where the
control `stack(note("c3"))` yields a structured `Play`. Also **reasoned**: `overlay` and the
`,`-separated stack spelling are not this arm.

```regex
1x  /^stack\s*\(/
```

### B4 · "is this transform `fast(n)` / `slow(n)`?" — 2 sites

`parseTransform:2776,2783`

Owner: `@strudel/core` for the names, and `Number` for the argument. **Transcribed**, including
a fresh transcription of the number token as `[0-9.]+` — the same question `isNumericLiteral`
was created to own in #958, answered here a fourth time and differently.

Known-incomplete: **observed, silent (class 3)** — `fast(2*2)` and `slow(-2)` both drop the
transform node entirely against controls `fast(2)` / `slow(2)`, with no opaque marker.
`[0-9.]+` admits `1.2.3` and rejects `-2` and `1e3`. **Reasoned**: only `fast` and `slow` are
recognised here at all.

```regex
1x  /^fast\s*\(\s*([0-9.]+)\s*\)$/
1x  /^slow\s*\(\s*([0-9.]+)\s*\)$/
```

### B5 · "is this statement a setup/side-effect head?" — 2 sites

`stripParserPrelude:342` (`PRELUDE_CALL_RE`) · module scope `:676` (`SIDE_EFFECT_CALL_RE`)

Owner: `@strudel/core` `repl.mjs` (the setter/boot surface). **Transcribed** — twice, as two
lists that are *nearly* the same: `SIDE_EFFECT_CALL_RE` adds `all` and `PRELUDE_CALL_RE` does
not. Two copies of one vocabulary that have already drifted from each other by one entry.

Known-incomplete: **observed** — a setup head absent from the list opaques the whole program:
`setGain(0.5)` + `note("c3")` goes to `Code`, against a control `setcps(0.5)` that parses.

```regex
1x  /^[ \t]*(?:samples|useRNG|setcps|setCps|setcpm|setCpm|setVoicingRange|initAudio|aliasBank)\s*\(/
1x  /^[ \t]*(?:all|samples|setcps|setCps|setcpm|setCpm|useRNG|setVoicingRange|initAudio|aliasBank)\s*\(/
```

---

## Category C — transcriptions that are not regexes

Out of the gate's scope (it only sees anchored regular expressions), recorded here so the
audit is not read as complete when it is only complete for one syntactic form. These are the
five curated sets already enumerated in the issue:

| set | site | owner | status |
|---|---|---|---|
| curated FX arms | `applyMethod` switch, ~`:2376` | `controls.mjs` | partly routed via `asControlParam` (#935) |
| curated Param arms | `applyMethod` switch, ~`:2566` | `controls.mjs` | partly routed (#928 fallback) |
| `SIDE_EFFECT_CALL_RE` list | `:676` | `repl.mjs` | transcribed (also B5) |
| `CHAIN_ROOT_RECOGNISER` | module scope | `signal.mjs` | re-derived by a drift gate (#953) |
| `RESERVED_LABEL_IDENTS` | module scope | — | ours; no external owner |

`classifyLiteralRhs`'s numeric arm is **closed**: all three copies of `/^-?\d+(\.\d+)?$/` were
replaced by `isNumericLiteral`, which asks `Number` (#958). Confirmed still closed by
observation — `const n = .5` and `const n = 4` now produce the same IR shape.

---

## Totals

| category | owner | sites |
|---|---|---|
| A — JavaScript syntax | acorn | 26 |
| B — Strudel vocabulary | `controls.mjs` / `signal.mjs` / krill | 16 |
| **total anchored regexes** | | **42** |
| distinct sources | | 33 |

Of the 42, **zero** currently delegate. Eleven of the incompleteness claims above are observed
against a control arm; the rest are reasoned from the expression and marked as such.
