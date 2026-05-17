# New session resume prompt

Copy-paste the block below into a fresh Claude Code conversation.

---

Continuing struCode (Stave). Phases 20-14 + 20-15 are MERGED to main and
verified. This session: **Phase 20-16 — close the next batch of real-world
Bakery parser-gap classes (#140–#144)**, following the catalogued PK17
parity-hardening lifecycle.

## PRE-FLIGHT (read first)

- `~/.claude/projects/-Users-mrityunjaybhardwaj-Documents-projects-struCode/memory/project_phase_20_musician_timeline.md`
  — THE load-bearing file. Has the 20-14 Bakery reality check, the 20-15
  outcome (real-world parity 40%→72%), and the **NEXT: Phase 20-16**
  section with the prioritized wave grouping. Read in full.
- `.anvi/krama.md` **PK17** — the friction-first parity-hardening cycle
  (measure real-world → classify → fix highest-frequency → re-measure →
  vendor fixtures). This phase IS a PK17 instance. Also **PK16(b)** (the
  no-`$:` parse pipeline the gap classes live in).
- `.anvi/vyapti.md` **PV49** (shared `skipWhitespaceAndLineComments`
  walker — realized; route new scanning through it) + **PV51** (s/sound
  `isSampleKey` recursion). `.anvi/hetvabhasa.md` **P67** (Code
  tri-state: discriminate on `via`, NOT `tag==='Code'` — every new
  structured-node producer is a risk site) + **P68** (tsup-watch dies on
  DTS — fixed #145, but keep the one-shot-build + grep-gate).
- `.planning/phases/20-musician-timeline/20-15-SUMMARY.md` — the
  substrate already in place (`buildBindingMap`, `parity-bakery.mjs`
  sampler, loc-fidelity harness, 25-file corpus).
- `feedback_editor_watch_mode.md` (P68 build-hygiene) +
  `feedback_stacked_pr_base_retarget.md` (post-merge: a status/badge/sync
  string is NOT the artifact — verify HEAD==merge + 0/0 divergence +
  code-grep + test-count).

## STATE

- main = `f6cb704` (PR #146, 20-15 merged+verified). Working tree clean
  except pre-existing untracked `packages/docs/`,
  `packages/app/public/docs/`. No open feature branches.
- Gates baseline on main: editor **1564/1564**, app parity-corpus
  **50/50** (25 parity + 25 loc-fidelity).
- Backlog, prioritized by 20-15 V-1 frequency (50 fresh samples):
  - **#141** var-keyword bindings + binding-refs OUTSIDE stack() args —
    **DOMINANT, 6/14 of failures.** Highest payoff.
  - **#140** generalize γ-3's `buildBindingMap` beyond stack()
    bare-ident args (deferred γ-4). Coupled to #141 — same surface.
  - **#142** `stripParserPrelude`: `samples({...})` /
    `samples('github:...')` multi-line + object-literal boot args.
  - **#143** `stripParserPrelude`: guarded boot expr
    `typeof X !== undefined && X(...)`.
  - **#144** parenthesized-root `(expr).chain()` leading-dot
    continuation (`splitRootAndChain`/`parseRoot` surface).

## TODAY — first action

`/anvi:discuss-phase 20-16` — gather gray-area decisions, then
plan → execute → verify (same loop as 20-15). Proposed wave shape
(discuss/plan refines it):

- **Wave A (highest payoff): #141 + #140** — binding-map
  generalization. `buildBindingMap` exists (γ-3); extend to `var`, refs
  outside stack() args, general substitution.
- **Wave B (cheap, same boundary): #142 + #143** —
  `stripParserPrelude` prelude-skip extensions; same PK16(b) stage-1
  surface as closed #135/G2 (R2 anti-drift: hand-maintained skip set +
  comment + SHA pin + per-case fixture).
- **Wave C: #144** — parenthesized-root + dot-chain.
- **+ Verification (PK17 step 6)**: fresh ~50-sample
  `pnpm parity:bakery` re-measure (target >72%, cite N + date + upstream
  SHA); vendor #140–#144 repros as permanent `bakery-*.strudel`
  fixtures; NEW fallback classes → backlog, do NOT fix (scope
  discipline). loc-fidelity is the standing drift gate — any
  loc-fidelity-only diff = offset drift = STOP.

Gray areas to surface (candidates, not locked): binding-map depth for
#140/#141 (how far past minimal single-assignment before the
matcher-not-interpreter line, cf. 20-15 D-02); `var` hoisting/TDZ in
scope or graceful-fallback; #142 object-literal `samples({...})` — strip
vs shallow-parse.

## OPERATIONAL

AnviDev (issue→branch→fix→test→observe→PR→self-review→merge). Claude
never merges. `.anvi/` + `.planning/` gitignored — `git add -f`. No
Co-Authored-By. **Branch first** (never code on main — config
branching=none but AnviDev overrides). Editor watch UNRELIABLE (P68) —
one-shot `pnpm --filter @stave/editor build` + `grep -c <newSymbol>
dist` before each editor-src commit. Single non-stacked PR → main.
Post-merge: verify the artifact not the badge. Absolute dates from
system. Cognitive OS as needed; this phase is a PK17 instance.
