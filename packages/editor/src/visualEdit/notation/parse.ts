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
import { mini as reifyMini } from '@strudel/mini/mini.mjs'
import { bjorklund, rotateEuclid } from '../../ir/euclid'
import { serializeByLeaf, serializeStepGrid, serializePianoRoll } from './serialize'
import type {
  AltRegion,
  AltSource,
  ChunkGain,
  Gate,
  GridCells,
  LeafAnchor,
  LeafSpan,
  NotationSource,
  ParseResult,
  PianoRollModel,
  RollLeafAnchor,
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
 * The euclid distribution + rotation now live in ONE place (`ir/euclid.ts`) —
 * this file and `ir/parseMini.ts` each carried their own copy until #943, and
 * they had already drifted: this one inverts a negative `k` (Strudel's real
 * behaviour, #917) while the IR's returned empty. Re-exported because the
 * notation tests import `bjorklund` from here.
 */
// Imported (not just re-exported) — this file calls both below, and a bare
// `export … from` would re-export them without binding them in module scope.
export { bjorklund, rotateEuclid }

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
  if (t.length < 2 || !t.startsWith('<') || !t.endsWith('>')) return null
  // The opening `<` must close only at the FINAL `>`: `<a> <b>` is TWO
  // alternations, not one, and stripping its ends yields `a> <b` — garbage that
  // then refuses downstream. Depth returning to 0 before the end means the outer
  // brackets don't enclose the whole string.
  let depth = 0
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '<') depth++
    else if (t[i] === '>' && --depth === 0 && i !== t.length - 1) return null
  }
  return t.slice(1, -1)
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
  /**
   * The element's total WEIGHT — its steps' elongations summed (`bd` 1, `bd@3`
   * 3, `bd!3` 3, `[a b]` 1). Columns are `weight * div` in both views, which is
   * why the region builder is shared: the grid refuses elongation, so there
   * weight is just the step count, while the roll's `c4@2` is one element owning
   * two columns. Counting STEPS instead would be right for the grid and quietly
   * wrong for the roll.
   */
  weight: number
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
    if (loc) {
      elements.push({
        start: loc.start.offset - 1,
        end: loc.end.offset - 1,
        weight: mapped.reduce((w, s) => w + s.elongation, 0),
      })
    }
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
 * unedited ones back verbatim (#913 for the grid, #916 for the roll).
 *
 * An element owns `weight * div` columns, in source order — see
 * `ElementSpan.weight`. `content` answers what the view showed there; that is
 * the only part of this that is a view's business.
 *
 * Returns null unless the spans TILE — concatenating them reproduces the source
 * exactly — AND the columns add up to the grid the model reports. Both hold for
 * every flat mini in the real corpus, and both are checked rather than trusted:
 * the whole mechanism is "copy the bytes we did not touch", so a hole in the
 * tiling would copy the WRONG bytes, silently. Cheaper to verify than to debug,
 * and a failure here just means the caller writes the way it always did.
 */
function buildRegions<C>(
  src: string,
  elements: ElementSpan[],
  div: number,
  total: number,
  content: (from: number, to: number) => C,
): SourceRegion<C>[] | null {
  if (elements.length === 0) return null
  const regions: SourceRegion<C>[] = []
  let col = 0
  for (const el of elements) {
    const raw = src.slice(el.start, el.end)
    const leading = /^\s*/.exec(raw)?.[0] ?? ''
    const trailing = /\s*$/.exec(raw.slice(leading.length))?.[0] ?? ''
    const to = col + el.weight * div
    regions.push({ raw, leading, trailing, from: col, to, content: content(col, to) })
    col = to
  }
  if (col !== total) return null
  if (regions.map((r) => r.raw).join('') !== src) return null
  return regions
}

/** the grid's view of a span of columns — the sounds in each, deduped (see `SourceRegion`) */
const gridContent =
  (cells: GridCells) =>
  (from: number, to: number): GridCells =>
    cells.slice(from, to).map((c) => [...new Set(c)])

/**
 * The roll's view of a span of columns: the notes STARTING in it.
 *
 * Start decides ownership, so a held `c4@2` belongs to the element that wrote
 * it and not also to the one it sustains over. `gain` is deliberately dropped —
 * velocity lives in a separate `.gain(…)` argument, so nudging it must not make
 * the notation look edited.
 */
const rollContent =
  (notes: RollNote[]) =>
  (from: number, to: number): RollNote[] =>
    notes
      .filter((n) => n.start >= from && n.start < to)
      .map((n) => ({ pitch: n.pitch, start: n.start, duration: n.duration }))

/**
 * The one-part source shared by the flat and alternation paths: the whole mini
 * is a single part on the shared grid, so its columns ARE the grid's columns
 * (`factor` 1) and it carries no separator.
 */
function singlePart<C>(
  src: string,
  elements: ElementSpan[],
  div: number,
  total: number,
  content: (from: number, to: number) => C,
): SourcePart<C>[] | null {
  const regions = buildRegions(src, elements, div, total, content)
  return regions ? [{ part: 0, div, factor: 1, before: '', after: '', regions }] : null
}

/* ── `<...>` as a sequence element (#920) ──────────────────────── */

/**
 * The per-cycle alternatives of a `<...>` element — the elements of the single
 * inner fastcat krill nests under `polymeter_slowcat` (`<a b>` parses as
 * slowcat[ fastcat[a, b] ], one slot per cycle). null when `el` is not a plain
 * `<...>` alternation (an atom, or a `.`/`|` variant we don't bar-expand).
 */
function altAlternatives(el: KElement): KElement[] | null {
  const p = el.source_
  if (isAtom(p) || p.arguments_?.alignment !== 'polymeter_slowcat') return null
  // An op on the alternation ITSELF — `<a b>*2`, `<a b>/2`, `<a b>@2`, `<a b>!2` —
  // changes the column math (a stretch speeds the whole alternation, an elongation
  // holds it across bars) and is beyond phase 1. Decline so it refuses cleanly
  // rather than dropping the op and reshaping the line.
  const o = el.options_
  if (o && ((o.weight ?? 1) !== 1 || (o.reps ?? 1) !== 1 || (o.ops?.length ?? 0) > 0)) return null
  const inner = p.source_[0] as unknown as KPattern | undefined
  if (!inner || inner.type_ !== 'pattern' || inner.arguments_?.alignment !== 'fastcat') return null
  return inner.source_
}

/** the bar-expansion of a fastcat that contains `<...>` alternation elements */
interface AltExpansion {
  bars: number
  div: number
  perBarCols: number
  perBarSteps: Step[][]
  /** each single-cycle top-level element: its bytes and its width (`weight * div` columns) */
  elemSpans: { start: number; end: number; weight: number }[]
}

/**
 * Expand `bd <sd hh>` into one cycle per alternation slot: `bars` = LCM of the
 * alternation lengths, and bar b takes each alternation's (b mod n)-th slot. The
 * source stays a single cycle — its top-level elements tiling it — so the writer
 * puts unchanged ones back verbatim (see AltSource).
 *
 * A single global `div` (LCM across every bar) keeps all bars on one column grid,
 * so a clean rectangle is exactly "every bar the same step count". Returns:
 *   null    → not this shape (no alternation element, or not a fastcat) — the
 *             caller's flat path takes over;
 *   Refused → a real limit: a branch of a different expanded length (the
 *             reconciliation case, deferred to phase 1b), a nested `<...>` inside
 *             a branch, or a blow-up past MAX_STEPS. The panel stays closed
 *             rather than open a grid the writer can't put back.
 */
function expandAltElements(mini: string, allowNumeric: boolean): AltExpansion | Refused | null {
  const src = mini.trim()
  let ast: KPattern
  try {
    ast = krillParse('"' + src + '"') as KPattern
  } catch {
    return null
  }
  if (!ast || ast.type_ !== 'pattern' || ast.arguments_?.alignment !== 'fastcat') return null
  const topEls = ast.source_
  if (!topEls.some((el) => altAlternatives(el) !== null)) return null

  let bars = 1
  for (const el of topEls) {
    const alts = altAlternatives(el)
    if (alts) {
      if (alts.length === 0) return { reason: 'empty alternation' }
      bars = lcm(bars, alts.length)
    }
  }

  const perBarSteps: Step[][] = []
  const elemWeight: number[] = []
  for (let b = 0; b < bars; b++) {
    const barSteps: Step[] = []
    for (let i = 0; i < topEls.length; i++) {
      const alts = altAlternatives(topEls[i])
      const node = alts ? alts[b % alts.length] : topEls[i]
      const st = elementToSteps(node, allowNumeric)
      if (!Array.isArray(st)) return { reason: st.reason }
      // Every bar must lay the same element down at the same WIDTH, or its
      // columns won't line up bar-to-bar. Width is the summed elongation (a step
      // count is only that when nothing carries `@n` — right for the grid, wrong
      // for the roll where `c4@2` is one step spanning two columns). A branch that
      // expands to a different width (`!n`, `@n`, a wider group) is the
      // reconciliation case — declined here, deferred to phase 1b.
      const w = st.reduce((s, step) => s + step.elongation, 0)
      if (b === 0) elemWeight[i] = w
      else if (w !== elemWeight[i]) {
        return { reason: 'alternation branches of different lengths are beyond the editable subset' }
      }
      barSteps.push(...st)
    }
    perBarSteps.push(barSteps)
  }

  // No location on an element means a hole in the tiling — a hole would copy the
  // wrong bytes back, so refuse rather than guess.
  if (topEls.some((el) => !el.location_)) return { reason: 'unsupported mini-notation syntax' }
  // An element wider than one step (`c4@2`, `[a b]@2`) can't be re-emitted through
  // the per-bar `<...>` wrapper without changing its weight — `c4@2` edited would
  // come back `<d4@2 c4@2>`, which is weight 1, re-dividing the cycle and shifting
  // every neighbour. Preserving the weight (`<d4 c4>@2`) is the reconciliation case
  // (phase 1b); until then, an alt pattern carrying any elongated element stays
  // code-only rather than risk wrong bytes on edit.
  if (elemWeight.some((w) => w > 1)) {
    return { reason: 'an elongated element in an alternation pattern is beyond the editable subset' }
  }
  const div = perBarSteps.reduce((d, steps) => lcm(d, division(steps)), 1)
  const perBarCols = elemWeight.reduce((n, c) => n + c, 0) * div
  if (perBarCols * bars > MAX_STEPS) {
    return { reason: `the alternation expands past ${MAX_STEPS} steps` }
  }
  const elemSpans = topEls.map((el, i) => ({
    start: el.location_!.start.offset - 1,
    end: el.location_!.end.offset - 1,
    weight: elemWeight[i],
  }))
  return { bars, div, perBarCols, perBarSteps, elemSpans }
}

/**
 * Regions for an alt-element source: one per single-cycle top-level element,
 * tiling the source, each carrying its per-bar view content. Returns null if the
 * spans don't reconstruct the source or the columns don't add up — then the
 * caller declines rather than open a grid it cannot put back.
 */
function buildAltRegions<C>(
  src: string,
  elemSpans: { start: number; end: number; weight: number }[],
  div: number,
  perBarCols: number,
  content: (from: number, to: number) => C[],
): AltRegion<C>[] | null {
  const regions: AltRegion<C>[] = []
  let col = 0
  for (const es of elemSpans) {
    const raw = src.slice(es.start, es.end)
    const leading = /^\s*/.exec(raw)?.[0] ?? ''
    const trailing = /\s*$/.exec(raw.slice(leading.length))?.[0] ?? ''
    const to = col + es.weight * div
    regions.push({ raw, leading, trailing, from: col, to, perBar: content(col, to) })
    col = to
  }
  if (col !== perBarCols) return null
  if (regions.map((r) => r.raw).join('') !== src) return null
  return regions
}

/**
 * `bd <sd hh>` — a `<...>` alternation sitting inside the sequence. Each bar is
 * one cycle of the expansion; the source stays the single cycle the user wrote.
 * null → not this shape (the flat path handles it).
 */
function gridFromAltElements(mini: string): ParseResult<StepGridModel> | null {
  const exp = expandAltElements(mini, false)
  if (exp === null) return null
  if ('reason' in exp) return { ok: false, reason: exp.reason }
  const { bars, div, perBarCols, perBarSteps, elemSpans } = exp
  if (perBarSteps.some(gridHasElongation)) {
    return { ok: false, reason: 'elongation is beyond the drum-grid subset' }
  }
  const cells: string[][] = []
  for (const steps of perBarSteps) cells.push(...toCells(steps, div))
  const lanes = lanesFromCells(cells)
  const src = mini.trim()
  const regions = buildAltRegions<GridCells>(src, elemSpans, div, perBarCols, (from, to) => {
    const perBar: GridCells[] = []
    for (let b = 0; b < bars; b++) {
      perBar.push(cells.slice(from + b * perBarCols, to + b * perBarCols).map((c) => [...new Set(c)]))
    }
    return perBar
  })
  if (!regions) return { ok: false, reason: 'unsupported mini-notation syntax' }
  return {
    ok: true,
    model: { steps: cells.length, bars, lanes, altSource: { perBar: perBarCols, bars, div, regions } },
  }
}

/* ── behaviour projection: the inherited fallback (#922) ────────── */

/** smallest denominator `d` (≤ cap) with `x·d` integral, or 0 if none */
function denom(x: number, cap = MAX_STEPS): number {
  for (let d = 1; d <= cap; d++) if (Math.abs(x * d - Math.round(x * d)) < 1e-9) return d
  return 0
}

/**
 * Cycles probed when establishing a pattern's period (#930).
 *
 * A pattern that has not repeated by here is treated as non-repeating — `irand`,
 * `shuffle`, a `/n` slower than the window — and refused. Projecting a prefix of
 * it would show a grid that stops being true on the very next cycle, which is
 * worse than an honest refusal.
 */
const PERIOD_PROBE = 24

/**
 * The most bars the projection will bar-expand across.
 *
 * Bounded by re-emit READABILITY, not by the column arithmetic: `spliceAltGrid`
 * writes an edited element as `<b0 b1 …>`, one slot per bar, so a large period
 * turns a single cell toggle into a wall of alternation. `MAX_STEPS` still caps
 * the `perBar × bars` product independently, and is the binding constraint for
 * anything but a coarse bar.
 */
const MAX_PROJECT_BARS = 4

/* ── refusal gates (#990) ──────────────────────────────────────────────────── */

/** a projection's outcome: a model, or the gate that stopped it */
type Projection<M> = { ok: true; model: M } | { ok: false; gate: Gate }

/** decline at `gate` — the only way a projection says no */
const no = (gate: Gate): { ok: false; gate: Gate } => ({ ok: false, gate })

/** the onsets a surface read, or the gate that stopped the read */
type Read<T> = { ok: true; onsets: T } | { ok: false; gate: Gate }

/** which view is speaking — only `wrong-surface` needs to name the other one */
type Surface = 'grid' | 'roll'

/** the sentence a gate says, in the voice of the view that declined */
function gateReason(gate: Gate, surface: Surface): string {
  switch (gate) {
    case 'wrong-surface':
      return surface === 'grid'
        ? 'the pattern plays numbers, which the piano roll shows, not the step grid'
        : 'the pattern plays sound names, which the step grid shows, not the piano roll'
    case 'no-note-content':
      return 'the pattern plays no placeable notes'
    case 'unstable-period':
      return `the pattern does not repeat within ${MAX_PROJECT_BARS} bars`
    case 'mixed-pitch-domain':
      // deliberately NOT the core's "…is beyond the editable subset" phrasing:
      // the gate vocabulary has to be distinguishable from the syntactic core's,
      // or "did the reason come from a gate?" stops being answerable
      return 'the pattern mixes numeric and note-name pitches'
    case 'irrational-onset':
      return 'an onset does not land on any step column'
    case 'resolution':
      return `the pattern needs more than ${MAX_STEPS} steps`
    case 'element-tiling':
      // The ELEMENT writer's own vocabulary, and currently never surfaced —
      // `refused` reports the leaf writer's gate, and the leaf writer has no
      // notion of tiling. Kept because it is what that writer actually means at
      // each of its refusal points, and because the two writers unify later;
      // deliberately not deleted into a vaguer shared label that would make its
      // refusals unreadable in the meantime.
      return 'the source elements do not line up with the columns the pattern plays'
    case 'no-leaf-anchor':
      return 'a played note has no source token of its own to edit'
    case 'edit-unsafe':
      return 'an edit here would not write back the pattern as shown'
    case 'view-unusable':
      return 'nothing in this view could be edited on its own'
    case 'not-a-pattern':
      return 'unsupported mini-notation syntax'
  }
}

/**
 * The refusal a caller sees once every writer has declined.
 *
 * The reported gate is the LEAF projection's, and that choice is the whole point
 * of #990. The leaf writer is the GENERAL write-back — it needs only that each
 * played note own a disjoint source token — while the element re-emit it
 * supersedes additionally needs the source's top-level elements to tile the
 * played columns. So the leaf writer's obstruction is the answer to "what would
 * have to change for this pattern to be editable", and the element writer's is a
 * fact about a specialization.
 *
 * Measured over the 1500-unit corpus, reporting the DEEPEST gate across both
 * writers instead is actively misleading: the element writer checks for a
 * whole-cycle `<…>` BEFORE it reads a single hap, so 144 units reported a tiling
 * problem while the truth — read one line later by the leaf writer — was that 65
 * of them are the wrong surface entirely and 58 never repeat. A gate that fires
 * before the values are even read is not progress.
 *
 * When nothing reified there is no projection verdict worth having, and the
 * syntactic core's own message — which names the actual syntax — is kept.
 */
function refused<M>(
  surface: Surface,
  core: { ok: false; reason: string },
  gate: Gate,
): ParseResult<M> {
  if (gate === 'not-a-pattern') return core
  return { ok: false, reason: gateReason(gate, surface), gate }
}

/**
 * The smallest `p ≤ cap` at which the probed cycles repeat, or 0 if none does.
 *
 * Checks EVERY probed cycle against its representative (`keys[c % p]`), not just
 * the first repeat — a pattern that happens to match at cycle p but diverges at
 * 2p is not period-p, and bar-expanding it would silently drop the divergence.
 */
function detectPeriod(keys: string[], cap: number): number {
  for (let p = 1; p <= cap; p++) {
    let ok = true
    for (let c = p; c < keys.length; c++) {
      if (keys[c] !== keys[c % p]) {
        ok = false
        break
      }
    }
    if (ok) return p
  }
  return 0
}

/**
 * True when the whole pattern is a single `<…>` alternation element (`<a b>*8`,
 * `<a b c>`). Those belong to the alternation path (bars, #920) — one region per
 * bar so an edit stays byte-local — not to the flat projection, which owns the
 * whole `<…>` as one span and would FLATTEN it on edit, losing the compact form
 * (caught by the edit-locality gate). Decline and leave it to the alternation
 * work rather than offer a grid that isn't byte-local per bar.
 */
function isWholeAlternation(src: string): boolean {
  let ast: KPattern
  try {
    ast = krillParse('"' + src + '"') as KPattern
  } catch {
    return false
  }
  if (ast?.type_ !== 'pattern' || ast.arguments_?.alignment !== 'fastcat') return false
  if (ast.source_.length !== 1) return false
  const inner = ast.source_[0]?.source_ as KPattern | undefined
  return inner?.type_ === 'pattern' && inner.arguments_?.alignment === 'polymeter_slowcat'
}

/** top-level fastcat elements from krill: byte span + unit weight, or null */
function topLevelSpans(src: string): ElementSpan[] | null {
  let ast: KPattern
  try {
    ast = krillParse('"' + src + '"') as KPattern
  } catch {
    return null
  }
  if (!ast || ast.type_ !== 'pattern' || ast.arguments_?.alignment !== 'fastcat') return null
  const out: ElementSpan[] = []
  for (const el of ast.source_) {
    const loc = el.location_
    if (!loc) return null
    const reps = el.options_?.reps ?? 1
    const weight = reps > 1 ? reps : el.options_?.weight ?? 1
    if (!Number.isInteger(weight) || weight < 1) return null
    out.push({ start: loc.start.offset - 1, end: loc.end.offset - 1, weight })
  }
  return out
}

/**
 * A leaf atom's OWN source span, in `src`-space (offsets into the inner mini
 * string), read from a hap's `context.locations`. Strudel's `mini()` calls
 * `.withLoc` on each atom pure (`mini.mjs` `patternifyAST` → `pattern.mjs`
 * `withLoc`), so a nested atom carries its own token span, not its container's:
 * `s("a [b c]")` gives the `c` hap the span of `c`, never `[b c]`. This is the
 * anchor #986 P1 writes back through — span surgery at the note's own leaf loc
 * instead of the top-level element span — so structures with internal structure
 * (`[a [b c]]`, `[a b]*2`) stop breaking the cell↔leaf-span bijection.
 *
 * Lives in `model.ts` (the write-back models carry it); re-exported here because
 * this is where the haps are read.
 */
export type { LeafSpan }

/**
 * The leaf atom's span for a hap, from `context.locations[0]`, shifted to
 * `src`-space. Within a bare reified mini string (no method chain) the leaf's own
 * location is FIRST — an inline op's mini arg (`*2`, `(3,8)`) contributes its
 * location AFTER, in source order. The `.scale("…")`-style prepend that pushes the
 * leaf last only happens for a method whose arg is a mini STRING, which
 * `gridOnsets`/`rollOnsets` never see: they reify the inner string alone. The
 * stored offsets count the leading quote `mini()` adds, so subtract 1. Verified
 * token-for-token against krill in `leafLoc.test.ts`. `null` when a hap carried no
 * usable location.
 */
function leafLoc(h: {
  context?: { locations?: Array<{ start: number; end: number }> }
}): LeafSpan | null {
  const l = h.context?.locations?.[0]
  if (!l || typeof l.start !== 'number' || typeof l.end !== 'number') return null
  return { start: l.start - 1, end: l.end - 1 }
}

export interface Onset {
  pos: number
  atoms: string[]
  /** leaf span per atom, index-aligned with `atoms`; `null` where none was carried */
  spans: (LeafSpan | null)[]
}

/**
 * Read what a step-grid pattern PLAYS, one cycle, as onset columns — inherited
 * from Strudel (`reifyMini(...).queryArc`), never re-derived here. The value the
 * engine yields IS the ground truth for "what sound fires when"; the display
 * token is `s` (+`:n` when a sample index rides along). Returns null when the
 * pattern isn't a plain sound grid the view can show — a numeric value (that is
 * the roll's, not the grid's), a `.gain`/signal-only hap, or a query that throws.
 */
export function gridOnsets(pat: unknown, cyc: number): Onset[] | null {
  const r = readGridOnsets(pat, cyc)
  return r.ok ? r.onsets : null
}

/**
 * `gridOnsets`, saying WHY when it declines (#990).
 *
 * The distinction the plain `null` could not make, and the one that dominates
 * every refusal count: a pattern that plays NUMBERS is not a broken grid, it is
 * the piano roll's (`wrong-surface`), while a pattern whose haps carry params or
 * a signal has nothing placeable at all (`no-note-content`). Reporting both as
 * one failure is what made a drum pattern politely declining the roll read as an
 * editability gap.
 */
function readGridOnsets(pat: unknown, cyc: number): Read<Onset[]> {
  let haps: Array<{
    hasOnset?: () => boolean
    whole?: { begin: { valueOf(): number } }
    value: unknown
    context?: { locations?: Array<{ start: number; end: number }> }
  }>
  try {
    haps = (pat as { queryArc(a: number, b: number): typeof haps }).queryArc(cyc, cyc + 1)
  } catch {
    return no('no-note-content')
  }
  const byCol = new Map<number, { atoms: string[]; spans: (LeafSpan | null)[] }>()
  for (const h of haps) {
    if (!(h.hasOnset?.() ?? false) || !h.whole) continue
    // A bare mini string reifies to raw token VALUES (`"bd"`), not superdough
    // params — that is what `parseStepGrid` receives (the inner string of
    // `s("…")`). Accept both: a string token, or an `{s,n}` object if a caller
    // ever reifies in sound context.
    const v = h.value as string | number | { s?: unknown; n?: unknown } | null
    let token: string
    if (typeof v === 'string') token = v
    else if (typeof v === 'number') return no('wrong-surface') // a pitch, not a sound
    else if (v && typeof v === 'object' && typeof v.s === 'string') {
      token = v.s + (v.n != null ? ':' + String(v.n) : '')
    } else return no('no-note-content')
    if (NUMERIC.test(token)) return no('wrong-surface') // a bare number is the roll's
    const pos = h.whole.begin.valueOf() - cyc
    const key = Math.round(pos * 720720)
    const cell = byCol.get(key) ?? { atoms: [], spans: [] }
    // one span per distinct token in the column — the note's OWN leaf loc, the
    // #986 write-back anchor. A `*n`/euclid element yields the same leaf at several
    // columns (N cells, one span); a `,`-stack lands two leaves on one column (two
    // spans) — both are recorded faithfully; the bijection gate is P2's, not here.
    if (!cell.atoms.includes(token)) {
      cell.atoms.push(token)
      cell.spans.push(leafLoc(h))
    }
    byCol.set(key, cell)
  }
  return {
    ok: true,
    onsets: [...byCol.entries()].map(([k, c]) => ({
      pos: k / 720720,
      atoms: c.atoms,
      spans: c.spans,
    })),
  }
}

const onsetKey = (o: Onset[]): string =>
  JSON.stringify(o.map((x) => [Math.round(x.pos * 720720), [...x.atoms].sort()]).sort())

/**
 * The inherited fallback for the step grid (#922): when the syntactic parse
 * refuses, PROJECT the pattern's haps onto a cell grid instead of modelling its
 * syntax. Any pattern that plays a stable, rational, single-cycle grid becomes
 * editable — nested groups, `[…]`-with-ops, a static `<…>*n` — regardless of how
 * the syntax nests, because the grid shows what it PLAYS.
 *
 * The write-back is unchanged: the top-level element spans (krill) tile the
 * source, so `serializeStepGrid`'s span surgery copies unedited elements verbatim
 * and re-emits only the edited one. Returns null (keep the caller's refusal) when
 * the pattern isn't a static single-cycle sound grid — a `,`-stack, a per-cycle
 * alternation (that is the bars path, and projecting cycle 0 would DROP the other
 * cycles), a blow-up past the step ceiling, or spans that don't tile.
 */
function projectStepGrid(src0: string): Projection<StepGridModel> {
  const src = src0.trim()
  if (src === '') return no('not-a-pattern')
  let pat: unknown
  try {
    pat = reifyMini(src)
  } catch {
    return no('not-a-pattern')
  }
  // A whole-cycle `<…>` is not the FLAT projection's to take — owning it as one
  // region would re-spell the whole pattern on the first edit. It is still worth
  // projecting, just bar-wise, with the branches as regions (#930 phase B). A
  // `<…>` carrying trailing ops (`<a b>*2`) has no branch tiling to write back
  // through, so it stays refused.
  const whole = isWholeAlternation(src) ? unwrapAlternation(src) : null
  if (isWholeAlternation(src) && whole === null) return no('element-tiling')
  // What it PLAYS, cycle by cycle, and the period it repeats at. A pattern that
  // varies across cycles is no longer refused (#930): each cycle becomes a bar and
  // the source stays the single cycle the user wrote, so an edit re-emits one
  // element as `<b0 b1 …>` and leaves every other byte alone.
  const cycles: Onset[][] = []
  for (let c = 0; c < PERIOD_PROBE; c++) {
    const cc = readGridOnsets(pat, c)
    if (!cc.ok) return cc
    cycles.push(cc.onsets)
  }
  const bars = detectPeriod(cycles.map(onsetKey), MAX_PROJECT_BARS)
  if (bars === 0) return no('unstable-period')
  const perCycle = cycles.slice(0, bars)
  // A pattern that plays nothing at all is not a grid to offer. Identical to the
  // old `cyc0.length === 0` refusal when the period is 1.
  if (perCycle.every((c) => c.length === 0)) return no('no-note-content')
  // a whole-cycle `<…>`: bars are its branches, not a flat sequence's columns
  if (whole !== null) {
    return bars > 1 ? projectAltBars(src, whole, perCycle, bars) : no('element-tiling')
  }
  const spans = topLevelSpans(src)
  if (!spans) return no('element-tiling')
  const totalWeight = spans.reduce((s, e) => s + e.weight, 0)
  // element boundaries (cumulative weight) must land on integer columns too, or
  // the regions can't tile the grid
  const bounds: number[] = []
  let accW = 0
  for (const e of spans) {
    bounds.push(accW / totalWeight)
    accW += e.weight
  }
  // One column resolution shared by every bar: the alt writer indexes a region as
  // `from + b * perBar`, so bars that disagreed on width could not be strided.
  let perBar = 1
  for (const x of [...perCycle.flat().map((o) => o.pos), ...bounds]) {
    const d = denom(x)
    if (d === 0) return no('irrational-onset')
    perBar = lcm(perBar, d)
  }
  if (perBar * bars > MAX_STEPS) return no('resolution')
  if (perBar % totalWeight !== 0) return no('element-tiling')
  const divPerUnit = perBar / totalWeight
  const cells: GridCells = Array.from({ length: perBar * bars }, () => [])
  for (let b = 0; b < bars; b++) {
    for (const o of perCycle[b]) {
      const c = Math.round(o.pos * perBar)
      if (c < 0 || c >= perBar) return no('irrational-onset')
      cells[b * perBar + c] = [...new Set(o.atoms)]
    }
  }
  const lanes = lanesFromCells(cells)

  if (bars === 1) {
    // The single-cycle projection, unchanged: a flat `source` the span writer
    // splices. Kept as its own branch so #930 cannot move what #922 already ships.
    const parts = singlePart(src, spans, divPerUnit, perBar, gridContent(cells))
    if (!parts) return no('element-tiling')
    const model: StepGridModel = {
      steps: perBar,
      lanes,
      source: { prefix: '', suffix: '', parts },
    }
    const cols0 = parts[0].regions.map((r) => r.from)
    if (!projectionEditSafe(model, perBar, 1, perCycle, cols0)) return no('edit-unsafe')
    return { ok: true, model }
  }

  // Bar-expanded: the SAME source shape the `<…>`-as-element path builds (#920), so
  // `spliceAltGrid` writes it back with no writer change — each single-cycle element
  // owns a within-bar column span and remembers what it showed in each bar.
  const regions = buildAltRegions<GridCells>(src, spans, divPerUnit, perBar, (from, to) =>
    Array.from({ length: bars }, (_, b) =>
      cells.slice(from + b * perBar, to + b * perBar).map((c) => [...new Set(c)]),
    ),
  )
  if (!regions) return no('element-tiling')
  const model: StepGridModel = {
    steps: perBar * bars,
    bars,
    lanes,
    altSource: { perBar, bars, div: divPerUnit, regions },
  }
  // each region is a within-bar span, so it is probed once per bar
  const cols = regions.flatMap((r) =>
    Array.from({ length: bars }, (_, b) => b * perBar + r.from),
  )
  if (!projectionEditSafe(model, perBar, bars, perCycle, cols)) return no('edit-unsafe')
  return { ok: true, model }
}

/**
 * A whole-cycle `<…>` the syntactic alternation path refused (#930 phase B).
 *
 * The flat projection declines these because it would own the entire `<…>` as ONE
 * region and re-spell all of it on the first edit. Projected as BARS the shape is
 * right: the alternation's own branches are the regions, one per bar, exactly as
 * `gridFromAlternation` lays them out — so an edit rewrites the branch it touched
 * and every other branch rides back byte-for-byte.
 *
 * Content still comes from what the pattern PLAYS, which is the point: the branch
 * bytes may be syntax the model cannot parse (a nested group, a euclid with ops),
 * and they never have to be parsed — only preserved.
 */
function projectAltBars(
  src: string,
  inner: string,
  perCycle: Onset[][],
  bars: number,
): Projection<StepGridModel> {
  const innerSrc = inner.trim()
  const spans = topLevelSpans(innerSrc)
  if (!spans) return no('element-tiling')
  // one top-level element per BAR — a branch repeated `!n` claims n of them, and
  // the bar count has to come out exactly or the branches don't line up with cycles
  if (spans.reduce((s, e) => s + e.weight, 0) !== bars) return no('element-tiling')
  let perBar = 1
  for (const o of perCycle.flat()) {
    const d = denom(o.pos)
    if (d === 0) return no('irrational-onset')
    perBar = lcm(perBar, d)
  }
  if (perBar * bars > MAX_STEPS) return no('resolution')
  const cells: GridCells = Array.from({ length: perBar * bars }, () => [])
  for (let b = 0; b < bars; b++) {
    for (const o of perCycle[b]) {
      const c = Math.round(o.pos * perBar)
      if (c < 0 || c >= perBar) return no('irrational-onset')
      cells[b * perBar + c] = [...new Set(o.atoms)]
    }
  }
  // a branch spans one bar's worth of columns, so the per-unit division IS perBar
  const parts = singlePart(innerSrc, spans, perBar, perBar * bars, gridContent(cells))
  if (!parts) return no('element-tiling')
  const model: StepGridModel = {
    steps: perBar * bars,
    bars,
    lanes: lanesFromCells(cells),
    source: {
      parts,
      prefix: '<' + (/^\s*/.exec(inner)?.[0] ?? ''),
      suffix: (/\s*$/.exec(inner)?.[0] ?? '') + '>',
    },
  }
  // regions already sit one per bar, so each is probed once, at its own start
  const cols = parts[0].regions.map((r) => r.from)
  if (!projectionEditSafe(model, perBar, bars, perCycle, cols)) return no('edit-unsafe')
  // the writer must reproduce the user's bytes before we offer the view at all
  if (serializeStepGrid(model) !== src.trim()) return no('edit-unsafe')
  return { ok: true, model }
}

/** an improbable sound token used to probe an edit; won't collide with real content */
const PROBE_SOUND = '__stave_probe__'

/**
 * The projection may only OFFER a grid the writer can reproduce under edit. Probe
 * every source region — overlay a marker in its first column, serialize, re-query
 * — and require the haps to be exactly the originals plus that marker. Declines
 * the patterns whose span re-emit breaks (a `_` sustain whose span ate the
 * separator merges tokens on edit — the #904 class), so the projection never
 * shows a grid that would corrupt on the first click. Uses the REAL writer and
 * the REAL engine, so it can't drift from either.
 */
function projectionEditSafe(
  model: StepGridModel,
  perBar: number,
  bars: number,
  base: Onset[][],
  probeCols: number[],
): boolean {
  // Columns are ABSOLUTE model columns, supplied by the caller, because the two
  // bar-expanded shapes index differently: an alt-element source's regions are
  // within-bar spans repeated across bars, a whole-alternation's regions are the
  // branches and already sit one per bar.
  for (const col of probeCols) {
    const b = Math.floor(col / perBar)
    const t = (col % perBar) / perBar
    const lanes = model.lanes.map((l) => ({ ...l, cells: [...l.cells] }))
    let probe = lanes.find((l) => l.sound === PROBE_SOUND)
    if (!probe) {
      probe = { sound: PROBE_SOUND, cells: Array<boolean>(perBar * bars).fill(false) }
      lanes.push(probe)
    }
    probe.cells[col] = true
    const out = serializeStepGrid({ ...model, lanes })
    if (out == null) return false
    let edited: unknown
    try {
      edited = reifyMini(out)
    } catch {
      return false
    }
    // Every bar must come back unchanged except the probed one — an edit that
    // leaks into a neighbouring bar is exactly the silent multi-cycle data loss
    // this projection exists to avoid.
    const expectedFor = (bb: number): Onset[] => {
      const want = base[bb]
      if (bb !== b) return want
      const hit = want.find((o) => Math.abs(o.pos - t) < 1e-9)
      // synthetic probe onsets — only `onsetKey` (pos + atoms) reads these, so the
      // probe atom's span is a placeholder `null`; the real atoms keep their spans.
      const out2 = want.map((o) =>
        o === hit ? { pos: o.pos, atoms: [...o.atoms, PROBE_SOUND], spans: [...o.spans, null] } : o,
      )
      if (!hit) out2.push({ pos: t, atoms: [PROBE_SOUND], spans: [null] })
      return out2
    }
    for (let bb = 0; bb < bars; bb++) {
      const got = gridOnsets(edited, bb)
      if (got === null) return false
      if (onsetKey(got) !== onsetKey(expectedFor(bb))) return false
    }
    // …and it must still REPEAT at `bars`, or the grid the view shows stops being
    // true one cycle past its own width. Cycle `bars` is cycle 0 again, probe and
    // all, so it is checked against bar 0's expectation rather than its base.
    const wrap = gridOnsets(edited, bars)
    if (wrap === null) return false
    if (onsetKey(wrap) !== onsetKey(expectedFor(0))) return false
  }
  return true
}

/* ── leaf-anchored projection: write-back without a printer (#986) ─ */

/**
 * The LAST fallback for the step grid: project what the pattern plays and anchor
 * every cell to the ATOM's own source span, so an edit replaces that note's bytes
 * and touches nothing else.
 *
 * Why a third path. The region projection above pairs columns with the source's
 * TOP-LEVEL elements, so an edited element is re-spelled by `reemitRegion` — a
 * mini-notation printer of our own, which can only write flat or one-level output.
 * Patterns whose elements have internal structure (`<c2 eb2 f2 g2>*2`, a `,`-stack
 * of nested groups) therefore either fail to tile into regions or fail the edit
 * probe, and are refused. Anchoring on the LEAF removes the printer from the loop
 * entirely: every structural byte — `[` `]` `<` `>` `*n` `@n` `!` `,` whitespace —
 * is COPIED from the source, never generated, so this writer is incapable of
 * inventing syntax. What it cannot express as a byte replacement (a hit where no
 * leaf exists) it REFUSES; that refusal is what keeps it an adapter.
 *
 * Runs only after `projectStepGrid` declines, so nothing that opens today changes
 * shape: this path can only turn refusals into views, never the reverse.
 */
function projectStepGridByLeaf(src0: string): Projection<StepGridModel> {
  const src = src0.trim()
  if (src === '') return no('not-a-pattern')
  let pat: unknown
  try {
    pat = reifyMini(src)
  } catch {
    return no('not-a-pattern')
  }
  const cycles: Onset[][] = []
  for (let c = 0; c < PERIOD_PROBE; c++) {
    const cc = readGridOnsets(pat, c)
    if (!cc.ok) return cc
    cycles.push(cc.onsets)
  }
  const bars = detectPeriod(cycles.map(onsetKey), MAX_PROJECT_BARS)
  if (bars === 0) return no('unstable-period')
  const perCycle = cycles.slice(0, bars)
  if (perCycle.every((c) => c.length === 0)) return no('no-note-content')
  let perBar = 1
  for (const o of perCycle.flat()) {
    const d = denom(o.pos)
    if (d === 0) return no('irrational-onset')
    perBar = lcm(perBar, d)
  }
  if (perBar * bars > MAX_STEPS) return no('resolution')
  const cols = leafAnchors(src, perCycle, perBar, bars)
  if (cols === null) return no('no-leaf-anchor')
  const model: StepGridModel = {
    steps: perBar * bars,
    ...(bars > 1 ? { bars } : {}),
    lanes: lanesFromCells(cols.map((c) => c.map((a) => a.atom))),
    leafSource: { src, cols },
  }
  if (!leafEditSafe(model, perBar, bars)) return no('edit-unsafe')
  if (!leafViewUsable(model)) return no('view-unusable')
  return { ok: true, model }
}

/**
 * Only offer a grid the writer can honour at least one edit on.
 *
 * A pattern that is ONE token played many times (`<bd>*4`, `sd!15(10,30)`) has a
 * single leaf under every column, so clearing any one cell disagrees with the
 * others and is refused — correctly, but the result is a grid where nothing the
 * user clicks moves. That reads as broken, which is worse than the honest
 * code-only refusal it replaces. Asked of the REAL writer, one clear per sounding
 * column, so the check cannot drift from what an actual click does.
 */
function leafViewUsable(model: StepGridModel): boolean {
  for (let c = 0; c < model.steps; c++) {
    const on = model.lanes.find((l) => l.cells[c])
    if (!on) continue
    const lanes = model.lanes.map((l) =>
      l === on ? { ...l, cells: l.cells.map((v, j) => (j === c ? false : v)) } : l,
    )
    if (serializeStepGrid({ ...model, lanes }) !== null) return true
  }
  return false
}

/**
 * Pair every column with the atoms sounding there and each atom's own leaf span.
 *
 * Refuses — and the refusals are the bijection ([[PV218]]), not convenience:
 *  - an atom carrying NO location: nothing to write back through;
 *  - a span whose bytes are not the atom's token: the anchor would splice the
 *    wrong bytes. `loc[0]` is the leaf for a bare reified mini, but not for every
 *    value the engine can synthesise — a `..` range gives each generated note the
 *    RANGE END's location, and a patterned operator (`*<8 [4 16]>`) puts its own
 *    argument first. Checked per parse rather than trusted (0 mismatches across
 *    the grid's 8449 corpus spans, 861 across the roll's — so the check is
 *    load-bearing, not ceremony);
 *  - spans that OVERLAP without being identical: two cells claiming overlapping
 *    bytes cannot both be spliced.
 * Sharing one span across several columns is allowed (`bd*4` is one token played
 * four times) — the writer requires those columns to AGREE on the result.
 */
function leafAnchors(
  src: string,
  perCycle: Onset[][],
  perBar: number,
  bars: number,
): LeafAnchor[][] | null {
  const cols: LeafAnchor[][] = Array.from({ length: perBar * bars }, () => [])
  const seen: LeafSpan[] = []
  for (let b = 0; b < bars; b++) {
    for (const o of perCycle[b]) {
      const c = b * perBar + Math.round(o.pos * perBar)
      if (c < 0 || c >= perBar * bars) return null
      for (let i = 0; i < o.atoms.length; i++) {
        const span = o.spans[i]
        if (!span || src.slice(span.start, span.end) !== o.atoms[i]) return null
        for (const s of seen) {
          const same = s.start === span.start && s.end === span.end
          if (!same && s.end > span.start && span.end > s.start) return null
        }
        seen.push(span)
        cols[c].push({ atom: o.atoms[i], span })
      }
    }
  }
  return cols
}

/**
 * The leaf writer's own edit probe — the sibling of `projectionEditSafe`, shaped
 * to the edits this writer actually performs.
 *
 * The region probe overlays a NEW sound, because its writer re-emits a region and
 * can therefore add one. The leaf writer never adds; its two edits are RENAME a
 * leaf and CLEAR it (`~`). Both are probed at every leaf, through the REAL writer
 * and the REAL engine, and every bar must come back as predicted — so a span that
 * is subtly wrong (or a `~` the surrounding syntax won't take) makes the view
 * refuse to open rather than corrupt on the first click.
 */
function leafEditSafe(model: StepGridModel, perBar: number, bars: number): boolean {
  const ls = model.leafSource
  if (!ls) return false
  const probes = new Map<string, LeafAnchor>()
  for (const col of ls.cols) {
    for (const a of col) probes.set(`${a.span.start}:${a.span.end}`, a)
  }
  for (const anchor of probes.values()) {
    for (const text of [PROBE_SOUND, '~']) {
      const out = serializeByLeaf(ls.src, [{ span: anchor.span, text }])
      let edited: unknown
      try {
        edited = reifyMini(out)
      } catch {
        return false
      }
      const want = leafExpected(ls.cols, perBar, bars, anchor.span, text === '~' ? null : text)
      for (let b = 0; b < bars; b++) {
        const got = gridOnsets(edited, b)
        if (got === null || onsetKey(got) !== onsetKey(want[b])) return false
      }
      // …and it must still REPEAT at `bars`, or the grid stops being true one
      // cycle past its own width — cycle `bars` is cycle 0 again.
      const wrap = gridOnsets(edited, bars)
      if (wrap === null || onsetKey(wrap) !== onsetKey(want[0])) return false
    }
  }
  return true
}

/** the onsets the anchors predict once `span`'s leaf becomes `text` (null = cleared) */
function leafExpected(
  cols: LeafAnchor[][],
  perBar: number,
  bars: number,
  span: LeafSpan,
  text: string | null,
): Onset[][] {
  const out: Onset[][] = []
  for (let b = 0; b < bars; b++) {
    const bar: Onset[] = []
    for (let i = 0; i < perBar; i++) {
      const atoms = new Set<string>()
      for (const a of cols[b * perBar + i]) {
        const hit = a.span.start === span.start && a.span.end === span.end
        if (hit && text === null) continue
        atoms.add(hit ? text! : a.atom)
      }
      // spans are irrelevant to `onsetKey`, which is all this feeds
      if (atoms.size > 0) bar.push({ pos: i / perBar, atoms: [...atoms], spans: [] })
    }
    out.push(bar)
  }
  return out
}

export function parseStepGrid(mini: string): ParseResult<StepGridModel> {
  const core = parseStepGridCore(mini)
  if (core.ok) return core
  // syntactic model refused → try the inherited behaviour projection (#922), then
  // the leaf-anchored projection (#986) for the notation no re-emit can spell
  const element = projectStepGrid(mini)
  if (element.ok) return element
  const leaf = projectStepGridByLeaf(mini)
  if (leaf.ok) return leaf
  // …and if nothing opened it, report the gate that actually stopped the general
  // write-back (#990) — not the core's syntactic message, which names the first
  // writer to decline
  return refused('grid', core, leaf.gate)
}

export function parseStepGridCore(mini: string): ParseResult<StepGridModel> {
  const alt = unwrapAlternation(mini)
  if (alt !== null) return gridFromAlternation(alt)

  const parts = splitTopLevel(mini)
  if (parts.length > 1) return gridFromStack(parts)

  const altEl = gridFromAltElements(mini)
  if (altEl !== null) return altEl

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
  const sourceParts = singlePart(src, tok.elements, div, cells.length, gridContent(cells))
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
  const parts = singlePart(src, tok.elements, div, cells.length, gridContent(cells))
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
): { source: NotationSource<GridCells> } | null {
  const out: SourcePart<GridCells>[] = []
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i]
    const leading = /^\s*/.exec(raw)?.[0] ?? ''
    const after = /\s*$/.exec(raw.slice(leading.length))?.[0] ?? ''
    const regions = buildRegions(
      raw.trim(),
      elements[i],
      divs[i],
      partCells[i].length,
      gridContent(partCells[i]),
    )
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

/**
 * `0 <2 3> 5` in the piano roll — the roll's half of the grid's alt-element path.
 * The shared bar-expansion is reused verbatim; only "what a column shows" (notes,
 * not cells) and the numeric/named check are the roll's own. null → not this
 * shape (the flat path handles it).
 */
function rollFromAltElements(mini: string): ParseResult<PianoRollModel> | null {
  const exp = expandAltElements(mini, true)
  if (exp === null) return null
  if ('reason' in exp) return { ok: false, reason: exp.reason }
  const { bars, div, perBarCols, perBarSteps, elemSpans } = exp
  const notes: RollNote[] = []
  let col = 0
  let sawNumeric = false
  let sawNamed = false
  for (const barSteps of perBarSteps) {
    for (const step of barSteps) {
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
          notes.push({ pitch: isNum ? token : token.toLowerCase(), start: col, duration: span })
        }
        col += span
      }
    }
  }
  if (sawNumeric && sawNamed) {
    return { ok: false, reason: 'mixed numeric and note-name tokens are beyond the editable subset' }
  }
  const src = mini.trim()
  const regions = buildAltRegions<RollNote[]>(src, elemSpans, div, perBarCols, (from, to) => {
    const perBar: RollNote[][] = []
    for (let b = 0; b < bars; b++) {
      const lo = from + b * perBarCols
      const hi = to + b * perBarCols
      perBar.push(
        notes
          .filter((n) => n.start >= lo && n.start < hi)
          .map((n) => ({ pitch: n.pitch, start: n.start - b * perBarCols, duration: n.duration })),
      )
    }
    return perBar
  })
  if (!regions) return { ok: false, reason: 'unsupported mini-notation syntax' }
  return {
    ok: true,
    model: {
      steps: col,
      bars,
      notes,
      ...(sawNumeric ? { numeric: true } : {}),
      altSource: { perBar: perBarCols, bars, div, regions },
    },
  }
}

