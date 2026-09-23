// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  createTrackEnvelopeScheduler,
  digest,
  envelopeFromChannels,
  type TrackEnvelope,
} from './trackEnvelopes'

/**
 * #1731 — when a synth track's display render runs, and what it keeps, driven
 * by a fake engine. That a render really pauses nothing audible, and that Play
 * during one starts at once, is measured in the browser
 * (`packages/app/tests/synth-lane-envelope.spec.ts`).
 */

const env = (v: number): TrackEnvelope => ({ data: new Float32Array([-v, v]), columns: 1, cycles: 4 })

function fakeEngine() {
  const state = {
    playing: false,
    cps: 0.5,
    plays: new Map<string, string>([
      ['a', 'a1'],
      ['b', 'b1'],
    ]),
    silent: new Set<string>(),
    failing: new Set<string>(),
  }
  const log: string[] = []
  const timers: Array<{ fn: () => void; live: boolean }> = []
  let changes = 0
  /** Renders wait here until `release` is called, so a test can act mid-render. */
  let gate: { release: () => void } | null = null
  let holdRenders = false
  let fingerprints = 0
  const deps = {
    isPlaying: () => state.playing,
    cps: () => state.cps,
    fingerprint: (id: string, cycles: number) => {
      fingerprints++
      const p = state.plays.get(id)
      return p == null ? null : `${p}@${cycles}`
    },
    render: async (id: string, _cycles: number, signal: AbortSignal) => {
      log.push(`render ${id}`)
      if (holdRenders) await new Promise<void>((r) => (gate = { release: r }))
      if (signal.aborted) {
        log.push(`cancelled ${id}`)
        throw new Error('cancelled')
      }
      if (state.failing.has(id)) throw new Error('boom')
      if (state.silent.has(id)) return null
      return env(state.plays.get(id) === 'a2' ? 0.5 : 1)
    },
    schedule: (fn: () => void) => {
      const t = { fn, live: true }
      timers.push(t)
      return () => {
        t.live = false
      }
    },
    onChange: () => {
      changes++
    },
    debounceMs: 500,
    capSeconds: 60,
  }
  /** Fire every pending timer, then let the render chain settle. */
  const flush = async () => {
    for (let round = 0; round < 30; round++) {
      const due = timers.splice(0).filter((t) => t.live)
      for (const t of due) t.fn()
      for (let i = 0; i < 10; i++) await Promise.resolve()
    }
  }
  return {
    state,
    log,
    deps,
    flush,
    changes: () => changes,
    fingerprints: () => fingerprints,
    /** Fire only the timers pending right now, once. */
    step: () => {
      for (const t of timers.splice(0).filter((t) => t.live)) t.fn()
    },
    pendingTimers: () => timers.filter((t) => t.live).length,
    holdRenders: (on: boolean) => {
      holdRenders = on
    },
    release: () => gate?.release(),
  }
}

