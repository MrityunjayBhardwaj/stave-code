---
phase: 20-15
confidence: HIGH
researcher: anvi-researcher
created: 2026-05-15T00:00:00Z
depends_on: 20-14 (α/β/γ merged on main, HEAD 5323975)
issues: ["#132", "#134", "#135", "#136", "#137", "#138"]
---

# Phase 20-15 Research — Strudel.cc parity hardening

All behavioral claims cite `packages/editor/src/ir/parseStrudel.ts:N`
(abbreviated `pS:N`) unless otherwise noted. The parser is a STRUCTURAL
MATCHER, not a JS interpreter — every finding below preserves that line.

---

## User Constraints (verbatim from 20-15-CONTEXT.md)

- **D-01:** Named label `name: pattern` parses AND wires fully into the
  timeline substrate — recognized as a `Track` with `trackId = label`,
  appears as a named row, slot identity source-anchored via the PV47/#119
  mechanism. Scope guard: the trackMeta-by-`slotKey` re-keying limitation
  stays deferred — not reopened here.
- **D-02:** Handle only `let/const x = <pattern>` defined once and
  referenced after definition. Reassignment, use-before-def, and shadowing
  → graceful `Code(BARE-FALLBACK)` (topology-preserving, not a crash).
- **D-03:** After the 6 fixes land, pull a larger fresh sample (~50) from
  the live Supabase `code_v1` backend, measure a statistically meaningful
  real-world parity %, classify any NEW fallback classes into the backlog
  (not necessarily fixed this phase). Vendor the 6 known repros as
  permanent regression fixtures alongside the 16 canonical tunes.
- **D-04:** Ship at ≥9/10 of the known set. `${}` template interpolation,
  function/arrow-fn binds, destructuring binds, full JS remain
  opaque-but-topology-preserving Code-fallbacks (correct behavior, not a
  gap).

---

## Boundary Analysis — `parseStrudel.ts` sub-boundaries

The 1532-line file is one boundary with six internal sub-boundaries. The
no-`$:` pipeline (PK16b) flows: **prelude-strip → split-root/chain →
parse-root → apply-chain**. The `$:`/label pipeline is the OTHER branch
(`extractTracks` → per-track `parseExpression`).

