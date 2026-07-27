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

Probe: `_1058-locality.spec.ts` (a `.spec.ts`, so vitest's `include` never collects it —
a probe, not a gate). Corpus `mini-corpus.json`, 1527 deduped minis, tree `fc73cd24`.

### Population — stated, because every figure below is restricted to it

| | units |
|---|---|
| **IN-POPULATION** (region-splice path, identity base) | **819** |
| no grid view | 569 |
| excluded: leaf path (own write-back) | 82 |
| excluded: alt path (own write-back) | 57 |
| total | 1527 |

### P0 — PASSES. The issue's load-bearing claim is true.

```
"bd [~ hh] sn ~"        opens=true  steps=8   path=source  roundTrip=true
"bd ~ sn ~"             opens=true  steps=4   path=source  roundTrip=true
"bd [~ [hh ~]] sn ~"    opens=true  steps=8   path=leaf    roundTrip=true
```

`bd [~ hh] sn ~` already opens at 8 columns on the element-splice path and round-trips
byte-identical, asked of the real writer. The depth-2 form also round-trips but arrives on
the **leaf** path, which is a different write-back.

### P3 — LOCALITY HOLDS, and more cleanly than the threshold required

**Zero non-local writes. 0 asks, 0 distinct units, out of 15,212 asks.**

`L` as pre-registered (local / accepted) is **95.7%** at full enumeration, and the entire
4.3% shortfall is asks where locality was never *measured*, not asks that failed it:

```
accepted 6216  =  LOCAL 5946  +  CORRUPT 86 (skipped before the locality check)
                              +  no-element-for-column 184 (factor>1: the clicked
                                 column does not exist in that part's own space)
```

Among asks where locality is measurable it is **5946/5946 = 100%**.

**Why it holds is worth recording: no new writer was needed.** `spliceGrid` already re-emits
a changed region as `reemitRegion(cols, div)` → `reemitStep`, which spells a multi-column
step as `[a b]`. Refining the model *and the source regions that index it* keeps the splice
path alive, and `bd [~ hh] sn ~` falls out of machinery that has been shipped since #913.
The only new code in this spike is a pure rescale ([[P362]]: a change of units across a set
of fields — index and length both).

### P2 — 86 corrupt asks, over 3 distinct units of 819, and **86/86 are pre-existing**

The pre-registered HALT clause fired. Diagnosis, which the clause required before any
verdict is quoted: a base arm asks the same units at the **shipped resolution with no
subdivision anywhere**, trying every empty column of the lane. **All 86 corrupt asks belong
to units that corrupt there too.** Subdivision-on-placement introduces zero corruption.

The mechanism is a chord carrying a **duplicate member** — `[d4,f4,d4]`. The reader dedupes
a region's content on `gridCellKey`, so the re-emit writes `[d4,f4]` and the third voice is
gone. Filed separately; it is not this spike's to fix and not this spike's to carry.

### P1 — `A = 40.9%`, and it does not measure subdivision

This is the number that trips the rule, so it gets the most attribution.

**98.6% of declines are ONE mechanism.**

| decline cause | asks |
|---|---|
| **a note in ANOTHER lane sustaining through the clicked column** | **8870** |
| column not in this part (factor>1) | 94 |
| covered by the clicked lane's own sustain (clamp missed) | 30 |
| multi-part | 2 |

`toggleCell` clamps the lane it edits, and only that lane — "a new onset takes the room an
earlier note was sounding through". The grid's notation constraint is per **column**: one
token per column, `_` for a sustain, and `[_,bd]` is a chord containing a token that means
nothing there. So a sustain in *any* lane blocks the column, the model reaching the writer
says two things at once, and the writer rightly declines ([[PV241]] — the decline is correct).

Two arms show this is not subdivision's bound:

