---
phase: 20-22
created: 2026-05-25T14:17:59Z
decisions: 3
target_issues: [141, 140]
parity_baseline: "90.4% true distribution (N=500, offset 0, pin f73b3956)"
---

# Phase 20-22 Context — #141/#140 binding-ref outside `stack()`-bare-arg

## Strategic frame

Selected Path A (continue parity) from the post-20-21 three-path fork
(parity / debugger / synth), now decided against the **TRUE 90.4%**
distribution metric (PR #166's `--offset` harness fix; P71/PV55), not
the blind-spot offset=0 N=50 "100%".

**Target: the dominant real-world lever.** Of the 48 fallbacks in the
N=500 sweep, **#141/#140 binding-ref outside `stack()`-bare-arg = 24
(50% of all fallbacks)**. Closing this class alone → ~95.2%. Issue #165
is the umbrella roadmap; #141 (REOPENED) is the fix vehicle; #140 is the
deferred γ-4 "generalize binding substitution beyond stack() bare-ident
args" it extends.

## The gap (grounded, 2026-05-25)

The 20-17 D-01 machinery threads a `bindings: Map<string, PatternIR>`
through `parseExpression` → `parseRoot` → `applyChain` and substitutes
at:
- whole-expression bare ident (`parseStrudel.ts:1131`)
- `parseRoot` bare-ident root (`parseStrudel.ts:1248`) — splices the
  bound **PatternIR subtree**
- chained/non-plain method inners that re-enter `parseExpression`
  (`parseStrudel.ts:1430`)
- `stack()` bare-ident args

The residual #141 class is **scalar/string bindings referenced in
method-arg and function-call-arg positions**, where the IR-subtree
splice does not fit — the arg site needs the **raw text** to re-parse in
its method-specific context (e.g. `n(chordProgression)` must reconstruct
`n("<...>")` → `parseMini`; a spliced `Code{literal,raw}` IR is neither
the raw string nor a usable Pattern). Grounded repros from the N=500
offset-0 artifact:
- `-LHtBlF8peGC`: `var chordProgression = "<...>"; var numChords = 4;`
  then `n(chordProgression)` + `scales.slow(numChords)`.
- `-1j62z5xjyCN` / `-72eEl7NwK9e`: `var cpm = 30;` family.
- arithmetic RHS: `let bpm = 172/4`, `setcps(121.9/60/4)`.

`classifyLiteralRhs` (`parseStrudel.ts:119-128`) already admits pure
numeric / quoted-string RHS into the binding map; arithmetic RHS is
rejected by its `^-?\d+(\.\d+)?$` regex and stays bareCode.

## Locked Decisions

### D-01: Substitution mechanism for arg-position scalar/string refs
**Decision:** Textual substitution of the **raw RHS text**.
**Rationale:** Store each literal-classified binding's raw RHS text;
at arg-parse sites, replace the bare ident with that text BEFORE the
arg is parsed. One primitive covers scalar + string. Matcher-pure —
substitution, never evaluation (honors the LOCKED D-02 matcher-not-
interpreter boundary from 20-15/20-17). IR-subtree splice stays as-is
for Pattern-valued bindings used as roots; the new textual path is
additive. Rejected the dual-representation-by-kind option (two code
paths to keep in sync) — textual substitution subsumes both scalar and
string with a single mechanism.

### D-02: Arithmetic-RHS bindings
**Decision:** Widen `classifyLiteralRhs` to an **enumerated arithmetic**
grammar over numeric literals and substitute the raw text.
**Rationale:** Repros (`172/4`, `121.9/60/4`) are common in the class.
Substituting raw text keeps us matcher-not-interpreter — downstream
Strudel evaluates `172/4` natively; our IR records the raw arg, we
never compute `43`. **STRICT enumerated operator set only (`/ * + -`
between number tokens); NO parens, NO function calls, NO identifiers.**
This is the classic scope-creep-into-interpreter trap (the #140 γ-4
pre-mortem) — the grammar must be a closed, named token set, and any
shape beyond it stays graceful bareCode. If the executor finds the
strict grammar can't be bounded cleanly → STOP, fall back to D-02-strict
(pure literals only), file arithmetic as a follow-up.

### D-03: Closure gate metric
**Decision:** **Multi-offset distribution sweep (offset 0 + 100 + 250,
~150 distinct rows, pin `f73b3956`)** as the must-not-regress floor +
target gate.
**Rationale:** The offset=0 N=50 window is a dead measurement (P71/PV55).
A multi-offset sweep is the faithful application of P71's "sweep, don't
fix-window" lesson — genuine distribution coverage across three
non-overlapping slices (offset 0 = 100%/92%-ish historically, 100 =
92%, 250 = 84% per the #165 spot checks, so the blended baseline is
well below 100% and movement is real). Per-slice + blended numbers both
recorded in the artifact. Dual gate, no bar-lowering: production
exemplar(s) STRUCTURED **AND** the blended sweep improves over the
recorded baseline with zero per-slice regression.

## Scope Boundary

**IN:** #141/#140 — scalar/string + enumerated-arithmetic bindings
referenced in method-arg / function-call-arg / sub-expression-root
positions, via textual raw-RHS substitution. The 24-fallback dominant
class.

**OUT (explicit — separate phases):**
- #143 guarded-boot recurrence (5 fallbacks) — different mechanism class.
- The trailing-`//`-comment-at-`stripParserPrelude`-exit variant
  (uncategorised; the P70-occ-9 mechanism at a THIRD walker site) —
  cheap and same-shape as 20-21, but a distinct walker site; carry as
  its own issue.
- top-level `function` decls, `await initHydra` (uncategorised /
  #156 Hydra territory).
- #142 samples-obj-lit (4); #147 samples side-channel (feature-deferred).
- D-02 arrow-fn / functional shape (3) — DELIBERATE correct bareCode,
  NOT a gap.

## Codebase Context

- `packages/editor/src/ir/parseStrudel.ts` — the parser. Substitution
  sites at 1131 / 1248 / 1430 / stack-arm (~1455+); `classifyLiteralRhs`
  at 119; `buildBindingMap` at 547 (binding-map build; def-site offset
  stored once).
- LOCKED prior decisions that constrain this phase: D-02
  matcher-not-interpreter (substitution never evaluation; opaque-RHS
  stays graceful Code) — 20-15/20-17 authoritative, do NOT relitigate.
  PV49 loc-fidelity additivity at every new site. PV50 stack-threaded
  optional-param contract (`bindings` is a trailing optional param,
  never module state). PV52 the `via===undefined` bareCode discriminator
  + new-arm grep-reproduced consumer audit.
- Catalogue constraints to honor: **P70/PK18** — Wave 0 RUNS the repros
  through the parser to confirm the actual bail site before any fix
  (cascade classification can be wrong about WHY; the #165 class label
  is suspect until observed). **P71/PV55** — any coverage % claim cites
  N + sampling method (sweep, not window). **P68** — one-shot
  `pnpm --filter @stave/editor build` + minification-stable literal grep
  on `dist/index.js` before every editor-src commit. **PV54** — if a new
  top-level PatternIR tag is added (not expected here), the additive-tag
  FLOOR-grep obligation fires (not anticipated — this is substitution,
  not a new tag).
- Env: `pnpm --filter @stave/editor dev` (tsup --watch) before editing
  `packages/editor/src` (workspace exports via `dist/`). macOS TCC may
  flap on `~/Documents` content reads (20-21 note).

## Baseline (main `7ebcef7`)

- editor **1627/1627**, app **417/417** (parity-corpus 49 + loc-fidelity
  49 + other 319).
- Parity **90.4% TRUE distribution** (N=500, offset 0, pin `f73b3956`).
- Harness: `pnpm parity:bakery --n N --offset M`.
