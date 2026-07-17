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
import type {
  AltSource,
  GainWrite,
  NotationSource,
  PianoRollModel,
  RollNote,
  StepGridModel,
  StepLane,
} from './model'

/**
 * An `altSource` still describes a model only while its single-cycle width times
 * its bar count equals the model's columns. A restructure (resolution scale,
 * quantize) that moved the width out from under it leaves it stale — splicing
 * against stale spans would emit wrong bytes, so the caller falls back to the
 * whole-cycle rebuild instead (the #916 covers-check, for the alt writers).
 */
function altSourceFits<C>(a: AltSource<C> | undefined, steps: number): a is AltSource<C> {
  return !!a && a.perBar * a.bars === steps
}

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
  // A `<...>`-as-element pattern (`bd <sd hh>`, #920) uses its own span surgery
  // and NEVER the rebuilds below — a rebuild would reshape it into the
  // whole-cycle `<[bd sd] [bd hh]>`. Every grid edit is a cell toggle, always
  // expressible, so this path is total (unlike the roll's, which can decline).
  // The guard is the #916 covers-check: if a restructure moved the width out from
  // under the source, it no longer describes this grid — fall to the rebuild
  // (reshaped notation, correct haps) rather than splice against stale spans.
  if (altSourceFits(model.altSource, model.steps)) return spliceAltGrid(model)

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
    // The regions index the grid they were parsed from. If this part can no
    // longer be written at its own width — the user painted a hit finer than
    // its notation holds — then ITS regions are void, and ONLY its own: the
    // parts beside it were not touched and keep what the user wrote. Strudel
    // normalizes every `,`-part to its own weight, so re-emitting one of them
    // at the shared resolution leaves the others sounding exactly as written.
    const last = p.regions[p.regions.length - 1]
    out += p.before
    if (cols === null || last === undefined || last.to !== cols.length) {
      out += gridColumns(lanes, model.steps).join(' ') + p.after
      continue
    }
    // A lone element owning the whole line has nothing to stay aligned WITH, so
    // a re-emit can spread across the line as plain steps instead of holding
    // its one step's worth of brackets: rewriting `hh*8` reads `hh ~ hh …`, not
    // `[hh ~ hh …]`. Identical to Strudel either way — a bracket around the
    // whole cycle IS the cycle — so this is only about not handing back noise.
    const sole = src.parts.length === 1 && src.prefix === '' && p.regions.length === 1
    for (const r of p.regions) {
      const now = cols.slice(r.from, r.to)
      // untouched → the span's own bytes, verbatim; touched → re-emit, keeping
      // whatever padding the span carried around it
      out += sameCells(now, r.content)
        ? r.raw
        : r.leading + (sole ? now.map(cellToken).join(' ') : reemitRegion(now, p.div)) + r.trailing
    }
    out += p.after
  }
  return out + src.suffix
}

/* ── span surgery for `<...>`-as-element (#920) ────────────────── */

/**
 * Write back a `bd <sd hh>` pattern by editing the user's own bytes. Each
 * single-cycle element whose per-bar content is unchanged is copied through
 * verbatim; an edited one re-emits as `<b0 b1 …>` when its bars now differ,
 * plain when they agree — so editing a static cell in one bar PROMOTES it to an
 * alternation, and editing an alternation slot rewrites only that slot.
 *
 * Never rebuilds: an alt model that reached the whole-cycle `gridBars` path
 * would come back as `<[bd sd] [bd hh]>`, destroying the notation the user wrote.
 */
function spliceAltGrid(model: StepGridModel): string {
  const a = model.altSource
  if (!a) return '' // unreachable: caller gates on altSource
  const cols = columnAtoms(model.lanes, model.steps)
  let out = ''
  for (const r of a.regions) {
    const now: string[][][] = []
    for (let b = 0; b < a.bars; b++) {
      now.push(cols.slice(r.from + b * a.perBar, r.to + b * a.perBar).map((c) => [...new Set(c)]))
    }
    out += now.every((bar, b) => sameCells(bar, r.perBar[b]))
      ? r.raw
      : r.leading + reemitAltRegion(now, a.div) + r.trailing
  }
  return out
}

