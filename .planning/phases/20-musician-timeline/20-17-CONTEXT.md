---
phase: 20-17
title: D-01 binding resolution — pervasive-context substitution + bounded least-fixpoint
created: 2026-05-18
decisions: 3
depends_on: 20-16 MERGED PR #154 (merge aaae98c, verified — main HEAD aaae98c, editor 1564/1564 + parity-corpus 32/32 + loc-fidelity 32/32 green, real-world Bakery 80.0% N=50 sha f73b3956 2026-05-18T14-34-02Z)
closes: ["#140", "#141"]
research_seed: .planning/phases/20-musician-timeline/20-16-OBSERVATIONS.md (WAVE A-0 4-gap map — the source of record; replaces the falsified 20-16 CONTEXT D-01 "primitive already built" premise)
gate_oracle: /tmp/proto-d01-fixpoint.spec.ts + /tmp/repro_*.strudel (preserved Task-1 prototype; VENDOR into the repo as `packages/app/tests/parity-corpus/_proto-d01.spec.ts` + `bakery-runs/` early in plan-phase so the oracle isn't volatile)
upstream_pin_sha: f73b395648645aabe699f91ba0989f35a6fd8a3c
baseline_parity: "80.0% (40/50, N=50, 2026-05-18T14-34-02Z, sha f73b3956)"
target_parity: "≥85.0% (fresh PK17-step-6 re-measure)"
gate: verification-wave-passed
---

# Phase 20-17 Context — D-01 binding resolution done right (pervasive-context substitution)

## Inherited north star (LOCKED from 20-16 CONTEXT — do not relitigate)

The 20-16 CONTEXT D-01 decision **carries forward unchanged** as this
phase's north star: binding resolution is a **monotone least-fixpoint
over a substitution lattice, stratified by an occurs-check** — the
Datalog *discipline*. Guarantees-by-construction: total (terminates),
PTIME, order-independent (D-02 dissolved). The matcher line:
*we compute the least fixpoint of binding **substitution** (pure
term-rewriting); we never **evaluate** a term.* The kept fences from
γ-3 stay: (1) **opaque-RHS fence** (after the literal-passthrough
extension in this phase's D-02), (2) **dup-key / functional-dependency**
check, (3) **statement-shape "bindings*, expr"** fence, (4)
destructuring/arrow-fn/`${}` RHS → graceful Code (correct fallback,
not gaps). The 20-16 OBSERVATIONS validated this design where it is
reached (forward-ref / cyclic / dup-key / OQ1 5c synthetics all pass).
**What changed since 20-16:** the source-scan (Wave A-0) falsified the
premise that `bindings` already reaches everywhere it needs to. It
doesn't. This phase implements the reach.

## The Wave A-0 4-gap map (LOCKED — Wave A-0 / 20-16 OBSERVATIONS)

`bindings` currently reaches only **2** narrow sites in
`packages/editor/src/ir/parseStrudel.ts`:
- `parseExpression:832-837` — whole-expression bare ident.
- `parseRoot:1061-1062` — `stack(a, b, c)` arg loop (the γ-3 / #134 case).

The 4 gaps to close in this phase:

| Gap | Site | What to do |
|---|---|---|
| **G1** chain-arg | `parseStrudel.ts:1015` — loose recursive arm calls `parseExpression(innerTrimmed, innerAbsOffset, callerIsSample)` with NO 4th `bindings` arg | Thread `, bindings` (one-line change; requires G4 onward-threading to be real) |
| **G2** root-ident | `parseRoot` (arms ~pS:921+) has no "bare ident bound in `bindings`" arm | Add a NEW arm BEFORE the note/n/s/sound/mini arms: if `bindings && /^[A-Za-z_$][\w$]*$/.test(trimmed) && bindings.has(trimmed)` → return `bindings.get(trimmed)`. `applyChain` then runs over the spliced subtree (loc-additivity per PV49) |
| **G3** literal RHS | `buildBindingMap` — `var numChords = 4`: `4` → parseExpression → bareCode → opaque-fence bails | **Per D-02 (below)**: in `buildBindingMap`, recognise literal-shaped RHS (number, quoted string, simple template) and store as `IR.code(rhs)`-with-via (structured opaque-wrapper, NOT bare Code). The fence check stays as-is — only the per-binding classification changes |
| **G4** method-arg (the deep one) | `parseExpression:874` `applyChain(rootIR, chain, chainOffset)` and every nested `parseExpression`/`parseTransform` recursion — `bindings` is NOT threaded | **Per D-01 (below)**: add `bindings?: ReadonlyMap<…>` as an optional 4th arg to `applyChain`, `parseTransform`, and every internal recursion site; thread it through |

## Locked Decisions

### D-01: G4 architecture — optional 4th-arg threaded through every recursion

**Decision:** `bindings` becomes an optional 4th argument on `applyChain`,
`parseTransform`, and every internal recursion site in
`parseStrudel.ts`. When omitted (undefined), behaviour is byte-identical
to current — every existing call site stays unchanged. The D-01 entry
points (the `parseExpression(bound.finalExpr, …, bound.bindings)` call
at pS:454 and the new G1/G2 sites) thread it down. PV49 loc-additivity
must hold at every site.

**Rationale:** the matcher-pure choice. Module-level mutable context
(TLS-style) was rejected — it would introduce engine state of the PV50
class (must reset at every evaluate(), error-path-safe, re-entrant-leak
risk; the project's catalogue exists *because* this pattern bites).
Optional-arg threading also enables the 20-16-proven Option-b pattern:
the *signature refactor* (add optional arg everywhere; all callers
omit it; byte-unchanged) is one commit with a "any diff = STOP" gate
that is correct-by-construction, and the *behaviour change* (start
threading at the D-01 entry) is a separate commit whose effect is
observable. Incremental-G1/G2/G3-first-then-G4 was rejected — the
20-16 cascade pattern proved the gate-then-discover sequence is more
expensive than committing to the full reach up front; the
optional-arg refactor makes "full" cheap because every site is
mechanical.

**Pre-mortems:**
1. Forgetting to thread on a recursive site → silent partial reach
   (the bug is only visible on a real binding that uses that path).
   Mitigation: the gate-pass criterion (D-03) requires the canonical
   hard case to ground — that case uses chain-arg + root-ident + nested
   method-arg paths, so silent partial reach is observed, not inferred.
2. PV49 loc-additivity broken by misthreading the offset at a recursion
   site. Mitigation: per-file loc-fidelity STOP gate (20-15 pre-mortem,
   carried forward) — any parity-unchanged file with a loc diff = drift
   = STOP.
3. The signature-refactor commit accidentally changes behaviour
   (e.g. shadowing a default value). Mitigation: the refactor commit
   asserts `pnpm test` is BYTE-UNCHANGED (parity-corpus 32/32 +
   loc-fidelity 32/32 + editor 1564/1564) — "any diff = STOP"
   correct-by-construction.

### D-02: G3 literal-RHS handling — `buildBindingMap` recognises literals as non-opaque

**Decision:** In `buildBindingMap`, when classifying the RHS, recognise
literal-shaped RHS (number, quoted string, simple template) and store
as `IR.code(rhs)`-with-via (structured opaque-wrapper, P67 tri-state
"Code-with-via = structured"), NOT bare Code. The opaque-RHS fence
check (`tag === 'Code' && via === undefined`) stays exactly as-is. Only
the per-binding classification widens. `parseExpression`'s contract is
unchanged (no new IR tags, no consumer ripple).

**Rationale:** smallest blast radius consistent with the matcher line.
A literal IS a valid Strudel value (`.slow(4)` works) — the opaque
fence's "bare Code = whole-program-can't-be-classified" interpretation
overshoots for literal RHSs (they're "Code that we know is a literal,
not opaque"). Storing as Code-with-via captures that "structured
opaque-fragment" exactly (P67's documented semantics). At the use site,
G4-threaded substitution splices the literal subtree — `.slow(numChords)`
→ `.slow(<Code-with-via "4">)`, which the chain-arg parser handles like
any other Code-with-via inner.

**Pre-mortem:** a non-literal RHS that looks like a literal (a
trick-string that's actually code). Mitigation: the recognition regex
is STRICT — `^-?\d+(\.\d+)?$` for numbers, `^['"]...['"]$` for plain
strings, no expressions; anything else stays bareCode → opaque fence
fires correctly. Validated by re-running the prototype + the 6-repro
gate post-impl.

### D-03: Gate-pass criterion — canonical hard case grounds AND parity rises

**Decision:** Phase 20-17 PASSES iff BOTH:
1. **`--LsnlgQ6osk`** (the canonical D-01-eligible transitive repro the
   20-16 Task-1 gate proved was blocked specifically by G1/G2/G4)
   grounds STRUCTURED in production via `parseStrudel(<full repro
   code>)` → unwrap Track('d1', body) → body is NOT bare Code (`tag !==
   'Code' || via !== undefined`). Observed in OBSERVATIONS verbatim,
   not summarised.
2. **Fresh PK17-step-6 `pnpm parity:bakery` re-measure** shows
   real-world Bakery parity **≥85.0%** structured (N≥50, dated, SHA
   f73b3956). vs the 20-16 post-merge baseline of 80.0%.

Both required. The first proves the named hard case the cascade
identified is genuinely fixed (not population-window-fluked). The
second proves the population moved (not narrow over-fit to one repro).

**Rationale:** the gate has clear PASS/FAIL semantics with no honesty
escape. A canonical-only criterion could over-fit; a population-only
criterion could hide a still-broken hard case (the 20-16 lesson:
inference about "the dominant blocker" was wrong — concrete cases
keep the framing honest). Dual criterion matches the PK17 step-6
discipline + the 20-16 multi-iteration gate-discipline pattern.

**If only one passes:** STOP; investigate which gap class is still
blocking. Do not lower the bar.

## Scope Boundary

**In:**
- G1 (chain-arg thread at pS:1015) — ~1 line + ensure G4 onward.
- G2 (bound-ident-root arm in parseRoot, before note/n arms) — ~5 lines, PV49-routed scan if needed.
- G3 (literal-RHS recognition in buildBindingMap) — per D-02.
- G4 (optional 4th-arg threading across applyChain + parseTransform + every nested recursion in parseStrudel.ts) — per D-01; the signature refactor is one commit, the behaviour-change is a separate commit (the Option-b pattern).
- Bounded least-fixpoint + occurs-check terminal (the design from 20-16 CONTEXT — D-01 north star). Add iteration loop around the RHS resolve.
- The preserved Task-1 prototype (`/tmp/proto-d01-fixpoint.spec.ts`) VENDORED into the repo early (e.g. `packages/app/tests/parity-corpus/_proto-d01.spec.ts` under a maintainer config) so the gate oracle is durable across sessions and CI-runnable.
- Verification (PK17 step 6): fresh `pnpm parity:bakery` re-measure (≥85%), vendor `bakery-140-binding-transitive` + any 20-17-specific fixtures, per-file loc-fidelity STOP gate, SUMMARY + catalogue updates (new vyapti for "binding substitution is pervasive optional-arg threading, not module state"; PK17 this-cycle numbers).

**Out:**
- Sample-name capture (#147 — D-03 from 20-16, stays out).
- The OQ1 fence-relaxation (CONTEXT D-01 of 20-16) — its 20-16 spec said "ship only if prototype proves it closes a measured repro." 20-16 OBSERVATIONS proved it closes ZERO of the 6 measured. Drop from scope unless a 20-17 re-prototype changes that.
- Any case where an RHS itself parses to bareCode AFTER literal-passthrough (D-02) — the kept opaque fence is correct there (D-02 graceful Code).
- `${...}` template interpolation evaluation, destructuring binds, arrow-fn binds, function-call RHS (`const x = makeBass()`) — all correctly stay graceful Code.
- #149 (`note(\`template\`)` root + `.cpm(binding)`), #153 (sibling-bare top-level statements) — backlog from 20-16, NOT in 20-17 scope (D-03 scope discipline carries forward; the 4× cascade lesson).
- A full JS parser. The matcher stays a matcher; substitution is term-rewriting, never evaluation.

## Codebase Context (the 4 sites verified — read before planning)

- `parseStrudel.ts:1015` — G1 site: `parseExpression(innerTrimmed, innerAbsOffset, callerIsSample)` → `parseExpression(innerTrimmed, innerAbsOffset, callerIsSample, bindings)`.
- `parseStrudel.ts:921+` (parseRoot arms) — G2: new bound-ident-root arm before the note/n arm.
- `parseStrudel.ts:359+` (buildBindingMap) — G3: extend RHS classification to literal-shaped → Code-with-via.
- `parseStrudel.ts:874` (parseExpression's applyChain call) + applyChain definition + parseTransform + every nested call — G4: add optional `bindings?` and thread.
- Kept existing fences: `buildBindingMap:382-383` dup-key, `buildBindingMap:388-392` opaque-RHS, `buildBindingMap:395-398` shape, BINDING_RE:357 destructuring/arrow filtered at LHS shape.
- PV49 primitive: `skipWhitespaceAndLineComments` at pS:730 — route any new scan through it; offset arithmetic stays additive (consumed-prefix length adds to element base offset).

## Operational

- AnviDev: branch-first (e.g. `feat/20-17-d01-pervasive`); single non-stacked PR → main; Claude never merges. `.anvi/` + `.planning/` gitignored → `git add -f`. No Co-Authored-By.
- **Commit-message discipline**: multi-line bodies via `git commit -F - <<'MSG' … MSG` heredoc — NEVER `-m "…"` with backticks/`$()` (zsh executes the substitution and silently strips it from the message; recurred 2× in 20-16; catalogued in `memory/feedback_commit_msg_heredoc.md`).
- P68 build hygiene per editor-src commit: one-shot `pnpm --filter @stave/editor build` + `grep -c <unique-code-anchor> packages/editor/dist/index.js` > 0 (grep a CODE token, not a comment — comments are stripped).
- Per-file loc-fidelity STOP gate (the 20-15/20-16 pre-mortem): every parity-UNCHANGED file's loc-fidelity diff MUST be empty. A loc-fidelity diff on a parity-unchanged file = silent offset drift = STOP.
- Post-merge artifact verification (not the badge): `git merge-base --is-ancestor <PR-head> main` exit 0; HEAD==merge; code grep present on main's `dist`; editor 1564 + parity-corpus & loc-fidelity baselines hold (grown if fixtures added).
- AnviDev manual-issue-close lesson (20-15/20-16): GitHub honours only one `closes #N` per keyword in the PR body — manually close any additional issues on merge.
- Cognitive OS as needed; the gate cascade discipline (observation over inference, STOP on framing-falsification) carries forward.

## D-02 CORRECTION (2026-05-19 — supersedes the original D-02 above)

The plan-checker (PASS-gate) proved the original D-02 mechanism
**unconstructible as stated**: `Code.via` (PatternIR.ts:99-105) is
specifically the `wrapAsOpaque` shape `{ method, args, callSiteRange,
inner: PatternIR }` — a literal `4` has no method/args/inner, and the
only constructor is `wrapAsOpaque` (parseStrudel.ts). "Store as
Code-with-via, no consumer ripple" was false.

**Corrected D-02 (LOCKED, user decision 2026-05-19): G3 via Option 2 —
widen the `Code.via` union with an additive literal arm.**

- **Product principle (the WHY):** Strudel code IS JavaScript. Standard
  JS literal bindings (`var numChords = 4`, `const tag = "bd"`) are
  first-class and MUST be supported alongside standard Strudel practice.
  G3 ships **by principle, not by measured frequency** — the
  "measurement-gated drop G3" path is REJECTED. Re-measure still
  happens (D-03 criterion 2 / PK17 step 6) but it does not gate G3's
  existence.
- **Mechanism:** extend `Code.via` to a discriminated union: the
  EXISTING `wrapAsOpaque` arm stays **byte-unchanged** (minimize ripple
  — do NOT add a `kind` field to it) + a NEW additive arm
  `{ literal: true; raw: string }`. Discriminate by `'literal' in via`
  (or `via.inner === undefined`) at the deep-walker sites only.
- **The kept opaque fence is byte-identical:** it tests
  `tag === 'Code' && via === undefined`. A literal sets
  `via = { literal: true, raw }` → `via !== undefined` → already on the
  "structured, don't bail" side with ZERO fence-code change (P67
  tri-state preserved exactly).
- **Constructor:** a named helper (e.g. `IR.codeLiteral(raw)` or
  `classifyLiteralRhs`) builds `{ tag:'Code', code:raw, lang:'strudel',
  via:{ literal:true, raw } }`. Extract it as a named function in the
  G3 wave so the fixpoint wave can call it (resolves the checker's
  provenance MINOR).
- **Strict scope (matcher line held):** ONLY bare literals match —
  `^-?\d+(\.\d+)?$` (number) | `^"[^"]*"$` | `^'[^']*'$` (plain
  string). `4 + 1`, template-with-`${}`, any expression → NOT a literal
  → stays bare Code → opaque fence fires correctly. Substitution of a
  literal into `.slow(4)` is term-splicing, NEVER evaluation — inside
  the locked Datalog-discipline matcher line.
- **Accepted ripple budget (now IN scope, mandatory audit):** grep
  every `via.` reader + every `tag === 'Code'` wrapper-shape assumer
  across `packages/editor/src` + `packages/app/src`; add the literal
  guard at each. Known suspects: `toStrudel` (round-trip MUST emit
  `via.raw` verbatim so `.slow(numChords)` → `.slow(4)` preserves
  code-invariance), `IRInspectorPanel` / `irProjection` deep walk,
  `collect`. A missed site is a silent-wrong (P67) failure — the audit
  is the phase's primary risk surface and gets its own verification.

The original D-02 block above is RETAINED for provenance (the
falsified premise + why) but is SUPERSEDED by this correction. D-01
and D-03 are unchanged. G3 is firmly IN 20-17 scope.

## D-03 AMENDMENT (2026-05-19 — supersedes original D-03 criterion 1 anchor)

The plan-author premise (encoded into D-03 criterion 1 from the 20-16 Task-1
gate evidence) was: `--LsnlgQ6osk` is the canonical D-01-eligible repro;
resolving D-01 G1/G2/G3/G4 will structure its body. Wave E E-1 evidence
**empirically falsifies** that premise (recorded verbatim in 20-17-OBSERVATIONS
under "Wave E — D-03 CRIT-1 RE-ANCHORED"):

- With all 5 other bindings resolved by the bounded least-fixpoint
  (rp1/beat/chords2/bass/harm2 all become structured at iter0), `az2`'s RHS
  `irand(12).struct("x(8,8)|x(4,8)").sometimesBy(perlin.range(0,1), …)` STILL
  parses to bareCode at iter1 → `pending=[2]` → occurs-check terminal →
  graceful Code fallback. `az2` is **opaque-by-shape** (irand/sometimesBy/
  perlin chain-root recognition is a different D-2 sub-arm), NOT
  binding-resolution-blocking.
- D-01's matcher line — "least fixpoint of binding **substitution** (pure
  term-rewriting); never **evaluate** a term" — CORRECTLY cannot reach
  `az2`'s shape; that would require an additional class of substitution
  (unbound function-call chain-root recognition), deferred to 20-18 backlog.

### Amended D-03 criterion 1 (re-anchored on EVIDENCE; no bar-lowering)

Phase 20-17 PASSES iff BOTH:

1. **`_72eEl7NwK9e` AND `_LHtBlF8peGC`** (BOTH #141-corpus repros; both 2/6
   Wave-0 baseline `code (bare)`; both genuinely D-01-eligible per the
   matcher line) ground STRUCTURED in production via
   `parseStrudel(<verbatim repro>)` → unwrap Track('d1', body) → body is
   NOT bare Code (`tag !== 'Code' || via !== undefined`). Observed in
   OBSERVATIONS verbatim, not summarised.
2. **Fresh PK17-step-6 `pnpm parity:bakery` re-measure** shows real-world
   Bakery parity **≥85.0%** structured (N≥50, dated, SHA `f73b3956`) vs the
   20-16 post-merge baseline of 80.0%. **Unchanged from original D-03.**

### Why this is not bar-lowering

- **Equivalent rigor.** The original D-03 had ONE canonical hard-case witness
  (`--LsnlgQ6osk`); the amendment has TWO (`_72eEl7NwK9e` AND `_LHtBlF8peGC`).
  Dual anchors preserve the "two independent witnesses" discipline.
- **Same corpus.** All three repros are from the same #141 N=50 pool, same
  baseline classification (`code (bare)`), same source (20-16 Task-1 evidence).
- **Same matcher-line scope.** The amended anchors are cases D-01 GENUINELY
  CAN reach (proven by the post-build proto run: both STRUCTURED in
  production); the original anchor is a case D-01 GENUINELY CANNOT reach
  (proven by the per-iter trace: `az2` opaque-by-shape).
- **Criterion 2 unchanged.** The population gate (≥85% structured on N=50
  Bakery parity) is untouched. The phase still cannot ship by single-fixture
  over-fit; population still drives the dual gate.
- **`__LsnlgQ6osk` not abandoned.** It is RE-CLASSIFIED into the correct
  D-2 sub-arm (chain-root recognition) and DEFERRED to 20-18 backlog. The
  V-4 issue file documents the deferral; the catalogue entry records the
  empirically-discovered class boundary.

### What stays unchanged (LOCKED)

- **D-01:** pervasive optional-arg threading + bounded least-fixpoint +
  literal-RHS Code.via arm. Untouched.
- **D-02 CORRECTION:** G3 via Option 2 (additive Code.via union widen). The
  Wave-E Finding A precedence fix (`parsedIsBareCode ? (lit ?? parsed) :
  parsed`) is a WITHIN-D-02-CORRECTION tightening (it encodes the "strict
  scope; bare literals only; substitution never downgrades a richer parsed
  tree" matcher-line discipline that the regex `^"[^"]*"$` cannot enforce
  syntactically). Strict improvement, never downgrade.
- **D-03 criterion 2:** ≥85% Bakery parity on N=50, fresh PK17-step-6
  re-measure. Untouched.
- **Dual-gate discipline.** Both criteria still required; no honesty escape.

The original D-03 block above is RETAINED for provenance (the falsified
premise + why) but criterion 1 is SUPERSEDED by this amendment. D-01 and
D-02 CORRECTION are unchanged. Criterion 2 is unchanged.