describe('createTrackEnvelopeScheduler (#1731)', () => {
  it('renders every wanted track once the transport is stopped, one at a time', async () => {
    const f = fakeEngine()
    const s = createTrackEnvelopeScheduler(f.deps)
    s.request(['a', 'b'], 4)
    expect(f.log).toEqual([]) // debounced, not immediate
    await f.flush()
    expect(f.log).toEqual(['render a', 'render b'])
    expect(s.get('a')).toMatchObject({ columns: 1, cycles: 4, stale: false })
    expect(s.get('b')).not.toBeNull()
  })

  it('starts nothing while playing, and renders when the transport stops', async () => {
    const f = fakeEngine()
    f.state.playing = true
    const s = createTrackEnvelopeScheduler(f.deps)
    s.request(['a'], 4)
    await f.flush()
    expect(f.log).toEqual([])
    f.state.playing = false
    s.stopped()
    await f.flush()
    expect(f.log).toEqual(['render a'])
  })

  it('Play aborts the render in flight and keeps nothing from it', async () => {
    const f = fakeEngine()
    const s = createTrackEnvelopeScheduler(f.deps)
    f.holdRenders(true)
    s.request(['a', 'b'], 4)
    await f.flush()
    expect(s.status().rendering).toBe('a')
    f.state.playing = true
    s.playing()
    f.release()
    await f.flush()
    expect(f.log).toEqual(['render a', 'cancelled a'])
    expect(s.get('a')).toBeNull()
    expect(s.status().rendering).toBeNull()
    expect(f.pendingTimers()).toBe(0)
  })

  it('an evaluate during a render aborts it and renders the new code after', async () => {
    const f = fakeEngine()
    const s = createTrackEnvelopeScheduler(f.deps)
    f.holdRenders(true)
    s.request(['a'], 4)
    await f.flush()
    f.state.plays.set('a', 'a2')
    s.evaluated()
    await f.flush() // its timer fires while the old render still unwinds
    f.holdRenders(false)
    f.release()
    await f.flush()
    expect(f.log).toEqual(['render a', 'cancelled a', 'render a'])
    expect(s.get('a')).toMatchObject({ stale: false })
    expect(s.get('a')?.data[1]).toBe(0.5)
  })

  it('a Play deferred behind the render (transport still reads stopped) starts no new render', async () => {
    const f = fakeEngine()
    const s = createTrackEnvelopeScheduler(f.deps)
    f.holdRenders(true)
    s.request(['a', 'b'], 4)
    await f.flush()
    s.playing() // the engine has not started yet: isPlaying() is still false
    f.holdRenders(false)
    f.release()
    await f.flush()
    expect(f.log).toEqual(['render a', 'cancelled a'])
    s.stopped()
    await f.flush()
    expect(f.log).toEqual(['render a', 'cancelled a', 'render a', 'render b'])
  })

  it('an evaluate fingerprints one track per task, never all at once inside the evaluate', async () => {
    const f = fakeEngine()
    f.state.playing = true
    const s = createTrackEnvelopeScheduler(f.deps)
    s.request(['a', 'b'], 4)
    await f.flush()
    const before = f.fingerprints()
    s.evaluated()
    expect(f.fingerprints()).toBe(before) // nothing on the evaluate's own stack
    f.step()
    expect(f.fingerprints()).toBe(before + 1)
    f.step()
    expect(f.fingerprints()).toBe(before + 2)
  })

  it('an unchanged track stays fresh while the pass is still working through the others', async () => {
    const f = fakeEngine()
    const s = createTrackEnvelopeScheduler(f.deps)
    s.request(['a', 'b'], 4)
    await f.flush()
    f.state.playing = true
    s.evaluated()
    f.step() // only 'a' re-fingerprinted so far
    expect(s.get('a')?.stale).toBe(false)
    expect(s.get('b')?.stale).toBe(false)
  })

  it('a stop during a fingerprint pass waits for the pass, so an edit renders once', async () => {
    const f = fakeEngine()
    const s = createTrackEnvelopeScheduler(f.deps)
    s.request(['b', 'a'], 4) // 'a' is fingerprinted second
    await f.flush()
    f.state.playing = true
    f.state.plays.set('a', 'a2')
    s.evaluated()
    await f.flush()
    f.state.plays.set('a', 'a3')
    s.evaluated()
    f.state.playing = false
    s.stopped()
    f.log.length = 0
    await f.flush()
    // Rendering before the pass reached 'a' would stamp the render with 'a2'
    // while the pattern plays 'a3', and render it all over again after.
    expect(f.log).toEqual(['render a'])
    expect(s.get('a')?.stale).toBe(false)
  })

  it('an edit marks only the edited track stale, and re-renders only it', async () => {
    const f = fakeEngine()
    const s = createTrackEnvelopeScheduler(f.deps)
    s.request(['a', 'b'], 4)
    await f.flush()
    f.log.length = 0
    f.state.playing = true
    f.state.plays.set('a', 'a2')
    s.evaluated()
    await f.flush()
    expect(s.get('a')?.stale).toBe(true)
    expect(s.get('b')?.stale).toBe(false)
    expect(f.log).toEqual([]) // still playing
    f.state.playing = false
    s.stopped()
    await f.flush()
    expect(f.log).toEqual(['render a'])
    expect(s.get('a')).toMatchObject({ stale: false })
    expect(s.get('a')?.data[1]).toBe(0.5)
  })

  it('a silent or failed render draws nothing, and is not retried until the track changes', async () => {
    const f = fakeEngine()
    const s = createTrackEnvelopeScheduler(f.deps)
    s.request(['a', 'b'], 4)
    await f.flush()
    f.state.silent.add('a')
    f.state.failing.add('b')
    f.state.plays.set('a', 'a3')
    f.state.plays.set('b', 'b3')
    s.evaluated()
    await f.flush()
    expect(s.get('a')).toBeNull()
    expect(s.get('b')).toBeNull()
    f.log.length = 0
    s.stopped()
    await f.flush()
    expect(f.log).toEqual([])
    f.state.silent.delete('a')
    f.state.plays.set('a', 'a4')
    s.evaluated()
    await f.flush()
    expect(f.log).toEqual(['render a'])
  })

  it('a track past the budget is listed, not rendered, and keeps no envelope', async () => {
    const f = fakeEngine()
    f.deps.capSeconds = 10 // 4 cycles at 0.5 cps = 8 s per track
    const s = createTrackEnvelopeScheduler(f.deps)
    s.request(['a', 'b'], 4)
    await f.flush()
    expect(f.log).toEqual(['render a'])
    expect(s.status().overCap).toEqual(['b'])
    expect(s.get('b')).toBeNull()
  })

  it('a user render waits for the display render to let go, and none starts during it', async () => {
    const f = fakeEngine()
    const s = createTrackEnvelopeScheduler(f.deps)
    f.holdRenders(true)
    s.request(['a', 'b'], 4)
    await f.flush()
    expect(s.status().rendering).toBe('a')
    let userStarted = false
    const user = s.exclusive(async () => {
      userStarted = true
      s.stopped() // a bounce stops the transport first; that must not start one
      await f.flush()
      return 'bounced'
    })
    await Promise.resolve()
    expect(userStarted).toBe(false) // still waiting for the display render
    f.release()
    expect(await user).toBe('bounced')
    expect(f.log).toEqual(['render a', 'cancelled a'])
    f.holdRenders(false)
    await f.flush()
    expect(f.log).toEqual(['render a', 'cancelled a', 'render a', 'render b'])
  })

  it('a changed span re-renders, since an envelope covers the span it was made for', async () => {
    const f = fakeEngine()
    const s = createTrackEnvelopeScheduler(f.deps)
    s.request(['a'], 4)
    await f.flush()
    s.request(['a'], 8)
    f.step() // the new span's fingerprint lands in its own task
    expect(s.get('a')?.stale).toBe(true)
    await f.flush()
    expect(f.log).toEqual(['render a', 'render a'])
    expect(s.get('a')?.stale).toBe(false)
  })

  it('dispose stops everything', async () => {
    const f = fakeEngine()
    const s = createTrackEnvelopeScheduler(f.deps)
    s.request(['a'], 4)
    s.dispose()
    await f.flush()
    expect(f.log).toEqual([])
  })
})

describe('envelopeFromChannels', () => {
  it('takes min and max across both channels per column', () => {
    const l = new Float32Array([0.1, -0.2, 0, 0])
    const r = new Float32Array([0, 0.3, -0.5, 0.4])
    const out = envelopeFromChannels([l, r], 2)!
    expect([...out.data].map((v) => +v.toFixed(2))).toEqual([-0.2, 0.3, -0.5, 0.4])
  })
  it('returns null for silence', () => {
    expect(envelopeFromChannels([new Float32Array(8)], 4)).toBeNull()
  })
})

describe('digest', () => {
  it('is stable and tells different inputs apart', () => {
    expect(digest('note c3')).toBe(digest('note c3'))
    expect(digest('note c3')).not.toBe(digest('note c4'))
  })
})
