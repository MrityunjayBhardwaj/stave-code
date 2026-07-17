/**
 * Mini-notation → notation models.
 *
 * The grammar is STRUDEL'S, so we ask Strudel for it. `@strudel/mini`'s krill
 * parser — the same parser the transpiler runs — answers "what IS this syntax",
 * and this file maps its AST onto the view models below.
 *
 * This file used to hand-roll that grammar. Every real-world "gap" the copy
 * reported turned out to be DRIFT from the original rather than a missing
 * feature: krill parses 623 of the 625 real-world units the copy rejected
 * (99.7%; the 2 residuals are a truncated source and a floatbeat DSP
 * expression that is not mini-notation at all). The copy is gone.
 *
 * THE RULE AT THIS BOUNDARY: if you need to know what a character MEANS, ask
 * krill — and do not write its answer back down here as a regex. A transcribed
 * rule is a second oracle: correct the day it is written, silently divergent
 * after, and the divergence surfaces as a user-visible bug rather than an
 * error. That is how `gm_agogo` became uneditable (an `_` in a char-class read
 * a NAME as syntax) and how `stack (` blanked a whole timeline.
 *
 * What stays OURS is the VIEW. krill yields an unbounded recursive tree;
 * `Step[]` is two levels (steps → slots), so deeper nesting is refused as a
 * MODEL limit — an honest "a grid can't show this", not a fake parse failure.
 */
import { parse as krillParse } from '@strudel/mini/krill-parser.js'
import { bjorklund as strudelBjorklund } from '@strudel/core/euclid.mjs'
import type {
  ChunkGain,
  GridSource,
  ParseResult,
  PianoRollModel,
  RollNote,
  SourcePart,
  SourceRegion,
  StepGridModel,
  StepLane,
} from './model'
import { pitchToMidi } from './pitch'

/**
 * A bare integer (`60`, `0`, `-7`) — a numeric note value for the roll (#469).
 * This is a VIEW question (does this lane carry pitches or sounds?), not a
 * grammar one, so it stays here: krill is happy to call `909` an atom, but a
 * bare number is not a sound name.
 */
const NUMERIC = /^-?\d+$/
/**
 * A token this lane can SHOW. krill has already ruled on what is a valid atom,
 * so there is no syntax check here — only the view's own question. Sounds pass
 * everywhere; bare integers pass only where the consumer opts in
 * (`allowNumeric`) — the Piano Roll (`note`/`n`), never the step grid.
 * Note-name validity is owned by `pitchToMidi` (the row-math authority) — a
 * second NOTE regex here drifted out of sync once already (it required an
 * octave, so bare `c` was rejected even though pitchToMidi maps it to C3);
 * single source = no drift (P189).
 */
const isAtomToken = (t: string, allowNumeric: boolean): boolean =>
  allowNumeric || !NUMERIC.test(t)

/** ceiling on expanded columns so `[7 hits][11 hits]` can't blow up the grid */
const MAX_STEPS = 64

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b

/**
 * Distribute `k` pulses over `n` steps — the euclidean rhythm behind
 * `bd(3,8)`. The distribution itself is Strudel's (`@strudel/core`'s
 * `bjorklund`, the same function `.euclid()` runs), so the grid shows exactly
 * the cells the audio triggers; we only adapt the shape (`0|1` → booleans) and
 * hold the degenerate ends, which are a VIEW decision rather than a grammar
 * one: `k >= n` fills every step (upstream would compute a negative remainder
 * and throw), `k <= 0` empties it.
 *
 * This was a 56-line transcription of upstream's algorithm until #903. It
 * agreed with the original on all 152 (k,n) pairs up to n=16 — which is the
 * point: a copy is correct the day it is written and free to drift forever
 * after, and nothing would have told us.
 */
export const bjorklund = (k: number, n: number): boolean[] =>
  k <= 0
    ? (Array(n).fill(false) as boolean[])
    : k >= n
      ? (Array(n).fill(true) as boolean[])
      : strudelBjorklund(k, n).map((x) => x === 1)

/**
 * Rotate a euclid pattern to match Strudel's `euclidRot`, so an unedited
 * `atom(k,n,rot)` shows exactly the cells the audio plays. Strudel applies
 * `rotate(b, -rot)` where `rotate` left-rotates — i.e. a *right* rotation by
 * `rot`. (Source: @strudel/core euclid.mjs `_euclidRot` → util.mjs `rotate`.)
 */
const rotateEuclid = (pattern: boolean[], rot: number): boolean[] => {
  const n = pattern.length
  if (n === 0) return pattern
  const k = (((-rot) % n) + n) % n
  return pattern.slice(k).concat(pattern.slice(0, k))
}

/** one slot inside a `[...]` sub-sequence */
interface Slot {
  /** atoms played together; empty = rest */
  atoms: string[]
  /** `@n` weight within the group */
  units: number
}

/** a top-level step: a plain atom/rest, or a sub-sequence of slots */
interface Step {
  atoms: string[]
  /** `@n` — flat columns, or bars when inside a `<...>` alternation */
  elongation: number
  /** `[a b]` slots, or null for a plain step */
  sub: Slot[] | null
}

