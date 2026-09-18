/**
 * #1648 — split the pattern the repl PLAYS into one pattern per track.
 *
 * ⚠ WHY A TAG, AND NOT THE PER-TRACK CAPTURES. The engine already keeps each
 * track's pattern (`songPatterns`, `trackSchedulers`), but they are taken in the
 * `.p` hook, before Strudel stacks the tracks, picks the soloed ones and applies
 * `all(...)`/`each(...)` (`@strudel/core/repl.mjs:238-265`). Rendering those
 * would drop every song-level change: with `all(x => x.gain(.5))` the stacked
 * captures came out 42% off the master. So the hook TAGS what it registers, and
 * a stem is the played pattern filtered to one tag.
 *
 * A tag survives the stacking and the transforms because Strudel merges hap
 * contexts key by key (`hap.mjs:155-158`), keeping a side's `tags` unless the
 * other side carries its own. Measured over 558 corpus documents (124,537
 * onsets): tagging changed no hap, no hap carried two track tags, and 12 carried
 * none — every one added by an `all(x => … .stack(…))`, a sound no track owns.
 * Those become the song-level stem, so the stems still add up to the master.
 *
 * Built on Strudel's own `.tag()` (`pattern.mjs:2701`), so a document's own tags
 * and `hasTag` filters keep working beside it.
 */

/** Prefix of the track tag. Deliberately unlikely in a user's own `.tag(...)`. */
export const STEM_TAG_PREFIX = 'stave-track:'

/** The stem id for sound no track owns. Not a valid `.p` capture id. */
export const SONG_LEVEL_STEM = '(song)'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPattern = any

/** Tag `pattern`'s haps as belonging to track `id`. Untaggable patterns pass through. */
export function tagTrack(pattern: AnyPattern, id: string): AnyPattern {
  return typeof pattern?.tag === 'function' ? pattern.tag(STEM_TAG_PREFIX + id) : pattern
}

/** The track ids a hap was tagged with. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function trackTagsOf(hap: any): string[] {
  const tags: unknown = hap?.context?.tags
  if (!Array.isArray(tags)) return []
  const out: string[] = []
  for (const t of tags) if (typeof t === 'string' && t.startsWith(STEM_TAG_PREFIX)) out.push(t.slice(STEM_TAG_PREFIX.length))
  return out
}

export interface PlannedStem {
  id: string
  pattern: AnyPattern
}

/**
 * One pattern per track, in `trackIds` order, plus the song-level stem when some
 * onset in the first `cycles` cycles belongs to no track.
 *
 * `tagged` is false for a bare document (no `.p`, so nothing was tagged): the
 * whole pattern is its one track.
 */
export function planStems(
  played: AnyPattern,
  trackIds: readonly string[],
  tagged: boolean,
  cycles: number,
): PlannedStem[] {
  if (!tagged) return trackIds.length > 0 ? [{ id: trackIds[0], pattern: played }] : []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stems: PlannedStem[] = trackIds.map((id) => ({ id, pattern: played.filterHaps((h: any) => trackTagsOf(h).includes(id)) }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unowned = played.filterHaps((h: any) => trackTagsOf(h).length === 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasUnowned = cycles > 0 && unowned.queryArc(0, cycles).some((h: any) => (typeof h.hasOnset === 'function' ? h.hasOnset() : true))
  if (hasUnowned) stems.push({ id: SONG_LEVEL_STEM, pattern: unowned })
  return stems
}
