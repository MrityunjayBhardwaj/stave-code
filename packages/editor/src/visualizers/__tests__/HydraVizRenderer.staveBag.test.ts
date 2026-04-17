/**
 * HydraVizRenderer — `stave` bag wiring (issue #32).
 *
 * The sketch function receives a second argument whose fields forward
 * `components.queryable.scheduler` and `.trackSchedulers`. Sketches
 * that capture `stave` in a closure observe live refs — `update()`
 * mutates the same bag in place instead of re-evaluating.
 *
 * These tests don't spin up a real hydra instance. We hand the
 * renderer a pre-built pattern function that records its `stave`
 * arg and poke the code paths that bind / rebind / tear down the
 * bag. The hydra bootstrap path (lazy `import('hydra-synth')`) runs
 * off the critical path of these assertions.
 */

import { describe, it, expect } from 'vitest'
import { HydraVizRenderer, type HydraStaveBag } from '../renderers/HydraVizRenderer'
import type { EngineComponents } from '../../engine/LiveCodingEngine'
import type { IRPattern } from '../../ir/IRPattern'
import type { IREvent } from '../../ir/IREvent'

// Minimal IREvent shape — tests don't need every optional field, and
// TS's structural typing lets us spread from a partial.
type IREventLike = IREvent

function makeScheduler(): IRPattern {
  return {
    now: () => 0,
    query: () => [],
  }
}

