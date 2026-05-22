# New session resume prompt — post-20-21 strategic fork (parity vs debugger vs synth)

Copy-paste the block below into a fresh Claude Code conversation.

---

Continuing struCode (Stave). **Phase 20-21 MERGED (PR #164, merge
`9c87cba`) + the parity-harness blind-spot fix MERGED (PR #166, merge
`7ebcef7` = current main HEAD).** The Strudel parity work reached
"100% N=50" across the 20-1x cadence — **but a 2026-05-22 distribution
validation proved that was a FIXED-WINDOW MEASUREMENT ARTIFACT.** The
harness only ever sampled `offset=0`; a genuine N=500 sweep measures
**true real-world parity at 90.4%**, dominated by the #141/#140
binding-ref class (50% of fallbacks). The harness is now fixed
(`--offset` sweep) and the finding is catalogued (P71 + PV55).

**THIS SESSION: make the deferred strategic decision — parity-continue
vs debugger-pivot vs synth-IR — now grounded in the TRUE 90.4% metric,
not the blind-spot 100%.** Do NOT pre-decide; surface the fork to the
user with the trade-offs, then route to the chosen path's discuss-phase.

## PRE-FLIGHT (read first, in this order)

- `~/.claude/projects/-Users-mrityunjaybhardwaj-Documents-projects-struCode/memory/project_phase_20_musician_timeline.md`
  — THE load-bearing handoff. The "Phase 20-21 MERGED" block has the
  corrected 90.4% distribution finding, the ranked gap-class backlog,
  the harness-fix confirmation, the catalogued P71/PV55, the open
  issues, and the three-path decision framing (A parity / B debugger /
  C synth). Read in full.
- `~/.claude/projects/-Users-mrityunjaybhardwaj-Documents-projects-struCode/memory/project_debugger_thesis.md`
  — the PRIMARY OBJECTIVE (debugger v1 shipped 2026-05-08 PR #95+#96;
  v2 = bidirectional editing / engine↔IR identity / breakpoints).
  Path B's substrate.
- `~/.claude/projects/-Users-mrityunjaybhardwaj-Documents-projects-struCode/memory/project_phase_24_synth_ir.md`
  — Path C (SynthDef encoder, axis 5c; POC validated; ~5-6 weeks).
- `.anvi/` catalogues — NEW this session:
  - **P71** (hetvabhasa) — fixed-window measurement over-states
    distribution coverage. The governing pre-mortem for ANY future
    coverage metric. A "resample" returning identical rows is the
    detection signal.
  - **PV55** (vyapti) — a real-world coverage % must be measured
    against a distribution sample, never a fixed-offset window; the
    harness MUST expose the sampling parameter. Paired with P71.
  - **P70 (9-occurrence pattern)** — cascade classification can be
    wrong about WHY; RUN the bisect before trusting a prior
    classification. Still the spine of any parser/parity work.
  - Also live: PV49 (8-site whitespace/comment-tolerance substrate),
    PK16/17/18 (parser pipeline + friction-first + cascade discipline).
- GitHub issues (the parity roadmap, if Path A):
  - **#165** — umbrella: true 90.4% N=500 + ranked gap-class backlog.
  - **#141 (REOPENED)** — the dominant lever (binding-ref outside
    `stack()`-bare-arg; 50% of fallbacks; closing it → ~95.2%).
  - **#147** — samples() side-channel (feature-deferred).

## STATE

- main HEAD `7ebcef7` (PR #166 merged; the `--offset` harness fix).
- Baseline gates on main: editor **1627/1627**, app **417/417**
  (parity-corpus **49** + loc-fidelity **49** + other 319).
- **Parity: 90.4% TRUE distribution** (N=500, offset 0, pin
  `f73b3956`); the "100% N=50" was the offset=0 window only. Sweep
  the distribution with `pnpm parity:bakery --n 50 --offset M` (or a
  large `--n`).
- Ranked fixable gap classes: #141/#140 binding-ref (24, 50%) >
  uncategorised (12; incl. the trailing-`//`-comment-at-
  `stripParserPrelude`-exit variant = the P70-occ-9 mechanism at a
  THIRD walker site, top-level `function` decls, `await initHydra`) >
  #143 guarded-boot (5) > #142 samples-obj-lit (4). (D-02 arrow-fn = 3
  deliberate, NOT a gap.)

## TODAY — first action

Present the three-path fork to the user (parity-continue / debugger-
pivot / synth-IR), each with its trade-off, then route to the chosen
path's `/anvi:discuss-phase`. Recommended framing:

- **Path A (continue parity):** `/anvi:discuss-phase 20-22` targeting
  #141/#140 binding-ref — the dominant lever; the 20-17 D-01
  bounded-least-fixpoint binding-substitution machinery
  (`buildBindingMap`) exists and extends to the bare-arg-outside-stack
  case. 90.4% → ~95%. Highest-certainty, well-scoped, but parity has
  diminishing product leverage.
- **Path B (pivot to debugger — the PRIMARY OBJECTIVE):** a new
  milestone/phase on debugger v2 (engine↔IR identity PV38, live
  source-range highlighting, gutter breakpoints + scheduler pause).
  Highest product leverage; parity → maintenance backlog (#165).
- **Path C (Phase 24 synth IR):** the SynthDef encoder substrate;
  longest horizon.

## OPERATIONAL (carried — proven discipline across 20-16…20-21)

- AnviDev: issue→branch→fix→test→observe→PR→self-review→merge. Single
  non-stacked PR → main. Claude NEVER merges. `.anvi/` + `.planning/`
  gitignored → `git add -f`. No Co-Authored-By; no AI-attribution
  footer in PRs.
- COMMIT_TEMPLATE single-quoted heredoc (`git -c commit.gpgsign=false
  commit -q -F - <<'MSG' … MSG`); NEVER `-m` with backticks/`$()`
  under zsh.
- **Environment note:** macOS TCC (Documents folder access) flapped
  intermittently this session — `Read`/`Bash` hit `Operation not
  permitted` on `~/Documents/...` and the shell cwd reset to `$HOME`.
  Subagents were hit harder than the orchestrator (the 20-21 plan-check
  had to be done inline). If it recurs: grant the terminal app **Full
  Disk Access** in System Settings → Privacy & Security and restart the
  session. `stat` works under the block (metadata syscall); content
  reads do not.
- P68 build hygiene (if touching `packages/editor/src`): one-shot
  `pnpm --filter @stave/editor build` + ≥1 minification-stable literal
  grep on `dist/index.js` before every editor-src commit.
- P70/PK18 cascade discipline: RUN samples / bisect before trusting a
  classification; if a premise falsifies → STOP, record verbatim,
  re-pose to the user, never push through / second-workaround /
  bar-lower.
- **P71/PV55 (NEW): any "coverage is X%" claim MUST cite N + the
  sampling method (window vs sweep). A bare "100%" with no sampling
  provenance is suspect — sweep before believing it.**
- Post-merge artifact verification (not the badge): `git merge-base
  --is-ancestor <PR-head-sha> origin/main` exit 0; symbol grep-present
  on real main's `dist/`; baselines hold. Manually close 2nd+ issues
  per GitHub's 1-keyword limit.
- Absolute dates from the system clock; cognitive OS as needed.
