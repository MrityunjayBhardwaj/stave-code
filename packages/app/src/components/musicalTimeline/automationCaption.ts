/**
 * The automation lane's BOUNDS CAPTION — its text, its geometry, and what a
 * pointer landing on it has hit (#1464 Stage 2).
 *
 * A caption reads `cutoff 200→2000`, drawn in its own curve's colour at the
 * top-left of an expanded lane's band. It exists because the range leg is
 * INVISIBLE in the curve: every curve is normalised to its own range, so
 * `.range(0.4,0.6)` and `.range(0,1)` draw an identical wave. A DAW labels the
 * lane's axis instead of rescaling the curve, and this is that label.
 *
 * Stage 2 makes those numbers editable, which is why the layout moved out of
 * `drawTimeline` and into here. ⚠ THE DRAW PATH AND THE HIT-TEST MUST SHARE ONE
 * GEOMETRY — the same rule `laneMarkBands` already holds the live overlay to
 * (PV120), and for the same reason: two copies of "where is the `lo` number"
 * drift apart under any change to the text, and the drift is silent. A click
 * lands one glyph off and edits the wrong bound.
 *
 * This module is pure. It measures nothing itself: callers pass a `measure`
 * function, so the draw path can use its own canvas context and a hit-test can
 * use another, while the field arithmetic stays in one place.
 */
import type { SignalAutomation, SignalKind, OffsetEdit } from '@stave/editor'

/** 9px monospace, matching the rest of the lane's small type. */
export const AUTOMATION_LABEL_FONT = '9px ui-monospace, SFMono-Regular, Menlo, monospace'

/** Below this band height a curve cannot read as a shape rather than as a thick
 *  line, so the lane draws none — and, since #1495, no caption either.
 *
 *  ⚠ ONE FLOOR, NOT TWO. The caption used to abstain at its own higher
 *  threshold (22px — two line advances, chosen for the stacked case). Between
 *  the two floors sat a band where the CURVE WAS DRAWN AND ITS BOUNDS WERE NOT,
 *  and the bounds are the whole of what says BETWEEN WHICH VALUES the sweep
 *  runs, because every curve is normalised to its own range. A single-voice
 *  PERCUSSIVE lane lands exactly there at the default density (a 25px row is a
 *  19px band), so the commonest automated document there is — one drum track
 *  with a swept filter — drew a curve nobody could read, and since #1464
 *  Stage 2 could not edit either. The rule is now: WHATEVER IS DRAWN IS
 *  LABELLED. Raising this floor again without raising the curve's would reopen
 *  the same gap, which is why there is only one constant to raise. */
export const AUTOMATION_MIN_BAND_H = 10

/** Line advance between stacked captions. */
export const AUTOMATION_LABEL_LINE_H = 11

/** Cap height of the 9px face — the clickable height of one caption line. */
export const AUTOMATION_LABEL_TEXT_H = 10

/** Which leg of the automation a caption field names.
 *
 *  ⚠ `param` IS NOT A TYPED FIELD. It is where the shape menu hangs (#1464),
 *  since the kind has no glyph of its own in the caption, and it is reported so a
 *  caller can tell "on the name" from "on a number". Nothing can be typed into it,
 *  so no text editor may open over it: a field that accepts text and then discards
 *  it is worse than an inert label. `captionEdit` returns null for it; a shape is
 *  written by `shapeEdit`, and only where `shapeOptions` offers one. */
export type CaptionFieldKind = 'param' | 'lo' | 'hi' | 'rate'

export interface CaptionField {
  readonly kind: CaptionFieldKind
  /** The text of this field alone — what an editor opens with. */
  readonly text: string
  /** Character offsets within the caption line. Positions come from measuring
   *  `line.slice(0, from)` and `line.slice(0, to)`, never from a per-glyph
   *  width, so a proportional fallback face still lands correctly. */
  readonly from: number
  readonly to: number
}

export interface CaptionRow {
  readonly automation: SignalAutomation
  /** The whole line as drawn. */
  readonly text: string
  /** Top of this line in canvas Y. */
  readonly y: number
  readonly fields: readonly CaptionField[]
}

export interface CaptionHit {
  readonly row: CaptionRow
  readonly field: CaptionField
  /** The field's screen box, so a caller can place an input exactly over it. */
  readonly box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
}

/** Inset from the lane's left edge to the caption's first glyph — the same
 *  inset a clip caption uses, so the two read as one column. */
export const CAPTION_PAD_X = 4

/** The automation band's inset from the lane's top and bottom edge — and so
 *  also the first caption line's top inset. ONE constant rather than two that
 *  must agree: `drawTimeline` imports this for the band it paints, because a
 *  band and a caption that disagreed about the padding would put the text
 *  outside the thing it labels. */
