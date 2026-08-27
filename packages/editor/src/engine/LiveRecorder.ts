import { WavEncoder } from './WavEncoder'

/**
 * Real-time audio capture via ScriptProcessorNode.
 * Records exactly what the user hears — useful when live tweaks during playback
 * need to be captured rather than re-rendered.
 *
 * Note: ScriptProcessorNode is deprecated but remains the most reliable cross-browser
 * option for in-browser audio capture without MediaRecorder latency issues.
 *
 * ⚠ This taps the master analyser, so it records whatever the graph is playing —
 * including nothing. With playback stopped it resolves with a valid WAV of pure
 * silence and no error, which is the same silent-failure shape the offline
 * renderer has. Callers must guarantee audio is flowing before capturing, and
 * assert the result is non-silent rather than merely non-empty.
 */
export class LiveRecorder {
  /**
   * Capture `duration` seconds of `analyser`'s output as a WAV Blob.
   *
   * Capture is real-time: eight seconds of audio costs eight seconds of wall
   * clock, and holds roughly 11.5 MB of Float32 chunks per minute until the
   * encode. Pass `signal` to stop early — the recorder disconnects and resolves
   * with the audio captured so far, so a cancelled bounce still yields a
   * playable (shorter) file rather than throwing away the take.
   */
  static capture(
    analyser: AnalyserNode,
    ctx: AudioContext,
    duration: number,
    signal?: AbortSignal
  ): Promise<Blob> {
    return new Promise((resolve) => {
      const bufferSize = 4096
      const processor = ctx.createScriptProcessor(bufferSize, 2, 2)
      const chunksL: Float32Array[] = []
      const chunksR: Float32Array[] = []

      processor.onaudioprocess = (e) => {
        chunksL.push(new Float32Array(e.inputBuffer.getChannelData(0)))
        chunksR.push(new Float32Array(e.inputBuffer.getChannelData(1)))
        // Pass through to speakers — recording doesn't interrupt playback
        e.outputBuffer.getChannelData(0).set(e.inputBuffer.getChannelData(0))
        e.outputBuffer.getChannelData(1).set(e.inputBuffer.getChannelData(1))
      }

      analyser.connect(processor)
      processor.connect(ctx.destination)

      // Both the timer and the abort listener route through here. `settled` is
      // a REDUNDANT backstop, not the load-bearing guard: `clearTimeout` closes
      // the timer path and `removeEventListener` closes the abort path, so each
      // already prevents the other's re-entry. Deleting `settled` leaves the
      // suite green — measured, not assumed. It stays because it makes
      // run-once a local property of this function rather than one that emerges
      // from two teardown calls staying correct.
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal?.removeEventListener('abort', finish)
        processor.disconnect()
        try {
          analyser.disconnect(processor)
        } catch {
          // May already be disconnected
        }
        resolve(WavEncoder.encodeChunks(chunksL, chunksR, ctx.sampleRate))
      }

      const timer = setTimeout(finish, duration * 1000)

      if (signal) {
        // An already-aborted signal never fires 'abort', so check it directly.
        // This resolves with zero chunks — an empty WAV, which is the honest
        // answer to "capture nothing".
        if (signal.aborted) finish()
        else signal.addEventListener('abort', finish, { once: true })
      }
    })
  }
}
