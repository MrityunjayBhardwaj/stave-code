# #1058 — the locality spike

**Pre-registered before the run.** This file's decision rule was committed before any
measurement existed, so the result cannot be read to taste. Findings are appended below the
rule, never folded into it.

Spike for #1058 (Phase 5 of #1052, under #925). It runs **before** Phase 1 (#1054) because it
can invalidate the rest of the sprint: if placing a hit frequently needs more than the element
under the cursor, the headline benefit collapses from *"refining is free AND edits stay local"*
to just *"refining does not write"* — still real, much smaller, and #1054–#1057 get re-scoped.

---

## What is being measured

A user wants a hit at a position the grid's current resolution cannot express. Today the only
route is a resolution change, which rewrites the whole document (`bd ~ sn ~` → 16 slots →
`bd ~ ~ ~ ~ ~ ~ ~ sn ~ ~ ~ ~ ~ ~ ~`, the canonical defect, reproduced through the real ops in
cont.158). #1058 proposes instead to subdivide **the element under the cursor and nothing
else**:

```
bd ~ sn ~   + a hi-hat on the second eighth of element 1
  ->  bd [~ hh] sn ~          one element changed
  NOT bd ~ hh ~ sn ~ ~ ~      every element re-spelled
```

**The gesture, as measured:** refine the view ×2 (each column splits, the new odd columns are
empty), then place a hit at one of the newly-created odd columns. The target column did not
exist before the refine, which is precisely the case #1058 names.

**Everything is asked of shipped code.** The reader is `parseStepGrid`, the placement op is
`place.ts`'s `toggleCell` (the one definition, #1048), the writer is `serializeStepGrid`, and
the engine is `@strudel/mini`'s `mini().queryArc` through the committed `enginePlayed` oracle.
The only new code is a pure rescale of the model and its source regions — no re-implemented
reader, no re-implemented writer, no hand-built expected-output table ([[PV192]]).

**Population.** Every unit of the 1535-mini parity corpus that `parseStepGrid` opens onto the
region-splice write path (`model.source` present). Units on the `altSource` / `leafSource`
paths have their own write-backs and are reported as their own bucket, not folded into either
side of the verdict.

---

## The three properties, gated SEPARATELY

Property 3 is the one the sprint's case rests on, so it gets its own assertion rather than
being folded into "the edit worked".

### P0 — the precondition (the issue's own load-bearing claim)

The issue asserts that `bd [~ hh] sn ~` is *not new notation*: that the current reader already
opens it at 8 columns and it round-trips byte-identical today. Everything rests on it, so it is
checked first and asked of the real writer rather than predicted from the model ([[PV241]]).

- `parseStepGrid('bd [~ hh] sn ~')` opens, and `model.steps === 8`
- `serializeStepGrid(model) === 'bd [~ hh] sn ~'`, byte for byte

**If P0 fails the spike stops and reports** — the premise is refuted, as #1051's was.

### P1 — it serializes

`serializeStepGrid(toggleCell(refine(model, 2), lane, col, true))` returns a string, not `null`.

A `null` is a **decline**, which is an honest answer at this boundary and not a corruption — the
writer refuses rather than mis-spells ([[PV241]]). Declines are counted and bucketed, never
treated as failures of correctness.

### P2 — it plays

`enginePlayed(edited)` against `enginePlayed(original)`, as (onset, duration, atom) rows.

Required: the edited document plays **the original plus exactly one new row**, at onset
`col / refinedSteps`, with the target lane's sound.

**One pre-existing row is allowed to change, and only in one way**: a note in the *target lane*
that was sounding through the new onset may have its duration shortened to end exactly at that
onset. That is `toggleCell`'s clamp doing what it promises — a promise about lengths is a
promise about room — and it is stated here *before* the run so that a correct clamp cannot be
read as corruption.

Anything else — a moved onset, a changed atom, a changed length anywhere else, a lost row — is
**CORRUPT**.

### P3 — it is LOCAL

Let `[a, b)` be the source span of the top-level element containing the target column, taken
from the region the reader built for it. Then:

- `edited.slice(0, a) === original.slice(0, a)` — every byte before the element, untouched
- the tail of `edited` of length `original.length - b` equals `original.slice(b)` — every byte
  after the element, untouched

i.e. the whole diff is confined to `[a, b)`. For a non-local result, the count of *other*
regions whose bytes changed is reported, because "one extra region" and "the whole line" are
different findings.

### Also measured — nesting depth (the issue says explicitly: do not leave it unmeasured)

Repeat the gesture on the *same* element: refine ×2, place; refine the result ×2, place; …
Report the bracket nesting depth of the emitted element after N = 1…6 gestures, and whether
each step stays local. `bd [~ [hh ~]] sn ~` is depth 2.

This is a **decision owed by #1058** (cap the depth, or accept it and say so), not a GO/NO-GO
input — but it must come out as a number.

---

## THE DECISION RULE — pre-committed

Over the corpus sweep, with `A` = fraction of all asks the writer **accepted** (P1), and
`L` = fraction of accepted-and-playing asks that are **local** (P3):

| Verdict | Condition | Consequence |
|---|---|---|
| **GO** | `A ≥ 0.80` **and** `L ≥ 0.95` **and** corrupt = 0 | The sprint proceeds as scoped. #1054–#1057 keep their shape; #1058 ships the subdivision write. |
| **RE-SCOPE** | corrupt = 0, and (`0.50 ≤ A < 0.80` or `0.80 ≤ L < 0.95`) | #1058 ships with a **stated bound** — the shapes it serves are named, the rest keep the resolution route. #1054–#1057 keep their shape; the sprint's headline claim is narrowed in writing. |
| **INVALIDATE** | `A < 0.50` **or** `L < 0.80` | The benefit collapses to *"refining does not write"*. #1058 is closed or deferred and #1054–#1057 are re-scoped against the smaller claim. |
| **HALT** | any CORRUPT ask | Stops the spike regardless of every other number. Corruption is not traded against reach; the mechanism is diagnosed before any verdict is quoted. |

`P0` must pass for any of the above to be reached.

**Note on what the numbers may NOT be quoted as.** `A` and `L` are properties of *this gesture*
(refine ×2, place on a new odd column) over *this population* (corpus units on the region-splice
path). They are not editability percentages, not writer-reach, and not comparable to the 141/85
floors — those measure different questions over different populations ([[P343]], [[P345]]).
Every figure below states its population and its denominator.

---

## FINDINGS

*(appended after the run — nothing above this line was written with a result in hand)*
