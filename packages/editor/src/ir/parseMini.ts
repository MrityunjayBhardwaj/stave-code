/**
 * parseMini — mini-notation string → PatternIR, via the krill grammar.
 *
 * The mini-notation grammar is STRUDEL'S, so we ask Strudel for it: this file
 * lowers `@strudel/mini`'s krill AST into PatternIR instead of re-tokenizing
 * the string ourselves. The hand-rolled tokenizer + byte-position operator
 * scanner it replaced (#943) was a second oracle of a grammar Strudel ships
 * complete and located — every "gap" in it was drift, never a missing feature,
 * and it shipped real bugs (a wrong bjorklund distribution, #907; `!`/`/`/`_`
 * silently mis-parsed). The notation layer (`visualEdit/notation/parse.ts`)
 * already parses the same mini via krill; this brings the IR world up to it.
 *
 * WHAT STAYS OURS is the LOWERING — krill's uniform ops model (`weight`/`reps`/
 * `ops[]` on every element) is lowered into PatternIR's structural tags:
 *   - `bd(3,8)`  → a flat Seq of Play/Sleep (euclid expanded via `bjorklund`)
 *   - `a*2`/`a/2`→ Fast / Slow      · `a?` → Choice      · `a@2` → Elongate
 *   - `a!3`      → three sibling Plays (replicate)        · `a:3` → slice param
 *   - `[a b]`    → Seq   · `[a,b]` → Stack (chord)
 *   - `<a b>`    → Cycle · `{a,b}` → Stack (polymeter)
 * Transform SEMANTICS are never modeled here — they run in Strudel; we only
 * shape the note tree and thread source `loc` back to it.
 *
 * loc: krill's element spans TILE the source (they include padding), so we
 * DERIVE tight per-token spans from the reliable anchors — an atom's
 * `location_.start` plus its `source_.length`, an op amount atom's start — never
 * copy krill's tiling `location_` end. `loc-fidelity.test.ts` (which slices each
 * node's `[start,end]` out of the source) is the gate that pins this.
 */

import { parse as krillParse } from '@strudel/mini/krill-parser.js'
import { IR, type PatternIR, type PlayParams } from './PatternIR'
import { bjorklund, rotateEuclid } from './euclid'

// The `bjorklund` distribution is re-exported for the euclid-authority + the
// integration tests that import it from here (its home is now `./euclid`).
export { bjorklund } from './euclid'

// ---------------------------------------------------------------------------
// The krill AST this adapter consumes — dumped from `@strudel/mini@1.2.6`, not
// read off the grammar (the accessors are easy to get wrong: `bd:3` is NOT an
// atom named "bd:3", it is atom `bd` carrying a `tail` op). The tree is
// uniformly recursive — `pattern > element > (atom | pattern)` — and
// `weight`/`reps`/`ops` are fields on EVERY element.
// ---------------------------------------------------------------------------
interface KLoc { start: { offset: number }; end: { offset: number } }
interface KAtom { type_: 'atom'; source_: string; location_?: KLoc }
interface KOp { type_: string; arguments_?: Record<string, unknown> }
interface KElement {
  type_: 'element'
  source_: KAtom | KPattern
  options_?: { weight?: number; reps?: number; ops?: KOp[] }
  location_?: KLoc
}
interface KPattern {
  type_: 'pattern'
  arguments_?: { alignment?: string }
  source_: KElement[]
}

const isAtom = (n: KAtom | KPattern): n is KAtom => n.type_ === 'atom'

/**
 * `~` and `-` are both silence — literally one branch upstream (mini.mjs:157:
 * `if (ast.source_ === '~' || ast.source_ === '-') return silence`). Each is an
 * atom occupying a slot. (`_` is NOT silence — it is sustain, and krill has
 * already folded it into the previous element's `weight` by now.)
 */
const isRestAtom = (a: KAtom): boolean => a.source_ === '~' || a.source_ === '-'

/**
 * The tight source span of a krill atom. krill's spans TILE the source, and the
 * padding lands on EITHER side depending on the element's syntax (`bd sd` puts
 * it trailing on the first; `a@2 b@2` puts it LEADING on the second) — so the
 * start is skipped past whitespace onto the token, and the end comes from the
 * atom's own `source_.length`, never from krill's tiling `location_.end`.
 */
