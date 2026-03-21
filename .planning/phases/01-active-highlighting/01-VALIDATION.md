---
phase: 1
slug: active-highlighting
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 1.6.0 |
| **Config file** | `packages/editor/vitest.config.ts` |
| **Quick run command** | `cd packages/editor && pnpm test -- --reporter=verbose` |
| **Full suite command** | `cd packages/editor && pnpm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/editor && pnpm test -- --reporter=verbose`
- **After every plan wave:** Run `cd packages/editor && pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | HIGH-01..05 | unit | `cd packages/editor && pnpm test -- src/monaco/useHighlighting.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | HIGH-01 | unit | `cd packages/editor && pnpm test -- src/monaco/useHighlighting.test.ts` | ✅ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | HIGH-02 | unit | `cd packages/editor && pnpm test -- src/monaco/useHighlighting.test.ts` | ✅ W0 | ⬜ pending |
| 1-01-04 | 01 | 1 | HIGH-03 | unit | `cd packages/editor && pnpm test -- src/monaco/useHighlighting.test.ts` | ✅ W0 | ⬜ pending |
| 1-01-05 | 01 | 1 | HIGH-04 | unit | `cd packages/editor && pnpm test -- src/monaco/useHighlighting.test.ts` | ✅ W0 | ⬜ pending |
| 1-01-06 | 01 | 2 | HIGH-05 | unit+manual | `cd packages/editor && pnpm test -- src/monaco/useHighlighting.test.ts` | ✅ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/editor/src/monaco/useHighlighting.test.ts` — stubs for HIGH-01..HIGH-05
- [ ] Mock Monaco editor with `createDecorationsCollection`, `getModel`, `getPositionAt` stubs
- [ ] Vitest fake timers setup (`vi.useFakeTimers()`) in test file

*Existing Vitest infrastructure (packages/editor/vitest.config.ts) covers the framework — no install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Highlight visually glows with accent color at exact audio play moment | HIGH-01, HIGH-05 | Requires browser audio + visual inspection | Play a pattern in the app; verify characters light up with accent color at note playback time |
| Per-hap color field renders correct color | HIGH-01 | Color injection is runtime visual | Use a Strudel pattern with `color("red")` and verify the highlight color matches |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
