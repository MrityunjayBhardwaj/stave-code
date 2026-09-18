// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as strudelCore from '@strudel/core'
import { planStems, tagTrack, trackTagsOf, SONG_LEVEL_STEM } from './stemSplit'

/**
 * #1648 — the split, on real `@strudel/core` patterns built the way the repl
 * builds what it plays: tracks tagged at registration, stacked, then the
 * `all(...)` transforms (`repl.mjs:238-265`). What each stem SOUNDS like is
 * measured in the browser (`bounce-stems.spec.ts`).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

/** `@strudel/core` ships no types for its pattern functions. */
const core: Any = strudelCore

/** A sound pattern with one event per name, evenly over a cycle. */
const seq = (...names: string[]): Any => core.s(core.fastcat(...names))

const onsets = (pat: Any, cycles = 1): Any[] => pat.queryArc(0, cycles).filter((h: Any) => h.hasOnset())
const sounds = (pat: Any, cycles = 1): string[] => onsets(pat, cycles).map((h: Any) => `${h.value.s}@${h.whole.begin.valueOf()}`).sort()

/** The repl's order: tag each registered track, stack, then each transform. */
function played(tracks: Record<string, Any>, ...transforms: Array<(p: Any) => Any>): Any {
  let pat = core.stack(...Object.entries(tracks).map(([id, p]) => tagTrack(p, id)))
  for (const t of transforms) pat = t(pat)
  return pat
}

describe('stemSplit (#1648)', () => {
  it('each stem is its own track, and a song-level transform stays applied to it', () => {
    const drums = seq('bd', 'sd')
    const hats = seq('hh', 'hh', 'hh', 'hh')
    const pat = played({ drums, hats }, (x) => x.gain(0.5))
    const stems = planStems(pat, ['drums', 'hats'], true, 1)
    expect(stems.map((s) => s.id)).toEqual(['drums', 'hats'])
    expect(sounds(stems[0].pattern)).toEqual(['bd@0', 'sd@0.5'])
    expect(sounds(stems[1].pattern)).toEqual(['hh@0', 'hh@0.25', 'hh@0.5', 'hh@0.75'])
    // The transform ran on the played pattern, so the stem carries it.
    expect(onsets(stems[0].pattern).map((h: Any) => h.value.gain)).toEqual([0.5, 0.5])
  })

  it('the stems together are exactly what plays', () => {
    const pat = played({ a: seq('bd', 'bd', 'bd'), b: seq('c', 'e', 'g') }, (x) => x.fast(2))
    const stems = planStems(pat, ['a', 'b'], true, 2)
    const joined = stems.flatMap((s) => sounds(s.pattern, 2)).sort()
    expect(joined).toEqual(sounds(pat, 2))
  })

  it('sound a transform adds that no track owns becomes the song-level stem', () => {
    const pat = played({ a: seq('bd', 'bd') }, (x) => x.stack(seq('cp')))
    const stems = planStems(pat, ['a'], true, 1)
    expect(stems.map((s) => s.id)).toEqual(['a', SONG_LEVEL_STEM])
    expect(sounds(stems[1].pattern)).toEqual(['cp@0'])
  })

  it('no song-level stem when every onset has a track', () => {
    const pat = played({ a: seq('bd', 'bd'), b: seq('hh') })
    expect(planStems(pat, ['a', 'b'], true, 4).map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('a bare document (nothing tagged) is one stem: the whole pattern', () => {
    const pat = seq('bd', 'sd')
    const stems = planStems(pat, ['$0'], false, 1)
    expect(stems).toHaveLength(1)
    expect(stems[0].id).toBe('$0')
    expect(sounds(stems[0].pattern)).toEqual(['bd@0', 'sd@0.5'])
  })

  it("a document's own tags live beside the track tag", () => {
    const pat = played({ a: seq('bd').tag('mine') })
    const [h] = onsets(pat)
    expect(h.hasTag('mine')).toBe(true)
    expect(trackTagsOf(h)).toEqual(['a'])
  })

  it('a track that plays nothing in the span is still planned (it renders silent)', () => {
    const pat = played({ a: seq('bd'), rest: core.silence })
    expect(planStems(pat, ['a', 'rest'], true, 1).map((s) => s.id)).toEqual(['a', 'rest'])
  })
})
