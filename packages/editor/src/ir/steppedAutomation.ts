/**
 * Stepped automation a track declares, read off the static IR (#1463 Stage 1).
 *
 * `.gain("<0.2 0.8>")` is a parameter that holds one value per cycle and moves
 * between them — the stepped class, next to #1464's continuous one. It already
 * parses completely: `Param{value: Cycle{items: [Play "0.2", Play "0.8"]}}`, with
 * an exact source span on every step. This module turns that into what a lane
 * needs to DRAW it, and into the one edit a lane may make to it.
 *
 * WHAT THE ENGINE DOES WITH IT, measured through the real evaluator before any of
 * this was written (#1463, the grounding comment on the issue):
 *
 *   `<a b>`        cycle n plays step (n mod 2)          → period 2
 *   `<a@2 b>`      a weighted step spans 2 cycles         → period 3
 *   `<a b>/2`      every step spans 2 cycles              → period 4   (#1579)
 *   `<a b>/1.5`    a step changes INSIDE a cycle          → not stepped
 *   `<a [b c]>`    the second step SUBDIVIDES its cycle   → not stepped
 *   `<a ~ b>`      the `~` step SILENCES THE TRACK        → not "no value"
 *
 * ⚠ A STEP IS ADDRESSED BY ITS INDEX, NOT BY A BAR. Step k plays in every cycle
 * where `cycle mod period` selects it, so an edit to step k changes every bar that
 * plays it — which is what the document says. A lane that pretended to change one
 * bar would be describing a document nobody wrote.
 *
 * ⚠ `cycle mod period` HOLDS ONLY WHERE NOTHING ABOVE THE PARAMETER MOVES TIME
 * (#1584). `.slow(2)`, `.early(1)`, `cat(…)` and an `arrange` section all hand the
 * parameter a different cycle than the song's — a section sees how many cycles IT
 * has played. This was once recorded as "an arrange arm follows the absolute
 * cycle", from `arrange([1, a], [2, b])`: a section two cycles behind per pass,
 * which a two-step pattern cannot tell apart. `[3, a], [1, b]` can. So the walk
 * admits a parameter only under nodes measured to leave the cycle alone.
 *
 * Mirrors `signalAutomation.ts`: pure and structural, no eval, no source
 * scanning, the same per-track attribution, and the same direction of error —
 * ABSTAIN rather than approximate. A missing lane shows less than it could; a
 * wrong one is the editor lying about what plays.
 */
import type { PatternIR } from './PatternIR'
import type { SourceLocation } from './IREvent'

/** One step of a stepped parameter. */
export interface SteppedStep {
  /** The value this step holds, as a number. */
  readonly value: number
  /**
   * How many CYCLES the step holds for — its `@n` (else 1) times the literal's
   * `/n` (else 1). A positive integer. Not the written `@n`: `<0.2@2 0.8>/2`
   * holds its first step for 4 cycles (#1579).
   */
  readonly weight: number
  /** The cycle, within one period, at which this step begins. */
  readonly startCycle: number
  /** Where the number is spelled — the whole of what a value edit replaces. */
  readonly valueSpan: SourceLocation
}

/** One drawable, editable stepped automation. */
export interface SteppedAutomation {
  /** The lane this belongs to — the same `trackId` `signalAutomations` keys on. */
  readonly trackId: string
  /** The CANONICAL control: `.lpf(...)` reads as `cutoff`, as the engine names it. */
  readonly paramKey: string
  /** The method as the user TYPED it (`lpf`), for anything that shows a name. */
  readonly method: string
  readonly steps: readonly SteppedStep[]
  /** The sum of the weights — the cycles one full pass of the steps spans. */
  readonly periodCycles: number
  /** Source offset of the `Param` call site, or null. */
  readonly offset: number | null
}

const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)$/

/**
 * Read one `Param`'s value as steps, or decline.
 *
 * ⚠ ALL THREE QUOTES ARE STEPPED, and that was checked rather than assumed. The
 * transpiler turns double-quoted and backtick strings into mini calls; a
 * SINGLE-quoted one reaches `reify` as a plain string, and the engine's
 * `installMiniStringParser` then pattern-parses it when it is valid notation
 * (`engine/stringParser.ts`). So `.gain('<0.2 0.8>')` plays steps too — pinned by
 * `steppedAutomation.engine.test.ts` against the real transpiler, not by this
 * comment.
 *
 * ⚠ WHAT IS REQUIRED IS THAT THE ARGUMENT IS ONE STRING LITERAL AND NOTHING ELSE —
 * `rawArgs` opens and closes on the same quote. The parser reads the first
 * literal of `.gain("<0.2 0.8>" + "")` as the same `Cycle` it reads for the plain
 * spelling, but the transpiler turns each quoted string into a pattern before the
 * `+` runs, so the engine never plays those steps (engine test). A second
 * argument (`"<…>", 1`) is declined too: it plays, but it is not an argument a
 * lane can own.
 */
