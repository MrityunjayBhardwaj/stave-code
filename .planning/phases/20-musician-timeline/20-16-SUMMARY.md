---
phase: 20-16
title: Close the next Bakery parser-gap classes — REFRAMED (Wave 0 + B/C + measure)
created: 2026-05-18
reframed: 2026-05-18 (D-01 #140/#141 removed → Phase 20-17; Task-1 gate fired 4×)
closes: ["#142", "#143", "#144"]
already_closed_on_branch: ["#148", "#150", "#151", "#152"]  # commit ff93c65 (Wave 0)
deferred_to_20_17: ["#140", "#141"]  # D-01 pervasive-context — out of 20-16 by REFRAME
gate: verification-wave-passed
upstream_pin_sha: f73b395648645aabe699f91ba0989f35a6fd8a3c
real_world_parity_sample:
  N: 50
  structured: 40
  pct: "80.0%"
  date: 2026-05-18T14-34-02-237Z
  upstream_sha: f73b395648645aabe699f91ba0989f35a6fd8a3c
  baseline: "72.0% (36/50, N=50, 2026-05-15T23-13-07Z, sha f73b3956)"
backlog_issues: ["#153"]  # NEW: multiple sibling bare top-level statements
---

# Phase 20-16 — SUMMARY (REFRAMED)

**Closes #142/#143/#144.** #148/#150/#151/#152 (the Wave-0 segmenter)
were already shipped on this branch at `ff93c65` (do NOT re-close —
referenced in the PR body). **D-01 (#140/#141) was REMOVED from 20-16**
and deferred to dedicated **Phase 20-17** (pervasive-bindings-threading
as the explicit design premise) — the Task-1 HARD GATE fired 4 times and
Wave A-0 proved D-01 = a parser-wide recursion refactor (G1 chain-arg /
G2 root-ident / G3 literal-RHS / G4 applyChain threading), NOT the
"minimal bounded fixpoint" CONTEXT D-01 assumed. The CONTEXT D-01
decision (least-fixpoint substitution / Datalog discipline) remains
VALID as 20-17's north star — only its host phase changed.

This phase is a **PK17 instance** (friction-first parity-hardening:
measure real-world → classify → fix highest-frequency → re-measure →
vendor fixtures). It ships the D-01-independent wins now.

## The reproducible parity claim (D-03)

**Real-world structural parity = 80.0% (40/50 structured)**, measured by
`pnpm parity:bakery --n 50` on a FRESH live `code_v1` Supabase pull,
stamp **2026-05-18T14-34-02-237Z** (≠ the 20-15 baseline stamp
2026-05-15T23-13-07Z — PK17-valid: never re-measured on the samples
fixed for), upstream pin **f73b395648645aabe699f91ba0989f35a6fd8a3c**,
N=50 non-empty samples.

| | value |
|---|---|
| 20-15 baseline | 36/50 = **72.0%** (N=50, 2026-05-15, f73b3956) |
| 20-16 measured | 40/50 = **80.0%** (N=50, 2026-05-18, f73b3956) |
| Movement | **+8.0 pts absolute, +11.1% relative** |

The PASS criterion (materially above 72.0%) is met. Reproducibility: the
live pull is gitignored (`.bakery-runs/`, unreviewed third-party code);
the **CI-reproducible floor** is the 7 vendored `bakery-*.strudel`
fixtures (V-2). Re-run `pnpm parity:bakery` for a fresh re-measure — the
% is a live signal, the fixtures are the durable regression wall.

### The 10 remaining Code-fallbacks (D-03 — NOT fixed this phase)

| class | count | disposition |
|---|---|---|
| #141 binding ref (D-01) | 8 | REMOVED to Phase 20-17 by REFRAME. Already filed #140/#141. The dominant residual class — 20-17's explicit scope. |
| `-7LU6zgzViSM` #143-binned | 1 | NOT a regression. B-2's `GUARDED_BOOT_RE` DOES strip the guard line (proven on the isolated verbatim repro). This sample has a SECOND independent blocker — `chord(...).dict("ireal").layer(x=>n(...).set(x)…)`, an arrow-fn = KNOWN D-02 correct Code-fallback. The maintainer classifier bins it #143 only because the `typeof` regex matches first (classifier-ordering artifact). No new issue. |
| NEW (`-G2drHRNFueu`) | 1 | GENUINE new class → filed **#153** (multiple sibling bare top-level pattern statements). D-03: NOT fixed (phase cascaded 4×, hold the line). |

## Per-class resolution

- **#148/#150/#151/#152 (Wave 0 — pre-shipped `ff93c65`):**
  `splitTopLevelStatements` made ASI/comment-aware (leading-`.` forward
  peek via the PV49 `skipWhitespaceAndLineComments` primitive; `=`-tail
  backward peek; `// ` / `/* … */` residue strip in `flush()`; `/* … */`
  block skip in the walker). Vendored as 4 regression fixtures (V-2).
- **#142 — fixture-only (B-1 OQ2, observed):** the EXISTING
  `stripParserPrelude` depth walker (pS:182-250) ALREADY brace-balances
  the object-literal `{…}` arg (single + multi-line) AND consumes the
  `samples('github:…')` / `samples('https://…')` string forms.
  Observed via vite-node against the verbatim `gh issue view 142` body:
  bodies start at the musical expr, offsets correct (80/84/36/71). The
  `'github:…'` residual Code-fallback is the co-occurring `var cpm`
  binding (#141/D-01 → 20-17), NOT a #142 strip gap. **NO code change**;
  `bakery-142-samples-objlit.strudel` is the regression wall.
- **#143 — code change (B-2):** added a SECOND line classifier
  `GUARDED_BOOT_RE`
  (`^[ \t]*typeof\s+\w+\s*!==?\s*['"]undefined['"]\s*&&\s*\w+\s*\(`,
  mirroring `_bakery-classify.spec.ts:53`) routed into the UNCHANGED
  multi-line depth walker — recognition extension only (#143 scope, NOT
  evaluation). R2 anti-drift comment + Codeberg SHA pin added. Observed:
  the verbatim #143 issue body → structured Play (guard stripped);
  negative `s("bd").every(2, x => typeof x)` → NOT mis-stripped
  (line-start anchored).
- **#144 — code change (C-1):** added a `parseRoot` arm matching ONLY
  `^\(\s*("[^"]*"|`[^`]*`)\s*\)$` (single parenthesized string literal,
  NOT arbitrary JS — CONTEXT scope boundary), placed after the strict
  regexes (no existing snapshot moved) and before the bare-Code
  fallback. Strips the parens, recurses the inner via the existing
  parseMini/backtick logic; inner offset computed through the PV49
  `skipWhitespaceAndLineComments` primitive (additive, no hand-roll).
  P67: bare-Code inner falls through unchanged. Observed: verbatim #144
  issue body → structured Code-with-`via` chain off the parsed mini
  root; loc slices correct tokens from ORIGINAL source
  (`Seq[2,10]="1*1, 2*2"`, `Play[2,3]="1"`); negative `( s("bd") )` →
  bare Code unchanged.

## OQ disposition (the one OQ in REFRAMED scope)

- **OQ2 (#142 code-change-needed):** RESOLVED by observation (B-1) =
  **NO, fixture-only.** Evidence = the verbatim `stripParserPrelude`
  output run via vite-node against the `gh issue view 142` body
  (recorded in 20-16-OBSERVATIONS.md). Not inferred from reading the
  regex.
- OQ1/OQ3/OQ4/OQ5 — D-01 OQs, OUT of REFRAMED scope (their dispositions
  from the Task-1 gate iterations remain in OBSERVATIONS as 20-17's
  RESEARCH seed).

## The A-1↔A-2 boundary

N/A this phase — Wave A (D-01) was REMOVED by the REFRAME. The A-1
behavior-identical-refactor / A-2 fixpoint boundary moves WITH D-01 to
Phase 20-17.

## Verification (PK17 step 6)

- **V-1:** fresh re-measure 80.0% (40/50, N=50, 2026-05-18T14-34-02-237Z,
  f73b3956) — +8.0 pp over 72.0%. 1 NEW class → #153.
- **V-2:** 7 fixtures vendored (verbatim issue bodies / Task-1 slices) +
  BAKERY-FIXTURES.md provenance; parity-refresh exclusion satisfied by
  the existing structural guard (TARGETS upstream-only by construction).
  All 7 STRUCTURED (P67).
- **V-3 (THE phase pre-mortem gate):** per-file loc-fidelity correlation
  vs the `ff93c65` Wave-0 baseline = **PASS**. `git diff --stat` on both
  snapshot files = **552 insertions / 0 deletions** — purely additive.
  Every parity-UNCHANGED file's loc-fidelity diff EMPTY (zero silent
  offset drift from B-2/C-1). The set of parity-CHANGED files = exactly
  {7 V-2 fixtures} = {A-3 enumerated: ∅ — D-01 OUT} ∪ {7 fixtures}. No
  unexplained file changed. Built dist greps the B-2/C-1 symbols
  (`GUARDED_BOOT_RE` regex 1, `parenStrMatch` 3). The phase pre-mortem
  (offset drift, parity-green-but-click-to-source-broken) provably did
  NOT occur.

## Baseline gates (final)

- editor `pnpm --filter @stave/editor test`: **1564/1564** (unchanged).
- app `pnpm --filter @stave/app test`: **361/361** (was 347; +14 =
  7 fixtures × 2 specs; parity-corpus 25→32, loc-fidelity 25→32).

## Goal-backward check

GOAL = real-world parity materially up + the in-scope classes closed +
no offset drift + scope discipline held.
- Parity 72.0% → 80.0% (N=50, dated+SHA'd, fresh) — **achieved**.
- #142 (fixture-only, observed) + #143 + #144 closed; #148/#150/#151/#152
  pre-shipped — **achieved**.
- Per-file loc-fidelity STOP gate PASS, zero drift — **achieved**.
- D-01 #140/#141 held OUT (REFRAME → 20-17); the 1 NEW class filed as
  backlog #153 NOT fixed (phase cascaded 4×, line held) — **D-03
  discipline maintained**.

## Cognitive Discoveries

- vyapti (confirmed): the EXISTING `stripParserPrelude` depth walker is
  shape-agnostic over `{`/`[`/`(` — object-literal boot args were
  already consumed; #142 needed no code change. The matcher line held
  by observation, not inference (B-1 OQ2).
- vyapti (confirmed): PV49 additivity holds across a NEW parseRoot arm
  (#144) — routing the inner-string offset scan through
  `skipWhitespaceAndLineComments` kept loc valid against ORIGINAL source
  (V-3 per-file correlation, zero drift).
- krama (confirmed): PK17 step-6 fresh-pull discipline caught the
  classifier-ordering artifact (`-7LU6zgzViSM` binned #143 over a real
  D-02 arrow-fn) — re-measuring on a fresh sample, not the fixed-for
  one, surfaced it as a non-regression.

No bug here took >1 attempt → no hetvabhasa entry (single occurrence →
memory, not catalogue — promotion discipline).
