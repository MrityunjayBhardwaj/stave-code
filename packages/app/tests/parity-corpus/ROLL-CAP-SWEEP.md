# The piano roll's period cap, re-swept on both populations it governs

Generated and asserted by `roll-cap-sweep.test.ts`, driven by `scripts/roll-cap-sweep.mjs`
(#1020, epic #1007). Raw per-ask rows: `.roll-cap-runs/cap-<N>.json`.

---

## Why this was re-measured

`LEAF_PROJECT_BARS.roll` was set to **4** by a sweep at 4/6/8/12/16 that found **exactly
zero** gain at every value, while opening nine views that were only 13–58% live. That
measurement was real and the conclusion followed from it.

What the conclusion could not see is its own population. The sweep ran through
`writer-reach.test.ts`, whose population is one line — `if (core.ok) continue`. So it
asked *"does raising the roll's cap help the patterns the syntactic core **refuses**?"*
and answered no. The other half — the 414 roll asks the core **serves** — was never
swept, and nothing in the gate's output, floors or header said so.

**A gate defined as another gate's complement carries a population restriction that none
of its numbers mention.** This sweep measures both halves and reports them separately.

| | population | who reaches the leaf writer |
|---|---|---|
| **A** | core-**REFUSED** (1086 roll asks) | production, today, as the fallback |
| **B** | core-**SERVED** (414 roll asks) | nobody today — only after the core is deleted (#1012) |

That asymmetry turns out to be the finding. It is spelled out under *The decision* below.

---

## The sweep

Both populations, all four caps, the real shipped writers at each value. The cap is a
module constant and the sweep sets it exactly as a ship would; threading a parameter
through the writer would measure a path production never takes.

⚠ **RE-SWEPT 2026-07-27 on the rebuilt corpus (#1037).** The harvester stopped
approximating the transpiler with a regex, so the corpus went 1500 → 1535 units:
backtick minis in, commented-out code out. No runtime code changed in that diff, so
every movement below belongs to the population. The figures first published here were
A flat at 75 across all caps, B 347 → 360.

| cap | **A** reach | **B** transfers |
|---|---|---|
| **4** (today) | 85 | 339 |
| 6 | 85 | 340 |
| 8 | **86** | 352 |
| **12** | **86** | **355** |

- **Population A's reach moves by exactly ONE ask, at cap 8 and above.** On the old
  corpus it was flat at every cap, and that flatness was quoted as the finding. It is
  very nearly still true — one ask in 1535 is no reason to raise the cap — but the claim
  is now "moves by one", not "does not move", and the difference matters because the flat
  version was being used as though it were structural. It was not; it was a property of a
  corpus that had never seen a backtick.
- **Population B gains 16 transfers** (339 → 355), up from 13 on the old corpus, and every
  gain is served by the leaf writer, which is the writer this cap governs.
- **Zero asks moved to a worse outcome at any cap, on either population**, verified per
  ask against the cap-4 rows rather than by netting totals — still true after the
  re-sweep, on the wider population.
- **Zero corrupt** on either population at every cap — and that is now a stronger claim
  than it used to be (see *Every note, not one note*). **Still true after #1026 restored
  the oracle's duration axis**, and not by luck: this sweep is roll-only, and the roll arm
  was already duration-aware. The axis that was missing was the grid's, which this sweep
  never touches — that is why the grid's 11 reclassified asks do not appear here.

The ceiling is 12 and not a round number: `detectPeriod` confirms a period `p` only once
`2p` cycles were probed, and `PERIOD_PROBE` is 24. A cap of 16 would admit periods that
have never been verified, and a period-32 pattern would masquerade as period-16 — a view
that silently stops being true one cycle past its own width.

---

## Why the two populations disagree — it is what they are made of

The mechanism was predicted before the run, and it holds:

**Population B's long-period roll patterns are branch ALTERNATIONS.** `<0 1 2 3 4>`,
`<0 3 5 7 3 5 0 2>`, `<0 1 2 1 4 5 [4 3 4 5 6 7] 0>` — one element per bar, so every
played note owns its own source token, the leaf-span bijection holds, and every note
accepts an edit. 13 of the 14 gained views have more than one note, and the gained set is
**78.7% live** overall (129 of 164 notes respond to their own delete).

**Population A's are `!n` / `@n` REPETITIONS.** `<C#2!2 G#2 <A2 D2>>`,
`<[3@3 3@3 3@2]!2 …>` — several onsets from one atom. The cap admits them and then the
next gate down stops them, so they open as views where most notes are inert: the nine
views a raise opens there are **27.6% live** (27 of 98), squarely inside the 13–58% band
the original decision refused. **The original liveness objection is reproduced, not
refuted.**

The 17 that still have no view at cap 12 stop exactly where that mechanism says they
should:

| gate | cap 4 | cap 12 | why |
|---|---|---|---|
| `unstable-period` | 27 | **7** | 6 have a true period past 12, 1 is aperiodic |
| `note-crosses-bar` | 0 | **4** | `@n` inside `<>` — the element is held across bars |
| `view-unusable` | 2 | **4** | `!n` inside `<>` — every note shares one leaf, so no single delete is expressible |
| `edit-unsafe` | 1 | 1 | unchanged |
| `no-note-content` | 1 | 1 | `~` — a pattern of pure silence |

`note-crosses-bar` and `view-unusable` appearing, in those amounts, is the shared-leaf
mechanism arriving where it was predicted to arrive.

---

## What it does to P6's number

<!-- P6-TABLE:BEGIN — generated by writer-census.test.ts (#1046); do not edit by hand -->
<!-- P6-TABLE:END -->

> ⚠⚠ **THIS SECTION USED TO BE TYPED OUT BY HAND, AND BY 2026-08-16 THREE OF ITS FOUR ROWS
> WERE WRONG.** It read `46` for the blocker while the gated pin in `writer-census.test.ts`
> said `51`; `31` for the roll untransferable where the census said `38`; and
> `803 asks / 708 transfers / 37 untransferable / blocker 19` for the grid control arm
> where the census said `820 / 727 / 30 / 18`. The fourth row — untransferable across both
> surfaces — read `68` and was right **by accident**: it had passed through `78` at #1043
> and landed back on `68`.
>
> A partly-correct table is what makes the rest of one look corroborated, and correcting
> the digits by hand only resets the clock. So the block above is **generated from the
> census run** and the cap-12 column is a **committed observation with an expiry stamp**
> (`P6-CAP12.json`) rather than a number in prose (#1046).
>
> The grid control arm's *claim* survived the whole drift and only its digits rotted: the
> grid is still identical to the digit at both caps, which is what says the sweep changed
> nothing it was not aiming at.

The historical trail below is kept because the **shape** of each correction is the
argument, not its digits. ⚠ Every figure in it is pre-#1037 and must not be quoted — take
the numbers from the generated block above.

> ⚠ **Re-derived at #1026** (was 44 → 32). Both endpoints moved by two and the cap's own
> contribution was unchanged at 12, which is what the roll being duration-aware already
> predicts: the axis that was restored was the grid's, and this constant is roll-only. The
> cap-12 figure was OBSERVED by running the census with the constant set, not obtained by
> subtracting 12 from 46. **That contribution is no longer 12** — see the generated block.

> **Re-measured after #1022, and the shape of the correction is the useful part.** The
> edit probe used to read cycle 0 and nothing else, so a pattern that rests in bar 0 was
> filed unverified — including on the **incumbent** side, which is where the blocker set's
> "core edit verified" column comes from. Teaching it to advance to the first sounding bar
> moved both endpoints by four (40 → 44 at cap 4, 28 → 32 at cap 12) and moved **the cap's
> own contribution by zero**: it clears 12 asks either way. **#1026 then did the same thing
> again** — both endpoints up by two (44 → 46, 32 → 34), the cap's contribution still 12. The cost of deleting the core
> did not rise, our measurement of it did — and the two changes being independent is what
> makes both readable.

---

## Every note, not one note

`probeEdit` verifies **one** note per view. That is the right question for a reach floor
and the wrong one for *"is this view worth showing"* — the original decision turned on
views being 13–58% live, and a one-note probe cannot see that at all.

`liveness` (in `engineEditOracle.ts`, sharing `probeEdit`'s own delete-and-verify rule
rather than re-implementing it) probes **every** cleanly-singleton note of every bar. Over
both populations and all four caps it finds:

- **zero notes that mis-write.** Not "the probed note round-trips" — *every* note of
  *every* derived roll view either round-trips or is declined. Nothing lies about the
  document. That is a materially stronger statement than the reach gates could make.
- the two populations disagree, which is what shows the measure discriminates rather than
  agreeing with itself.

Three different denominators are in play and they are not interchangeable, so each figure
is given with the population it is over — adjacent percentages that share no denominator
are how a report lies by layout:

| figure at cap 4 | over | live |
|---|---|---|
| every opened view, both writers — population A | 1115 notes | **84.5%** |
| every opened view, both writers — population B | 1924 notes | **100%** |
| **leaf**-served views only — population A | 295 notes | **41.4%** |
| **leaf**-served views only — population B | 9 notes | **100%** |

The leaf rows are the ones this cap governs; the all-writer rows are the control. The
gained-set figures quoted above (78.7% for B's 14, 27.6% for A's 9) are a fifth and sixth
denominator again — they are over the views the raise *adds*, which is the only population
the decision is actually about.

> **The first version of this measurement was wrong, and it was wrong in the direction
> that looks like a discovery.** `enginePlayedCycle` returns onset positions in the
> ABSOLUTE frame — cycle 2's downbeat is `2`, not `0` — while its own doc comment claimed
> `[0,1)`. Nothing had caught it because the only caller that reads a position back is
> `probeEdit`, which reads cycle 0, where the two frames coincide. `liveness` is the first
> caller to read a later cycle; it trusted the comment, derived a column that
> double-counted the bar offset, and reported **44 views with mis-writing notes** — a
> plausible, alarming, entirely fabricated result. Hand-reading `<0 2 5 3>` (4 notes, 1
> alive, 1 "corrupt") is what killed it. The comment is now correct and the count is 0.

---

## The three views below 60% live

A fallback committed before the run said: any gained population-B view under 60% live
means the raise is shipping dead views at that cap, and must be reported against. Three
of the fourteen are at exactly **50%**:

```
<62 71 72 74 80 74 71 60 53 52 30> [36]                              11/22
<c3 c3 d3 d3 c4 c4 d4 d4> <e3 …> <f3 f3 A3 B3> <g3 g3 B3 d4> ~ ~ ~ ~  16/32
<f3 a3 e3 g3 c3 g3 e3 g3> c4                                          8/16
```

All three have the same shape and it is not the shape the fallback was written for: a
long-period alternation sequenced with a **constant companion** (`[36]`, `c4`). Every note
of the alternation is editable; the companion sounds once per bar from a single shared
token and none of its copies is. So it is not a mostly-dead view — it is a view where one
lane is a drone, and the drone is exactly the note a user has least reason to drag.

Stated rather than waved away, because it was pre-committed: **50% is above the 13–58%
band the original decision refused, but it is inside the fallback's own threshold, and no
cap buys the gain without it.** Cap 6 avoids all three and buys one ask.

---

## The decision

**The cap raise is correct, and it belongs to #1012 rather than before it.**

The two populations are not symmetric in when they pay. In production `parsePianoRoll` is
core → projection: for a core-**served** mini the core answers and the derived writers are
never consulted. So raising the cap today would:

- change **nothing** a user sees for population B — its +13 transfers are a counterfactual
  about a core that has not been deleted yet;
- change what users see for population A — **9 new roll views, 27.6% live, 0 extra reach**.

Shipped alone, the raise buys nothing today and ships nine mostly-inert views. That is
precisely the trade the original decision refused, and refusing it again is the consistent
answer, not a reversal.

Shipped **with** #1012, the populations merge — core-served minis fall through to the
derived writers too — and the same constant buys 14 views at 78.7% live against those 9 at
27.6%, while dropping the deletion's cost by the cap's own contribution.

So: `LEAF_PROJECT_BARS.roll` stays at **4** on this branch. The value it should take when
the core is deleted is **12**, and **the number P6 should be scoped against is the cap-12
column of the generated block above** — not a digit written out here. That sentence used
to name one, and the digit it named was two corpus rebuilds out of date while this
paragraph went on reading like a conclusion (#1046). `roll-cap-sweep.test.ts` ships pinned
at the current cap so the sweep is repeatable and so a future change to this constant has
to face both populations.
