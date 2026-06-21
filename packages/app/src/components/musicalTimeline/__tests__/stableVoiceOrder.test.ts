/**
 * stableVoiceOrder (#480) — per-lane voice sub-rows keep their first-seen slot
 * across re-evals, so reordering CLIPS in time doesn't reshuffle the instrument
 * TRACKS. Mirrors stableTrackOrder one level down.
 */
import { describe, it, expect } from 'vitest'
import type { SongAnalysis } from '@stave/editor'
import { buildTimelineScene, type SceneNote, type CollectedMarks } from '../timelineScene'
import { applyStableVoiceOrder, EMPTY_VOICE_ORDER } from '../stableVoiceOrder'

const analysis: SongAnalysis = {
  periodCycles: 8,
  horizonCycles: 8,
  reachedCap: false,
  lanes: [{ laneKey: 'drums', onsetsByCycle: [1, 1, 1, 1, 1, 1, 1, 1] }],
  sections: [],
}

function marks(drums: SceneNote[]): CollectedMarks {
  return {
    marksByLane: new Map([['drums', drums]]),
    sourceByLane: new Map(),
    arrangeByLane: new Map(),
    clipsByLane: new Map(),
    capped: false,
  }
}

const note = (cycle: number, voice: string): SceneNote => ({
  cycle,
  end: cycle + 0.5,
  pitch: null,
  gain: 1,
  voice,
})

// The #480 repro: `arrange([2, s('bd*4')], [2, s('hh*8')], …)`. bd's first mark
// is at cycle 0, hh's at cycle 2 → groupVoices yields [bd, hh].
const beforeSwap = marks([note(0, 'bd'), note(2, 'hh'), note(4, 'sn')])
// After swapping the first two arms: hh now leads (cycle 0), bd at 2. groupVoices
// alone would yield [hh, bd, sn] — the reshuffle this fix prevents.
const afterSwap = marks([note(0, 'hh'), note(2, 'bd'), note(4, 'sn')])

const voiceKeys = (scene: ReturnType<typeof buildTimelineScene>) =>
  scene.lanes[0].voices.map((v) => v.key)

describe('applyStableVoiceOrder (#480)', () => {
  it('groupVoices reshuffles on clip swap — the bug being fixed', () => {
    // Establishes the precondition: without the stable pass, the raw scene's
    // voice order DOES flip when clips are reordered.
    expect(voiceKeys(buildTimelineScene(analysis, beforeSwap))).toEqual(['bd', 'hh', 'sn'])
    expect(voiceKeys(buildTimelineScene(analysis, afterSwap))).toEqual(['hh', 'bd', 'sn'])
  })

  it('pins voice order across a clip swap (drag or code-edit)', () => {
    const first = applyStableVoiceOrder(buildTimelineScene(analysis, beforeSwap), EMPTY_VOICE_ORDER)
    expect(voiceKeys(first.scene)).toEqual(['bd', 'hh', 'sn'])

    // Re-eval after the swap, threading the pinned order back.
    const second = applyStableVoiceOrder(buildTimelineScene(analysis, afterSwap), first.order)
    expect(voiceKeys(second.scene)).toEqual(['bd', 'hh', 'sn']) // UNCHANGED rows
  })

  it('reflects the swapped CONTENT while holding the row order', () => {
    const first = applyStableVoiceOrder(buildTimelineScene(analysis, beforeSwap), EMPTY_VOICE_ORDER)
    const second = applyStableVoiceOrder(buildTimelineScene(analysis, afterSwap), first.order)
    const bd = second.scene.lanes[0].voices.find((v) => v.key === 'bd')!
    const hh = second.scene.lanes[0].voices.find((v) => v.key === 'hh')!
    // Rows held, but the marks moved: after the swap hh leads in time, bd follows.
    const lane = second.scene.lanes[0]
    expect(lane.notes.find((n) => n.voice === 'hh')!.cycle).toBe(0)
    expect(lane.notes.find((n) => n.voice === 'bd')!.cycle).toBe(2)
    expect(bd.key).toBe('bd')
    expect(hh.key).toBe('hh')
  })

  it('appends a genuinely new voice at the end (not alphabetical)', () => {
    const first = applyStableVoiceOrder(buildTimelineScene(analysis, beforeSwap), EMPTY_VOICE_ORDER)
    // Add 'cp' (alphabetically before sn/hh) — it must land LAST, not sorted in.
    const withNew = marks([note(0, 'bd'), note(1, 'cp'), note(2, 'hh'), note(4, 'sn')])
    const second = applyStableVoiceOrder(buildTimelineScene(analysis, withNew), first.order)
    expect(voiceKeys(second.scene)).toEqual(['bd', 'hh', 'sn', 'cp'])
  })

  it('keeps a vanished voice reserved so re-adding returns it to its slot', () => {
    const first = applyStableVoiceOrder(buildTimelineScene(analysis, beforeSwap), EMPTY_VOICE_ORDER)
    // hh disappears this eval.
    const without = marks([note(0, 'bd'), note(4, 'sn')])
    const second = applyStableVoiceOrder(buildTimelineScene(analysis, without), first.order)
    expect(voiceKeys(second.scene)).toEqual(['bd', 'sn'])
    // hh comes back — it returns to its original slot (between bd and sn), not the end.
    const third = applyStableVoiceOrder(buildTimelineScene(analysis, beforeSwap), second.order)
    expect(voiceKeys(third.scene)).toEqual(['bd', 'hh', 'sn'])
  })

  it('returns the same scene identity on a no-op re-eval (no churn)', () => {
    const built = buildTimelineScene(analysis, beforeSwap)
    const first = applyStableVoiceOrder(built, EMPTY_VOICE_ORDER)
    // Stable already → identity preserved so downstream useMemos don't recompute.
    const again = applyStableVoiceOrder(first.scene, first.order)
    expect(again.scene).toBe(first.scene)
  })

  it('leaves single-voice lanes untouched', () => {
    const single = marks([note(0, 'bd'), note(1, 'bd')])
    const built = buildTimelineScene(analysis, single)
    const out = applyStableVoiceOrder(built, EMPTY_VOICE_ORDER)
    expect(out.scene).toBe(built) // no reorder, same identity
    expect(voiceKeys(out.scene)).toEqual(['bd'])
  })
})