/** re-emit an edited alt element: `<b0 b1 …>` when its bars differ, plain when equal */
function reemitAltRegion(perBar: string[][][], div: number): string {
  const barTokens = perBar.map((bar) => reemitRegion(bar, div))
  return barTokens.every((t) => t === barTokens[0]) ? barTokens[0] : `<${barTokens.join(' ')}>`
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
  // A `<...>`-as-element pattern (`0 <2 3> 5`, #920) uses its own span surgery and
  // NEVER the rebuilds below — a rebuild would reshape it into the whole-cycle
  // `<[0 2 5] [0 3 5]>`. It returns null (keep the document) for an edit it can't
  // express, never wrong bytes.
  if (altSourceFits(model.altSource, model.steps)) return spliceAltRoll(model)

  // Span surgery first — same rule as the grid: put back what the user wrote
  // wherever they didn't edit. It declines (null) whenever the regions no longer
  // describe the notes, and the rebuilds below take over, the way this always
  // worked.
  const spliced = spliceRoll(model)
  if (spliced !== null) return spliced

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

/* ── span surgery, the roll (#916) ─────────────────────────────── */

const noteKey = (n: RollNote): string => `${n.pitch}:${n.start}:${n.duration}`

/**
 * Which `,`-part does each note belong to now?
 *
 * The roll's notes carry no part tag and a drag builds a FRESH note
 * (`[...baseNotes, { pitch, start, duration }]`), so a note cannot be followed
 * by identity through an edit — only matched by value. Notes that still match
 * one the part produced stay in it; a note that matches nothing is new or moved,
 * and the only part it can honestly be given to is the one that LOST a note.
 *
 * That is a rule about the common gesture, not about every gesture, so it is
 * held narrowly: if no part lost a note (a plain insert) or several did, there
 * is no non-arbitrary answer and we hand back null — the whole line rebuilds
 * from the model, which is what it did before this existed. Guessing here would
 * put the user's note in a voice they didn't touch.
 *
 * The single-part case has nothing to decide: every note is that part's.
 */
function assignNotes(
  model: PianoRollModel,
  src: NotationSource<RollNote[]>,
): Map<number, RollNote[]> | null {
  if (src.parts.length === 1) return new Map([[src.parts[0].part, model.notes]])

  const taken = new Set<RollNote>()
  const mine = new Map<number, RollNote[]>()
  const lost: number[] = []
  for (const p of src.parts) {
    const kept: RollNote[] = []
    let missing = false
    for (const was of p.regions.flatMap((r) => r.content)) {
      // by value, and each current note claimed once — two parts can hold the
      // same pitch at the same column (`0,0`), and both must stay theirs
      const hit = model.notes.find((n) => !taken.has(n) && noteKey(n) === noteKey(was))
      if (hit) {
        taken.add(hit)
        kept.push(hit)
      } else missing = true
    }
    if (missing) lost.push(p.part)
    mine.set(p.part, kept)
  }
  const strays = model.notes.filter((n) => !taken.has(n))
  if (strays.length === 0) return mine
  if (lost.length !== 1) return null
  mine.set(lost[0], [...(mine.get(lost[0]) ?? []), ...strays])
  return mine
}

/**
 * Write back by editing the user's own bytes — the roll's half of #913.
 *
 * A region owns columns `[from, to)` and the notes starting in it are its own.
 * Where those notes are what it produced, its bytes go back verbatim; only the
 * regions whose notes changed are re-emitted. So `C D` stays `C D` (the model
 * lowercases pitches for the row math, and that convention has no business
 * riding back out into the document), `c4*2 e4` keeps its `*2` when the drag
 * lands on the `e4`, and the unedited round-trip falls out rather than being a
 * case anyone maintains.
 *
 * Returns null when the regions no longer describe these notes — then the caller
 * rebuilds from the model, which is lossy and always was.
 */
function spliceRoll(model: PianoRollModel): string | null {
  const src = model.source
  if (!src || src.parts.length === 0) return null
  // A per-note `.gain("…")` mini runs 1:1 against the sequence THIS writer
  // emits, so a roll carrying one has to keep emitting that sequence or the
  // velocities land on the wrong notes (#915, the grid's identical case). Asked
  // rather than re-derived, so the two writers cannot drift apart.
  const gain = serializeRollGain(model)
  if (gain.kind === 'write' && gain.quoted) return null
  // The regions were built to tile a grid of some width. If the model's width
  // has moved since — a resolution ×2, a quantize to a new slot count — the
  // source is describing a layout that no longer exists, and splicing against it
  // would silently drop every note past the old end. Decline and let the model
  // rebuild, exactly as the grid's `last.to !== cols.length` check does. (The
  // restructuring ops could also drop `source`; this is the backstop that means
  // the writer's failure mode is a clean rebuild, never wrong bytes.)
  const covers = src.parts.every((p) => {
    const last = p.regions[p.regions.length - 1]
    return last !== undefined && last.to === model.steps
  })
  if (!covers) return null
  const assigned = assignNotes(model, src)
  if (assigned === null) return null

  // Fractional columns (from `@2.5` / `@3.5` weights, #628) don't sit on the
  // integer grid this writer re-emits onto — the column walk would step past a
  // note at 11.5 and drop it. An UNEDITED such pattern still round-trips (its
  // regions match and copy their own bytes below); an EDITED one must NOT be
  // spliced. Declining here returns null, and the caller keeps the document
  // untouched — the safe no-op #628 always had — instead of writing a rebuild
  // that silently loses the note.
  const integral = model.notes.every(
    (n) => Number.isInteger(n.start) && Number.isInteger(n.duration),
  )

  let out = src.prefix
  for (const p of src.parts) {
    const notes = assigned.get(p.part) ?? []
    if (notes.some((n) => n.start < 0 || n.duration < 1 || n.start + n.duration > model.steps)) {
      return null
    }
    out += p.before
    const last = p.regions[p.regions.length - 1]
    // The regions index the notes they were parsed from. A part whose notes no
    // longer fit its own columns can't be spliced — and that is not the other
    // parts' business, so only ITS regions go. Every roll part shares one column
    // space (see `SourcePart.factor`), so re-emitting one leaves the others
    // sounding exactly as written.
    let body: string | null = last === undefined ? null : ''
    for (const r of p.regions) {
      if (body === null) break
      const now = notes.filter((n) => n.start >= r.from && n.start < r.to)
      if (sameNotes(now, r.content)) {
        body += r.raw
        continue
      }
      // an edited region on a fractional grid can't be re-emitted safely — decline
      // the whole splice so the caller no-ops rather than dropping the note
      if (!integral) return null
      const re = reemitRollRegion(now, r.from, r.to, p.div)
      body = re === null ? null : body + r.leading + re + r.trailing
    }
    if (body === null) {
      // A region couldn't be re-emitted in its own span (an edit made it
      // inexpressible). This part rebuilds from the model as one flat lane —
      // and if its notes now overlap, that isn't a lane, so we decline the whole
      // splice and the caller's `serializeRollLanes` lays it across comma-lanes.
      const placed = toPlaced(notes)
      const rebuilt = placed && laneString(placed, model.steps)
      if (!rebuilt) return null
      out += rebuilt + p.after
      continue
    }
    out += body + p.after
  }
  return out + src.suffix
}

/* ── span surgery for `<...>`-as-element, the roll (#920) ──────── */

/**
 * The roll's half of `spliceAltGrid`. Each single-cycle element whose per-bar
 * notes are unchanged is copied through verbatim; an edited one re-emits per bar
 * (weight-preserving, chords and `@n` intact, crossing notes group-wrapped — all
 * via `reemitRollRegion`) and combines the bars as `<b0 b1 …>`, or plain when they
 * agree. Declines (null → keep the document) on a fractional grid or a note that
 * can't be said in its span — never a whole-cycle rebuild.
 */
function spliceAltRoll(model: PianoRollModel): string | null {
  const a = model.altSource
  if (!a) return null
  // a per-note `.gain("…")` can't ride an alternation yet → hands off (#915 class)
  const gain = serializeRollGain(model)
  if (gain.kind === 'write' && gain.quoted) return null
  // fractional columns don't sit on the integer grid the re-emit walks — an
  // unedited pattern still round-trips (raw copy), an edited one declines.
  const integral = model.notes.every(
    (n) => Number.isInteger(n.start) && Number.isInteger(n.duration),
  )
  let out = ''
  for (const r of a.regions) {
    const perBarNow: RollNote[][] = []
    for (let b = 0; b < a.bars; b++) {
      const lo = r.from + b * a.perBar
      const hi = r.to + b * a.perBar
      perBarNow.push(
        model.notes
          .filter((n) => n.start >= lo && n.start < hi)
          .map((n) => ({ pitch: n.pitch, start: n.start - b * a.perBar, duration: n.duration })),
      )
    }
    if (perBarNow.every((bar, b) => sameNotes(bar, r.perBar[b]))) {
      out += r.raw
      continue
    }
    if (!integral) return null
    const re = reemitAltRoll(perBarNow, r.from, r.to, a.div)
    if (re === null) return null
    out += r.leading + re + r.trailing
  }
  return out
}

/** re-emit an edited roll alt element per bar, then `<b0 b1 …>` (plain when equal) */
function reemitAltRoll(
  perBar: RollNote[][],
  from: number,
  to: number,
  div: number,
): string | null {
  const barTokens: string[] = []
  for (const notes of perBar) {
    const re = reemitRollRegion(notes, from, to, div)
    if (re === null) return null
    barTokens.push(re)
  }
  return barTokens.every((t) => t === barTokens[0]) ? barTokens[0] : `<${barTokens.join(' ')}>`
}

/** same notes, in any order — a multiset compare on (pitch, start, duration) */
function sameNotes(a: RollNote[], b: RollNote[]): boolean {
  if (a.length !== b.length) return false
  const left = a.map(noteKey).sort()
  const right = b.map(noteKey).sort()
  return left.every((k, i) => k === right[i])
}

/** notes → chord groups keyed by start; same start with different lengths can't share a lane */
function toPlaced(notes: RollNote[]): PlacedGroup[] | null {
  const byStart = new Map<number, PlacedGroup>()
  for (const n of [...notes].sort((x, y) => x.start - y.start)) {
    const g = byStart.get(n.start)
    if (!g) byStart.set(n.start, { pitches: [n.pitch], start: n.start, duration: n.duration })
    else if (g.duration !== n.duration) return null
    else g.pitches.push(n.pitch)
  }
  return [...byStart.values()]
}

/**
 * Re-emit one changed region over its own columns — and, above all, at its own
 * WEIGHT.
 *
 * This is where the roll differs from the grid. The grid refuses elongation, so
 * every step is one `div`-wide column and re-emitting `n` columns as `n` steps
 * is automatically the same length. Here `c4@2` is ONE step spanning two
 * columns: emit it as two steps and the region's weight goes 1 → 2, Strudel
 * re-divides the cycle, and every neighbour the edit never touched changes
 * timing. So a region owning `w` columns must come back as exactly `w / div`
 * steps' worth of weight, or not at all.
 *
 * Returns null only when these notes truly can't be said in that space — a chord
 * whose members have different lengths (that needs parallel lanes, a restructure
 * of the whole line) or notes that overlap in time.
 */
function reemitRollRegion(
  notes: RollNote[],
  from: number,
  to: number,
  div: number,
): string | null {
  const groups = toPlaced(notes)
  if (groups === null) return null
  const at = new Map(groups.map((g) => [g.start, g]))
  const starts = groups.map((g) => g.start).sort((a, b) => a - b)
  const tokens: string[] = []
  let c = from
  let crossed = false
  while (c < to) {
    const g = at.get(c)
    // a group filling whole steps from a step boundary is one `@k` token — the
    // shape the user most likely wrote, and the one that keeps the weight
    if (g && g.duration % div === 0) {
      const end = c + g.duration
      if (end > to) return null
      if (starts.some((s) => s > c && s < end)) return null // overlap
      tokens.push(groupToken({ pitches: g.pitches, duration: g.duration / div }))
      c = end
      continue
    }
    // otherwise this step has structure inside it: `div` columns' worth of slots
    // whose weights sum to `div`, i.e. one step
    const end = c + div
    const slots: string[] = []
    let k = c
    while (k < end) {
      const gg = at.get(k)
      if (!gg) {
        slots.push('~')
        k++
        continue
      }
      // a note sustaining PAST this step's boundary can't be a per-step token —
      // splitting it would make two onsets. The whole region re-emits as one
      // weighted group instead, which holds a crossing note faithfully.
      if (k + gg.duration > end) {
        crossed = true
        break
      }
      slots.push(groupToken({ pitches: gg.pitches, duration: gg.duration }))
      k += gg.duration
    }
    if (crossed) break
    // a step nobody plays is `~`, not `[~ ~]`
    tokens.push(
      slots.every((s) => s === '~') ? '~' : slots.length === 1 ? slots[0] : `[${slots.join(' ')}]`,
    )
    c = end
  }
  if (crossed) return groupWrapRegion(at, starts, from, to, div)
  return tokens.join(' ')
}

/**
 * Re-emit a whole region as ONE weighted group: `[a@2 b@4]@2`. A bracket
 * normalizes its contents across its own slots, so a note sustaining across an
 * internal step boundary — which no per-step form can hold without splitting it
 * into two onsets — comes back faithfully. The column durations go straight in
 * (they sum to the region's width), and `@steps` gives the bracket the region's
 * weight so its neighbours keep their timing. Hap-equivalent to the per-step
 * form where both apply; used only where the per-step form can't.
 */
function groupWrapRegion(
  at: Map<number, PlacedGroup>,
  starts: number[],
  from: number,
  to: number,
  div: number,
): string | null {
  const inner: string[] = []
  let c = from
  while (c < to) {
    const g = at.get(c)
    if (!g) {
      inner.push('~')
      c++
      continue
    }
    if (c + g.duration > to) return null // sustains past the region itself
    if (starts.some((s) => s > c && s < c + g.duration)) return null // overlap
    inner.push(groupToken({ pitches: g.pitches, duration: g.duration }))
    c += g.duration
  }
  const steps = (to - from) / div
  const body = `[${inner.join(' ')}]`
  return steps === 1 ? body : `${body}@${steps}`
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
