---
phase: 05-per-track-data
verified: 2026-03-22T12:10:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Phase 05: Per-Track Data Verification Report

**Phase Goal:** Expose per-track PatternSchedulers from StrudelEngine by capturing patterns during evaluate via monkey-patching Pattern.prototype.p. Each $: block gets its own scheduler that queries its Pattern directly via queryArc.
**Verified:** 2026-03-22T12:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After evaluate(), getTrackSchedulers() returns a Map with one entry per $: block | VERIFIED | `getTrackSchedulers(): Map<string, PatternScheduler>` at line 303 of StrudelEngine.ts; tests `captures anonymous $: patterns as $0, $1` and `captures named patterns with literal key` both pass; map.size assertions confirmed |
| 2 | Each track scheduler's query() calls queryArc on its own captured Pattern | VERIFIED | Closure captures `const captured = pattern` per loop iteration (lines 191-199 StrudelEngine.ts); test `each track scheduler queries its own pattern (TRACK-03)` passes with `expect(result0[0].id).not.toBe(result1[0].id)` |
| 3 | Pattern.prototype.p is always restored in finally block even on error | VERIFIED | `finally` block at lines 203-210 unconditionally restores `savedDescriptor`; two dedicated TRACK-02 tests pass — one for success path, one for error path (`error-code` triggers `onEvalError`, prototype still restored) |
| 4 | Anonymous $: patterns get keys '$0','$1'; named patterns use literal name | VERIFIED | Logic at lines 162-166: `if (id.includes('$')) { captureId = '$${anonIndex}'; anonIndex++ }`; `mixed` test confirms both `$0` and `d1` in same evaluate; `skips muted patterns _x and x_` test confirms map.size === 0 for muted-only patterns |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/editor/src/engine/StrudelEngine.ts` | getTrackSchedulers() method + setter-intercept capture logic in evaluate() | VERIFIED | File exists (325 lines); contains `getTrackSchedulers`, `Object.defineProperty(Pattern.prototype, 'p'` (3 occurrences — outer setter install, inner value wrap, finally restore), `capturedPatterns.set(captureId, this)`, `savedDescriptor`, `anonIndex`, muted-skip predicate |
| `packages/editor/src/engine/StrudelEngine.test.ts` | Unit tests for TRACK-01 through TRACK-04 | VERIFIED | File exists (285 lines); `describe('StrudelEngine.getTrackSchedulers')` block; 9 `it(` calls; `getTrackSchedulers` appears 9 times; `Pattern.prototype.p` appears 6 times; `queryArc` appears 3 times; imports from vitest and StrudelEngine |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `StrudelEngine.ts evaluate()` | `@strudel/core Pattern.prototype.p` | `Object.defineProperty` setter intercept | VERIFIED | Lines 153-174: outer setter fires when injectPatternMethods assigns `.p`; inner value-descriptor wraps Strudel's fn; 3 occurrences of `Object.defineProperty(Pattern.prototype` confirmed |
| `StrudelEngine.ts getTrackSchedulers()` | `PatternScheduler` interface | returns `Map<string, PatternScheduler>` | VERIFIED | `PatternScheduler` imported from `../visualizers/types` (line 5); `private trackSchedulers: Map<string, PatternScheduler> = new Map()` (line 30); return type explicit on `getTrackSchedulers(): Map<string, PatternScheduler>` (line 303) |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TRACK-01 | 05-01-PLAN.md | Pattern.prototype.p monkey-patched during evaluate() to capture per-$: Pattern objects into capturedPatterns map | SATISFIED | Setter-intercept wraps injectPatternMethods assignment; capturedPatterns populated; Map returned via getTrackSchedulers() |
| TRACK-02 | 05-01-PLAN.md | Pattern.prototype.p always restored in finally block — even on evaluate error | SATISFIED | `finally` block at lines 203-210; two tests verify — successful evaluate and error path; no setter left after either |
| TRACK-03 | 05-01-PLAN.md | StrudelEngine.getTrackSchedulers() returns Map<string, PatternScheduler> where each value queries its captured Pattern directly via queryArc | SATISFIED | `getTrackSchedulers()` returns `this.trackSchedulers`; each scheduler closes over a unique `captured` Pattern; test confirms different `queryArc` results per track |
| TRACK-04 | 05-01-PLAN.md | Anonymous $: patterns keyed as "$0", "$1" etc; named patterns (d1:) use literal name | SATISFIED | `id.includes('$')` branch normalises to `$${anonIndex}`; literal `id` used for named patterns; muted patterns skipped; all four subcases tested (two-anon, one-named, mixed, muted) |

No orphaned requirements — REQUIREMENTS.md maps TRACK-01 through TRACK-04 to Phase 5 and all four are claimed in 05-01-PLAN.md.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No anti-patterns found |

Neither `StrudelEngine.ts` nor `StrudelEngine.test.ts` contain TODO, FIXME, PLACEHOLDER, empty return stubs, or hardcoded empty data that flows to rendering. The `new Map()` initializer for `trackSchedulers` is a legitimate initial state overwritten by `evaluate()`.

---

### Human Verification Required

None. All observable truths are fully verifiable programmatically:

- Map key correctness: test assertions
- Prototype restoration: descriptor inspection in test afterEach
- Per-track isolation: distinct `queryArc` instanceId values
- Muted pattern exclusion: map.size === 0 assertion

---

### Gaps Summary

No gaps. All four must-have truths are verified, both artifacts are substantive and wired, all four TRACK requirements are satisfied, both commits (`bdbdb45` RED, `eacefb3` GREEN) exist in git history, and the full 85-test suite is green with no regressions.

The setter-intercept implementation matches the plan specification exactly. The finally-restore pattern handles both success and error paths. The anonymous index counter (`anonIndex`) is reset to 0 per evaluate() call, correctly mirroring Strudel's internal `anonymousIndex` reset. The `trackSchedulers` map is replaced entirely on successful re-evaluate, preventing stale pattern references.

---

_Verified: 2026-03-22T12:10:00Z_
_Verifier: Claude (gsd-verifier)_
