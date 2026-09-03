// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { WavEncoder, SilentCaptureError } from './WavEncoder'

describe('WavEncoder', () => {
  it('produces a valid RIFF WAV header', () => {
    const sampleRate = 44100
    const numSamples = 4410 // 0.1s of silence
    const L = new Float32Array(numSamples)
    const R = new Float32Array(numSamples)

    // Silence is deliberate here — this arm is about the header, not the audio.
    const blob = WavEncoder.encodeChunks([L], [R], sampleRate, { allowSilence: true })

    expect(blob.type).toBe('audio/wav')

    return blob.arrayBuffer().then((buf) => {
      const view = new DataView(buf)

      // RIFF header
      const riff = String.fromCharCode(
        view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)
      )
      expect(riff).toBe('RIFF')

      // WAVE marker
      const wave = String.fromCharCode(
        view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)
      )
      expect(wave).toBe('WAVE')

      // fmt chunk
      const fmt = String.fromCharCode(
        view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15)
      )
      expect(fmt).toBe('fmt ')

      // PCM format = 1
      expect(view.getUint16(20, true)).toBe(1)
      // Channels = 2
      expect(view.getUint16(22, true)).toBe(2)
      // Sample rate
      expect(view.getUint32(24, true)).toBe(sampleRate)
      // Bits per sample = 16
      expect(view.getUint16(34, true)).toBe(16)

      // data chunk
      const data = String.fromCharCode(
        view.getUint8(36), view.getUint8(37), view.getUint8(38), view.getUint8(39)
      )
      expect(data).toBe('data')

      // data size = numSamples * 2 channels * 2 bytes
      expect(view.getUint32(40, true)).toBe(numSamples * 2 * 2)

      // Total blob size = 44 (header) + data
      expect(buf.byteLength).toBe(44 + numSamples * 4)
    })
  })

  it('clamps samples outside [-1, 1] without throwing', () => {
    const L = new Float32Array([2.0, -3.0, 0.5])
    const R = new Float32Array([1.5, -1.5, 0.0])

    expect(() => WavEncoder.encodeChunks([L], [R], 44100)).not.toThrow()
  })

  it('encodes AudioBuffer via encode()', () => {
    const sampleRate = 48000
    const length = 480

    // Minimal AudioBuffer stub
    const fakeBuffer = {
      numberOfChannels: 2,
      sampleRate,
      getChannelData: (ch: number) => new Float32Array(length),
    } as unknown as AudioBuffer

    const blob = WavEncoder.encode(fakeBuffer, { allowSilence: true })
    expect(blob.type).toBe('audio/wav')

    return blob.arrayBuffer().then((buf) => {
      expect(buf.byteLength).toBe(44 + length * 4)
    })
  })

  it('falls back to mono (L repeated) when single channel', () => {
    const sampleRate = 44100
    const length = 100
    const fakeBuffer = {
      numberOfChannels: 1,
      sampleRate,
      getChannelData: (_ch: number) => new Float32Array(length),
    } as unknown as AudioBuffer

    expect(() => WavEncoder.encode(fakeBuffer, { allowSilence: true })).not.toThrow()
  })

  it('handles multiple chunks correctly', () => {
    const sampleRate = 44100
    const chunk1L = new Float32Array([0.1, 0.2])
    const chunk2L = new Float32Array([0.3, 0.4])
    const chunk1R = new Float32Array([0.1, 0.2])
    const chunk2R = new Float32Array([0.3, 0.4])

    const blob = WavEncoder.encodeChunks([chunk1L, chunk2L], [chunk1R, chunk2R], sampleRate)

    return blob.arrayBuffer().then((buf) => {
      // 4 total samples * 2 channels * 2 bytes = 16 bytes data + 44 header
      expect(buf.byteLength).toBe(44 + 4 * 4)
    })
  })
})

/**
 * #1402 — the capture boundary refuses to hand back silence as a success.
 *
 * Four bugs shared one signature: a valid, full-length WAV that plays as
 * nothing, returned with no error (`LiveRecorder` with playback stopped, #1353,
 * #1400, #1395). `LiveRecorder`'s header already prescribed the cure and
 * addressed it to "callers", of which there are four, and all four declined.
 * These arms pin the rule where the bytes are instead.
 */
