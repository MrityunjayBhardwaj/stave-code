// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  renderPatternOffline,
  describeSkipped,
  RENDER_WINDOW_SECONDS,
  RENDER_WINDOW_LEAD_SECONDS,
  RenderCancelledError,
  roomChangeTimes,
  type OfflineGraphDeps,
} from './renderPatternOffline'

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

/**
 * #1658 — a context that can pause. The fake plays its render forward through
 * the pause times in order, the way the audio thread reaches them: each pause
 * resolves, and the render does not move on until `resume` is called.
 */
function pausingHarness() {
  const log: string[] = []
  const state = { ctx: LIVE_CTX as unknown, controller: LIVE_CONTROLLER as unknown, now: 0 }
  const calls: Array<{ s: unknown; t: number; now: number; live: boolean }> = []
  const pauses: number[] = []
  const buffer = { length: 1 } as unknown as AudioBuffer
  const deps: OfflineGraphDeps = {
    getAudioContext: () => state.ctx,
    setAudioContext: (c) => { state.ctx = c },
    getSuperdoughAudioController: () => state.controller,
    setSuperdoughAudioController: (c) => { state.controller = c },
    initAudio: async () => {},
    superdough: async (value, t) => {
      // A real sample load yields; the render must still wait for it.
      await new Promise((r) => setTimeout(r, 0))
      calls.push({ s: value.s, t, now: state.now, live: state.ctx === LIVE_CTX })
    },
    createContext: () => {
      const waiting: Array<{ at: number; fire: () => void }> = []
      let resumed: (() => void) | null = null
      return {
        suspend: (at: number) => {
          pauses.push(at)
          return new Promise<void>((fire) => waiting.push({ at, fire }))
        },
        resume: async () => {
          log.push(`resume@${state.now}`)
          resumed?.()
        },
        startRendering: async () => {
          log.push('render')
          for (const w of [...waiting].sort((a, b) => a.at - b.at)) {
            state.now = w.at
            await new Promise<void>((r) => {
              resumed = r
              w.fire()
            })
          }
          state.now = Infinity
          return buffer
        },
      }
    },
  }
  return { deps, calls, pauses, log, state }
}

describe('renderPatternOffline — notes are scheduled a window at a time (#1658)', () => {
  const W = RENDER_WINDOW_SECONDS
  // cps 1: a hap's cycle is its second.
  const CPS1 = { cps: 1, duration: 3 * W, sampleRate: 48000 }

  it('schedules a later window only once the render has reached its pause', async () => {
    const h = pausingHarness()
    await renderPatternOffline(
      patternOf([hap(0, { s: 'w0' }), hap(W + 1, { s: 'w1' }), hap(2 * W + 0.5, { s: 'w2' })]),
      CPS1,
      h.deps
    )
    expect(h.calls.map((c) => [c.s, c.now])).toEqual([
      ['w0', 0],
      ['w1', W - RENDER_WINDOW_LEAD_SECONDS],
      ['w2', 2 * W - RENDER_WINDOW_LEAD_SECONDS],
    ])
  })

  it('never schedules a note before the render time it is scheduled at', async () => {
    // superdough drops a note in the past with only a warning, so a note on a
    // window's very first instant is the case that matters.
    const h = pausingHarness()
    await renderPatternOffline(
      patternOf([hap(W, { s: 'edge' }), hap(2 * W, { s: 'edge2' }), hap(W - 0.01, { s: 'justBefore' })]),
      CPS1,
      h.deps
    )
    expect(h.calls.every((c) => c.t >= c.now)).toBe(true)
    expect(h.calls.map((c) => c.s)).toEqual(['justBefore', 'edge', 'edge2'])
  })

  it('keeps onset order across windows, and pauses only where there is something to schedule', async () => {
    const h = pausingHarness()
    await renderPatternOffline(
      patternOf([hap(2 * W + 1, { s: 'c' }), hap(0.5, { s: 'a' }), hap(2 * W, { s: 'b' })]),
      CPS1,
      h.deps
    )
    expect(h.calls.map((c) => c.s)).toEqual(['a', 'b', 'c'])
    expect(h.pauses).toEqual([2 * W - RENDER_WINDOW_LEAD_SECONDS])
  })

  it('schedules against the OFFLINE context during a pause, and restores the live one after', async () => {
    const h = pausingHarness()
    await renderPatternOffline(patternOf([hap(0, { s: 'a' }), hap(W, { s: 'b' })]), CPS1, h.deps)
    expect(h.calls.map((c) => c.live)).toEqual([false, false])
    expect([h.state.ctx, h.state.controller]).toEqual([LIVE_CTX, LIVE_CONTROLLER])
  })

  it('a window that throws still resumes the render, and the error reaches the caller', async () => {
    const h = pausingHarness()
    const bad = { ...hap(W, { s: 'bad' }), ensureObjectValue: () => { throw new Error('bad value') } }
    await expect(
      renderPatternOffline(patternOf([hap(0, { s: 'a' }), bad, hap(2 * W, { s: 'c' })]), CPS1, h.deps)
    ).rejects.toThrow('bad value')
    // The render ran past the failing window to its end rather than hanging.
    expect(h.calls.map((c) => c.s)).toEqual(['a', 'c'])
    expect([h.state.ctx, h.state.controller]).toEqual([LIVE_CTX, LIVE_CONTROLLER])
  })

  it('counts played and skipped the same as an upfront render', async () => {
    const h = pausingHarness()
    const inner = h.deps.superdough
    h.deps.superdough = async (value, ...rest) => {
      await inner(value, ...rest)
      if (value.s === 'nope') throw new Error('not found')
    }
    const out = await renderPatternOffline(
      patternOf([hap(0, { s: 'a' }), hap(W, { s: 'nope' }), hap(2 * W, { s: 'nope' })]),
      CPS1,
      h.deps
    )
    expect({ haps: out.haps, played: out.played, skipped: out.skipped }).toEqual({
      haps: 3,
      played: 1,
      skipped: [{ reason: 'not found', count: 2 }],
    })
  })
})