describe('HydraVizRenderer — stave bag', () => {
  it('mount() forwards scheduler and trackSchedulers into the stave bag', () => {
    let capturedBag: HydraStaveBag | null = null
    const renderer = new HydraVizRenderer((_synth, stave) => {
      capturedBag = stave
    })

    const scheduler = makeScheduler()
    const drums = makeScheduler()
    const tracks = new Map([['drums', drums]])

    // Invoke the non-hydra portion of mount — we call the private
    // component-ingestion by constructing a components bag and
    // pushing it via `update()`, which exercises the same write
    // path as mount().
    renderer.update({
      queryable: { scheduler, trackSchedulers: tracks },
    } as Partial<EngineComponents>)

    // Pull the live bag by invoking the pattern with a fake synth;
    // HydraVizRenderer.initHydra would normally call this, but we
    // can reach the bag directly via the update-side-effect test.
    // Easier: the class exposes the bag via the second pattern arg
    // when initHydra runs the pattern. Here we poke the internal
    // field via a type-cast escape hatch.
    const bag = (renderer as unknown as { staveBag: HydraStaveBag })
      .staveBag

    expect(bag.scheduler).toBe(scheduler)
    expect(bag.tracks.get('drums')).toBe(drums)
    // Silence unused warning — capturedBag is only set during a real
    // hydra mount, which we don't exercise here.
    void capturedBag
  })

  it('update() mutates the same bag object so captured refs stay live', () => {
    const renderer = new HydraVizRenderer()
    const bag1 = (renderer as unknown as { staveBag: HydraStaveBag })
      .staveBag

    const schedulerA = makeScheduler()
    renderer.update({
      queryable: { scheduler: schedulerA, trackSchedulers: new Map() },
    } as Partial<EngineComponents>)

    const bag2 = (renderer as unknown as { staveBag: HydraStaveBag })
      .staveBag
    // Same object identity — live-ref contract. Sketches that close
    // over `stave` in a per-frame callback observe the new scheduler
    // without rebuilding the closure.
    expect(bag2).toBe(bag1)
    expect(bag2.scheduler).toBe(schedulerA)

    const schedulerB = makeScheduler()
    renderer.update({
      queryable: { scheduler: schedulerB, trackSchedulers: new Map() },
    } as Partial<EngineComponents>)

    expect(bag2.scheduler).toBe(schedulerB)
  })

  it('scheduler is null when queryable slot is absent (demo mode)', () => {
    const renderer = new HydraVizRenderer()
    renderer.update({} as Partial<EngineComponents>)
    const bag = (renderer as unknown as { staveBag: HydraStaveBag })
      .staveBag
    expect(bag.scheduler).toBeNull()
    expect(bag.tracks.size).toBe(0)
  })

  describe('H() sugar helper (issue #36)', () => {
    function makePointScheduler(events: Record<number, Partial<IREventLike>>) {
      const now = () => 0
      const query = (begin: number, end: number): IREventLike[] => {
        const out: IREventLike[] = []
        for (const [tStr, ev] of Object.entries(events)) {
          const t = Number(tStr)
          if (t >= begin && t < end) {
            out.push({
              begin: t,
              end: t + 0.1,
              endClipped: t + 0.1,
              note: 0,
              freq: 0,
              s: null,
              gain: 1,
              velocity: 1,
              color: null,
              ...ev,
            })
          }
        }
        return out
      }
      return { now, query } as IRPattern
    }

    it('returns a function callable per-frame that reads the current event', () => {
      const renderer = new HydraVizRenderer()
      const drums = makePointScheduler({
        0: { gain: 0.7, note: 60 },
      })
      renderer.update({
        queryable: {
          scheduler: null,
          trackSchedulers: new Map([['drums', drums]]),
        },
      } as Partial<EngineComponents>)

      const bag = (renderer as unknown as { staveBag: HydraStaveBag })
        .staveBag
      const sampler = bag.H('drums') // default field = 'gain'
      expect(typeof sampler).toBe('function')
      expect(sampler()).toBe(0.7)

      const noteSampler = bag.H('drums', 'note')
      expect(noteSampler()).toBe(60)
    })

    it('returns 0 when the track is absent or no event is active', () => {
      const renderer = new HydraVizRenderer()
      const bag = (renderer as unknown as { staveBag: HydraStaveBag })
        .staveBag
      // No scheduler bound yet.
      expect(bag.H('nonexistent')()).toBe(0)

      // Scheduler bound, but no event at now.
      const empty = makePointScheduler({})
      renderer.update({
        queryable: {
          scheduler: null,
          trackSchedulers: new Map([['drums', empty]]),
        },
      } as Partial<EngineComponents>)
      expect(bag.H('drums')()).toBe(0)
    })

    it('falls back to combined scheduler when named track is missing', () => {
      const renderer = new HydraVizRenderer()
      const combined = makePointScheduler({ 0: { gain: 0.3 } })
      renderer.update({
        queryable: { scheduler: combined, trackSchedulers: new Map() },
      } as Partial<EngineComponents>)
      const bag = (renderer as unknown as { staveBag: HydraStaveBag })
        .staveBag
      // 'anything' not in tracks -> falls back to combined
      expect(bag.H('anything')()).toBe(0.3)
    })

    it('H sampler observes live-ref swaps without re-acquiring from the bag', () => {
      const renderer = new HydraVizRenderer()
      const bag = (renderer as unknown as { staveBag: HydraStaveBag })
        .staveBag
      const sampler = bag.H('bass')

      // No scheduler yet -> 0
      expect(sampler()).toBe(0)

      // Bind scheduler mid-run — same sampler closure must pick it up.
      const bass = makePointScheduler({ 0: { gain: 0.9 } })
      renderer.update({
        queryable: {
          scheduler: null,
          trackSchedulers: new Map([['bass', bass]]),
        },
      } as Partial<EngineComponents>)
      expect(sampler()).toBe(0.9)
    })
  })

  it('destroy() clears the bag fields', () => {
    const renderer = new HydraVizRenderer()
    const scheduler = makeScheduler()
    renderer.update({
      queryable: {
        scheduler,
        trackSchedulers: new Map([['d1', makeScheduler()]]),
      },
    } as Partial<EngineComponents>)

    const bagBefore = (renderer as unknown as { staveBag: HydraStaveBag })
      .staveBag
    expect(bagBefore.scheduler).not.toBeNull()

    renderer.destroy()

    // Same object identity preserved, but fields cleared. Any residual
    // closure inside user code that survived unmount reads null/empty
    // instead of dangling refs.
    const bagAfter = (renderer as unknown as { staveBag: HydraStaveBag })
      .staveBag
    expect(bagAfter).toBe(bagBefore)
    expect(bagAfter.scheduler).toBeNull()
    expect(bagAfter.tracks.size).toBe(0)
  })
})
