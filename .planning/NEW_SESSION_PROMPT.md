# New session resume prompt

Copy-paste the block below into a fresh Claude Code conversation.

---

Continuing struCode (Stave). Phase 20-16 is MERGED (PR #154, `aaae98c`,
parity 72→80%, all 7 issues closed). **This session: EXECUTE Phase
20-17 — D-01 binding resolution, pervasive-context substitution.** It is
fully DISCUSSED + PLANNED + CHECKED (PASS, after 2 revision rounds) +
COMMITTED. Decisions are LOCKED — do not relitigate; execute the plan.

## PRE-FLIGHT (read first, in this order)

- `~/.claude/projects/-Users-mrityunjaybhardwaj-Documents-projects-struCode/memory/project_phase_20_musician_timeline.md`
  — THE load-bearing file. The **"20-17 STATUS 2026-05-19"** block has
  the LOCKED D-01/D-02-CORRECTION/D-03 + the `0→A→C→D→E→V` wave graph.
  Read in full.
- `.planning/phases/20-musician-timeline/20-17-CONTEXT.md` — LOCKED
  decisions are AUTHORITATIVE. **Read the "D-02 CORRECTION (2026-05-19)"
  section** — it SUPERSEDES the original D-02 (the original premise was
  unconstructible; the original block is retained only for provenance).
- `.planning/phases/20-musician-timeline/20-17-PLAN.md` — the executable
  plan (wave/task bodies, per-task verify, the dependency graph, the
  D-03 dual-gate closing check). This is the prompt; follow it.
- `.planning/phases/20-musician-timeline/20-16-OBSERVATIONS.md` — the
  empirical Wave A-0 4-gap map (the RESEARCH seed; replaces the
  falsified "primitive already built" premise) + the 6-repro
  classification baseline + the synthetic-gate evidence.
- `.anvi/` catalogues: NEW this session — **P69** (grounded-LOOKING
  inference: a file:line citation is NOT observation until the path is
  run/grepped — the session's spine), **PK18** (Lokāyata HARD-GATE
  cascade discipline: gate falsifies framing → STOP, record,
  re-classify, re-pose locked decisions to user, reframe, NEVER push
  through), **PV52** (the `tag==='Code' && via===undefined` bare-Code
  discriminator spans 8 consumers; any new `via` arm must be additive +
  keep the predicate byte-identical + obligate the grep-reproduced
  8-consumer guarded audit). Also relevant: **P67** (Code tri-state),
  **P68** (editor watch unreliable — one-shot build + grep per
  editor-src commit), **PV49** (route new scans through
  `skipWhitespaceAndLineComments`; offset-additivity), **PV50** (no
  per-evaluate engine state — why D-01 G4 is optional-arg threading,
  not module state), **PV51** (`isSampleKey` threads alongside
  `bindings`), **PK16** (no-`$:` pipeline; buildBindingMap = stage 0.5),
  **PK17** (friction-first parity cycle — step-6 fresh re-measure).
- `~/.claude/.../memory/feedback_commit_msg_heredoc.md` — ALL multi-line
  commit bodies via `git commit -F - <<'MSG' … MSG` heredoc. NEVER
  `-m` with backticks/`$()` under zsh (it executes + strips them;
  recurred 2× in 20-16). The plan's EXECUTOR NOTES has `COMMIT_TEMPLATE`.

## STATE

- main HEAD `bb6766a`. 20-17 CONTEXT (`f669464`) + D-02 CORRECTION
  (`f9cd20c`) + PLAN (`bb6766a`) on main (`.planning/` + `.anvi/`
  gitignored — committed via `git add -f`; this is normal here).
- Baseline gates on main: editor **1564/1564**, app **361/361**
  (parity-corpus 32 + loc-fidelity 32 + rest), real-world Bakery
  **80.0%** (40/50, N=50, 2026-05-18T14-34-02Z, upstream pin
  f73b395648645aabe699f91ba0989f35a6fd8a3c).
