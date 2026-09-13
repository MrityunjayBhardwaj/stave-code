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
 * (#1584). `.slow(2)`, `.early(1)` and `jux(x => x.fast(2))` hand the parameter a
 * cycle no lane can draw, so the walk admits a parameter only under nodes measured
 * to leave the cycle alone.
 *
 * ⚠ AN ARRANGEMENT SECTION IS THE ONE TIME CHANGE A LANE CAN DRAW (#1585). An arm
 * of `arrange`, `cat` or `slowcat` hands the parameter how many cycles THAT SECTION
 * has played, so the walk records the section instead of declining, and
 * `stepIndexAtCycle` does the section's arithmetic. This was once recorded as "an
 * arrange arm follows the absolute cycle", from `arrange([1, a], [2, b])`: a
 * section two cycles behind per pass, which a two-step pattern cannot tell apart.
 * `[3, a], [1, b]` can. And a section that appears twice does NOT continue its
 * count — each appearance is its own arm, and both play the same steps in a pass
 * (engine test, on a three-step pattern where the two readings disagree).
 *
 * Mirrors `signalAutomation.ts`: pure, no eval, the same per-track attribution,
 * and the same direction of error — ABSTAIN rather than approximate. A missing
 * lane shows less than it could; a wrong one is the editor lying about what
 * plays. The walk over the track is structural, over the IR; a literal's STEPS are
 * read off krill's parse of that literal, the parse the engine itself runs, because
 * the IR's lowering flattens what decides them (#1587, `stepsOfLiteral`).
 */
import { parse as krillParse } from '@strudel/mini/krill-parser.js'
import type { PatternIR } from './PatternIR'
import type { SourceLocation } from './IREvent'
import { atomSpan, type KElement, type KPattern } from './parseMini'

/** One step of a stepped parameter. */
export interface SteppedStep {
  /** The value this step holds, as a number. */
  readonly value: number
  /**
   * How many CYCLES the step holds for — krill's weight for it (`@n`, `_` and `!n`
   * folded together; else 1) times the literal's `/n` (else 1). A positive
   * integer. Not the written `@n`: `<0.2@2 0.8>/2` holds its first step for 4
   * cycles (#1579), and `<0.3!3 0.8>` is two steps, the first held 3 (#1587).
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
  /**
   * Where the parameter plays, one entry per route to it: the arrangement sections
   * that route passes through, OUTERMOST FIRST (#1585). A parameter under no
   * section has one route through none — `[[]]` — and sees every song cycle as
   * itself. A binding arranged twice has two routes, one per appearance.
   */
  readonly placements: readonly (readonly SectionWindow[])[]
}

/** One arrangement section a stepped parameter plays inside (#1585): an arm of
 *  `arrange`, `cat` or `slowcat`, as a span of one pass of that arrangement. */
export interface SectionWindow {
  /** The cycle, within one pass, at which the section begins — the weights before it. */
  readonly startCycle: number
  /** How many cycles the section lasts — its own weight. */
  readonly cycles: number
  /** How many cycles one pass of the arrangement spans — every weight, summed. */
  readonly total: number
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
  const lit = literalOf(param)
  return lit ? stepsOfLiteral(lit.inner, lit.start) : null
}

/**
 * The text inside the argument's quotes, UNTRIMMED, and the source offset of its
 * first character — or null.
 *
 * Positions come from the parser: the call site runs from the `.` to past the
 * `)`, and `rawArgs` is everything between the parentheses, untrimmed — so the
 * argument begins `rawArgs.length + 1` before the call's end. The inner text keeps
 * its whitespace because krill's offsets count it (`" <0.2 0.8> "` is steps).
 */
function literalOf(param: PatternIR & { tag: 'Param' }): { inner: string; start: number } | null {
  const call = param.loc?.[0]
  if (!call) return null
  const raw = param.rawArgs
  const start = call.end - 1 - raw.length + (raw.length - raw.trimStart().length) + 1
  return { inner: raw.trim().slice(1, -1), start }
}

/**
 * The steps of one literal, read off KRILL's tree — the parse the engine runs on
 * the same string — or null.
 *
 * ⚠ NOT OFF THE IR (#1587). `parseStrudel` lowers krill's tree into PatternIR, and
 * the lowering flattens exactly what decides whether a literal holds one value per
 * cycle. Each of these came out as a `Cycle` of numeric Plays, and each plays
 * something else (engine test): `[1|1.5]` is a RANDOM pick, `<1 2, 3 4>` is two
 * layers, `<0.2 0.8:1>` plays the array `[0.8, 1]`. `<0.3!3 0.8>` became three
 * Plays on ONE span, so an edit to one of them moved all three copies' bars. The IR
 * also kept one `/2` of `/2/2` (which plays `/4`) and dropped `/0` entirely.
 * krill names every one of these. A check of the text between the IR's spans was
 * drafted first and set aside: it would have been a second copy of the grammar.
 *
 * The accepted shape, dumped from `@strudel/mini@1.2.6` rather than read off the
 * grammar:
 *
 *   fastcat ── ONE element: weight 1, reps 1, and no op but one `/n` (`slowFactor`)
 *    └ polymeter_slowcat ── ONE child (a second one is a `,` layer)
 *       └ fastcat ── one element per STEP: an atom whose token is a number
 *
 * A step holds `weight` cycles — krill folds `@n`, `_` and `!n` into that one
 * field, and the engine follows it: `<0.2!3@2 0.8>` has weight 4 and plays 0.2 for
 * four cycles (measured). Its only op may be `replicate`; anything else rides on the
 * step (`:` tail, `?` degrade, `(3,8)`, a per-step `*`) and changes what it plays.
 * `!n` is therefore ONE step — the one number the user wrote — and an edit to it
 * moves every cycle it holds.
 */
function stepsOfLiteral(inner: string, innerStart: number): SteppedStep[] | null {
  let root: KPattern
  try {
    root = krillParse('"' + inner + '"') as KPattern
  } catch {
    return null
  }
  // ⚠ ONE ELEMENT, NOT "A FASTCAT": `<0.2 0.8> 0.5` is a fastcat of two and plays two
  // values a cycle. A root that is not a fastcat (`a | b`, `a, b`) holds PATTERNS,
  // not elements, and fails the alternation checks below on its own — an alignment
  // clause here was broken alone and turned nothing red.
  if (root?.type_ !== 'pattern' || root.source_.length !== 1) return null
  const whole = root.source_[0]
  const stretch = slowFactor(whole)
  if (stretch === null || (whole.options_?.weight ?? 1) !== 1 || (whole.options_?.reps ?? 1) !== 1) return null

  const alt = whole.source_
  if (alt.type_ !== 'pattern' || alt.arguments_?.alignment !== 'polymeter_slowcat' || alt.source_.length !== 1) return null
  // A slowcat's child is a PATTERN, not an element (the krill AST reference), and
  // always a fastcat: `<0.2|0.8>` and `<0.2 . 0.8>` do not parse at all, in krill or
  // in the engine. A check of the child's alignment turned nothing red when broken.
  const arms = alt.source_[0] as unknown as KPattern

  const steps: SteppedStep[] = []
  let at = 0
  for (const el of arms.source_) {
    const atom = el.source_
    // `~` silences the track and `[a b]` subdivides the cycle: neither is a value
    // held for a cycle, so the whole parameter declines.
    //
    // ⚠ The number test is what DECLINES a group; the atom test only NARROWS. A
    // group's `source_` is an array, which no number matches — measured by breaking
    // the atom test, which turned nothing red. It stays so `source_` is a string.
    if (atom.type_ !== 'atom' || !NUMBER.test(atom.source_)) return null
    const weight = el.options_?.weight ?? 1
    // A fractional weight has no whole-cycle start, and the per-cycle reading this
    // lane exists to draw would have to invent one.
    if (!Number.isInteger(weight) || weight < 1) return null
    if (!(el.options_?.ops ?? []).every((op) => op.type_ === 'replicate')) return null
    const span = atomSpan(atom, inner)
    const held = weight * stretch
    steps.push({
      value: Number(atom.source_),
      weight: held,
      startCycle: at,
      valueSpan: { start: innerStart + span.start, end: innerStart + span.end },
    })
    at += held
  }
  return steps.length > 0 ? steps : null
}

/**
 * The whole-number `n` of a `<…>/n` on the literal, 1 for no op, or null (#1579).
 *
 * A whole-number n stretches every step to `n` times its weight and nothing more —
 * measured through the engine for /2, /3, a weighted step and three steps. A
 * fractional n (`/1.5`, `/0.5`) and every `*n` change the value INSIDE a cycle, a
 * patterned amount (`/[2]`, `/<2 1>`) changes it per cycle, and two divisions
 * (`/2/2`) are two ops — each declines. `/0` and `/-2` play nothing at all, which
 * is what `n >= 1` refuses.
 */
function slowFactor(el: KElement): number | null {
  const ops = el.options_?.ops ?? []
  if (ops.length === 0) return 1
  if (ops.length !== 1) return null
  // `slow` is only ever a `stretch`'s type (dump), and a patterned amount (`/[2]`)
  // has an array `source_`, which is no number — so neither needs a clause of its
  // own. Both were written, broken alone, and turned nothing red.
  const args = ops[0].arguments_ as { type?: string; amount?: { source_?: unknown } } | undefined
  if (args?.type !== 'slow') return null
  const n = Number(args.amount?.source_)
  return Number.isInteger(n) && n >= 1 ? n : null
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
  sections: readonly SectionStep[],
  found: Map<PatternIR & { tag: 'Param' }, ParamRoutes>,
  seen: Map<PatternIR, Set<string>>,
  ids: Map<PatternIR, number>,
): void {
  if (!node || typeof node !== 'object') return
  // ⚠ THE ROUTE IS PART OF THE STATE (#1585). A binding arranged twice is ONE node
  // reached through two arms; walked once, its second appearance would never be
  // recorded and the lane would draw half the bars that play it.
  const route = routeKey(sections, ids)
  const state = `${timeMoved}|${[...overridden].sort().join(',')}|${route}`
  const states = seen.get(node) ?? new Set<string>()
  if (states.has(state)) return
  states.add(state)
  seen.set(node, states)

  let passDown = overridden
  if (node.tag === 'Param') {
    const entry = found.get(node) ?? { clean: true, routes: new Map<string, readonly SectionStep[]>() }
    entry.clean = entry.clean && !timeMoved && !overridden.has(node.key)
    entry.routes.set(route, sections)
    found.set(node, entry)
    passDown = new Set(overridden).add(node.key)
  }

  const visit = (child: PatternIR, childSections: readonly SectionStep[], childTimeMoved: boolean): void => {
    // A nested Track declares its own lane; its parameters are not this one's.
    if (child.tag === 'Track') return
    collect(child, passDown, childTimeMoved, childSections, found, seen, ids)
  }

  if (node.tag === 'Arrange') {
    // Each arm is a section, and what is inside it counts the section's own cycles
    // — which the route records. An arrangement that gives its arms no whole
    // cycles to count moves time like any other transform.
    const windows = sectionWindows(node)
    node.arms.forEach((arm, i) =>
      visit(
        arm.pattern,
        windows ? [...sections, { node, arm: i, window: windows[i] }] : sections,
        timeMoved || windows === null,
      ),
    )
    return
  }
  const childTimeMoved = timeMoved || !LEAVES_THE_CYCLE.has(node.tag)
  for (const child of childNodes(node)) visit(child, sections, childTimeMoved)
}

/** One section a route passes through: the arrangement, which of its arms, and
 *  the window that arm opens. */
interface SectionStep {
  readonly node: PatternIR
  readonly arm: number
  readonly window: SectionWindow
}

/** What the walk learned about one `Param`: whether every route to it was clean,
 *  and the distinct section chains those routes passed through. */
interface ParamRoutes {
  clean: boolean
  readonly routes: Map<string, readonly SectionStep[]>
}

/** A route's identity — the arms it took, arrangement by arrangement. Two routes
 *  through the same arms see the same cycles, so they are one placement. */
function routeKey(sections: readonly SectionStep[], ids: Map<PatternIR, number>): string {
  return sections
    .map((s) => {
      let id = ids.get(s.node)
      if (id === undefined) {
        id = ids.size
        ids.set(s.node, id)
      }
      return `${id}.${s.arm}`
    })
    .join('/')
}

/**
 * The window each arm of an arrangement opens, or null when the arrangement gives
 * its arms no whole cycles to count (#1585).
 *
 * `arrange` runs each section `fast(cycles)`, joins them with `stepcat` and slows
 * the join by the total (`@strudel/core@1.2.6` `pattern.mjs`, `arrange`), so at
 * song cycle `c` a section starting `start` cycles into a pass of `total` sees
 * `p·cycles + (q − start)`, with `p = floor(c / total)` and `q = c − p·total`.
 * `cat` and `slowcat` are the same with every weight 1: `slowcat` hands its i-th
 * pattern cycle `floor(c / n)`. Measured through the engine for each of the three,
 * a nested arrangement and one under `stack`.
 *
 * A fractional weight changes the value inside a cycle, a negative one silences its
 * neighbours too (`[-1, a], [3, b], [1, c]` plays only `c`), and weights summing to
 * 0 play nothing — each declines. A weight of 0 is skipped by the engine and moves
 * nothing else, so it needs no clause.
 */
function sectionWindows(node: PatternIR & { tag: 'Arrange' }): SectionWindow[] | null {
  const weights = node.arms.map((arm) => arm.weight)
  if (!weights.every((w) => Number.isInteger(w) && w >= 0)) return null
  const total = weights.reduce((sum, w) => sum + w, 0)
  if (total === 0) return null
  let at = 0
  return weights.map((cycles) => {
    const window = { startCycle: at, cycles, total }
    at += cycles
    return window
  })
}

/**
 * Whether no two routes to one parameter can play it in the same song cycle
 * (#1585).
 *
 * Two routes that part at DIFFERENT ARMS OF THE SAME ARRANGEMENT never overlap:
 * the arms of one pass are disjoint, and everything above the parting is shared.
 * Any other parting can play two values at once — a route that stays outside the
 * section another enters (`stack(a, arrange([1, a], [1, b]))` plays two gains in
 * a cycle, measured), or two arrangements side by side under a `stack`. Those
 * decline rather than being checked cycle by cycle: the conservative answer, and
 * the one whose failure is a missing lane rather than a wrong one.
 */
function routesAreDisjoint(routes: readonly (readonly SectionStep[])[]): boolean {
  const partAtAnArm = (a: readonly SectionStep[], b: readonly SectionStep[]): boolean => {
    for (let k = 0; k < Math.min(a.length, b.length); k++) {
      if (a[k].node !== b[k].node) return false
      if (a[k].arm !== b[k].arm) return true
    }
    return false
  }
  return routes.every((a, i) => routes.slice(i + 1).every((b) => partAtAnArm(a, b)))
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
    const found = new Map<PatternIR & { tag: 'Param' }, ParamRoutes>()
    collect(node, new Set(), false, [], found, new Map(), new Map())
    // In the order the walk first met each parameter.
    for (const [param, { clean, routes }] of found) {
      if (!clean) continue
      const chains = [...routes.values()]
      if (!routesAreDisjoint(chains)) continue
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
        placements: chains.map((chain) => chain.map((s) => s.window)),
      })
    }
  }
  return out
}

