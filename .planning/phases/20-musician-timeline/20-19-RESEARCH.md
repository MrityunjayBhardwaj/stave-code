---
phase: 20-19
title: buildBindingMap shape-fence relaxation — research for `bindings*, sideEffect, finalExpr`
researcher: anvi-researcher
created: 2026-05-20T11:45:00Z
confidence: HIGH (curated set, surgery site, locked-STOP location, loc-fidelity safety); MEDIUM (Wave-0 backlog classification — must be EXECUTED, not inferred)
inputs: CONTEXT.md (D-01..D-04 locked), 20-18 OBSERVATIONS lines 967-1180, 20-18 PLAN line 380, 20-18 SUMMARY, parseStrudel.ts:130-595, GROUND_TRUTH_SIGNAL_MJS.md, .anvi/{hetvabhasa,vyapti,krama}.md
upstream_pin: f73b395648645aabe699f91ba0989f35a6fd8a3c (LOCAL @strudel/core@1.2.6; CORPUS-SOURCE.md confirms same SHA; FLAG below if line numbers drift)
---

# Phase 20-19 RESEARCH — buildBindingMap shape-fence relaxation

## 0. User Constraints (verbatim from CONTEXT — DO NOT RE-LITIGATE)

**D-01** — curated closed-set; initial candidates `all, samples, setcps, setCps,
setcpm, setCpm, useRNG, setVoicingRange, initAudio, aliasBank`; rejected: B
(generalised shape walk), C (compose with `CHAIN_ROOT_RECOGNISER`).

**D-02** — pre-process strip from `splitTopLevelStatements` output, BEFORE
`buildBindingMap` consumes; no change to loop / fixpoint / occurs-check / shape
guard. Rejected: B (relax shape walker in-place), C (two-stage IR side-channel).

**D-03** — strict; #158 only; Wave 0 RUNS each of {#156, #159, #149, #147,
#153} through `parseStrudel` and classifies by observation; non-shape-fence
items stay backlog.

**D-04** — dual gate; crit-1 `_waveC-grounding.spec.ts` locked-STOP flips
`toBe(false)` → `toBe(true)`; crit-2 fresh `pnpm parity:bakery --n 50` ≥ 94.0%
AND must-not-regress 92.0% floor; no bar-lowering.

## 1. Falsification trail — grounded vs inferred

Every claim in §R-1..§R-7 was either GREP'd (file path + matched line) or RUN
(parseStrudel + observation captured). The few INFERRED items are flagged for
Wave 0 promotion.

```
GROUNDED   = file:line read; observation matches source
GREP       = pattern grep returned exact match (no source-read required)
RUN        = parseStrudel/test executed; output captured
INFERRED   = derived from documentation/precedent; promote via Wave 0
```

## 2. R-1 — Upstream curated-token audit at pin `f73b3956`

**LOCAL VERSION DELTA:** `@strudel/core@1.2.6`, `@strudel/tonal@1.2.6`,
`@strudel/webaudio@1.3.0`, `superdough@1.3.0` installed locally. Pin SHA
`f73b3956` is the CORPUS source SHA. 20-18 Wave C explicitly noted "Version
delta: local `@strudel/core@1.2.6` (vs CONTEXT pin
`f73b395648645aabe699f91ba0989f35a6fd8a3c`). `collect.ts` line-number
citations corroborate 1.2.6 — same baseline used." Same posture applies here.
**FLAG:** if upstream restructures these helpers (rename / remove / change
return type), the regex anti-drift catches it via the per-token CI fixture; the
SHA pin in the comment block is the audit trail.

### 2.1 Per-token ship table

| Token | Pkg / file:line | Return | Class | In-set? |
|---|---|---|---|---|
| `all` | `@strudel/core` `repl.mjs:153-156` (`const all = function (transform) { allTransforms.push(transform); return silence; }`) | `silence` (the `Pattern` constant from `@strudel/core` `signal.mjs`) — but the value is DISCARDED at statement level (REPL-injected closure, used only for side effect of populating `allTransforms[]` which `repl.evaluate()` drains at line 262-266) | pure side-effect (mutates a REPL-local array that the engine consumes post-eval) | **YES** (canonical exemplar; MUST be in initial ship) |
| `each` | `@strudel/core` `repl.mjs:164-167` (`const each = function (transform) { eachTransform = transform; return silence; }`) — NOT IN D-01 CONTEXT LIST | `silence`; assigns to REPL-local `eachTransform`; drained at line 254-256 | pure side-effect — IDENTICAL class to `all` | **NO (out-of-CONTEXT)** — D-01 locks the initial set without `each`; flag for backlog if a corpus row surfaces a `each(...)` line, OR pre-emptively add since the class is identical and incident-free additions are cheap. Researcher-recommendation: ASK USER (pose to user pre-execute if any Wave-0 row triggers it; otherwise leave for next phase). |
| `samples` | `superdough@1.3.0` `sampler.mjs:249-263` (`export const samples = async (sampleMap, baseUrl, options) => { … processSampleMap(...); }`) | `undefined` (Promise<void>) | pure side-effect (registers sample sources; no Pattern return) | **YES** |
| `setcps` / `setCps` | `@strudel/core` `repl.mjs:117-120` (`const setCps = (cps) => { scheduler.setCps(unpure(cps)); return silence; }`); aliased at `repl.mjs:215` (`setcps: setCps`) | `silence` (discarded) | pure side-effect (tempo mutation) | **YES** (both spellings) |
| `setcpm` / `setCpm` | `@strudel/core` `repl.mjs:132-135` (`const setCpm = (cpm) => { scheduler.setCps(unpure(cpm)/60); return silence; }`); aliased at `repl.mjs:217` (`setcpm: setCpm`) | `silence` (discarded) | pure side-effect (tempo mutation) | **YES** (both spellings) |
| `useRNG` | `@strudel/core` `signal.mjs:279` (`export const useRNG = (mode = 'legacy') => (RNG_MODE = mode);`) | `mode` value (string); discarded at statement level | pure side-effect (mode-flag mutation) | **YES** |
| `setVoicingRange` | `@strudel/tonal@1.2.6` `voicings.mjs:87` (`export const setVoicingRange = (name, range) => addVoicings(name, voicingRegistry[name].dictionary, range);`) | return of `addVoicings` (registry-mutation helper; not a `Pattern`) | pure side-effect (voicing-registry mutation) | **YES** |
| `initAudio` | `superdough@1.3.0` `superdough.mjs:259-289` (`export async function initAudio(options = {}) { … }`) | `undefined` (Promise<void>) | pure side-effect (audio-context boot) | **YES** |
| `aliasBank` | `superdough@1.3.0` `superdough.mjs:132-?` (`export async function aliasBank(...args) { switch(args.length) { case 1: … } }`) | `undefined` (Promise<void>) | pure side-effect (bank-alias registration) | **YES** |