const atomSpan = (a: KAtom, input: string): { start: number; end: number } => {
  const start = firstNonWs(input, (a.location_?.start.offset ?? 1) - 1)
  return { start, end: start + a.source_.length }
}

/** a euclid arg (`3`/`8`/`-1`) — arrives as an element-wrapped atom, or bare. */
const argAtom = (arg: unknown): KAtom | null => {
  const n = arg as { type_?: string; source_?: unknown } | undefined
  if (!n || typeof n !== 'object') return null
  const inner = (n.type_ === 'element' ? n.source_ : n) as KAtom | undefined
  return inner && inner.type_ === 'atom' ? inner : null
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Parse a mini-notation string. Returns Pure for empty input. Never throws.
 *
 * `baseOffset` — character offset of `input[0]` within the user's full source
 * code. Lets nodes carry `loc` so downstream consumers (Inspector
 * click-to-source, Monaco highlighting) map an event back to its source span.
 */
export function parseMini(
  input: string,
  isSample = false,
  baseOffset = 0,
): PatternIR {
  if (!input.trim()) return IR.pure()

  let ast: KPattern
  try {
    // The mini string is QUOTED — the transpiler's own call shape. krill throws
    // on a few inputs (e.g. a lone `_` has nothing to extend); fall back opaque.
    ast = krillParse('"' + input + '"') as KPattern
  } catch {
    return IR.code(input)
  }

  try {
    // The top level is a pattern like any other — it carries an alignment too.
    // A top-level `,` is a STACK and a top-level `|` a random choice; the hand
    // parser only ever split commas INSIDE brackets, so it flattened both into
    // one sequence (playing a chord's notes one after another).
    const node = patternToNode(
      ast,
      [{ start: baseOffset, end: baseOffset + input.length }],
      isSample,
      baseOffset,
      input,
    )
    return node ?? IR.pure()
  } catch {
    return IR.code(input)
  }
}

/**
 * Any krill pattern → one PatternIR node, dispatched on its ALIGNMENT. Shared by
 * the top level and by every bracketed group, so `a,b` means the same thing
 * wherever it appears — the uniformity that the position-specific hand parser
 * could not have (it split commas only inside brackets).
 *
 * `loc` is the wrapper's span (the `[...]` bracket range, or the whole input at
 * top level); it is dropped when a single-child container unwraps.
 */
function patternToNode(
  pat: KPattern,
  loc: { start: number; end: number }[],
  isSample: boolean,
  baseOffset: number,
  input: string,
): PatternIR | null {
  const align = pat.arguments_?.alignment
  // A container's children are PATTERNS (one per arm/voice), not elements.
  const voices = pat.source_ as unknown as KPattern[]

  if (align === 'polymeter_slowcat' || align === 'rand') {
    // `<a b>` alternation, and `a|b` random choice. Both play exactly ONE arm
    // per cycle, so Cycle carries the right cardinality; the SELECTION rule
    // (rotate vs random) runs in Strudel and is never modeled here.
    const items: PatternIR[] = []
    for (const v of voices) items.push(...buildSeq(v?.source_ ?? [], isSample, baseOffset, input))
    return items.length === 0 ? null : { tag: 'Cycle', items, loc }
  }

  if (align === 'stack' || align === 'polymeter') {
    // `[a,b]` chord / `{a,b}` polymeter — parallel voices.
    const tracks = voices
      .map((v) => buildSeq(v?.source_ ?? [], isSample, baseOffset, input))
      .filter((s) => s.length > 0)
      .map((s) => (s.length === 1 ? s[0] : IR.seq(...s)))
    if (tracks.length === 0) return null
    // A single voice degrades to that voice (no Stack wrapper), matching the
    // hand parser — which produced a bare `IR.seq` here, carrying no loc.
    return tracks.length === 1 ? tracks[0] : { tag: 'Stack', tracks, loc }
  }

  // fastcat — a plain sequence. A single child unwraps (`[a]` ≡ `a`).
  const children = buildSeq(pat.source_, isSample, baseOffset, input)
  if (children.length === 0) return null
  return children.length === 1 ? children[0] : { tag: 'Seq', children, loc }
}

// ---------------------------------------------------------------------------
// Lowering
// ---------------------------------------------------------------------------

/**
 * A krill element list → the sibling nodes it produces. `!n` (replicate) is why
 * this is not a 1:1 map — one element yields `reps` sibling steps.
 */
function buildSeq(
  elements: KElement[],
  isSample: boolean,
  baseOffset: number,
  input: string,
): PatternIR[] {
  const out: PatternIR[] = []
  for (const el of elements) {
    const node = buildElement(el, isSample, baseOffset, input)
    if (!node) continue
    const reps = el.options_?.reps ?? 1
    if (reps > 1) for (let r = 0; r < reps; r++) out.push(node)
    else out.push(node)
  }
  return out
}

/**
 * One krill element → one PatternIR node (the caller replicates it for `!n`).
 * Builds the base (atom → Play/Sleep, pattern → Seq/Stack/Cycle), expands a
 * euclid, then wraps the single trailing modifier (`*`/`/` → Fast/Slow, `?` →
 * Choice, `@n` → Elongate).
 */
function buildElement(
  el: KElement,
  isSample: boolean,
  baseOffset: number,
  input: string,
): PatternIR | null {
  const src = el.source_
  const ops = el.options_?.ops ?? []
  const weight = el.options_?.weight ?? 1
  const reps = el.options_?.reps ?? 1

  let node: PatternIR
  let contentStart: number
  // byte position just after the base content (atom + `:slice`, or the closing
  // bracket of a group) — where a `?`/`@n` modifier begins.
  let afterContent: number

  if (isAtom(src)) {
    const span = atomSpan(src, input)
    contentStart = span.start
    afterContent = span.end
    const loc = [{ start: baseOffset + span.start, end: baseOffset + span.end }]

    if (isRestAtom(src)) {
      node = IR.sleep(1, { loc })
    } else {
      const params: Partial<PlayParams> = isSample ? { s: src.source_ } : {}
      // `bd:2` — krill splits the sample index into a `tail` op. Land the
      // numeric index in `params.slice`; advance past the tail token either way
      // (a word tail like `G:dominant` has no numeric slice but still consumes
      // those bytes, so a following `@n` is located correctly).
      const tail = ops.find((o) => o.type_ === 'tail')
      const tailAtom = tail ? argAtom(tail.arguments_?.element) : null
      if (tailAtom) {
        const idx = parseInt(tailAtom.source_, 10)
        if (!isNaN(idx) && idx >= 0) params.slice = idx
        afterContent = atomSpan(tailAtom, input).end
      }
      node = IR.play(src.source_, isSample ? 1 : 0.25, params, loc)
    }
  } else {
    const group = buildGroup(src, isSample, baseOffset, input, el)
    if (!group) return null
    node = group.node
    contentStart = group.openPos
    afterContent = group.closePos + 1
  }

  // Euclid — expand the atom to a flat Seq of Play/Sleep slots (atom-scoped in
  // parseMini, matching Strudel's `atom(k,n)`). Comes before the modifiers.
  const euclid = ops.find((o) => o.type_ === 'bjorklund')
  if (euclid && isAtom(src) && !isRestAtom(src)) {
    const expanded = expandEuclid(node, euclid, baseOffset, contentStart, input)
    if (expanded) {
      node = expanded.node
      afterContent = expanded.closeParen
    }
  }

  // A single trailing modifier. krill can carry several ops; parseMini's grid
  // only ever produced one per element, so the corpus never stacks them.
  const stretch = ops.find((o) => o.type_ === 'stretch')
  if (stretch) {
    const amt = argAtom(stretch.arguments_?.amount)
    const factor = amt ? Number(amt.source_) : NaN
    if (amt && !isNaN(factor) && factor > 0) {
      const s = atomSpan(amt, input)
      // the operator char (`*`/`/`) sits exactly one byte before the amount.
      const modLoc = [{ start: baseOffset + s.start - 1, end: baseOffset + s.end }]
      node =
        stretch.arguments_?.type === 'slow'
          ? IR.slow(factor, node, { loc: modLoc })
          : IR.fast(factor, node, { loc: modLoc })
    }
  }

  if (ops.some((o) => o.type_ === 'degradeBy')) {
    // `?` has no located amount; it sits at the end of the base content.
    const modLoc = [{ start: baseOffset + afterContent, end: baseOffset + afterContent + 1 }]
    node = IR.choice(0.5, node, IR.pure(), { loc: modLoc })
  }

  // Weight from `@n` → Elongate. `weight` also rises from `_` sustain and from
  // `!n` replicate (reps), which parseMini never lowered to Elongate — so only
  // an explicit `@` at the modifier position produces one. Reading the `@n`
  // extent from the source locates a token krill discarded the position of; it
  // does not re-decide the grammar (krill already ruled this a weight).
  if (reps <= 1 && weight > 1 && input[afterContent] === '@') {
    let j = afterContent + 1
    while (j < input.length && /[0-9.]/.test(input[j])) j++
    const modLoc = [{ start: baseOffset + afterContent, end: baseOffset + j }]
    node = IR.elongate(weight, node, { loc: modLoc })
  }

  return node
}

/**
 * A pattern element — `[...]` sub-sequence, `[a,b]` chord, `<...>` alternation,
 * or `{...}` polymeter. Returns the node plus the byte positions of its opening
 * and closing delimiters (so a trailing modifier lands correctly).
 */
function buildGroup(
  pat: KPattern,
  isSample: boolean,
  baseOffset: number,
  input: string,
  el: KElement,
): { node: PatternIR; openPos: number; closePos: number } | null {
  const openPos = firstNonWs(input, (el.location_?.start.offset ?? 1) - 1)
  const closePos = matchBracket(input, openPos)
  const loc = [{ start: baseOffset + openPos, end: baseOffset + closePos + 1 }]
  const node = patternToNode(pat, loc, isSample, baseOffset, input)
  return node ? { node, openPos, closePos } : null
}

/**
 * Expand `atom(k,n,rot)` into a flat Seq of Play (onset) / Sleep (rest) slots —
 * the same distribution `.euclid()` runs, so the timeline draws what plays. The
 * onset Plays reuse the atom's node; rest slots are loc-less Sleeps. Returns the
 * Seq plus the byte position just after the closing `)`.
 */
function expandEuclid(
  play: PatternIR,
  op: KOp,
  baseOffset: number,
  contentStart: number,
  input: string,
): { node: PatternIR; closeParen: number } | null {
  const pulse = argAtom(op.arguments_?.pulse)
  const step = argAtom(op.arguments_?.step)
  if (!pulse || !step) return null
  const k = Number(pulse.source_)
  const n = Number(step.source_)
  if (isNaN(k) || isNaN(n)) return null
  const rotArg = op.arguments_?.rotation == null ? null : argAtom(op.arguments_?.rotation)
  const rot = rotArg ? Number(rotArg.source_) : 0

  let mask = bjorklund(k, n)
  if (rot) mask = rotateEuclid(mask, rot)

  const restSlot = IR.sleep(1)
  const slots = mask.map((on) => (on ? play : restSlot))
  // `)` sits one byte after the last present arg (rotation, else step).
  const closeParen = atomSpan(rotArg ?? step, input).end + 1

  if (slots.length === 1) return { node: slots[0], closeParen }
  return {
    node: {
      tag: 'Seq',
      children: slots,
      loc: [{ start: baseOffset + contentStart, end: baseOffset + closeParen }],
    },
    closeParen,
  }
}

// ---------------------------------------------------------------------------
// Source helpers — byte positions only, never grammar (krill owns the grammar).
// ---------------------------------------------------------------------------

/** first non-whitespace byte at or after `from`. */
function firstNonWs(input: string, from: number): number {
  let i = from
  while (i < input.length && /\s/.test(input[i])) i++
  return i
}

/**
 * The matching close for the delimiter at `openPos`, by bracket-depth counting
 * over `[] {} <>`. krill has already validated the nesting, so this only locates
 * the byte — it does not parse.
 */
function matchBracket(input: string, openPos: number): number {
  let depth = 0
  for (let i = openPos; i < input.length; i++) {
    const c = input[i]
    if (c === '[' || c === '{' || c === '<') depth++
    else if (c === ']' || c === '}' || c === '>') {
      depth--
      if (depth === 0) return i
    }
  }
  return input.length - 1
}
