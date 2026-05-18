# Bakery Regression Fixtures — closed parser-gap classes (20-15 + 20-16)

These `bakery-*.strudel` files are **NOT** upstream `tunes.mjs` exports
(unlike the 16 curated tunes documented in `CORPUS-SOURCE.md`). They are
**minimal repros** distilled from the GitHub issues filed during the
2026-05-15 Bakery real-world stress test (Phase 20-15), vendored here as
**permanent regression fixtures** so the 6 gap classes closed in 20-15 can
never silently regress.

They are auto-discovered by `parity.test.ts` and `loc-fidelity.test.ts`
exactly like the upstream tunes (one snapshot per file). They are
**deliberately excluded** from `parity-refresh.mjs` TARGETS (and a guard
there throws if one leaks in) — they have no upstream `tunes.mjs` origin,
so the upstream-drift tool must never report them as "missing upstream".

This is the **≥9/10 known-set gate** (Phase 20-15 D-04): each fixture
asserts the gap-class repro now parses to **structured IR** (not the old
opaque `Code(BARE-FALLBACK)`).

| Fixture | Gap | Issue | Repro source | Asserts |
|---|---|---|---|---|
| `bakery-G1-let-binding.strudel` | G1 — top-level `let`/`const` bindings + `stack()` bare-ident refs | [#134](https://github.com/MrityunjayBhardwaj/stave-code/issues/134) · Bakery `?Qm3zohrBUY-h` | issue #134 minimal repro | `Stack` of structured voices, not whole-program Code |
| `bakery-G2-setcpm.strudel` | G2 — `setcpm` tempo-setter prelude skip | [#135](https://github.com/MrityunjayBhardwaj/stave-code/issues/135) | issue #135 minimal repro | `setcpm(...)` line stripped, `stack(...)` structured |
| `bakery-G3-backtick.strudel` | G3 — backtick template-literal string args (multi-line mini) | [#136](https://github.com/MrityunjayBhardwaj/stave-code/issues/136) | issue #136 minimal repro | `$:` Track wrapping backtick `sound(...)` structured |
| `bakery-G4-comment-args.strudel` | G4 — comment-only lines between `stack()` args | [#137](https://github.com/MrityunjayBhardwaj/stave-code/issues/137) | issue #137 minimal repro | `Stack[Play, Play]`, not `Stack[Code, Code]` |
| `bakery-G5-named-label.strudel` | G5 — `name: pattern` named-label syntax | [#138](https://github.com/MrityunjayBhardwaj/stave-code/issues/138) | issue #138 minimal repro | `Track(trackId='p1', …)` structured |
| `bakery-132-recursive-args.strudel` | #132 — recursive mini+chain inside `note`/`n`/`s` args | [#132](https://github.com/MrityunjayBhardwaj/stave-code/issues/132) · arpoon | issue #132 minimal repro (β-2 verify form) | structured `Fast`/`LastOf` over `Play`, not Code |

### Phase 20-16 fixtures (#142–#144 + #148/#150/#151/#152 segmenter)

Phase 20-16 (REFRAMED): Wave 0 (#148/#150/#151/#152 — the
`splitTopLevelStatements` ASI/comment-aware segmenter, shipped on this
branch at commit `ff93c65`) + Wave B (#142 fixture-only / #143 classifier)
+ Wave C (#144 paren-string root arm). D-01 (#140/#141 binding resolution)
was REMOVED from 20-16 and deferred to Phase 20-17, so there is **no**
`bakery-140-binding-transitive` fixture in this phase.

**Provenance note (20-15 V-2 lesson):** the named Bakery hashes
(`-P398OK_eprf` #142, `-7LU6zgzViSM` #143, `--cHhfOZ6ON1` #144) are NOT
in the local V-1 file — the `gh issue view N` **issue body** is the
verbatim ground-truth fixture source (a paraphrase silently substitutes
a working form; PV49 alias corollary). The #148/#150/#151/#152 fixtures
are minimal distillations of the Task-1 `--LsnlgQ6osk` segmenter slice
recorded in `20-16-OBSERVATIONS.md` (the 4-gap segmenter map).

| Fixture | Gap | Issue | Repro source | Asserts |
|---|---|---|---|---|
| `bakery-148-leading-dot-chain.strudel` | #148 — leading-dot multi-line method-chain continuation split by the segmenter | [#148](https://github.com/MrityunjayBhardwaj/stave-code/issues/148) · Bakery `--LsnlgQ6osk` (not local) | Task-1 `--LsnlgQ6osk` segmenter slice (20-16-OBSERVATIONS) | structured `Code`-with-`via` chain off `sound(...)`, not bare Code |
| `bakery-150-eq-continuation.strudel` | #150 — `const x =\n  rhs` (`=`-terminated line is not a JS stmt boundary) | [#150](https://github.com/MrityunjayBhardwaj/stave-code/issues/150) · Bakery `--LsnlgQ6osk` (not local) | Task-1 segmenter slice (20-16-OBSERVATIONS) | `Stack` over the bound voices, not whole-program Code |
| `bakery-151-comment-only.strudel` | #151 — a `// comment` on its own physical line became a phantom statement | [#151](https://github.com/MrityunjayBhardwaj/stave-code/issues/151) · Bakery `-L13nBhrqGR_` (not local) | Task-1 segmenter slice (20-16-OBSERVATIONS) | `Stack` over the bound voices, not whole-program Code |
| `bakery-152-block-comment.strudel` | #152 — `/* … */` block comment not skipped → depth-0 `\n` inside it flushed | [#152](https://github.com/MrityunjayBhardwaj/stave-code/issues/152) · Bakery `-LHtBlF8peGC` (not local) | Task-1 segmenter slice (20-16-OBSERVATIONS) | `Stack` over the bound voices, not whole-program Code |
| `bakery-142-samples-objlit.strudel` | #142 — `samples({…})` object-literal / `github:`/`https:` boot arg | [#142](https://github.com/MrityunjayBhardwaj/stave-code/issues/142) · Bakery `-P398OK_eprf` (not local) | **verbatim `gh issue view 142` body** | `s("o0 o1")` Seq structured (the existing depth walker already strips it — B-1 OQ2 = fixture-only, NO code change) |
| `bakery-143-guarded-boot.strudel` | #143 — `typeof X !== 'undefined' && X(...)` guarded boot expr | [#143](https://github.com/MrityunjayBhardwaj/stave-code/issues/143) · Bakery `-7LU6zgzViSM` (not local) | **verbatim `gh issue view 143` body** | guard line stripped, `stack( s("bd") )` → structured Play (B-2 `GUARDED_BOOT_RE`) |
| `bakery-144-paren-root.strudel` | #144 — `("…")` parenthesized-string root + leading-dot chain | [#144](https://github.com/MrityunjayBhardwaj/stave-code/issues/144) · Bakery `--cHhfOZ6ON1` (not local) | **verbatim `gh issue view 144` body** | structured `Code`-with-`via` chain off the parsed mini root (C-1 `parenStrMatch` arm) |

**parity-refresh exclusion:** `parity-refresh.mjs` TARGETS is upstream-only
by construction and has a structural guard (`parity-refresh.mjs:70-75`)
that **throws** if any `bakery-*` slug leaks into TARGETS. The 7 new
fixtures are excluded automatically by NOT being added to TARGETS — no
edit to the script is needed (the guard IS the enforcement; adding the
fixtures would trip it). The upstream-drift tool therefore never reports
these vendored repros as "missing upstream".

### Per-setter G2 fixtures (V-3 — α-1 → V-3 contract)

The α-1 commit body (`a2b607c`) is the authoritative input contract: the
tempo-setter tokens added to `PRELUDE_CALL_RE` beyond the pre-existing
`setcps` are **`setcpm`, `setCpm`, `setCps`** (full recognised family
`{setcps, setCps, setcpm, setCpm}`). V-3 reads that list verbatim from the
commit body and does **NOT** re-derive it via a fresh upstream audit. One
fixture per added setter proves the setter line is skipped AND the
following pattern parses structurally (R2 anti-drift):

| Fixture | Setter | Covered by |
|---|---|---|
| `bakery-G2-setcpm.strudel` | `setcpm` | the G2 repro fixture above (#135) |
| `bakery-G2-setCpm-camel.strudel` | `setCpm` | V-3 (case-insensitive FS → `-camel` slug, not a case-only filename) |
| `bakery-G2-setCps-camel.strudel` | `setCps` | V-3 |

(`setcps` was already present pre-α-1 — covered by the 20-14 corpus — so
it gets no new fixture; the contract is "one per ADDED setter".)

## License

Each repro is a 1–3 line minimal distillation authored for regression
testing (not a verbatim copy of any community tune). The corpus-frame
AGPL-3.0-or-later applies (see `CORPUS-SOURCE.md` §License). Bakery
permalinks in the issue bodies attribute the original community patterns
that surfaced each class.

## Drift policy

Same as the 16 tunes (`parity.test.ts` header): a snapshot diff on these
fixtures from a non-corpus PR is **news** — it means a gap class
regressed (or the fix changed shape). Never `vitest -u` casually to
"make it green". The whole point of these 6 files is that the snapshot
goes red the moment one of the 6 classes regresses.