| Sub-boundary | fn:line | Transforms input how | What I verified vs did not know |
|---|---|---|---|
| **prelude-strip** | `stripParserPrelude` pS:124, regex pS:127-128 | Line-walks from char 0; skips blank lines (pS:139), whole-line `//` (pS:145), and depth-tracked multi-line recognised boot calls (pS:151-218). Returns `{body, offset}`; offset threads into `parseExpression` so `loc` stays valid vs ORIGINAL source (pS:257,264-266). | VERIFIED: skip set is exactly `samples|useRNG|setcps|setVoicingRange|initAudio|aliasBank` (pS:128). `setcpm` absent → G2. The depth walker (pS:161-212) already handles strings incl. backtick (pS:177) and `;` trailing (pS:197). |
| **split-root/chain** | `splitRootAndChain` pS:1324 | If `expr[0]==='"'` → scans to matching `"` escape-aware single-line (pS:1327-1338); else skips ident then matches paren via `findMatchingParen` (pS:1341-1349). Returns `{root, chain}`. | VERIFIED: backtick is NOT a recognised root opener here (only `"` at pS:1327) → G3 partly here. Identifier-start path (`let p1 = ...`) skips `let` as an ident at pS:1341, then sees ` ` not `(` → root=`let`, chain=` p1 = ...` → garbage → Code-fallback (G1 root cause). |
| **parse-root** | `parseRoot` pS:446 | Regex arms for `note/n("…")` pS:451, `s("…")` pS:460, `mini("…")` pS:473, `stack(…)` pS:486, bare `"…"$` pS:531. Each only accepts `"([^"]*)"` (no backtick, no newline, no inner chain). Fallback `IR.code(trimmed)` pS:539. | VERIFIED: every string arm uses `"([^"]*)"` — `[^"]*` excludes nothing but is bounded by `"`; `\n` IS allowed by `[^"]*` but `splitRootAndChain` single-line quote scan (pS:1331) breaks the root before a multi-line `"` ever reaches here. `note/n` arm pS:451 rejects `n("…".fast(2))` because regex demands `"…"\s*\)` immediately (#132). |
| **arg-splitter** | `splitArgsWithOffsets` pS:1461 (`splitArgs` pS:1443 wraps it) | Depth+string-aware comma split. Per-arg `pushCurrent` (pS:1471-1477) trims and computes offset = `currentStart + leadingWs` where leadingWs counts only `\s` (pS:1475). Does NOT skip `//` comments. | VERIFIED: a `// comment\n` line between args is accumulated into `current` verbatim (pS:1513-1516; `//` chars are not `(`,`)`,`,`,quote so they fall to the else branch). The arg becomes `// Industrial bass\nnote("e3 d#3")` → `splitRootAndChain` sees `/` first → garbage root → Code (G4). |
| **chain-walker** | `applyChain` pS:554, `extractNextMethod` pS:1365 | Already comment+newline tolerant via `INTER_METHOD_SEP = /^(?:\s+|\/\/[^\n]*\n?)+/` pS:572, applied at head each loop (pS:575-579). Offset arithmetic additive (pS:577,591-607). | VERIFIED: this is the ONE already-tolerant gap-free walker — the PV49 reference implementation. `findMatchingParen` (pS:1398) is string-aware but only `"`/`'` (pS:1411), NOT backtick — relevant to #132/G3 paren matching inside backtick args. |
| **extractTracks** | `extractTracks` pS:316, `dollarRe` pS:343 | `dollarRe = /^[ \t]*(\/\/[ \t]*)?\$:/gm` (pS:343). Per match: `dollarStart=m.index` (line start), `bodyStart` after `$:`+ws (pS:349-353), `commented=!!m[1]` (pS:354). Slices `code` between consecutive `dollarStart`s (pS:365-376). | VERIFIED: literal `$:` only — `p1: stack(...)` never matches (`$` is literal in regex, not a class) → `extractTracks` returns `[]` → no-`$:` branch → `splitRootAndChain` on `p1: stack(...)` → root=`p1`, chain=`: stack(...)` → Code (G5 root cause). Slice offsets are absolute into `code` (no `.trim()`, pS:313). |
| **collect→IR** | `collect.ts` Track arm :422-453 | `dollarPos` set OUTER-WINS at Track entry from `ir.loc?.[0]?.start` (collect.ts:447-450), threaded onto every event (collect.ts:322,447). `trackId` inner-wins (`.p()` override). | VERIFIED: the slot-identity substrate is `IREvent.dollarPos` (IREvent.ts:67 / collect.ts:199) → `groupSlotKey` `$${pos}` (MusicalTimeline.tsx:256-259) and `collectTopLevelSlots` `$${loc[0].start}` (MusicalTimeline.tsx:227-251). G5 must produce a Track whose `loc[0].start` = the label-line start. |

**Second `extractTracks` consumer:** `parseStrudelStages.ts:61` (RAW
stage). It consumes `expr/offset/dollarStart/end` (pStages:55-100). G5's
return-shape additions to `extractTracks` MUST stay additive (PV-style) or
this consumer regresses — it already reads `dollarStart`/`dollarEnd`
(pStages:90-91).

---

## PV49 — The shared `skipWhitespaceAndLineComments` walker (α substrate)

This is the load-bearing α deliverable. Per-call-site current logic,
file:line:

| Call site | Current skip mechanism | Tolerant? |
|---|---|---|
| `applyChain` pS:572-579 | `INTER_METHOD_SEP = /^(?:\s+|\/\/[^\n]*\n?)+/` matched at head, `remainingOffset += sep[0].length` | YES (γ cluster-B) — **reference behavior** |
| `stripParserPrelude` pS:139-148 | line-by-line: blank `trimmed===''` skip; `trimmed.startsWith('//')` skip; advances `i = lineEnd+1` | YES (whole-line only; different shape — line-oriented not offset-oriented) |
| `splitArgsWithOffsets` pS:1471-1477 | `pushCurrent` trims `\s` only via `/\s/.test` leading scan | **NO** — #137/G4 gap (no `//` handling) |
| `extractTracks` label scan pS:349-353 | skips only ` `/`\t` after `$:` (pS:351) | **NO** for G5 generalisation — needs to not mis-split commented/string `:` |

**Unified signature (recommended):**
```ts
/** Returns the index after any run of whitespace (incl. newlines) and
 *  whole-line/inline `// …` comments starting at `pos`. Offset-additive:
 *  caller does `base += skipWhitespaceAndLineComments(src,pos) - pos`.
 *  `${}` is NOT whitespace (real JS) — out of scope, never consumed. */
export function skipWhitespaceAndLineComments(src: string, pos: number): number
```

**Offset-arithmetic contract (the invariant that prevents drift):** the
return value is an ABSOLUTE index into `src`; consumed length =
`returned - pos`; every caller adds the consumed length to its running
base offset (same discipline as `applyChain`'s `remainingOffset += sep[0].length`
pS:577). It must consume `\s` (incl. `\n`) and `//`-to-EOL (the `\n` is
consumed too, matching `INTER_METHOD_SEP`'s `\n?`). It MUST NOT consume
`${` (PV49 scope note: `${}` is real JS, not whitespace).

**Migration order (lowest-risk first — Lokāyata cost-curve discipline):**
1. **Extract** the primitive; unit-test it standalone (no callers changed).
2. **Reroute `applyChain`** (pS:575-579) to call it in a loop — it is
   already tolerant, so the corpus snapshot MUST NOT change. This is the
   regression oracle: 16 corpus snapshots + 1551 editor tests unchanged
   proves the primitive matches the reference behavior byte-for-byte.
3. **Reroute `stripParserPrelude`** (pS:139-148) — shape differs
   (line-oriented). Lower priority; the existing line walker is correct.
   Recommendation to planner: leave prelude's line-loop AS-IS (it is not
   broken and re-shaping it to the offset primitive risks the depth-tracked
   multi-line call logic at pS:161-212). PV49 says "ONE shared primitive"
   but the prelude's whole-line skip is a DIFFERENT concern (line classifier,
   not inter-token skip). **Flag for planner: PV49's "four call sites" may
   over-state — prelude is arguably already correct and structurally
   distinct. Confirm in design whether to force-migrate or document the
   divergence.** (Confidence: MEDIUM — this is a design judgment, not a
   source fact.)
4. **Fix `splitArgsWithOffsets`** (G4) onto it — see G4 section.
5. **Fix `extractTracks`** (G5) onto it for the label-line classification.

---

## Wave α — G2 + shared walker + G4

### G2 (#135) — `setcpm`/`set*` skip-set omission

- **Exact regex to extend:** pS:127-128
  `/^[ \t]*(?:samples|useRNG|setcps|setVoicingRange|initAudio|aliasBank)\s*\(/`
