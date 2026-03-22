// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock state
// ---------------------------------------------------------------------------

// Unique counter for Pattern instances so queryArc returns distinguishable results
let patternInstanceCounter = 0

// Controls what pattern.p() calls the mock repl.evaluate() simulates
type EvalBehavior =
  | 'two-anon'     // two anonymous $: patterns → "$0", "$1"
  | 'one-named'    // one named pattern → "d1"
  | 'mixed'        // one anonymous + one named → "$0", "d1"
  | 'error'        // fires onEvalError (no patterns captured)
  | 'muted'        // muted patterns: "_muted" and "muted_"
  | 'one-track'    // single anonymous pattern → "$0"

let evalBehavior: EvalBehavior = 'two-anon'

// Captured onEvalError callback from webaudioRepl construction
let capturedOnEvalError: ((err: Error) => void) | null = null

// ---------------------------------------------------------------------------
// Mock Pattern class
// ---------------------------------------------------------------------------

class MockPattern {
  private instanceId: number
  constructor() {
    this.instanceId = ++patternInstanceCounter
  }
  queryArc(begin: number, end: number) {
    return [{ mock: true, id: this.instanceId, begin, end }]
  }
}

// ---------------------------------------------------------------------------
// Mock @strudel/core
// ---------------------------------------------------------------------------

vi.mock('@strudel/core', () => {
  return {
    Pattern: MockPattern,
    evalScope: vi.fn().mockResolvedValue(undefined),
  }
})

// ---------------------------------------------------------------------------
// Mock @strudel/webaudio
// ---------------------------------------------------------------------------

