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
  // Span surgery first: it puts back what the user wrote wherever they didn't
  // edit. It declines (null) whenever the regions no longer describe the grid,
  // and the rebuilds below take over — the way this always worked.
  const spliced = spliceGrid(model)
  if (spliced !== null) return spliced

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

/* ── span surgery (#913) ───────────────────────────────────────── */

/**
 * Write back by editing the user's own bytes: every source region whose content
 * the user did not change is copied through VERBATIM, and only the regions they
 * did change are re-emitted from the grid.
 *
 * This is what stops an edit from being collateral. The model is a flat boolean
 * grid — it never knew the `*2` in `bd hh*2 sd cp` existed — so rebuilding the
 * whole string from it destroys every notation the grid can't express, whether
 * or not the edit went anywhere near it. Rebuilding only the touched region
 * bounds the damage to what was actually touched, and the unedited round-trip
 * (`serialize(parse(m)) === m`) falls out as a consequence rather than being a
 * case anyone has to special-case.
 *
 * Returns null when the regions no longer describe this grid — then the caller
 * rebuilds from the model, which is lossy and always was.
 */
function spliceGrid(model: StepGridModel): string | null {
  const src = model.source
  if (!src || src.parts.length === 0) return null
  // A per-column `.gain("…")` runs 1:1 against the FLAT column sequence, so a
  // grid carrying one has to keep emitting that sequence or the velocities
  // land on the wrong notes. Asked rather than re-derived, so the two writers
  // cannot drift apart.
  const gain = serializeStepGain(model)
  if (gain.kind === 'write' && gain.quoted) return null

  let out = src.prefix
  for (const p of src.parts) {
    const lanes = model.lanes.filter((l) => (l.part ?? 0) === p.part)
    const cols = partColumns(lanes, model.steps, p.factor)
    if (cols === null) return null
    // The regions index the grid they were parsed from. A resolution change
    // re-lays every column, so the moment the totals disagree no region means
    // anything and copying one through would paste the wrong bytes.
    const last = p.regions[p.regions.length - 1]
    if (!last || last.to !== cols.length) return null
    // A lone element owning the whole line has nothing to stay aligned WITH, so
    // a re-emit can spread across the line as plain steps instead of holding
    // its one step's worth of brackets: rewriting `hh*8` reads `hh ~ hh …`, not
    // `[hh ~ hh …]`. Identical to Strudel either way — a bracket around the
    // whole cycle IS the cycle — so this is only about not handing back noise.
    const sole = src.parts.length === 1 && src.prefix === '' && p.regions.length === 1
    out += p.before
    for (const r of p.regions) {
      const now = cols.slice(r.from, r.to)
      // untouched → the span's own bytes, verbatim; touched → re-emit, keeping
      // whatever padding the span carried around it
      out += sameCells(now, r.cells)
        ? r.raw
        : r.leading + (sole ? now.map(cellToken).join(' ') : reemitRegion(now, p.div)) + r.trailing
    }
    out += p.after
  }
  return out + src.suffix
}

/**
 * A part's own columns, read back off the shared grid it was stretched onto.
 *
 * `bd sd, hh*4` shows two columns against four, so part 0 lives on every second
 * shared column. Returns null when the part can no longer be written at its own
 * width — a hit landing BETWEEN its columns means the user asked for a finer
 * rhythm than the part's notation can hold, and the caller falls back to
 * rebuilding the whole line (lossy, and the only honest answer here).
 */
function partColumns(lanes: StepLane[], steps: number, factor: number): string[][] | null {
  if (factor < 1 || steps % factor !== 0) return null
  const all = columnAtoms(lanes, steps)
  const cols: string[][] = []
  for (let c = 0; c < steps; c++) {
    if (c % factor === 0) cols.push(all[c])
    else if (all[c].length > 0) return null
  }
  return cols
}

/** the sounds sitting in each column — lane order is presentational, so compare as sets */
function columnAtoms(lanes: StepLane[], steps: number): string[][] {
  const cols: string[][] = []
  for (let i = 0; i < steps; i++) cols.push(lanes.filter((l) => l.cells[i]).map((l) => l.sound))
  return cols
}

const sameCell = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x))

const sameCells = (a: string[][], b: string[][]): boolean =>
  a.length === b.length && a.every((c, i) => sameCell(c, b[i]))

/**
 * Re-emit one changed region as the SAME number of steps it owned, so its
 * neighbours keep their timing. Each step owns `div` columns: at `div === 1`
 * that is a bare token, and above it a `[…]` group — never `div` separate
 * top-level steps, which is exactly the flattening that pushed `hh*2`'s
 * neighbours out of position.
 */
function reemitRegion(cols: string[][], div: number): string {
  const steps: string[] = []
  for (let i = 0; i < cols.length; i += div) steps.push(reemitStep(cols.slice(i, i + div)))
  return steps.join(' ')
}

function reemitStep(cols: string[][]): string {
  if (cols.length === 1) return cellToken(cols[0])
  // a step nobody plays is `~`, not `[~ ~]`
  if (cols.every((c) => c.length === 0)) return '~'
  return `[${cols.map(cellToken).join(' ')}]`
}

const cellToken = (atoms: string[]): string =>
  atoms.length === 0 ? '~' : atoms.length === 1 ? atoms[0] : `[${atoms.join(',')}]`

/** one token per column: `~`, a sound, or `[a,b]` when several sound together */
function gridColumns(lanes: StepLane[], steps: number): string[] {
  return columnAtoms(lanes, steps).map(cellToken)
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
  if (model.gainForeign) return { kind: 'skip' }
  const bars = model.bars ?? 1
  // Multi-bar velocity is managed only when each bar is a single column
  // (`perBar === 1`, i.e. steps === bars) — one note/chord per bar (#632). There
  // bars ≡ columns, so the gain is the flat column sequence wrapped in `<...>`,
  // aligned bar-for-bar to the notes. Subdivided bars (perBar > 1) need a nested
  // gain mini and stay deferred → hand off.
  if (bars > 1 && model.steps !== bars) return { kind: 'skip' }
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
  // perBar === 1 multi-bar: one column per bar, so the flat sequence is wrapped
  // in `<...>` to align bar-for-bar with the note `<...>` (#632).
  const seq = cols.join(' ')
  return { kind: 'write', value: bars > 1 ? `<${seq}>` : seq, quoted: true }
}

export type { RollNote }