- **Authoritative source for the family:** `20-14-OBSERVATIONS.md` §α-6
  (lines 13-71). KEY FINDING: `settingPatterns` (upstream
  `website/src/settings.mjs:154`) is `{theme, fontFamily, fontSize}` ONLY
  — these are **UI-only** (`onTrigger(..., false)` = no audio,
  OBSERVATIONS:32,54). They are CHAIN methods (`$: theme("dracula")`), NOT
  top-level boot calls. **The α-6 audit does NOT enumerate `setcpm`/`setcps`** —
  those are `@strudel/core` tempo setters, a different family from
  `settingPatterns`. **FLAG: issue #135's "reuse the α-6 settingPatterns
  audit as authoritative skip-set source" is based on a misreading — α-6
  covers theme/font UI setters, not tempo setters.** (Confidence: HIGH —
  read OBSERVATIONS.md:13-71 directly.)
- **Real authoritative source for tempo/global setters:** upstream
  `@strudel/core` controls + `website/src/repl/util.mjs` evalScope. The
  pin is Codeberg `uzu/strudel` SHA `f73b3956…` (`parity-refresh.mjs:81`).
  The known-needed additions from the issue + repro: `setcpm`. Likely
  family (verify against upstream in design): `setcpm`, `setCps`/`setCpm`
  (case variants — upstream exports `setcps`/`setcpm` lowercase; the
  case-variant claim in #135 is speculative — verify), `setGainCurve`,
  `setTime`. **Recommendation: add `setcpm` for certain (proven by repro
  pS:135 `setcpm(134/4)`); audit upstream `@strudel/core` `index.mjs`
  exports for the rest and add only pure no-return side-effect setters.**
- **Anti-drift mechanism:** the issue asks for cross-ref so it "can't
  drift again". The honest mechanism: a code comment at pS:125-128 citing
  the upstream file:line of the setter list + the pinned SHA, plus a test
  fixture per added setter. There is no programmatic cross-ref (the upstream
  list is not vendored). **Flag for planner: "derive from a single
  authoritative list" is not achievable without vendoring the upstream
  setter export — recommend the comment+SHA+per-setter-fixture approach
  and explicitly document why it is hand-maintained.**
- **Acceptance probe:** `parseStrudel('setcpm(120)\ns("bd")')` → structured
  Track(d1, Play). Cheapest Lokāyata: one-line node REPL.

### G4 (#137) — comment-only lines between `stack()` args

- **Root cause:** `splitArgsWithOffsets` pS:1479-1517. `//` chars are not
  matched by any branch (not quote pS:1488, not bracket pS:1496/1502, not
  top-level comma pS:1509) so they fall to the else (pS:1513-1516) and are
  accumulated into `current` verbatim. The arg substring then begins with
  `// comment\n` and `splitRootAndChain` (pS:1341) reads `/` as a
  non-identifier, non-`"` → root is empty/garbage → `parseRoot` fallback →
  `IR.code` (G4).
- **Fix via shared walker WITHOUT breaking offsets:** after `pushCurrent`
  computes the trimmed value+offset (pS:1471-1477), the cleaner fix is at
  the SPLIT level, not the trim level. Two viable approaches for the planner
  to choose:
  - **(a) skip inter-arg separators in the scan loop:** when at `depth===0`
    and not `inString`, before appending a char, if the upcoming run is
    whitespace/`//`-comment, advance `i` past it via
    `skipWhitespaceAndLineComments` and set `currentStart` to the new `i`.
    This keeps `currentStart` pointing at the first real char → offset
    additive contract holds (mirrors `applyChain` pS:577).
  - **(b) post-strip in `pushCurrent`:** generalise the leading-`\s` scan
    (pS:1475) to also consume leading whole-line `//` comments, adding the
    consumed length to `offset`. Smaller diff, but does NOT handle a `//`
    comment that appears AFTER content on the inter-arg gap (`s("bd"), // kick\n s("hh")`)
    — that comment is between the `,` and the next arg's first char, so it
    lands in the NEXT arg's leading region; (b) handles it, (a) handles it
    more robustly. **Recommend (b)** as the minimal correct fix consistent
    with PV49 (the leading-skip scan at pS:1475 IS the per-arg head walker;
    routing it through the shared primitive is exactly PV49's intent).
- **Offset proof:** `splitArgsWithOffsets` already adds `leading`
  (whitespace count) to `currentStart` (pS:1476). Extending `leading` to
  include `//`-comment runs keeps the SAME additive arithmetic — `offset`
  still = first-real-char index in `argsStr`, and the caller (`parseRoot`
  stack arm pS:498-501) adds `innerAbsOffset + a.offset` unchanged.
- **Trailing-comment subtlety (#137 point 3):** `s("bd"), // kick\nnote(...)`
  — the `// kick\n` is after the `,` (handled by pS:1509 comma branch
  resetting `currentStart = i+1` pS:1512) and is leading whitespace of the
  NEXT arg → handled by the same (b) extension. Verified by tracing
  pS:1509-1516.
- **Cheapest Lokāyata:** `parseStrudel('stack(\n// a\ns("bd"),\n// b\ns("hh")\n)')`
  → expect `Stack[Play,Play]` not `Stack[Code,Code]`; assert via the
  editor parity test harness (`unwrapD1`, parity.test.ts:76).

---

## Wave β — G3 + #132 (same `parseRoot` surface)

### G3 (#136) — backtick template-literal string args

Two distinct sub-boundaries must change (both VERIFIED as gaps):

1. **`splitRootAndChain` pS:1324-1356** — only `expr[0]==='"'` opens a
   bare-string root (pS:1327). A bare backtick root (`` `<bd hh>`.cpm(2) ``)
   would fall to the identifier branch (pS:1341), skip nothing (backtick
   not in `[a-zA-Z0-9_$]`), see no `(`, → root=`` (empty) → Code. Add a
   backtick arm mirroring the `"` scan but allowing `\n` inside (backtick
   strings legitimately span lines — pS:1331's single-line note does NOT
   apply to backticks). Escape-aware (`` \` ``).
2. **`parseRoot` pS:451-535** — the 5 string regexes all use `"([^"]*)"`.
   Add a backtick alternative. CRITICAL newline subtlety: `[^"]*` already
   matches `\n` (only `"` excluded), so the regex itself is newline-OK;
   the blocker is `splitRootAndChain` cutting the root at the first line.
   Add `` `([^`]*)` `` alternatives to: `note/n` (pS:451), `s` (pS:460),
   `mini` (pS:473), bare-string `^"…"$` (pS:531). Pass inner content to
   `parseMini` unchanged (mini semantics are quote-agnostic — VERIFIED
   against issue #136 + parseMini call sites pS:456,464,477,535).
3. **`findMatchingParen` pS:1398-1425** is string-aware for `"`/`'` ONLY
   (pS:1411). A backtick inside args (e.g. `stack(s(\`bd hh\`))`) would
   have its inner `(`/`)` (none in mini, but `${}` could) mis-depth. Add
   backtick to the string-char set at pS:1411. Same for the `inString`
   loop in `splitArgsWithOffsets` pS:1488 (only `"`/`'`). **This is a
   cross-cutting backtick-awareness change touching 3 paren/arg scanners
   — enumerate all in the plan.**