export const AUTOMATION_PAD_Y = 3

/**
 * Format a bound for display.
 *
 * ⚠ LOSSY, DELIBERATELY: `0.30001` shows as `0.3`. Committing a displayed
 * string back to the document would therefore silently rewrite the user's
 * number — which is why no caller is asked not to. `captionEdit` is the only
 * way to turn a caption into an edit, it composes from the automation's own
 * NUMBERS rather than from any displayed text, and it returns null when nothing
 * changed. The rounding cannot reach the document through it.
 */
export function formatBound(v: number): string {
  if (!Number.isFinite(v)) return '?'
  if (Number.isInteger(v)) return String(v)
  return String(Math.round(v * 1000) / 1000)
}

/** The `~` that marks bounds this code SUPPLIED rather than ones the user wrote: the
 *  signal's natural polarity when no `.range()` is written, and the floor and ceiling
 *  a range PLAYS where they are not its arguments (#1610, `sine2.range(200, 2000)` reads
 *  `~-1600→2000`). The mark is the only warning the reader gets that the numbers beside
 *  it are not the ones in the document. */
export function suppliedMark(a: SignalAutomation): string {
  return a.ranged && a.boundsAsWritten ? '' : '~'
}

/**
 * #1464 Stage 3 — the rate as the caption spells it: the bars one period of the
 * curve spans ON THE LANE, which under a whole-track time change is not the number in
 * the signal's own `.slow()`. `~`-marked when the signal writes no rate of its own,
 * for the bounds' reason. Null when the curve's routes disagree about that number.
 *
 * ⚠ The `~` reads `periodCycles === 1` as "no rate written", the proxy the span
 * census documents: `sine.slow(2).fast(2)` states two rates that compose to 1 and is
 * marked as if it stated none. An inserted `.slow(P)` still gives it the typed period,
 * because a rate appended to a chain multiplies what is already there.
 */
function rateText(a: SignalAutomation): { mark: string; bars: string; unit: string } | null {
  const p = a.lanePeriodCycles
  if (p === null) return null
  return {
    mark: a.spans.rate === null && a.periodCycles === 1 ? '~' : '',
    bars: formatBound(p),
    unit: p === 1 ? 'bar' : 'bars',
  }
}

/**
 * Whether a typed rate has somewhere honest to go: one spelled rate to replace, or no
 * rate at all and a place to insert one. Two composing rates have neither — the
 * number is shown, and no field is offered over it.
 */
export function rateEditable(a: SignalAutomation): boolean {
  if (a.lanePeriodCycles === null) return false
  if (a.spans.rate !== null) return true
  return a.periodCycles === 1 && a.spans.chainEnd !== null
}

/** The caption line for one automation, exactly as drawn. */
export function captionText(a: SignalAutomation): string {
  const bounds = `${a.paramKey} ${suppliedMark(a)}${formatBound(a.lo)}→${formatBound(a.hi)}`
  const rate = rateText(a)
  return rate ? `${bounds} ${rate.mark}${rate.bars} ${rate.unit}` : bounds
}

/**
 * Lay out one lane's captions: which lines are drawn, where, and which spans of
 * each line name which leg.
 *
 * Returns empty for a collapsed lane, a band too short to DRAW, or a lane with
 * no automation — the same three abstentions the draw path already made, kept
 * here so the hit-test cannot believe in a caption that was never painted.
 */
export function captionRows(
  automations: readonly SignalAutomation[],
  top: number,
  rowHeight: number,
  expanded: boolean,
): readonly CaptionRow[] {
  if (!expanded || automations.length === 0) return []
  const bandH = rowHeight - AUTOMATION_PAD_Y * 2
  if (bandH < AUTOMATION_MIN_BAND_H) return []

  const rows: CaptionRow[] = []
  let y = top + AUTOMATION_PAD_Y
  for (const a of automations) {
    // The draw loop stops when the next line would overflow the row; stopping on
    // the same condition is what keeps the two in step.
    if (y + AUTOMATION_LABEL_TEXT_H > top + rowHeight) break

    const name = a.paramKey
    const mark = suppliedMark(a)
    const lo = formatBound(a.lo)
    const hi = formatBound(a.hi)
    const bounds = `${name} ${mark}${lo}→${hi}`

    const loFrom = name.length + 1 + mark.length
    const loTo = loFrom + lo.length
    const hiFrom = loTo + 1 // the arrow is one character
    const hiTo = hiFrom + hi.length
    const fields: CaptionField[] = [{ kind: 'param', text: name, from: 0, to: name.length }]
    // #1610 — only where a typed bound reads back as typed. Elsewhere the numbers are
    // shown and no field is offered over them, as with two composing rates.
    if (a.boundsAsWritten) {
      fields.push({ kind: 'lo', text: lo, from: loFrom, to: loTo }, { kind: 'hi', text: hi, from: hiFrom, to: hiTo })
    }

    // #1464 Stage 3 — ` ~4 bars`. The number alone is the field, as a bound's is, and
    // only where a typed number can be written (`rateEditable`).
    let text = bounds
    const rate = rateText(a)
    if (rate) {
      text = `${bounds} ${rate.mark}${rate.bars} ${rate.unit}`
      const rateFrom = bounds.length + 1 + rate.mark.length
      if (rateEditable(a)) fields.push({ kind: 'rate', text: rate.bars, from: rateFrom, to: rateFrom + rate.bars.length })
    }

    rows.push({ automation: a, text, y, fields })
    y += AUTOMATION_LABEL_LINE_H
  }
  return rows
}