**Verdict:** all 10 candidate tokens in the D-01 CONTEXT list are
**GROUNDED pure-side-effect**. The initial ship set = exactly the
D-01 list. No candidate must be dropped; no candidate returns a `Pattern`
that downstream code could legitimately consume. Confidence: **HIGH** (every
row above was source-read).

### 2.2 Notes on `silence`

`silence` is exported from `@strudel/core/signal.mjs` (a constant `Pattern`).
`all`/`each`/`setCps`/`setCpm` return `silence`, but the user-written
statement DISCARDS the return (the call is statement-level, not RHS of a
binding; the user is invoking for side effect only). The recogniser does not
inspect the return — it only matches on the head-of-line token. The class
match is "this statement is a depth-0 call to a recognised side-effect
token, run for effect" — identical posture to the existing
`stripParserPrelude`-recognised tokens.

### 2.3 NOT in the set (rejected candidates from CONTEXT)

The CONTEXT D-01 RATIONALE explicitly excludes:

- `hush` — pattern-control returning a Pattern (called for side effect AT
  prelude time by the engine's `shouldHush && hush()` flow, but is a
  user-callable Pattern-returning function in `repl.mjs:215`); excluded
  pre-emptively.
- `cpm` — `register('cpm', …)` chain method (`repl.mjs:206`), NOT a top-level
  side-effect call.
- `each` — same class as `all` (see row above); excluded because not in the
  CONTEXT initial list. **GRAY:** if Wave-0 of #156/#159/#149/#147/#153
  surfaces an `each(...)` statement on the shape-fence path, RE-POSE to
  user before pre-emptive add (PK18 step 6).

## 3. R-2 — Wave 0 classification probe shape

The Wave 0 probe RUNS each of the 5 backlog items through
`parseStrudel(s.code)` on a vendored fixture (or the live row from
`samples-2026-05-19T20-17-24-486Z.json`) and classifies by output. Disposition
rule: SHAPE-FENCE class → in-scope-bonus-close; ANY OTHER class → stays
backlog (D-03 strict).

### 3.1 Canonical anchor — #3 `-6c1hEXe8Agi` (must-flip)

```ts
// Read live row from baseline samples (already vendored)
const { samples } = JSON.parse(fs.readFileSync(SAMPLES, 'utf8'))
const s3 = samples.find((s) => s.hash === '-6c1hEXe8Agi')!

// Pre-fix expectation (locked-STOP today): bareCode
// Post-fix expectation: STRUCTURED + Builder/chord HIT
const ir3 = parseStrudel(s3.code)
expect(isWholeStructured(ir3)).toBe(true)             // crit-1
expect(findBuilder(ir3, 'chord')).toBeTruthy()        // Wave-C arm fires
expect(findBuilder(ir3, 'chord').args).toBe('"Am Am"')// the proved-arm result
```

Pre-fix output (GROUNDED — captured 20-18 Wave C, `/tmp/waveC-grounding-output.txt`):

```
--- #3 -6c1hEXe8Agi (chord-rooted bindings + trailing side-effect) — PK18 STOP recorded ---
whole-program tag=Track    structured=false
deep-walk Builder/chord  = MISS
```

Stripped-#3 probe (the load-bearing evidence; proves the chord arm + the rest
of the pipeline already work — only the shape-fence blocks):

```
stripped-#3 whole-program tag=Track bare=false
body.tag=Pick bare=false
deep-walk Builder/chord = HIT
  hit.args="\"Am Am\""
```

**Implication:** removing the `all(x=>x.punchcard())` line from #3 BY-HAND
flips it STRUCTURED. The filter (D-02) reproduces that effect mechanically.
Confidence: **HIGH (RUN).**