/* ── behaviour projection: the roll's inherited fallback (#924) ── */

export interface RollOnset {
  pos: number
  dur: number
  pitch: string
  numeric: boolean
  /** the note's own leaf span (src-space), the #986 write-back anchor; `null` if none carried */
  loc: LeafSpan | null
}

/**
 * Read what a melodic pattern PLAYS, one cycle, as pitched onsets with DURATION —
 * inherited from Strudel (`reifyMini(...).queryArc`), never re-derived. Unlike the
 * grid's `gridOnsets`, the roll keeps each hap's length (`whole.end - whole.begin`):
 * a note's `@n` hold is part of what it plays and the writer must put it back. The
 * value the engine yields is the ground truth — a number is a numeric pitch
 * (`note("60")` MIDI / `n("0")` degree), a string is a note name. Returns null when
 * a hap isn't a placeable pitch (a sound token, a signal/params value, a zero-length
 * hap) or the query throws.
 */
export function rollOnsets(pat: unknown, cyc: number): RollOnset[] | null {
  const r = readRollOnsets(pat, cyc)
  return r.ok ? r.onsets : null
}

/**
 * `rollOnsets`, saying WHY when it declines — the roll's half of
 * `readGridOnsets` (#990), and the surface where the distinction matters most:
 * a drum pattern asked of the piano roll plays SOUND names, which is not a
 * broken roll but the wrong view, and counting it as a failure is what inflated
 * every editability denominator we quoted.
 */