4. **`${}` → graceful Code-fallback (D-04):** detect `${` inside the
   matched backtick content; if present, do NOT call `parseMini` — return
   the existing `IR.code(trimmed)` fallback (pS:539). The detection is a
   simple `.includes('${')` on the captured group BEFORE constructing IR.
   This must be a clean fallback, never a throw (PV37 wrap-never-drop;
   `parseStrudel`'s outer try/catch pS:232/297 is the backstop but the
   correct behavior is the explicit `IR.code` branch).

### #132 — recursive parsing inside `note`/`n`/`s` args

- **Root cause:** `parseRoot` `note/n` arm regex pS:451
  `/^(?:note|n)\s*\(\s*"([^"]*)"\s*\)/` demands the closing `"` then `)`
  immediately — `n("[0,3]".fast(3).lastOf(4, fast(2)))` fails the `"\s*\)`
  anchor (there is `.fast(...)` between `"` and `)`). Same for `s` pS:460,
  `mini` pS:473.
- **Issue #132's proposed approach (capture verbatim, then assess):**
  1. Match OUTER call shape `^(?:note|n)\s*\(` (open paren only).
  2. Find matching close paren via brace-depth (same algo as
     `stripParserPrelude` pS:161-212 OR reuse `findMatchingParen` pS:1398).
  3. Pass inner-arg substring to `parseExpression` RECURSIVELY.
  4. If recursive parse returns typed IR → wrap in note/n constructor;
     if Code-fallback → existing opaque wrap.
  - Offset MUST thread additively (same as cluster-B).
- **Source-grounded refinement / conflict flag:** the issue says "wrap in
  `IR.note(parsed)` or similar". **There is NO `IR.note` constructor for
  this shape** — `parseRoot`'s note arm calls `parseMini(str, false, off)`
  (pS:456) which returns a Play-bearing IR directly; the arg to `n()` is a
  *mini-notation string*, not an arbitrary pattern. When the arg is
  `"…".fast(3)`, the correct decomposition is: inner ROOT is the mini
  string (`parseMini`), then `.fast(3).lastOf(...)` is a CHAIN on that
  root. So the right reuse is **`parseExpression(innerArg, innerOffset)`**
  — which already does split-root/chain + parseMini + applyChain. The note
  vs n vs s distinction (note→pitches, s→samples, n→indices) is encoded by
  the `isSampleKey` boolean passed to `parseMini` (pS:456 `false` for
  note/n, pS:464 `true` for s). Recursing through `parseExpression` loses
  that context for the inner bare string. **Design question for planner
  (open): does `n("0 2".fast(2))` need the inner `"0 2"` parsed with
  n-semantics (numeric index) vs note-semantics? Cheapest Lokāyata: run
  `parseStrudel('n("0 2".fast(2))')` against expected `Fast(2, Play(0),Play(2))`
  and inspect whether parseMini's `isSampleKey=false` default already
  yields correct values — likely yes, since note/n share `false` (pS:456).**
  (Confidence: HIGH on the conflict; MEDIUM on the resolution — needs the
  Lokāyata probe.)
- **β-1 PROBE RESOLUTION (2026-05-16, observed not inferred):**
  `parseExpression('"0 2".fast(2)')` → correct `Fast{Seq[Play 0, Play 2]}`
  (note/n `isSampleKey=false` default is correct — no threading needed for
  note/n). BUT `parseExpression('"bd".jux(rev)')` → inner `"bd"` becomes
  `Play note:"bd"` with NO `params.s`, duration 0.25; whereas
  `parseMini("bd", true)` → `Play note:"bd" params.s:"bd" duration:1`.
  isSample is NOT inert: for the `s(...)` arm the inner bare string MUST
  be parsed with `isSampleKey=true`. **Resolution: β-2's recursive arm
  MUST thread the caller's `isSampleKey` (s→true, note/n/mini→false) into
  the inner parse; plain `parseExpression` is UNSOUND for `s(...)`.**
- **Recommended shape:** in `parseRoot`, BEFORE the strict
  `note/n("…")\)` regex, add a "loose" arm: match `^(?:note|n|s|mini)\s*\(`,
  find matching `)` via `findMatchingParen`, take inner substring, and call
  `parseExpression(inner, innerOffset)` — but only when the inner is NOT a
  plain `"…"` (let the existing fast-path strict regexes handle the common
  case to avoid snapshot churn on the 15 structured tunes). Wrap result so
  the s-vs-note semantic is preserved (the inner bare-string-as-pattern arm
  pS:531 uses `isSampleKey=false`; an `s("bd".jux(rev))` wants `true`).
  **This s-context preservation is the load-bearing subtlety — flag it as
  the #1 pre-mortem for β.**