- **BASE ARM** — the shipped resolution, no refine, same 819 units: 11,633 asks,
  **A_base = 85.0%**, and **1717 of its 1748 declines (98.2%) are the same mechanism.** The
  gap is pre-existing. Refining merely makes it universal: preserving musical length means
  every note doubles in columns, so every newly-created odd column sits under a sustain.
- **ALT ARM** (hypothesis, not shipped code — clamp spans the column instead of the lane):
  **accepted 15,056/15,212 = 99.0%**, local **14,778/15,056 = 98.2%**, and 13,763 (90.5% of
  *all* asks) also pass the strict P2 rule. The remaining **1293 shorten a note in another
  lane** — audible, forbidden by the P2 allowance as pre-registered, and a genuine product
  question rather than a free win.

**`A` is depth-sensitive; `L` is not** — reported at four depths, the last complete:

| asks/unit cap | asks | A | L | corrupt asks / units |
|---|---|---|---|---|
| 2 | 1,326 | 79.1% | 98.0% | 3 / 2 |
| 4 | 2,236 | 68.8% | 97.6% | 5 / 2 |
| 8 | 3,775 | 62.1% | 97.0% | 9 / 2 |
| **ALL** | **15,212** | **40.9%** | **95.7%** | 86 / 3 |

### Nesting depth — the issue's worry does not occur; a different one does

**Depth stays at 1 and never goes deeper.** Repeated subdivision of the same element WIDENS
the group rather than nesting inside it:

```
bd ~ sn ~
 -> bd [~ bd] sn ~                        depth 1,  8 cols
 -> bd [~ bd bd _] sn ~                   depth 1, 16 cols
 -> bd [~ bd bd _ bd _ _ _] sn ~          depth 1, 32 cols
 -> REFUSED BY THE READER
```

So `bd [~ [hh ~]] sn ~` is not what repeated editing produces. What it produces is a group
that **doubles in width** each time (2 → 4 → 8 tokens) — a real readability cost, and a
different one from the one the issue predicted.

**And it terminates.** After 3 gestures (4 on `bd sn`) the reader refuses the document its
own writer just emitted: `reason = "an onset does not land on any step column"`. Isolated
with a control set — the cause is the accumulated `_` sustains, not the width:

```
"bd [~ bd bd _ bd _ _ _] sn ~"   REFUSED
"bd [~ bd bd ~ bd ~ ~ ~] sn ~"   opens, 32 cols   <- same onsets, rests instead of sustains
"[~ bd bd _ bd _ _ _]"           opens,  8 cols   <- the same group, standing alone
"bd [~ bd bd _] sn ~"            opens, 16 cols   <- one sustain fewer
```

A writer emitting notation its own reader will not re-open is a round-trip hole. Filed
separately; the mechanism is **not** diagnosed here and this doc does not guess at it.

---

## VERDICT

**By the letter of the rule: INVALIDATE** — `A = 40.9% < 0.50` at full enumeration.

**By the evidence, the trigger is a different thing than the rule was aimed at**, and this is
stated rather than resolved, because substituting a kinder metric after seeing the result is
exactly what pre-registration exists to prevent:

- The rule's own stated purpose is *"if placing a hit frequently needs more than the element
  under the cursor"*. That is **P3**, and P3 passes at every depth with **zero** non-local
  writes.
- `A` turned out to measure the shipped placement op's per-lane clamp, not subdivision —
  proven two ways: 85.0% acceptance with no subdivision at all and the same mechanism at
  98.2% of its declines, and 99.0% acceptance when the clamp spans the column.

**Recommendation: GO, gated on the clamp.** #1058's locality property is confirmed and needs
no new writer. Its acceptance rate is gated by a pre-existing, separately-fixable gap in
`toggleCell`, which now lives in `place.ts` beside where #1058's write would land. That fix
should land before or with #1058, and it carries a product question of its own (may placing a
hit shorten a *different* sound's note?) that #1053 is the natural home for.

The call is the user's; both readings are on the table above with their numbers.

