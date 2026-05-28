# New session resume prompt — post-launch UX-fix pass (then debugger v2)

Copy-paste the block below into a fresh Claude Code conversation.

---

Continuing struCode (Stave). **Stave is now LIVE in production at
https://stave.live** (shipped 2026-05-27 — Vercel project `stave-code-app`,
git-connected auto-deploy on push to `main`; GoDaddy DNS, apex A →
76.76.21.21). The Strudel parity work is banked (true distribution ~90.4–92.7%,
no dominant lever left; #165 tracks the maintenance backlog). The first public
build is **Strudel-only** — Sonic Pi is parked (#173; decoupled via opaque
import + templates hidden, #171/#172).

**THIS SESSION'S MISSION (user-directed): a post-launch UX-fix pass on the live
app — fix all the UX issues FIRST, BEFORE starting debugger v2.** The debugger
(the deferred PRIMARY OBJECTIVE) is the move AFTER this pass, not now.

## FIRST ACTION — enumerate + triage the UX issues

Do NOT jump into fixing. Start by building the UX issue list:
1. **Ask the user** what's bothering them on the live app (they've been using
   stave.live — they have the real list). This is the primary source.
2. **Optionally augment** with a structured UI audit (`/anvi:ui-review` for a
   6-pillar visual audit of the implemented frontend, or a manual pass of the
   editor shell: tabs, panels, viz zones, transport, file tree, command
   palette, keyboard shortcuts, mobile/responsive, first-load empty state).
3. **Triage into GitHub issues** (one per discrete UX problem), grouped by
   area + severity. CHECKPOINT with the user on the list before fixing.
4. Then fix via AnviDev, smallest/highest-impact first.

## PRE-FLIGHT (read first, in this order)
- `~/.claude/projects/-Users-mrityunjaybhardwaj-Documents-projects-struCode/memory/project_strucode.md`
  — core project context + the new **Deployment** section (Vercel/GoDaddy, live URL, Strudel-only).
- `~/.claude/projects/-Users-mrityunjaybhardwaj-Documents-projects-struCode/memory/feedback_build_gates_vs_local.md`
  — **the deploy gates (load-bearing): local `pnpm test` is NOT the gate.**
  Run the real `next build` (full tsc) + a sibling-absent build before
  declaring anything shippable. Catalogued P72 + PV54 addendum.
- `~/.claude/projects/-Users-mrityunjaybhardwaj-Documents-projects-struCode/memory/project_phase_20_musician_timeline.md`
  — the load-bearing handoff (the 20-22 block + the SHIPPED note + the
  debugger NEXT-after-UX).
- `~/.claude/projects/-Users-mrityunjaybhardwaj-Documents-projects-struCode/memory/project_debugger_thesis.md`
  — the debugger v2 substrate (the move AFTER this UX pass).
- `.anvi/` catalogues — esp. **P68** (editor-src build hygiene),
  **P72 + PV54 addendum** (deploy gates), **PV49** (loc-fidelity for any
  editor-src/IR change).

## STATE
- main HEAD: latest (includes PR #172 merge + catalogue commit `6c779fe`).
- Editor **1640/1640**, app **430/430** green. Live build = Strudel-only.
- Open: **#173** (restore Sonic Pi — backlog), **#165** (parity maintenance umbrella).
- Stack: Next.js 16 + React 19, pnpm/turbo monorepo (`packages/{app,editor,docs}`);
  editor consumes `@stave/editor` via committed `dist/` (exports → dist).

## OBSERVATION (Lokāyata — this is a UX session, observe the real UI)
- The real test surface is the **live app / preview deploys**, not unit tests.
  Every PR gets a Vercel preview deploy; merge to main auto-deploys to stave.live.
- For visual/interaction bugs, OBSERVE the rendered UI (screenshots, the live
  app, the running `pnpm --filter @stave/app dev`), don't infer from JSX.
- A UX "fix" is proven by seeing it behave correctly in the running app, not by
  a green test.

## OPERATIONAL (carried — proven discipline)
- AnviDev: issue → branch → fix → test → **observe (run the app, look)** → PR →
  self-review → merge. Single non-stacked PR → main. **Claude NEVER merges.**
- `.anvi/` + `.planning/` gitignored → `git add -f`. **No Co-Authored-By; no
  AI-attribution footer in PRs.** Commit bodies via `git commit -F -` heredoc
  (single-quoted `<<'MSG'`), never `-m` with backticks/$() under zsh.
- **Before editing `packages/editor/src`:** start `pnpm --filter @stave/editor
  dev` (tsup --watch) — consumers read `dist/`. P68: one-shot
  `pnpm --filter @stave/editor build` + minification-stable literal grep on
  `dist/index.js` before each editor-src commit.
- **Before declaring shippable (P72):** run the real `pnpm --filter @stave/app
  build` (full tsc — vitest does NOT typecheck). For anything touching imports,
  no repo-escaping relative paths.
- PV49 loc-fidelity empty-diff gate for any editor-src IR/parser change.
- Post-merge: main auto-deploys; verify the change on the live deploy (not just
  the badge). Manually close 2nd+ issues per GitHub's 1-keyword limit.
- Absolute dates from the system clock; cognitive OS as needed.