const stepUnits = (s: Step): number =>
  s.sub ? s.sub.reduce((n, slot) => n + slot.units, 0) : 1

/** finest subdivision so every sub-sequence slot lands on a whole column */
const division = (steps: Step[]): number => steps.reduce((d, s) => lcm(d, stepUnits(s)), 1)

/** split on commas that sit outside every bracket and euclid `(k,n)` paren */
function splitTopLevel(src: string): string[] {
  const out: string[] = []
  let depth = 0
  let from = 0
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '[' || c === '(') depth++
    else if (c === ']' || c === ')') depth--
    else if (c === ',' && depth === 0) {
      out.push(src.slice(from, i))
      from = i + 1
    }
  }
  out.push(src.slice(from))
  return out
}

/** inner text when the trimmed string is exactly one `<...>` alternation */
function unwrapAlternation(mini: string): string | null {
  const t = mini.trim()
  return t.length >= 2 && t.startsWith('<') && t.endsWith('>') ? t.slice(1, -1) : null
}

/* ── the krill adapter ─────────────────────────────────────────── */

/**
 * The krill AST nodes this file consumes — dumped from `@strudel/mini@1.2.6`,
 * not read off the grammar. The accessors are easy to get wrong: `bd:3` is NOT
 * an atom named `"bd:3"`, it is atom `bd` carrying a `tail` op.
 *
 * The tree is uniformly recursive — `pattern > element > (atom | pattern)` —
 * and `weight`/`reps`/`ops` are fields on EVERY element. That uniformity is
 * why this adapter is short and the parser it replaced was not: the copy made
 * position-specific (one reader per place a token could appear) what Strudel
 * makes uniform, which is why all of its gaps read "works on an atom, fails on
 * a group".
 */
interface KAtom {
  type_: 'atom'
  source_: string
}
interface KPattern {
  type_: 'pattern'
  arguments_?: { alignment?: string }
  source_: KElement[]
}
interface KOp {
  type_: string
  arguments_?: Record<string, unknown>
}
interface KLocation {
  start: { offset: number }
  end: { offset: number }
}
interface KElement {
  type_: 'element'
  source_: KAtom | KPattern
  options_?: { weight?: number; reps?: number; ops?: KOp[] }
  /**
   * Every krill node carries one, and the element spans TILE the source
   * (`bd hh*2 sd cp` → `"bd "`, `"hh*2 "`, `"sd "`, `"cp"` — contiguous,
   * reconstructing the input byte-for-byte). That tiling is what makes span
   * surgery possible: the writer copies unedited regions through verbatim.
   */
  location_?: KLocation
}

/**
 * One top-level krill element: where its bytes are, and how many steps it
 * expanded to. `!n` is why the count is needed — one element, n steps.
 * Offsets are into the string handed to `tokenize` (already trimmed).
 */
interface ElementSpan {
  start: number
  end: number
  steps: number
}

type Tokenized =
  | { ok: true; steps: Step[]; elements: ElementSpan[] }
  | { ok: false; reason: string }

/** a refusal — always the VIEW's ("a grid can't show this"), never the grammar's */
type Refused = { reason: string }

const isAtom = (n: KAtom | KPattern): n is KAtom => n.type_ === 'atom'

/**
 * `~` and `-` are both silence — literally one branch upstream:
 * `if (ast.source_ === '~' || ast.source_ === '-') return silence` (mini.mjs:157).
 * Both are atoms occupying a slot. (`_` is NOT silence — it is sustain, and
 * krill has already folded it into the previous element's weight by now.)
 */
const isRestAtom = (a: KAtom): boolean => a.source_ === '~' || a.source_ === '-'

/**
 * The token a lane displays. krill splits `bd:3` into an atom plus a `tail` op
 * (upstream turns that pair into superdough's `s` + `n`); the views show — and
 * round-trip — the written form, so re-join it.
 *
 * A tail is not always an atom: `rd:<1 3 2>` selects the sample by an
 * ALTERNATION, and `sd:[1|0]` by a random choice. Those are patterns, and this
 * flat token cannot hold one — so the answer is `null` (the caller refuses the
 * unit) and never a truncated `"rd"`. Dropping the tail would render a cell
 * that looks editable and then write `rd` back over the user's `rd:<1 3 2>`:
 * silent data loss, which is strictly worse than declining to show it.
 */
const tokenOf = (atom: KAtom, ops: KOp[]): string | null => {
  let t = atom.source_
  for (const op of ops) {
    if (op.type_ !== 'tail') continue
    // the tail's `element` IS the node — an atom for `bd:3`, a pattern for `rd:<1 3 2>`
    const node = op.arguments_?.element as KAtom | KPattern | undefined
    if (!node || node.type_ !== 'atom' || typeof node.source_ !== 'string') return null
    t += ':' + node.source_
  }
  return t
}

/**
 * A number krill parsed as a node. `*2`'s amount arrives as a bare atom;
 * `(3,8)`'s pulse/step arrive wrapped in an element. Observed, not assumed.
 */
