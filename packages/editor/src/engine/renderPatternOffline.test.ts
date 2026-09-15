// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { renderPatternOffline, describeSkipped, type OfflineGraphDeps } from './renderPatternOffline'

/**
 * #1353 — the offline render's bookkeeping, driven by fakes.
 *
 * What these arms pin is everything EXCEPT the audio: which context the module
 * globals name while superdough runs, that the live ones come back on every
 * exit, and that a hap superdough refuses is COUNTED. The audio itself is
 * measured in the browser (`packages/app/tests/bounce-paths.spec.ts`), because
 * no fake can say whether a drum sample sounds.
 */

const LIVE_CTX = { name: 'live' }
const LIVE_CONTROLLER = { name: 'live-controller' }

function hap(begin: number, value: Record<string, unknown>, dur = 0.25) {
  return {
    hasOnset: () => true,
    whole: { begin },
    duration: dur,
    value,
  }
}

interface Harness {
  deps: OfflineGraphDeps
  calls: Array<{ value: Record<string, unknown>; t: number; dur: number; cps: number; cycle: number; ctxAtCall: unknown; controllerAtCall: unknown }>
  state: { ctx: unknown; controller: unknown; framesAsked?: number; rateAsked?: number }
}

function harness(opts: {
  refuse?: (value: Record<string, unknown>) => string | null
  initThrows?: boolean
  renderThrows?: boolean
} = {}): Harness {
  const state: Harness['state'] = { ctx: LIVE_CTX, controller: LIVE_CONTROLLER }
  const calls: Harness['calls'] = []
  const buffer = { length: 1 } as unknown as AudioBuffer
  const deps: OfflineGraphDeps = {
    getAudioContext: () => state.ctx,
    setAudioContext: (c) => { state.ctx = c },
    getSuperdoughAudioController: () => state.controller,
    setSuperdoughAudioController: (c) => { state.controller = c },
    initAudio: async () => {
      if (opts.initThrows) throw new Error('worklets failed')
    },
    superdough: async (value, t, dur, cps, cycle) => {
      calls.push({ value, t, dur, cps, cycle, ctxAtCall: state.ctx, controllerAtCall: state.controller })
      const reason = opts.refuse?.(value)
      if (reason) throw new Error(reason)
    },
    createContext: (frames, rate) => {
      state.framesAsked = frames
      state.rateAsked = rate
      return {
        startRendering: async () => {
          if (opts.renderThrows) throw new Error('render failed')
          return buffer
        },
      }
    },
  }
  return { deps, calls, state }
}

function patternOf(haps: ReturnType<typeof hap>[]) {
  return { queryArc: () => haps }
}

const OPTS = { cps: 0.5, duration: 4, sampleRate: 48000 }

describe('renderPatternOffline (#1353)', () => {
  it('counts every hap superdough refuses, per reason — four failures are four, not one', async () => {
    const h = harness({ refuse: (v) => (v.s === 'nosuchsound' ? 'sound nosuchsound not found! Is it loaded?' : null) })
    const out = await renderPatternOffline(
      patternOf([
        hap(0, { s: 'bd' }), hap(0.25, { s: 'nosuchsound' }), hap(0.5, { s: 'bd' }),
        hap(0.75, { s: 'nosuchsound' }), hap(1, { s: 'nosuchsound' }), hap(1.25, { s: 'nosuchsound' }),
      ]),
      OPTS,
      h.deps
    )
    expect({ haps: out.haps, played: out.played, skipped: out.skipped }).toEqual({
      haps: 6,
      played: 2,
      skipped: [{ reason: 'sound nosuchsound not found! Is it loaded?', count: 4 }],
    })
  })

  it('keeps distinct reasons apart, in the order they were first met', async () => {
    const h = harness({ refuse: (v) => (v.s === 'a' ? 'reason A' : v.s === 'b' ? 'reason B' : null) })
    const out = await renderPatternOffline(
      patternOf([hap(0, { s: 'b' }), hap(1, { s: 'a' }), hap(2, { s: 'b' })]),
      OPTS,
      h.deps
    )
    expect(describeSkipped(out.skipped)).toBe('2 × reason B; 1 × reason A')
  })

  it('runs superdough against the OFFLINE context with a cleared controller, never the live one', async () => {
    const h = harness()
    await renderPatternOffline(patternOf([hap(0, { s: 'bd' }), hap(1, { s: 'bd' })]), OPTS, h.deps)
    expect(
      h.calls.map((c) => ({ live: c.ctxAtCall === LIVE_CTX, controller: c.controllerAtCall }))
    ).toEqual([
      { live: false, controller: null },
      { live: false, controller: null },
    ])
  })

  it('restores the live context and controller after a successful render', async () => {
    const h = harness()
    await renderPatternOffline(patternOf([hap(0, { s: 'bd' })]), OPTS, h.deps)
    expect([h.state.ctx, h.state.controller]).toEqual([LIVE_CTX, LIVE_CONTROLLER])
  })

  it('restores the live context and controller when initAudio throws', async () => {
    const h = harness({ initThrows: true })
    await expect(renderPatternOffline(patternOf([hap(0, { s: 'bd' })]), OPTS, h.deps)).rejects.toThrow('worklets failed')
    expect([h.state.ctx, h.state.controller]).toEqual([LIVE_CTX, LIVE_CONTROLLER])
  })

  it('restores the live context and controller when rendering throws', async () => {
    const h = harness({ renderThrows: true })
    await expect(renderPatternOffline(patternOf([hap(0, { s: 'bd' })]), OPTS, h.deps)).rejects.toThrow('render failed')
    expect([h.state.ctx, h.state.controller]).toEqual([LIVE_CTX, LIVE_CONTROLLER])
  })

  it('schedules each hap in seconds at the given tempo, in onset order', async () => {
    const h = harness()
    await renderPatternOffline(
      patternOf([hap(1, { s: 'late' }, 0.5), hap(0.5, { s: 'early' }, 0.25)]),
      OPTS,
      h.deps
    )
    expect(h.calls.map((c) => [c.value.s, c.t, c.dur, c.cps, c.cycle])).toEqual([
      ['early', 1, 0.5, 0.5, 0.5],
      ['late', 2, 1, 0.5, 1],
    ])
  })

  it('asks for exactly duration × sampleRate frames, rounded up', async () => {
    const h = harness()
    await renderPatternOffline(patternOf([]), { cps: 0.5, duration: 4.00001, sampleRate: 44100 }, h.deps)
    expect([h.state.framesAsked, h.state.rateAsked]).toEqual([Math.ceil(4.00001 * 44100), 44100])
  })
})