describe('renderPatternOffline — a cancel takes effect at the next pause (#1655)', () => {
  const W = RENDER_WINDOW_SECONDS
  const CPS1 = { cps: 1, duration: 4 * W, sampleRate: 48000 }

  it('schedules nothing after the cancel, still finishes the render, and keeps nothing', async () => {
    const h = pausingHarness()
    const controller = new AbortController()
    const inner = h.deps.superdough
    h.deps.superdough = async (value, ...rest) => {
      await inner(value, ...rest)
      if (value.s === 'w1') controller.abort() // Cancel pressed while window 1 is scheduled.
    }
    await expect(
      renderPatternOffline(
        patternOf([hap(0, { s: 'w0' }), hap(W, { s: 'w1' }), hap(2 * W, { s: 'w2' }), hap(3 * W, { s: 'w3' })]),
        { ...CPS1, signal: controller.signal },
        h.deps
      )
    ).rejects.toBeInstanceOf(RenderCancelledError)
    expect(h.calls.map((c) => c.s)).toEqual(['w0', 'w1'])
    // Every pause was resumed, so the render ran to its end rather than hanging.
    expect(h.log.filter((l) => l.startsWith('resume'))).toHaveLength(3)
    expect([h.state.ctx, h.state.controller]).toEqual([LIVE_CTX, LIVE_CONTROLLER])
  })

  it('CONTROL — an unaborted signal renders every window and returns the buffer', async () => {
    const h = pausingHarness()
    const out = await renderPatternOffline(
      patternOf([hap(0, { s: 'w0' }), hap(W, { s: 'w1' }), hap(2 * W, { s: 'w2' })]),
      { ...CPS1, signal: new AbortController().signal },
      h.deps
    )
    expect(out.played).toBe(3)
  })

  it('without pauses the cancel is honoured when the render ends — nothing is kept', async () => {
    const h = harness()
    const controller = new AbortController()
    h.deps.superdough = async () => { controller.abort() }
    await expect(
      renderPatternOffline(patternOf([hap(0, { s: 'a' }), hap(1, { s: 'b' })]), { ...OPTS, signal: controller.signal }, h.deps)
    ).rejects.toBeInstanceOf(RenderCancelledError)
    expect([h.state.ctx, h.state.controller]).toEqual([LIVE_CTX, LIVE_CONTROLLER])
  })
})

