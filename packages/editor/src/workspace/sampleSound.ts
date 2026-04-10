/**
 * sampleSound — test audio source for viz development.
 *
 * A self-contained sawtooth oscillator with an LFO-modulated pitch that
 * feeds an `AnalyserNode`, whose payload is published to the
 * `workspaceAudioBus` under the fixed source id `__sample__`. Lets the
 * user pick "Sample sound" in a viz tab's source dropdown and see their
 * shader or sketch react to a predictable waveform without needing to
 * play a real pattern first.
 *
 * @remarks
 * ## Design
 *
 * The sample sound is a **singleton** — one shared `AudioContext`,
 * `OscillatorNode`, `LFO`, `GainNode`, and `AnalyserNode`. Multiple viz
 * previews pinning to `__sample__` all see the same FFT data, which is
 * what you want for "test the viz with a known-stable audio source."
 *
 * ## Why an LFO-modulated sawtooth, specifically
 *
 * A pure sine at one frequency produces a single FFT spike that doesn't
 * move — the viz looks dead. A sawtooth produces a rich harmonic series
 * (multiple bins lit up), and modulating its frequency with a slow LFO
 * makes those bins shift over time. The result is a visibly animated
 * FFT without needing a complex score.
 *
 * ## Audibility
 *
 * The output routes to `ctx.destination` with a low gain (0.05) so the
 * user can actually HEAR the test audio. Most viz developers want to
 * hear what they're visualizing — muting it would require the user to
 * trust that audio is "there" purely on visual evidence. Setting a
 * low gain keeps it audible without being annoying.
 *
 * ## Lifecycle (user-driven)
 *
 *   - `start()` — lazy-initializes the AudioContext on first call. No-op
 *     if already playing. Must be called from a user gesture (click
 *     handler) per browser autoplay policy.
 *   - `stop()` — disconnects nodes, unpublishes from the bus, closes
 *     the context. Called when the user selects a different source.
 *   - `isPlaying()` — query for UI state.
 *
 * ## Bus payload shape
 *
 * Publishes an `AudioPayload` with:
 *   - `analyser` — live FFT data from the oscillator
 *   - `audio: { analyser, audioCtx }` — nested component shape for
 *     consumers that read from `payload.audio`
 *   - No `hapStream`, no `scheduler`, no `inlineViz` — the sample sound
 *     is not a pattern runtime. Viz providers that require streaming
 *     or queryable will fall back to demo mode when pinned here.
 *
 * ## Identity guard interaction (D-01)
 *
 * The bus's identity guard (`payloadsEquivalent` in `WorkspaceAudioBus`)
 * treats same-ref publishes as no-ops. We publish ONCE on `start()`
 * with a stable payload — the live FFT data updates happen inside the
 * analyser node, not via re-publishing. Consumers read `analyser`
 * directly per-frame, so the bus doesn't need to know about the
 * changing FFT bins.
 */

import { workspaceAudioBus } from './WorkspaceAudioBus'
import type { AudioPayload } from './types'

/** Fixed source id the sample sound publishes under on the workspace bus. */
export const SAMPLE_SOUND_SOURCE_ID = '__sample__'

/** Human-readable label for the audio source dropdown. */
export const SAMPLE_SOUND_LABEL = 'Sample sound (test audio)'

interface SampleSoundState {
  ctx: AudioContext
  osc: OscillatorNode
  lfo: OscillatorNode
  lfoGain: GainNode
  outGain: GainNode
  analyser: AnalyserNode
}

let state: SampleSoundState | null = null

/**
 * Start the sample sound. Lazy-initializes the AudioContext, oscillator
 * graph, and analyser on first call. Publishes a payload to the bus
 * under `SAMPLE_SOUND_SOURCE_ID` so any preview pinned to that id sees
 * live FFT data immediately. Safe to call multiple times — second and
 * later calls are no-ops.
 *
 * MUST be called from inside a user gesture handler. Browsers reject
 * `new AudioContext()` outside of click/touch/keydown handlers under
 * the autoplay policy, so tests and UI code should only invoke this
 * in response to a button press.
 */
export function startSampleSound(): void {
  if (state) return // already running

  const ctx = new AudioContext()

  // Main oscillator — sawtooth at A2 (110 Hz). The rich harmonic
  // content gives the analyser something to show across multiple bins.
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.value = 110

  // LFO — slow sine sweep that modulates the main oscillator's
  // frequency by ±80 Hz at 0.5 Hz. Produces a visible "slide" in the
  // FFT bins over a 2-second period.
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 0.5

  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 80 // ±80 Hz swing around the base frequency
  lfo.connect(lfoGain)
  lfoGain.connect(osc.frequency)

  // Output gain — low enough to not be annoying, high enough to be
  // audibly present. The user is testing their viz; hearing the
  // test audio is part of the point.
  const outGain = ctx.createGain()
  outGain.gain.value = 0.05

  // Analyser — the live FFT source the viz reads from. fftSize of
  // 2048 gives 1024 frequency bins which is plenty for any shader
  // or sketch that samples a handful of bands.
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.8

  // Graph: osc → outGain → destination (audible) AND osc → analyser.
  // Routing osc directly into the analyser (instead of tapping the
  // outGain) gives cleaner FFT data unaffected by the output gain.
  osc.connect(outGain)
  outGain.connect(ctx.destination)
  osc.connect(analyser)

  osc.start()
  lfo.start()

  state = { ctx, osc, lfo, lfoGain, outGain, analyser }

  // Publish to the bus. The analyser node reference is live — consumers
  // read its FFT data per-frame without needing a re-publish.
  const payload: AudioPayload = {
    analyser,
    audio: {
      analyser,
      audioCtx: ctx,
    },
  }
  workspaceAudioBus.publish(SAMPLE_SOUND_SOURCE_ID, payload)
}

/**
 * Stop the sample sound. Disconnects the oscillator graph, unpublishes
 * from the bus, and closes the AudioContext. No-op if not running.
 * Consumers pinned to `__sample__` receive `null` on their next bus
 * callback and fall back to demo mode.
 */
export function stopSampleSound(): void {
  if (!state) return
  try {
    state.osc.stop()
    state.lfo.stop()
  } catch {
    // osc.stop() throws if already stopped — non-fatal during teardown.
  }
  try {
    state.osc.disconnect()
    state.lfo.disconnect()
    state.lfoGain.disconnect()
    state.outGain.disconnect()
    state.analyser.disconnect()
  } catch {
    // disconnect() throws if already disconnected — non-fatal.
  }
  workspaceAudioBus.unpublish(SAMPLE_SOUND_SOURCE_ID)
  try {
    void state.ctx.close()
  } catch {
    // close() rejects if already closed — non-fatal.
  }
  state = null
}

/** Query whether the sample sound is currently running. */
export function isSampleSoundPlaying(): boolean {
  return state !== null
}
