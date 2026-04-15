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
