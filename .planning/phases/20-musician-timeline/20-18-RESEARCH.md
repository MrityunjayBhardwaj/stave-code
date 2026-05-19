---
phase: 20-18
title: Chain-root recognition — Strudel signal/builder family as Layer 1/2 Pattern IR
researcher: anvi-researcher
created: 2026-05-19T21:10:00Z
confidence: HIGH (R-1 observed; R-2 grounded against signal.mjs@1.2.6; R-3/R-4/R-5 design-grounded)
consumes: 20-18-CONTEXT.md (4 LOCKED decisions), 20-17-OBSERVATIONS.md, gh#155
---

# Phase 20-18 Research — chain-root recognition for the Strudel signal/builder family

## User Constraints (verbatim from 20-18-CONTEXT.md — LOCKED, NOT relitigated)

- **D-01:** Curated, upstream-SHA-pinned closed set of signal/builder roots is the
  gate-bearing fix (counted in D-03). A general `any-identifier(...)-chain-head →
  structured` fallback ships behind an **off-by-default flag**, measurement/triage
  ONLY, **never counted in the parity gate**.
- **D-02:** Recognised builders produce **genuinely-modelled IR tags** for the
  signal/random/builder family — NOT the `wrapAsOpaque` Code-with-via wrapper.
  Build the **complete Strudel signal/builder Layer 1/2 substrate**
  (`irand`/`rand`/`brand`/`brandBy`/`perlin`/`sine`/`cosine`/`saw`/`tri`/`square`/
  `isaw`/`run`/`binary`/`binaryN`/`chord`/...). Matcher stays a matcher: model
  STRUCTURE, never evaluate. Multi-wave phase (flagged-general is necessarily opaque).
- **D-03:** PASS iff BOTH: (1) `--LsnlgQ6osk` grounds STRUCTURED in production
  (`parseStrudel(<verbatim repro>)` → `body.tag !== 'Code' || body.via !== undefined`);
  (2) fresh `pnpm parity:bakery --n 50` ≥ **90.0%** structured. NO bar-lowering escape.
- **D-04:** 20-18 is the Layer 1/2 signal/builder substrate (axis 1). Phase 24
  (`Synth`/`UGenGraph`, Layer 3c, axis 5c) is a distinct, separate phase, unchanged.

---

## R-1 — THE P70 EMPIRICAL CLASSIFICATION (HEADLINE FINDING)

**Confidence: HIGH — this is OBSERVATION, not inference.** Every N=50 Code-fallback
was run through the **production `parseStrudel`** + per-top-level-statement
`parseExpression` via the vendored vite-node deep-path import (the exact mechanism
`_proto-d01.spec.ts:20` uses). Harness: `packages/app/tests/parity-corpus/_r1-classify.spec.ts`
+ `_r1-probe.spec.ts` (throwaway maintainer specs; run via a temp vitest config).
Full trace: `/tmp/r1-classify-output.txt`, `/tmp/r1-probe-output.txt`.

### The headline: the issue's "5/7 unbound-chain-root" claim is **FALSE**.

The shallow auto-classifier in `_bakery-classify.spec.ts:48-62` binned 5 samples as
`#141 (→#140): binding ref outside stack()-bare-arg` purely because the source text
matched `/\b(let|const|var)\s+\w+\s*=/`. That regex bins on the PRESENCE of a binding,
**not on the actual blocking construct**. P70 fired exactly as the pre-mortem warned.

**Empirical N=50 Code-fallback distribution (7 confirmed, count VERIFIED = 7):**

