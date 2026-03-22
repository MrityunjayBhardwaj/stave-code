import { describe, it, expect, vi, beforeEach } from 'vitest'

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
import type { VizRefs } from '../visualizers/types'

function makeRefs(): VizRefs {
  return {
    hapStreamRef: { current: null },
    analyserRef: { current: null },
    schedulerRef: { current: null },
  }
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

    renderer.mount(container, makeRefs(), { w: 400, h: 200 }, vi.fn())

    expect(MockP5).toHaveBeenCalledTimes(1)
    expect(MockP5.mock.calls[0][1]).toBe(container)
  })

  it('mount() calls resizeCanvas with provided size', () => {
    const sketchFactory = vi.fn(() => vi.fn())
    const renderer = new P5VizRenderer(sketchFactory)
    const container = document.createElement('div')

    renderer.mount(container, makeRefs(), { w: 300, h: 150 }, vi.fn())

    expect(p5Instances[0].resizeCanvas).toHaveBeenCalledWith(300, 150)
  })

  it('mount() passes refs to sketch factory', () => {
    const sketchFactory = vi.fn(() => vi.fn())
    const renderer = new P5VizRenderer(sketchFactory)
    const refs = makeRefs()

    renderer.mount(document.createElement('div'), refs, { w: 400, h: 200 }, vi.fn())

    expect(sketchFactory).toHaveBeenCalledWith(
      refs.hapStreamRef,
      refs.analyserRef,
      refs.schedulerRef
    )
  })

  it('mount() calls onError if sketch factory throws', () => {
    const sketchFactory = vi.fn(() => {
      throw new Error('sketch error')
    })
    const renderer = new P5VizRenderer(sketchFactory)
    const onError = vi.fn()

    renderer.mount(document.createElement('div'), makeRefs(), { w: 400, h: 200 }, onError)

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0].message).toBe('sketch error')
  })

  it('resize() calls resizeCanvas on the p5 instance', () => {
    const sketchFactory = vi.fn(() => vi.fn())
    const renderer = new P5VizRenderer(sketchFactory)
    renderer.mount(document.createElement('div'), makeRefs(), { w: 400, h: 200 }, vi.fn())

    renderer.resize(500, 300)

    expect(p5Instances[0].resizeCanvas).toHaveBeenCalledWith(500, 300)
  })

  it('pause() calls noLoop on the p5 instance', () => {
    const sketchFactory = vi.fn(() => vi.fn())
    const renderer = new P5VizRenderer(sketchFactory)
    renderer.mount(document.createElement('div'), makeRefs(), { w: 400, h: 200 }, vi.fn())

    renderer.pause()

    expect(p5Instances[0].noLoop).toHaveBeenCalledTimes(1)
  })

  it('resume() calls loop on the p5 instance', () => {
    const sketchFactory = vi.fn(() => vi.fn())
    const renderer = new P5VizRenderer(sketchFactory)
    renderer.mount(document.createElement('div'), makeRefs(), { w: 400, h: 200 }, vi.fn())

    renderer.resume()

    expect(p5Instances[0].loop).toHaveBeenCalledTimes(1)
  })

  it('destroy() calls remove on the p5 instance and nulls it', () => {
    const sketchFactory = vi.fn(() => vi.fn())
    const renderer = new P5VizRenderer(sketchFactory)
    renderer.mount(document.createElement('div'), makeRefs(), { w: 400, h: 200 }, vi.fn())

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
})
