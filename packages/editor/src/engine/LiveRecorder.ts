import { WavEncoder } from './WavEncoder'

/**
 * Real-time audio capture via ScriptProcessorNode.
 * Records exactly what the user hears — useful when live tweaks during playback
 * need to be captured rather than re-rendered.
 *
 * Note: ScriptProcessorNode is deprecated but remains the most reliable cross-browser
 * option for in-browser audio capture without MediaRecorder latency issues.
 */
export class LiveRecorder {
  static capture(
    analyser: AnalyserNode,
    ctx: AudioContext,
    duration: number
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

      setTimeout(() => {
        processor.disconnect()
        try {
          analyser.disconnect(processor)
        } catch {
          // May already be disconnected
        }
        resolve(WavEncoder.encodeChunks(chunksL, chunksR, ctx.sampleRate))
      }, duration * 1000)
    })
  }
}