/**
 * Which caption field, if any, is under a point.
 *
 * `measure` is the caller's text measurer for `AUTOMATION_LABEL_FONT`. Passing
 * it in rather than measuring here is what lets the draw path and the hit-test
 * share this arithmetic without this module owning a canvas.
 */
export function captionHit(
  rows: readonly CaptionRow[],
  x: number,
  y: number,
  measure: (text: string) => number,
): CaptionHit | null {
  for (const row of rows) {
    if (y < row.y || y >= row.y + AUTOMATION_LABEL_TEXT_H) continue
    for (const field of row.fields) {
      const left = CAPTION_PAD_X + measure(row.text.slice(0, field.from))
      const right = CAPTION_PAD_X + measure(row.text.slice(0, field.to))
      if (x >= left && x < right) {
        return {
          row,
          field,
          box: { x: left, y: row.y, w: right - left, h: AUTOMATION_LABEL_TEXT_H },
        }
      }
    }
  }
  return null
}


/**
 * Turn "the user typed `nextText` into this caption field" into a source edit,
 * or into NOTHING.
 *
 * ⚠ THIS FUNCTION IS THE ENFORCEMENT, not a comment asking callers to be
 * careful. Three things can only go right because they happen here:
 *
 *  1. THE ROUNDING CANNOT ESCAPE. The untouched bound is written from the
 *     automation's own `lo`/`hi` number, never from the string beside it on
 *     screen — so editing `hi` on a caption reading `0.3→1` cannot quietly
 *     rewrite a `lo` of `0.30001`.
 *  2. AN UNCHANGED FIELD WRITES NOTHING. Re-committing the same value would
 *     otherwise reformat the user's `.range(0.30001,1)` into `.range(0.3,1)`
 *     for free, which is a document edit nobody asked for.
 *  3. A LEG THE DOCUMENT DOES NOT SPELL INSERTS rather than replaces, at the
 *     coordinate the reader supplies. `~pan 0→1` has no `.range()` to overwrite;
 *     the edit appends one. Getting this wrong is not a wrong number, it is a
 *     corrupted expression.
 *
 * Returns null for anything it cannot do honestly: a non-numeric entry, an
 * unchanged value, an inverted or degenerate range, or an automation whose
 * spans give it nowhere to write.
 */
export function captionEdit(hit: CaptionHit, nextText: string): OffsetEdit | null {
  const { field, row } = hit
  const a = row.automation
  // The parameter name is the shape menu's anchor, not a typed field.
  if (field.kind === 'param') return null
  if (field.kind === 'rate') return rateEdit(a, nextText)
  // #1610 — enforced here, not left to `captionRows` offering no field: on a bipolar
  // signal, or under an inner range that is not 0..1, the typed pair would play another.
  if (!a.boundsAsWritten) return null

  const raw = nextText.trim()
  // ⚠ `Number('')` is 0, not NaN — and so is `Number(' ')`. Without this guard,
  // clearing the field and committing writes a bound of ZERO into the document,
  // which is a plausible number and therefore a silent corruption rather than a
  // visible error. Caught by its own test, not by reading.
  if (raw.length === 0) return null
  const next = Number(raw)
  if (!Number.isFinite(next)) return null

  const lo = field.kind === 'lo' ? next : a.lo
  const hi = field.kind === 'hi' ? next : a.hi
  // Unchanged — see (2). Compared as NUMBERS, so `0.30` typed over `0.3` is
  // correctly no edit at all rather than a rewrite.
  if (lo === a.lo && hi === a.hi) return null
  // A range must span something. And it keeps the direction it was written in
  // (#1613): `range(0.7, 0.3)` plays downward (measured) and is drawn so, and a typed
  // bound that crossed the other would silently turn the curve over — most likely a
  // typo. A flat range has no direction yet, so either way widens it.
  if (hi === lo) return null
  if (a.hi !== a.lo && hi > lo !== a.hi > a.lo) return null

  // ⚠ `String`, and DELIBERATELY NOT the house `formatNumber` helper, which
  // exists for drag handlers whose arithmetic produces float noise. There is no
  // arithmetic here: one bound is the number the user just typed and the other
  // is the one already in the document. `formatNumber(0.30001)` is `'0.3'` —
  // running the untouched bound through it would reintroduce exactly the
  // rounding (1) exists to keep out.
  const call = `.range(${String(lo)},${String(hi)})`
  const span = a.spans.range
  if (span) return { range: [span.start, span.end], text: call }

  // See (3): nothing to replace, so append the call to the whole expression.
  const at = a.spans.chainEnd
  if (at === null) return null
  return { range: [at, at], text: call }
}

