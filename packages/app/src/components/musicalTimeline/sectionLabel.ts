/**
 * A section's display NAME, read from the user's own source (#1391).
 *
 * The sibling of `trackLabel.ts`, one level down: that module resolves a
 * TRACK's name from the labelled statement at its `dollarPos`; this one
 * resolves a SECTION's name from the arrange arm's source range. Same division
 * of labour, deliberately — the walk carries an offset out of the IR, and the
 * layer that holds the user's code turns it into a name. Kept in its own file so
 * `trackLabel.ts` keeps meaning what it says.
 *
 * ── THE NAME IS ALREADY THERE ────────────────────────────────────────────────
 * Nothing new is asked of the musician. `ArrangeArm.loc` is the `[n, pat]` TUPLE
 * range — it exists so write-back can edit the weight `n` — and those same bytes
 * carry whatever the arm was written as. Measured on a real document:
 *
 *   arm 0  weight=4  source="[4, intro]"
 *   arm 1  weight=8  source="[8, verse]"
 *   arm 2  weight=4  source="[4, outro]"
 *
 * So `intro` / `verse` / `outro` are recoverable without a `name:` field, a new
 * combinator, or any new syntax. The name is the one the musician already wrote.
 *
 * ── WHY IT ONLY EVER ACCEPTS A BARE IDENTIFIER ───────────────────────────────
 * An arm can be any expression. `arrange([4, s("bd*4").gain(0.8)], …)` has no
 * name in it, and the honest answer there is a positional fallback rather than a
 * caption derived from the music — a clip labelled `bd` is what this issue was
 * opened about. So the rule is narrow on purpose: a bare identifier is a name,
 * and everything else is unnamed.
 *
 * ⚠ NOT A PARSER, AND IT MUST NOT BECOME ONE. This reads a range the IR already
 * located; it does not go looking for arrangements in text. Widening it to
 * understand expressions would make it a second oracle for a grammar
 * `parseStrudel` already owns — the trap that shipped a whole class of bugs
 * elsewhere in this codebase.
 */

/**
 * The name of an arm that has none: an ORDINAL, never a guess at the music.
 *
 * Shared by the collector (which knows `armIndex` but holds no source) and the
 * resolver below (which has both), so the two cannot drift into disagreeing
 * about what an unnamed section is called.
 */
export function positionalSectionName(armIndex: number): string {
  return `§${armIndex + 1}`
}

/** A bare JS identifier, and nothing else. */
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

/**
 * The section name written at `range`, or `null` when the arm is an inline
 * expression with no name to read.
 *
 * Handles both arm shapes the IR produces:
 *  - `arrange` arms, whose range is the `[n, pattern]` tuple
 *  - `cat` / `slowcat` arms, whose range is the pattern expression alone
 */
export function sectionNameAtRange(
  code: string,
  range: readonly [number, number],
): string | null {
  const [start, end] = range
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start < 0 || end > code.length || end <= start) return null

  let text = code.slice(start, end).trim()

  // An `arrange` arm is `[n, pattern]`. Reduce it to its pattern half; a
  // `cat`/`slowcat` arm is already just the pattern and falls straight through.
  if (text.startsWith('[') && text.endsWith(']')) {
    const comma = text.indexOf(',')
    if (comma < 0) return null
    text = text.slice(comma + 1, -1).trim()
  }

  return IDENTIFIER.test(text) ? text : null
}

/**
 * A clip's display name: the identifier its arm was bound to, else a positional
 * `§{n}`.
 *
 * ⚠ THE CLIP'S IDENTITY STAYS `armIndex`, exactly as a lane's identity stays
 * `laneKey` while only its `displayName` resolves to the source label. Renaming
 * a section must not make it a different clip.
 *
 * The fallback is an ORDINAL, never a guess at the music — `§2` says "the second
 * section, which has no name", which is true and useful. Naming it after the
 * first sample that happens to fire in it is precisely the behaviour #1391 was
 * filed to remove.
 */
export function resolveSectionName(
  armIndex: number,
  nameRange: readonly [number, number] | null | undefined,
  code: string | null | undefined,
): string {
  const positional = positionalSectionName(armIndex)
  if (code == null || nameRange == null) return positional
  return sectionNameAtRange(code, nameRange) ?? positional
}
