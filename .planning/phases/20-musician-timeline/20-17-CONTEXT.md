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
