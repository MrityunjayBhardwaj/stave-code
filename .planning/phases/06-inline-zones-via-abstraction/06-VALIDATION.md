---
phase: 6
slug: inline-zones-via-abstraction
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 6 — Validation Strategy (REVISED: .viz() per-pattern opt-in)

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x |
| **Config file** | packages/editor/vitest.config.ts |
| **Quick run command** | `pnpm --filter @strucode/editor test -- --run` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @strucode/editor test -- --run`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | ZONE-01 | unit | `pnpm --filter @strucode/editor test -- --run StrudelEngine` | ✅ | ⬜ pending |
| 06-01-02 | 01 | 1 | ZONE-02 | unit | `pnpm --filter @strucode/editor test -- --run viewZones` | ✅ | ⬜ pending |
| 06-02-01 | 02 | 2 | ZONE-03 | unit | `pnpm --filter @strucode/editor test -- --run viewZones` | ✅ | ⬜ pending |
| 06-02-02 | 02 | 2 | ZONE-04 | unit | `pnpm --filter @strucode/editor test -- --run StrudelEditor` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing test infrastructure covers framework needs. StrudelEngine.test.ts and viewZones.test.ts already exist.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| .viz("pianoroll") renders inline zone after last line of pattern block | ZONE-01 | Visual zone placement verification | Write `$: note("c4").viz("pianoroll")` over 2 lines, verify zone appears after line 2 |
| Per-track data isolation in inline zones | ZONE-02 | Visual verification of separate track rendering | Two $: blocks with .viz(), verify each shows only its track |
| Patterns without .viz() get no inline zone | ZONE-01 | Visual absence verification | Three $: blocks, only one with .viz(), verify only one zone appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