const numArg = (node: unknown): number | null => {
  const n = node as { type_?: string; source_?: unknown } | undefined
  if (!n || typeof n !== 'object') return null
  const inner = (n.type_ === 'element' ? n.source_ : n) as KAtom | undefined
  if (!inner || inner.type_ !== 'atom') return null
  const v = Number(inner.source_)
  return Number.isFinite(v) ? v : null
}

interface Euclid {
  k: number
  n: number
  rot: number
}

/**
 * Fold an element's ops into the two the views can render. `tail` is already in
 * the token and `replicate` is already in `reps`, so both are no-ops here.
 * Everything else — `?` degrade, `bd/2` slow — is a real Strudel feature this
 * view has no way to draw, and says so.
 */
function readOps(ops: KOp[]): { mult: number; euclid: Euclid | null } | Refused {
  let mult = 1
  let euclid: Euclid | null = null
  for (const op of ops) {
    switch (op.type_) {
      case 'tail':
      case 'replicate':
        break
      case 'stretch': {
        const type = op.arguments_?.type
        if (type !== 'fast') {
          return { reason: `"${String(type)}" stretch is beyond the editable subset` }
        }
        const amount = numArg(op.arguments_?.amount)
        if (amount === null || !Number.isInteger(amount) || amount < 1) {
          return { reason: 'invalid * multiplier' }
        }
        mult *= amount
        break
      }
      case 'bjorklund': {
        const k = numArg(op.arguments_?.pulse)
        const n = numArg(op.arguments_?.step)
        // absent rotation arrives as an explicit `null`, not `undefined`
        const rot = op.arguments_?.rotation == null ? 0 : numArg(op.arguments_.rotation)
        if (k === null || n === null || rot === null) {
          return { reason: 'invalid euclid (k,n) arguments' }
        }
        if (n < 1) return { reason: 'invalid euclid step count' }
        euclid = { k, n, rot }
        break
      }
      case 'degradeBy':
        return { reason: '"?" random degrade is beyond the editable subset' }
      default:
        return { reason: `"${op.type_}" is beyond the editable subset` }
    }
  }
  return { mult, euclid }
}

/** the slots of a `[...]` group — one nesting level, a `[a,b]` chord per slot */
function groupSlots(pat: KPattern, allowNumeric: boolean): Slot[] | Refused {
  const slots: Slot[] = []
  for (const el of pat.source_) {
    const opts = el.options_ ?? {}
    const ops = opts.ops ?? []
    const units = opts.weight ?? 1
    if ((opts.reps ?? 1) > 1) {
      return { reason: '! inside a group is beyond the editable subset' }
    }
    // A slot renders as a flat token (or a chord); it has nowhere to put an
    // operator. Refuse rather than drop one — `[[0,1]*<1!3 2> [2,3]]` would
    // otherwise show as a plain `[0,1]` chord and write the `*<1!3 2>` away.
    // `tail` is the exception: it belongs to the atom and `tokenOf` folds it in.
    if (ops.some((o) => o.type_ !== 'tail')) {
      return { reason: 'operators inside a group are beyond the editable subset' }
    }
    if (isAtom(el.source_)) {
      if (isRestAtom(el.source_)) {
        // a `:` variant on silence (`~:3`) has no cell to name — refuse rather
        // than drop it, same rule as a patterned tail
        if (ops.length) return { reason: 'a ":" variant on a rest has nothing to name' }
        slots.push({ atoms: [], units })
        continue
      }
      const token = tokenOf(el.source_, ops)
      if (token === null) {
        return { reason: `a patterned ":" variant on "${el.source_.source_}" is beyond the editable subset` }
      }
      if (!isAtomToken(token, allowNumeric)) return { reason: `unsupported token "${token}"` }
      slots.push({ atoms: [token], units })
      continue
    }
    // a nested pattern is showable only as a `[a,b]` chord in one slot
    const chord = chordAtoms(el.source_, allowNumeric)
    if (!Array.isArray(chord)) return chord
    slots.push({ atoms: chord, units })
  }
  if (slots.length === 0) return { reason: 'empty group' }
  return slots
}

/** the atoms of a `[a,b]` chord — parallel single-atom voices, no nesting */
function chordAtoms(pat: KPattern, allowNumeric: boolean): string[] | Refused {
  if (pat.arguments_?.alignment !== 'stack') {
    return { reason: 'nested groups are beyond the editable subset' }
  }
  const atoms: string[] = []
  for (const voice of pat.source_) {
    // krill wraps each `,`-separated voice in its own fastcat pattern
    if (isAtom(voice as unknown as KAtom | KPattern)) {
      return { reason: 'stacked sub-sequences are beyond the editable subset' }
    }
    const vp = voice as unknown as KPattern
    if (vp.arguments_?.alignment !== 'fastcat' || vp.source_.length !== 1) {
      return { reason: 'stacked sub-sequences are beyond the editable subset' }
    }
    const el = vp.source_[0]
    const ops = el.options_?.ops ?? []
    if (!isAtom(el.source_) || (el.options_?.reps ?? 1) > 1 || ops.some((o) => o.type_ !== 'tail')) {
      return { reason: 'stacked sub-sequences are beyond the editable subset' }
    }
    const token = tokenOf(el.source_, ops)
    if (token === null) {
      return { reason: `a patterned ":" variant on "${el.source_.source_}" is beyond the editable subset` }
    }
    if (!isAtomToken(token, allowNumeric)) return { reason: `unsupported token "${token}"` }
    atoms.push(token)
  }
  return atoms
}

