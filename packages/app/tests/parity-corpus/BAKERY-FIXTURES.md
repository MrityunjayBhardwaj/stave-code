# Bakery Regression Fixtures — the 6 closed parser-gap classes

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
