# The writer census — what the syntactic core serves alone, and why

Generated and asserted by `writer-census.test.ts` (#1009, epic #1007 phase P3).
Raw per-ask rows: `WRITER-CENSUS.json`.

This document is **P6's input**. P6 proposes deleting the syntactic core
(`notation/parse.ts`'s krill AST → cells model, M2 in the epic's inventory). The set
enumerated below is exactly what that deletion would cost.

---

## The measurement

For every **surface-ask** the syntactic core serves — one (mini, surface) pair — both
writers are put through the *same* edit probe (`engineEditOracle.ts`, the one
`writer-reach.test.ts` uses):

| | |
|---|---|
| **incumbent** | the core's own model, **verified not assumed** |
| **counterfactual** | `project{StepGrid,PianoRoll}Derived` — the real writer chain below the core, asked in the real order |

A surface-ask is *not* a mini: a mini can be core-served on both surfaces. Both counts
are given; quote the **mini** count when the question is "how much text loses its view".

### Denominator, re-derived rather than inherited

The epic quotes **234 of 1208** core-served asks as served by neither derived
projection. That figure was over a corpus snapshot of 1492 nonempty minis. Today the
corpus holds 1500 and the core serves **1217** (803 grid / 414 roll), pinned in the test
to `writer-reach`'s complement so the two gates cannot drift apart silently.

---

## The result

| outcome | asks | of 1217 |
|---|---|---|
| **transfers** — a derived writer opens it AND the edit survives the engine | **965** | 79.3% |
| **untransferable** — no derived view, or the view corrupts | **151** | 12.4% |
| **unverified** — opened, but no clean single-note delete probe exists | **101** | 8.3% |

- Transfers by writer: **934 element / 31 leaf**.
- **Zero asks corrupt** on either surface. Both derived writers refuse rather than
  mis-write over this entire population, which is what makes the untransferable set
  readable as an *admission* result and not a fidelity one.
- **14 transfers change the view's shape** (10 grid / 4 roll) — reach moves, no verdict
  moves, and the user sees a different grid. Enumerated in the test output.
- The 151 untransferable asks sit behind **146 distinct minis**.

### The 151 split into a hole and a bound — and the hole is most of it

| | asks | |
|---|---|---|
| a `word:index` naming hole (**#1019**) | **101** | not structural — one function |
| candidate structural bound | **50** | |

**#1019.** krill lowers `bd:3` to the array value `["bd", 3]`. `readGridOnsets` names a
`string`, a `number` and an `{s, n}` object, and falls through to `no-note-content` for
the array — so every `:`-variant is invisible to both derived projections. The core
parses `:` itself and answers first, so nothing looks broken today.

Proven by rewriting `word:index` → `word_index` and re-asking the real writers:
**92 flip straight to open**, 1 has a second real blocker, 8 are out of scope (a
*patterned* index, `gm_bird_tweet:<0 1 2 3>`). Control arm — the same rewrite on the
asks it does not textually touch — opens **0**, so the experiment is about the value
shape and not the rewrite.

> **Live cost is 20 asks, not 205.** An earlier reading of this counted every ask whose
> mini *contains* an array value and no writer opens (234) and attributed them all to
> the hole. The rewrite experiment says **20** of the asks no writer opens today are
> actually recovered by naming the variant. Co-occurrence is not cause; the 205 figure
> should not be quoted.

---

## The rate is stable across two differently-drawn populations

`writer-census-eval.test.ts` re-derives the ask population from **evaluation** instead
of the parse-side harvest — over the 150 real tunes, taking the mini the eval-first
resolver (#1006) hands each unit.

| population | transfer rate |
|---|---|
| mini-corpus (parse-side harvest), 1500 minis | **965 / 1217 = 79.3%** |
| eval-first, all 671 resolved minis | **413 / 500 = 82.6%** |
| eval-first, only the 275 minis the parse snapshot lacks | **73 / 93 = 78.5%** |

The prediction was that the eval arm would score *lower*, being the wider and harder
population. **It scored higher, and the reason is that it is not wider — it is smaller**:
671 minis against 1500, because the resolver answers once per unit while the harvest
collected every mini it could find. So this arm is a **robustness check**, not a harder
test. The three figures agree inside ~3pp and the genuinely-new slice is the lowest of
them, at an effect size (0.8pp, n=93) too small to claim.

Read that as: **the transfer rate is a property of the corpus, not of how the asks were
drawn.** Weaker than the prediction wanted, and more useful than either arm alone.

Eval coverage for this arm is **142/150** — #1008's floor, reported beside the figure
because every number computed from an eval sweep is over the documents that evaluated.

---

## The 50 candidate-structural asks, by verified mechanism

Classified against the **engine**, not the refusal label — the label has overstated the
opportunity every time it has been counted.

### 1. Period past the surface cap — 33 asks (66% of the structural residual)

**Mechanism, measured:** 31 of the 33 have a true cycle period past their surface's
`LEAF_PROJECT_BARS` cap (grid 12, roll 4); 2 are genuinely aperiodic within 24 cycles.
**Zero have a period within the cap** — that assertion is the mechanism's must-not, and
it fires if the gate is ever misattributing.

**The finding that gates P6 (#1020): 20 of the roll's 27 have a period in (4, 12] — the
roll's own cap of 4 is what stops them, and the grid's *existing* cap of 12 clears them.**
The cap sweep that set the roll to 4 measured **zero** gain at every cap — but it ran
through `writer-reach`, which by definition sweeps only the asks the core *refuses*. On
the asks the core *serves*, the same cap is the single largest blocker. A gate defined as
another gate's complement carries a population restriction its numbers don't mention.

These are ordinary music, not edge cases:

```
roll  <0 1 2 3 4>                          roll  <0 3 5 7 3 5 0 2>
roll  0 <2 3> <5 7 5>                      roll  <12!8 7!8>
roll  <A1@4 D2@4 C#2@1>                    roll  <62 71 72 74 80 74 71 60 53 52 30> [36]
roll  <c4 ~ ~ e4 ~ g4 ~ ~ b4 ~ g4 ~ e4 ~>  step  <sawtooth!16 pulse!8>
step  <a2 ~ ~ f2 ~ ~ g2 ~ ~ e2 ~ ~ …>      step  <~ ~ ~ ~ ~ ~ ~ ~ c5 ~ e5 g5 ~ ~ e5 g5>
```

Full list in the test output; 27 roll / 6 grid.

### 2. The shared leaf — 9 asks (`view-unusable`)

**Mechanism:** a `,`-stack whose elements are `*n` / euclid, so several played onsets
come from **one** source atom. The core models this syntactically (it knows `bd*4` means
four cells); a behaviour projection sees four onsets with one span to write them back to,
so the cell↔leaf-span bijection fails — the leaf writer refuses the shared leaf and the
element writer has no region tiling for a stack. **No cap reaches these.**

```
step  bd*4, sd(2,4,1), hh*8      step  bd(3, 8), hh(4, 8, 1)
step  bd*4, [- cp]*2, [- hh]*4   step  [bd ~]*2, [~ hh]*2, ~ sd
step  bd*2,~ [cp,sd]             step  bd*4, cp(7, 16,14)
step  <~ ~ [~ cp]*2 [~ cp]*2 cp*4 [~ cp]*2>
roll  <0*2>                      roll  <[-3@1 -2@1 -1@1 0@1]*2>
```

### 3. Duplicate / unsafe lanes — 4 asks (`edit-unsafe`)

```
step  hh,hh oh sd                     step  gm_choir_aahs,gm_choir_aahs
step  <[ht bd~][ht bd~][ht bd~]>      roll  <[0 4 7] [~ ~ ~] [0 4 7] [~ ~ ~]>
```

Two are a `,`-stack with a **repeated lane name**, which the grid cannot address
unambiguously. `bd~` in the third is a single token, not `bd ~`.

### 4. Onsets that do not land on a grid — 2 asks (`irrational-onset`)

```
step  a b c2 d1 e3 f4 g5 f4 a a b b b c c d d e e e e f f f f g g g g a a a   (31 elements)
step  [ a4 ~ ~ a4] [ a4 ~ a4 ~]  [ a4 ~ ~ a4 ]  [ a4 ~ a4 a4 ]*2
```

A 31-element sequence puts onsets at `k/31`; no cell grid represents that.

### 5. Degenerate — 2 asks (`no-note-content`)

```
step  ~        roll  ~
```

A pattern of pure silence. The core opens a view of nothing. `coreStructured = false`,
so **this is not a view worth preserving** and should not be counted as a blocker.

---

## What actually blocks deleting the core

Filtering the 50 to asks whose **core view has structure** (more than one cell/note — a
one-cell view of an instrument name is a correct model and a useless surface) and whose
**core edit is itself verified**:

| | asks |
|---|---|
| candidate structural | 50 |
| …with a structured core view | 46 |
| …with a verified core edit | 41 |
| **…both (the set that actually blocks deletion)** | **40** |

The two filters are not nested, so the conjunction (40) is the number to quote, never
either single column. The residue: **4 asks have no structured core view at all** —
`~` on both surfaces, `<0 -@7>`, and `gm_choir_aahs,gm_choir_aahs` — a view of silence or
of one repeated lane, which is not a view worth preserving. **6 more have a structured
core view whose edit the probe cannot verify** (fully chorded, so *neither* writer is
testable) — unverified, not untransferable.

### So the honest answer to P3

**The syntactic core's irreplaceable reach is 40 surface-asks, not 234** — and it is
not one bound but a stack of four, three of which have a named owner:

1. **33 period-cap** → #1020. 20 clear at a cap the grid already ships.
2. **9 shared leaf** → the bijection. No fix known; this is the real bound.
3. **4 duplicate lanes / 2 irrational onsets** → genuine, small, structural.
4. **2 degenerate** → not worth keeping.

**Verdict for P6: not blocked, but not free either.** Deleting the core is viable *after*
#1019 and #1020 land, and even then leaves roughly **15 asks** (shared leaf + duplicate
lanes + irrational onsets) with no derived view at all. Whether that is acceptable is a
product call, not a measurement one — but it is a decision about 15 asks over ~15 minis,
not about 234.

The alternative outcome the phase was told to be willing to report — "two writers,
bounded" — is **not** what the measurement says. It says one writer plus a small named
residual, and the residual is enumerated above rather than estimated.