describe('renderPatternOffline — progress is reported from the pauses (#1650)', () => {
  const W = RENDER_WINDOW_SECONDS

  it('reports each pause as the song time it reached, in order, then the full length', async () => {
    const h = pausingHarness()
    const heard: number[] = []
    await renderPatternOffline(
      patternOf([hap(0, { s: 'a' }), hap(W, { s: 'b' }), hap(2 * W + 1, { s: 'c' })]),
      { cps: 1, duration: 3 * W, sampleRate: 48000, onProgress: (s) => heard.push(s) },
      h.deps
    )
    expect(heard).toEqual([W, 2 * W, 3 * W])
  })

  it('a report is made while the render is still paused, before that window is scheduled', async () => {
    const h = pausingHarness()
    const seen: Array<[number, number]> = []
    await renderPatternOffline(
      patternOf([hap(0, { s: 'a' }), hap(W, { s: 'b' })]),
      { cps: 1, duration: 2 * W, sampleRate: 48000, onProgress: (s) => seen.push([s, h.calls.length]) },
      h.deps
    )
    // At the pause for window 1, only window 0's note has been scheduled.
    expect(seen[0]).toEqual([W, 1])
  })

  it('without pauses it reports only the end', async () => {
    const h = harness()
    const heard: number[] = []
    await renderPatternOffline(patternOf([hap(0, { s: 'a' })]), { ...OPTS, onProgress: (s) => heard.push(s) }, h.deps)
    expect(heard).toEqual([OPTS.duration])
  })

  it('a cancelled render never reports the end', async () => {
    const h = pausingHarness()
    const controller = new AbortController()
    const heard: number[] = []
    const inner = h.deps.superdough
    h.deps.superdough = async (value, ...rest) => {
      await inner(value, ...rest)
      controller.abort()
    }
    await expect(
      renderPatternOffline(
        patternOf([hap(0, { s: 'a' }), hap(W, { s: 'b' })]),
        { cps: 1, duration: 2 * W, sampleRate: 48000, signal: controller.signal, onProgress: (s) => heard.push(s) },
        h.deps
      )
    ).rejects.toBeInstanceOf(RenderCancelledError)
    expect(heard).not.toContain(2 * W)
  })
})

describe('renderPatternOffline — the render waits for what a window asked for (#1675)', () => {
  const W = RENDER_WINDOW_SECONDS
  const P = W - RENDER_WINDOW_LEAD_SECONDS

  /** A settle that yields first, the way a reverb's impulse response lands later. */
  function settling(h: ReturnType<typeof pausingHarness>) {
    h.deps.settle = async () => {
      await new Promise((r) => setTimeout(r, 0))
      h.log.push(`settle@${h.state.now}:${h.calls.length}`)
    }
  }

  it('settles after each window is scheduled and before the render moves on from it', async () => {
    const h = pausingHarness()
    settling(h)
    await renderPatternOffline(
      patternOf([hap(0, { s: 'w0' }), hap(W + 1, { s: 'w1' }), hap(2 * W, { s: 'w2' })]),
      { cps: 1, duration: 3 * W, sampleRate: 48000 },
      h.deps
    )
    // `:n` is how many notes had been scheduled when it settled: each settle
    // follows its own window's notes, and comes before the render continues.
    expect(h.log).toEqual([
      'settle@0:1',
      'render',
      `settle@${P}:2`,
      `resume@${P}`,
      `settle@${2 * W - RENDER_WINDOW_LEAD_SECONDS}:3`,
      `resume@${2 * W - RENDER_WINDOW_LEAD_SECONDS}`,
    ])
  })

  it('without pauses it settles once, before rendering starts', async () => {
    const h = harness()
    const order: string[] = []
    h.deps.settle = async () => {
      await new Promise((r) => setTimeout(r, 0))
      order.push(`settle:${h.calls.length}`)
    }
    const create = h.deps.createContext
    h.deps.createContext = (frames, rate) => {
      const ctx = create(frames, rate)
      return { startRendering: () => (order.push('render'), ctx.startRendering()) }
    }
    await renderPatternOffline(patternOf([hap(0, { s: 'a' }), hap(1, { s: 'b' })]), OPTS, h.deps)
    expect(order).toEqual(['settle:2', 'render'])
  })

  it('a settle that fails at a pause still resumes the render, and the error reaches the caller', async () => {
    const h = pausingHarness()
    h.deps.settle = async () => {
      if (h.state.now > 0) throw new Error('impulse response failed')
    }
    await expect(
      renderPatternOffline(
        patternOf([hap(0, { s: 'a' }), hap(W, { s: 'b' }), hap(2 * W, { s: 'c' })]),
        { cps: 1, duration: 3 * W, sampleRate: 48000 },
        h.deps
      )
    ).rejects.toThrow('impulse response failed')
    expect(h.log.filter((l) => l.startsWith('resume'))).toHaveLength(2)
    expect([h.state.ctx, h.state.controller]).toEqual([LIVE_CTX, LIVE_CONTROLLER])
  })
})

