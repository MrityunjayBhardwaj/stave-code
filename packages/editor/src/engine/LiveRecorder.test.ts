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

/**
 * #1402 — a take that recorded nothing is not a successful bounce.
 *
 * The fake pumps at a constant amplitude, so `pump(0)` is exactly the shape the
 * real recorder sees when it taps a graph that is not sounding: full-length
 * buffers of zeros, arriving on schedule, with nothing wrong anywhere.
 *
 * ⚠ THESE TAKES END ON THE BACKSTOP TIMER, NOT THE FRAME COUNTER — see #1408.
 * The fake's `inputBuffer` has no `length`, so `capturedFrames` is NaN and the
 * counter can never fire. That does not weaken what these arms prove: the
 * hazard is a throw raised OFF the promise's own call stack, and `setTimeout`
 * is as off-stack as `onaudioprocess`. It does mean each one waits out the two
 * second backstop, which #1408 would also remove.
 */
describe('LiveRecorder silence (#1402)', () => {
  it('rejects a take that captured only silence, instead of resolving with it', async () => {
    const fake = makeFake()
    // The throw happens inside the recorder's `finish`, which runs from a
    // timer — not from the promise executor. Without the try/catch that routes
    // it to `reject`, it would escape as an unhandled error and leave this
    // promise pending forever, so a silent bounce would become a HUNG one.
    // This arm would then time out rather than pass.
    const capture = LiveRecorder.capture(fake.analyser, fake.ctx, 0.01)

    fake.pump(0)

    await expect(capture).rejects.toThrow(/silent/i)
  })

  it('still disconnects the processor when it rejects', async () => {
    const fake = makeFake()
    const capture = LiveRecorder.capture(fake.analyser, fake.ctx, 0.01)

    fake.pump(0)

    await expect(capture).rejects.toThrow()
    // A refused take must not leave the graph wired to a dead recorder.
    expect(fake.disconnects()).toBe(1)
  })

  it('keeps a CANCELLED silent take, because that silence is the honest answer', async () => {
    const fake = makeFake()
    const controller = new AbortController()
    const capture = LiveRecorder.capture(fake.analyser, fake.ctx, 60, controller.signal)

    fake.pump(0)
    controller.abort()

    // A user who pressed Stop gets what the take managed to collect. The guard
    // is for a bounce that believed it was recording, not for a cancellation.
    expect(await frameCount(await capture)).toBe(BUFFER)
  })
})
