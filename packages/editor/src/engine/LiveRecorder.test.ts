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

/**
 * `sampleRate` is a parameter rather than a constant because the recorder's
 * frame arithmetic is only correct or incorrect RELATIVE to it — a take that
 * divides evenly into blocks at one rate does not at another, which is how
 * #1401 stayed invisible on one machine and broke on another.
 */
function makeFake(sampleRate: number = SAMPLE_RATE): Fake {
  let onProcess: ((e: unknown) => void) | null = null
  let disconnects = 0

  const processor = {
    set onaudioprocess(fn: (e: unknown) => void) { onProcess = fn },
    connect() {},
    disconnect() { disconnects++ },
  }
  const ctx = {
    sampleRate,
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
        // ⚠ `length` IS LOAD-BEARING (#1408). A real `AudioProcessingEvent`
        // carries an `AudioBuffer`, which has it, and the recorder counts
        // frames with it. Omitted, `capturedFrames` becomes NaN on the first
        // block, `NaN >= wantedFrames` is permanently false, and the frame
        // counter NEVER ends a take — so every arm below silently fell through
        // to the two-second backstop and the mechanism #1401 added was never
        // once exercised. Measured: capture(0.01s) took 2013ms without this
        // field and 0ms with it.
        inputBuffer: { length: BUFFER, getChannelData: (i: number) => (i === 0 ? inL : inR) },
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
    // ⚠ THE DURATION IS CHOSEN SO THE TIMER REALLY IS WHAT ENDS THIS (#1408).
    // 0.1s at 48kHz wants 4800 frames and only one 4096-frame block arrives, so
    // the counter cannot fire and the backstop is genuinely the thing under
    // test. It used to ask for 0.01s — 480 frames, which one block passes twice
    // over — and passed only because the counter was broken. An arm whose name
    // is true only while a bug exists is not pinning what it claims to.
    const capture = LiveRecorder.capture(fake.analyser, fake.ctx, 0.1)

    fake.pump(0.5)

    // Not trimmed: the take never reached its target, so what arrived is what
    // there is.
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
 * ⚠ THESE NOW END ON THE FRAME COUNTER, WHICH IS THE STRONGER PLACE FOR THEM
 * (#1408). They previously fell through to the backstop timer, because the fake
 * did not model `inputBuffer.length`. Either way the hazard they pin is the
 * same — a throw raised OFF the promise's own call stack — but the throw now
 * comes from `onaudioprocess`, which is where a real silent take raises it, and
 * each arm returns immediately instead of waiting out two seconds.
 */
describe('LiveRecorder silence (#1402)', () => {
  it('rejects a take that captured only silence, instead of resolving with it', async () => {
    const fake = makeFake()
    // The throw happens inside the recorder's `finish`, which runs from
    // `onaudioprocess` — not from the promise executor. Without the try/catch
    // that routes it to `reject`, it would escape as an unhandled error and
    // leave this promise pending forever, so a silent bounce would become a
    // HUNG one. This arm would then time out rather than pass.
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

/**
 * #1408 — the frame counter, which #1401 added and nothing at this level had
 * ever run.
 *
 * `ScriptProcessorNode` delivers audio in fixed 4096-frame blocks. Ending a
 * take on a timer kept only the whole blocks that had arrived and lost the
 * remainder — `(duration * sampleRate) mod 4096` frames, up to 93ms at 44.1kHz,
 * at ANY length. The fix ends the take on the first block that REACHES the
 * target and trims the overshoot back.
 *
 * ⚠ EVERY DURATION HERE IS CHOSEN NOT TO DIVIDE BY THE BLOCK SIZE, which is
 * the lesson #1401 paid for: a duration that lands on a block boundary passes
 * even against the bug, and that is exactly why the defect was invisible at
 * 48kHz and fatal at 44.1kHz.
 */
describe('LiveRecorder frame counting (#1408)', () => {
  // 0.2s at 48kHz = 9600 frames = 2.34 blocks. The remainder exists to be lost.
  const DURATION = 0.2
  const WANTED = DURATION * SAMPLE_RATE

  it('trims the overshooting block back to exactly the frames asked for', async () => {
    const fake = makeFake()
    const capture = LiveRecorder.capture(fake.analyser, fake.ctx, DURATION)

    fake.pump(0.5)
    fake.pump(0.5)
    fake.pump(0.5) // 12288 frames captured, 9600 wanted

    // EXACT, not a tolerance. "As long as it said it would be" is the promise,
    // and a tolerance would re-admit the truncation this exists to catch.
    expect(await frameCount(await capture)).toBe(WANTED)
  })

  it('does NOT end on the last block that fits — that IS the truncation', async () => {
    const fake = makeFake()
    const capture = LiveRecorder.capture(fake.analyser, fake.ctx, DURATION)

    fake.pump(0.5)
    fake.pump(0.5) // 8192 frames: short of 9600, so the take must still be open

    // Racing a sentinel is how "still pending" gets asserted without waiting
    // out the backstop. Stopping here would return 8192 — one block short of
    // the target and precisely the old behaviour.
    const sentinel = Promise.resolve('PENDING')
    expect(await Promise.race([capture.then(() => 'ENDED'), sentinel])).toBe('PENDING')

    fake.pump(0.5)
    expect(await frameCount(await capture)).toBe(WANTED)
  })

  it('ends on the counter rather than the backstop, so it returns immediately', async () => {
    const fake = makeFake()
    const started = Date.now()
    const capture = LiveRecorder.capture(fake.analyser, fake.ctx, DURATION)

    fake.pump(0.5)
    fake.pump(0.5)
    fake.pump(0.5)
    await capture

    // The backstop sits at duration + 2000ms. Anything near that means the
    // counter never fired and the timer ended the take — which is the failure
    // this whole entry is about, and it is silent in every other assertion.
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('counts frames the same way at 44.1kHz, where the remainder is largest', async () => {
    // The same code was correct or wrong depending on the audio device: at
    // 48kHz a 32s take is exactly 375 blocks and nothing is lost; at 44.1kHz it
    // is not. Pinning a second rate is what stops that asymmetry hiding again.
    const fake = makeFake(44100)
    const wanted = Math.round(0.2 * 44100) // 8820 frames = 2.15 blocks
    const capture = LiveRecorder.capture(fake.analyser, fake.ctx, 0.2)

    fake.pump(0.5)
    fake.pump(0.5)
    fake.pump(0.5)

    expect(await frameCount(await capture)).toBe(wanted)
  })
})
