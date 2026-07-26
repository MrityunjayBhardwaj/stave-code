# SWEEP-1034 — one sound, one column, two lengths

Measurement for #1034, taken before P4b consumes `Onset.durs`. **No product code
changed by the sweep.** The arms are `_sweep-1034{,b,c,e,f}.spec.ts` — `_`-prefixed
specs sit outside the gate's include glob (`*.test.ts`), the established convention
for a one-shot sweep. Gate at the time of measuring: **23 files / 346 tests**,
unmoved. The conservation property this exposed is now a real gate
(`reader-conservation.test.ts`, #1036), taking the corpus suite to 24 / 349.

## The defect

`readGridOnsets` dedupes per column on ATOM IDENTITY, and `durs` was added inside
that guard:

```ts
if (!cell.atoms.includes(token)) { atoms.push(token); spans.push(leafLoc(h)); durs.push(end - begin) }
```

A column shows a sound once — true of atoms, not of durations.

## Populations (each figure carries its own — never summed)

**Every row below carries its cycle window, because the window changes the answer** —
see the window-sensitivity section. Figures are at the CONVERGED window of 16.

| population | denominator | units exhibiting the collapse |
| --- | --- | --- |
| **doc arm** — 150 tunes, offsets 0/250/500 | **889 musical units** (708 carry a mini, 537 grid-readable) | **2** — in 2 tunes; unchanged from a 4-cycle window, so this figure is window-robust |
| **mini arm** — `mini-corpus.json` | 1500 distinct minis / 6107 uses / 360 tunes | **5** duration-disagreeing / **11** with any same-token collision |

⚠ **CORRECTION.** This report first published the mini-arm figures as 4 units / 8
instances, measured over cycles 0-3 and stated without that restriction. At the
converged window they are **5** and **11**. The doc arm's 2 is unchanged. The
error is the same class the rest of this document is about — a figure carrying an
unstated scope — committed while documenting it.

The doc arm reproduces the tracker's **889** exactly, from the imported unit model
(`unitsWithStatus`), which is what certifies it is the right population rather than
a lookalike. The two arms are NOT the same corpus: mini-corpus is harvested from
360 tunes by the regex `\b(?:s|sound|note|n)\(\s*"([^"\\]*)"`, so it is both wider
(more tunes) and narrower (that one call shape, double quotes only) than the 889.

The mini-arm units (4 of the 5 are visible within 4 cycles):

```
"<eb@12, gb@10, bb@8> <a@6, c@4, e@2>, eb g [c a]!2 <bb>!2"   eb: [0.1667, 6.0]
"[C G], <D Fb B C A>*[0.5,2]"                                  D:  [0.5, 2.0]   ← also in the 889
"[C3 G3], <D Fb B C A>*[0.5,2]"                                D:  [0.5, 2.0]   ← also in the 889
"hh,hh oh sd"                                                  hh: [0.3333, 1.0]
```

## Mechanism — confirmed, and it is the predicted one

Every instance is a **`,`-stack sibling**: two parts sharing a token, coinciding at
a column, at different subdivisions. **0 rounding collisions** (the secondary
mechanism I predicted and looked for: distinct `whole.begin` values landing on one
`Math.round(pos * 720720)` key). All hits have a single begin.

`hh,hh oh sd` is the one that is real music rather than a bug demo — a sustained
`hh` layered against `hh oh sd`.

The fifth, reachable only past cycle 11:

```
"bd*2,[- sd]*2,[- hh]*4, <-!7 oh>, <-!12 bd*4 bd*8 bd*16!2>"   first collides at CYCLE 12
```

## Window sensitivity — the restriction that was hiding in every arm

Every sweep started at a 4-cycle window, and nothing derived that 4 from anything.
Measured across widths:

| window | accepted pairs | notes kept | collision units | dropped occurrences | duration-disagreeing units |
| --- | --- | --- | --- | --- | --- |
| 4 | 4662 | 19375 | 10 | 44 | 4 |
| 8 | 9328 | 38770 | 10 | 87 | 4 |
| **16** | 18662 | 77659 | **11** | **182** | **5** |
| 32 | 37326 | 155512 | 11 | 364 | 5 |

Converges at 16. The unit that needs it is the `<-!12 …>` alternation above, whose
colliding arm is not reached until cycle 12 — a 4-cycle instrument cannot see it
and does not say so. 16 is now the window the conservation gate runs at, for that
reason rather than by preference.

## Cost — the number that decides the choice

**Zero writer-reach is at stake.** Measured per unit, both surfaces:

| unit | step | roll |
| --- | --- | --- |
| `<eb@12, …>` | not projected (`unstable-period`) | not projected (`unstable-period`) |
| `[C G], …` | not projected (`no-leaf-anchor`) | not projected (`unstable-period`) |
| `[C3 G3], …` | not projected (`no-leaf-anchor`) | not projected (`unstable-period`) |
| `hh,hh oh sd` | **core.ok = true** — the syntactic model handles it, so writer-reach excludes it by construction (`if (core.ok) continue`) | not projected (`wrong-surface`) |
| `bd*2,[- sd]*2,…<-!12 …>` (the cycle-12 unit) | not projected (`unstable-period`) | not projected (`wrong-surface`) |

So the collapse currently reaches no cell and no writer. Option (a) — refuse on
disagreement — costs **0 units** on both populations. The declared stop condition
("writer-reach moves") is not triggered by any of the three options.

## A SECOND axis collapses under the same guard — pre-existing, and it is the anchor

Observed directly:

```
"bd*2, bd"   pos=0.0000 atoms=["bd"] spans=[{0,2}]          durs=[0.5]     ← part B's leaf {6,8} GONE
"bd*2, sd"   pos=0.0000 atoms=["bd","sd"] spans=[{0,2},{6,8}] durs=[0.5,1] ← distinct tokens: both kept
```

`spans.push` was already inside the guard on the base (`ad06e281:1226-1229`) — this
predates P4a; P4a added `durs` beside it, which is [[P358]] precisely.

Two consequences:

1. The comment at `parse.ts:1245-1248` — "a `,`-stack lands two leaves on one column
   (two spans) — **both are recorded faithfully**" — is FALSE when the two stacked
   leaves carry the same token. A claim in prose that nothing gates ([[P356]]).
2. The span is the **write-back anchor**. A same-token stack collapsed to one anchor
   means an edit on that column writes to one of the two source leaves and silently
   ignores the other. That is the [[PV239]] shape one layer up — an axis dropped at
   the reader, waiting for a writer. It does not bite today only because none of
   these units project.

This widens the fix rather than changing it: the column should hold, per token, a
list of OCCURRENCES `{span, dur}`, with `atoms` staying deduped for display. That is
option (a) generalised to the axis that turns out to have had the same bug all along.

## What the fix actually recovered — measured after, and it is ~4× the filed defect

The guard was dropping occurrences on **two** axes, and duration was the smaller
one. Classified per dropped occurrence (`_sweep-1034f.spec.ts`), at the converged
16-cycle window:

| what the dropped occurrence carried | occurrences | distinct units |
| --- | --- | --- |
| a DIFFERENT length from the one kept — the filed defect | 35 | **5** |
| a DIFFERENT anchor (leaf span) from the one kept | **134** | **10** |
| identical on both axes — a true duplicate | 48 | — |
| **total dropped** | **182** | **11** |

(Over 4 cycles the same split reads 8 / 32 / 12 = 44 across 10 units. The ratio —
anchor roughly four times duration — is stable across every window measured, which
is what makes the structural conclusion robust even though the counts are not.)

The duration figure reproduces arm (a)'s independent count exactly at the same
window (5 at 16 cycles, 4 at 4), which is the cross-check that the two instruments
agree.

The anchor axis is the one that would have survived a duration-shaped fix, and it
is about four times as large — twice as many units, four times as many notes. `[b4,d4,f#4],b4@4` is the case that makes the point —
both haps last exactly 1.0, so **no length is lost and a duration-only fix would
never see it**, while the anchors differ (`{1,3}` vs `{12,14}`) and the column
resolves to one of the two source leaves. The span is the write-back target, so
that is an edit landing on one leaf and silently ignoring the other.

## Inertness, proven by A/B rather than by construction

`_sweep-1034e.spec.ts` imports the ACTUAL pre-change reader (`git show
<base>:parse.ts`) beside the changed one and compares them across the corpus:

```
compared (ok) unit×cycle pairs:      4662
occurrences RETAINED:               19375
atoms after display dedupe:         19331
occurrences the old reader DROPPED:    44
differences in derived output:          0   ← atoms/spans/durs byte-identical
```

Gates after: writer-reach **126 step / 75 roll**, projected **186/118**, losses
**29 (leaf 0 / element 29)** — read off the report rather than inferred from the
floors passing, since those are `>=` assertions and a rise would pass silently.
parity-corpus **346/346**, editor **3050** (3045 + 5 new cases), app non-corpus
**606/606**, tsc **62 editor / 1 app**.

## Controls (a zero from a detector that cannot fire is not evidence)

- **POSITIVE** `bd*2, bd` → detected, `durs=[0.5, 1.0]`. The detector fires.
- **NEGATIVE** `[bd@2, bd]` → not detected, correctly. A `,`-stack normalizes each
  part to the full cycle, so both read 1.0. This is the probe that was WRONG last
  session; it is kept as a negative so the mistake cannot recur.
- **INSTRUMENT** — the sweep does not re-implement the reader. It reads the engine's
  haps and asserts its own per-column distinct-token sets equal the shipped
  `readGridOnsets`' `atoms` for every unit swept: **0 disagreements over 4662
  unit×cycle pairs**. Population gating is delegated to the shipped reader's own
  `ok`, so `NUMERIC`/`wrong-surface` is never second-guessed.

## Prediction vs. outcome

Predicted 0–3 units with the stack-sibling mechanism and no rounding collisions;
observed 4 (mini arm) / 2 (doc arm), all stack siblings, no rounding collisions.
Mechanism right, count one above the top of the range. Full prediction, written
before the sweep: `scratchpad/PREDICTION-1034.md`.

## Also to tidy (named in #1034)

The synthetic probe onsets in `leafEditSafe`/`leafExpected` carry placeholder
`durs: 0` (`parse.ts:1533,1537`) and `durs: []` (`:1789`). `0` is a magic value
meaning "unknown" that a later consumer reads as a zero-length note.
