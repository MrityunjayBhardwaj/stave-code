/**
 * One 16-bit quantisation step. A sample quieter than this truncates to a
 * 16-bit zero, so a capture whose LOUDEST sample falls below it encodes to a
 * file of literal zeros — which is the only direction this guard needs.
 *
 * ⚠ DELIBERATELY CONSERVATIVE, AND THE CONVERSE DOES NOT HOLD. Positive and
 * negative samples do not scale by the same factor (`floatToInt16` uses 0x7fff
 * one way and 0x8000 the other), so the grey band is one step wide. Measured:
 *
 *     +1/32768 -> int16  0     (encodes to silence, yet clears this bound)
 *     -1/32768 -> int16 -1     (survives)
 *     +1/32767 -> int16  1     (survives)
 *
 * So a take whose peak sits in that single step, positive-only, can still
 * encode to zeros and pass. That is the right way round: this bound never
 * refuses a file that has audio in it, and the width of what it lets through
 * is one part in 32768 of full scale.
 *
 * ⚠ THIS IS DERIVED FROM THE FORMAT, NOT CALIBRATED AGAINST A DEVICE, and the
 * distinction is the whole reason the number is safe to hardcode. Absolute
 * audio thresholds in this codebase have twice turned out to be reporting the
 * sound card rather than the code — a level that read 0.1400 on one machine
 * read 0.30621 on another, and a capture length that divided evenly at 48kHz
 * did not at 44.1kHz. This bound asks only "did any sample survive
 * quantisation", which is a fact about the bytes and identical on every device.
 * Do not turn it into a loudness threshold; a quiet bounce is a valid bounce.
 */
export const SILENCE_FLOOR = 1 / 32768

/** Thrown when a capture path would hand back a well-formed file of silence. */
export class SilentCaptureError extends Error {
  readonly peak: number
  readonly frames: number
  constructor(peak: number, frames: number) {
    super(
      `capture is silent: peak ${peak} over ${frames} frames is below one ` +
        `16-bit step (${SILENCE_FLOOR}), so the encoded file is all zeros. ` +
        `Pass { allowSilence: true } if this silence is intended.`
    )
    this.name = 'SilentCaptureError'
    this.peak = peak
    this.frames = frames
  }
}

export interface EncodeOptions {
  /**
   * Encode silence instead of refusing it. For the cases where an empty or
   * silent result is the honest answer — an aborted take, or a test that is
   * about the header rather than the audio.
   */
  allowSilence?: boolean
}

/**
 * Pure TypeScript RIFF WAV encoder.
 * No dependencies — works in any browser or Node.js environment.
 * Encodes stereo Float32 PCM into a standard 16-bit WAV Blob.
 *
 * ⚠ THIS IS THE CAPTURE BOUNDARY, NOT ONLY AN ENCODER (#1402). Every WAV the
 * live recorder and the offline renderer produce is born in `encodeChunks`, so
 * it is the one place that can answer "did this produce sound?" for all of
 * them. It refuses silence BY DEFAULT rather than reporting it, because the
 * rule used to live in `LiveRecorder`'s header addressed to "callers" — and all
 * four of them declined. An obligation delegated to callers is not an
 * invariant. Four bugs shared the same signature under that arrangement: a
 * valid, full-length WAV that played as nothing, returned with no error.
 *
 * ⚠ ONE CAPTURE PATH DOES NOT COME THROUGH HERE.
 * `StrudelEngine.renderOfflineViaSuperdough` intercepts a Blob that upstream's
 * `renderPatternAudio` already encoded, so this guard cannot see it. It is
 * unwired to any UI today; guarding it needs its own change.
 */
export class WavEncoder {
  /**
   * Encode an AudioBuffer (e.g. from OfflineAudioContext) into a WAV Blob.
   */
  static encode(buffer: AudioBuffer, opts?: EncodeOptions): Blob {
    const L = buffer.getChannelData(0)
    const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L
    return this.encodeChunks([L], [R], buffer.sampleRate, opts)
  }

  /**
   * Encode interleaved stereo chunks (e.g. from ScriptProcessorNode) into a WAV Blob.
   * Samples are clamped to [-1, 1] then converted to 16-bit signed integers.
   *
   * Throws `SilentCaptureError` when nothing in the take survives quantisation,
   * unless `opts.allowSilence` says the silence is intended.
   */
  static encodeChunks(
    chunksL: Float32Array[],
    chunksR: Float32Array[],
    sampleRate: number,
    opts?: EncodeOptions
  ): Blob {
    const totalSamples = chunksL.reduce((n, c) => n + c.length, 0)
    const numChannels = 2
    const bitsPerSample = 16
    const bytesPerSample = bitsPerSample / 8
    const blockAlign = numChannels * bytesPerSample
    const byteRate = sampleRate * blockAlign
    const dataSize = totalSamples * blockAlign
    const bufferSize = 44 + dataSize

    const ab = new ArrayBuffer(bufferSize)
    const view = new DataView(ab)

    // RIFF header
    writeString(view, 0, 'RIFF')
    view.setUint32(4, 36 + dataSize, true)        // file size - 8
    writeString(view, 8, 'WAVE')

    // fmt chunk
    writeString(view, 12, 'fmt ')
    view.setUint32(16, 16, true)                  // chunk size
    view.setUint16(20, 1, true)                   // PCM format
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, byteRate, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, bitsPerSample, true)

    // data chunk
    writeString(view, 36, 'data')
    view.setUint32(40, dataSize, true)

    // Interleaved PCM samples. The peak rides along in this loop rather than
    // needing a pass of its own — every sample is already being visited to be
    // converted, so knowing whether the take made a sound costs nothing.
    let offset = 44
    let peak = 0
    for (let chunk = 0; chunk < chunksL.length; chunk++) {
      const l = chunksL[chunk]
      const r = chunksR[chunk] ?? l
      for (let i = 0; i < l.length; i++) {
        const al = l[i] < 0 ? -l[i] : l[i]
        const ar = r[i] < 0 ? -r[i] : r[i]
        if (al > peak) peak = al
        if (ar > peak) peak = ar
        view.setInt16(offset, floatToInt16(l[i]), true)
        offset += 2
        view.setInt16(offset, floatToInt16(r[i]), true)
        offset += 2
      }
    }

    // Checked AFTER the loop rather than before it because the peak is not
    // known until the samples have been walked, and walking them twice to fail
    // slightly earlier would cost every successful bounce a second pass.
    if (!opts?.allowSilence && peak < SILENCE_FLOOR) {
      throw new SilentCaptureError(peak, totalSamples)
    }

    return new Blob([ab], { type: 'audio/wav' })
  }
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

function floatToInt16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample))
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
}
