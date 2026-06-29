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
import type { GainWrite, PianoRollModel, RollNote, StepGridModel, StepLane } from './model'

/**
 * Format a velocity for a `.gain("…")` token: 2 decimals, trailing zeros and
 * any orphaned point stripped, so a drag's `0.5000001` comes out `0.5`. Local
 * (not writeback's `formatNumber`) so the notation layer stays free of the
 * binding layer; gain needs only 2 decimals.
 */
function fmtGain(v: number): string {
  if (!Number.isFinite(v)) return '1'
  if (Number.isInteger(v)) return String(v)
  return v.toFixed(2).replace(/\.?0+$/, '')
}

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

/**
 * The `.gain("…")` mini for a step grid's per-column velocity, aligned 1:1 to
 * the columns `serializeStepGrid` emits. Returns a `GainWrite` so the binding
 * layer knows whether to upsert, remove, or leave the `.gain` alone:
 *   - `skip`  — multi-bar or `,`-stack (we don't align gain across those yet),
 *      or a `.gain` we couldn't parse onto the grid (`gainForeign`): hands off;
 *   - `clear` — every column neutral (gain 1): remove our `.gain`;
 *   - `write` — one token per column: a rest column → `~` (no gain event), else
 *      the column's gain.
 */
export function serializeStepGain(model: StepGridModel): GainWrite {
  if (model.gainForeign) return { kind: 'skip' }
  const bars = model.bars ?? 1
  const parts = new Set(model.lanes.map((l) => l.part ?? 0))
  if (bars > 1 || parts.size > 1) return { kind: 'skip' }
  const gains = model.gains
  if (!gains || gains.length !== model.steps) return { kind: 'clear' }
  const cols = gridColumns(model.lanes, model.steps)
  // only the active (non-rest) columns carry an audible gain
  const active = gains.filter((_, i) => cols[i] !== '~')
  if (active.length === 0 || active.every((g) => g === 1)) return { kind: 'clear' }
  // uniform non-1 level → collapse to a scalar `.gain(v)` (the track-level form)
  if (active.every((g) => g === active[0])) {
    return { kind: 'write', value: fmtGain(active[0]), quoted: false }
  }
  // mixed → per-column string, rest columns as `~`
  const mini = cols.map((tok, i) => (tok === '~' ? '~' : fmtGain(gains[i]))).join(' ')
  return { kind: 'write', value: mini, quoted: true }
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
  const bars = model.bars ?? 1
  if (bars > 1) {
    // Multi-bar `<...>` keeps the shared-duration chord path (parallel lanes are
    // single-bar only for now, #628): chord members must share a duration there.
    const groups = buildGroups(model)
    if (groups === null) return null
    return rollBars(groups, model.steps, bars)
  }
  return serializeRollLanes(model)
}

/** A chord group: notes sharing BOTH a start and a duration → one `[..]@d` token. */
interface PlacedGroup {
  pitches: string[]
  start: number
  duration: number
}

/**
 * Bucket notes into chord groups keyed by (start, duration). Unlike `buildGroups`,
 * same-start notes with DIFFERENT durations become SEPARATE groups (they'll land
 * in different parallel lanes), so independent note lengths are expressible (#628).
 * Returns null if any note is out of range (inexpressible).
 */
function placedGroups(model: PianoRollModel): PlacedGroup[] | null {
  const byKey = new Map<string, PlacedGroup>()
  for (const note of [...model.notes].sort((a, b) => a.start - b.start)) {
    if (note.start < 0 || note.duration < 1 || note.start + note.duration > model.steps) {
      return null
    }
    const key = `${note.start}:${note.duration}`
    const g = byKey.get(key)
    if (g) g.pitches.push(note.pitch)
    else byKey.set(key, { pitches: [note.pitch], start: note.start, duration: note.duration })
  }
  return [...byKey.values()]
}

/**
 * Greedy interval-partition the chord groups into the minimal set of lanes such
 * that no two groups in a lane overlap in time (#628). Groups are sorted by start
 * then duration; each joins the first lane whose last group ends at or before its
 * start, else a new lane. Deterministic → the round-trip is stable.
 */
function packLanes(groups: PlacedGroup[]): PlacedGroup[][] {
  const sorted = [...groups].sort((a, b) => a.start - b.start || a.duration - b.duration)
  const lanes: Array<{ end: number; groups: PlacedGroup[] }> = []
  for (const g of sorted) {
    const lane = lanes.find((l) => l.end <= g.start)
    if (lane) {
      lane.groups.push(g)
      lane.end = g.start + g.duration
    } else {
      lanes.push({ end: g.start + g.duration, groups: [g] })
    }
  }
  return lanes.map((l) => l.groups)
}