| # | hash | TRUE first-blocking construct (production) | Gap class |
|---|------|--------------------------------------------|-----------|
| 1 | `--LsnlgQ6osk` | `beat = sound(rp1)...` (bound-ident-root chain, **D-01/20-17 reach**) **AND** `az2 = irand(12).struct(...)` (**unbound chain-root**) **AND** `bass/harm2 = chords2.rootNotes(...)` (bound-ident-root). MIXED. | **chain-root (partial)** + bound-ident |
| 2 | `-1j62z5xjyCN` | `var cpm = 30;` then `samples('github:...')` then a structured `stack(note(`…`)…)`. The blocker is the **`samples(...)` boot statement as a non-final top-level statement** — splits the program so the final `stack` is not the sole final expr. NOT chain-root. | **boot-stmt-then-expr (#142-adjacent)** |
| 3 | `-6c1hEXe8Agi` | 24 top-level `let` bindings; `padsbell = chord("Am Am").voicing()...` blocks (**unbound chain-root: `chord`**). Also interleaved `//comment`-only "statements" the splitter treats as stmts. MIXED but chain-root-dominant. | **chain-root (`chord`)** + comment-stmt noise |
| 4 | `-7LU6zgzViSM` | `typeof setDefaultVoicings !== 'undefined' && setDefaultVoicings('legacy')` as the leading top-level statement — **guarded boot expression (#143)**. NOT chain-root. | **guarded boot expr (#143)** |
| 5 | `-G2drHRNFueu` | `sound ("hh hh hh hh")` then `sound ("[bd bd]...")` — **two bare top-level expression statements** (no binding, no final-single-expr). The whitespace `sound (` parses fine individually but multi-top-level-expr → no single final. NOT chain-root. | **multi-top-level-expr** |
| 6 | `-HyFCSbuSlq5` | Hydra/visual mashup: `await loadScript(...)`, `bpm = 60.95`, `osc(10,...)`, `render(o1)`, `a.show()`, raw `/*` — **non-Strudel (Hydra) + await + bare assignment**. NOT chain-root. NOT in scope. | **non-Strudel / Hydra mashup** |
| 7 | `-KLGNJUtyyj1` | `richter_chords`/`richter_tenor`/`richter_sopran` all parse structured (Seq/Late); final `arrange([48, stack(richter_chords.euclidRot(...))...])` — **`arrange(...)` builder root** as final expr. `arrange` is an **unbound builder-root** (pattern-arrangement builder). chain-root-adjacent. | **chain-root (`arrange`) — builder family** |

### The TRUE distribution (P70 finding — record verbatim, planner must size D-02 from THIS):

- **Genuine unbound-chain-root / builder-root class: 3–4 of 7**, NOT 5/7.
  - **#1 `--LsnlgQ6osk`** — chain-root is ONE of several blockers (`az2`'s `irand`);
    the others (`beat`/`bass`/`harm2`) are bound-ident-root which 20-17 D-01 *should*
    already reach. The probe shows `sound(rp1).bank("x")` → **bare Code** even with a
    bound `rp1` — meaning `sound(<boundIdent-as-arg>)` is NOT reached by 20-17's G2
    (G2 substitutes a bound ident as the ROOT token, not as a call ARGUMENT; G1 was
    the chain-arg substitution but does not cover `sound(rp1)` here in isolation).
    **This is a P70 sub-finding: `--LsnlgQ6osk` is multi-blocker; closing only the
    `irand` chain-root will NOT alone flip it to structured.** See R-5 risk.
  - **#3 `-6c1hEXe8Agi`** — `chord("Am Am").voicing()` IS the genuine class.
  - **#7 `-KLGNJUtyyj1`** — `arrange(...)` builder-root IS the genuine class.
- **NOT chain-root (out-of-scope or different class): 3–4 of 7**
  - #2 boot-stmt-then-expr · #4 guarded boot expr (#143, already filed) ·
    #5 multi-top-level-expr · #6 non-Strudel Hydra mashup.

### Isolated chain-root probe (production `parseExpression`, `/tmp/r1-probe-output.txt`)

ALL of these parse to **bare Code** today (the D-02 target surface, confirmed):
`irand(12)` · `irand(12).struct(...)` · `sine` · `sine.range(200,2000)` ·
`sine.range(1.5,8).fast(3)` · `perlin` · `perlin.range(0.3,0.8)` · `rand` ·
`run(8)` · `saw.range(0,1)` · `chord("Am Am").voicing()` ·
`chord("Am C").voicing().sound("gm")`.
Controls (already structured, must NOT regress): `sound("hh hh hh hh")` → `Seq`;
`note(`<e5 d5>`).slow(4)` → `Slow`; `n("0 1 2")` → `Seq`.
Bound-ident-root: `chords2.rootNotes(2).note()` → **bare Code** (20-17 reach gap, see R-5).

### Folding check (CONTEXT scope: fold ONLY with explicit same-class provenance)

- **#156 "1 uncategorised":** the auto-classifier's "uncategorised" sample.
  R-1 maps it to **#6 `-HyFCSbuSlq5`** (Hydra mashup) — the `classifyFallback`
  heuristic falls through every arm (no binding regex match because the live source
  after comment-strip leads with `setcps`/`samples`; has `=>` but also `let`).
  **#156 is NOT the chain-root class** — do NOT fold; it is non-Strudel-mashup,
  correctly out of 20-18 scope.
- **#149/#147/#153:** not in this N=50's fallback set by signature; do NOT fold —
  classify-don't-fold per CONTEXT. Keep as backlog.

**Planner consequence:** D-02's curated set is sized by the genuine class
(`irand`, `chord`, `arrange`, `sine`, `perlin`, `saw`, `run`, `rand`, …) PLUS the
closed-loop taxonomy — NOT by a phantom "5 binding-ref" class. The realistic
parity uplift from chain-root recognition alone is **~2–3 samples of 50 (#3, #7,
and partial #1)**, i.e. 86% → ~90–92%. **The 90% gate is achievable but TIGHT** —
see R-5 (the `--LsnlgQ6osk` multi-blocker risk is the phase's primary parity risk).

---

## R-2 — signal.mjs GROUND TRUTH (the external boundary)

**Confidence: HIGH for runtime semantics; MED for SHA-exactness.**
`signal.mjs` IS locally available and was read directly:
`node_modules/.pnpm/@strudel+core@1.2.6/node_modules/@strudel/core/signal.mjs` (1017 lines).
**Version delta caveat:** node_modules is `@strudel/core@1.2.6`; CONTEXT pins upstream
SHA `f73b395648645aabe699f91ba0989f35a6fd8a3c` (Codeberg `uzu/strudel`). The runtime
the parser is measured against IS 1.2.6 (the parity oracle imports the editor source
which uses the installed `@strudel/*`). Citations below are `signal.mjs@1.2.6:LINE`.
`collect.ts` already cites these same line numbers (e.g. `signal.mjs:237-258`,
`:392-394`, `:699-706`) — **consistent with 1.2.6**, so the existing Ground Truth
prior art is on the same version. **No Ground Truth doc exists**
(`~/.anvideck/projects/struCode/ref/` is empty). Recommendation: create
`~/.anvideck/projects/struCode/ref/GROUND_TRUTH_SIGNAL_MJS.md` in a wave (the
citations below are the seed); not gate-blocking since the source is local & read.

### Continuous signals — return a `Pattern` (continuous; one Hap spanning the query span)

| Builder | `file:line` | Arity | Return | Notes |
|---------|-------------|-------|--------|-------|
| `signal(func)` | `signal.mjs:18-21` | 1 (fn) | Pattern | the primitive; `query → [Hap(undefined, span, func(begin, controls))]` |
| `steady(v)` | `:13-16` | 1 | Pattern | constant continuous |
| `saw` | `:35` | 0 (value) | Pattern 0..1 | `signal(t => t % 1)` |
| `isaw` | `:56` | 0 | Pattern 0..1 | `1 - t%1` |
| `saw2`/`isaw2` | `:42`/`:49` | 0 | Pattern -1..1 | `.toBipolar()` |
| `sine` | `:80` | 0 | Pattern 0..1 | `sine2.fromBipolar()` |
| `sine2` | `:70` | 0 | Pattern -1..1 | `sin(2πt)` |
| `cosine` | `:91` | 0 | Pattern 0..1 | `sine._early(1/4)` |
| `cosine2` | `:98` | 0 | Pattern -1..1 | |
| `square` | `:107` | 0 | Pattern 0..1 | `floor((t*2)%2)` |
| `square2` | `:114` | 0 | Pattern -1..1 | |
| `tri` | `:124` | 0 | Pattern 0..1 | `fastcat(saw, isaw)` |
| `tri2` | `:131` | 0 | Pattern -1..1 | |
| `time` | `:155` | 0 | Pattern | `signal(id)` — cycle time |
| `mousex`/`mousey`/`mouseX`/`mouseY` | `:184-186` | 0 | Pattern 0..1 | env-dependent |
| `perlin` | `:661` | 0 | Pattern 0..1 | `signal(t => _perlin(t, randSeed))` |
| `berlin` | `:~670` | 0 | Pattern 0..1 | perlin-with-saw |

### Random signals — `Pattern` (continuous random)

| Builder | `file:line` | Arity | Return | Notes |
|---------|-------------|-------|--------|-------|
| `rand` | `:449` | 0 | Pattern 0..1 | `signal((t,c) => getRandsAtTime(t,1,c.randSeed))` — the family `collect.ts:58` already models (`__timeToRandsPrime` `:246-256`) |
| `rand2` | `:~451` | 0 | Pattern -1..1 | |
| `brand` | `:474` | 0 | Pattern {0,1} | `_brandBy(0.5)` |
| `brandBy(p)` | `:465` | 1 (numPat) | Pattern {0,1} | `reify(p).fmap(_brandBy).innerJoin()` |
| `irand(n)` | `:488` | 1 (numPat) | Pattern int 0..n-1 | `reify(n).fmap(_irand).innerJoin()`; `_irand=:476` `rand.fmap(x=>trunc(x*i))` |

### Pattern builders — return a **discrete** `Pattern` (events, not continuous)

| Builder | `file:line` | Arity | Return | Notes |
|---------|-------------|-------|--------|-------|
| `run(n)` | `:287` | 1 | discrete 0..n-1 | `saw.range(0,n).round().segment(n)` |
| `binary(n)` | `:298` | 1 | discrete {0,1} | `binaryN(n, log2(n)+1)` |
| `binaryN(n,nBits=16)` | `:313` | 1–2 | discrete {0,1} | length nBits |
| `binaryL(n)` / `binaryNL(n,nBits=16)` | `:~330`/`:~345` | 1–2 | discrete list | |

### `.range` / `.segment` / `.round` — chain methods, NOT roots (Pattern prototype, `pattern.mjs`)

`.range(lo,hi)`, `.range2`, `.rangex`, `.segment(n)`/`.seg`, `.round`, `.fast`/`.slow`
are registered Pattern methods (pattern.mjs, OPAQUE here — not read; `run` def at
`signal.mjs:287` proves `saw.range(0,n).round().segment(n)` is the canonical chain
shape). **Implication for the matcher:** a signal root + a `.range/.segment/...`
chain is exactly `parseRoot(signalRoot)` then the EXISTING `applyChain` running the
methods. The matcher only needs to recognise the ROOT; the chain machinery already
exists. `.range`/`.segment` should be modelled as ordinary chain methods (Param/FX
or a dedicated signal-shaping arm) — they are NOT new roots.

**Every listed builder is a PURE structural generator** (deterministic given
`(t, controls)`; no I/O except `mouse*`/`time`). Modelling their STRUCTURE
(`{kind, args}`) is term-level — the matcher line (D-02) is NOT violated. This is
the same tractability `collect.ts` already exploits for the RNG sub-family.

**OPAQUE sub-boundary:** `pattern.mjs` (`.range`/`.segment`/`reify`/`innerJoin`/
`register`) was NOT read — not needed for the ROOT recogniser, but if a wave needs
exact `.range` semantics for IR shape, read `pattern.mjs` first (Grounding Check).

---

## R-3 — signal/builder Layer-1/2 IR-tag taxonomy (D-02 genuine modelling)

**Confidence: MED-HIGH — design grounded in PV53 additive-union precedent + collect.ts reconciliation.**

### Proposed additive IR tags (mirror the 20-17 PV53 additive-union widening idiom)

The cleanest minimal taxonomy is **two new root tags** (NOT one per builder — that
would explode the consumer audit). Term-level shape models the family by `kind`:

```ts
// Continuous + random signals (no discrete events; one continuous value-stream)
| { tag: 'Signal'
    kind: 'sine'|'cosine'|'saw'|'isaw'|'tri'|'square'|'perlin'|'berlin'
        |'time'|'rand'|'rand2'|'brand'|'sine2'|'cosine2'|'saw2'|'isaw2'
        |'tri2'|'square2'|'mousex'|'mousey'
    args?: string          // RAW arg slice for arg-taking signals (brandBy/irand) — round-trip fidelity
    loc?: SourceLocation[]; userMethod?: string; unresolvedChain?: string; chainOffset?: number }

// Discrete pattern builders (produce events)
| { tag: 'Builder'
    kind: 'run'|'irand'|'binary'|'binaryN'|'binaryL'|'binaryNL'|'chord'|'arrange'
    args: string           // RAW (untrimmed) arg slice — code-invariance
    body?: PatternIR       // for builders that wrap a pattern (chord/arrange) — OPTIONAL, see below
    loc?: SourceLocation[]; userMethod?: string; unresolvedChain?: string; chainOffset?: number }
```

Rationale for **2 tags, kind-discriminated** (not N tags):
- The consumer audit (R-3 below) scales with **tag count**, not kind count. Two tags
  = a bounded, enumerable D-1c audit. New kinds later = a string-union widen (zero
  new consumer arms if consumers default-handle `Signal`/`Builder` uniformly).
- Matches the existing `Code.via` discriminated-additive idiom (PV53 / 20-17 G3):
  widen by adding a member, keep the opaque fence byte-identical.
- `args` is the RAW source slice (the `Code.via.args` "RAW per D-02" convention,
  `PatternIR.ts:104`) → `toStrudel` re-emits verbatim (code-invariance).

**`chord`/`arrange` nuance (Chesterton):** `chord("Am Am")` is in `@strudel/tonal`,
not `signal.mjs` (OPAQUE — not read). `arrange(...)` is in `pattern.mjs`/index
(OPAQUE). They are builder-roots empirically (R-1 #3, #7) but their argument is a
pattern/list, not a scalar. Model as `Builder` with `args` raw + optional `body`
for the recursable inner. **A wave should ground `chord`/`arrange` against their
real source before modelling `body`** — until then, `args`-raw-only (round-trips,
no false structure). Flagged OPAQUE below.

### Composition with Layer 1/2 transforms (the critical contract)

`sine.range(200,2000).slow(2)` must work. The flow:
1. `parseExpression` splits root vs chain (existing, pS:950+).
2. New `parseRoot` arm recognises `sine` → `{tag:'Signal', kind:'sine'}`.
3. **Existing `applyChain`** (pS:1351) runs `.range(200,2000)` then `.slow(2)` over
   the Signal IR — `.slow` already maps to `{tag:'Slow', factor, body:<Signal>}`;
   `.range`/`.segment` fall to `applyMethod`'s default → `wrapAsOpaque` → a
   `Code.via{method:'range',inner:<Signal>}` wrapper (STRUCTURED, walkable).
   **No new chain code needed** — the Signal/Builder root is just a new `body`
   any existing transform tag wraps. This is the same property the 20-17 G2
   spliced-subtree relies on (CONTEXT codebase-context, pS:1064-1083).

Verification the planner must include: a fixture asserting
`parseStrudel('sine.range(200,2000).slow(2)')` → outermost tag is `Slow`/`Code.via`
(NOT bare Code) AND a deep walk reaches `{tag:'Signal',kind:'sine'}`.

### D-1c consumer audit surface (PRIMARY RISK — enumerated NOW for the planner)

Every `tag === ...` switch / deep-walker that must learn `'Signal'`/`'Builder'`.
Grep-reproduced (`grep -rn "\.tag ===\|case '" packages/editor/src/ir packages/app/src/components`):

| Consumer | File | Obligation |
|----------|------|------------|
| `toStrudel` | `packages/editor/src/ir/toStrudel.ts` (switch at :20, ~30 case arms; `default` arm exists) | **MUST** add `case 'Signal'`/`case 'Builder'` → re-emit `kind` (+ `(args)` if present) **VERBATIM** (code-invariance contract). The `default` arm likely throws/Code-fallbacks — silent round-trip break if missed. |
| `collect` | `packages/editor/src/ir/collect.ts` (`node.tag === 'Stack'` :239, `Code.via` :254, case-list :258-274) | Signal/Builder produce NO discrete events (continuous) OR builder events. Must add arms or default-to-empty. **Reconcile with existing RNG modelling — see below.** |
| `serialize` | `packages/editor/src/ir/serialize.ts` | add tag arms (round-trip + persistence) |
| `parseStrudelStages` | `packages/editor/src/ir/parseStrudelStages.ts` | stage projection |
| `irProjection` | `packages/app/src/components/irProjection.ts` | timeline projection |
| `IRInspectorChrome` / `IRInspectorPanel` | `packages/app/src/components/IRInspector*.{ts,tsx}` | inspector node rendering |
| `MusicalTimeline` | `packages/app/src/components/MusicalTimeline.tsx` | musician-timeline rendering |
| `layoutTrackRows` | `packages/app/src/components/musicalTimeline/layoutTrackRows.ts` | row layout |
| `collectLeafIrNodeIds` | `packages/app/src/components/collectLeafIrNodeIds.ts` | leaf-id walk |
| `colors` / `Ruler` | `packages/app/src/components/musicalTimeline/{colors,Ruler}.tsx` | color/ruler (if tag-keyed) |

**11 consumer files.** The planner MUST scope a dedicated audit wave (the 20-17
D-1c precedent — its primary risk surface; 20-17 OBSERVATIONS line 470 records a
producer-side ordering bug the D-1c audit MISSED — re-read that lesson).

### Reconcile with `collect.ts` RNG prior art (Chesterton — understand before overlapping)

`collect.ts` already models the RNG family **at the CHAIN-METHOD level**, NOT the
root level: it handles `.degradeBy`/`.shuffle`/`.scramble`/`.degrade`
(`collect.ts:809`, `:1096`, `:1125`) by computing event-drop/permutation using
`__timeToRandsPrime` (`:58`, signal.mjs:246-256). It does NOT model `irand`/`rand`/
`perlin` as standalone roots — those reach `collect` today only as bare Code.
**The new taxonomy COMPOSES WITH, does not SUBSUME, collect.ts:** `collect` keeps
its `.degradeBy`-as-RNG-consumer logic; the new `Signal`/`Builder` root tags are a
NEW input `collect` must handle (a `Signal` root contributes no discrete events;
an `irand(n)` `Builder` used as a `.struct`/arg is consumed by the existing struct
machinery). No existing collect.ts RNG line is removed. The planner must verify
`collect`'s `.degradeBy(perlin.range(0,1))` path (R-1 #1 `az2`) — `perlin` becoming
a `Signal` root inside a `.degradeBy` arg must not break the existing rand-seed
math (currently it's bare Code so collect treats it opaquely; modelling it must be
event-neutral there). **Catalogue: this is a candidate PV/P entry.**

---

## R-4 — parseRoot arm placement + flagged-general fallback (D-01 mechanism)

**Confidence: HIGH — placement proven by the 20-17 G2 discipline + read source.**

### parseRoot recognition-arm order (re-grepped — CONTEXT line numbers VERIFIED)

`parseStrudel.ts` (current source, post-20-17):
- `parseRoot` defined at **pS:1033**.
- **G2 bound-ident arm: pS:1081** (`if (bindings && /^[A-Za-z_$][\w$]*$/.test(trimmed) && bindings.has(trimmed))`).
- `noteMatch`: **pS:1086** · `sMatch`: **pS:1107** · `miniMatch`: **pS:1126** ·
  loose arm: **pS:1154** · backtick/bareCode fallback below.

### WHERE the new `recogniseChainRoot` arm slots, and WHY

**Slot: immediately AFTER the G2 bound-ident arm (pS:1081-1083), BEFORE `noteMatch` (pS:1086).**

Proof it cannot regress any existing arm (the 20-17 G2 placement discipline):
- The strict regexes are anchored `^(?:note|n)\s*\(\s*"…"\)`, `^(?:s|sound)\s*\(…`,
  `^mini\s*\(…`. A curated signal/builder root is `sine` (bare ident, no `(`) or
  `irand(12)` / `chord("Am")` / `run(8)`. A **bare signal ident** (`sine`/`perlin`/
  `rand`) has no `(` → cannot match note/s/mini (all require `\(`). An **arg-taking
  builder** (`irand(12)`) has root token `irand` ≠ `note|n|s|sound|mini` → cannot
  match the strict OR loose arms (loose arm anchors `^(note|n|s|sound|mini)\s*\(`).
- It MUST come **after G2**: if a user binds `const sine = ...` then references
  `sine`, the bound subtree must win (G2's bindings substitution) over the curated
  signal recogniser — otherwise a user shadow of `sine` would be mis-modelled.
  Placing after G2 preserves user-binding precedence (the same shadowing-correctness
  argument 20-17 used for G2-before-strict).
- It MUST come **before** the loose arm and bareCode: today these roots fall to
  bareCode (R-1 probe proves it). Inserting here strictly WIDENS — every input that
  previously reached this arm was bareCode (provably, by R-1 probe), so no snapshot
  of a currently-structured file can move except via the flagged fixtures
  (the per-file loc-fidelity STOP-gate allow-list).

The recogniser is a **curated closed-set** keyed exactly like the G5
`RESERVED_LABEL_IDENTS` set (`parseStrudel.ts:791`) and the 20-15 boot-token
hand-maintained list (`parseStrudel.ts:167-179`) — a `Set`/`Record` literal of
root tokens → `{tag, kind}`. The matcher: regex the root token + (for arg-takers)
balanced-paren arg slice; emit `{tag:'Signal'|'Builder', kind, args?}`. Mirrors
the existing curated-list idiom CONTEXT mandates (the G5 precedent).

### The flagged-general fallback (off-by-default, measurement-only, NEVER gate-counted)

**Where the flag lives — NOT module state (PV50):** PV50 forbids per-evaluate
module-mutable accumulators; PV53 mandates pervasive optional-arg threading. The
flag MUST be an **optional parameter threaded** the same way `bindings` is threaded
`parseStrudel → parseExpression → parseRoot` (the 20-17 G4 optional-arg-threading
precedent, CONTEXT). Recommended: a `parseStrudel(code, opts?: { recogniseGeneralChainRoots?: boolean })`
threaded as the existing `bindings`/`isSampleKey` params are (pS:950 signature).
Default `false`. The general arm, when enabled, recognises ANY
`identifier(...)`-or-`identifier`-rooted chain not in the curated set and emits a
**structured-opaque** `Code.via{method,args,inner}` wrapper (D-01: unknowns can't be
modelled — opaque is correct for the general path).

**How it stays NEVER-gate-counted:** the parity oracle (`parity-bakery.mjs` →
`_bakery-classify.spec.ts`) calls `parseStrudel(s.code)` with **no opts** → flag
defaults `false` → general arm dormant in the gate. The flag is only ever passed by
the maintainer triage harness (a `_*.spec.ts`, like `_r1-classify`). **The oracle
cannot accidentally count it because enabling it requires an explicit opts argument
the oracle never constructs.** The planner must add a guard test asserting the
oracle's `parseStrudel(code)` call site passes no opts (a grep-assert on
`_bakery-classify.spec.ts:77` `parseStrudel(s.code)` — exactly one arg).

### PV49 loc-additivity (the realized 20-15/16/17 pre-mortem)

The curated root carries definition-site offsets exactly as the 20-17 G2 spliced
subtree does (CONTEXT PV49 addendum). The arm computes the inner-arg offset the
same way the existing arms do: `baseOffset + leadingWs + <token/quote idx> + 1`
(the convention at pS:1090, pS:1109). For an arg-taking builder
(`irand(12)`), the `args` raw slice's offset = `baseOffset + leadingWs +
trimmed.indexOf('(') + 1`; the recursable `body` (chord/arrange) recurses
`parseExpression(innerArg, thatOffset, …)` — same additivity arithmetic as the
loose arm (pS:1156-1164). Specify per-tag in the plan: **`Signal` (no args) carries
only the root `loc`; `Builder` carries root `loc` + `args` raw (no re-basing);
recursable `body` recurses with the computed inner offset.** Per-file loc-fidelity
STOP gate stays clean because parity-UNCHANGED files never hit this arm (R-1 probe:
every input reaching it was bareCode → not in any current snapshot).

---

## R-5 — D-03 dual-gate oracle + regression fixture

**Confidence: HIGH for mechanism; MED for the 90% outcome (the primary phase risk).**

### Crit-1: reclaim `--LsnlgQ6osk`

The exact production assertion (mirrors `_proto-d01.spec.ts:256-263` /
`_bakery-classify.spec.ts:32-41`):

```
const ir = parseStrudel(readRepro('__LsnlgQ6osk'))           // verbatim vendored repro
const body = ir.tag === 'Track' && ir.body ? ir.body : ir
assert(body.tag !== 'Code' || body.via !== undefined)        // STRUCTURED
```

The vendored `bakery-runs/repro__LsnlgQ6osk.strudel` + `_proto-d01.spec.ts` ARE the
oracle (CONTEXT). The proto's PRODUCTION block (`_proto-d01.spec.ts:253-264`)
currently prints `__LsnlgQ6osk | production=code (bare)`. It flips to `structured`
when chain-root recognition lands AND the OTHER `--LsnlgQ6osk` blockers resolve.

**PRIMARY RISK (R-1 P70 sub-finding — the planner MUST plan for this):**
`--LsnlgQ6osk` is **multi-blocker**, not chain-root-only. Per R-1, its descriptors
block on: `beat`=`sound(rp1)...` (bound-ident-AS-ARG, not reached by 20-17 G2 in
isolation — R-1 probe: `sound(rp1).bank("x")`→bare Code), `az2`=`irand(12)...`
(chain-root — D-02 closes this), `bass`/`harm2`=`chords2.rootNotes(...)`
(bound-ident-root — should be 20-17 G2 reach; R-1 probe shows
`chords2.rootNotes(2).note()` STILL bare Code in ISOLATION because no bindings
map). Inside the full program the fixpoint provides `chords2`, so `bass`/`harm2`
likely resolve via G2; **but `beat`'s `sound(rp1)` arg-substitution and `az2`'s
`irand` chain-root BOTH must close for the whole `stack(bass,beat,harm2,az2)` to be
structured.** If only `irand` is modelled, `beat` still bareCodes → the whole
program is still bare Code → **crit-1 FAILS**.
- **Planner directive:** the D-02 curated set MUST include whatever closes `beat`'s
  `sound(rp1)` (an arg-substitution gap — possibly a 20-17 G1 extension, NOT
  strictly chain-root; classify in Wave 0). If `sound(<boundIdent>)` is a separate
  class, this is a PK18 surface: either widen D-01's curated mechanism to cover it
  WITH provenance, OR re-pose crit-1 to the user (the 20-17 Wave-E precedent —
  CONTEXT explicitly says 20-18 RECLAIMS `--LsnlgQ6osk`, so re-anchoring away is
  NOT available; the resolution must be to close ALL its blockers or STOP-and-repose).
- **This is the single highest-risk item in the phase.** Wave 0 must empirically
  re-trace `--LsnlgQ6osk` per-descriptor (the `_proto-d01` PRODUCTION block) AFTER
  each wave to see which blockers remain.

### Crit-2: fresh PK17-step-6 ≥ 90.0%

Invocation: `pnpm parity:bakery --n 50` (PK17 step 6). **Fresh-stamp discipline:**
the new run's stamp MUST differ from `2026-05-19T13-24-45-538Z` (the 20-17 V-1
baseline) — `parity-bakery.mjs` stamps with run-time ISO; a genuine re-pull
produces a new stamp + new `samples-<stamp>.json` + `result-<stamp>.json` under
`packages/app/tests/parity-corpus/.bakery-runs/` (UPSTREAM_SHA stays
`f73b3956`, `parity-bakery.mjs:52`). Verify: `# real-world %: ≥ 90.0%`,
`structured ≥ 45/50`. **R-1 reality check:** the genuine chain-root class is
~2–3/50 (#3, #7, partial #1). 86%→90% needs +2 net (43→45). #3 and #7 close
cleanly with `chord`/`arrange` modelling. #1 (`--LsnlgQ6osk`) needs ALL blockers
(crit-1) — if it closes, that's +3 → 92%. **Gate is achievable iff #3 + #7 + (#1
or one other) close.** If #1's multi-blocker doesn't fully close but #3+#7 do →
44/50 = 88% → **gate FAILS, no bar-lowering** → PK18 STOP, triage residual to
backlog, re-pose. The planner must size waves so #3/#7 (clean) land before #1
(risky) — fail fast on the gate-critical uncertainty.

### Permanent CI fixture (the 20-17 V-2 pattern)

Name: **`bakery-141-irand-chain-root.strudel`** (CONTEXT-named; #141 provenance).
Minimal verbatim-faithful shape exercising the chain-root path (distilled from
`repro__LsnlgQ6osk.strudel:az2`, NOT paraphrased to a working form — the 20-15 V-2
"do not paraphrase" lesson):

```
const az2 = irand(12).struct("x(8,8)|x(4,8)").note().s("piano")
stack(az2)
```

Asserts: `parseStrudel(...)` → `body.tag !== 'Code' || body.via !== undefined`
AND a deep walk reaches `{tag:'Builder', kind:'irand'}`. Vendor + snapshot via
`vitest -u` (exactly 2 snapshots: parity + loc-fidelity), provenance in
`BAKERY-FIXTURES.md` (the 20-17 V-2 mechanism, OBSERVATIONS:742-781), and the
existing `parity-refresh.mjs:70-75` structural guard auto-excludes `bakery-*` from
TARGETS (no edit needed — confirmed 20-17 V-2). Consider a SECOND fixture
`bakery-chord-voicing-root.strudel` for the `chord` builder class (#3) since that's
gate-critical and a distinct kind.

---

## OPAQUE BOUNDARIES (the planner must NOT plan against inferred semantics)

1. **`@strudel/tonal` `chord`** — `chord("Am Am").voicing()` is gate-critical (R-1
   #3) but `chord`/`.voicing` are in `@strudel/tonal`, NOT `signal.mjs` (NOT read).
   Model `args`-raw-only until a wave grounds it (`node_modules/.pnpm/@strudel+tonal*`).
2. **`arrange`** — R-1 #7 gate-relevant; in `pattern.mjs`/index (NOT read). Same
   args-raw-only disposition until grounded.
3. **`pattern.mjs`** — `.range`/`.range2`/`.rangex`/`.segment`/`.seg`/`reify`/
   `innerJoin`/`register` NOT read. Sufficient for the ROOT recogniser (chain
   methods reuse existing `applyChain`); read before modelling `.range` IR shape.
4. **SHA delta** — grounded against `@strudel/core@1.2.6` (the actual installed
   runtime the oracle measures). CONTEXT pins Codeberg SHA `f73b3956`; `collect.ts`'s
   existing citations match 1.2.6 line numbers (consistent). Treat 1.2.6 as ground
   truth for THIS measurement; note the SHA in the Ground Truth doc.
5. **`_perlin`/`getRandsAtTime` internals** — `collect.ts` already grounds the
   RNG-seed math (`signal.mjs:246-256`); `_perlin` (`:~640`) not deeply traced —
   only matters if a wave models perlin's *values* (it must NOT — matcher line).

No Ground Truth doc exists (`~/.anvideck/projects/struCode/ref/` empty). The R-2
citation table is the seed for `GROUND_TRUTH_SIGNAL_MJS.md` — recommend a wave
creates it (not gate-blocking; source is local + read).

---

## PLANNER HANDOFF

### Recommended wave decomposition (D-02 is multi-wave — CONTEXT confirmed)

- **Wave 0 — Empirical re-trace + classification lock.** Re-run `_r1-classify` +
  `_proto-d01` PRODUCTION block; lock the per-descriptor blocker map for
  `--LsnlgQ6osk`; classify `beat`'s `sound(rp1)` (chain-root vs arg-subst — the
  gate-critical unknown). Output: the exact curated-set membership + the
  `--LsnlgQ6osk` blocker inventory. **Gate: classification recorded verbatim
  (P70 discipline); no code.**
- **Wave A — IR taxonomy.** Add `Signal`/`Builder` tags to `PatternIR.ts` +
  smart constructors (PV53 additive idiom). **Gate: `pnpm --filter @stave/editor build`
  + minification-stable anchor grep > 0; editor type-check green.**
- **Wave B — `recogniseChainRoot` arm + curated set.** Insert after pS:1081,
  before pS:1086. Curated `Set`/`Record` (continuous signals + RNG + run/binary).
  **Gate: R-1 probe shapes flip to structured; controls
  (`sound("...")`/`note(...)`) UNCHANGED; per-file loc-fidelity STOP gate
  (parity-UNCHANGED set EMPTY).**
- **Wave C — `chord`/`arrange` builder roots (gate-critical, OPAQUE — ground first).**
  Read `@strudel/tonal`/`pattern.mjs` for `chord`/`arrange`; model args-raw +
  optional body. **Gate: R-1 #3 + #7 flip structured in a re-run.**
- **Wave D — Consumer audit (PRIMARY RISK — the 20-17 D-1c precedent).** All 11
  consumer files (R-3 table). toStrudel verbatim round-trip per tag; collect
  event-neutrality; reconcile with collect.ts RNG (compose, don't subsume).
  **Gate: round-trip byte-fidelity test per new tag; full editor + app suite
  green (baseline editor 1603/1603, app 367/367); the 20-17 producer-precedence
  bug class (OBSERVATIONS:470) explicitly re-checked.**
- **Wave E — flagged-general fallback.** Threaded opts param (NOT module state,
  PV50; the 20-17 G4 threading idiom). **Gate: oracle call site one-arg
  grep-assert; flag default-false test.**
- **Wave V — Dual-gate verification.** Crit-1 (`--LsnlgQ6osk` STRUCTURED, the
  multi-blocker risk) + Crit-2 (fresh `parity:bakery --n 50` ≥ 90.0%, new stamp).
  Permanent fixture(s) + BAKERY-FIXTURES provenance + catalogue updates +
  single non-stacked PR. **Gate: BOTH crit pass, NO bar-lowering; if crit-2 < 90
  → PK18 STOP, backlog, re-pose.**

Order rationale: clean gate-closers (#3/#7 via Wave C) land BEFORE the risky
multi-blocker `--LsnlgQ6osk` (Wave V crit-1) — fail fast on the 90% uncertainty.

### Carried-forward operational discipline (verbatim from 20-17 — proven)

- AnviDev: branch `feat/20-18-chain-root`, single non-stacked PR → main, Claude
  never merges. `.anvi/`+`.planning/` gitignored → `git add -f`. No Co-Authored-By.
- **COMMIT_TEMPLATE single-quoted heredoc** `git commit -F - <<'MSG'`; NEVER `-m`
  with backticks/`$()` (zsh strip, recurred 2× in 20-16; memory feedback_commit_msg_heredoc).
- **P68 build hygiene:** one-shot `pnpm --filter @stave/editor build` + grep a
  MINIFICATION-STABLE anchor (string/regex literal or named export — e.g. the new
  `Signal`/`Builder` kind-string literals or a named export; NOT a comment, NOT a
  param) > 0 before every editor-src commit. **Start `pnpm --filter @stave/editor
  dev` (tsup --watch) before editing `packages/editor/src/`** (memory
  feedback_editor_watch_mode / P66 / PV48 — workspace exports via dist/).
- **Per-file loc-fidelity STOP gate** (per-wave + cross-wave): every
  parity-UNCHANGED corpus file's loc-fidelity diff EMPTY; parity-changed set ⊆
  enumerated allow-list ({Wave-0 fixtures} ∪ flagged); any other = silent drift =
  STOP.
- **PK18 HARD-GATE cascade discipline:** gate falsifies a premise → STOP, record
  verbatim in OBSERVATIONS, re-classify, re-pose the invalidated LOCKED decision
  to the user, reframe — NEVER push through, NEVER second workaround, NEVER lower
  the bar. New gap classes → backlog issues (issue-before-fix), NOT fixed here.
  **The `--LsnlgQ6osk` multi-blocker (R-5) is the most likely PK18 trigger.**
- **PK17 friction-first cycle:** measure (Wave 0) → classify → fix highest-freq →
  re-measure (Wave V). Step-6 fresh re-pull = new stamp ≠ `2026-05-19T13-24-45-538Z`.
- **Post-merge: verify the ARTIFACT not the badge** —
  `git merge-base --is-ancestor <PR-head> origin/main` exit 0; HEAD==merge; new
  symbols (`Signal`/`Builder` kind literals) grep-present on real main's `dist`;
  editor/app counts hold; manual-close any 2nd+ issue (GitHub 1-keyword limit).
- **String quoting:** Strudel transpiler converts double-quoted strings to mini
  Patterns; use SINGLE quotes for chain-method string-id args in any fixture
  (memory feedback_strudel_quote_style / P62 / PV44).

### Per-section confidence

| Section | Confidence | Why |
|---------|-----------|-----|
| R-1 | **HIGH** | Direct observation: production parser run over all 7 N=50 fallbacks + isolated chain-root probe. The 5/7 claim empirically corrected to 3–4/7. |
| R-2 | **HIGH** (semantics) / **MED** (SHA) | `signal.mjs` read directly @1.2.6 with `file:line`; SHA delta vs pinned `f73b3956` noted, collect.ts citations corroborate 1.2.6. |
| R-3 | **MED-HIGH** | Tag design grounded in PV53 additive idiom + read toStrudel/collect/PatternIR; `chord`/`arrange` body modelling OPAQUE pending source. |
| R-4 | **HIGH** | Placement proven by read source + the 20-17 G2 discipline + R-1 probe (every reaching input was bareCode → strict widen). |
| R-5 | **HIGH** (mechanism) / **MED** (90% outcome) | Oracle mechanism is read code; the 90% gate hinges on the `--LsnlgQ6osk` multi-blocker — the phase's primary risk, surfaced by R-1. |

### Cleanup note for the executor

Throwaway research artifacts created (NOT for commit): `_r1-classify.spec.ts`,
`_r1-probe.spec.ts`, `vitest.r1.config.ts`, `vitest.r1probe.config.ts` in
`packages/app/`. Wave 0 may RE-USE `_r1-classify.spec.ts` as the empirical
re-trace harness (it mirrors the `_proto-d01` convention) — keep or delete per
plan. They are NOT in CI (`_`-prefix + non-included config).