- **Out of scope per issue #132:** `stack(...)` arg recursion (already
  works pS:498-501), `${}` interpolation (G3/D-04), `mini("…")` recursion
  (fold in if cheap — same shape).

---

## Wave γ — G5 + G1

### G5 (#138) — named-label `name: pattern` syntax

- **Current `dollarRe` pS:343:** `/^[ \t]*(\/\/[ \t]*)?\$:/gm`. Capture
  group 1 = optional `//` prefix → `commented`. `$:` is LITERAL.
- **Generalised regex (issue proposal):**
  `/^[ \t]*(\/\/[ \t]*)?([A-Za-z_$][\w$]*)\s*:/gm` — group 2 = the label
  identifier (`$` is in `[A-Za-z_$]` so `$:` still matches with label=`$`,
  preserving exact current behavior — VERIFIED `$` ∈ class).
- **False-positive matrix (the load-bearing risk — `:` is ambiguous JS):**

  | Construct | Why it false-matches | Guard |
  |---|---|---|
  | object literal `{ a: 1 }` | `a:` at line start inside `{}` | depth-aware: only at brace/paren depth 0 (reuse `stripParserPrelude` depth walker pS:161-212 or `findMatchingParen` discipline) |
  | ternary `x ? y : z` | `: z` — but the `:` is not at line start AND there is a `?` at depth 0 earlier | the regex anchors `^[ \t]*ident\s*:` so `: z` mid-line never matches; a leading `label ? a : b` would match `label` then `?`≠`:` → the `\s*:` fails (next non-space is `?`). VERIFIED safe by regex shape. |
  | `http://` / `https://` in a string | `http:` then `//` | guard: line must not be inside a string/template (depth walker tracks `inString`); also `https` followed by `://` — the `\s*:` then `/` is fine but it is inside `"…"` → string-state guard rejects |
  | sample index `bd:3` in mini | inside `s("bd:3")` — but that is inside a string | string-state guard (same as above) |
  | `default:` / `case:` / TS label | statement labels — rare in Strudel code | enumerate as known non-track keywords OR accept (Strudel has no `switch`); low risk, document |
  | TS type annotation `const x: T` | `x:` after `const` | the `let/const/var` G1 detection runs first and consumes the binding line; also annotations are not Strudel idiom — low risk |

  **The single sufficient guard set:** (1) match must be at statement
  depth 0 (not inside `{}`/`()`/`[]`), (2) not inside a string/template/
  comment, (3) identifier is not a reserved non-track keyword. The
  `stripParserPrelude` depth walker (pS:161-212) already tracks paren/
  brace/bracket depth + string state incl. backtick (pS:177) — REUSE it,
  do not hand-roll (PV49 spirit). `extractTracks` currently does a pure
  regex scan (pS:346) with NO depth awareness — generalising it REQUIRES
  adding the depth walker. This is the biggest structural change in γ.
- **Full D-01 wiring path (label → trackId → dollarPos → collect →
  MusicalTimeline slot), every hop file:line:**
  1. `extractTracks` pS:359 — `starts.push({dollarStart: m.index, ...})`.
     Add captured label to the entry; `dollarStart` = `m.index` (LINE
     START, pS:357-359 — same anchor as `$:`).
  2. `extractTracks` pS:370/376 — push `{expr, offset, dollarStart, end,
     commented}` + NEW field `label` (additive — pStages:90 consumer is
     forward-compatible).
  3. `parseStrudel` pS:289-296 — the multi-track Stack arm currently sets
     `IR.track(\`d${i+1}\`, body, {loc:[{start:t.dollarStart,end:t.end}]})`.
     For a labelled track, use `IR.track(t.label, ...)` instead of
     `d${i+1}`. Single-track arm pS:278-282 same. **This makes `trackId`
     = the label** (D-01).
  4. `collect.ts` Track arm :444-452 — `childCtx.dollarPos = ctx.dollarPos
     ?? ir.loc?.[0]?.start` (OUTER-WINS, :447-450). Since the labelled
     Track's `loc[0].start` = label-line start (from step 2/3), every
     produced event carries `dollarPos = label-line-offset` (collect.ts:322).
  5. `MusicalTimeline.tsx:256-259` `groupSlotKey` → `$${dollarPos}` →
     source-anchored slot. `collectTopLevelSlots` :230-241 → `slotKey =
     $${loc[0].start}`, `displayLabel = outer.trackId` (= the label).
  - **Result:** the label IS the row name (no `.p()` needed) AND the slot
    is source-anchored — exactly D-01. The deferred trackMeta-by-slotKey
    re-keying (PV47) is NOT touched (MusicalTimeline.tsx:255 comment
    confirms slotKey is `$${pos}` based; trackMeta keyed on display
    trackId stays as-is — D-01 scope guard satisfied).
- **`$:`/named-label vs no-`$:` branch difference:** `$:`/label path goes
  `extractTracks → parseExpression(t.expr, t.offset)` (pS:279/291) with
  loc covering the prefix line (pS:281/293). The no-`$:` branch goes
  `stripParserPrelude → parseExpression` with synthetic `d1` (pS:257-267,
  no loc, userMethod undefined). G5 puts named labels on the FIRST path.
