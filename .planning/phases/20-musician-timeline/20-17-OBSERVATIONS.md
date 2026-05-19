# Phase 20-17 — OBSERVATIONS

Durable per-wave evidence (the prototype's stdout is ephemeral; the appended
captures here are the audit trail). Every wave appends; nothing is rewritten.

---

## Wave-0 baseline — proto on main behaviour

**Branch:** `feat/20-17-d01-pervasive` (from `main`, on top of the 20-16 code
merge `aaae98c`; the extra `main` commits are `.planning`/`.anvi` doc-only).
**Date:** 2026-05-19
**Command:** `pnpm --filter @stave/app test:proto`
**Exit:** 0
**Production classification:** `__LsnlgQ6osk: code, -1j62z5xjyCN: code, -72eEl7NwK9e: code, -CyO42BOyp5a: structured, -L13nBhrqGR_: structured, -LHtBlF8peGC: code`
**Score: 2/6 structured** (`-CyO42BOyp5a` + `-L13nBhrqGR_`) — EXACTLY the
recorded CONTEXT / 20-16-OBSERVATIONS pre-D-01 baseline. This is the regression
oracle for every subsequent wave (Wave A–E MUST monotonically improve from
2/6 — never regress below it).

### Verbatim `pnpm --filter @stave/app test:proto` stdout