function readRollOnsets(pat: unknown, cyc: number): Read<RollOnset[]> {
  let haps: Array<{
    hasOnset?: () => boolean
    whole?: { begin: { valueOf(): number }; end: { valueOf(): number } }
    value: unknown
    context?: { locations?: Array<{ start: number; end: number }> }
  }>
  try {
    haps = (pat as { queryArc(a: number, b: number): typeof haps }).queryArc(cyc, cyc + 1)
  } catch {
    return no('no-note-content')
  }
  const out: RollOnset[] = []
  for (const h of haps) {
    if (!(h.hasOnset?.() ?? false) || !h.whole) continue
    const v = h.value
    let pitch: string
    let numeric: boolean
    if (typeof v === 'number' && Number.isFinite(v)) {
      pitch = String(v)
      numeric = true
    } else if (typeof v === 'string') {
      if (NUMERIC.test(v)) {
        pitch = v
        numeric = true
      } else if (pitchToMidi(v.toLowerCase()) !== null) {
        // fold case like the core does — the row math is case-blind, and the
        // convention has no business riding back out into the document
        pitch = v.toLowerCase()
        numeric = false
      } else return no('wrong-surface') // a sound token — the grid's, not the roll's
    } else return no('no-note-content') // params / a signal value has no note to place
    const pos = h.whole.begin.valueOf() - cyc
    const dur = h.whole.end.valueOf() - h.whole.begin.valueOf()
    if (dur <= 0) return no('no-note-content')
    out.push({ pos, dur, pitch, numeric, loc: leafLoc(h) })
  }
  return { ok: true, onsets: out }
}

