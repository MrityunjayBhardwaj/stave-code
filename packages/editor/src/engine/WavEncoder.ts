/**
 * Pure TypeScript RIFF WAV encoder.
 * No dependencies — works in any browser or Node.js environment.
 * Encodes stereo Float32 PCM into a standard 16-bit WAV Blob.
 */
export class WavEncoder {
  /**
   * Encode an AudioBuffer (e.g. from OfflineAudioContext) into a WAV Blob.
   */
  static encode(buffer: AudioBuffer): Blob {
    const L = buffer.getChannelData(0)
    const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L
    return this.encodeChunks([L], [R], buffer.sampleRate)
  }

  /**
   * Encode interleaved stereo chunks (e.g. from ScriptProcessorNode) into a WAV Blob.
   * Samples are clamped to [-1, 1] then converted to 16-bit signed integers.
   */
  static encodeChunks(
    chunksL: Float32Array[],
    chunksR: Float32Array[],
    sampleRate: number
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

    // Interleaved PCM samples
    let offset = 44
    for (let chunk = 0; chunk < chunksL.length; chunk++) {
      const l = chunksL[chunk]
      const r = chunksR[chunk] ?? l
      for (let i = 0; i < l.length; i++) {
        view.setInt16(offset, floatToInt16(l[i]), true)
        offset += 2
        view.setInt16(offset, floatToInt16(r[i]), true)
        offset += 2
      }
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