/**
 * One krill element → the step(s) it occupies. `!n` yields n SEPARATE steps
 * (unlike `*n`, which subdivides one), so this returns a list.
 */
function elementToSteps(el: KElement, allowNumeric: boolean): Step[] | Refused {
  const opts = el.options_ ?? {}
  const ops = opts.ops ?? []
  const reps = opts.reps ?? 1
  const rawWeight = opts.weight ?? 1
  const read = readOps(ops)
  if (!('mult' in read)) return read
  const { mult, euclid } = read

  // Upstream sets `weight = reps` for a replicate, so a replicated element's
  // weight carries no `@`. When the two disagree, an `@` was written next to a
  // `!` (`bd!3@2` → weight 4, reps 3) — a combination no view models.
  if (reps > 1 && rawWeight !== reps) {
    return { reason: '! combined with * or @ is beyond the editable subset' }
  }
  // Degenerate spans: `bd!0` queries to ZERO haps and `bd@0` to a zero-width
  // step (observed). Both are legal mini and both are silence — there is simply
  // no cell to draw, so the view declines rather than inventing one.
  if (reps < 1) return { reason: 'a zero replicate has nothing to show' }
  if (rawWeight <= 0) return { reason: 'a zero-width step has nothing to show' }
  const weight = reps > 1 ? 1 : rawWeight

  if (!isAtom(el.source_)) {
    const alignment = el.source_.arguments_?.alignment
    if (alignment === 'stack') {
      const chord = chordAtoms(el.source_, allowNumeric)
      if (!Array.isArray(chord)) return chord
      if (euclid) return { reason: 'euclid on a chord is beyond the editable subset' }
      if (reps > 1) return { reason: '! on a chord is beyond the editable subset' }
      if (mult > 1) {
        if (weight > 1) return { reason: '* combined with @ is beyond the editable subset' }
        // `[a,b]*n` ≡ the chord struck n times inside the one step
        return [
          {
            atoms: [],
            elongation: weight,
            sub: Array.from({ length: mult }, () => ({ atoms: [...chord], units: 1 })),
          },
        ]
      }
      return [{ atoms: chord, elongation: weight, sub: null }]
    }
    if (alignment !== 'fastcat') {
      return { reason: `"${String(alignment)}" is beyond the editable subset` }
    }
    // ── the view's own limits on a `[...]` group ──
    if (euclid) return { reason: 'euclid on a group is beyond the editable subset' }
    if (reps > 1) return { reason: '! on a group is beyond the editable subset' }
    if (mult > 1 && weight > 1) {
      return { reason: '* combined with @ is beyond the editable subset' }
    }
    const slots = groupSlots(el.source_, allowNumeric)
    if (!Array.isArray(slots)) return slots
    if (mult > 1) {
      // `[…]*n` ≡ the group's slots played n times within the step (n× faster)
      const sub: Slot[] = []
      for (let r = 0; r < mult; r++) {
        for (const s of slots) sub.push({ atoms: [...s.atoms], units: s.units })
      }
      return [{ atoms: [], elongation: weight, sub }]
    }
    if (slots.length === 1 && slots[0].units === 1) {
      // `[bd]` collapses to a bare atom
      return [{ atoms: slots[0].atoms, elongation: weight, sub: null }]
    }
    return [{ atoms: [], elongation: weight, sub: slots }]
  }

  const atom = el.source_
  const rest = isRestAtom(atom)
  if (rest && ops.some((o) => o.type_ === 'tail')) {
    return { reason: 'a ":" variant on a rest has nothing to name' }
  }
  const token = rest ? '' : tokenOf(atom, ops)
  if (token === null) {
    return { reason: `a patterned ":" variant on "${atom.source_}" is beyond the editable subset` }
  }
  if (!rest && !isAtomToken(token, allowNumeric)) {
    return { reason: `unsupported token "${token}"` }
  }
  const atoms = rest ? [] : [token]

  if (euclid) {
    if (mult > 1 || reps > 1 || weight > 1) {
      return { reason: 'euclid combined with * / ! / @ is beyond the editable subset' }
    }
    // `atom(k,n[,rot])` ≡ a sub-sequence of n single-unit slots: the atom at the
    // Bjørklund pulse positions (rotated by `rot`), rests everywhere else.
    const hits = rotateEuclid(bjorklund(euclid.k, euclid.n), euclid.rot)
    return [{ atoms: [], elongation: 1, sub: hits.map((on) => ({ atoms: on ? [...atoms] : [], units: 1 })) }]
  }
  if (reps > 1) {
    if (mult > 1) return { reason: '! combined with * or @ is beyond the editable subset' }
    // `atom!n` ≡ n SEPARATE plain steps of the atom (vs `*n`, one sub-step)
    return Array.from({ length: reps }, () => ({ atoms: [...atoms], elongation: 1, sub: null }))
  }
  if (mult > 1) {
    if (weight > 1) return { reason: '* combined with @ is beyond the editable subset' }
    // `atom*n` ≡ a sub-sequence of n single-unit slots of the atom
    return [
      {
        atoms: [],
        elongation: 1,
        sub: Array.from({ length: mult }, () => ({ atoms: [...atoms], units: 1 })),
      },
    ]
  }
  return [{ atoms, elongation: weight, sub: null }]
}