const rollKey = (o: Array<{ pos: number; dur: number; pitch: string }>): string =>
  JSON.stringify(
    o.map((x) => [Math.round(x.pos * 720720), Math.round(x.dur * 720720), x.pitch]).sort(),
  )

/** probe pitches for the edit self-verify — valid tokens improbable in real content */
const PROBE_NOTE = 'c9'
const PROBE_NUM = '999'

/**
 * The roll's `projectionEditSafe`. The projection may only offer a roll the writer
 * can reproduce under edit — and for the roll that must include DURATION, the axis
 * the grid doesn't have and the one the 71→44 writer-reach gap loses on. Probe
 * every region by swapping its first note's pitch (an overlap-free edit — a placed
 * note could land under a sustain, which the grid never has), serialize through the
 * REAL writer, re-query the REAL engine, and require the haps to be the model's
 * notes with that one pitch changed: same onsets, same durations. A region whose
 * re-emit drops an `@n` hold fails here and the projection declines, never corrupts.
 */
function projectionRollEditSafe(
  model: PianoRollModel,
  perBar: number,
  bars: number,
  numeric: boolean,
  probes: Array<{ from: number; to: number }>,
): boolean {
  const probePitch = numeric ? PROBE_NUM : PROBE_NOTE
  // Spans are ABSOLUTE model columns from the caller, for the same reason as the
  // grid's: an alt-element source repeats a within-bar span across bars, while a
  // whole-alternation's regions already sit one per bar.
  for (const { from, to } of probes) {
    const idx = model.notes.findIndex((n) => n.start >= from && n.start < to)
    if (idx < 0) continue // an all-rest region has nothing to re-emit; identity covers it
    const edited: PianoRollModel = {
      ...model,
      notes: model.notes.map((n, i) => (i === idx ? { ...n, pitch: probePitch } : n)),
    }
    const out = serializePianoRoll(edited)
    if (out == null) return false
    let pat: unknown
    try {
      pat = reifyMini(out)
    } catch {
      return false
    }
    // every bar must come back with its own notes — onsets AND durations — and only
    // the probed pitch changed. Comparing cycle 0 alone would miss an edit that
    // rewrites a later bar, which is the multi-cycle loss this has to refuse.
    for (let bb = 0; bb < bars; bb++) {
      const got = rollOnsets(pat, bb)
      if (got === null) return false
      const expected = edited.notes
        .filter((n) => n.start >= bb * perBar && n.start < (bb + 1) * perBar)
        .map((n) => ({
          pos: (n.start - bb * perBar) / perBar,
          dur: n.duration / perBar,
          pitch: n.pitch,
        }))
      if (rollKey(got) !== rollKey(expected)) return false
    }
    // …and it must still repeat at `bars`
    const wrap = rollOnsets(pat, bars)
    if (wrap === null) return false
    const wrap0 = edited.notes
      .filter((n) => n.start < perBar)
      .map((n) => ({ pos: n.start / perBar, dur: n.duration / perBar, pitch: n.pitch }))
    if (rollKey(wrap) !== rollKey(wrap0)) return false
  }
  return true
}

