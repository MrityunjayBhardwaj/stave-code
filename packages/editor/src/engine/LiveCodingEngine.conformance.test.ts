// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { LiveCodingEngine } from './LiveCodingEngine'
import { DemoEngine } from './DemoEngine'

// ---------------------------------------------------------------------------
// AudioContext mock for JSDOM
// ---------------------------------------------------------------------------

class MockAnalyserNode {
  fftSize = 0
  smoothingTimeConstant = 0
  connect() {}
  disconnect() {}
}

class MockGainNode {
  gain = { value: 1 }
  connect() {}
  disconnect() {}
}

class MockOscillatorNode {
  frequency = { value: 440 }
  type = 'sine'
  connect() {}
  start() {}
  stop() {}
  disconnect() {}
}

globalThis.AudioContext = class MockAudioContext {
  currentTime = 0
  sampleRate = 44100
  state = 'running'

  createAnalyser(): any {
    return new MockAnalyserNode()
  }
  createGain(): any {
    return new MockGainNode()
  }
  createOscillator(): any {
    return new MockOscillatorNode()
  }
  resume(): Promise<void> {
    return Promise.resolve()
  }
  close(): Promise<void> {
    return Promise.resolve()
  }
  get destination(): any {
    return {}
  }
} as any

// ---------------------------------------------------------------------------
// Conformance test factory
// ---------------------------------------------------------------------------

function conformanceSuite(name: string, factory: () => LiveCodingEngine) {
  describe(`${name} conformance`, () => {
    let engine: LiveCodingEngine

    beforeEach(() => {
      engine = factory()
    })

    afterEach(() => {
      engine.dispose()
    })

    // -- Interface shape --

    describe('interface shape', () => {
      it('has init method', () => {
        expect(typeof engine.init).toBe('function')
      })

      it('has evaluate method', () => {
        expect(typeof engine.evaluate).toBe('function')
      })

      it('has play method', () => {
        expect(typeof engine.play).toBe('function')
      })

      it('has stop method', () => {
        expect(typeof engine.stop).toBe('function')
      })

      it('has dispose method', () => {
        expect(typeof engine.dispose).toBe('function')
      })

      it('has components getter', () => {
        expect(engine.components).toBeDefined()
        expect(typeof engine.components).toBe('object')
      })

      it('has setRuntimeErrorHandler method', () => {
        expect(typeof engine.setRuntimeErrorHandler).toBe('function')
      })
    })

    // -- Lifecycle --

    describe('lifecycle', () => {
      it('init() resolves without error', async () => {
        await expect(engine.init()).resolves.toBeUndefined()
      })

      it('evaluate() returns { error?: Error } shape', async () => {
        await engine.init()
        const result = await engine.evaluate('note: c4 e4 g4')
        expect(result).toBeDefined()
        expect(typeof result).toBe('object')
        // error should be undefined on valid input
        expect(result.error).toBeUndefined()
      })

      it('play() after evaluate() does not throw', async () => {
        await engine.init()
        await engine.evaluate('note: c4 e4 g4')
        expect(() => engine.play()).not.toThrow()
      })

      it('stop() after play() does not throw', async () => {
        await engine.init()
        await engine.evaluate('note: c4 e4 g4')
        engine.play()
        expect(() => engine.stop()).not.toThrow()
      })

      it('dispose() after stop() does not throw', async () => {
        await engine.init()
        await engine.evaluate('note: c4')
        engine.play()
        engine.stop()
        expect(() => engine.dispose()).not.toThrow()
      })

      it('dispose() is idempotent', async () => {
        await engine.init()
        engine.dispose()
        expect(() => engine.dispose()).not.toThrow()
      })
    })

    // -- Components --

    describe('components', () => {
      it('components is an object (not null)', () => {
        expect(engine.components).not.toBeNull()
        expect(typeof engine.components).toBe('object')
      })

      it('after init(), components.streaming exists with hapStream', async () => {
        await engine.init()
        const { streaming } = engine.components
        expect(streaming).toBeDefined()
        expect(streaming!.hapStream).toBeDefined()
        expect(typeof streaming!.hapStream.on).toBe('function')
        expect(typeof streaming!.hapStream.off).toBe('function')
      })

      it('after init(), if audio is present, analyser and audioCtx exist', async () => {
        await engine.init()
        const { audio } = engine.components
        if (audio) {
          expect(audio.analyser).toBeDefined()
          expect(audio.audioCtx).toBeDefined()
        }
        // If audio is not present, this is still a valid engine (not all engines need audio)
      })

      it('after evaluate(), components reflect evaluate results', async () => {
        await engine.init()
        await engine.evaluate('note: c4 e4 g4\nviz: scope')
        const comps = engine.components
        // At minimum, streaming should still exist
        expect(comps.streaming).toBeDefined()
      })

      it('after dispose(), accessing components does not throw', async () => {
        await engine.init()
        engine.dispose()
        expect(() => engine.components).not.toThrow()
      })
    })

    // -- Error handling --

    describe('error handling', () => {
      it('setRuntimeErrorHandler registers callback', () => {
        const handler = (_err: Error) => {}
        expect(() => engine.setRuntimeErrorHandler(handler)).not.toThrow()
      })
    })

    // -- InlineViz --

    describe('inlineViz', () => {
      it('after evaluate() with viz directive, components.inlineViz exists', async () => {
        await engine.init()
        await engine.evaluate('note: c4 e4 g4\nviz: scope')
        const { inlineViz } = engine.components
        expect(inlineViz).toBeDefined()
        expect(inlineViz!.vizRequests.size).toBeGreaterThan(0)
      })

      it('vizRequests entries have vizId and afterLine > 0', async () => {
        await engine.init()
        await engine.evaluate('note: c4 e4 g4\nviz: scope')
        const { inlineViz } = engine.components
        expect(inlineViz).toBeDefined()
        for (const [, req] of inlineViz!.vizRequests) {
          expect(typeof req.vizId).toBe('string')
          expect(req.vizId.length).toBeGreaterThan(0)
          expect(typeof req.afterLine).toBe('number')
          expect(req.afterLine).toBeGreaterThan(0)
        }
      })

      it('after evaluate() without viz directive, inlineViz is absent', async () => {
        await engine.init()
        await engine.evaluate('note: c4 e4 g4')
        const { inlineViz } = engine.components
        // Should be undefined (no viz requests)
        expect(inlineViz).toBeUndefined()
      })
    })
  })
}

// ---------------------------------------------------------------------------
// DemoEngine-specific tests (validates component optionality)
// ---------------------------------------------------------------------------

describe('DemoEngine component optionality', () => {
  let engine: DemoEngine

  beforeEach(() => {
    engine = new DemoEngine()
  })

  afterEach(() => {
    engine.dispose()
  })

  it('does NOT have queryable component (no PatternScheduler)', async () => {
    await engine.init()
    await engine.evaluate('note: c4 e4 g4')
    expect(engine.components.queryable).toBeUndefined()
  })

  it('has streaming component always (even before init)', () => {
    expect(engine.components.streaming).toBeDefined()
    expect(engine.components.streaming!.hapStream).toBeDefined()
  })

  it('has audio component after init()', async () => {
    await engine.init()
    expect(engine.components.audio).toBeDefined()
    expect(engine.components.audio!.analyser).toBeDefined()
    expect(engine.components.audio!.audioCtx).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Run conformance suite against DemoEngine
// ---------------------------------------------------------------------------

conformanceSuite('DemoEngine', () => new DemoEngine())

// StrudelEngine conformance skipped — requires heavy Strudel mocks.
// Can be enabled with proper test setup in Phase 11.
