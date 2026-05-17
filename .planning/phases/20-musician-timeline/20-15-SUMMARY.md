---
phase: 20-15
title: Strudel.cc parity hardening — close 6 parser-gap classes
created: 2026-05-16
closes: ["#132", "#134", "#135", "#136", "#137", "#138"]
gate: verification-wave-passed
upstream_pin_sha: f73b395648645aabe699f91ba0989f35a6fd8a3c
real_world_parity_sample:
  N: 50
  structured: 36
  pct: "72.0%"
  date: 2026-05-15T23-13-07Z
  upstream_sha: f73b395648645aabe699f91ba0989f35a6fd8a3c
  baseline: "4/10 = 40.0% (2026-05-15 Bakery stress test)"
backlog_issues: ["#140", "#141", "#142", "#143", "#144"]
---

# Phase 20-15 — SUMMARY

**Closes #132/#134/#135/#136/#137/#138.** The 2026-05-15 Bakery stress
test measured real-world structural parity at 4/10 (vs 15/16 curated) —
the 20-14 ~2:1 over-statement lesson. Waves α/β/γ closed the 6 named
parser-gap classes; the verification wave **measured** the result on a
fresh statistically-meaningful sample, locked the gains as permanent CI,
and backlogged the remaining classes (D-03 scope discipline — NOT fixed
here).

## The reproducible parity claim (D-03)

**Real-world structural parity = 72.0% (36/50 structured)**, measured by
`pnpm parity:bakery --n 50` on a FRESH live `code_v1` Supabase pull,
**2026-05-15T23-13-07Z**, upstream pin **f73b3956**, N=50 non-empty
samples (Supabase returned 100 rows; column `code` resolved at run time
from upstream `util.mjs` per R5).

| | value |
|---|---|
| Baseline (2026-05-15 stress test) | 4/10 = **40.0%** (noisy, N=10) |
| 20-15 measured | 36/50 = **72.0%** (N=50, statistically meaningful) |
| Movement | **+32 pts absolute, +80% relative** |

Reproducibility: the live pull is gitignored (`.bakery-runs/`, unreviewed
third-party code); the **CI-reproducible floor** is the 6 vendored
`bakery-*.strudel` fixtures (V-2) + 2 per-setter fixtures (V-3). Re-run
`pnpm parity:bakery` to re-measure on a fresh sample — the %
will vary slightly run-to-run (fresh rows), the floor will not.

## Known-set gate (D-04: ≥9/10)

**8/8 known fixtures parse STRUCTURED** (well clear of ≥9/10):

| Gap | Issue | Fixture | Result |
|---|---|---|---|
| G1 let/const binding | #134 | bakery-G1-let-binding | `Stack` structured (γ-3) |
| G2 setcpm prelude | #135 | bakery-G2-setcpm | `Stack` (α-1) |
| G2 setCpm | #135 | bakery-G2-setCpm-camel | `Stack` (V-3) |
| G2 setCps | #135 | bakery-G2-setCps-camel | `Stack` (V-3) |
| G3 backtick | #136 | bakery-G3-backtick | `Track`(structured) — needed the V-2 `sound`-alias fix |
| G4 comment args | #137 | bakery-G4-comment-args | `Stack[Play,Play]` (α-4) |
| G5 named label | #138 | bakery-G5-named-label | `Stack`, trackId=`p1` (γ-2) |
| #132 recursive args | #132 | bakery-132-recursive-args | Code-with-`via` over a structured `Play` tree (P67 wrapper, β-2) |

## Goal-backward verification (every row OBSERVED, not inferred)

| GOAL element | Evidence | Verdict |
|---|---|---|
| 6 named classes closed | 8/8 fixtures structured (table above) | PASS |
| Real-world % materially > 4/10 | V-1 measured 72.0%, N=50 | PASS |
| ≥9/10 known set | 8/8 structured | PASS |
| 16 originals: no regressions, only GOAL-permitted improvements | 5 of 16 (amensister, arpoon, belldub, flatrave, randomBells) improved bare-`Code`→structured (Play/Seq counts strictly rose, none regressed); other 11 byte-unchanged; loc-fidelity 25/25 confirms no offset drift. This is the GOAL's explicitly-permitted "explained structural improvements (e.g. arpoon #132)" exception — NOT "all 16 byte-unchanged" (an earlier draft of this row over-claimed; corrected per independent verifier) | PASS |
| loc-fidelity empty-diff (THE pre-mortem) | 25/25 full-corpus green; only explained G3 Code→structured | PASS |
| Editor suite unchanged | 1564/1564 (was 1551 at plan time; grew via γ tests) | PASS |
| parity-corpus gate | 50/50 (25×2: 16 tunes + 6 gap + 2 setter + sanity) | PASS |
| Matcher stays a matcher | D-02 (γ-3) + D-04 `${}`/arrow (β-3) graceful Code held; γ-4 dropped → #140 | PASS |

