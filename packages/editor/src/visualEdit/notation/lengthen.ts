/**
 * lengthen — make a pattern longer by whole bars (#1824).
 *
 * Two rewrites of a grid's mini-notation, both spelled as a top-level `<…>`, one
 * entry per bar — the spelling 345 of the corpus's 591 multi-cycle pitched calls
 * already use, and the one both grids draw one bar per entry:
 *
 *   repeatBars(mini, bars)          X → <[X] [X]>,  <a b> → <a b a b>
 *   appendEmptyBars(mini, bars, n)  X → <[X] ~>,    <a b> → <a b ~>
 *
 * The first is Logic's Step Sequencer ("the added steps duplicate the existing
 * pattern"); the second is Logic's region resize ("lengthen a MIDI region to add
 * silence"). Whole bars only: a length that is not a whole number of cycles is a
 * polymeter against every other track, and neither grid can draw it.
 *
 * ⚠ THE ANSWER COMES FROM STRUDEL, NOT FROM THE SPELLING. Wrapping a pattern in
 * `<…>` gives each entry its own cycle count, so anything inside that changes from
 * cycle to cycle — a nested `<e3 g3>`, a `?`, a `/2` — plays differently after the
 * rewrite (`c3 <e3 g3>` repeated this way plays e3 e3 g3 g3, not e3 g3 e3 g3). No
 * syntax test is asked to predict that. Both rewrites are checked by querying the
 * old and new patterns and comparing them bar by bar; a rewrite that does not play
 * exactly the intended bars is refused.
 */
import { mini as reifyMini } from '@strudel/mini/mini.mjs'

export type LengthenResult = { ok: true; mini: string } | { ok: false; reason: string }

/** inner text when the trimmed string is exactly one `<…>` alternation */
function unwrapAlternation(mini: string): string | null {
  const t = mini.trim()
  if (t.length < 2 || !t.startsWith('<') || !t.endsWith('>')) return null
  // `<a> <b>` is two alternations: the first `<` must close only at the final `>`.
  let depth = 0
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '<') depth++
    else if (t[i] === '>' && --depth === 0 && i !== t.length - 1) return null
  }
  return t.slice(1, -1)
}

/** the pattern's bars as `<…>` entries: an alternation's own, else the whole pattern as one */
function entriesOf(mini: string): string {
  const alt = unwrapAlternation(mini)
  return alt !== null ? alt.trim() : `[${mini.trim()}]`
}

type Hap = {
  hasOnset?: () => boolean
  whole?: { begin: { valueOf(): number }; end: { valueOf(): number } }
  value: unknown
}

/**
 * What one bar plays, as a comparable key: each onset's value, start and end
 * measured from the bar's own downbeat. Null when Strudel cannot query it.
 */
function barKey(pat: unknown, bar: number): string | null {
  let haps: Hap[]
  try {
    haps = (pat as { queryArc(a: number, b: number): Hap[] }).queryArc(bar, bar + 1)
  } catch {
    return null
  }
  return haps
    .filter((h) => (h.hasOnset?.() ?? false) && h.whole)
    .map((h) => `${JSON.stringify(h.value)}|${+h.whole!.begin.valueOf() - bar}|${+h.whole!.end.valueOf() - bar}`)
    .sort()
    .join(' ')
}

function reify(mini: string): unknown | null {
  try {
    return reifyMini(mini)
  } catch {
    return null
  }
}

const CHANGES_PER_CYCLE =
  'this pattern plays differently from one cycle to the next, and repeating it as bars would change what it plays'

/**
 * The haps check both rewrites share. `expect(bar)` names, for each bar of the new
 * pattern, the OLD bar it must play — or null for a bar that must be silent.
 *
 * The old pattern is first held to its own claimed length: every bar in two
 * periods must repeat the bar one period earlier. A pattern that does not repeat
 * every `bars` cycles is one the grid is not showing whole, and no rewrite of it
 * can be checked against what is on screen.
 */
function playsAsIntended(
  oldMini: string,
  newMini: string,
  bars: number,
  newBars: number,
  expect: (bar: number) => number | null,
): string | null {
  const before = reify(oldMini)
  const after = reify(newMini)
  if (before === null || after === null) return "Strudel can't read the result"
  const old: string[] = []
  for (let b = 0; b < bars; b++) {
    const k = barKey(before, b)
    if (k === null || barKey(before, b + bars) !== k) return CHANGES_PER_CYCLE
    old.push(k)
  }
  // Two full periods of the new pattern, so a bar that plays right once but not on
  // the repeat is caught too.
  for (let b = 0; b < 2 * newBars; b++) {
    const want = expect(b % newBars)
    const got = barKey(after, b)
    if (got === null) return "Strudel can't read the result"
    if (got !== (want === null ? '' : old[want])) return CHANGES_PER_CYCLE
  }
  return null
}

/**
 * Repeat the whole pattern once: `bars` → `2 × bars`, sounding exactly as before
 * until the new bars are edited. `bars` is how many cycles the grid draws the
 * pattern over (the roll's `bars`, 1 for a plain sequence).
 */
export function repeatBars(mini: string, bars: number): LengthenResult {
  const entries = entriesOf(mini)
  const next = `<${entries} ${entries}>`
  const why = playsAsIntended(mini, next, bars, 2 * bars, (b) => b % bars)
  return why === null ? { ok: true, mini: next } : { ok: false, reason: why }
}

/**
 * Append `add` silent bars after the pattern's `bars`: it plays as before, then
 * rests for `add` cycles, then starts again.
 */
export function appendEmptyBars(mini: string, bars: number, add: number): LengthenResult {
  if (!Number.isInteger(add) || add < 1) return { ok: false, reason: 'nothing to add' }
  const next = `<${entriesOf(mini)}${' ~'.repeat(add)}>`
  const why = playsAsIntended(mini, next, bars, bars + add, (b) => (b < bars ? b : null))
  return why === null ? { ok: true, mini: next } : { ok: false, reason: why }
}