function readSteps(param: PatternIR & { tag: 'Param' }): SteppedStep[] | null {
  const value = param.value
  if (!value || typeof value !== 'object') return null
  // `<…>/n` (#1579): the parser wraps the alternation in ONE `Slow`, whose span is
  // the operator alone. A whole-number n stretches every step to `n` times its
  // weight and nothing more — measured through the engine for /2, /3, a weighted
  // step and three steps. A fractional n (`/1.5`, `/0.5`) changes the step INSIDE
  // a cycle, so there is no per-cycle value to draw and the parameter declines.
  //
  // ⚠ NO "n ≥ 1" CLAUSE, AND THAT WAS MEASURED. The parser builds a `Slow` only for
  // a positive factor: `/0`, `/0.0`, `/00`, `/-1`, `/-2.0` all parse to the bare
  // `Cycle`, which the whole-literal check below refuses (the engine plays nothing
  // for any of them). A `< 1` clause was written and broken alone; nothing went red.
  let stretch = 1
  let cycle: PatternIR = value
  if (value.tag === 'Slow') {
    if (!Number.isInteger(value.factor)) return null
    stretch = value.factor
    cycle = value.body
  }
  if (cycle.tag !== 'Cycle') return null
  const raw = param.rawArgs.trim()
  const quote = raw[0]
  // ONE literal: the next quote after the opening one is the LAST character.
  // Opening and closing on the same quote is not enough — `"<0.2 0.8>" + ""` does
  // both, and the first spelling of this check (first char === last char) passed
  // it. This single clause also refuses a second argument and an unterminated
  // literal, so there is no separate "ends with a quote" branch left for no arm to
  // defend (a break of that branch alone turned nothing red).
  if ((quote !== '"' && quote !== '`' && quote !== "'") || raw.indexOf(quote, 1) !== raw.length - 1) {
    return null
  }
  // From the `<` to the end of the `/n` when there is one — the `Slow`'s own span
  // starts at the operator, so the alternation supplies the start.
  if (!spansWholeLiteral(param, cycle, value)) return null

  const steps: SteppedStep[] = []
  let at = 0
  for (const item of cycle.items) {
    let weight = 1
    let body: PatternIR = item
    if (item.tag === 'Elongate') {
      // A fractional weight has no whole-cycle start, and the per-cycle reading
      // this lane exists to draw would have to invent one.
      if (!Number.isInteger(item.factor) || item.factor < 1) return null
      weight = item.factor
      body = item.body
    }
    // `~` silences the track and `[a b]` subdivides the cycle: neither is a
    // value held for a cycle, so the whole parameter declines rather than a lane
    // drawing a step the engine does not play.
    //
    // ⚠ This line NARROWS; the numeric test below is what DECLINES. A `Sleep` or
    // `Seq` carries no numeric `note`, so the number check refuses both on its
    // own — measured by breaking this line, which turned no arm red. It stays
    // because without it `.note`/`.loc` are not known to exist on `body`.
    if (body.tag !== 'Play') return null
    const text = String(body.note)
    if (!NUMBER.test(text)) return null
    const span = body.loc?.[0]
    if (!span || !Number.isFinite(span.start) || !Number.isFinite(span.end)) return null
    steps.push({ value: Number(text), weight: weight * stretch, startCycle: at, valueSpan: span })
    at += weight * stretch
  }
  return steps.length > 0 ? steps : null
}

/**
 * Whether the text from `first`'s start to `last`'s end is the WHOLE text inside
 * the argument's quotes (#1584). For a plain alternation both are the `Cycle`;
 * for `<…>/n` the start is the `Cycle`'s and the end is the `Slow`'s (#1579).
 *
 * ⚠ THE PARSER CAN DROP AN OPERATOR AND KEEP THE ALTERNATION. `"<0.2 0.8>/[2]"`
 * and `"<0.2 0.8>/<2 1>"` both parse to the bare `Cycle` of `"<0.2 0.8>"`, with no
 * trace of the division, and the engine still divides (engine test). The quote
 * check above cannot see it — both are one literal. The node's own span can: it
 * ends at the `>`, short of the text.
 *
 * ⚠ AND IT CAN DROP ONE OPERATOR OF TWO. `"<0.2 0.8>/2/2"` parses to ONE `Slow`
 * of 2 — the engine plays `/4` — and `"<0.2 0.8>/2@3"` to the same `Slow` with
 * the `@3` gone. Both `Slow`s end at the first `/2`, short of the text, so the
 * same check refuses them; `[<0.2 0.8>]/2` starts short at the `[` and is refused
 * too, a missing lane rather than a wrong one.
 *
 * Positions come from the parser, not from re-reading the mini grammar: the call
 * site runs from the `.` to past the `)`, and `rawArgs` is everything between the
 * parentheses, untrimmed — so the argument begins `rawArgs.length + 1` before the
 * call's end. Whitespace inside the quotes is allowed on either side; the engine
 * plays `" <0.2 0.8> "` as steps.
 */
