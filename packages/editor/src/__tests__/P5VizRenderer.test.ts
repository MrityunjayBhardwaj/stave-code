import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EngineComponents } from '../engine/LiveCodingEngine'
import type { StaveUniforms } from '../visualizers/p5Compiler'

// Mock the editorRegistry settings surface so the renderer reads a CUSTOM alias
// map at mount (Phase 21 aliases — T2 Site A). Hoisted so the renderer import
// below picks it up. The bus stays pure (P12) — only the renderer reads this.
// The renderer reads the RAW engine-keyed map; resolveAliasesForEngine (real,
// not mocked) flattens it to the active engine. So the mock returns the stored
// engine-keyed shape `{ name: { strudel: ... } }`.
const mockGetStoredSignalAliases = vi.fn(
  () => ({}) as Record<string, Record<string, string | string[]>>,
)
vi.mock('../workspace/editorRegistry', () => ({
  getStoredSignalAliases: () => mockGetStoredSignalAliases(),
}))

// Mock p5 — same pattern as old useP5Sketch.test.ts
const p5Instances: Array<{
  remove: ReturnType<typeof vi.fn>
  resizeCanvas: ReturnType<typeof vi.fn>
  noLoop: ReturnType<typeof vi.fn>
  loop: ReturnType<typeof vi.fn>
}> = []

vi.mock('p5', () => {
  const P5 = vi.fn(function (this: any) {
    this.remove = vi.fn()
    this.resizeCanvas = vi.fn()
    this.noLoop = vi.fn()
    this.loop = vi.fn()
    p5Instances.push(this)
  })
  return { default: P5 }
})

import p5 from 'p5'
const MockP5 = p5 as unknown as ReturnType<typeof vi.fn>

import { P5VizRenderer } from '../visualizers/renderers/P5VizRenderer'

function makeComponents(): Partial<EngineComponents> {
  return {}
}

