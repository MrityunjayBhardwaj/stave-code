---
phase: 20-20
created: 2026-05-21T18:13:00Z
branch: feat/20-20-tokenizer-whitespace
branched_from: a150889 (20-19 merge into main; planning-doc-only commits afc918e + fb53e68 on top)
---

# Phase 20-20 — Wave-by-wave verbatim observation record

## Wave 0 — Re-confirm Outcome 1; FROZEN scope lock

### Branch + ancestry confirmation

```
$ git merge-base HEAD a150889
a150889f45c1d1e19cbf3a3eb4fe5bebb5cc037a
$ git checkout -b feat/20-20-tokenizer-whitespace
$ git rev-parse --abbrev-ref HEAD
feat/20-20-tokenizer-whitespace
```

The merge-base of the fresh branch with the 20-19 merge SHA `a150889` is
exactly `a150889` — main contains the 20-19 merge in its ancestry. The
only commits between `a150889` and the fresh branch tip are planning-doc-
only (`fb53e68` CONTEXT, `afc918e` RESEARCH+PLAN+PLAN-CHECK). No
production-src commit on main since `a150889`. Action-2 re-grep below
not strictly required (no drift) but performed regardless.

### Live anchor re-grep (action 2)

| Anchor | Live line | Shape |
|---|---|---|
| `export function splitRootAndChain` | `parseStrudel.ts:2489` | function head — unchanged |
| `} else {` identifier-then-paren arm | `parseStrudel.ts:2521` | the surgery site |
| identifier-scan `while` | `parseStrudel.ts:2523` | `while (i < expr.length && /[a-zA-Z0-9_$]/.test(expr[i])) i++` |
| `if (i < expr.length && expr[i] === '(')` | `parseStrudel.ts:2526` | the direct-paren check |
| `findMatchingParen` call | `parseStrudel.ts:2527` | the followup, unchanged |
| `return { root: expr.slice(0, i), chain: expr.slice(i) }` | `parseStrudel.ts:2534-2537` | function tail, unchanged |
| `export function skipWhitespaceAndLineComments(src: string, pos: number): number` | `parseStrudel.ts:1075` | PV49 primitive; signature CONFIRMED |
| `parseRoot.sMatch` regex | `parseStrudel.ts:1347` | `/^(?:s|sound)\s*\(\s*"([^"]*)"\s*\)/` — already tolerates `\s*\(` |

Live line numbers MATCH RESEARCH §5 + PLAN §"Live precedent shapes"
byte-for-byte. No drift.

### Baseline re-observation (action 3)

```
$ pnpm --filter @stave/editor test
 Test Files  91 passed (91)
      Tests  1627 passed (1627)
   Duration  3.41s

$ pnpm --filter @stave/app test
 Test Files  18 passed (18)
      Tests  409 passed (409)
   Duration  1.45s
```

editor **1627/1627** + app **409/409** — baselines RE-CONFIRMED.

### Pre-fix dist grep baselines (P68 INCREASE-by-1 anchor — captured on Wave-0 head BEFORE Wave A's edit)

```
$ pnpm --filter @stave/editor build          # one-shot, clean dist
$ grep -c "splitRootAndChain"          packages/editor/dist/index.js  # 4
$ grep -c "skipWhitespaceAndLineComments" packages/editor/dist/index.js  # 6
$ grep -c "findMatchingParen"          packages/editor/dist/index.js  # 9
$ grep -c "afterIdent"                  packages/editor/dist/index.js  # 0
```

These are the pre-fix anchor counts. Wave A's commit body cites them as
the comparison baseline. Expected post-Wave-A:
- splitRootAndChain: 4 → 5 (the new caller site adds a reference)
- skipWhitespaceAndLineComments: 6 → 7 (the new 5th caller — the
  P68-anchor INCREASE-by-1 gate)
- findMatchingParen: 9 → 9 (unchanged; defensive)
- afterIdent: 0 → 1 OR 0 (the local name may be minified away;
  informational only — NOT a STOP gate)