/**
 * The inherited fallback for the piano roll (#924): when the syntactic parse
 * refuses, PROJECT the pattern's pitched haps — pitch, onset AND duration — onto a
 * roll instead of modelling its syntax. Any melodic pattern that plays a stable,
 * rational, single-cycle grid becomes editable regardless of how it nests, because
 * the roll shows what it PLAYS. The write-back tiles krill's top-level element spans
 * (`serializePianoRoll`'s span surgery), so unedited elements ride back verbatim and
 * only the edited one is re-emitted, at its own weight.
 *
 * Returns null (keep the caller's refusal) when the pattern isn't a static
 * single-cycle melodic grid — a sound pattern (that is the grid's), a `,`-stack or
 * per-cycle `<…>` (their own paths; projecting cycle 0 would drop the rest), mixed
 * numeric/named tokens, a blow-up past the step ceiling, or spans that don't tile.
 */
function projectPianoRoll(src0: string): Projection<PianoRollModel> {
  const src = src0.trim()
  if (src === '') return no('not-a-pattern')
  let pat: unknown
  try {
    pat = reifyMini(src)
  } catch {
    return no('not-a-pattern')
  }
  // A whole-cycle `<…>` is projected bar-wise with its branches as regions (#938),
  // never flat — owning the whole `<…>` as one region would re-spell all of it on
  // the first edit. One carrying trailing ops has no branch tiling to write through.
  const whole = isWholeAlternation(src) ? unwrapAlternation(src) : null
  if (isWholeAlternation(src) && whole === null) return no('element-tiling')
  // What it PLAYS each cycle, and the period it repeats at (#938). A melodic pattern
  // that varies is bar-expanded rather than refused.
  const cycles: RollOnset[][] = []
  for (let c = 0; c < PERIOD_PROBE; c++) {
    const cc = readRollOnsets(pat, c)
    if (!cc.ok) return cc
    cycles.push(cc.onsets)
  }
  const bars = detectPeriod(cycles.map(rollKey), MAX_PROJECT_BARS)
  if (bars === 0) return no('unstable-period')
  const perCycle = cycles.slice(0, bars)
  const all = perCycle.flat()
  if (all.length === 0) return no('no-note-content')
  // mixed numeric/named tokens are rejected like the core — checked across EVERY
  // bar, since a later bar can introduce the token that breaks the convention
  const numeric = all.some((o) => o.numeric)
  if (numeric && all.some((o) => !o.numeric)) return no('mixed-pitch-domain')
  if (whole !== null) {
    return bars > 1 ? projectAltRollBars(src, whole, perCycle, numeric) : no('element-tiling')
  }
  const spans = topLevelSpans(src)
  if (!spans) return no('element-tiling')
  const totalWeight = spans.reduce((s, e) => s + e.weight, 0)
  const bounds: number[] = []
  let accW = 0
  for (const e of spans) {
    bounds.push(accW / totalWeight)
    accW += e.weight
  }
  // onsets, DURATIONS and element boundaries must all land on integer columns —
  // the duration is the roll's extra term the grid's projection omits
  let perBar = 1
  for (const x of [...all.map((o) => o.pos), ...all.map((o) => o.dur), ...bounds]) {
    const d = denom(x)
    if (d === 0) return no('irrational-onset')
    perBar = lcm(perBar, d)
  }
  if (perBar * bars > MAX_STEPS) return no('resolution')
  if (perBar % totalWeight !== 0) return no('element-tiling')
  const divPerUnit = perBar / totalWeight
  const notes = barNotes(perCycle, perBar)
  if (notes === null) return no('element-tiling')

  if (bars === 1) {
    // the single-cycle projection, unchanged (#924)
    const parts = singlePart(src, spans, divPerUnit, perBar, rollContent(notes))
    if (!parts) return no('element-tiling')
    const model: PianoRollModel = {
      steps: perBar,
      notes,
      ...(numeric ? { numeric: true } : {}),
      source: { prefix: '', suffix: '', parts },
    }
    const probes0 = parts[0].regions.map((r) => ({ from: r.from, to: r.to }))
    if (!projectionRollEditSafe(model, perBar, 1, numeric, probes0)) return no('edit-unsafe')
    return { ok: true, model }
  }

  // bar-expanded: the alt-element source shape, written back by `spliceAltRoll`
  const regions = buildAltRegions<RollNote[]>(src, spans, divPerUnit, perBar, (from, to) =>
    Array.from({ length: bars }, (_, b) =>
      notes
        .filter((n) => n.start >= from + b * perBar && n.start < to + b * perBar)
        .map((n) => ({ pitch: n.pitch, start: n.start - b * perBar, duration: n.duration })),
    ),
  )
  if (!regions) return no('element-tiling')
  const model: PianoRollModel = {
    steps: perBar * bars,
    bars,
    notes,
    ...(numeric ? { numeric: true } : {}),
    altSource: { perBar, bars, div: divPerUnit, regions },
  }
  const probes = regions.flatMap((r) =>
    Array.from({ length: bars }, (_, b) => ({
      from: b * perBar + r.from,
      to: b * perBar + r.to,
    })),
  )
  if (!projectionRollEditSafe(model, perBar, bars, numeric, probes)) return no('edit-unsafe')
  return { ok: true, model }
}