function spansWholeLiteral(param: PatternIR & { tag: 'Param' }, first: PatternIR, last: PatternIR): boolean {
  const call = param.loc?.[0]
  const from = first.loc?.[0]
  const to = last.loc?.[0]
  if (!call || !from || !to) return false
  const raw = param.rawArgs
  const inner = raw.trim().slice(1, -1)
  const start =
    call.end - 1 - raw.length + (raw.length - raw.trimStart().length) + 1 + (inner.length - inner.trimStart().length)
  return from.start === start && to.end === start + inner.trim().length
}

/**
 * The nodes a stepped parameter may sit under and still play `cycle mod period`
 * (#1584). Anything else — a time transform, or a node the parser left opaque —
 * declines the parameter.
 *
 * Every entry is an arm in `steppedAutomation.engine.test.ts`, which checks the
 * reader's prediction against what the engine plays; every time-changing shape it
 * declines is an arm there too, showing the engine really plays something else.
 * `Track` is the root the walk starts from, and a control (`Param`) sets a value
 * without moving an event.
 *
 * ⚠ BY TAG, NOT BY METHOD, AND THAT WAS MEASURED. `parseStrudel` builds these tags
 * from a short, known set of calls: `Stack` from `stack`, `layer`, `jux` and `off`;
 * `When` from `mask`; `Degrade` from `degrade` and `degradeBy`; `Every` from
 * `every`; `Choice` from `sometimes` and `sometimesBy`; `Struct`, `Chop` and `Ply`
 * from the call of the same name. Only `off` moves time, and it builds its shift
 * as a `Late` inside the stack, where the walk sees it. A per-method list was
 * written first and break-tested: opening any tag to every method turned nothing
 * red, because no parsed document can reach a method the list left out. So a NEW
 * producer of one of these tags has to be measured before it is trusted here — a
 * call that moved time without putting a node in the tree would pass silently.
 *
 * ⚠ A METHOD THAT TAKES A FUNCTION (`every`, `sometimesBy`, `layer`, `jux`) IS SAFE
 * ONLY BECAUSE THE FUNCTION'S BODY IS IN THE TREE. `jux(x => x.fast(2))` reaches the
 * parameter a second time through a `Fast`, and that route declines it (see
 * `collect`). A function the parser cannot model is an opaque `Code`, which declines
 * too.
 */
const LEAVES_THE_CYCLE: ReadonlySet<string> = new Set([
  'Track',
  'Param',
  'Stack',
  'When',
  'Struct',
  'Degrade',
  'Chop',
  'Ply',
  'Every',
  'Choice',
])

const SKIP_KEYS: ReadonlySet<string> = new Set(['loc', 'keyLoc', 'callSiteRange'])

/** Every child IR node of `node`, found by reflection — the walk
 *  `signalAutomation.ts` uses, and its note says why reflection. */
function childNodes(node: PatternIR): PatternIR[] {
  const out: PatternIR[] = []
  const visit = (value: unknown, depth: number): void => {
    if (!value || typeof value !== 'object' || depth > 12) return
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1)
      return
    }
    if (typeof (value as PatternIR).tag === 'string') {
      out.push(value as PatternIR)
      return
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (SKIP_KEYS.has(key)) continue
      visit(child, depth + 1)
    }
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (SKIP_KEYS.has(key)) continue
    visit(value, 0)
  }
  return out
}

/**
 * Walk one track, recording for every `Param` it meets whether EVERY route to it
 * was clean: no same-key call above it, and nothing above it that moves time.
 *
 * ⚠ EVERY ROUTE, NOT THE FIRST. A function-taking method puts one node in the tree
 * twice over: `jux(x => x.fast(2))` reaches the same `Param` once through the
 * plain channel and once through a `Fast`. The first route alone is clean, and the
 * engine plays two different values in a cycle (engine test). So a node is walked
 * again whenever it is reached in a state it has not been walked in, and one dirty
 * route declines it.
 *
 * ⚠ `overridden` IS THE LOAD-BEARING ARGUMENT. Strudel's controls SET a value, so
 * the last call in a chain wins: `.gain("<0.2 0.8>").gain(0.5)` plays 0.5 on every
 * event (measured). In the IR the later call is the OUTER node, so a stepped
 * parameter is dead exactly when a same-key `Param` encloses it. That holds
 * through structure too — `stack(a.gain("<…>"), b).gain(0.5)` overrides the inner
 * steps (measured, engine test). Drawing them would show steps nobody hears, and
 * editing them would change nothing, silently. Keys are canonical, so `.cutoff`
 * over `.lpf` counts too.
 *
 * Every descendant of a Param inherits its key, not only its `body`. Only a
 * Param's VALUE could hold a Param the other way, and no document spells a
 * same-key stepped control inside another control's argument — a distinction no
 * input can exercise is a branch no test can defend, so it is not drawn.
 */