/**
 * The cycle a placement's parameter sees at song cycle `cycle`, or null when one of
 * its sections is silent then (#1585) — `arrange`'s own arithmetic, one section at a
 * time, outermost first (`sectionWindows` gives the formula and its grounding).
 */
function sectionCycleAt(placement: readonly SectionWindow[], cycle: number): number | null {
  let c = Math.floor(cycle)
  for (const { startCycle, cycles, total } of placement) {
    const pass = Math.floor(c / total)
    const q = c - pass * total
    if (q < startCycle || q >= startCycle + cycles) return null
    c = pass * cycles + (q - startCycle)
  }
  return c
}

/**
 * Which step plays in song cycle `cycle`, or null when the parameter's section is
 * silent then (#1585) — the same selection the engine makes: the cycle the
 * parameter's own section hands it, its position within the period, matched
 * against each step's weighted start. A parameter under no section sees the song
 * cycle itself. Negative cycles wrap like positive ones.
 */
export function stepIndexAtCycle(a: SteppedAutomation, cycle: number): number | null {
  let own: number | null = null
  for (const placement of a.placements) {
    own = sectionCycleAt(placement, cycle)
    if (own !== null) break
  }
  if (own === null) return null
  const period = a.periodCycles
  const pos = ((own % period) + period) % period
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