/**
 * Lay each bar's played onsets onto `perBar` columns, offset into that bar.
 *
 * A note must FIT inside its own bar: the alt writer filters a region's notes by
 * start and rebases them per bar, so a note sustaining across the bar line has no
 * single bar to belong to. Refusing here keeps that ambiguity out of the writer.
 */
function barNotes(perCycle: RollOnset[][], perBar: number): RollNote[] | null {
  const notes: RollNote[] = []
  for (let b = 0; b < perCycle.length; b++) {
    for (const o of perCycle[b]) {
      const start = Math.round(o.pos * perBar)
      const duration = Math.round(o.dur * perBar)
      if (start < 0 || duration < 1 || start + duration > perBar) return null
      notes.push({ pitch: o.pitch, start: b * perBar + start, duration })
    }
  }
  return notes
}

/**
 * The roll's `projectAltBars` — a whole-cycle `<…>` the syntactic path refused,
 * projected bar-wise with the alternation's own BRANCHES as regions so an edit
 * rewrites one branch and the others ride back byte-for-byte.
 */
function projectAltRollBars(
  src: string,
  inner: string,
  perCycle: RollOnset[][],
  numeric: boolean,
): Projection<PianoRollModel> {
  const bars = perCycle.length
  const innerSrc = inner.trim()
  const spans = topLevelSpans(innerSrc)
  if (!spans) return no('element-tiling')
  if (spans.reduce((s, e) => s + e.weight, 0) !== bars) return no('element-tiling')
  const all = perCycle.flat()
  let perBar = 1
  for (const x of [...all.map((o) => o.pos), ...all.map((o) => o.dur)]) {
    const d = denom(x)
    if (d === 0) return no('irrational-onset')
    perBar = lcm(perBar, d)
  }
  if (perBar * bars > MAX_STEPS) return no('resolution')
  const notes = barNotes(perCycle, perBar)
  if (notes === null) return no('element-tiling')
  const parts = singlePart(innerSrc, spans, perBar, perBar * bars, rollContent(notes))
  if (!parts) return no('element-tiling')
  const model: PianoRollModel = {
    steps: perBar * bars,
    bars,
    notes,
    ...(numeric ? { numeric: true } : {}),
    source: {
      parts,
      prefix: '<' + (/^\s*/.exec(inner)?.[0] ?? ''),
      suffix: (/\s*$/.exec(inner)?.[0] ?? '') + '>',
    },
  }
  const probes = parts[0].regions.map((r) => ({ from: r.from, to: r.to }))
  if (!projectionRollEditSafe(model, perBar, bars, numeric, probes)) return no('edit-unsafe')
  if (serializePianoRoll(model) !== src.trim()) return no('edit-unsafe')
  return { ok: true, model }
}

