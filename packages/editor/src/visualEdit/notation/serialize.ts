/**
 * Notation models → mini-notation. The round-trip law (golden-tested):
 *   serialize(parse(s).model) === s   for canonical strings
 *   parse(serialize(m)).model ≡ m
 *
 * Canonical form: single-space separated, lanes in first-appearance order,
 * multi-bar patterns as a whole-string `<...>` alternation (one slot per bar),
 * `,`-stack parts in ascending part order. Serializing a model the subset
 * can't express (overlapping roll notes, a note straddling a bar line) returns
 * null and the panel keeps the document untouched.
 */
import type { PianoRollModel, RollNote, StepGridModel, StepLane } from './model'

/* ── drum grid ─────────────────────────────────────────────────── */

export function serializeStepGrid(model: StepGridModel): string {
  const bars = model.bars ?? 1
  if (bars > 1) return gridBars(model, bars)

  const parts = [...new Set(model.lanes.map((l) => l.part ?? 0))].sort((a, b) => a - b)
  if (parts.length <= 1) return gridColumns(model.lanes, model.steps).join(' ')
  return parts
    .map((p) =>
      gridColumns(
        model.lanes.filter((l) => (l.part ?? 0) === p),
        model.steps,
      ).join(' '),
    )
    .join(', ')
}

/** one token per column: `~`, a sound, or `[a,b]` when several sound together */
function gridColumns(lanes: StepLane[], steps: number): string[] {
  const cols: string[] = []
  for (let i = 0; i < steps; i++) {
    const active = lanes.filter((l) => l.cells[i]).map((l) => l.sound)
    if (active.length === 0) cols.push('~')
    else if (active.length === 1) cols.push(active[0])
    else cols.push(`[${active.join(',')}]`)
  }
  return cols
}

/** `<...>` with one slot per bar; an all-rest bar collapses to `~` */
function gridBars(model: StepGridModel, bars: number): string {
  const perBar = model.steps / bars
  const cols = gridColumns(model.lanes, model.steps)
  const slots: string[] = []
  for (let b = 0; b < bars; b++) {
    const bar = cols.slice(b * perBar, (b + 1) * perBar)
    if (bar.every((c) => c === '~')) slots.push('~')
    else if (perBar === 1) slots.push(bar[0])
    else slots.push(`[${bar.join(' ')}]`)
  }
  return `<${slots.join(' ')}>`
}

/* ── piano roll ────────────────────────────────────────────────── */

interface Group {
  pitches: string[]
  duration: number
}

const groupBody = (g: Group): string =>
  g.pitches.length === 1 ? g.pitches[0] : `[${g.pitches.join(',')}]`

const groupToken = (g: Group): string =>
  g.duration === 1 ? groupBody(g) : `${groupBody(g)}@${g.duration}`

/**
 * Bucket notes by start column. Chord notes sharing a start must share a
 * duration; anything out of range returns null (inexpressible in the subset).
 */
function buildGroups(model: PianoRollModel): Map<number, Group> | null {
  const groups = new Map<number, Group>()
  for (const note of [...model.notes].sort((a, b) => a.start - b.start)) {
    if (note.start < 0 || note.duration < 1 || note.start + note.duration > model.steps) {
      return null
    }
    const g = groups.get(note.start)
    if (!g) groups.set(note.start, { pitches: [note.pitch], duration: note.duration })
    else if (g.duration !== note.duration) return null
    else g.pitches.push(note.pitch)
  }
  return groups
}

export function serializePianoRoll(model: PianoRollModel): string | null {
  const groups = buildGroups(model)
  if (groups === null) return null
  const bars = model.bars ?? 1
  if (bars > 1) return rollBars(groups, model.steps, bars)

  const cols: string[] = []
  let col = 0
  for (const start of [...groups.keys()].sort((a, b) => a - b)) {
    if (start < col) return null // overlap
    while (col < start) {
      cols.push('~')
      col++
    }
    const g = groups.get(start)!
    cols.push(groupToken(g))
    col += g.duration
  }
  while (col < model.steps) {
    cols.push('~')
    col++
  }
  return cols.join(' ')
}

/**
 * `<...>` one slot per bar: a group filling whole bars from a bar boundary is a
 * bare slot (`@k` holds k bars); a subdivided bar is a `[...]` group of in-bar
 * `@`-durations; an all-rest bar is `~`. A note crossing a bar line partway is
 * inexpressible → null.
 */
function rollBars(groups: Map<number, Group>, steps: number, bars: number): string | null {
  const perBar = steps / bars
  if (!Number.isInteger(perBar)) return null
  const starts = [...groups.keys()].sort((a, b) => a - b)
  const slots: string[] = []
  let b = 0
  while (b < bars) {
    const barStart = b * perBar
    const barEnd = barStart + perBar
    const atStart = groups.get(barStart)
    if (atStart && atStart.duration % perBar === 0) {
      const k = atStart.duration / perBar
      const heldEnd = barStart + atStart.duration
      if (starts.some((s) => s > barStart && s < heldEnd)) return null
      slots.push(k === 1 ? groupBody(atStart) : `${groupBody(atStart)}@${k}`)
      b += k
      continue
    }
    if (perBar === 1) {
      slots.push('~')
      b++
      continue
    }
    const tokens: string[] = []
    let c = barStart
    let consumed = 0
    while (c < barEnd) {
      const g = groups.get(c)
      if (!g) {
        tokens.push('~')
        c++
        continue
      }
      if (c + g.duration > barEnd) return null // crosses the bar line
      tokens.push(groupToken(g))
      c += g.duration
      consumed++
    }
    // a group skipped over (covered by another's span) is an overlap
    if (consumed !== starts.filter((s) => s >= barStart && s < barEnd).length) return null
    slots.push(tokens.every((t) => t === '~') ? '~' : `[${tokens.join(' ')}]`)
    b++
  }
  return `<${slots.join(' ')}>`
}

export type { RollNote }