## Verification wave tasks

- **V-1** (`abe59dd`): `pnpm parity:bakery` maintainer sampler + vitest
  classifier + dedicated config (keeps CI gate exactly N files).
  Measured 72.0%. Backlog filed: #141 (binding refs / `var`, the
  dominant 6/14 — supplies #140 its frequency evidence), #142 (samples
  object-literal), #143 (guarded boot expr), #144 (parenthesized-root +
  dot-chain). AnviDev issue-before-fix; none fixed this phase (D-03).
- **V-2** (`f8a6231`): 6 `bakery-*.strudel` fixtures + BAKERY-FIXTURES.md
  provenance + parity-refresh.mjs exclusion-guard. **Discovered + fixed an
  incomplete in-phase G3 deliverable:** issue #136's literal repro is
  `sound(`…`)` but β-3 only added backtick arms for `s`/`note`/`n`/`mini`
  — `sound` (Strudel's documented alias of `s`) was never a recognised
  root form AT ALL (every `sound(...)` form fell to bare Code). Fixed by
  widening the 4 `s`-arm regexes + #132 loose arm to `(?:s|sound)`
  (isSampleKey threaded identically). The fixture using the issue's
  VERBATIM repro is what caught it — the ad-hoc REPL checks used the
  working `s(`…`)` paraphrase.
- **V-3** (`166d1fe`): per-setter fixtures for `setCpm`/`setCps` (read
  VERBATIM from the α-1 commit body `a2b607c` — NOT re-derived;
  `setcpm` already covered by V-2; `setcps` pre-existing). `-camel` slug
  avoids a case-only filename (FS is case-INSENSITIVE, observed). The
  loc-fidelity FINAL GATE ran over the full 25-file corpus: empty-diff —
  the phase pre-mortem (silent offset drift from the α-3/G4/G5/V-2
  walker reroutes) provably did NOT occur.
- **V-4** (this commit): SUMMARY + catalogue updates + backlog.

## Backlog (D-03 — NOT fixed this phase; AnviDev issue-before-fix)

The 14/50 remaining Code-fallbacks triage to:
- **#141 → #140** binding ref outside `stack()`-bare-arg / `var` keyword —
  **6/14, the dominant remaining class.** #140 (the dropped γ-4 STRETCH)
  is the fix vehicle; #141 records V-1's measured frequency as its
  priority evidence.
- **#142** `samples({...})` object-literal boot arg — 1–3/14.
- **#143** guarded boot expr `typeof X !== 'undefined' && X(...)` — 1/14.
- **#144** parenthesized-root + leading-dot chain — 1/14.
- Remainder: #141-class, or D-04-correct `${}` / arrow-fn Code-fallbacks
  (the matcher SHOULD bail there — not gaps).

## Catalogue updates (.anvi/, force-added — gitignored)

- **vyapti PV49** — REALIZED + R1 divergence documented: the shared
  `skipWhitespaceAndLineComments` primitive serves the 3 inter-token
  sites; `stripParserPrelude`'s whole-line classifier is deliberately
  NOT migrated. Added the V-2 alias corollary (match the language's
  equivalent FORMS, incl. root-fn aliases; fixtures must use the issue's
  verbatim repro).
- **vyapti PV51 (new)** — `s(...)`/`sound(...)` sample-key context MUST
  be threaded through recursive `parseExpression`; a plain recursive
  parse silently drops `params.s` + duration semantics. ORIGIN: 20-15
  β-1 probe (it OVERTURNED a MEDIUM-confidence research inference by
  direct observation).
- **krama PK16** — NEW stage 0.5 (`buildBindingMap`, between
  prelude-strip and splitRootAndChain); the G5 label-pipeline branch;
  the R2 hand-maintained-skip-set anti-drift mechanism.
- **hetvabhasa P68 (new)** — `tsup --watch` terminates ENTIRELY on a
  DTS-build failure (does NOT degrade to JS-only). Detection:
  `grep -c <newSymbol> dist/index.js == 0`. Fix: one-shot
  `pnpm --filter @stave/editor build` + grep-gate per editor-src commit.
  Extends P66/PV48. ORIGIN: 20-15 γ-3, re-confirmed V-2.