/**
 * The LEAF-anchored roll projection (#986 P1b) — the roll's half of
 * `projectStepGridByLeaf`, and the last thing tried.
 *
 * Where `projectPianoRoll` pairs the view with the source's top-level ELEMENTS and
 * re-emits an edited one, this pairs each note with its OWN pitch token and writes an
 * edit as a byte replacement there. Nothing about the grammar is authored, so the
 * notation an element re-emit cannot spell — internal structure, a patterned operator,
 * a `*n` over a group — stops being a reason to refuse the view.
 *
 * Runs LAST for the same reason the grid's does: it can only turn refusals into
 * views, never take one away from the writer that already handles it.
 */
function projectPianoRollByLeaf(src0: string): Projection<PianoRollModel> {
  const src = src0.trim()
  if (src === '') return no('not-a-pattern')
  let pat: unknown
  try {
    pat = reifyMini(src)
  } catch {
    return no('not-a-pattern')
  }
  const cycles: RollOnset[][] = []
  for (let c = 0; c < PERIOD_PROBE; c++) {
    const cc = readRollOnsets(pat, c)
    if (!cc.ok) return cc
    cycles.push(cc.onsets)
  }
  const bars = detectPeriod(cycles.map(rollKey), MAX_PROJECT_BARS)
  if (bars === 0) return no('unstable-period')
  const perCycle = cycles.slice(0, bars)
  const all = perCycle.flat()
  if (all.length === 0) return no('no-note-content')
  // mixed numeric/named tokens are rejected like the core, across EVERY bar
  const numeric = all.some((o) => o.numeric)
  if (numeric && all.some((o) => !o.numeric)) return no('mixed-pitch-domain')
  // onsets AND durations must land on integer columns — the duration is the roll's
  // extra term the grid's projection has no equivalent of
  let perBar = 1
  for (const x of [...all.map((o) => o.pos), ...all.map((o) => o.dur)]) {
    const d = denom(x)
    if (d === 0) return no('irrational-onset')
    perBar = lcm(perBar, d)
  }
  if (perBar * bars > MAX_STEPS) return no('resolution')
  const anchors = rollAnchors(src, perCycle, perBar, bars)
  if (anchors === null) return no('no-leaf-anchor')
  const model: PianoRollModel = {
    steps: perBar * bars,
    ...(bars > 1 ? { bars } : {}),
    // the notes ARE the anchors — one source of truth, so the view and the spans
    // that write it back can never describe different music
    notes: anchors.map((a) => ({ pitch: a.pitch, start: a.start, duration: a.duration })),
    ...(numeric ? { numeric: true } : {}),
    leafSource: { src, anchors, steps: perBar * bars },
  }
  if (!leafRollEditSafe(model, perBar, bars, numeric)) return no('edit-unsafe')
  if (!leafRollViewUsable(model)) return no('view-unusable')
  return { ok: true, model }
}