vi.mock('@strudel/webaudio', () => {
  const mockScheduler = {
    now: () => 0,
    pattern: new MockPattern(),
    start: vi.fn(),
    stop: vi.fn(),
  }

  const webaudioRepl = vi.fn((options: { onEvalError?: (err: Error) => void }) => {
    capturedOnEvalError = options.onEvalError ?? null

    return {
      scheduler: mockScheduler,
      evaluate: vi.fn(async (code: string) => {
        // Simulate Strudel's internal sequence:
        // (1) injectPatternMethods: sets Pattern.prototype.p = function(id) { ... }
        // (2) hush() would run (reset counters) — simulated by starting fresh
        // (3) user code runs — calls pattern.p(id)

        // Step 1: Simulate injectPatternMethods assigning Pattern.prototype.p
        const strudelsOwnP = function(this: MockPattern, id: string) {
          // Strudel's own implementation: returns this (simplified)
          return this
        }
        // This is the critical line: Strudel's injectPatternMethods does:
        //   Pattern.prototype.p = function(id) { pPatterns[id] = this; return this; }
        ;(MockPattern.prototype as any).p = strudelsOwnP

        // Step 2: Simulate user code calling .p(id) based on eval behavior
        if (code === 'error-code') {
          // Trigger eval error instead of running user code
          capturedOnEvalError?.(new Error('Simulated eval error'))
          return
        }

        if (code === 'two-anon' || evalBehavior === 'two-anon') {
          const p0 = new MockPattern()
          const p1 = new MockPattern()
          ;(p0 as any).p('$')
          ;(p1 as any).p('$')
        } else if (code === 'one-named' || evalBehavior === 'one-named') {
          const p = new MockPattern()
          ;(p as any).p('d1')
        } else if (code === 'mixed' || evalBehavior === 'mixed') {
          const p0 = new MockPattern()
          const p1 = new MockPattern()
          ;(p0 as any).p('$')
          ;(p1 as any).p('d1')
        } else if (code === 'muted-code' || evalBehavior === 'muted') {
          const p1 = new MockPattern()
          const p2 = new MockPattern()
          ;(p1 as any).p('_muted')
          ;(p2 as any).p('muted_')
        } else if (code === 'one-track' || evalBehavior === 'one-track') {
          const p = new MockPattern()
          ;(p as any).p('$')
        }
      }),
    }
  })

  return {
    webaudioRepl,
    initAudio: vi.fn().mockResolvedValue(undefined),
    getAudioContext: vi.fn(() => ({
      createAnalyser: vi.fn(() => ({
        fftSize: 2048,
        smoothingTimeConstant: 0.8,
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      currentTime: 0,
      sampleRate: 44100,
    })),
    webaudioOutput: vi.fn(),
    registerSynthSounds: vi.fn(),
    registerZZFXSounds: vi.fn(),
    getSuperdoughAudioController: vi.fn(() => ({
      output: {
        destinationGain: {
          connect: vi.fn(),
        },
      },
    })),
    samples: vi.fn().mockResolvedValue(undefined),
    soundMap: { get: vi.fn(() => ({})) },
  }
})

// ---------------------------------------------------------------------------
// Mock remaining strudel modules
// ---------------------------------------------------------------------------

vi.mock('@strudel/mini', () => ({
  miniAllStrings: vi.fn(),
}))

vi.mock('@strudel/tonal', () => ({}))

vi.mock('@strudel/soundfonts', () => ({
  registerSoundfonts: vi.fn(),
}))

vi.mock('@strudel/xen', () => ({}))

vi.mock('@strudel/midi', () => ({}))

vi.mock('@strudel/transpiler', () => ({
  transpiler: vi.fn((code: string) => ({ output: code })),
}))

// ---------------------------------------------------------------------------
// Import the module under test (after mocks are set up)
// ---------------------------------------------------------------------------

import { StrudelEngine } from './StrudelEngine'
import { Pattern } from '@strudel/core'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StrudelEngine.getTrackSchedulers', () => {
  beforeEach(() => {
    patternInstanceCounter = 0
    capturedOnEvalError = null
    evalBehavior = 'two-anon'
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Ensure Pattern.prototype.p is not left as a setter after any test
    const desc = Object.getOwnPropertyDescriptor(MockPattern.prototype, 'p')
    if (desc?.set) {
      // Clean up leaked setter
      delete (MockPattern.prototype as any).p
    }
  })

  it('returns empty Map before evaluate', () => {
    const engine = new StrudelEngine()
    expect(engine.getTrackSchedulers().size).toBe(0)
  })

  it('captures anonymous $: patterns as $0, $1 (TRACK-01, TRACK-04)', async () => {
    evalBehavior = 'two-anon'
    const engine = new StrudelEngine()
    await engine.init()
    await engine.evaluate('two-anon')
    const map = engine.getTrackSchedulers()
    expect(map.size).toBe(2)
    expect(map.has('$0')).toBe(true)
    expect(map.has('$1')).toBe(true)
  })

  it('captures named patterns with literal key (TRACK-01, TRACK-04)', async () => {
    evalBehavior = 'one-named'
    const engine = new StrudelEngine()
    await engine.init()
    await engine.evaluate('one-named')
    const map = engine.getTrackSchedulers()
    expect(map.has('d1')).toBe(true)
  })

  it('each track scheduler queries its own pattern (TRACK-03)', async () => {
    evalBehavior = 'two-anon'
    const engine = new StrudelEngine()
    await engine.init()
    await engine.evaluate('two-anon')
    const map = engine.getTrackSchedulers()
    const sched0 = map.get('$0')!
    const sched1 = map.get('$1')!
    expect(sched0).toBeDefined()
    expect(sched1).toBeDefined()
    const result0 = sched0.query(0, 1)
    const result1 = sched1.query(0, 1)
    // Each returns its own Pattern's queryArc result (different instanceId)
    expect(result0).not.toEqual(result1)
    expect(result0[0].id).not.toBe(result1[0].id)
  })

  it('restores Pattern.prototype.p after successful evaluate (TRACK-02)', async () => {
    evalBehavior = 'two-anon'
    const engine = new StrudelEngine()
    await engine.init()
    await engine.evaluate('two-anon')
    const after = Object.getOwnPropertyDescriptor(MockPattern.prototype, 'p')
    // Should not be a setter (our intercept should be removed)
    expect(after?.set).toBeUndefined()
  })

  it('restores Pattern.prototype.p after eval error (TRACK-02)', async () => {
    const engine = new StrudelEngine()
    await engine.init()
    await engine.evaluate('error-code')
    const desc = Object.getOwnPropertyDescriptor(MockPattern.prototype, 'p')
    expect(desc?.set).toBeUndefined()
  })

  it('skips muted patterns _x and x_ (TRACK-04)', async () => {
    evalBehavior = 'muted'
    const engine = new StrudelEngine()
    await engine.init()
    await engine.evaluate('muted-code')
    const map = engine.getTrackSchedulers()
    expect(map.has('_muted')).toBe(false)
    expect(map.has('muted_')).toBe(false)
    expect(map.size).toBe(0)
  })

  it('re-evaluate replaces map entirely', async () => {
    evalBehavior = 'two-anon'
    const engine = new StrudelEngine()
    await engine.init()
    await engine.evaluate('two-anon')
    expect(engine.getTrackSchedulers().size).toBe(2)
    evalBehavior = 'one-track'
    await engine.evaluate('one-track')
    expect(engine.getTrackSchedulers().size).toBe(1)
  })

  it('mixed $: and named patterns produce correct keys (TRACK-04)', async () => {
    evalBehavior = 'mixed'
    const engine = new StrudelEngine()
    await engine.init()
    await engine.evaluate('mixed')
    const map = engine.getTrackSchedulers()
    expect(map.has('$0')).toBe(true)
    expect(map.has('d1')).toBe(true)
    expect(map.size).toBe(2)
  })
})
