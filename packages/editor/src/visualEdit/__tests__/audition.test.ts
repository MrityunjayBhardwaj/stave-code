import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the audio boundary so the test asserts WIRING (what superdough is called
// with), not real sound. getAudioContext returns a stub with a currentTime and
// a resume spy; superdough is a spy that resolves.
const superdough = vi.fn(() => Promise.resolve())
const getAudioContext = vi.fn(() => ({ currentTime: 10, resume: vi.fn() }))

vi.mock('@strudel/webaudio', () => ({
  superdough: (...args: unknown[]) => superdough(...args),
  getAudioContext: () => getAudioContext(),
}))

import { auditionSound, AUDITION_ENVELOPE, AUDITION_DUR_S } from '../audition'

describe('auditionSound', () => {
  beforeEach(() => {
    superdough.mockClear()
    getAudioContext.mockClear()
  })

  it('triggers superdough with the sound as `s` and a default mid-register note', () => {
    auditionSound('piano')
    expect(superdough).toHaveBeenCalledTimes(1)
    const [value, t] = superdough.mock.calls[0] as [Record<string, unknown>, number]
    expect(value.s).toBe('piano')
    expect(value.note).toBe('c4')
    expect(value.sustain).toBeGreaterThan(0) // rings out, not the synth pluck default
    expect(t).toBeGreaterThan(10) // absolute onset just ahead of ctx.currentTime
  })

  it('triggers with the SHARED audition envelope + duration (#816 — matches a pianoroll key press)', () => {
    // The whole point of AUDITION_ENVELOPE / AUDITION_DUR_S is that a ▶ preview
    // and PianoRollGrid's playMidi trigger the SAME note shape. Lock the emitted
    // value to the shared constants so the two auditions can never drift again.
    auditionSound('piano')
    const [value, , dur] = superdough.mock.calls[0] as [Record<string, unknown>, number, number]
    expect(value.gain).toBe(AUDITION_ENVELOPE.gain)
    expect(value.attack).toBe(AUDITION_ENVELOPE.attack)
    expect(value.sustain).toBe(AUDITION_ENVELOPE.sustain)
    expect(value.release).toBe(AUDITION_ENVELOPE.release)
    expect(dur).toBe(AUDITION_DUR_S)
  })

  it('honours an explicit note', () => {
    auditionSound('gm_cello', 'e3')
    const [value] = superdough.mock.calls[0] as [Record<string, unknown>]
    expect(value.note).toBe('e3')
    expect(value.s).toBe('gm_cello')
  })

  it('no-ops on an empty sound (never triggers audio for the placeholder)', () => {
    auditionSound('')
    expect(superdough).not.toHaveBeenCalled()
  })

  it('never throws if a rejected superdough promise settles later', () => {
    superdough.mockImplementationOnce(() => Promise.reject(new Error('sound not loaded')))
    expect(() => auditionSound('unloaded_sample')).not.toThrow()
  })
})