/**
 * Pair every played note with its own pitch token's span.
 *
 * Refuses — and each refusal is the bijection, not a convenience limit:
 *  - a note carrying NO location: nothing to write back through;
 *  - a span whose bytes are not the note's own pitch. `loc[0]` is the leaf for a
 *    token the user TYPED, but not for a value the engine SYNTHESISED: a `..` range
 *    gives every generated note the RANGE END's location and a patterned operator
 *    (`*<8 [4 16]>`) puts its own argument first, so splicing either would rewrite
 *    bytes belonging to something else. The grid never meets this class (it rejects
 *    numeric values upstream); numbers are the roll's whole point, so it meets all of
 *    it — 861 of the corpus's ~7949 roll spans do not slice to their pitch. Checked
 *    per note, never trusted;
 *  - spans that OVERLAP without being identical: two notes claiming overlapping bytes
 *    cannot both be spliced;
 *  - a note that does not fit inside its own bar, which has no single bar to belong to.
 * Sharing one span across several notes is allowed (one token sounding in every bar) —
 * the writer then requires them to AGREE on the result.
 */
function rollAnchors(
  src: string,
  perCycle: RollOnset[][],
  perBar: number,
  bars: number,
): RollLeafAnchor[] | null {
  const out: RollLeafAnchor[] = []
  const seen: LeafSpan[] = []
  for (let b = 0; b < bars; b++) {
    for (const o of perCycle[b]) {
      const start = Math.round(o.pos * perBar)
      const duration = Math.round(o.dur * perBar)
      if (start < 0 || duration < 1 || start + duration > perBar) return null
      const span = o.loc
      // the roll case-folds note names for its row math, so compare on that footing —
      // the anchor still points at the user's own bytes, and the writer puts THOSE back
      if (!span || src.slice(span.start, span.end).toLowerCase() !== o.pitch.toLowerCase()) {
        return null
      }
      for (const s of seen) {
        const same = s.start === span.start && s.end === span.end
        if (!same && s.end > span.start && span.end > s.start) return null
      }
      seen.push(span)
      out.push({ pitch: o.pitch, start: b * perBar + start, duration, span })
    }
  }
  return out
}

/**
 * The leaf roll writer's own edit probe — `leafEditSafe` for the pitched surface.
 *
 * The writer's two edits are RENAME a note's pitch and CLEAR it (`~`); duration is
 * deliberately not among them, because a held note's `@n` never appears in its hap's
 * locations and so has no span to write through. Both edits are probed at every leaf,
 * through the REAL serializer and the REAL engine, and every bar must come back as
 * predicted — so a span that is subtly wrong (or a `~` the surrounding syntax will not
 * take, `~@2` among them) makes the view refuse to open rather than corrupt on the
 * first drag.
 */
function leafRollEditSafe(
  model: PianoRollModel,
  perBar: number,
  bars: number,
  numeric: boolean,
): boolean {
  const ls = model.leafSource
  if (!ls) return false
  const probePitch = numeric ? PROBE_NUM : PROBE_NOTE
  const probes = new Map<string, RollLeafAnchor>()
  for (const a of ls.anchors) probes.set(`${a.span.start}:${a.span.end}`, a)
  for (const anchor of probes.values()) {
    for (const text of [probePitch, '~']) {
      const out = serializeByLeaf(ls.src, [{ span: anchor.span, text }])
      let edited: unknown
      try {
        edited = reifyMini(out)
      } catch {
        return false
      }
      const want = leafRollExpected(
        ls.anchors,
        perBar,
        bars,
        anchor.span,
        text === '~' ? null : text,
      )
      for (let b = 0; b < bars; b++) {
        const got = rollOnsets(edited, b)
        if (got === null || rollKey(got) !== rollKey(want[b])) return false
      }
      // …and it must still REPEAT at `bars`, or the roll stops being true one cycle
      // past its own width — cycle `bars` is cycle 0 again.
      const wrap = rollOnsets(edited, bars)
      if (wrap === null || rollKey(wrap) !== rollKey(want[0])) return false
    }
  }
  return true
}

/** the notes the anchors predict once `span`'s leaf becomes `text` (null = cleared) */
function leafRollExpected(
  anchors: RollLeafAnchor[],
  perBar: number,
  bars: number,
  span: LeafSpan,
  text: string | null,
): Array<Array<{ pos: number; dur: number; pitch: string }>> {
  const out: Array<Array<{ pos: number; dur: number; pitch: string }>> = []
  for (let b = 0; b < bars; b++) out.push([])
  for (const a of anchors) {
    // a leaf shared by several notes changes at every one of them — that is the whole
    // meaning of "one token, played more than once"
    const hit = a.span.start === span.start && a.span.end === span.end
    const pitch = hit ? text : a.pitch
    if (pitch === null) continue // this note is the cleared one
    const b = Math.floor(a.start / perBar)
    if (b < 0 || b >= bars) continue
    out[b].push({
      pos: (a.start - b * perBar) / perBar,
      dur: a.duration / perBar,
      pitch,
    })
  }
  return out
}

/**
 * Only offer a roll the writer can honour at least one edit on.
 *
 * The roll's `leafViewUsable`: a pattern that is ONE token sounding many times has a
 * single leaf under every note, so deleting any one disagrees with the rest and is
 * refused — correctly, but the result is a roll where nothing the user drags moves.
 * That reads as broken, which is worse than the honest code-only refusal it replaces.
 * Asked of the REAL writer, one delete per note, so it cannot drift from a real click.
 */
function leafRollViewUsable(model: PianoRollModel): boolean {
  for (const n of model.notes) {
    if (serializePianoRoll({ ...model, notes: model.notes.filter((x) => x !== n) }) !== null) {
      return true
    }
  }
  return false
}

export function parsePianoRoll(mini: string): ParseResult<PianoRollModel> {
  const core = parsePianoRollCore(mini)
  if (core.ok) return core
  // syntactic model refused → try the inherited behaviour projection (#924), then the
  // leaf-anchored projection (#986) for the notation no re-emit can spell
  const element = projectPianoRoll(mini)
  if (element.ok) return element
  const leaf = projectPianoRollByLeaf(mini)
  if (leaf.ok) return leaf
  // …and if nothing opened it, report the gate that actually stopped the general
  // write-back (#990)
  return refused('roll', core, leaf.gate)
}

// exported for the projection stress gate — it sweeps only patterns the CORE
// refuses, so it must be able to ask which those are (a projected-only filter)
export function parsePianoRollCore(mini: string): ParseResult<PianoRollModel> {
  const alt = unwrapAlternation(mini)
  // A top-level `,`-stack = parallel note lanes (independent durations / overlap,
  // #628). Only when NOT an alternation — multi-bar `<...>` lanes are out of scope.
  if (alt === null) {
    const parts = splitTopLevel(mini)
    if (parts.length > 1) return parseRollLanes(parts)
    const altEl = rollFromAltElements(mini)
    if (altEl !== null) return altEl
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
  // An alternation's regions tile the text INSIDE the brackets, so the brackets
  // (and whatever padding the user left in them) ride along as the wrapper —
  // exactly as in the grid's `<...>` path.
  const src = (alt ?? mini).trim()
  const parts = singlePart(src, tok.elements, div, col, rollContent(notes))
  return {
    ok: true,
    model: {
      steps: col,
      ...(alt !== null ? { bars } : {}),
      notes,
      ...(sawNumeric ? { numeric: true } : {}),
      ...(parts
        ? {
            source: {
              parts,
              prefix: alt !== null ? '<' + (/^\s*/.exec(alt)?.[0] ?? '') : '',
              suffix: alt !== null ? (/\s*$/.exec(alt)?.[0] ?? '') + '>' : '',
            },
          }
        : {}),
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
    // a comma-part stays on the core path — projecting individual lanes is out of
    // scope, the same way `projectStepGrid`/`projectPianoRoll` decline `,`-stacks
    const r = parsePianoRollCore(part.trim())
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
  return {
    ok: true,
    model: { steps, notes, ...(numeric ? { numeric: true } : {}), ...(rollStackSource(parts, models) ?? {}) },
  }
}

/**
 * The per-part source for a roll `,`-stack, reassembled from each part's own —
 * every part was parsed by `parsePianoRoll` above and already carries the
 * regions tiling its own text, so this only has to re-index them and carry the
 * `,` (with the user's padding) as the part's `before`.
 *
 * `factor` is 1 throughout, and structurally so: the caller has already refused
 * the pattern unless every part reports the same step count, so a roll's parts
 * cannot be at different resolutions the way `bd sd, hh*4` is in the grid.
 *
 * All or nothing, like the grid's: one part we can't tile means the writer can't
 * reassemble the line, so none of it is used.
 */
function rollStackSource(
  parts: string[],
  models: PianoRollModel[],
): { source: NotationSource<RollNote[]> } | null {
  const out: SourcePart<RollNote[]>[] = []
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i]
    const leading = /^\s*/.exec(raw)?.[0] ?? ''
    const after = /\s*$/.exec(raw.slice(leading.length))?.[0] ?? ''
    const own = models[i].source
    // a part is a flat sequence — an alternation part is refused upstream, and
    // a wrapper here would mean these regions don't tile what we think they do
    if (!own || own.parts.length !== 1 || own.prefix !== '' || own.suffix !== '') return null
    out.push({
      part: i,
      div: own.parts[0].div,
      factor: 1,
      before: (i > 0 ? ',' : '') + leading,
      after,
      regions: own.parts[0].regions,
    })
  }
  // the parts must reassemble the line exactly, or we are not putting back what
  // we read — same check as the per-part tiling, one level up
  const rebuilt = out.map((p) => p.before + p.regions.map((r) => r.raw).join('') + p.after).join('')
  if (rebuilt !== parts.join(',')) return null
  return { source: { prefix: '', suffix: '', parts: out } }
}