- **Gate oracle is VOLATILE:** `/tmp/proto-d01-fixpoint.spec.ts` +
  `/tmp/repro_*.strudel` (6 files) — Wave 0 vendors them into the repo
  FIRST. If `/tmp` was wiped since 2026-05-19, reconstruct from
  20-16-OBSERVATIONS.md (it has the verbatim prototype + the 6 repro
  hashes + the extraction command); the pre-D-01 baseline is **2/6
  structured** (`-CyO42BOyp5a`, `-L13nBhrqGR_`).
- Open: #140/#141 (closed by 20-17). Backlog (NOT in scope):
  #149/#147/#153. No open feature branches.

## TODAY — first action

`/anvi:execute-phase 20-17`

Wave graph **`0 → A → C → D → E → V`** (Wave B was collapsed into A):
- **0** vendor the volatile oracle + capture the 2/6 baseline on main.
- **A** G4 signature refactor — optional `bindings?` 4th-arg through
  `applyChain`/`parseTransform`/the 12 recursion sites; **byte-identical**
  (every existing caller omits it; "any diff = STOP"); `keepNames` for
  the P68 grep anchor.
- **C** G1 (chain-arg, pS:~1052, 1 line) + G2 (bound-ident-root arm in
  parseRoot, before the note/n arm).
- **D** G3 — D-1a additive `Code.via {literal:true;raw}` arm
  (wrapAsOpaque arm byte-unchanged; fence byte-identical) +
  `classifyLiteralRhs` helper; D-1b STRICT literal regex; **D-1c the
  grep-reproduced 8-consumer guarded audit — the phase's PRIMARY risk
  surface; `MusicalTimeline.tsx:298-299` is the HIGH-severity unguarded
  `via.inner` deref, must guard + route a literal node through its
  projection in the acceptance test**.
- **E** bounded least-fixpoint + occurs-check terminal (consumes D-1a's
  helper; loc-fidelity safe by the OBSERVED γ-3 splice mechanism —
  `loc-fidelity.test.ts:82` + `parseStrudel.ts:1099`; no allow-list
  extension).
- **V** D-03 **dual gate, no bar-lowering** (`--LsnlgQ6osk` STRUCTURED
  in production AND fresh `pnpm parity:bakery` ≥85.0%) + bakery-140
  fixture + per-file loc-fidelity STOP gate + SUMMARY + catalogues +
  single non-stacked PR (`closes #140 #141` — manual-close one on merge,
  GitHub honors only one keyword).

## OPERATIONAL

AnviDev (issue→branch→fix→test→observe→PR→self-review→merge). **Branch
first** (`feat/20-17-d01-pervasive`; never code on main). Claude NEVER
merges. Single non-stacked PR → main. `.anvi/` + `.planning/`
gitignored → `git add -f`. No Co-Authored-By. Commit bodies via
`COMMIT_TEMPLATE` heredoc (P69/feedback_commit_msg_heredoc). **P68**:
one-shot `pnpm --filter @stave/editor build` + `grep -c <CODE-anchor>
dist/index.js` > 0 before EVERY editor-src commit (anchor a code token
/ string, NOT a comment, NOT a param name — Wave A's `keepNames` makes
the param a valid anchor). **Per-file loc-fidelity STOP gate**: any
parity-UNCHANGED file with a loc-fidelity diff = silent offset drift =
STOP. **PK18 discipline**: if any gate (proto re-run, the D-03 dual
gate, the D-1c audit) falsifies a premise → STOP, record verbatim in
20-17-OBSERVATIONS.md, re-classify, re-pose the invalidated locked
decision to the user, reframe — do NOT push through, do NOT add a
second workaround, do NOT lower the bar. New gap classes → backlog
issues (issue-before-fix), NOT fixed this phase (scope discipline —
the 20-16 4× cascade lesson). Post-merge: verify the artifact not the
badge (`git merge-base --is-ancestor <PR-head> main` exit 0; HEAD==merge;
code grep present on main dist; editor 1564 + app ≥361 hold).
Cognitive OS as needed; this phase is a PK17 instance and a PK18
exemplar. Absolute dates from the system clock.