describe('P5VizRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    p5Instances.length = 0
  })

  it('mount() creates a p5 instance with sketch and container', () => {
    const sketchFactory = vi.fn(() => vi.fn())
    const renderer = new P5VizRenderer(sketchFactory)
    const container = document.createElement('div')

    renderer.mount(container, makeComponents(), { w: 400, h: 200 }, vi.fn())

    expect(MockP5).toHaveBeenCalledTimes(1)
    expect(MockP5.mock.calls[0][1]).toBe(container)
  })

  it('mount() calls resizeCanvas with provided size', () => {
    const sketchFactory = vi.fn(() => vi.fn())
    const renderer = new P5VizRenderer(sketchFactory)
    const container = document.createElement('div')

    renderer.mount(container, makeComponents(), { w: 300, h: 150 }, vi.fn())

    expect(p5Instances[0].resizeCanvas).toHaveBeenCalledWith(300, 150)
  })

  it('mount() passes ref objects to sketch factory', () => {
    const sketchFactory = vi.fn(() => vi.fn())
    const renderer = new P5VizRenderer(sketchFactory)

    renderer.mount(document.createElement('div'), makeComponents(), { w: 400, h: 200 }, vi.fn())

    expect(sketchFactory).toHaveBeenCalledTimes(1)
    // The factory receives ref-like objects with .current
    const args = sketchFactory.mock.calls[0] as unknown[]
    expect(args[0]).toHaveProperty('current', null)
    expect(args[1]).toHaveProperty('current', null)
    expect(args[2]).toHaveProperty('current', null)
  })

  it('mount() calls onError if sketch factory throws', () => {
    const sketchFactory = vi.fn(() => {
      throw new Error('sketch error')
    })
    const renderer = new P5VizRenderer(sketchFactory)
    const onError = vi.fn()

    renderer.mount(document.createElement('div'), makeComponents(), { w: 400, h: 200 }, onError)

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0].message).toBe('sketch error')
  })

  it('resize() calls resizeCanvas on the p5 instance', () => {
    const sketchFactory = vi.fn(() => vi.fn())
    const renderer = new P5VizRenderer(sketchFactory)
    renderer.mount(document.createElement('div'), makeComponents(), { w: 400, h: 200 }, vi.fn())

    renderer.resize(500, 300)

    expect(p5Instances[0].resizeCanvas).toHaveBeenCalledWith(500, 300)
  })

  it('pause() calls noLoop on the p5 instance', () => {
    const sketchFactory = vi.fn(() => vi.fn())
    const renderer = new P5VizRenderer(sketchFactory)
    renderer.mount(document.createElement('div'), makeComponents(), { w: 400, h: 200 }, vi.fn())

    renderer.pause()

    expect(p5Instances[0].noLoop).toHaveBeenCalledTimes(1)
  })

  it('resume() calls loop on the p5 instance', () => {
    const sketchFactory = vi.fn(() => vi.fn())
    const renderer = new P5VizRenderer(sketchFactory)
    renderer.mount(document.createElement('div'), makeComponents(), { w: 400, h: 200 }, vi.fn())

    renderer.resume()

    expect(p5Instances[0].loop).toHaveBeenCalledTimes(1)
  })

  it('destroy() calls remove on the p5 instance and nulls it', () => {
    const sketchFactory = vi.fn(() => vi.fn())
    const renderer = new P5VizRenderer(sketchFactory)
    renderer.mount(document.createElement('div'), makeComponents(), { w: 400, h: 200 }, vi.fn())

    renderer.destroy()

    expect(p5Instances[0].remove).toHaveBeenCalledTimes(1)
    // Calling destroy again should not throw (instance is null)
    expect(() => renderer.destroy()).not.toThrow()
  })

  it('resize/pause/resume are no-ops before mount', () => {
    const sketchFactory = vi.fn(() => vi.fn())
    const renderer = new P5VizRenderer(sketchFactory)

    // Should not throw when no instance exists
    expect(() => renderer.resize(100, 100)).not.toThrow()
    expect(() => renderer.pause()).not.toThrow()
    expect(() => renderer.resume()).not.toThrow()
  })

  it('update() refreshes internal refs', () => {
    const sketchFactory = vi.fn(() => vi.fn())
    const renderer = new P5VizRenderer(sketchFactory)
    renderer.mount(document.createElement('div'), makeComponents(), { w: 400, h: 200 }, vi.fn())

    // Verify the factory was initially called with null refs
    const args = sketchFactory.mock.calls[0] as unknown[]
    const hapStreamRef = args[0] as { current: unknown }
    expect(hapStreamRef.current).toBeNull()

    // Update with streaming component
    const mockHapStream = { push: vi.fn() } as any
    renderer.update({ streaming: { hapStream: mockHapStream } })

    // The same ref object should now have the updated value
    expect(hapStreamRef.current).toBe(mockHapStream)
  })

  it('update() is a no-op before mount', () => {
    const sketchFactory = vi.fn(() => vi.fn())
    const renderer = new P5VizRenderer(sketchFactory)

    // Should not throw when no instance exists
    expect(() => renderer.update({})).not.toThrow()
  })

  // ── Custom alias bare-getter injection (Phase 21 aliases — T2 Site A) ───────
  describe('custom alias bare-getter injection', () => {
    beforeEach(() => {
      mockGetStoredSignalAliases.mockReset()
      mockGetStoredSignalAliases.mockReturnValue({})
    })

    /** Drive the renderer's bus through the mount-time HapStream subscription so
     *  the (private) bus envelope bumps — proving the injected getter reads it
     *  LIVE. The subscription lives in mount(): `hapStream.on(handler)`. */
    function makeHapStream() {
      let handler: ((e: unknown) => void) | null = null
      return {
        on: (h: (e: unknown) => void) => {
          handler = h
        },
        off: () => {
          handler = null
        },
        emit: (e: unknown) => handler?.(e),
      }
    }

    it('injects a custom `kick` getter on staveUniforms that reads the bus LIVE (fresh across two states)', () => {
      // Custom alias map: bare `kick` resolves to the `bd` sound (Strudel slot).
      mockGetStoredSignalAliases.mockReturnValue({ kick: { strudel: 'bd' } })
      const sketchFactory = vi.fn(() => vi.fn())
      const renderer = new P5VizRenderer(sketchFactory)
      const hapStream = makeHapStream()

      renderer.mount(
        document.createElement('div'),
        { streaming: { hapStream } } as unknown as Partial<EngineComponents>,
        { w: 400, h: 200 },
        vi.fn(),
      )

      // The 6th factory arg is the staveUniformsRef — the SAME object the sketch
      // resolves bare names through (inner `with (staveUniforms)`).
      const args = sketchFactory.mock.calls[0] as unknown[]
      const uniformsRef = args[5] as { current: StaveUniforms }
      const uniforms = uniformsRef.current as unknown as Record<string, number>

      // The injected getter exists (custom name, not a built-in uniform).
      expect('kick' in uniforms).toBe(true)
      // Bare `uKick` (built-in) was NOT clobbered.
      expect('uKick' in uniforms).toBe(true)

      // State A: bump bd → custom `kick` getter reflects bd's level LIVE.
      hapStream.emit({ s: 'bd', hap: { value: { gain: 1 } } })
      const a = uniforms.kick // getter → bus.envValue('kick') → bd env = 1
      expect(a).toBeCloseTo(1, 6)

      // State B: tick the bus (decay) WITHOUT a new bump → the SAME getter reads
      // the LOWER value. A stale capture would freeze at `a`. The bus tick fires
      // via the staveUniforms __tick hook (the renderer-owned per-frame hook).
      ;(uniforms as unknown as { __tick: () => void }).__tick()
      const b = uniforms.kick
      expect(b).toBeGreaterThan(0)
      expect(b).toBeLessThan(a) // fresh read after one decay (0.92), not frozen
      expect(b).toBeCloseTo(0.92, 5)
    })

    it('does NOT inject when there are no custom aliases (only built-ins present)', () => {
      mockGetStoredSignalAliases.mockReturnValue({})
      const sketchFactory = vi.fn(() => vi.fn())
      const renderer = new P5VizRenderer(sketchFactory)
      renderer.mount(
        document.createElement('div'),
        {} as Partial<EngineComponents>,
        { w: 400, h: 200 },
        vi.fn(),
      )
      const args = sketchFactory.mock.calls[0] as unknown[]
      const uniforms = (args[5] as { current: StaveUniforms })
        .current as unknown as Record<string, unknown>
      // No `kick` (no custom alias); built-in `uKick` still present.
      expect('kick' in uniforms).toBe(false)
      expect('uKick' in uniforms).toBe(true)
    })
  })
})