describe('renderPatternOffline — a note that reshapes its room gets a pause of its own (#1676)', () => {
  const W = RENDER_WINDOW_SECONDS
  const L = RENDER_WINDOW_LEAD_SECONDS
  const room = (begin: number, extra: Record<string, unknown>) => hap(begin, { s: `n${begin}`, room: 0.8, ...extra })

  describe('roomChangeTimes — replays superdough getReverb', () => {
    it('a new shape on every note is a change on every note but the first', () => {
      const haps = [room(0, { roomsize: 1 }), room(2, { roomsize: 4 }), room(4, { roomsize: 1 })]
      expect(roomChangeTimes(haps, 1)).toEqual([2, 4])
    })

    it('an undefined value keeps the room; the same value again is no change', () => {
      const haps = [room(0, { roomsize: 4 }), room(1, {}), room(2, { roomsize: 4 })]
      expect(roomChangeTimes(haps, 1)).toEqual([])
    })

    it('a rebuild resets what its note leaves undefined, so asking for it again is a change', () => {
      // lp 100 → a size change rebuilds with lp back at its default → lp 100 again rebuilds
      const haps = [room(0, { roomsize: 4, roomlp: 100 }), room(1, { roomsize: 1 }), room(2, { roomlp: 100 })]
      expect(roomChangeTimes(haps, 1)).toEqual([1, 2])
    })

    it('a value equal to the default is no change after a build that defaulted it', () => {
      expect(roomChangeTimes([room(0, {}), room(1, { roomsize: 2, roomlp: 15000 })], 1)).toEqual([])
    })

    it('orbits keep separate rooms, and a note with no room touches none', () => {
      const haps = [
        room(0, { roomsize: 1 }),
        room(1, { roomsize: 4, orbit: 2 }),
        hap(2, { s: 'dry', roomsize: 9 }),
        room(3, { roomsize: 1 }),
      ]
      expect(roomChangeTimes(haps, 1)).toEqual([])
    })

    it('a different impulse sample is a change', () => {
      expect(roomChangeTimes([room(0, { ir: 'hall' }), room(1, { ir: 'hall', i: 1 }), room(2, {})], 1)).toEqual([1, 2])
    })

    it('reads song seconds at the given tempo', () => {
      expect(roomChangeTimes([room(0, { roomsize: 1 }), room(1, { roomsize: 4 })], 0.5)).toEqual([2])
    })
  })

  it('pauses just before each note that reshapes the room, and hands that note over there', async () => {
    const h = pausingHarness()
    // four notes in ONE window, sizes 1 4 1 4
    await renderPatternOffline(
      patternOf([room(0, { roomsize: 1 }), room(0.5, { roomsize: 4 }), room(1, { roomsize: 1 }), room(1.5, { roomsize: 4 })]),
      { cps: 1, duration: W, sampleRate: 48000 },
      h.deps
    )
    expect(h.pauses).toEqual([0.5 - L, 1 - L, 1.5 - L])
    expect(h.calls.map((c) => [c.s, c.now])).toEqual([
      ['n0', 0],
      ['n0.5', 0.5 - L],
      ['n1', 1 - L],
      ['n1.5', 1.5 - L],
    ])
  })

  it('notes after a room change in the same window are handed over at its pause, not before', async () => {
    const h = pausingHarness()
    await renderPatternOffline(
      patternOf([room(0, { roomsize: 1 }), room(1, { roomsize: 4 }), hap(2, { s: 'dry' }), room(3, {})]),
      { cps: 1, duration: W, sampleRate: 48000 },
      h.deps
    )
    expect(h.pauses).toEqual([1 - L])
    expect(h.calls.map((c) => [c.s, c.now])).toEqual([
      ['n0', 0],
      ['n1', 1 - L],
      ['dry', 1 - L],
      ['n3', 1 - L],
    ])
  })

  it('a room change on a window boundary shares its pause; two within a render block share one', async () => {
    const h = pausingHarness()
    const block = 128 / 48000
    await renderPatternOffline(
      patternOf([room(0, { roomsize: 1 }), room(W, { roomsize: 4 }), room(W + 1, { roomsize: 1 }), room(W + 1 + block / 2, { roomsize: 4 })]),
      { cps: 1, duration: 2 * W, sampleRate: 48000 },
      h.deps
    )
    expect(h.pauses).toEqual([W - L, W + 1 - L])
  })

  it('a song that never reshapes a room pauses exactly as before', async () => {
    const h = pausingHarness()
    await renderPatternOffline(
      patternOf([room(0, { roomsize: 3 }), room(W + 1, {}), room(2 * W + 1, { roomsize: 3 })]),
      { cps: 1, duration: 3 * W, sampleRate: 48000 },
      h.deps
    )
    expect(h.pauses).toEqual([W - L, 2 * W - L])
  })

  it('a room change too early to pause ahead of is handed over up front', async () => {
    const h = pausingHarness()
    await renderPatternOffline(
      patternOf([room(0, { roomsize: 1 }), room(L / 2, { roomsize: 4 })]),
      { cps: 1, duration: W, sampleRate: 48000 },
      h.deps
    )
    expect(h.pauses).toEqual([])
    expect(h.calls.map((c) => c.now)).toEqual([0, 0])
  })
})
