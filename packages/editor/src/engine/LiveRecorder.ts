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
   *
   * ⚠ THE LENGTH IS COUNTED IN FRAMES, NOT MEASURED BY THE CLOCK (#1401).
   * `ScriptProcessorNode` delivers audio in fixed 4096-frame blocks, so ending
   * the take when a timer fires kept only the whole blocks that had arrived by
   * then and silently truncated the rest: the file came back short by
   * `(duration * sampleRate) mod 4096` frames — up to 93ms at 44.1kHz, at ANY
   * length. Measured before the fix: 4s→3.9938s, 8s→7.9877s, 16s→15.9753s,
   * every one landing on an exact block boundary.
   *
   * The loss was small but it was not harmless: it is one frame-boundary short
   * of the length the caller asked for, so a bounce could not be trusted to be
   * its own stated duration, and anything reassembling sections would drift.
   * ⚠ It was also invisible on hardware running at 48kHz, where a 32s take
   * divides into exactly 375 blocks and nothing is lost — the same code is
   * correct or wrong depending on the sample rate of the audio device.
   *
   * So the block counter is now what ends the take and the timer is only a
   * BACKSTOP: if the graph stalls and blocks stop arriving, the timer still
   * resolves with whatever exists rather than hanging forever.
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

      // Exactly what the caller asked for, in frames. `round` rather than
      // `floor` so a duration that lands between frames is not itself a source
      // of shortfall.
      const wantedFrames = Math.round(duration * ctx.sampleRate)
      let capturedFrames = 0

      processor.onaudioprocess = (e) => {
        chunksL.push(new Float32Array(e.inputBuffer.getChannelData(0)))
        chunksR.push(new Float32Array(e.inputBuffer.getChannelData(1)))
        // Pass through to speakers — recording doesn't interrupt playback
        e.outputBuffer.getChannelData(0).set(e.inputBuffer.getChannelData(0))
        e.outputBuffer.getChannelData(1).set(e.inputBuffer.getChannelData(1))

        capturedFrames += e.inputBuffer.length
        // Ends the take on the first block that REACHES the target, so the
        // final block overshoots and `finish` trims it back. Overshoot-then-trim
        // is what makes the result exact; stopping on the last block that fits
        // is the truncation this replaced.
        if (capturedFrames >= wantedFrames) finish()
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
        // Trim only when the target was actually reached. An abort resolves
        // with everything captured so far — a cancelled bounce is legitimately
        // shorter, and truncating it to a length it never had would be a lie.
        if (capturedFrames >= wantedFrames) {
          trimToFrames(chunksL, wantedFrames)
          trimToFrames(chunksR, wantedFrames)
        }
        resolve(WavEncoder.encodeChunks(chunksL, chunksR, ctx.sampleRate))
      }

      // ⚠ The backstop must fire LATER than the frame counter can, or it wins
      // every time and re-introduces the truncation. Collecting N frames of
      // real-time audio takes slightly MORE than N/sampleRate seconds — the
      // final block only completes after the target instant — so a timer set to
      // exactly `duration` always cuts the take one block short. Measured while
      // fixing this: with the timer at 4000ms, a 4s take came back as 42 blocks
      // (3.9010s), WORSE than the 43 it managed before the counter existed.
      //
      // Two seconds of grace is far longer than the sub-100ms overshoot the
      // counter needs, and short enough to stay a usable stall timeout.
      const timer = setTimeout(finish, duration * 1000 + 2000)

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

/**
 * Cut a chunk list down to exactly `frames` frames, in place.
 *
 * Only the final chunk is ever partial, so this drops whole chunks past the
 * boundary and slices the one that straddles it. Mutates rather than rebuilding
 * because the caller is holding megabytes of Float32 and is about to encode
 * them; a copy here would double the peak for no benefit.
 */
function trimToFrames(chunks: Float32Array[], frames: number): void {
  let total = 0
  for (let i = 0; i < chunks.length; i++) {
    if (total + chunks[i].length <= frames) {
      total += chunks[i].length
      continue
    }
    // This chunk crosses the boundary: keep its head, drop everything after.
    chunks[i] = chunks[i].subarray(0, frames - total)
    chunks.length = i + 1
    return
  }
}
