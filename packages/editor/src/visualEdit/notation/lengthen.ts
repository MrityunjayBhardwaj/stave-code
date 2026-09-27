/**
 * lengthen — make a pattern longer by whole bars (#1824).
 *
 * Two rewrites of a grid's mini-notation, both spelled as a top-level `<…>`, one
 * entry per bar — the spelling 345 of the corpus's 591 multi-cycle pitched calls
 * already use, and the one both grids draw one bar per entry:
 *
 *   duplicateBar(mini, bars)        X → <[X] [X]>,  <a b> → <a b a>,  <a b a> → <a b a b>
 *   appendEmptyBars(mini, bars, n)  X → <[X] ~>,    <a b> → <a b ~>
 *
 * The first is Logic's Step Sequencer ("When you increase the pattern length, the
 * added steps duplicate the existing pattern"), one bar per click: the new bar is
 * the one that continues the pattern's shortest repeating run of bars. The second
 * is Logic's region resize ("lengthen a MIDI region to add silence"). Whole bars
 * only: a length that is not a whole number of cycles is a polymeter against every
 * other track, and neither grid can draw it.
 *
 * ⚠ THE ANSWER COMES FROM STRUDEL, NOT FROM THE SPELLING. Wrapping a pattern in
 * `<…>` gives each entry its own cycle count, so anything inside that changes from
 * cycle to cycle — a nested `<e3 g3>`, a `?`, a `/2` — plays differently after the
 * rewrite (`c3 <e3 g3>` repeated this way plays e3 e3 g3 g3, not e3 g3 e3 g3). No
 * syntax test is asked to predict that. Both rewrites are checked by querying the
 * old and new patterns and comparing them bar by bar; a rewrite that does not play
 * exactly the intended bars is refused. The same bar-by-bar reading is what says
 * which bar continues the pattern.
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

/**
 * The `<…>` entries one by one, or null when the text is not a plain list of them
 * (a top-level `,` `|` `.`, or a lone `!` `_` that belongs to its neighbour).
 * Whether each entry really is one bar is left to the haps check.
 */
function splitEntries(inner: string): string[] | null {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of inner) {
    if ('[<{('.includes(ch)) depth++
    else if (']>})'.includes(ch)) depth--
    if (depth === 0 && ',|'.includes(ch)) return null
    if (depth === 0 && /\s/.test(ch)) {
      if (cur) out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur) out.push(cur)
  return out.some((e) => e === '.' || e === '!' || e === '_') ? null : out
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
 * What each of the old pattern's `bars` plays, held first to its own claimed
 * length: every bar in two periods must repeat the bar one period earlier. A
 * pattern that does not repeat every `bars` cycles is one the grid is not showing
 * whole, and no rewrite of it can be checked against what is on screen.
 */
function oldBars(oldMini: string, bars: number): string[] | { reason: string } {
  const before = reify(oldMini)
  if (before === null) return { reason: "Strudel can't read the pattern" }
  const old: string[] = []
  for (let b = 0; b < bars; b++) {
    const k = barKey(before, b)
    if (k === null || barKey(before, b + bars) !== k) return { reason: CHANGES_PER_CYCLE }
    old.push(k)
  }
  return old
}

/**
 * The haps check both rewrites share. `expect(bar)` names, for each bar of the new
 * pattern, the OLD bar it must play — or null for a bar that must be silent.
 */
function playsAsIntended(
  old: string[],
  newMini: string,
  newBars: number,
  expect: (bar: number) => number | null,
): string | null {
  const after = reify(newMini)
  if (after === null) return "Strudel can't read the result"
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

/** the shortest run of bars the pattern repeats: `a b a` → 2, `a a` → 1, `a b c` → 3 */
function shortestRun(old: string[]): number {
  for (let p = 1; p < old.length; p++) {
    if (old.every((k, i) => i < p || k === old[i - p])) return p
  }
  return old.length
}

const WHICH_BAR = "its text can't be split into one entry per bar"

/**
 * Add one bar that continues the pattern: `bars` → `bars + 1`, the new bar a copy of
 * the one the pattern's shortest repeating run would play next. A one-bar pattern
 * sounds exactly as before until the copy is edited; `<a b>` becomes `<a b a>`, and
 * a second click `<a b a b>`. `bars` is how many cycles the grid draws the pattern
 * over (the roll's `bars`, 1 for a plain sequence).
 */
export function duplicateBar(mini: string, bars: number): LengthenResult {
  const old = oldBars(mini, bars)
  if (!Array.isArray(old)) return { ok: false, reason: old.reason }
  const inner = unwrapAlternation(mini)
  // One text drawn over several bars changes from cycle to cycle by itself
  // (`c3 <e3 g3>`); no single bar of it can be written down as a copy.
  if (inner === null && bars !== 1) return { ok: false, reason: CHANGES_PER_CYCLE }
  const entries = inner !== null ? splitEntries(inner) : [`[${mini.trim()}]`]
  if (entries === null || entries.length !== bars) return { ok: false, reason: WHICH_BAR }
  const source = bars % shortestRun(old)
  const next = `<${entriesOf(mini)} ${entries[source]}>`
  const why = playsAsIntended(old, next, bars + 1, (b) => (b < bars ? b : source))
  return why === null ? { ok: true, mini: next } : { ok: false, reason: why }
}

/**
 * Append `add` silent bars after the pattern's `bars`: it plays as before, then
 * rests for `add` cycles, then starts again.
 */
export function appendEmptyBars(mini: string, bars: number, add: number): LengthenResult {
  if (!Number.isInteger(add) || add < 1) return { ok: false, reason: 'nothing to add' }
  const old = oldBars(mini, bars)
  if (!Array.isArray(old)) return { ok: false, reason: old.reason }
  const next = `<${entriesOf(mini)}${' ~'.repeat(add)}>`
  const why = playsAsIntended(old, next, bars + add, (b) => (b < bars ? b : null))
  return why === null ? { ok: true, mini: next } : { ok: false, reason: why }
}