/** The editor's `shapeAlternatives`, injected so this module stays type-only on
 *  `@stave/editor` (the app's tests hand it in from source). */
export type ShapeAlternatives = (kind: SignalKind) => readonly SignalKind[]

/**
 * #1464 — the shapes the caption's name opens a menu of: the editor's same-class
 * alternatives, or none when the document spells no shape to replace. An empty list
 * means no menu opens, and a press on the name reaches what it always reached.
 */
export function shapeOptions(a: SignalAutomation, alternatives: ShapeAlternatives): readonly SignalKind[] {
  return a.spans.shape === null ? [] : alternatives(a.kind)
}

/**
 * #1464 — "switch this curve to `next`" as an edit, or nothing. It replaces the
 * signal's identifier and no other byte, so the range and the rate stay as written.
 *
 * ⚠ THE CLASS RULE IS ENFORCED HERE, not left to the menu that calls this. A shape the
 * editor does not offer for `a.kind` writes nothing: across polarity it moves the
 * bounds the caption shows, across periodicity the song's length (`shapeAlternatives`).
 *
 * ⚠ AND A DOCUMENT THAT MOVED WRITES NOTHING. The menu captures its automation when it
 * opens; if the bytes at the span no longer spell that shape, the offsets belong to
 * another document and replacing them would corrupt it.
 */
export function shapeEdit(
  a: SignalAutomation,
  next: string,
  source: string,
  alternatives: ShapeAlternatives,
): OffsetEdit | null {
  const span = a.spans.shape
  if (span === null) return null
  if (!alternatives(a.kind).some((k) => k === next)) return null
  if (source.slice(span.start, span.end) !== a.kind) return null
  return { range: [span.start, span.end], text: next }
}

/** The most significant digits a written rate may carry — `0.25` and `1.5` pass,
 *  `0.6666666666666666` (2 bars under a whole-track `.slow(3)`) does not. */
const RATE_DIGITS = 6

/**
 * #1464 Stage 3 — "the user typed `nextText` bars into the rate field" as an edit, or
 * nothing. The same three rules as the bounds, for the same reasons: nothing typed
 * is not zero, an unchanged number writes nothing, and an unspelled rate inserts.
 *
 * The typed number is the period ON THE LANE; what is written is the signal's own,
 * with the route's whole-track time changes divided back out. A speed-up by a whole
 * number is written `.fast(n)` and anything else `.slow(P)` — the engine plays
 * `.fast(2)` and `.slow(0.5)` identically (probe), and each is what a person writes.
 *
 * ⚠ IT WRITES ONLY WHAT READS BACK AS TYPED. A number that needs more than
 * `RATE_DIGITS` significant digits, or whose period times the route's scale is not
 * exactly the typed bars, writes nothing: a rate the document cannot spell exactly is
 * a rate the lane would show differently the moment it re-reads.
 */
function rateEdit(a: SignalAutomation, nextText: string): OffsetEdit | null {
  const shown = a.lanePeriodCycles
  if (shown === null || !rateEditable(a)) return null
  const raw = nextText.trim()
  if (raw.length === 0) return null
  const bars = Number(raw)
  if (!Number.isFinite(bars) || bars <= 0 || bars === shown) return null

  // What the route's time changes multiply the signal's own period by.
  const scale = shown / a.periodCycles
  const own = bars / scale
  const speedUp = own < 1 && Number.isInteger(1 / own)
  const n = speedUp ? 1 / own : own
  if (Number(n.toPrecision(RATE_DIGITS)) !== n) return null
  if ((speedUp ? 1 / n : n) * scale !== bars) return null
  const call = speedUp ? `.fast(${String(n)})` : `.slow(${String(n)})`

  const span = a.spans.rate
  if (span) return { range: [span.start, span.end], text: call }
  const at = a.spans.chainEnd
  if (at === null) return null
  return { range: [at, at], text: call }
}