function collect(
  node: PatternIR,
  overridden: ReadonlySet<string>,
  timeMoved: boolean,
  clean: Map<PatternIR & { tag: 'Param' }, boolean>,
  seen: Map<PatternIR, Set<string>>,
): void {
  if (!node || typeof node !== 'object') return
  const state = `${timeMoved}|${[...overridden].sort().join(',')}`
  const states = seen.get(node) ?? new Set<string>()
  if (states.has(state)) return
  states.add(state)
  seen.set(node, states)

  let passDown = overridden
  if (node.tag === 'Param') {
    clean.set(node, (clean.get(node) ?? true) && !timeMoved && !overridden.has(node.key))
    passDown = new Set(overridden).add(node.key)
  }
  const childTimeMoved = timeMoved || !LEAVES_THE_CYCLE.has(node.tag)

  for (const child of childNodes(node)) {
    // A nested Track declares its own lane; its parameters are not this one's.
    if (child.tag === 'Track') continue
    collect(child, passDown, childTimeMoved, clean, seen)
  }
}

/**
 * Every stepped automation the document declares, by track, in the order the
 * walk meets them. Empty for a document with none, which is most of them.
 */
export function steppedAutomations(ir: PatternIR | null | undefined): readonly SteppedAutomation[] {
  if (!ir) return []
  const roots: readonly PatternIR[] = ir.tag === 'Stack' ? ir.tracks : [ir]
  const out: SteppedAutomation[] = []
  for (const node of roots) {
    if (node?.tag !== 'Track') continue
    const trackId = node.trackId
    if (typeof trackId !== 'string' || trackId.length === 0) continue
    const clean = new Map<PatternIR & { tag: 'Param' }, boolean>()
    collect(node, new Set(), false, clean, new Map())
    // In the order the walk first met each parameter.
    for (const [param, ok] of clean) {
      if (!ok) continue
      const steps = readSteps(param)
      if (!steps) continue
      const start = param.loc?.[0]?.start
      out.push({
        trackId,
        paramKey: param.key,
        method: param.userMethod ?? param.key,
        steps,
        periodCycles: steps.reduce((sum, s) => sum + s.weight, 0),
        offset: typeof start === 'number' && Number.isFinite(start) ? start : null,
      })
    }
  }
  return out
}

/**
 * Which step plays in `cycle` — the same selection the engine makes: the
 * position within the period, matched against each step's weighted start.
 * Negative cycles wrap like positive ones.
 */
export function stepIndexAtCycle(a: SteppedAutomation, cycle: number): number {
  const period = a.periodCycles
  const pos = ((Math.floor(cycle) % period) + period) % period
  for (let k = a.steps.length - 1; k >= 0; k--) {
    if (pos >= a.steps[k].startCycle) return k
  }
  return 0
}

/**
 * Turn "step `index` should hold `value`" into a source edit, or into NOTHING.
 *
 * Replaces that step's number and no other byte — its `@n`, its neighbours and
 * the user's spelling of every untouched step all survive. Returns null for an
 * index out of range, a non-finite value, or a value the step already holds
 * (compared as numbers, so `0.30` over `0.3` is no edit rather than a rewrite).
 *
 * ⚠ `String(value)`, not a formatter — the same reason `captionEdit` gives: there
 * is no arithmetic here to produce float noise, and a rounding formatter would
 * write a different number than the one asked for.
 */
export function stepValueEdit(
  a: SteppedAutomation,
  index: number,
  value: number,
): { range: [number, number]; text: string } | null {
  const step = a.steps[index]
  if (!step || !Number.isFinite(value) || value === step.value) return null
  const text = String(value)
  // ⚠ THE EDIT MUST WRITE A NUMBER THIS MODULE CAN READ BACK. `String` spells a
  // very large or very small number in exponent form (`1e+21`, `1e-7`), which
  // `NUMBER` declines — so the write would land, the engine would play it, and
  // the whole parameter would drop off its lane on the next read. One grammar,
  // checked on the way out as well as on the way in.
  if (!NUMBER.test(text)) return null
  return { range: [step.valueSpan.start, step.valueSpan.end], text }
}
