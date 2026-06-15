/**
 * Mini-notation (strict editable subset) → notation models.
 *
 * Self-contained tokenizer rather than `@strudel/mini` or Stave's `parseMini`:
 * the full parser builds an IR that only round-trips through `toStrudel`'s
 * canonical regenerator (the very reformatting text-writeback exists to
 * avoid), and it accepts idioms the visual grids can't represent. A narrow
 * tokenizer that rejects everything outside the subset is exactly what the
 * round-trip guarantee needs.
 *
 * Supported: flat sequences of atoms (`bd`, `bd:3`, `c3`), rests (`~`),
 * `[bd,hh]` simultaneous stacks, `[hh hh]` sub-sequences (expanded onto a
 * uniform finer grid), `@n` elongation (roll), a whole-string `<...>`
 * alternation with one slot per bar, and top-level `,` stacks (grid only,
 * parts preserved). Everything else → `{ ok: false }`.
 */
import type {
  ParseResult,
  PianoRollModel,
  RollNote,
  StepGridModel,
  StepLane,
} from './model'

/** an atom token allowed in a grid lane (sound, optional :variant) */
const ATOM = /^[a-zA-Z][a-zA-Z0-9#]*(:\d+)?$/
/** a melodic note token for the roll */
const NOTE = /^[a-gA-G][bs#]?-?\d$/

/** ceiling on expanded columns so `[7 hits][11 hits]` can't blow up the grid */
const MAX_STEPS = 64

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b

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

/** index of the `]` closing the `[` at `open`, or -1 if unbalanced */
function closeBracket(src: string, open: number): number {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '[') depth++
    else if (src[i] === ']' && --depth === 0) return i
  }
  return -1
}