### 3.2 Backlog probes — {#156, #159, #149, #147, #153}

**N=50 baseline (`result-2026-05-19T20-17-24-486Z.json`, GREP'd):** the 4
non-structured rows are:

```
-6c1hEXe8Agi  code  | //@title 409                       ← #158 (target — shape-fence)
-1j62z5xjyCN  code  | //"Riding the 46 Cycles" @by …     ← #141/#140 (binding-ref-outside-stack-bare-arg)
-7LU6zgzViSM  code  | typeof setDefaultVoicings !== …    ← #143 (guarded-boot — already shipped, not in this set)
-G2drHRNFueu  code  | sound ("hh hh hh hh")              ← #159 (multi-top-level / tokenizer-space)
```

Wave-0 probe template — for EACH of {#156, #159, #149, #147, #153}:

```ts
const fixture = readSampleByHash(HASH)     // from samples-2026-05-19T20-17-24-486Z.json
const ir = parseStrudel(fixture.code)
const stmts = splitTopLevelStatements(stripParserPrelude(fixture.code).body, 0)
const sideEffectIdx = stmts.findIndex(s => isCuratedSideEffectStmt(s.text))
const bindingCount = stmts.filter(s => BINDING_RE.test(s.text)).length

// Class A — shape-fence (in-scope bonus close):
//   sideEffectIdx between [bindingCount, stmts.length-2)
//   AND stmts[stmts.length-1] is a non-binding pattern expression
//   AND no other classes apply

// Class B — multi-top-level-expr (=#153 / =#159 likely):
//   2+ depth-0 non-binding statements at top level WITH neither being a
//   recognised curated side-effect token

// Class C — guarded-boot (=#143 — already shipped via GUARDED_BOOT_RE)

// Class D — tokenizer/whitespace (=#159 candidate):
//   firstLine matches /\w+\s+\(/ where the identifier-space-paren breaks a
//   chain-root match (the bug is UPSTREAM of buildBindingMap; tokenizer fence)

// Class E — Hydra/external (=#156): non-Strudel embedded; correctly out of scope

// Class F — binding-ref-outside-stack-bare-arg (=#141/#140): a binding-name
//   appearing as a non-stack root that buildBindingMap doesn't substitute
```

**Disposition rule per CONTEXT D-03:** any non-Class-A row stays backlog
(re-pose with EVIDENCE if expected-class is contradicted; PK18 step 3-6).

**Pre-classification (INFERRED — must be promoted to RUN at Wave 0):**

| Issue | Pre-classified class | Confidence | Disposition if confirmed |
|---|---|---|---|
| #156 `-HyFCSbuSlq5` Hydra mashup | E (external) | HIGH (20-18 R-1 + SUMMARY classified NOT-folded) | backlog |
| #159 `-G2drHRNFueu` `sound (...)` | D (tokenizer-whitespace) OR B (multi-top-level) | MEDIUM | backlog |
| #149 `-?` template-literal root + `.cpm(binding)` | F (chain-root recognition outside curated set) | MEDIUM-LOW | backlog |
| #147 `-?` `samples()` capture / side-channel registration | ? (not shape-fence — it is a side-CHANNEL want, not a shape-fence cause) | LOW | backlog |
| #153 `-?` multi-top-level-expr | B (multi-top-level) | MEDIUM | backlog |

**Action for executor:** Wave 0 of the plan vendors the fixture for each (if
not already on disk), runs the probe, and writes the table verbatim into
`20-19-OBSERVATIONS.md`. ANY row that classifies SHAPE-FENCE is a bonus
close; ANY row that defies the pre-classification is a PK18 re-pose (D-03
locked the strict scope on the EVIDENCE-OF-CLASS, not on inference).

**Anti-pre-classification note:** P70 occurrence-3,4,5,6 all show pre-class
guesses are falsifiable. Treat the table above as a hypothesis, the probe as
the gate.

## 4. R-3 — Filter implementation shape (D-02 surgery site)

### 4.1 Two candidates

**Candidate A — inline filter in `buildBindingMap` preamble:**

```ts
// parseStrudel.ts ~ line 492
function buildBindingMap(body, baseOffset) {
  let stmts = splitTopLevelStatements(body, baseOffset)
  // NEW: filter recognised side-effect statements BEFORE shape guard.
  stmts = stmts.filter(s => !isCuratedSideEffectStmt(s.text))
  if (stmts.length < 2) return null
  // ... existing loop unchanged
}
```

**Candidate B — standalone helper called at the same site:**

```ts
// parseStrudel.ts (new helper near splitTopLevelStatements ~ line 482)
function stripSideEffectStatements(
  stmts: { text: string; offset: number }[]
): { text: string; offset: number }[] {
  return stmts.filter(s => !SIDE_EFFECT_CALL_RE.test(s.text))
}

// buildBindingMap preamble (~ line 492)
const stmts = stripSideEffectStatements(
  splitTopLevelStatements(body, baseOffset),
)
if (stmts.length < 2) return null
```

### 4.2 Recommendation: **Candidate B (standalone helper)**

**Rationale (INPUT FOR PLANNER, not a re-decision of D-02):**

1. **Testability** — Candidate B exposes the recogniser as a named function
   that can be unit-tested in isolation (`__tests__/parseStrudel.stripSideEffectStatements.test.ts`).
   Candidate A buries the recogniser inside `buildBindingMap`, requiring
   end-to-end fixtures for every member of the curated set.
2. **#147 future-expandability** — D-02 RATIONALE notes #147 (`samples()`
   capture / side-channel) is the natural future expansion: that phase
   would extend `stripSideEffectStatements` to ALSO emit a side-channel
   instead of discarding, while the consuming site `buildBindingMap` stays
   ignorant. Candidate B isolates the future surface; Candidate A spreads
   it across multiple call paths once `parseStrudel.ts:660` callsite or
   `extractTracks`'s per-track equivalent ever needs the same strip.
3. **Mirrors `stripParserPrelude` (pS:163-331)** — the precedent is an
   EXPORTED named helper, not an inlined regex test. Same idiom, same
   shape, same comment-block. Candidate B matches the existing pattern;
   Candidate A diverges.
4. **One CI fixture per token** maps cleanly to one test calling
   `stripSideEffectStatements([...])` with the token's representative
   statement. The 20-14 V-3 / 20-18 V-2 cadence is preserved.

**Constraint either way:** the regex (or per-token loop) MUST anchor to
**statement-text-head** (analogous to `PRELUDE_CALL_RE` which anchors with
`/^[ \t]*…/`) so leading whitespace inside the stmt text doesn't break the
match. `splitTopLevelStatements` already trims (`raw.trim()` at pS:396) —
so the stmt text starts with the token directly, no leading whitespace
unless the trim itself is wrong (which 20-18 V-2 already audited).

### 4.3 Provenance comment block (REQUIRED by precedent)

Following `PRELUDE_CALL_RE` (pS:167-194) and `GUARDED_BOOT_RE` (pS:211-227)
the new helper MUST carry a HAND-MAINTAINED provenance block citing:

- Codeberg pin SHA `f73b395648645aabe699f91ba0989f35a6fd8a3c` (same as
  `CORPUS-SOURCE.md`).
- For each token: `pkg/path/file.mjs:LINE` + return type.
- Anti-drift mechanism: one CI fixture per token (V-2 cadence).
- A note that the local version is `@strudel/core@1.2.6` /
  `@strudel/webaudio@1.3.0` / `superdough@1.3.0` and that `controls.mjs`
  line-number citations in 20-18 corroborate the 1.2.6 baseline.

The regex shape (template, EXACTLY mirroring `PRELUDE_CALL_RE`):

```ts
const SIDE_EFFECT_CALL_RE =
  /^(?:all|samples|setcps|setCps|setcpm|setCpm|useRNG|setVoicingRange|initAudio|aliasBank)\s*\(/
```

Note: anchor is `^` not `^[ \t]*` because stmt text from
`splitTopLevelStatements` is already trimmed (pS:396). One char shorter
than `PRELUDE_CALL_RE`. PLAN can mirror `^[ \t]*` defensively (zero
behavioural delta on trimmed input). Confidence: **HIGH (GREP)**.

## 5. R-4 — Multi-line side-effect-call shape

### 5.1 Question

Does `splitTopLevelStatements` emit a multi-line `samples({ a: …, b: …, })` or
multi-line `all(x => x.punchcard())` as ONE statement (depth-walker collapses
internal newlines) or as MANY (newline at depth 0 flushes)?

### 5.2 Source-read (GROUNDED — parseStrudel.ts:443-477)

```
443:    if (depth === 0 && ch === ';') { flush(i); ... }
450:    if (depth === 0 && ch === '\n') {
451:       // ASI / line-continuation aware (#148, PK16 stage-0.5 input)
452:       ...
467:       // (a) leading `.` peek — chain continuation
468:       // (b) trailing `=` peek — binding RHS continuation
473:       flush(i)
474:    }
```

The flush at depth-0 `\n` is suppressed ONLY by (a) chain-continuation peek
or (b) `=` continuation. The opening `(` of a multi-line call raises `depth`
to 1 (pS:433-436), so every newline INSIDE the call body is at depth ≥ 1 and
is NOT a flush trigger. The closing `)` returns depth to 0; the NEXT depth-0
newline flushes.

**Verdict:** multi-line `samples({...})` or `all(x => x.punchcard())` is
**ONE statement** in the stmts array; the stmt text contains internal
newlines. Confidence: **HIGH (source-read)**.

### 5.3 Implication for regex

The regex anchors to STMT-HEAD, not LINE-HEAD. The token + opening `(` MUST
appear at the start of the stmt text (after trim). The CALL BODY (which may
span newlines) is in the rest of the stmt text and is NOT inspected by the
regex — the depth-walker already consumed it correctly. Confidence: **HIGH**.

**Canonical exemplar #3 trace:**

```
splitTopLevelStatements produces (depth-0-newline-separated):
  stmt[0]   "let crackles = …"        (multi-line binding via `=`-peek)
  stmt[1]   "let padsbell = chord(\"Am Am\").voicing().sound(\"…\")…"
  …
  stmt[N]   "let outro = stack(\n    padsbell, deadchoir, …\n  )"
  stmt[N+1] "all(x=>x .punchcard())"  ← SIDE EFFECT (single-line in this src)
  stmt[N+2] "\"< 0!8 1!12 …>\".pick([intro, core1, …])"  ← FINAL
```

After the new filter, stmts becomes `[stmt[0..N], stmt[N+2]]` — a clean
`bindings*, finalExpr` shape; `buildBindingMap`'s existing shape-guard at
`pS:534` (`finalIdx !== stmts.length - 1`) PASSES; the fixpoint resolves all
N bindings; `parseExpression(stmts[N+2].text, stmts[N+2].offset)` parses the
`.pick([...])` chain into the proved-correct Pick/Stack/chord IR.

## 6. R-5 — Loc-fidelity safety (PV49 substrate)

### 6.1 The invariant

`splitTopLevelStatements` populates each emitted stmt with `offset =
baseOffset + segStart + leadingWhitespace` (pS:396). This is the BYTE-EXACT
absolute index in ORIGINAL source where the stmt's text begins.

### 6.2 The filter operation

`filter()` REMOVES items from the array. The REMAINING items keep their
`offset` UNCHANGED. The original source string is NEVER touched.

### 6.3 Downstream consumers of stmt offsets

Inside `buildBindingMap`:

- `pS:528` — `rhsOffset = offset + rhsStartInText` — computed from the stmt's
  own `offset`. Filter has no effect.
- `pS:555` — `parseExpression(d.rhs, d.rhsOffset, …)` — uses the per-stmt
  computed offset. Filter has no effect.
- `pS:593-594` — `finalExpr: stmts[finalIdx].text, finalOffset:
  stmts[finalIdx].offset` — `finalOffset` is whatever the (filtered) array's
  last stmt carries, which is the byte-exact offset into ORIGINAL source.

**Net:** every offset that flows out of `buildBindingMap` after the filter
is BYTE-IDENTICAL to what would have flowed if the user had hand-deleted
the side-effect line. The filter is **loc-additive by construction**.

### 6.4 The cross-wave loc-fidelity STOP gate

`packages/app/tests/parity-corpus/loc-fidelity.test.ts` (line 92,
describe block) iterates every fixture and asserts every IR `loc` slices
into source byte-exact. The phase-V STOP gate (per CONTEXT) is: every
parity-UNCHANGED fixture must produce ZERO loc-fidelity snapshot diff. The
ONLY moving fixtures Wave V will allow are (a) #3's whole-program flip (the
canonical exemplar — already in baseline; flips bareCode → structured); (b)
any Wave-0-classified-as-shape-fence backlog row (D-03 bonus close); (c)
the new CI fixture vendored under V-2 for the new tokens (the 20-14 V-3 /
20-18 V-2 cadence).