/**
 * Tokenize a flat sequence (one cycle / one stack part / one alternation slot).
 * The grammar is krill's; every refusal below is the VIEW's own.
 */
function tokenize(mini: string, allowNumeric = false): Tokenized {
  const src = mini.trim()
  if (src === '') return { ok: true, steps: [], elements: [] }
  let ast: KPattern
  try {
    // krill wants the mini string QUOTED — the transpiler's own call shape.
    ast = krillParse('"' + src + '"') as KPattern
  } catch {
    return { ok: false, reason: 'unsupported mini-notation syntax' }
  }
  if (!ast || ast.type_ !== 'pattern' || !Array.isArray(ast.source_)) {
    return { ok: false, reason: 'unsupported mini-notation syntax' }
  }
  const alignment = ast.arguments_?.alignment
  if (alignment !== 'fastcat') {
    // Callers split a top-level `,` before this; reaching one means it sits
    // where the view cannot place it.
    return {
      ok: false,
      reason:
        alignment === 'stack'
          ? 'unsupported token ","'
          : `"${String(alignment)}" is beyond the editable subset`,
    }
  }
  const steps: Step[] = []
  const elements: ElementSpan[] = []
  for (const el of ast.source_) {
    const mapped = elementToSteps(el, allowNumeric)
    if (!Array.isArray(mapped)) return { ok: false, reason: mapped.reason }
    const loc = el.location_
    // krill was handed a QUOTED string, so its offsets carry the opening quote.
    if (loc) elements.push({ start: loc.start.offset - 1, end: loc.end.offset - 1, steps: mapped.length })
    steps.push(...mapped)
  }
  // A span we can't place is a span we can't put back: if any element lacks a
  // location the tiling has a hole, and a partial tiling would copy the wrong
  // bytes through. All or nothing.
  const tiled = elements.length === ast.source_.length
  return { ok: true, steps, elements: tiled ? elements : [] }
}

/* ── drum grid ─────────────────────────────────────────────────── */

/** the grid has no time axis for `@n`, so any elongation rejects */
const gridHasElongation = (steps: Step[]): boolean =>
  steps.some((s) => s.elongation !== 1 || (s.sub?.some((slot) => slot.units !== 1) ?? false))

/** flatten steps to `div`-resolution trigger cells, each an atom list */
function toCells(steps: Step[], div: number): string[][] {
  const cells: string[][] = []
  for (const step of steps) {
    const slots = step.sub ?? [{ atoms: step.atoms, units: 1 }]
    const total = stepUnits(step)
    for (const slot of slots) {
      const span = (div / total) * slot.units
      cells.push(slot.atoms)
      for (let j = 1; j < span; j++) cells.push([])
    }
  }
  return cells
}

/** derive lanes (one per distinct sound, first-appearance order) from cells */
function lanesFromCells(cells: string[][], part?: number): StepLane[] {
  const order: string[] = []
  for (const cell of cells) {
    for (const sound of cell) if (!order.includes(sound)) order.push(sound)
  }
  return order.map((sound) => ({
    sound,
    ...(part !== undefined ? { part } : {}),
    cells: cells.map((cell) => cell.includes(sound)),
  }))
}

/**
 * Pair each source element with the columns it produced, so the writer can put
 * unedited ones back verbatim (#913).
 *
 * In a step grid every top-level step occupies exactly `div` columns — the grid
 * refuses elongation, so each step's slots each span `div/total` and sum to
 * `div`. An element that expanded to `n` steps therefore owns `n * div`
 * columns, in source order.
 *
 * Returns null unless the spans TILE — i.e. concatenating them reproduces the
 * source exactly. That holds for all 1352 flat minis in the real corpus, but it
 * is checked rather than trusted: the whole mechanism is "copy the bytes we did
 * not touch", so a hole in the tiling would copy the WRONG bytes, silently.
 * Cheaper to verify than to debug, and a failure here just means the caller
 * writes the way it always did.
 */