/** split on commas that sit outside every bracket */
function splitTopLevel(src: string): string[] {
  const out: string[] = []
  let depth = 0
  let from = 0
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '[') depth++
    else if (src[i] === ']') depth--
    else if (src[i] === ',' && depth === 0) {
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

type Tokenized = { ok: true; steps: Step[] } | { ok: false; reason: string }

/** read an optional `@n` weight at `i`; value defaults to 1 */
function readElongation(
  src: string,
  i: number,
): { ok: true; value: number; next: number } | { ok: false; reason: string } {
  if (src[i] !== '@') return { ok: true, value: 1, next: i }
  const digits = src.slice(i + 1).match(/^\d+/)
  if (!digits) return { ok: false, reason: 'invalid @ elongation' }
  return { ok: true, value: parseInt(digits[0], 10), next: i + 1 + digits[0].length }
}

/** parse the contents of one `[...]`: a `[a,b]` chord, or a sub-sequence */
function parseGroup(inner: string, elongation: number): Step | { reason: string } {
  const commaParts = splitTopLevel(inner)
  if (commaParts.length > 1) {
    // `[bd,hh]` — atoms that sound together; no nesting inside
    const atoms: string[] = []
    for (const raw of commaParts) {
      const token = raw.trim()
      if (/[\s[\]]/.test(token) || !ATOM.test(token)) {
        return { reason: 'stacked sub-sequences are beyond the editable subset' }
      }
      atoms.push(token)
    }
    return { atoms, elongation, sub: null }
  }

  const slots: Slot[] = []
  let i = 0
  while (i < inner.length) {
    const ch = inner[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (ch === '~') {
      slots.push({ atoms: [], units: 1 })
      i++
      continue
    }
    if (ch === '[') {
      // one nesting level: a `[a,b]` chord used as a single slot
      const close = closeBracket(inner, i)
      if (close === -1) return { reason: 'unbalanced brackets' }
      const chord = inner.slice(i + 1, close)
      if (/[[\]]/.test(chord) || !chord.includes(',')) {
        return { reason: 'nested groups are beyond the editable subset' }
      }
      i = close + 1
      const elong = readElongation(inner, i)
      if (!elong.ok) return { reason: elong.reason }
      i = elong.next
      const atoms: string[] = []
      for (const raw of chord.split(',')) {
        const token = raw.trim()
        if (!ATOM.test(token)) return { reason: `unsupported token "${token}"` }
        atoms.push(token)
      }
      slots.push({ atoms, units: elong.value })
      continue
    }
    const match = inner.slice(i).match(/^[^\s[\]@,]+/)
    if (!match || !ATOM.test(match[0])) {
      return { reason: `unsupported token "${match?.[0] ?? ch}"` }
    }
    i += match[0].length
    const elong = readElongation(inner, i)
    if (!elong.ok) return { reason: elong.reason }
    i = elong.next
    slots.push({ atoms: [match[0]], units: elong.value })
  }
  if (slots.length === 0) return { reason: 'empty group' }
  if (slots.length === 1 && slots[0].units === 1) {
    // `[bd]` collapses to a bare atom
    return { atoms: slots[0].atoms, elongation, sub: null }
  }
  return { atoms: [], elongation, sub: slots }
}

/** tokenize a flat sequence (one cycle / one stack part / one alternation slot) */
function tokenize(mini: string): Tokenized {
  const src = mini.trim()
  if (src === '') return { ok: true, steps: [] }
  if (/[<>{}*/!?()%._|]/.test(src)) {
    return { ok: false, reason: 'uses mini-notation features beyond the editable subset' }
  }
  const steps: Step[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (ch === '~') {
      steps.push({ atoms: [], elongation: 1, sub: null })
      i++
      continue
    }
    if (ch === '[') {
      const close = closeBracket(src, i)
      if (close === -1) return { ok: false, reason: 'unbalanced brackets' }
      const inner = src.slice(i + 1, close)
      i = close + 1
      const elong = readElongation(src, i)
      if (!elong.ok) return { ok: false, reason: elong.reason }
      i = elong.next
      const group = parseGroup(inner, elong.value)
      if ('reason' in group) return { ok: false, reason: group.reason }
      steps.push(group)
      continue
    }
    const match = src.slice(i).match(/^[^\s[\]@,]+/)
    if (!match || !ATOM.test(match[0])) {
      return { ok: false, reason: `unsupported token "${match?.[0] ?? ch}"` }
    }
    i += match[0].length
    const elong = readElongation(src, i)
    if (!elong.ok) return { ok: false, reason: elong.reason }
    i = elong.next
    steps.push({ atoms: [match[0]], elongation: elong.value, sub: null })
  }
  return { ok: true, steps }
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
  return { ok: true, model: { steps: cells.length, lanes: lanesFromCells(cells) } }
}

/** `<[bd ~ sd ~] [bd bd sd ~]>` — one slot per bar */
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
  return {
    ok: true,
    model: { steps: cells.length, bars: tok.steps.length, lanes: lanesFromCells(cells) },
  }
}

/** `bd ~ sd ~, hh hh hh hh` — parallel parts on a shared grid, part preserved */
function gridFromStack(parts: string[]): ParseResult<StepGridModel> {
  const partCells: string[][][] = []
  for (const part of parts) {
    if (part.trim() === '') return { ok: false, reason: 'empty stack part' }
    const tok = tokenize(part)
    if (!tok.ok) return tok
    if (gridHasElongation(tok.steps)) {
      return { ok: false, reason: 'elongation is beyond the drum-grid subset' }
    }
    partCells.push(toCells(tok.steps, division(tok.steps)))
  }
  const total = partCells.reduce((l, cells) => lcm(l, cells.length || 1), 1)
  if (total > MAX_STEPS) {
    return { ok: false, reason: `the stack expands the grid past ${MAX_STEPS} steps` }
  }
  const lanes: StepLane[] = []
  partCells.forEach((cells, part) => {
    const factor = total / (cells.length || 1)
    const stretched: string[][] = Array.from({ length: total }, (_, c) =>
      c % factor === 0 ? cells[c / factor] ?? [] : [],
    )
    lanes.push(...lanesFromCells(stretched, part))
  })
  return { ok: true, model: { steps: total, lanes } }
}

/* ── piano roll ────────────────────────────────────────────────── */

export function parsePianoRoll(mini: string): ParseResult<PianoRollModel> {
  const alt = unwrapAlternation(mini)
  const tok = tokenize(alt ?? mini)
  if (!tok.ok) return tok
  if (alt !== null && tok.steps.length === 0) return { ok: false, reason: 'empty alternation' }

  const div = division(tok.steps)
  const bars = tok.steps.reduce((b, s) => b + s.elongation, 0)
  if ((div > 1 || alt !== null) && bars * div > MAX_STEPS) {
    return { ok: false, reason: `sub-sequences expand the roll past ${MAX_STEPS} steps` }
  }
  const notes: RollNote[] = []
  let col = 0
  for (const step of tok.steps) {
    const slots = step.sub ?? [{ atoms: step.atoms, units: 1 }]
    const total = stepUnits(step)
    for (const slot of slots) {
      const span = (step.elongation * div * slot.units) / total
      for (const token of slot.atoms) {
        if (!NOTE.test(token)) return { ok: false, reason: `"${token}" is not a note name` }
        notes.push({ pitch: token.toLowerCase(), start: col, duration: span })
      }
      col += span
    }
  }
  return { ok: true, model: { steps: col, ...(alt !== null ? { bars } : {}), notes } }
}
