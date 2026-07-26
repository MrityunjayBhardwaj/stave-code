# MEASUREMENT-AUDIT — what every figure at this boundary is restricted by

An end-to-end audit of the measurement apparatus, not of the code it measures.
Prompted by the observation that this boundary has now shipped **five** figures
carrying an unstated restriction: of population, of comparison axis, of TIME, of
prose-with-no-gate, and — found here, committed by me while documenting the other
four — of **cycle window**.

The question each gap asks is not "is this number wrong" but "what does this
number quietly exclude, and in which direction does that bias it".

Arms: `_audit-window.spec.ts`, `_audit-harvest.spec.ts`. The gate's include glob is
`tests/parity-corpus/**/*.test.{ts,tsx}`, so exclusion comes from the **`.spec.ts`
extension** — the `_` prefix is only a naming convention and excludes nothing. (Both
arms were first written as `.test.ts` and silently joined the suite, 349 -> 352,
which is this document's own subject arriving one level up: a claim about scope that
nothing checked.) The one property worth enforcing continuously was promoted to a
real gate instead — `reader-conservation.test.ts` (#1036).

---

## GAP 1 — CYCLE WINDOW — **found, fixed, and it had already corrupted my own figures**

Every sweep this session read cycles 0-3, and nothing derived that 4 from anything.

| window | accepted pairs | notes kept | collision units | dropped occurrences | duration-disagreeing units |
| --- | --- | --- | --- | --- | --- |
| 4 | 4662 | 19375 | 10 | 44 | 4 |
| 8 | 9328 | 38770 | 10 | 87 | 4 |
| **16** | 18662 | 77659 | **11** | **182** | **5** |
| 32 | 37326 | 155512 | 11 | 364 | 5 |

Converges at 16. The unit that requires it —
`bd*2,[- sd]*2,[- hh]*4, <-!7 oh>, <-!12 bd*4 bd*8 bd*16!2>` — does not reach its
colliding arm until **cycle 12**, so a 4-cycle instrument cannot see it and does
not say so.

**Consequence, stated plainly:** the #1034 figures first published as "4 units / 8
instances" are **5 / 11** at the converged window. The doc-population figure (2 of
889) is unchanged and therefore window-robust. The axis ratio — anchor ≈ 4×
duration — holds at every width measured, which is why the structural conclusion
survived even though the counts did not.

**Fixed:** the conservation gate runs at 16 and pins the window in its assertions.

---

## GAP 2 — CORPUS HARVEST — **found, filed as #1037, biased against the hard cases**

`mini-corpus.json`'s own pattern is `\b(?:s|sound|note|n)\(\s*"([^"\\]*)"`.
Double quotes only. Measured over the same 150 tunes:

| notation-head minis | n | mean len | max len | multiline | contains `<…>` | contains `,` |
| --- | --- | --- | --- | --- | --- | --- |
| double-quoted — harvested | 756 | 20 | 221 | 0% | 28% | 20% |
| backtick — **invisible** | 50 | **212** | **1064** | **86%** | **60%** | 30% |

59 notation-head strings missed for quote style alone. The missed set is not a
smaller sample of the same thing — it is **ten times longer, 86% multi-line, and
twice as likely to carry an alternation**. Backticks are how people write
multi-cycle patterns, so the exclusion is concentrated exactly where the readers
and writers are weakest, and exactly where GAP 1 just showed we were also
under-sampling in time.

Every reach percentage over this corpus is therefore optimistic by an unmeasured
amount. Also stepped over, and a separate decision that has never been written
down: minis passed to `mask` (124), `scale` (65), `struct` (47), `when` (38).

**This refuted the prediction written before measuring**, which guessed the missed
strings would be short control patterns like `"x*4"`. They are the opposite.

---

## GAP 3 — SWEEP ARMS ARE UNRUN — **partially fixed**

`_`-prefixed arms sit outside CI, so every one of them can rot against the code it
measures — the same disease as a figure in a comment, one level up. Not fixable by
running them all: some are slow, and `_sweep-1034e` needs a scratch copy of the
pre-change reader materialized by hand.

**Fixed for the property that mattered:** conservation is now a real gate that
runs every time (#1036), proven to fire, with a control arm. The remaining arms
each carry the date and tree they were last run against, so a reader can tell
whether their printed numbers are current.

---

## GAP 4 — #1031, THE UNGATED CENSUS ARM — **known, still open**

The eval-arm census prints every figure it computes and asserts none of them; it
had drifted 430/500 → 432/500 across two merges with nothing making anyone
re-read it. Diagnosed, filed, unfixed. Included here for completeness — it is the
third of this boundary's original three and the only one outstanding.

---

## GAP 5 — FIGURES COMMITTED AS PROSE — **found, filed as #1038**

The class was named this arc when a comment claiming the leaf writer costs the
roll one unit (73 → 72) re-measured at **ten** (75 → 65), having sat in the tree
for eighteen sessions as apparent evidence. That one was corrected; the tree was
never swept for others. Swept now — two remain, both in `parse.ts`, both
justifying a live decision, both taken before two instrument changes:

- `:876` — "Worth +9 writer-reach over the 1500-unit corpus (95 → 104)". The step
  floor is now 126.
- `:2377` — "the one the 71→44 writer-reach gap loses on".

---

## The through-line

Four of the five gaps are the same shape: **a figure whose scope lives in prose,
or nowhere, rather than in an assertion.** The standing rule for this boundary
already says every gate must state its population and its comparison axes and be
pinned to a literal that fails on movement. This audit adds a third item to that
list — **and its WINDOW** — because a measurement over time is scoped by how far
into the pattern it looked, and 4 cycles was hiding a real unit in a corpus we
have swept a dozen times.
