/**
 * LiveCodingRuntime — unit tests (Phase 10.2 Task 05).
 *
 * Covers the play lifecycle (PK1), BufferedScheduler elevation (S8), error
 * pathways (S7), bus publish/unpublish, dispose ordering, and the
 * `Pattern.prototype` source-grep guard (PV2 / P2 mitigation from PLAN.md
 * §10.2-05 pre-mortem).
 *
 * The engine is mocked with a controllable shape so the runtime's wiring
 * is tested in isolation. Real engines (Strudel, SonicPi) carry too much
 * environment-specific setup (audio context, web workers, CDN imports) to
 * exercise inside a unit test — they're observed end-to-end in Task 10's
 * Lokayata pass.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LiveCodingRuntime, extractBpmFromCode } from '../LiveCodingRuntime'
import {
  workspaceAudioBus,
  __resetWorkspaceAudioBusForTests,
} from '../../WorkspaceAudioBus'
import { HapStream } from '../../../engine/HapStream'
import type {
  EngineComponents,
  LiveCodingEngine,
} from '../../../engine/LiveCodingEngine'
import type { AudioPayload } from '../../types'

// ---------------------------------------------------------------------------
// Mock engine factory — returns a LiveCodingEngine implementation backed by
// vi.fn() spies. The components getter returns whatever the test installs
// via `setComponents`. The engine's lifecycle methods record their call
// order so the test can assert publish-before-play AND evaluate-before-read.
// ---------------------------------------------------------------------------

// Spies are typed loosely so the strict generic on `vi.fn<Params, Return>`
// doesn't fight the LiveCodingEngine signature; the test only ever inspects
// `mock.calls` and `mock.calls.length`, neither of which depends on the
// generic.
type AnySpy = ReturnType<typeof vi.fn>

interface MockEngine extends LiveCodingEngine {
  callLog: string[]
  setComponents(c: Partial<EngineComponents>): void
  setEvalResult(r: { error?: Error }): void
  triggerRuntimeError(err: Error): void
  evaluateCalls: string[]
  initFn: AnySpy
  evaluateFn: AnySpy
  playFn: AnySpy
  stopFn: AnySpy
  disposeFn: AnySpy
}

function createMockEngine(): MockEngine {
  let components: Partial<EngineComponents> = {}
  let evalResult: { error?: Error } = {}
  let runtimeErrorHandler: ((err: Error) => void) | null = null
  const callLog: string[] = []
  const evaluateCalls: string[] = []

  const initFn = vi.fn(async () => {
    callLog.push('init')
  })
  const evaluateFn = vi.fn(async (code: string) => {
    callLog.push('evaluate')
    evaluateCalls.push(code)
    return evalResult
  })
  const playFn = vi.fn(() => {
    callLog.push('play')
  })
  const stopFn = vi.fn(() => {
    callLog.push('stop')
  })
  const disposeFn = vi.fn(() => {
    callLog.push('dispose')
  })

  const engine: MockEngine = {
    callLog,
    evaluateCalls,
    initFn: initFn as unknown as AnySpy,
    evaluateFn: evaluateFn as unknown as AnySpy,
    playFn: playFn as unknown as AnySpy,
    stopFn: stopFn as unknown as AnySpy,
    disposeFn: disposeFn as unknown as AnySpy,
    init: initFn,
    evaluate: evaluateFn,
    play: playFn,
    stop: stopFn,
    dispose: disposeFn,
    get components() {
      return components
    },
    setComponents(c) {
      components = c
    },
    setEvalResult(r) {
      evalResult = r
    },
    triggerRuntimeError(err) {
      runtimeErrorHandler?.(err)
    },
    setRuntimeErrorHandler(handler) {
      runtimeErrorHandler = handler
    },
  }
  return engine
}

// Real HapStream for streaming — the runtime's BufferedScheduler elevation
// path subscribes to `hapStream.on(handler)`, so a sentinel object without
// the `on` method would crash the elevation. HapStream is a plain
// in-memory event bus with no audio dependencies; instantiating one is safe
// in any environment.
function makeStreamingComponent(): EngineComponents['streaming'] {
  return {
    hapStream: new HapStream(),
  }
}
// Stub AudioContext — BufferedScheduler reads `audioCtx.currentTime` for
// its rolling-buffer eviction logic. A plain object with a numeric
// `currentTime` getter is enough; no real Web Audio nodes needed.
function makeAudioComponent(): EngineComponents['audio'] {
  return {
    analyser: { __tag: 'analyser' } as unknown as AnalyserNode,
    audioCtx: { currentTime: 0 } as unknown as AudioContext,
  }
}
function makeQueryableComponent(): EngineComponents['queryable'] {
  return {
    scheduler: {
      now: () => 0,
      query: () => [],
    },
    trackSchedulers: new Map(),
  }
}
function makeInlineVizComponent(): EngineComponents['inlineViz'] {
  return {
    vizRequests: new Map([
      ['$0', { vizId: 'pianoroll', afterLine: 3 }],
    ]),
  }
}

describe('LiveCodingRuntime', () => {
  beforeEach(() => {
    __resetWorkspaceAudioBusForTests()
  })

  // -------------------------------------------------------------------------
  // play() lifecycle (PK1)
  // -------------------------------------------------------------------------

  describe('play() lifecycle', () => {
    it('init → evaluate → publish → play in order, with publish BEFORE play', async () => {
      const engine = createMockEngine()
      engine.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
        queryable: makeQueryableComponent(),
      })
      const runtime = new LiveCodingRuntime(
        'file-1',
        engine,
        () => 'note("c3").s("sine")',
      )

      let publishObservedAt: number | null = null
      const offBus = workspaceAudioBus.subscribe(
        { kind: 'file', fileId: 'file-1' },
        (payload) => {
          if (payload) {
            publishObservedAt = engine.callLog.length
          }
        },
      )

      const result = await runtime.play()
      expect(result.error).toBeNull()

      // The lifecycle the runtime ran:
      expect(engine.callLog).toEqual(['init', 'evaluate', 'play'])

      // The bus saw the publish AFTER evaluate but BEFORE play. The
      // call log was 2 entries deep (init, evaluate) at publish time —
      // play() is appended to the log after publish returns.
      expect(publishObservedAt).toBe(2)
      offBus()
    })

    it('passes the file content unchanged into engine.evaluate (P1)', async () => {
      const engine = createMockEngine()
      engine.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
      })
      const code = '$: note("c3 e3 g3").s("sine") // .viz("pianoroll")'
      const runtime = new LiveCodingRuntime('file-1', engine, () => code)
      await runtime.play()
      expect(engine.evaluateCalls).toEqual([code])
    })

    it('publishes the engine component bag onto the bus under the file id', async () => {
      const engine = createMockEngine()
      const streaming = makeStreamingComponent()
      const audio = makeAudioComponent()
      const queryable = makeQueryableComponent()
      const inlineViz = makeInlineVizComponent()
      engine.setComponents({ streaming, audio, queryable, inlineViz })
      const runtime = new LiveCodingRuntime('file-1', engine, () => 'code')

      let received: AudioPayload | null = null
      workspaceAudioBus.subscribe(
        { kind: 'file', fileId: 'file-1' },
        (p) => {
          if (p) received = p
        },
      )

      await runtime.play()
      expect(received).not.toBeNull()
      expect(received!.hapStream).toBe(streaming.hapStream)
      expect(received!.analyser).toBe(audio.analyser)
      expect(received!.scheduler).toBe(queryable.scheduler)
      expect(received!.inlineViz).toBe(inlineViz)
      expect(received!.audio).toBe(audio)
    })

    it('listSources contains the file id while playing', async () => {
      const engine = createMockEngine()
      engine.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
      })
      const runtime = new LiveCodingRuntime('file-1', engine, () => 'code')
      await runtime.play()
      const sources = workspaceAudioBus.listSources()
      expect(sources).toHaveLength(1)
      expect(sources[0].sourceId).toBe('file-1')
      expect(sources[0].playing).toBe(true)
    })

    it('skips init() on a second play if already initialized', async () => {
      const engine = createMockEngine()
      engine.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
      })
      const runtime = new LiveCodingRuntime('file-1', engine, () => 'code')
      await runtime.play()
      runtime.stop()
      await runtime.play()
      // init only fired once, evaluate fired twice
      const initCount = engine.callLog.filter((c) => c === 'init').length
      const evalCount = engine.callLog.filter((c) => c === 'evaluate').length
      expect(initCount).toBe(1)
      expect(evalCount).toBe(2)
    })
  })

  // -------------------------------------------------------------------------
  // BufferedScheduler elevation (S8)
  // -------------------------------------------------------------------------

  describe('BufferedScheduler elevation (S8)', () => {
    it('elevates a BufferedScheduler when streaming + audio exist but queryable does not', async () => {
      const engine = createMockEngine()
      engine.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
        // no queryable
      })
      const runtime = new LiveCodingRuntime('file-1', engine, () => 'code')

      let received: AudioPayload | null = null
      workspaceAudioBus.subscribe(
        { kind: 'file', fileId: 'file-1' },
        (p) => {
          if (p) received = p
        },
      )

      await runtime.play()
      expect(received).not.toBeNull()
      // Elevated scheduler is present...
      expect(received!.scheduler).toBeDefined()
      // ...and it has the IRPattern shape (now/query) — the BufferedScheduler.
      expect(typeof received!.scheduler!.now).toBe('function')
      expect(typeof received!.scheduler!.query).toBe('function')
    })

    it('uses the native scheduler directly when queryable is present', async () => {
      const engine = createMockEngine()
      const queryable = makeQueryableComponent()
      engine.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
        queryable,
      })
      const runtime = new LiveCodingRuntime('file-1', engine, () => 'code')

      let received: AudioPayload | null = null
      workspaceAudioBus.subscribe(
        { kind: 'file', fileId: 'file-1' },
        (p) => {
          if (p) received = p
        },
      )

      await runtime.play()
      // The forwarded scheduler IS the native one — reference identity.
      expect(received!.scheduler).toBe(queryable.scheduler)
    })

    it('does not elevate when audio is missing (no audioCtx for BufferedScheduler)', async () => {
      const engine = createMockEngine()
      engine.setComponents({
        streaming: makeStreamingComponent(),
        // no audio, no queryable
      })
      const runtime = new LiveCodingRuntime('file-1', engine, () => 'code')

      let received: AudioPayload | null = null
      workspaceAudioBus.subscribe(
        { kind: 'file', fileId: 'file-1' },
        (p) => {
          if (p) received = p
        },
      )

      await runtime.play()
      expect(received).not.toBeNull()
      expect(received!.scheduler).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // Error pathways (S7)
  // -------------------------------------------------------------------------

  describe('error pathways (S7)', () => {
    it('does NOT publish, does NOT call play, fires onError on evaluate failure', async () => {
      const engine = createMockEngine()
      engine.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
      })
      const evalError = new Error('parse error: unexpected token')
      engine.setEvalResult({ error: evalError })

      const runtime = new LiveCodingRuntime('file-1', engine, () => 'bad code')
      const errorListener = vi.fn()
      runtime.onError(errorListener)

      const result = await runtime.play()
      expect(result.error).toBe(evalError)
      expect(errorListener).toHaveBeenCalledTimes(1)
      expect(errorListener).toHaveBeenCalledWith(evalError)
      // engine.play was never called
      expect(engine.playFn).not.toHaveBeenCalled()
      // bus has no publisher for this file
      expect(workspaceAudioBus.consume({ kind: 'file', fileId: 'file-1' })).toBeNull()
    })

    it('forwards engine runtime errors (sound-not-found etc.) through onError', async () => {
      const engine = createMockEngine()
      engine.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
      })
      const runtime = new LiveCodingRuntime('file-1', engine, () => 'code')
      const errorListener = vi.fn()
      runtime.onError(errorListener)

      await runtime.play()
      const audioErr = new Error('sound dx7 not found')
      engine.triggerRuntimeError(audioErr)
      expect(errorListener).toHaveBeenCalledWith(audioErr)
    })

    it('onError unsubscribe is idempotent and removes the listener', async () => {
      const engine = createMockEngine()
      engine.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
      })
      const runtime = new LiveCodingRuntime('file-1', engine, () => 'code')
      const errorListener = vi.fn()
      const off = runtime.onError(errorListener)
      off()
      off() // double-unsubscribe is safe
      engine.triggerRuntimeError(new Error('boom'))
      expect(errorListener).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // stop() / dispose()
  // -------------------------------------------------------------------------

  describe('stop() and dispose()', () => {
    it('stop() calls engine.stop and unpublishes from the bus', async () => {
      const engine = createMockEngine()
      engine.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
      })
      const runtime = new LiveCodingRuntime('file-1', engine, () => 'code')
      await runtime.play()
      expect(workspaceAudioBus.listSources()).toHaveLength(1)

      runtime.stop()
      expect(engine.stopFn).toHaveBeenCalled()
      expect(workspaceAudioBus.listSources()).toHaveLength(0)
    })

    it('stop() fires onPlayingChanged(false) after a successful play()', async () => {
      const engine = createMockEngine()
      engine.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
      })
      const runtime = new LiveCodingRuntime('file-1', engine, () => 'code')
      const playingListener = vi.fn()
      runtime.onPlayingChanged(playingListener)
      await runtime.play()
      expect(playingListener).toHaveBeenLastCalledWith(true)
      runtime.stop()
      expect(playingListener).toHaveBeenLastCalledWith(false)
    })

    it('stop() is idempotent — second call does not throw or re-fire listeners', async () => {
      const engine = createMockEngine()
      engine.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
      })
      const runtime = new LiveCodingRuntime('file-1', engine, () => 'code')
      const playingListener = vi.fn()
      runtime.onPlayingChanged(playingListener)
      await runtime.play()
      runtime.stop()
      const callCountAfterFirstStop = playingListener.mock.calls.length
      runtime.stop()
      expect(playingListener.mock.calls.length).toBe(callCountAfterFirstStop)
    })

    it('dispose() calls stop() AND engine.dispose()', async () => {
      const engine = createMockEngine()
      engine.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
      })
      const runtime = new LiveCodingRuntime('file-1', engine, () => 'code')
      await runtime.play()
      runtime.dispose()
      expect(engine.stopFn).toHaveBeenCalled()
      expect(engine.disposeFn).toHaveBeenCalled()
      expect(workspaceAudioBus.listSources()).toHaveLength(0)
    })

    it('dispose() leaves the bus with zero entries for this file id', async () => {
      const engine = createMockEngine()
      engine.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
      })
      const runtime = new LiveCodingRuntime('file-1', engine, () => 'code')
      await runtime.play()
      runtime.dispose()
      expect(workspaceAudioBus.consume({ kind: 'file', fileId: 'file-1' })).toBeNull()
    })

    it('dispose() is idempotent', async () => {
      const engine = createMockEngine()
      engine.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
      })
      const runtime = new LiveCodingRuntime('file-1', engine, () => 'code')
      await runtime.play()
      runtime.dispose()
      runtime.dispose() // safe
      // engine.dispose only called once
      expect(engine.disposeFn).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  // BPM extraction (U8)
  // -------------------------------------------------------------------------

  describe('BPM extraction (U8)', () => {
    it('extractBpmFromCode parses setcps(num/denom) correctly', () => {
      expect(extractBpmFromCode('setcps(120/240)\n$: note("c3")')).toBe(30)
      expect(extractBpmFromCode('setcps(140/60)')).toBe(140)
      expect(extractBpmFromCode('// no setcps here')).toBeUndefined()
    })

    it('runtime.getBpm() returns undefined before play and a number after', async () => {
      const engine = createMockEngine()
      engine.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
      })
      const runtime = new LiveCodingRuntime(
        'file-1',
        engine,
        () => 'setcps(140/60)\n$: note("c3")',
      )
      expect(runtime.getBpm()).toBeUndefined()
      await runtime.play()
      expect(runtime.getBpm()).toBe(140)
    })
  })

  // -------------------------------------------------------------------------
  // Live mode (autoRefresh)
  //
  // Covers the reconcile-on-lifecycle-event invariant:
  //
  //   (autoRefreshEnabled && isPlayingState && subscribeToFile) <=>
  //   (subscription is installed)
  //
  // The subscription is observed via a fake `subscribeToFile` callback
  // that records how many subscribers are currently installed. Reconciles
  // happen in setAutoRefresh, play, stop, and dispose — every transition
  // is exercised here so a regression in ONE of the callers can't silently
  // leak a listener.
  // -------------------------------------------------------------------------

  describe('Live mode (autoRefresh)', () => {
    /**
     * Create a subscriber harness that mimics WorkspaceFile.subscribe.
     * Returns both the runtime-facing `subscribeToFile` function and a
     * `fire()` trigger the test can use to simulate a content change.
     */
    function makeSubscribeHarness() {
      const listeners = new Set<() => void>()
      const subscribeToFile = (cb: () => void): (() => void) => {
        listeners.add(cb)
        return () => {
          listeners.delete(cb)
        }
      }
      return {
        subscribeToFile,
        size: () => listeners.size,
        fire: () => {
          for (const cb of Array.from(listeners)) cb()
        },
      }
    }

    function makeRuntimeWithHarness() {
      const engine = createMockEngine()
      engine.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
      })
      const harness = makeSubscribeHarness()
      const runtime = new LiveCodingRuntime(
        'file-1',
        engine,
        () => '$: note("c3")',
        harness.subscribeToFile,
      )
      return { runtime, engine, harness }
    }

    it('defaults to disabled and installs no subscription', () => {
      const { runtime, harness } = makeRuntimeWithHarness()
      expect(runtime.isAutoRefreshEnabled()).toBe(false)
      expect(harness.size()).toBe(0)
    })

    it('setAutoRefresh(true) without play does NOT install a subscription', () => {
      const { runtime, harness } = makeRuntimeWithHarness()
      runtime.setAutoRefresh(true)
      expect(runtime.isAutoRefreshEnabled()).toBe(true)
      // Invariant: subscription is only active when playing.
      expect(harness.size()).toBe(0)
    })

    it('play + setAutoRefresh(true) installs exactly one subscription', async () => {
      const { runtime, harness } = makeRuntimeWithHarness()
      await runtime.play()
      runtime.setAutoRefresh(true)
      expect(harness.size()).toBe(1)
    })

    it('setAutoRefresh(true) + play installs the subscription on play', async () => {
      const { runtime, harness } = makeRuntimeWithHarness()
      runtime.setAutoRefresh(true)
      expect(harness.size()).toBe(0) // not yet
      await runtime.play()
      expect(harness.size()).toBe(1)
    })

    it('stop() tears down the subscription but keeps the enabled flag', async () => {
      const { runtime, harness } = makeRuntimeWithHarness()
      await runtime.play()
      runtime.setAutoRefresh(true)
      expect(harness.size()).toBe(1)
      runtime.stop()
      expect(harness.size()).toBe(0)
      // The LED stays on so a subsequent play() re-arms automatically.
      expect(runtime.isAutoRefreshEnabled()).toBe(true)
    })

    it('re-play after stop re-installs the subscription', async () => {
      const { runtime, harness } = makeRuntimeWithHarness()
      await runtime.play()
      runtime.setAutoRefresh(true)
      runtime.stop()
      await runtime.play()
      expect(harness.size()).toBe(1)
    })

    it('setAutoRefresh(false) mid-play tears down immediately', async () => {
      const { runtime, harness } = makeRuntimeWithHarness()
      await runtime.play()
      runtime.setAutoRefresh(true)
      expect(harness.size()).toBe(1)
      runtime.setAutoRefresh(false)
      expect(harness.size()).toBe(0)
    })

    it('setAutoRefresh is idempotent and does not re-subscribe', async () => {
      const { runtime, harness } = makeRuntimeWithHarness()
      await runtime.play()
      runtime.setAutoRefresh(true)
      runtime.setAutoRefresh(true)
      runtime.setAutoRefresh(true)
      expect(harness.size()).toBe(1)
    })

    it('dispose() clears the subscription even if autoRefresh was on', async () => {
      const { runtime, harness } = makeRuntimeWithHarness()
      await runtime.play()
      runtime.setAutoRefresh(true)
      expect(harness.size()).toBe(1)
      runtime.dispose()
      expect(harness.size()).toBe(0)
    })

    it('onAutoRefreshChanged fires on every transition', () => {
      const { runtime } = makeRuntimeWithHarness()
      const calls: boolean[] = []
      runtime.onAutoRefreshChanged((v) => calls.push(v))
      runtime.setAutoRefresh(true)
      runtime.setAutoRefresh(true) // idempotent — no fire
      runtime.setAutoRefresh(false)
      expect(calls).toEqual([true, false])
    })

    it('file-content change triggers debounced re-play after 500ms', async () => {
      vi.useFakeTimers()
      try {
        const { runtime, engine, harness } = makeRuntimeWithHarness()
        await runtime.play()
        runtime.setAutoRefresh(true)
        const evalCountBefore = engine.evaluateFn.mock.calls.length

        // Simulate a content change.
        harness.fire()

        // Before the debounce fires, no re-evaluate yet.
        expect(engine.evaluateFn.mock.calls.length).toBe(evalCountBefore)

        // Advance past the debounce window.
        await vi.advanceTimersByTimeAsync(600)

        // One more evaluate call should have landed.
        expect(engine.evaluateFn.mock.calls.length).toBe(evalCountBefore + 1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('debounce coalesces rapid content changes into a single re-play', async () => {
      vi.useFakeTimers()
      try {
        const { runtime, engine, harness } = makeRuntimeWithHarness()
        await runtime.play()
        runtime.setAutoRefresh(true)
        const evalCountBefore = engine.evaluateFn.mock.calls.length

        // Five fires within 100ms — all should collapse into one re-play.
        harness.fire()
        await vi.advanceTimersByTimeAsync(100)
        harness.fire()
        await vi.advanceTimersByTimeAsync(100)
        harness.fire()
        await vi.advanceTimersByTimeAsync(100)
        harness.fire()
        await vi.advanceTimersByTimeAsync(100)
        harness.fire()
        await vi.advanceTimersByTimeAsync(600)

        expect(engine.evaluateFn.mock.calls.length).toBe(evalCountBefore + 1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('runtime without subscribeToFile is a no-op for live mode', async () => {
      const engine = createMockEngine()
      engine.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
      })
      // No fourth arg — tests that want auto-refresh dormant.
      const runtime = new LiveCodingRuntime('file-1', engine, () => 'code')
      await runtime.play()
      runtime.setAutoRefresh(true)
      // Flag set, but no way to observe file changes, so no re-plays ever.
      expect(runtime.isAutoRefreshEnabled()).toBe(true)
      runtime.dispose() // must not throw
    })
  })

  // -------------------------------------------------------------------------
  // Playback coordinator integration — single-source-at-a-time playback
  //
  // When a new runtime's play() fires, every OTHER registered source
  // (including other LiveCodingRuntime instances) should have its stop
  // callback invoked. This is the cross-tab exclusive-playback behavior
  // users expect from a DAW-style editor.
  // -------------------------------------------------------------------------

  describe('playback coordinator integration', () => {
    it('play() on one runtime stops another running runtime', async () => {
      const engineA = createMockEngine()
      engineA.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
      })
      const runtimeA = new LiveCodingRuntime(
        'file-coord-a',
        engineA,
        () => 'note("c3")',
      )
      const engineB = createMockEngine()
      engineB.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
      })
      const runtimeB = new LiveCodingRuntime(
        'file-coord-b',
        engineB,
        () => 'note("g3")',
      )

      // Track A's playing state via the onPlayingChanged listener
      // — the public observable interface.
      const playingA: boolean[] = []
      runtimeA.onPlayingChanged((p) => playingA.push(p))
      const playingB: boolean[] = []
      runtimeB.onPlayingChanged((p) => playingB.push(p))

      // A plays first. Coordinator marks A as currently playing.
      await runtimeA.play()
      expect(playingA[playingA.length - 1]).toBe(true)
      expect(engineA.stopFn.mock.calls.length).toBe(0)

      // B plays. Coordinator fires A's stop callback, which runs
      // engineA.stop() synchronously inside the coordinator call.
      await runtimeB.play()
      expect(playingB[playingB.length - 1]).toBe(true)
      // A should have been stopped via the coordinator's cross-stop.
      expect(playingA[playingA.length - 1]).toBe(false)
      expect(engineA.stopFn.mock.calls.length).toBeGreaterThan(0)

      runtimeA.dispose()
      runtimeB.dispose()
    })

    it('dispose unregisters the runtime from the coordinator', async () => {
      const engineA = createMockEngine()
      engineA.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
      })
      const runtimeA = new LiveCodingRuntime(
        'file-coord-dispose',
        engineA,
        () => 'code',
      )
      await runtimeA.play()
      runtimeA.dispose()
      // After dispose, A's stop callback should no longer fire on
      // new plays. We verify by checking stopFn's call count
      // doesn't increase beyond what dispose() itself did.
      const stopsAfterDispose = engineA.stopFn.mock.calls.length

      // Create an unrelated runtime and start it.
      const engineB = createMockEngine()
      engineB.setComponents({
        streaming: makeStreamingComponent(),
        audio: makeAudioComponent(),
      })
      const runtimeB = new LiveCodingRuntime(
        'file-coord-dispose-other',
        engineB,
        () => 'code',
      )
      await runtimeB.play()
      // A's engine.stop should NOT have been called again — A was
      // unregistered from the coordinator on dispose.
      expect(engineA.stopFn.mock.calls.length).toBe(stopsAfterDispose)
      runtimeB.dispose()
    })
  })
})