/**
 * Serialize one lane's (non-overlapping) groups as a FULL-WIDTH column sequence,
 * padding trailing rests to `steps`. Every lane spans all `steps` columns so the
 * parallel lanes share one step grid — Strudel normalizes each comma-part to its
 * own total weight, so unequal widths would misalign the grids (#628 grounding).
 */
function laneString(groups: PlacedGroup[], steps: number): string | null {
  const cols: string[] = []
  let col = 0
  for (const g of [...groups].sort((a, b) => a.start - b.start)) {
    if (g.start < col) return null // overlap within a lane (shouldn't happen post-pack)
    while (col < g.start) {
      cols.push('~')
      col++
    }
    cols.push(groupToken({ pitches: g.pitches, duration: g.duration }))
    col += g.duration
  }
  while (col < steps) {
    cols.push('~')
    col++
  }
  return cols.join(' ')
}

/**
 * Single-bar piano roll → mini-notation, with parallel comma-lanes when notes
 * overlap in time (#628). A non-overlapping pattern packs into ONE lane and
 * serializes exactly as before (no churn); overlapping notes split across lanes
 * joined by `, ` (e.g. `c3@2 ~ ~, e3 ~ ~ ~`).
 */
function serializeRollLanes(model: PianoRollModel): string | null {
  const groups = placedGroups(model)
  if (groups === null) return null
  const lanes = packLanes(groups)
  // No notes (or all rests) → a single all-rest lane `~ ~ … ~`, never an empty
  // string (a deleted note must still serialize the grid).
  if (lanes.length === 0) return laneString([], model.steps)
  const strings: string[] = []
  for (const lane of lanes) {
    const s = laneString(lane, model.steps)
    if (s === null) return null
    strings.push(s)
  }
  return strings.join(', ')
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

/**
 * The `.gain("…")` mini for a roll's per-note velocity, mirroring the structure
 * `serializePianoRoll` emits for a single-bar roll: one token per note GROUP at
 * its start column (with `@duration` when held), `~` at rest columns. Chord
 * members (shared start) must share a gain — like duration — else the gain is
 * inexpressible (`skip`). Returns:
 *   - `skip`  — multi-bar, a `.gain` we don't manage (`gainForeign`), an
 *      out-of-range / chord-gain-mismatch shape; leave any `.gain` untouched;
 *   - `clear` — every note neutral (gain 1): remove our `.gain`;
 *   - `write` — the column-aligned gain mini.
 */
export function serializeRollGain(model: PianoRollModel): GainWrite {
  if (model.gainForeign || (model.bars ?? 1) > 1) return { kind: 'skip' }
  // Overlapping notes serialize across parallel comma-lanes (#628); the gain mini
  // is a single column sequence and can't align per-lane, so hand off (v1).
  const placed = placedGroups(model)
  if (placed !== null && packLanes(placed).length > 1) return { kind: 'skip' }
  const groups = new Map<number, { duration: number; gain: number }>()
  for (const note of [...model.notes].sort((a, b) => a.start - b.start)) {
    if (note.start < 0 || note.duration < 1 || note.start + note.duration > model.steps) {
      return { kind: 'skip' } // inexpressible (serializePianoRoll returns null here too)
    }
    const gain = note.gain ?? 1
    const g = groups.get(note.start)
    if (!g) groups.set(note.start, { duration: note.duration, gain })
    else if (g.duration !== note.duration || g.gain !== gain) return { kind: 'skip' }
  }
  const vals = [...groups.values()].map((g) => g.gain)
  if (vals.length === 0 || vals.every((g) => g === 1)) return { kind: 'clear' }
  // uniform non-1 level → collapse to a scalar `.gain(v)`
  if (vals.every((g) => g === vals[0])) {
    return { kind: 'write', value: fmtGain(vals[0]), quoted: false }
  }

  const cols: string[] = []
  let col = 0
  for (const start of [...groups.keys()].sort((a, b) => a - b)) {
    if (start < col) return { kind: 'skip' } // overlap
    while (col < start) {
      cols.push('~')
      col++
    }
    const g = groups.get(start)!
    cols.push(g.duration === 1 ? fmtGain(g.gain) : `${fmtGain(g.gain)}@${g.duration}`)
    col += g.duration
  }
  while (col < model.steps) {
    cols.push('~')
    col++
  }
  return { kind: 'write', value: cols.join(' '), quoted: true }
}

export type { RollNote }
