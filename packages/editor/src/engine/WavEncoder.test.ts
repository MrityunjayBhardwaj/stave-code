// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { WavEncoder } from './WavEncoder'

describe('WavEncoder', () => {
  it('produces a valid RIFF WAV header', () => {
    const sampleRate = 44100
    const numSamples = 4410 // 0.1s of silence
    const L = new Float32Array(numSamples)
    const R = new Float32Array(numSamples)

    const blob = WavEncoder.encodeChunks([L], [R], sampleRate)

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

    const blob = WavEncoder.encode(fakeBuffer)
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

    expect(() => WavEncoder.encode(fakeBuffer)).not.toThrow()
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
