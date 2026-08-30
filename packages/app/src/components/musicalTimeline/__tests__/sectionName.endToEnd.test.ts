/**
 * A section's name survives the WHOLE path — walk → marks → scene (#1391).
 *
 * ── WHY THIS EXISTS ALONGSIDE `sectionLabel.test.ts` ─────────────────────────
 * That file proves the resolver reads a name out of a range. It cannot prove
 * that a range ever ARRIVES: the arm's `loc` has to be picked up by
 * `structuralWalk`, carried on the lane skeleton, run-length-encoded onto a clip
 * by `timelineMarks`, and resolved against the user's code by
 * `buildTimelineScene`. Any one of those four links can be missing while every
 * resolver arm stays green, and the symptom is the original complaint unchanged
 * — clips captioned `bd`.
 *
 * So this drives the REAL staged pipeline over REAL source, the same route
 * `collectNoteMarks.stackArms.test.ts` takes, and asserts on the far end.
 *
 * Only the haps are synthetic. Their offsets are real ones from the document.
 */
import { describe, it, expect, vi } from 'vitest'

// Same barrel mock as the stack-arms harness next door: no IR events, so lane
// structure comes from the REAL `structuralWalk` over the REAL IR rather than
// from collect's events. That is the path that has to carry `armRanges`.
vi.mock('@stave/editor', async () => ({
  collectCycles: () => [],
  structuralWalk: (await import('./structuralWalkTestStub')).structuralWalk,
  wholeWalkWindow: (await import('./structuralWalkTestStub')).wholeWalkWindow,
  laneKeyOf: (ev: { trackId?: string; s?: string }) => ev?.trackId ?? ev?.s ?? '$default',
}))

import { collectNoteMarks } from '../timelineMarks'
import { buildTimelineScene } from '../timelineScene'
import { wholeSongWindow } from '../songAxis'
import { IR, type PatternIR } from '../../../../../editor/src/ir/PatternIR'
import {
  runRawStage,
  runMiniExpandedStage,
  runChainAppliedStage,
  runFinalStage,
} from '../../../../../editor/src/ir/parseStrudelStages'
import { runPasses, type Pass } from '../../../../../editor/src/ir/passes'

const PASSES: readonly Pass<PatternIR>[] = [
  { name: 'RAW', run: runRawStage },
  { name: 'MINI-EXPANDED', run: runMiniExpandedStage },
  { name: 'CHAIN-APPLIED', run: runChainAppliedStage },
  { name: 'Parsed', run: runFinalStage },
]
const pipeline = (code: string): PatternIR => {
  const passes = runPasses(IR.code(code), PASSES)
  return passes[passes.length - 1].ir
}

// ⚠ NO `$:` PREFIX, and that is not incidental. Measured: with `$:` in front,
// BOTH `parseStrudel` and the staged pipeline leave the arms as opaque `Code`,
// so the arrangement produces no leaves, no `armIndex` items, and therefore no
// clips at all — there is nothing to name. That is a real gap and it is filed
// separately; naming cannot be tested through a path that yields no clips.
const SONG = `const intro = s("bd")
const verse = s("hh")
arrange([4, intro], [8, verse])`

/**
 * A minimal activity carrying just the lane the clips hang off.
 *
 * The scene builds its rows from the ANALYSIS, not from the marks, so without a
 * lane here there is nothing for a clip to attach to and the scene comes back
 * empty. Onsets are all zero: this arm is about NAMES, and a clip is drawn (and
 * captioned) whether or not anything sounds in it.
 */
const activityFor = (laneKey: string, cycles: number) =>
  ({
    lanes: [{ laneKey, onsetsByCycle: new Array(cycles).fill(0) }],
    sections: [],
  }) as unknown as Parameters<typeof buildTimelineScene>[0]

/** Every section name the scene ends up drawing, in clip order. */
function sectionNames(code: string, cycles: number): string[] {
  const marks = collectNoteMarks(
    [] as unknown as Parameters<typeof collectNoteMarks>[0],
    pipeline(code),
    wholeSongWindow(cycles),
  )
  // (activity, songWindow, period, carriedPeakDensity, marks, code)
  const scene = buildTimelineScene(
    activityFor('d1', cycles),
    wholeSongWindow(cycles),
    null,
    null,
    marks,
    code,
  )
  return scene.lanes.flatMap((l) => l.clips.map((c) => c.sectionName))
}

describe('#1391 — the section name reaches the scene', () => {
  it('names the arms of an arranged document from the source', () => {
    // The whole point: `intro` and `verse` are the identifiers the musician
    // wrote, recovered without any new syntax.
    expect(sectionNames(SONG, 12)).toEqual(['intro', 'verse'])
  })

  it('the arm RANGES arrive on the clips — the link that had to be built', () => {
    // Asserted separately from the names so a failure says WHICH link broke: a
    // missing range is `structuralWalk`/`timelineMarks`, a wrong name with a
    // present range is the resolver.
    const marks = collectNoteMarks(
      [] as unknown as Parameters<typeof collectNoteMarks>[0],
      pipeline(SONG),
      wholeSongWindow(12),
    )
    const clips = [...marks.clipsByLane.values()].flat()
    expect(clips.length).toBeGreaterThan(0)
    for (const c of clips) {
      expect(c.nameRange, `arm ${c.armIndex} carried no source range`).not.toBeNull()
      expect(SONG.slice(...c.nameRange!)).toMatch(/^\[\s*\d+\s*,/)
    }
  })

  it('falls back to an ordinal for inline arms, in the same document', () => {
    const mixed = `const verse = s("hh")
arrange([4, s("bd")], [8, verse])`
    expect(sectionNames(mixed, 12)).toEqual(['§1', 'verse'])
  })

  it('a bare track gets no section name — it is not an arrangement', () => {
    // The implicit whole-song clip. A caption here would invent a section the
    // document does not have.
    expect(sectionNames('s("bd*4")', 4)).toEqual([''])
  })

  it('without the code, every arm keeps its ordinal rather than guessing', () => {
    const marks = collectNoteMarks(
      [] as unknown as Parameters<typeof collectNoteMarks>[0],
      pipeline(SONG),
      wholeSongWindow(12),
    )
    const scene = buildTimelineScene(activityFor('d1', 12), wholeSongWindow(12), null, null, marks, null)
    expect(scene.lanes.flatMap((l) => l.clips.map((c) => c.sectionName))).toEqual([
      '§1',
      '§2',
    ])
  })
})