function buildRegions(
  src: string,
  elements: ElementSpan[],
  div: number,
  cells: string[][],
): SourceRegion[] | null {
  if (elements.length === 0) return null
  const regions: SourceRegion[] = []
  let col = 0
  for (const el of elements) {
    const raw = src.slice(el.start, el.end)
    const leading = /^\s*/.exec(raw)?.[0] ?? ''
    const trailing = /\s*$/.exec(raw.slice(leading.length))?.[0] ?? ''
    const to = col + el.steps * div
    regions.push({
      raw,
      leading,
      trailing,
      from: col,
      to,
      // the grid's view of these columns, not the raw atoms — see SourceRegion
      cells: cells.slice(col, to).map((c) => [...new Set(c)]),
    })
    col = to
  }
  if (regions.map((r) => r.raw).join('') !== src) return null
  return regions
}

/**
 * The one-part source shared by the flat and alternation paths: the whole mini
 * is a single part on the shared grid, so its columns ARE the grid's columns
 * (`factor` 1) and it carries no separator.
 */
function singlePart(
  src: string,
  elements: ElementSpan[],
  div: number,
  cells: string[][],
): SourcePart[] | null {
  const regions = buildRegions(src, elements, div, cells)
  return regions ? [{ part: 0, div, factor: 1, before: '', after: '', regions }] : null
}

export function parseStepGrid(mini: string): ParseResult<StepGridModel> {
  const alt = unwrapAlternation(mini)
  if (alt !== null) return gridFromAlternation(alt)

  const parts = splitTopLevel(mini)
  if (parts.length > 1) return gridFromStack(parts)

  const tok = tokenize(mini)
  if (!tok.ok) return tok
  if (gridHasElongation(tok.steps)) {
    return { ok: false, reason: 'elongation is beyond the drum-grid subset' }
  }
  const div = division(tok.steps)
  if (tok.steps.length * div > MAX_STEPS) {
    return { ok: false, reason: `sub-sequences expand the grid past ${MAX_STEPS} steps` }
  }
  const cells = toCells(tok.steps, div)
  const src = mini.trim()
  const sourceParts = singlePart(src, tok.elements, div, cells)
  return {
    ok: true,
    model: {
      steps: cells.length,
      lanes: lanesFromCells(cells),
      ...(sourceParts
        ? { source: { prefix: '', suffix: '', parts: sourceParts } }
        : {}),
    },
  }
}

/**
 * `<[bd ~ sd ~] [bd bd sd ~]>` — one slot per bar.
 *
 * `inner` is the text between the angle brackets, so the regions tile it and
 * the brackets (plus whatever padding the user left inside them) are carried as
 * the wrapper. Each element is a bar and owns `div` columns, exactly as in the
 * flat case — the alternation is the same tiling with `<`…`>` around it.
 */
function gridFromAlternation(inner: string): ParseResult<StepGridModel> {
  const tok = tokenize(inner)
  if (!tok.ok) return tok
  if (tok.steps.length === 0) return { ok: false, reason: 'empty alternation' }
  if (gridHasElongation(tok.steps)) {
    return { ok: false, reason: 'elongation is beyond the drum-grid subset' }
  }
  const div = division(tok.steps)
  if (tok.steps.length * div > MAX_STEPS) {
    return { ok: false, reason: `the alternation expands the grid past ${MAX_STEPS} steps` }
  }
  const cells = toCells(tok.steps, div)
  const src = inner.trim()
  const parts = singlePart(src, tok.elements, div, cells)
  return {
    ok: true,
    model: {
      steps: cells.length,
      bars: tok.steps.length,
      lanes: lanesFromCells(cells),
      ...(parts
        ? {
            source: {
              parts,
              prefix: '<' + (/^\s*/.exec(inner)?.[0] ?? ''),
              suffix: (/\s*$/.exec(inner)?.[0] ?? '') + '>',
            },
          }
        : {}),
    },
  }
}

/**
 * `bd ~ sd ~, hh hh hh hh` — parallel parts on a shared grid, part preserved.
 *
 * Each part keeps its OWN resolution: the shared grid is the finest of them, so
 * a part's columns map onto it every `factor` columns. The regions stay in the
 * part's own column space and the `,` (with whatever padding the user put
 * around it) is carried verbatim as the part's `before`.
 */
function gridFromStack(parts: string[]): ParseResult<StepGridModel> {
  const partCells: string[][][] = []
  const divs: number[] = []
  const elements: ElementSpan[][] = []
  for (const part of parts) {
    if (part.trim() === '') return { ok: false, reason: 'empty stack part' }
    const tok = tokenize(part)
    if (!tok.ok) return tok
    if (gridHasElongation(tok.steps)) {
      return { ok: false, reason: 'elongation is beyond the drum-grid subset' }
    }
    const div = division(tok.steps)
    divs.push(div)
    elements.push(tok.elements)
    partCells.push(toCells(tok.steps, div))
  }
  const total = partCells.reduce((l, cells) => lcm(l, cells.length || 1), 1)
  if (total > MAX_STEPS) {
    return { ok: false, reason: `the stack expands the grid past ${MAX_STEPS} steps` }
  }
  const lanes: StepLane[] = []
  partCells.forEach((cells, part) => {
    const factor = total / (cells.length || 1)
    const stretched: string[][] = Array.from({ length: total }, (_, c) =>
      c % factor === 0 ? (cells[c / factor] ?? []) : [],
    )
    lanes.push(...lanesFromCells(stretched, part))
  })
  return {
    ok: true,
    model: { steps: total, lanes, ...(stackSource(parts, divs, elements, partCells, total) ?? {}) },
  }
}