```
> @stave/app@0.1.0 test:proto /Users/mrityunjaybhardwaj/Documents/projects/struCode/packages/app
> vitest run --config vitest.proto.config.ts

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v1.6.1 /Users/mrityunjaybhardwaj/Documents/projects/struCode/packages/app

 ✓ src/components/musicalTimeline/__tests__/pitch.test.ts  (29 tests) 3ms
 ✓ src/components/musicalTimeline/__tests__/timeAxis.test.ts  (24 tests) 3ms
 ✓ src/components/musicalTimeline/__tests__/layoutTrackRows.test.ts  (10 tests) 4ms
stdout | tests/parity-corpus/_proto-d01.spec.ts > D-01 fixpoint HARD GATE prototype > runs the 6 #141 repros + synthetics under BOTH OQ1 dispositions

=== 6 REPROS (proto buildBindingMap variant) ===
__LsnlgQ6osk   | noRelax=code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
               | relax  =code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
_1j62z5xjyCN   | noRelax=code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
               | relax  =code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
_72eEl7NwK9e   | noRelax=code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
               | relax  =code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
_CyO42BOyp5a   | noRelax=structured (Track(d1, Code))
               | relax  =structured (Track(d1, Code))
_L13nBhrqGR_   | noRelax=structured (Track(d1, Param))
               | relax  =structured (Track(d1, Param))
_LHtBlF8peGC   | noRelax=code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
               | relax  =code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))

=== 6 REPROS (PRODUCTION parseStrudel — current source with Wave 0 bundle) ===
__LsnlgQ6osk   | production=code (bare)
_1j62z5xjyCN   | production=code (bare)
_72eEl7NwK9e   | production=code (bare)
_CyO42BOyp5a   | production=structured (body.tag=Code via)
_L13nBhrqGR_   | production=structured (body.tag=Param)
_LHtBlF8peGC   | production=code (bare)

=== SYNTHETICS ===
forward-ref (b)              | structured (Track(d1, Play))
cyclic (c)                   | code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
dup-key (d)                  | code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
dead-opaque 5c [noRelax]     | code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))
dead-opaque 5c [relax]       | structured (Track(d1, Play))
ref-opaque 5c [relax]        | code       (buildBindingMap returned null (fence/shape/occurs-check/dup-key))

=== DIAGNOSTICS (relax run per repro) ===
[R:__LsnlgQ6osk] stmts=7
[R:__LsnlgQ6osk] descs=rp1,beat,az2,chords2,bass,harm2 finalIdx=6 finalText="stack(\n  bass,\n  beat,\n  harm2,\n  az2,\n)"
[R:__LsnlgQ6osk] iter0 rp1 rhs="\"<sd hh>\".fast(\"<2@3 4>\")" -> tag=Code bareCode=false
[R:__LsnlgQ6osk] iter0 beat rhs="sound(rp1).bank(\"RolandTR707\").gain(0.4)\n   .gain(" -> tag=Code bareCode=true
[R:__LsnlgQ6osk] iter0 az2 rhs="irand(12).struct(\"x(8,8)|x(4,8)\")\n  .sometimesBy(p" -> tag=Code bareCode=true
[R:__LsnlgQ6osk] iter0 chords2 rhs="\"<Gsus G7 Em7 D7>\"" -> tag=Cycle bareCode=false
[R:__LsnlgQ6osk] iter0 bass rhs="chords2.rootNotes(2).note()\n  .s(\"sawtooth\")\n  .cl" -> tag=Code bareCode=true
[R:__LsnlgQ6osk] iter0 harm2 rhs="chords2.voicings('ireal')\n  .slow(1)\n  .note()\n  ." -> tag=Code bareCode=true
[R:__LsnlgQ6osk] iter1 beat rhs="sound(rp1).bank(\"RolandTR707\").gain(0.4)\n   .gain(" -> tag=Code bareCode=true
[R:__LsnlgQ6osk] iter1 az2 rhs="irand(12).struct(\"x(8,8)|x(4,8)\")\n  .sometimesBy(p" -> tag=Code bareCode=true
[R:__LsnlgQ6osk] iter1 bass rhs="chords2.rootNotes(2).note()\n  .s(\"sawtooth\")\n  .cl" -> tag=Code bareCode=true
[R:__LsnlgQ6osk] iter1 harm2 rhs="chords2.voicings('ireal')\n  .slow(1)\n  .note()\n  ." -> tag=Code bareCode=true
[R:__LsnlgQ6osk] post-fixpoint resolved=[rp1,chords2] pending=[1,2,4,5]
[R:_1j62z5xjyCN] stmts=3
[R:_1j62z5xjyCN] descs=cpm finalIdx=1 finalText="samples('github:yaxu/clean-breaks')"
[R:_1j62z5xjyCN] BAIL finalIdx 1 != last 2 (trailing binding)
[R:_72eEl7NwK9e] stmts=2
[R:_72eEl7NwK9e] descs=cpm finalIdx=1 finalText="stack(\n\nnote(`\n[f3 ab3 g3]\n[eb3 g3 c3]\n[f3 bb3 ab3]\n[eb3 c3 "
[R:_72eEl7NwK9e] iter0 cpm rhs="28" -> tag=Code bareCode=true
[R:_72eEl7NwK9e] post-fixpoint resolved=[] pending=[0]
[R:_CyO42BOyp5a] stmts=5
[R:_CyO42BOyp5a] descs=drum,clap,bass,perc finalIdx=4 finalText="stack(\n  drum,\n  clap,\n  perc,\n  bass,\n  note(\"[ ~  ~ [a4,c5"
[R:_CyO42BOyp5a] iter0 drum rhs="sound(\"[bd hh]*4\").bank(\"RolandTR909\")" -> tag=Param bareCode=false
[R:_CyO42BOyp5a] iter0 clap rhs="sound(\"[~ cp]*2\").bank(\"RolandTR909\")" -> tag=Param bareCode=false
[R:_CyO42BOyp5a] iter0 bass rhs="note(\"[~ a1]*2 [~ d2]*2\").sound(\"sawtooth\").lpf(80" -> tag=FX bareCode=false
[R:_CyO42BOyp5a] iter0 perc rhs="stack(\n  n(\"~ 1 ~  3 ~ ~ 3 1\").sound(\"casio\").gain" -> tag=Stack bareCode=false
[R:_CyO42BOyp5a] post-fixpoint resolved=[drum,clap,bass,perc] pending=[]
[R:_CyO42BOyp5a] FINAL parse -> tag=Code via=true bareCode=false
[R:_L13nBhrqGR_] stmts=4
[R:_L13nBhrqGR_] descs=polyrhythm,polymeter,both finalIdx=3 finalText="\"polyrhythm!4 polymeter!4 both!4\".steps(1)\n  .pick({polyrhyt"
[R:_L13nBhrqGR_] iter0 polyrhythm rhs="\"bd sd hh, ht ht ht cp\".s()\n  .steps(12)" -> tag=Code bareCode=false
[R:_L13nBhrqGR_] iter0 polymeter rhs="\"{bd sd hh, ht mt lt cp}\".s()\n  .steps(4)" -> tag=Code bareCode=false
[R:_L13nBhrqGR_] iter0 both rhs="\"{bd hh hh, bd hh hh hh}\"\n  .s()\n  .steps(4)" -> tag=Code bareCode=false
[R:_L13nBhrqGR_] post-fixpoint resolved=[polyrhythm,polymeter,both] pending=[]
[R:_L13nBhrqGR_] FINAL parse -> tag=Param via=false bareCode=false
[R:_LHtBlF8peGC] stmts=5
[R:_LHtBlF8peGC] descs=chordProgression,scales,numChords finalIdx=3 finalText="stack(\n\n  //arp keys\n  n(chordProgression).s(\"gm_epiano1\").p"
[R:_LHtBlF8peGC] BAIL finalIdx 3 != last 4 (trailing binding)


 ✓ tests/parity-corpus/_proto-d01.spec.ts  (1 test) 11ms
 ✓ src/components/__tests__/IRInspectorPanel.chrome.test.ts  (16 tests) 4ms
 ✓ src/components/__tests__/irProjection.test.ts  (83 tests) 10ms
 ✓ tests/parity-corpus/loc-fidelity.test.ts  (32 tests) 23ms
 ✓ src/components/musicalTimeline/__tests__/Ruler.test.tsx  (8 tests) 57ms
 ✓ src/components/__tests__/TrackSwatchPopover.test.tsx  (10 tests) 113ms
(node:6725) Warning: `--localstorage-file` was provided without a valid path
(Use `node --trace-warnings ...` to show where the warning was created)
 ✓ src/components/__tests__/IRInspectorPanel.test.tsx  (6 tests) 66ms
 ✓ src/components/musicalTimeline/__tests__/colors.test.ts  (41 tests) 9ms
 ✓ src/components/musicalTimeline/__tests__/groupEventsByTrack.test.ts  (9 tests) 2ms
 ✓ tests/parity-corpus/parity.test.ts  (32 tests) 18ms
 ✓ src/components/__tests__/collectLeafIrNodeIds.test.ts  (3 tests) 2ms
 ✓ src/components/musicalTimeline/__tests__/stableTrackOrder.test.ts  (6 tests) 2ms
 ✓ src/__tests__/smoke.test.ts  (1 test) 1ms
 ✓ src/components/__tests__/MusicalTimeline.test.tsx  (51 tests) 817ms

 Test Files  17 passed (17)
      Tests  362 passed (362)
   Start at  16:07:11
   Duration  1.75s (transform 1.19s, setup 1ms, collect 2.19s, tests 1.15s, environment 5.69s, prepare 984ms)
```

### Reading

- The PRODUCTION block is the gate of record. 2/6 structured
  (`-CyO42BOyp5a` body=Code-with-via, `-L13nBhrqGR_` body=Param). The other
  4 are bare Code — the D-01 work in Waves A–E lifts them.
- The proto-variant block (noRelax/relax) shows the *proposed* fixpoint also
  at 2/6 today (it does NOT itself implement G1/G2/G3/G4 in production — it
  is a local re-implementation; the threading still has to land in
  `parseStrudel.ts`). The diagnostics show WHY each of the 4 bails:
  `__LsnlgQ6osk` post-fixpoint `pending=[1,2,4,5]` (beat/az2/bass/harm2 stay
  bare Code — the G1 chain-arg + G2 root-ident + G4 method-arg gaps);
  `_1j62z5xjyCN` + `_LHtBlF8peGC` BAIL on the `finalIdx != last` shape fence
  (trailing binding — out of 20-17 scope, #149/#153 backlog); `_72eEl7NwK9e`
  `cpm=28` literal RHS → bare Code (the G3/D-02 literal-passthrough gap).
- Synthetics unchanged from the 20-16 record: forward-ref structured,
  cyclic/dup-key/dead-opaque[noRelax] bail (occurs-check terminal),
  dead-opaque[relax] structured, ref-opaque[relax] bails — the bounded
  fixpoint + occurs-check design is validated where reached.
