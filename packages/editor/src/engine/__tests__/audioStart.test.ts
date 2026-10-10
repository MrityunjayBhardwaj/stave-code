/**
 * Asking the browser to start audio (#1987).
 *
 * What is pinned: a suspended context is asked to start, a running or closed one is
 * left alone, a refusal does not throw, the "next gesture" listeners ask on every
 * gesture until the context runs and then take themselves off, and the playback
 * declaration is made only where the browser offers one.
 */
import { describe, expect, it, vi } from 'vitest'
import { declarePlayback, startAudio, startAudioOnNextGesture, type StartableAudio } from '../audioStart'

function context(state: AudioContextState | 'interrupted', resume: () => Promise<void> = async () => undefined): StartableAudio & { resume: ReturnType<typeof vi.fn>; state: string } {
  return { state: state as AudioContextState, resume: vi.fn(resume) } as never
}

describe('startAudio', () => {
  it('asks a suspended context to start', () => {
    const ctx = context('suspended')
    startAudio(ctx)
    expect(ctx.resume).toHaveBeenCalledTimes(1)
  })

  it('asks an interrupted context too — the state a phone leaves it in after a call', () => {
    const ctx = context('interrupted')
    startAudio(ctx)
    expect(ctx.resume).toHaveBeenCalledTimes(1)
  })

  it('leaves a running or closed context alone, and takes "no context yet"', () => {
    const running = context('running')
    const closed = context('closed')
    startAudio(running)
    startAudio(closed)
    startAudio(null)
    startAudio(undefined)
    expect(running.resume).not.toHaveBeenCalled()
    expect(closed.resume).not.toHaveBeenCalled()
  })

  it('a refusal is not an error: neither a rejection nor a throw escapes', async () => {
    const rejected = context('suspended', () => Promise.reject(new Error('not allowed')))
    const thrown = context('suspended', () => {
      throw new Error('cannot resume')
    })
    expect(() => startAudio(rejected)).not.toThrow()
    expect(() => startAudio(thrown)).not.toThrow()
    // an unhandled rejection would fail the run; give it a turn to surface
    await new Promise((r) => setTimeout(r, 0))
  })
})

describe('startAudioOnNextGesture', () => {
  it('asks on each gesture until the context runs, then takes its listeners off', () => {
    const target = new EventTarget() as unknown as Document
    const ctx = context('suspended')
    startAudioOnNextGesture(ctx, target)
    target.dispatchEvent(new Event('pointerdown'))
    expect(ctx.resume).toHaveBeenCalledTimes(1)
    // still suspended (the browser refused): the next gesture asks again
    target.dispatchEvent(new Event('keydown'))
    expect(ctx.resume).toHaveBeenCalledTimes(2)
    ctx.state = 'running'
    target.dispatchEvent(new Event('touchend'))
    target.dispatchEvent(new Event('pointerdown'))
    expect(ctx.resume).toHaveBeenCalledTimes(2)
    // and it does not come back if the context is suspended again later
    ctx.state = 'suspended'
    target.dispatchEvent(new Event('pointerdown'))
    expect(ctx.resume).toHaveBeenCalledTimes(2)
  })

  it('the returned function takes the listeners off early', () => {
    const target = new EventTarget() as unknown as Document
    const ctx = context('suspended')
    const off = startAudioOnNextGesture(ctx, target)
    off()
    target.dispatchEvent(new Event('pointerdown'))
    expect(ctx.resume).not.toHaveBeenCalled()
  })

  it('something that is not a gesture does not ask', () => {
    const target = new EventTarget() as unknown as Document
    const ctx = context('suspended')
    startAudioOnNextGesture(ctx, target)
    target.dispatchEvent(new Event('scroll'))
    target.dispatchEvent(new Event('mousemove'))
    expect(ctx.resume).not.toHaveBeenCalled()
  })
})

describe('declarePlayback', () => {
  it('says "playback" where the browser offers an audio session', () => {
    const nav = { audioSession: { type: 'auto' } }
    declarePlayback(nav)
    expect(nav.audioSession.type).toBe('playback')
  })

  it('leaves a browser without one alone, and survives a session that refuses', () => {
    expect(() => declarePlayback({})).not.toThrow()
    expect(() => declarePlayback(undefined)).not.toThrow()
    const refusing = {
      audioSession: Object.defineProperty({}, 'type', {
        get: () => 'auto',
        set: () => {
          throw new Error('read-only')
        },
      }) as { type?: string },
    }
    expect(() => declarePlayback(refusing)).not.toThrow()
  })
})