/**
 * The per-part source for a `,`-stack. All or nothing: one part we can't tile
 * means the writer can't reassemble the line, so none of it is used.
 */
function stackSource(
  parts: string[],
  divs: number[],
  elements: ElementSpan[][],
  partCells: string[][][],
  total: number,
): { source: GridSource } | null {
  const out: SourcePart[] = []
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i]
    const leading = /^\s*/.exec(raw)?.[0] ?? ''
    const after = /\s*$/.exec(raw.slice(leading.length))?.[0] ?? ''
    const regions = buildRegions(raw.trim(), elements[i], divs[i], partCells[i])
    if (!regions) return null
    out.push({
      part: i,
      div: divs[i],
      factor: total / (partCells[i].length || 1),
      before: (i > 0 ? ',' : '') + leading,
      after,
      regions,
    })
  }
  // the parts must reassemble the line exactly, or we are not putting back what
  // we read — same check as the per-part tiling, one level up
  const rebuilt = out.map((p) => p.before + p.regions.map((r) => r.raw).join('') + p.after).join('')
  if (rebuilt !== parts.join(',')) return null
  return { source: { prefix: '', suffix: '', parts: out } }
}

/* ── velocity (.gain) read-back ────────────────────────────────── */

/** a flat gain token: a non-negative number, or `~` (no gain event there) */
const GAIN_TOKEN = /^\d+(\.\d+)?$/

/**
 * Parse a FLAT `.gain("…")` mini into `count` per-position velocities — the
 * one-token-per-column shape the step grid writes. Returns null when the gain
 * pattern isn't that shape (wrong token count, an `@`/`*`/`[` we didn't write,
 * a non-numeric token, a broadcast `.gain("0.8")`); the caller then leaves the
 * model neutral and flags the gain foreign so it's never rewritten or deleted.
 * A `~` position reads as neutral `1` (its column is a rest — no audible gain).
 */
export function parseGainMini(mini: string, count: number): number[] | null {
  const tokens = mini.trim().split(/\s+/).filter((t) => t !== '')
  if (tokens.length !== count) return null
  const out: number[] = []
  for (const t of tokens) {
    if (t === '~') {
      out.push(1)
      continue
    }
    if (!GAIN_TOKEN.test(t)) return null
    out.push(parseFloat(t))
  }
  return out
}

/**
 * Apply an existing `.gain` to a freshly-parsed step model. A scalar
 * `.gain(0.4)` reads as a UNIFORM base (every column 0.4); a string `.gain("…")`
 * reads per-column. A `.gain` we don't manage (`foreign`) or a string that
 * doesn't align to the columns flags `gainForeign` (hands off). `.gain(1)` is
 * neutral and leaves the model bare.
 */
export function applyStepGain(model: StepGridModel, gain: ChunkGain): StepGridModel {
  if (gain.foreign) return { ...model, gainForeign: true }
  if (gain.numeric !== null) {
    return gain.numeric === 1 ? model : { ...model, gains: Array<number>(model.steps).fill(gain.numeric) }
  }
  if (gain.mini === null) return model
  const gains = parseGainMini(gain.mini, model.steps)
  if (gains === null) return { ...model, gainForeign: true }
  return { ...model, gains }
}

/**
 * Apply an existing `.gain("…")` string to a freshly-parsed roll model. Walks
 * the gain mini the same way `parsePianoRoll` walks notes (so `@n` holds and
 * rests line up), building a start-column → gain map, then assigns each note the
 * gain at its start (chord members at one start share it). Flags `gainForeign`
 * — leaving the `.gain` byte-identical — when the gain can't be cleanly mapped
 * (multi-bar, non-numeric token, a total that doesn't match the note grid, or a
 * non-neutral value at a column where no note starts).
 */
