// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { LiveRecorder } from './LiveRecorder'

/**
 * #1346 — pins the abort path added so a real-time bounce can be stopped.
 *
 * A bounce is genuinely real-time, so "wait for it to finish" is not an
 * acceptable only-option for a user who picked 60 seconds by mistake. Stop must
 * therefore END the take, and — the part worth asserting — must KEEP what was
 * already captured rather than discarding it.
 *
 * The fake below is the smallest surface `LiveRecorder` actually touches. It
 * drives `onaudioprocess` by hand so a test can decide exactly how many buffers
 * were captured before the abort, which a real AudioContext cannot promise.
 */

const SAMPLE_RATE = 48000
const BUFFER = 4096

interface Fake {
  ctx: AudioContext
  analyser: AnalyserNode
  /** Push one buffer of audio through, at the given constant amplitude. */
  pump(amplitude: number): void
  disconnects(): number
}

function makeFake(): Fake {
  let onProcess: ((e: unknown) => void) | null = null
  let disconnects = 0

  const processor = {
    set onaudioprocess(fn: (e: unknown) => void) { onProcess = fn },
    connect() {},
    disconnect() { disconnects++ },
  }
  const ctx = {
    sampleRate: SAMPLE_RATE,
    destination: {},
    createScriptProcessor: () => processor,
  } as unknown as AudioContext
  const analyser = {
    connect() {},
    disconnect() {},
  } as unknown as AnalyserNode

  return {
    ctx,
    analyser,
    pump(amplitude: number) {
      const chan = () => {
        const a = new Float32Array(BUFFER)
        a.fill(amplitude)
        return a
      }
      const outL = new Float32Array(BUFFER)
      const outR = new Float32Array(BUFFER)
      const inL = chan()
      const inR = chan()
      onProcess?.({
        inputBuffer: { getChannelData: (i: number) => (i === 0 ? inL : inR) },
        outputBuffer: { getChannelData: (i: number) => (i === 0 ? outL : outR) },
      })
    },
    disconnects: () => disconnects,
  }
}

/** Samples in a 16-bit stereo WAV, from its 44-byte header onwards. */
async function frameCount(blob: Blob): Promise<number> {
  return (blob.size - 44) / 4
}

describe('LiveRecorder abort', () => {
  it('keeps the audio captured before the abort', async () => {
    const fake = makeFake()
    const controller = new AbortController()
    // 60s nominal — far longer than the test will wait, so only the abort can
    // end it. If the abort path were broken this assertion would time out
    // rather than pass on the timer.
    const capture = LiveRecorder.capture(fake.analyser, fake.ctx, 60, controller.signal)

    fake.pump(0.5)
    fake.pump(0.5)
    fake.pump(0.5)
    controller.abort()

    expect(await frameCount(await capture)).toBe(BUFFER * 3)
  })

  it('disconnects the processor exactly once when aborted', async () => {
    const fake = makeFake()
    const controller = new AbortController()
    const capture = LiveRecorder.capture(fake.analyser, fake.ctx, 60, controller.signal)

    fake.pump(0.5)
    controller.abort()
    controller.abort() // a second abort must not re-run teardown
    await capture

    expect(fake.disconnects()).toBe(1)
  })

  it('resolves immediately with an empty take when the signal is already aborted', async () => {
    const fake = makeFake()
    const capture = LiveRecorder.capture(
      fake.analyser,
      fake.ctx,
      60,
      AbortSignal.abort(),
    )

    expect(await frameCount(await capture)).toBe(0)
  })

  it('still ends on its own timer when no signal is passed', async () => {
    const fake = makeFake()
    const capture = LiveRecorder.capture(fake.analyser, fake.ctx, 0.01)

    fake.pump(0.5)

    expect(await frameCount(await capture)).toBe(BUFFER)
  })
})
