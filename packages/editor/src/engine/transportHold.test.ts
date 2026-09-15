// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createTransportHold } from './transportHold'

/**
 * #1627 — what a render does to the live transport, driven by a fake one.
 * Whether live notes actually stay out of the file is measured in the browser
 * (`packages/app/tests/bounce-paths.spec.ts`); these arms pin the transport
 * state on every exit, which no audio reading can see.
 */

function fakeTransport(playing: boolean, resumeThrows?: Error) {
  const log: string[] = []
  const state = { playing, resumeErrors: [] as unknown[] }
  const transport = {
    isPlaying: () => state.playing,
    pause: () => {
      log.push('pause')
      state.playing = false
    },
    resume: async () => {
      log.push('resume')
      if (resumeThrows) throw resumeThrows
      state.playing = true
    },
    onResumeError: (e: unknown) => {
      state.resumeErrors.push(e)
    },
  }
  return { transport, state, log }
}

const tick = () => new Promise((r) => setTimeout(r, 1))

describe('createTransportHold (#1627)', () => {
  it('pauses a playing transport for the render and resumes it after', async () => {
    const f = fakeTransport(true)
    const h = createTransportHold(f.transport)
    const seen: boolean[] = []
    const out = await h.hold(async () => {
      seen.push(f.state.playing)
      await tick()
      return 'wav'
    })
    expect({ out, duringRender: seen, log: f.log, after: f.state.playing }).toEqual({
      out: 'wav',
      duringRender: [false],
      log: ['pause', 'resume'],
      after: true,
    })
  })

  it('never starts a transport that was stopped when the render began', async () => {
    const f = fakeTransport(false)
    const h = createTransportHold(f.transport)
    await h.hold(async () => 'wav')
    expect({ log: f.log, after: f.state.playing }).toEqual({ log: [], after: false })
  })

  it('resumes when the render throws, and the render error still reaches the caller', async () => {
    const f = fakeTransport(true)
    const h = createTransportHold(f.transport)
    const err = await h
      .hold(async () => {
        throw new Error('no pattern')
      })
      .catch((e) => String(e))
    expect({ err, log: f.log, after: f.state.playing }).toEqual({
      err: 'Error: no pattern',
      log: ['pause', 'resume'],
      after: true,
    })
  })

  it('a Stop pressed during the render cancels the resume', async () => {
    const f = fakeTransport(true)
    const h = createTransportHold(f.transport)
    await h.hold(async () => {
      h.cancelResume()
    })
    expect({ log: f.log, after: f.state.playing }).toEqual({ log: ['pause'], after: false })
  })

  it('a Play pressed during the render is deferred to its end, not started into it', async () => {
    const f = fakeTransport(false)
    const h = createTransportHold(f.transport)
    let deferred: boolean | undefined
    await h.hold(async () => {
      deferred = h.requestPlay()
    })
    expect({ deferred, log: f.log, after: f.state.playing }).toEqual({
      deferred: true,
      log: ['resume'],
      after: true,
    })
  })

  it('a Play outside any render is not deferred', () => {
    const f = fakeTransport(false)
    const h = createTransportHold(f.transport)
    expect({ deferred: h.requestPlay(), log: f.log }).toEqual({ deferred: false, log: [] })
  })

  it('nested holds pause and resume once, so stems do not stutter between renders', async () => {
    const f = fakeTransport(true)
    const h = createTransportHold(f.transport)
    const between: boolean[] = []
    await h.hold(async () => {
      for (const stem of ['a', 'b', 'c']) {
        await h.hold(async () => stem)
        between.push(f.state.playing)
      }
    })
    expect({ log: f.log, between, after: f.state.playing, held: h.isHeld() }).toEqual({
      log: ['pause', 'resume'],
      between: [false, false, false],
      after: true,
      held: false,
    })
  })

  it('a resume that throws is reported and does not replace the render result', async () => {
    const boom = new Error('Scheduler: no pattern set!')
    const f = fakeTransport(true, boom)
    const h = createTransportHold(f.transport)
    const out = await h.hold(async () => 'wav')
    expect({ out, reported: f.state.resumeErrors }).toEqual({ out: 'wav', reported: [boom] })
  })
})