export function applyRollGain(model: PianoRollModel, gain: ChunkGain): PianoRollModel {
  if (gain.foreign) return { ...model, gainForeign: true }
  if (gain.numeric !== null) {
    // scalar `.gain(0.4)` → uniform base on every note
    return gain.numeric === 1
      ? model
      : { ...model, notes: model.notes.map((n) => ({ ...n, gain: gain.numeric as number })) }
  }
  if (gain.mini === null) return model
  // The gain mini is a FLAT sequence the roll serializer emits: a number, a
  // `~` rest, or `num@dur` for a held note. (The note tokenizer can't read it —
  // it requires letter-start atoms.) Anything else → foreign, hands off.
  let mini = gain.mini
  if (model.bars != null) {
    // Multi-bar gain is managed only when each bar is a single column
    // (`perBar === 1`, steps === bars) — there bars ≡ columns, so the gain is a
    // flat sequence wrapped in `<...>`, mirroring serializeRollGain (#632). The
    // inner is read exactly like the single-bar flat sequence below. Subdivided
    // bars (perBar > 1) need a nested gain mini and stay unmanaged → hand off.
    const inner = model.steps === model.bars ? unwrapAlternation(mini) : null
    if (inner === null) return { ...model, gainForeign: true }
    mini = inner
  }
  const byStart = new Map<number, number>()
  let col = 0
  for (const t of mini.trim().split(/\s+/).filter((s) => s !== '')) {
    if (t === '~') {
      col += 1
      continue
    }
    const m = t.match(/^(\d+(?:\.\d+)?)(?:@(\d+))?$/)
    if (!m) return { ...model, gainForeign: true }
    byStart.set(col, parseFloat(m[1]))
    col += m[2] ? parseInt(m[2], 10) : 1
  }
  if (col !== model.steps) return { ...model, gainForeign: true } // grid mismatch
  const noteStarts = new Set(model.notes.map((n) => n.start))
  for (const [c, v] of byStart) {
    // a non-neutral gain at a column with no note onset isn't ours to manage
    if (v !== 1 && !noteStarts.has(c)) return { ...model, gainForeign: true }
  }
  return {
    ...model,
    notes: model.notes.map((n) => {
      const v = byStart.get(n.start)
      return v != null && v !== 1 ? { ...n, gain: v } : n
    }),
  }
}

/* ── piano roll ────────────────────────────────────────────────── */

export function parsePianoRoll(mini: string): ParseResult<PianoRollModel> {
  const alt = unwrapAlternation(mini)
  // A top-level `,`-stack = parallel note lanes (independent durations / overlap,
  // #628). Only when NOT an alternation — multi-bar `<...>` lanes are out of scope.
  if (alt === null) {
    const parts = splitTopLevel(mini)
    if (parts.length > 1) return parseRollLanes(parts)
  }
  const tok = tokenize(alt ?? mini, /* allowNumeric */ true)
  if (!tok.ok) return tok
  if (alt !== null && tok.steps.length === 0) return { ok: false, reason: 'empty alternation' }

  const div = division(tok.steps)
  const bars = tok.steps.reduce((b, s) => b + s.elongation, 0)
  if ((div > 1 || alt !== null) && bars * div > MAX_STEPS) {
    return { ok: false, reason: `sub-sequences expand the roll past ${MAX_STEPS} steps` }
  }
  const notes: RollNote[] = []
  let col = 0
  // A pattern is numeric (`note("60 62")` / `n("0 1 2")`) or note-named
  // (`c3 e3`), never both — mixing is rejected. New/dragged notes must emit
  // the same convention so the pattern round-trips (#469).
  let sawNumeric = false
  let sawNamed = false
  for (const step of tok.steps) {
    const slots = step.sub ?? [{ atoms: step.atoms, units: 1 }]
    const total = stepUnits(step)
    for (const slot of slots) {
      const span = (step.elongation * div * slot.units) / total
      for (const token of slot.atoms) {
        const isNum = /^-?\d+$/.test(token)
        if (!isNum && pitchToMidi(token) === null) {
          return { ok: false, reason: `"${token}" is not a note name` }
        }
        if (isNum) sawNumeric = true
        else sawNamed = true
        // numbers have no case; only fold note names
        notes.push({ pitch: isNum ? token : token.toLowerCase(), start: col, duration: span })
      }
      col += span
    }
  }
  if (sawNumeric && sawNamed) {
    return { ok: false, reason: 'mixed numeric and note-name tokens are beyond the editable subset' }
  }
  return {
    ok: true,
    model: {
      steps: col,
      ...(alt !== null ? { bars } : {}),
      notes,
      ...(sawNumeric ? { numeric: true } : {}),
    },
  }
}

/**
 * Parse a top-level `,`-stack of parallel note lanes into one model (#628). Each
 * part is an independent single-bar roll; the lanes must share a step grid
 * (Strudel normalizes each comma-part to its own width, so unequal widths would
 * misalign the grids) and one numeric/named convention. Notes union across lanes
 * — cross-lane overlap is the point; each part is itself overlap-free by parse.
 */
function parseRollLanes(parts: string[]): ParseResult<PianoRollModel> {
  const models: PianoRollModel[] = []
  for (const part of parts) {
    const r = parsePianoRoll(part.trim())
    if (!r.ok) return r
    if (r.model.bars != null) {
      return { ok: false, reason: 'multi-bar parallel note lanes are beyond the editable subset' }
    }
    models.push(r.model)
  }
  const steps = models[0].steps
  if (!models.every((m) => m.steps === steps)) {
    return { ok: false, reason: 'parallel note lanes must share a step grid' }
  }
  const numeric = models.some((m) => m.numeric)
  if (numeric && models.some((m) => !m.numeric && m.notes.length > 0)) {
    return { ok: false, reason: 'mixed numeric and note-name lanes are beyond the editable subset' }
  }
  const notes = models.flatMap((m) => m.notes)
  return { ok: true, model: { steps, notes, ...(numeric ? { numeric: true } : {}) } }
}
