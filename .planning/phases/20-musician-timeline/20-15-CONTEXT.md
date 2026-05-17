---
phase: 20-15
created: 2026-05-15
decisions: 4
depends_on: 20-14 (α/β/γ merged via recovery PR #139 — verified on main)
issues: ["#132", "#134", "#135", "#136", "#137", "#138"]
---

# Phase 20-15 Context — Strudel.cc parity hardening

Close the 6 real-world parser-gap classes surfaced by the 2026-05-15 Bakery
stress test (4/10 live patterns structurally parsed vs 15/16 curated). The
gaps: G1 top-level `let`/`const` bindings (#134), G2 `setcpm`/`set*` prelude
skip-set omission (#135), G3 backtick template-literal string args (#136),
G4 comment-only lines between `stack()` args (#137), G5 named-label
`name: pattern` syntax (#138), plus #132 recursive args in `note`/`n`/`s`.

## Locked Decisions

### D-01: G5 named-label → full timeline wiring
**Decision:** Named label `name: pattern` parses AND wires fully into the
timeline substrate — recognized as a `Track` with `trackId = label`, appears
as a named row, slot identity source-anchored via the PV47/#119 mechanism.
**Rationale:** The musician-timeline is the milestone thrust; the label IS
the track name (no `.p()` needed). #119 already built source-anchored slots,
so wiring is cheap once parsed. **Scope guard:** the known
trackMeta-by-`slotKey` re-keying limitation (already deferred from #119,
PV47) stays deferred — not reopened here.

### D-02: G1 binding model — minimal single-assignment only
**Decision:** Handle only `let/const x = <pattern>` defined once and
referenced after definition. Reassignment, use-before-def, and shadowing →
graceful `Code(BARE-FALLBACK)` (topology-preserving, not a crash).
**Rationale:** Holds the explicit "structural matcher stays a matcher, not a
JS interpreter" line. Covers the 2/10 highest-frequency Bakery cases without
opening the symbol-table/interpreter scope-creep surface.

### D-03: Verification — re-measure on a larger fresh Bakery pull
**Decision:** After the 6 fixes land, pull a larger fresh sample (~50) from
the live Supabase `code_v1` backend, measure a statistically meaningful
real-world parity %, and classify any NEW fallback classes into the backlog
(not necessarily fixed this phase). Vendor the 6 known repros as permanent
regression fixtures alongside the 16 canonical tunes.
**Rationale:** The 20-14 load-bearing lesson — curated over-states real-world
parity ~2:1 and 10 samples is noisy. Friction-first measurement must drive
the parity claim; a fixed-10 number would repeat the over-statement mistake.

### D-04: Acceptance bar ≥9/10; `${}` interpolation stays Code-fallback
**Decision:** Ship at ≥9/10 of the known set. Structural parity asymptotes
below 100% by design — `${}` template interpolation, function/arrow-fn
binds, destructuring binds, full JS remain opaque-but-topology-preserving
Code-fallbacks.
**Rationale:** `${}` interpolation is real JS evaluation — Code-fallback is
the *correct* behavior, not a gap. Chasing 10/10 turns the matcher into an
interpreter and overruns the phase.

## Scope Boundary

**In:** G1 (minimal binding map + inline expansion), G2 (skip-set + α-6
settingPatterns audit as authoritative source), G3 (backtick root-matcher +
bare-string arm; `${}` → graceful fallback), G4 (interior `//` strip in the
arg-splitter), G5 (generalized `extractTracks` `:`-label matcher + false-
positive guards + full trackId/slot wiring), #132 (recursive mini+chain in
`note`/`n`/`s` args). Shared `skipWhitespaceAndLineComments(src,pos)` walker
(PV49 — extracted as substrate, consumed by prelude + chain + arg-splitter +
G4). Larger-sample Bakery re-measurement + 6 vendored fixtures.

**Out:** `${}` interpolation evaluation; function/arrow-fn bindings;
destructuring binds; a full JS parser; reopening trackMeta-by-slotKey
re-keying; fixing newly-discovered D-03 fallback classes (→ backlog).

## Codebase Context

- `packages/editor/src/ir/parseStrudel.ts` (1532 lines) — the boundary.
  - `stripParserPrelude:124`, skip-set regex `:128` (G2 target).
  - `extractTracks:316`, `$:` regex `dollarRe:343` (G5 generalization target;
    already handles commented `// $:` per #119).
  - `parseExpression:392` → `parseRoot:446` → `splitArgsWithOffsets:498`
    (G3 root-matcher + #132 recursive-arg surface; G4 arg-splitter).
- PV49 (vyapti): the 4-call-site whitespace/comment walker → shared
  primitive is α-wave substrate. PK16 (krama): no-`$:` parse pipeline,
  prelude-strip is stage 1, offsets thread through.
- #119/#116 substrate: source-anchored slot identity (`IREvent.dollarPos`,
  `collectTopLevelTrackIds`, `MusicalTimeline.collectTopLevelSlots`) — G5
  wires into this; trackMeta still keyed on display trackId (PV47 deferred).
- Three waves: **α** G2 + shared walker + G4 · **β** G3 + #132 (same
  `parseRoot` surface) · **γ** G5 (label matcher + wiring) + G1 (binding
  map, hardest, last).
- 20-14 verified merged: parity gate 193/193 + editor suite 1551/1551 green
  on main (HEAD `5323975`).