**PV49 carries by construction.** Confidence: **HIGH (source-read +
PV49 substrate prior art)**.

## 7. R-6 — Locked-STOP marker exact location

**GREP'd at `packages/app/tests/parity-corpus/_waveC-grounding.spec.ts:155`:**

```ts
expect(struct3, '#3 PK18 STOP locked — whole-program still bare due to buildBindingMap shape gap; remove this assertion when the backlog fix lands').toBe(false)
```

(Test name: `_waveC-grounding.spec.ts > "[name not yet grep'd, but it is the
final assertion of the only `test()` in the file — line 90/91 area]"`.)

The Wave V flip is the ONE-CHARACTER change `false` → `true`. The diagnostic
message embedded in the assert is the gate's documentation of intent ("remove
this assertion when the backlog fix lands"); the Wave V commit body must
explicitly cite that the assertion's message-anchor is satisfied.

**Companion assertions in same file (lines 140-143) are POSITIVE-controls
that must STAY GREEN unchanged:**

```ts
expect(struct7, '#7 must flip whole-program STRUCTURED').toBe(true)
expect(hit7, '#7 must deep-walk to {tag:Builder, kind:arrange}').toBeTruthy()
expect((hit7 as AnyNode).body, '...').toBeUndefined()
```

These are 20-18 Wave-C invariants; the Wave V crit-1 flip touches ONLY line
155. Confidence: **HIGH (GREP'd)**.

The companion `_waveC-diagnose.spec.ts` references `-6c1hEXe8Agi` at three
points (lines 30, 68, 89) — these are diagnostic snapshots (Pass 1/2/3
classification) that document the pre-fix shape. They are NOT gates. Wave V
re-runs them to confirm the per-binding RHS tag census in §1.3.6 (20-18
OBSERVATIONS lines 1106-1131) holds post-fix; ANY of the 21 census rows
flipping back to `bare=true` is a PK18 STOP.

## 8. R-7 — Gate measurement plan

### 8.1 The dual gate commands (RUN order; per CONTEXT D-04)

```bash
# Editor full pass (must hold at 1627/1627)
pnpm --filter @stave/editor test

# App full pass (must hold at 387/387 — includes parity 36 + loc-fidelity 36)
pnpm --filter @stave/app test

# Wave-C grounding probe (the crit-1 flipper) — explicit config
pnpm --filter @stave/app test -- --config vitest.waveC.config.ts

# Fresh parity bakery measurement (PK17 step-6; new ISO stamp)
pnpm --filter @stave/app parity:bakery -- --n 50
# OR: pnpm parity:bakery --n 50  (root-level alias; confirm in package.json before commit)
```

### 8.2 Crit-1 (HARD)

```
_waveC-grounding.spec.ts:155 — `expect(struct3, …).toBe(true)` PASSES
#3 -6c1hEXe8Agi whole-program:
  body.tag === 'Pick'                       (the pick-pattern root)
  deep-walk for tag === 'Builder' && kind === 'chord' returns AT LEAST ONE HIT
    with args === '"Am Am"'                 (the chord arm — proved 20-18 Wave C)
  the 2781-char bareCode body NO LONGER appears
```

### 8.3 Crit-2 (HARD)

```
Fresh stamp samples-<NEW-ISO-TIMESTAMP>.json
UPSTREAM_SHA == f73b395648645aabe699f91ba0989f35a6fd8a3c (must equal baseline)
result-<NEW-ISO>.json:
  total == 50
  structured >= 47    (≥94.0%; +1 from #3 flipping; could be more if any
                       Wave-0 backlog row also classifies SHAPE-FENCE and
                       closes — bonus, not required)
  structured >= 46    (must-not-regress 92.0% floor; if structured is
                       between 46 and 47 inclusive AND #3 flipped, that's
                       a NEW regression elsewhere → PK18 STOP per D-04)
```

### 8.4 Arithmetic floor

```
46/50 = 92.0%  baseline (must-not-regress)
47/50 = 94.0%  expected (#3 flipped alone)
48/50 = 96.0%  bonus (one backlog row classified SHAPE-FENCE)
```

Any value < 46 is a regression even with #3 flipped → STOP, classify
regression, re-pose D-04 to user with EVIDENCE; NEVER amend the floor down
(the 20-18 AMENDMENT-2 precedent: amend SCOPE on EVIDENCE; NEVER amend the
FLOOR).

### 8.5 Artifact verification (post-merge — 20-18 V-4 cadence)

Per `feedback_stacked_pr_base_retarget.md` + the 20-18 V-4 recipe:

```bash
# Confirm PR head ancestry on real main
git merge-base --is-ancestor <PR-HEAD-SHA> origin/main && echo OK

# Confirm dist/index.js contains the new string-literal anchors
pnpm --filter @stave/editor build
grep -c "'all'\|\"all\"" packages/editor/dist/index.js   # > 0
grep -c "stripSideEffectStatements\|SIDE_EFFECT_CALL_RE" packages/editor/dist/index.js  # > 0
                                                          # (NOTE: tsup-minified name; if pkg uses
                                                          #  minification, the literal "samples"
                                                          #  is still present as it's INSIDE the
                                                          #  regex literal which tsup preserves)
```

### 8.6 The commit-message protocol

`git -c commit.gpgsign=false commit -q -F - <<'MSG' … MSG` (single-quoted
heredoc; the zsh-`-m`-backtick trap recurred 2× in 20-16 per
`feedback_commit_msg_heredoc.md`). NEVER `-m` for multi-line bodies.

### 8.7 P68 watch-mode warning

`tsup --watch` is unreliable (P68 catalogue entry). Before EVERY editor-src
commit: `pnpm --filter @stave/editor build` ONE-SHOT + grep the new string
literal in `dist/index.{js,d.ts}`. The `@strudel/mondo` TS7016 is a known
benign warning; distinguish from real errors.

## 9. R-8 — Pre-mortems (top 5 failure paths)

### Pre-mortem 1 — Token in the curated set returns a Pattern (NOT pure-side-effect)
- **Catalogue:** P69 (grounded-LOOKING inference)
- **Class:** the curated list filters out a statement whose return value
  the user actually CONSUMES (RHS of an `=`); the user's IR loses the
  consumed binding silently.
- **Early observation (Wave-A pre-build):** §R-1 audit table — every row
  was source-read; none return a Pattern usable as a binding RHS. The
  `silence` return for `all`/`each`/`setCps`/`setCpm` is ONLY at
  statement-level discard; if a user wrote `let x = all(f)`, the regex
  would not match (the stmt text starts with `let`, not `all`). **MIT:**
  the regex requires the stmt to begin with the token directly — bindings
  are anchored by `let|const|var` per BINDING_RE (pS:484), which matches
  FIRST in `buildBindingMap`'s loop. Filter applies AFTER. ZERO risk of
  ambiguity.
- **Recovery:** if observation Wave 0 falsifies the table for any token →
  remove that token from the regex → re-grep `dist/index.js` → re-RUN
  Wave V.

### Pre-mortem 2 — Wave-0 backlog probe surfaces a NEW class (P70 occurrence 7)
- **Catalogue:** P70 (cascade classification can be wrong)
- **Class:** one of {#156, #159, #149, #147, #153} parses NOT as
  pre-classified — e.g. #159 turns out to be SHAPE-FENCE (the
  `sound (...)` whitespace bug fires inside `splitTopLevelStatements` but
  the row's body actually contains a side-effect followed by a final).
- **Early observation:** Wave 0 RUNS the probe BEFORE any code change.
  If a backlog row classifies SHAPE-FENCE → bonus close (D-03 in-scope);
  if a backlog row defies pre-classification AND is NOT shape-fence →
  PK18 STOP, re-pose D-03 to user with EVIDENCE.
- **Recovery:** STOP; record verbatim in 20-19-OBSERVATIONS; re-pose; do
  not scope-expand into the un-anticipated class.

### Pre-mortem 3 — Wave-0 reveals the filter ALONE does not flip #3
- **Catalogue:** P50 (workaround cascade — adding a second mechanism)
- **Class:** the filter applied, but #3 still bareCode for an
  un-anticipated upstream reason (e.g. `splitTopLevelStatements` splits the
  `all(x=>x .punchcard())` line differently than 20-18's analysis
  predicted).
- **Early observation:** the canonical-exemplar acceptance test
  `_waveC-grounding.spec.ts:155` flip is a one-line oracle. Run it BEFORE
  the full gate.
- **Recovery:** if the flip-check fails → STOP; the filter premise is
  falsified; do NOT add a second workaround (a P50 trap). Re-pose D-01
  (the curated-set MEMBERSHIP) or D-02 (the SITE) to user with the trace.

### Pre-mortem 4 — Loc-fidelity drift on a non-allow-list fixture
- **Catalogue:** PV49 (loc-additivity)
- **Class:** a corpus fixture (NOT in the {#3-related, V-2-new-fixture}
  allow-list) shifts its loc-fidelity snapshot. Means: the filter
  accidentally affected a statement OFFSET (which §R-5 proves cannot
  happen by construction).
- **Early observation:** `pnpm --filter @stave/app test` includes
  `loc-fidelity.test.ts`; the snapshot diff is the loud signal. Per-file
  STOP gate.
- **Recovery:** STOP; the filter mutated something it shouldn't have (a
  PV49 violation); revert; re-derive.

### Pre-mortem 5 — Crit-2 dual-gate failure: #3 flipped BUT parity < 92%
- **Catalogue:** PK18 (HARD-GATE cascade discipline) + P70 (classification
  wrong about WHY)
- **Class:** #3 PASSES crit-1 (the unit test) but the fresh parity
  measurement comes in below 92% — meaning the filter caused a regression
  on some OTHER row that 20-18 had structured.
- **Early observation:** the dual-gate is the LAST step; per-row classify
  diff between baseline `result-2026-05-19T20-17-24-486Z.json` and
  the new stamp surfaces the exact regressing row.
- **Recovery:** STOP; classify the regressing row (likely: it had a stmt
  whose head matched a curated token but whose return value the
  surrounding code consumed — i.e. the filter dropped a stmt that wasn't
  actually pure-side-effect from THAT site's perspective). Re-pose D-01
  membership with the trace; do NOT bar-lower the floor.

## 10. Anticipated gray areas surfaced by RESEARCH

None requiring user re-pose. D-01..D-04 are sufficient. The two minor
flagged items (recorded for transparency, NOT re-pose-blocking):

- **`each` adjacency to `all`** (§2.1) — identical class, not in CONTEXT
  list. Researcher recommends LEAVE OUT this phase (D-03 strict); add via
  next-phase backlog if a corpus row triggers. Wave 0 probe table will
  flag if any of {#156, #159, #149, #147, #153} contains an `each(...)`
  statement → if YES → re-pose to user; if NO → out-of-scope, fine.

- **Local @strudel/* version delta vs Codeberg SHA `f73b3956`** (§2)
  — 20-18 Wave C noted the same delta and the `controls.mjs` line numbers
  corroborated 1.2.6. Same posture this phase. The per-token CI fixture
  IS the anti-drift mechanism. No re-pose needed; the SHA pin in the
  provenance block + the CI fixture make the audit reproducible.

**Conclusion:** no new gray areas — D-01..D-04 sufficient for executor +
planner to proceed.

## 11. Wave skeleton suggestion (input to planner; NOT a re-decision)

```
Wave 0 — Vendor + probe (D-03 classification gate)
  - Confirm baseline counts hold (editor 1627, app 387, parity 92.0%).
  - Vendor missing fixtures for {#156, #159, #149, #147, #153} if not on disk.
  - RUN parseStrudel + splitTopLevelStatements + isCuratedSideEffectStmt
    classification on EACH; record verbatim in 20-19-OBSERVATIONS.md.
  - If any backlog row classifies SHAPE-FENCE → add to in-scope set (bonus
    close); else → stays backlog.
  - Gate: NO new code yet. Output is a classification table.

Wave 1 — Implement stripSideEffectStatements + wire into buildBindingMap
  - New helper near pS:482 with full provenance block (Codeberg SHA pin,
    per-token file:line citations, anti-drift CI fixture marker).
  - Call site: pS:492 preamble — `const stmts =
    stripSideEffectStatements(splitTopLevelStatements(body, baseOffset))`.
  - Zero other change to buildBindingMap loop, fixpoint, occurs-check, or
    shape guard.
  - P68: pnpm build editor; grep `dist/index.js` for `'all'` and
    `'samples'` literals (both surface in the regex literal); confirm > 0.

Wave 2 — Unit test the helper in isolation
  - __tests__/parseStrudel.stripSideEffectStatements.test.ts (new):
    - For EACH token in the curated set: one CI fixture stmt that the
      regex matches AND one fixture stmt that should NOT match (false-
      positive guard, e.g. `let allChords = ...` → does NOT match).
    - One round-trip fixture proving the filtered array reaches
      buildBindingMap with the correct shape for #3.

Wave 3 — Wave-V flip (the crit-1 gate)
  - _waveC-grounding.spec.ts:155: `toBe(false)` → `toBe(true)`.
  - _waveC-diagnose.spec.ts (lines 30/68/89): no semantic change but
    re-run; the per-binding RHS tag census remains the same (all 21 rows
    still non-bareCode).
  - Update the assertion's diagnostic message to reflect "FLIP RECORDED"
    (or remove the locked-STOP wording per its own comment "remove this
    assertion when the backlog fix lands").

Wave 4 — Add V-2-cadence CI fixtures
  - One vendored fixture per ship-list token (10 total). Faithful-distillation
    template per 20-18 V-2 BAKERY-FIXTURES.md provenance discipline.

Wave V — Dual gate measurement
  - pnpm --filter @stave/editor test (≥ 1627)
  - pnpm --filter @stave/app test (≥ 387; parity-corpus + loc-fidelity)
  - pnpm parity:bakery --n 50 → fresh ISO stamp; structured ≥ 47 (≥94.0%)
  - artifact verification (R-7 §8.5)
  - commit via single-quoted heredoc (R-7 §8.6); gitmoji `:sparkles:`
  - PR + audit trail (NOT merged by Claude per AnviDev)
```

(Planner refines / re-orders / adds per-wave verify steps; the above is a
suggested skeleton, not the plan.)

## 12. Confidence summary

| Section | Confidence | Basis |
|---|---|---|
| §R-1 curated-token audit | HIGH | All 10 tokens source-read at exact file:line; returns confirmed. |
| §R-2 Wave-0 probe shape | HIGH (template); MEDIUM-LOW (pre-classification) | Probe is a one-line `parseStrudel` call; classification is INFERRED until Wave-0 RUNS each. |
| §R-3 filter site (Candidate B) | HIGH | Mirrors `stripParserPrelude` precedent; testability + #147 future. |
| §R-4 multi-line shape | HIGH | source-read of `splitTopLevelStatements` depth-walker. |
| §R-5 loc-fidelity safety | HIGH | filter operates on array, not source string; PV49 substrate carries. |
| §R-6 locked-STOP marker | HIGH | grep'd at exact file:line. |
| §R-7 gate plan | HIGH | reuses 20-18 V-4 + PK17 step-6 cadence verbatim. |
| §R-8 pre-mortems | MEDIUM | extrapolation from catalogue P50/P69/P70 — concrete recoveries cited. |
| §10 gray areas | HIGH | none requiring re-pose. |

**Overall confidence: HIGH** on the recommended curated set, filter site,
loc-fidelity safety, and gate plan. The MEDIUM items (pre-classification of
backlog rows, pre-mortem severity) are explicitly flagged for Wave-0
RUN-promotion, which is the D-03 directive itself.

## 13. Load-bearing artefacts (paths for executor)

- `packages/editor/src/ir/parseStrudel.ts:486-595` — surgery site
  (`buildBindingMap` preamble at pS:492 is the EXACT integration point)
- `packages/editor/src/ir/parseStrudel.ts:163-331` — `stripParserPrelude`
  prior art (the named-helper + provenance idiom to mirror)
- `packages/editor/src/ir/parseStrudel.ts:195-196` — `PRELUDE_CALL_RE`
  regex shape to mirror
- `packages/app/tests/parity-corpus/_waveC-grounding.spec.ts:155` — the
  crit-1 locked-STOP flip site
- `packages/app/tests/parity-corpus/_waveC-diagnose.spec.ts:30,68,89` —
  the per-binding RHS census (must remain green post-fix)
- `packages/app/tests/parity-corpus/.bakery-runs/samples-2026-05-19T20-17-24-486Z.json`
  — baseline samples (LOCAL, gitignored; contains #3 + #159 verbatim)
- `packages/app/tests/parity-corpus/.bakery-runs/result-2026-05-19T20-17-24-486Z.json`
  — baseline result (LOCAL, gitignored; the 4 fallback rows)
- `packages/app/tests/parity-corpus/loc-fidelity.test.ts:92` — the
  per-fixture loc-fidelity snapshot harness
- `packages/app/tests/parity-corpus/BAKERY-FIXTURES.md` — V-2 fixture
  vendoring convention
- `~/.anvideck/projects/struCode/ref/GROUND_TRUTH_SIGNAL_MJS.md` —
  existing Ground Truth doc (20-18 Wave C seed)
- `node_modules/.pnpm/@strudel+core@1.2.6/node_modules/@strudel/core/repl.mjs:117,132,153,164,209-219`
  — `setCps`/`setCpm`/`all`/`each` definitions + `evalScope` injection
- `node_modules/.pnpm/@strudel+core@1.2.6/node_modules/@strudel/core/signal.mjs:279`
  — `useRNG` export
- `node_modules/.pnpm/@strudel+tonal@1.2.6/node_modules/@strudel/tonal/voicings.mjs:87`
  — `setVoicingRange` export
- `node_modules/.pnpm/superdough@1.3.0/node_modules/superdough/sampler.mjs:249`
  — `samples` export
- `node_modules/.pnpm/superdough@1.3.0/node_modules/superdough/superdough.mjs:132,259`
  — `aliasBank` and `initAudio` exports

---

**Routing:** `/anvi:plan-phase 20-19` consumes this research note.