- **Mixed `$:` + `name:`:** the unified regex matches both in one scan
  (pS:346 loop) — slices interleave correctly because `dollarStart` is
  always line-start. Add an explicit test (issue #138 OOS note).
- **Cheapest Lokāyata:** (1) false-positive: a 5-line node script feeding
  `{ a: 1 }\nx ? y : z\n"https://foo"\np1: s("bd")` through the generalised
  regex+depth-guard, asserting ONLY `p1:` is captured. (2) wiring:
  `parseStrudel('p1: s("bd")\np2: s("hh")')` → assert
  `Stack[Track(p1,…), Track(p2,…)]` and that collect emits events with
  distinct `dollarPos`.

### G1 (#134) — top-level `let`/`const` bindings (hardest, last)

- **Root cause:** no-`$:` branch. `stripParserPrelude` explicitly does NOT
  skip `let/const/var` (pS:118 doc + pS:128 regex excludes them). After
  strip, `parseExpression` → `splitRootAndChain` sees `let p1 = n(...)` →
  identifier `let` then ` ` (no paren) → root=`let`, chain=` p1 = …` →
  `parseRoot` fallback → `IR.code` (whole program opaque). VERIFIED.
- **D-02 minimal model:** single-assignment `let|const|var <name> =
  <pattern-expr>` defined once, referenced AFTER definition. Reassignment /
  use-before-def / shadowing / arrow-fn / destructuring → graceful
  `Code(BARE-FALLBACK)` (topology-preserving, never crash).
- **Detection (depth-aware statement splitter):** reuse the
  `stripParserPrelude` depth walker (pS:161-212) to split the post-prelude
  body into top-level statements (`;` or newline at depth 0, string/
  template/comment aware). For each statement, regex
  `^\s*(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.+)$` (depth-0,
  single LHS identifier only — destructuring `{a,b}=` / `[a]=` does NOT
  match the `[A-Za-z_$]` LHS → graceful fallback per D-02).
- **Inline-expansion vs symbol-table — recommendation:** the issue offers
  both; D-02's "defined once, referenced after" + "topology-preserving"
  points to the SIMPLER **inline-expansion** model:
  - Parse each binding RHS via `parseExpression(rhs, rhsAbsOffset)` into an
    IR subtree, store in a `Map<name, PatternIR>`.
  - Parse the final (non-binding) expression. In `splitRootAndChain` /
    `parseRoot`, when a bare identifier matches a map key, substitute the
    bound subtree. The substituted subtree KEEPS its original RHS source
    offsets (loc fidelity → click-to-source lands on the DEFINITION). The
    issue flags this choice as revisitable; D-02 does not constrain it →
    **document definition-site loc as the v1 choice** (matches the issue's
    "Loc fidelity" note pS-issue-134).
  - **Cheaper partial (issue's alternative):** if the final expr is a
    single `stack(a,b,c)` of bare identifiers, expand inline without a
    general symbol table. This covers BOTH Bakery fixtures
    (`let p1 = … / let p2 = … / stack(p1,p2)` — issue #134 repro). **The
    `stack()` arg path already calls `parseExpression(a.value, …)` per arg
    (pS:498-501)** — the cleanest insertion point is: detect bare-identifier
    args in the stack splitter and resolve them against the binding map
    there. Recommend planner SCOPE to this partial first (covers the 2/10),
    treat general nested reference as stretch.
- **Graceful-fallback boundary (D-02), per source:** the binding-detection
  loop must, on ANY of {duplicate name (reassignment/shadowing),
  reference before its definition appears in statement order, RHS that is
  itself an unparseable expr, destructuring/arrow LHS} → abandon the
  symbol-table path and return the existing whole-program `IR.code(code)`
  (pS:298 catch is the backstop; the explicit branch is the correct path).
  Never throw — `parseStrudel`'s try/catch pS:232/297 must remain the last
  resort, not the mechanism.
- **Cheapest Lokāyata:** `parseStrudel('let p1=n("0 2").s("piano")\nstack(p1)')`
  → expect `Track(d1, Stack[…])` not `Code`; AND
  `parseStrudel('stack(p1)\nlet p1=n("0")')` (use-before-def) → expect
  graceful `Code` (not throw).

---

## D-03 — Live Supabase re-measurement + fixture vendoring

- **Backend shape:** REST GET
  `https://pidxdsxphlhzjnzmifth.supabase.co/rest/v1/code_v1?public=eq.true`
  with header `apikey: <anon>`. The anon key is PUBLIC and lives in
  upstream `website/src/repl/util.mjs` (NOT vendored in this repo —
  confirmed: no `supabase`/anon string in `packages/` or
  `~/.anvideck/projects/struCode/ref/`). The D-03 tooling must fetch it
  from upstream at the pinned Codeberg SHA (`f73b3956…`,
  `parity-refresh.mjs:81-84` is the existing upstream-fetch pattern to
  mirror). **Open: confirm the exact column name carrying the code body
  (`code`/`text`) and pagination (`Range`/`limit`) when implementing —
  not determinable from local source. (Confidence: MEDIUM.)**
- **Tooling to extend (do NOT rebuild):** `packages/app/scripts/parity-refresh.mjs`
  is the maintainer-only, never-CI, never-auto-commit upstream-drift tool
  (parity-refresh.mjs:11-22). D-03's Bakery sampler is a SIBLING script of
  the same class (maintainer-only, network, prints a report, exits 0). Add
  e.g. `parity:bakery` to root `package.json:10` next to `parity:refresh`.
- **Reproducible-but-not-CI-networked:** the CI gate is the vitest spec
  `packages/app/tests/parity-corpus/parity.test.ts` reading `*.strudel`
  files (parity.test.ts:47-50, snapshot per file). Live network is
  FORBIDDEN on CI (parity-refresh.mjs:13-15, parity.test.ts:17-24). So:
  the ~50-sample pull is a one-shot maintainer measurement; the
  REPRODUCIBLE artifact is (a) the measured % written into a phase
  SUMMARY/observation doc with the sample SHA/date, and (b) the 6 known
  repros vendored as `.strudel` fixtures that DO run on CI.
- **Fixture-vendoring format:** drop 6 files into
  `packages/app/tests/parity-corpus/` named e.g.
  `bakery-G1-let-binding.strudel` … `bakery-132-recursive-args.strudel`.
  The spec auto-discovers any `*.strudel` (parity.test.ts:47-50) and
  snapshots each — adding files = adding tests for free. Snapshot regen
  via `vitest -u` belongs in this phase's PR (allowed: 20-15 is the PR
  that legitimately changes parser behavior, so snapshot churn on the 6
  NEW fixtures + any structural improvement to the 16 is THE NEWS, per
  parity.test.ts:22-24). **The 15/16→ structured tunes' snapshots MUST NOT
  change** unless a fix structurally improves one (e.g. arpoon #132) —
  every snapshot diff on the original 16 must be explained in the PR body
  (parity.test.ts:18-21 drift policy).
- **CORPUS-SOURCE.md:** the 6 vendored Bakery fixtures are NOT
  upstream-`tunes.mjs` exports → they must be excluded from
  `parity-refresh.mjs` TARGETS (parity-refresh.mjs:40-57) or it will
  report them "missing upstream". Add a separate provenance note (Bakery
  permalink + id, like issue bodies) — recommend a `BAKERY-FIXTURES.md`
  beside `CORPUS-SOURCE.md`.

---

## P67 Risk Register — every `=== 'Code'` / Code-discrimination site

G1/G3/#132/G5 turn `IR.code(...)` (bare, `via===undefined`) into
structured nodes. P67: discriminate on `via`, never `tag==='Code'` alone.
Sites reachable by these changes:

| Site | file:line | Current guard | Needs `&& via===undefined`? |
|---|---|---|---|
| `parseExpression` bare-Code discriminator | pS:414-422 | ALREADY correct: `rootIR.tag==='Code' && (rootIR as {via?}).via===undefined` (pS:415) | OK — reference pattern; G1/#132 recursion flows through here, MUST keep |
| `parseRoot` fallback | pS:539 | `return IR.code(trimmed)` — produces bare Code (via undefined) | Producer, not discriminator — OK; G3/#132 add structured arms BEFORE this |
| `toStrudel` Code arm | toStrudel.ts:37-44 | branches on `ir.via` (`:43`) — wrapper re-emits chain, else `ir.code` | OK — already via-aware; verify G1 substituted subtrees round-trip (they are NOT Code, so fine) |
| `collect` Code arm | collect.ts:456-464 | branches on `ir.via` (`:461`) | OK — via-aware |
| `collect` `countLeavesInIR` | collect.ts:249-251 | `node.tag==='Code' && node.via?.inner` | OK — via-aware |
| `irProjection` node kind | irProjection.ts:88-90 | `case 'Code': if(node.via) return 'unmodelled'; return 'Code'` | OK — via-aware |
| `irProjection` children | irProjection.ts:251-252 | `return node.via ? [node.via.inner] : []` | OK — via-aware |
| `irProjection` :381 | irProjection.ts:381 | `n.tag==='Code' && n.via?.inner` | OK — via-aware |
| `serialize` validation | serialize.ts:278-292 | validates `via` shape when present | OK — additive; G1 nodes are not Code so untouched |
| `parseStrudelStages` RAW lifts | pStages:55-100 | EMITS bare `tag:'Code'` per track (`:90` adds `dollarStart/dollarEnd`) | **RISK:** G5 adds `label` to extractTracks return; this consumer reads the tuple — keep additive. Not a discriminator but a coupled consumer. |

**Conclusion:** every DISCRIMINATION site is already via-aware (P67 was
codified after 20-14 γ's one-round-trip cost — γ-SUMMARY:320-330). The
residual P67 risk is NOT existing guards but **new producer sites**: G1
inline-expansion, G3 backtick arms, #132 recursive arm, G5 Track must all
produce properly-tagged structured IR (NOT `tag:'Code'`) so they never
reach a `via`-check expecting a wrapper. The `parseExpression`
discriminator pS:414-422 is the chokepoint — any new structured-vs-bare
decision MUST mirror its `tag==='Code' && via===undefined` test.

---

## Invariants (existing + this phase)

- **PV49** (existing, α substrate) — one shared
  `skipWhitespaceAndLineComments(src,pos)→pos`; 4 nominal call sites;
  offset additive; `${}` out of scope. *Source-grounded refinement:*
  prelude's whole-line classifier (pS:139-148) is a structurally distinct
  concern from inter-token skip — recommend documenting the divergence
  rather than force-fitting (see α §migration step 3).
- **PV50** (existing) — per-evaluate engine accumulators reset at
  evaluate() entry. **Not touched:** 20-15 is pure-parser; no
  `StrudelEngine` changes. Flag only if a fix unexpectedly reaches the
  engine (it should not).
- **PV47/#119** (existing, D-01 substrate) — source-anchored slot identity
  via `IREvent.dollarPos` (collect.ts:199) → `$${pos}` slotKey
  (MusicalTimeline.tsx:256-259). G5 feeds this; trackMeta-by-slotKey
  re-keying stays deferred (D-01 scope guard).
- **NEW candidate (G5):** "`extractTracks` return tuple is append-only —
  both consumers (`parseStrudel` main pS:289, `parseStrudelStages` RAW
  pStages:61) read by field; new fields must be additive." Promote if a
  second consumer-coupling bug recurs.

## Krama (lifecycle)

- **PK16(b)** (existing) — no-`$:`: stripPrelude(1) → splitRootAndChain(2)
  → parseRoot(3) → applyChain(4). G2 extends stage-1 skip set; G3+#132
  extend stage-3; G4 fixes the stage-3 sub-walker (`splitArgsWithOffsets`);
  G1 inserts a NEW stage-0.5 (binding-map build) BEFORE
  `splitRootAndChain`, threading the map into stages 2/3. Offset threads
  through 3+4 vs ORIGINAL source — every new arm MUST preserve additive
  offset (pS:577 reference arithmetic).
- The `$:`/label path (`extractTracks`) is the OTHER branch; G5 generalises
  its matcher and wires trackId/dollarPos into collect (collect.ts:447) →
  MusicalTimeline slots. PK16 does not cover this branch — flag a krama
  addendum candidate for the label pipeline if G5 surfaces ordering bugs.

## Hetvābhāsa (error pattern to resist)

- **P67** — `Code` is tri-state {bare | opaque-via-wrapper | lang-embed};
  discriminate on `via`, not `tag==='Code'`. All existing discrimination
  sites verified via-aware (table above). The real risk class is NEW
  producers emitting bare Code where structured IR is expected, or
  emitting `tag:'Code'` that hits a via-expecting consumer. The
  `parseExpression` chokepoint pS:414-422 is the canonical test to mirror.

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Snapshot churn on the 15 structured tunes from any walker change | HIGH | α step 2: reroute `applyChain` to shared primitive FIRST, prove 16 snapshots + 1551 editor tests unchanged before any gap fix. The unchanged snapshot IS the equivalence proof. |
| G5 `:` false-positives split non-tracks | HIGH | Mandatory depth+string guard reusing pS:161-212 walker; the false-positive matrix is a required test artifact (issue #138 acceptance). Lokāyata probe BEFORE impl. |
| #132 inner s-vs-note semantic lost on recursion | MEDIUM-HIGH | Preserve `isSampleKey` context; do not naively `parseExpression` a bare inner string. Lokāyata probe `n("0 2".fast(2))` value-correctness. |
| #135 "α-6 authoritative list" is a misread (covers UI setters, not tempo) | MEDIUM | Documented above; recommend comment+SHA+per-setter-fixture, audit upstream `@strudel/core` exports in design, do NOT claim a programmatic cross-ref that cannot exist. |
| G1 scope-creep into a JS interpreter | HIGH | D-02 hard boundary; recommend the `stack()`-of-bare-idents partial first (covers 2/10); any non-trivial reference shape → graceful whole-program Code. |
| Backtick awareness incomplete (3 scanners) | MEDIUM | Enumerated: `splitRootAndChain` pS:1327, `parseRoot` regexes, `findMatchingParen` pS:1411, `splitArgsWithOffsets` pS:1488. Plan must touch all backtick-relevant scanners or backtick-in-stack regresses. |
| D-03 Supabase shape unknown locally | MEDIUM | Fetch anon key + confirm column/pagination from upstream `util.mjs` at impl time; maintainer-only script mirrors `parity-refresh.mjs` discipline (no CI network). |
| PV49 force-migrating prelude breaks multi-line boot-call depth logic | MEDIUM | Recommend documenting the prelude line-classifier as a distinct concern; do NOT reshape pS:139-212 to the offset primitive. Planner decision. |

## Open Questions for the Planner

1. **PV49 scope:** force-migrate `stripParserPrelude`'s whole-line skip to
   the shared primitive, or document it as a structurally distinct
   line-classifier concern? (Research recommends document-the-divergence;
   confirm in design — affects α task count.)
2. **#132 s-vs-note semantics:** does the inner bare string in
   `s("bd".jux(rev))` need `isSampleKey=true` through recursion? Resolve
   via the `n("0 2".fast(2))` + `s("bd".rev())` Lokāyata probes BEFORE
   committing the recursive arm shape.
3. **#135 setter family:** which exact `@strudel/core` setters beyond
   `setcpm` are pure no-return side effects? Requires an upstream export
   audit at the pinned SHA (not determinable from local source).
4. **G1 scope:** ship only the `stack()`-of-bare-idents partial, or the
   general inline-expansion map? D-02 permits either; the partial covers
   the measured 2/10. Recommend partial-first, map as stretch.
5. **D-03 column/pagination:** exact `code_v1` body column + how to page
   ~50 rows — confirm against upstream at impl time.
6. **G1 loc choice:** definition-site vs reference-site loc for substituted
   subtrees. Research recommends definition-site (matches issue note);
   confirm acceptable for click-to-source UX.

## Cheapest Lokāyata Prototype Per Wave

- **α/G2:** node REPL `parseStrudel('setcpm(120)\ns("bd")')` → expect
  structured, not Code.
- **α/G4:** `parseStrudel('stack(\n// a\ns("bd"),\n// b\ns("hh")\n)')` →
  `Stack[Play,Play]`.
- **β/G3:** 5-line node script: backtick regex `` /^`([^`]*)`/ `` against a
  multi-line `` `<bd\nhh>` `` proving newline capture; then `${}` →
  `.includes('${')` bail.
- **β/#132:** `parseStrudel('n("0 2".fast(2))')` value-correctness +
  `parseStrudel('s("bd".jux(rev))')` sample-context check.
- **γ/G5:** generalised regex + depth guard against
  `{ a: 1 }\nx?y:z\n"https://f"\np1: s("bd")` — assert ONLY `p1` captured;
  then full-wiring `parseStrudel('p1: s("bd")\np2: s("hh")')` → distinct
  `dollarPos` per Track via `collect`.
- **γ/G1:** `parseStrudel('let p1=n("0").s("piano")\nstack(p1)')` →
  structured; `parseStrudel('stack(p1)\nlet p1=n("0")')` → graceful Code
  (no throw).