### Wave-0 5-cell factoring probe RE-CONFIRMATION on `feat/20-20-tokenizer-whitespace` from `a150889`

Probe spec `packages/editor/src/_wave0-classify-20-20.spec.ts` written
to mirror RESEARCH §2.1 exactly (vitest run, stdout-printed, no
assertions). Run command:

```
$ pnpm --filter @stave/editor exec vitest run src/_wave0-classify-20-20.spec.ts
```

**Verbatim stdout:**

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
[D EXEMPLAR shape (with space + two siblings)]
  source: "sound (\"a\")\nsound (\"b\")"
  outer.tag=Track bare=false inner.tag=Code inner.bare=true
[E REAL bakery -G2drHRNFueu (verbatim)]
  source: "sound (\"hh hh hh hh\")\nsound (\"[bd bd][sd bd] bd sd\")\n\n\n// @version 1.0"
  outer.tag=Track bare=false inner.tag=Code inner.bare=true
```

### Decision rule (action 5) — verdict

Per RESEARCH §2.4: A and C STRUCTURED (inner.bare=false); B/D/E
bareCode (inner.bare=true). **Verdict: Outcome 1 RE-CONFIRMED on the
fresh branch.** Scope LOCKS to #159 only.

The probe spec `_wave0-classify-20-20.spec.ts` is DELETED post-capture
(it is a one-off Wave-0 instrument; the OBSERVATIONS record above is
the source of truth; the permanent regression coverage lands in Wave
B's `bakery-159-*.strudel` fixtures).

### FROZEN scope lock (action 5/7)

- IN-SCOPE: **#159 only** (tokenizer-whitespace fence at
  `splitRootAndChain`'s identifier-then-paren branch).
- DEFERRED BACKLOG (Outcome 1 disposition):
  - **#153** (multi-top-level sibling expressions) — stays backlog
    with the RESEARCH §4 LAST-WINS upstream verdict recorded for any
    future maintainer who picks up the issue. Citations:
    `@strudel/transpiler@1.2.6 transpiler.mjs:198-204` (`addReturn`
    rewrites ONLY `body[body.length-1]`); `@strudel/core@1.2.6
    evaluate.mjs:37-38` (`Function(body)()` returns last
    ReturnStatement); `@strudel/core@1.2.6 repl.mjs:237` (`pattern`
    binds to last value). Our parser today is FIRST-WINS for case C
    (`sound("a")\nsound("b")` → inner.tag=Play of FIRST `sound`); a
    semantic mismatch with upstream LAST-WINS but NOT a parity
    blocker (case C STRUCTURES). #153 phase that picks this up
    inherits the §4 grounding without re-doing P69 discharge.
  - **#143** (`-7LU6zgzViSM` guarded-boot prelude variant) — separate
    class, out of 20-20 scope.
  - **#156**, **#149**, **#147**, **#158-other-residuals** —
    untouched.

### Expected V-3 allow-list (action 7) — pre-allocated

```
$ ls packages/app/tests/parity-corpus/bakery-*.strudel | grep -E '159|G2dr'
NONE
```

No pre-existing corpus file for `-G2drHRNFueu` (the hash lives in
`.bakery-runs/samples-*.json`, not in `*.strudel`). Expected V-3
allow-list (the EXACT files that may have moved across the entire
phase) is therefore:

1. `packages/app/tests/parity-corpus/bakery-159-tokenizer-whitespace.strudel`  (Wave-B canonical positive — new)
2. `packages/app/tests/parity-corpus/bakery-159-NEGATIVE-no-whitespace.strudel` (Wave-B negative control — new)

Plus the corresponding `__snapshots__/{parity,loc-fidelity}.test.ts.snap` snapshot entries.

Allow-list size: **EXACTLY 2** fixtures (+ their snapshot entries).
Every other parity-corpus file's loc-fidelity diff MUST be EMPTY
across the entire phase (PV49 byte-additive substrate proof; V-3
observational gate confirms).