describe('WavEncoder silence guard (#1402)', () => {
  it('refuses to encode a capture that is entirely silent', () => {
    const L = new Float32Array(4410)
    const R = new Float32Array(4410)

    expect(() => WavEncoder.encodeChunks([L], [R], 44100)).toThrow(
      /silent/i,
    )
  })

  it('names the peak it measured, so the refusal is diagnosable', () => {
    const L = new Float32Array(64)
    const R = new Float32Array(64)

    expect(() => WavEncoder.encodeChunks([L], [R], 44100)).toThrow(/peak/i)
  })

  it('refuses a capture whose peak is below one 16-bit step, because that IS silence', () => {
    // Every sample here truncates to int16 0, so the encoded file is literally
    // all zeros. The bound is the FORMAT's quantisation step, not a level
    // calibrated against any audio device — which is what keeps it from being
    // another absolute threshold that reports the sound card.
    const belowOneStep = 1 / 65536
    const L = new Float32Array(64).fill(belowOneStep)
    const R = new Float32Array(64).fill(belowOneStep)

    expect(() => WavEncoder.encodeChunks([L], [R], 44100)).toThrow(/silent/i)
  })

  it('encodes a capture that is barely audible — quiet is not silent', () => {
    // Two steps: comfortably clear of the bound in both signs. A bounce that
    // is merely QUIET is a valid bounce, and the guard must never be turned
    // into a loudness threshold.
    const L = new Float32Array(64).fill(2 / 32768)
    const R = new Float32Array(64).fill(-2 / 32768)

    expect(() => WavEncoder.encodeChunks([L], [R], 44100)).not.toThrow()
  })

  it('errs toward accepting, never toward refusing, in the one-step grey band', () => {
    // `floatToInt16` scales by 0x7fff upward and 0x8000 downward, so the two
    // signs do not quantise symmetrically. Measured:
    //   +1/32768 -> int16  0   (encodes to silence, yet clears the bound)
    //   -1/32768 -> int16 -1   (survives)
    // A take sitting exactly on the bound therefore passes even though a
    // positive-only one encodes to zeros. Pinned deliberately: the guard is
    // built to never refuse a file that has audio, and this is the price.
    const onBound = new Float32Array(64).fill(1 / 32768)

    expect(() =>
      WavEncoder.encodeChunks([onBound], [onBound], 44100),
    ).not.toThrow()
  })

  it('encodes silence when the caller says the silence is intended', () => {
    const L = new Float32Array(4410)
    const R = new Float32Array(4410)

    const blob = WavEncoder.encodeChunks([L], [R], 44100, { allowSilence: true })
    expect(blob.type).toBe('audio/wav')
  })

  it('refuses a silent AudioBuffer through encode() too', () => {
    const fakeBuffer = {
      numberOfChannels: 2,
      sampleRate: 48000,
      getChannelData: () => new Float32Array(480),
    } as unknown as AudioBuffer

    expect(() => WavEncoder.encode(fakeBuffer)).toThrow(/silent/i)
  })

  it('refuses an EMPTY capture — nothing recorded is not a successful bounce', () => {
    expect(() => WavEncoder.encodeChunks([], [], 44100)).toThrow(/silent/i)
  })
})

describe('WavEncoder — the refused take rides on the refusal (#1410)', () => {
  /**
   * The guard is right by default and was, until now, absolute: a document that
   * is MEANT to be silent had no way to be bounced at all. These arms pin the
   * escape — the refusal carries the finished WAV, so keeping it deliberately
   * costs a click instead of a re-record.
   *
   * ⚠ The one that matters is the EQUIVALENCE arm. "Save it anyway" is only
   * honest if it hands over exactly the file a permitted encode would have
   * written; a refusal that carried a truncated or differently-headed take
   * would be worse than no escape at all.
   */
  const SR = 44100
  const silent = (n = 512) => [new Float32Array(n)]

  it('attaches the encoded take to the error', () => {
    let err: unknown
    try {
      WavEncoder.encodeChunks(silent(), silent(), SR)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(SilentCaptureError)
    const refused = (err as SilentCaptureError).refused
    expect(refused).toBeInstanceOf(Blob)
    expect(refused.type).toBe('audio/wav')
    expect(refused.size).toBeGreaterThan(44) // header + at least some samples
  })

  it('the refused take is BYTE-IDENTICAL to what allowSilence returns', async () => {
    // ⚠ THE LOAD-BEARING ARM. If these ever diverge, "save it anyway" is
    // handing the user a different file from the one they asked for.
    let refused: Blob | null = null
    try {
      WavEncoder.encodeChunks(silent(), silent(), SR)
    } catch (e) {
      refused = (e as SilentCaptureError).refused
    }
    const permitted = WavEncoder.encodeChunks(silent(), silent(), SR, {
      allowSilence: true,
    })
    expect(refused).not.toBeNull()
    expect(refused!.size).toBe(permitted.size)
    const a = new Uint8Array(await refused!.arrayBuffer())
    const b = new Uint8Array(await permitted.arrayBuffer())
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('the refused take is a COMPLETE WAV — full length, not truncated at the throw', async () => {
    const FRAMES = 1024
    let refused: Blob | null = null
    try {
      WavEncoder.encodeChunks([new Float32Array(FRAMES)], [new Float32Array(FRAMES)], SR)
    } catch (e) {
      refused = (e as SilentCaptureError).refused
    }
    // 44-byte RIFF header + 2 channels × 2 bytes × frames.
    expect(refused!.size).toBe(44 + FRAMES * 2 * 2)
    const head = new Uint8Array(await refused!.arrayBuffer()).subarray(0, 4)
    expect(String.fromCharCode(...head)).toBe('RIFF')
  })

  it('still REFUSES by default — the take is reachable, not returned', () => {
    // The escape must not become the behaviour. A caller that does nothing
    // special still gets a throw and no bytes back.
    expect(() => WavEncoder.encodeChunks(silent(), silent(), SR)).toThrow(/silent/i)
  })

  it('reports the peak and frame count alongside the take', () => {
    let err: SilentCaptureError | null = null
    try {
      WavEncoder.encodeChunks(silent(256), silent(256), SR)
    } catch (e) {
      err = e as SilentCaptureError
    }
    expect(err!.peak).toBe(0)
    expect(err!.frames).toBe(256)
  })
})
