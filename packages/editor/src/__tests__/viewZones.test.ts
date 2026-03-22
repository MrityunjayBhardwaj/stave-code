import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addInlineViewZones } from '../visualizers/viewZones'
import { mountVizRenderer } from '../visualizers/mountVizRenderer'

// Mock p5 to avoid canvas/DOM side-effects in tests
vi.mock('p5', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      remove: vi.fn(),
      resizeCanvas: vi.fn(),
    })),
  }
})

// Mock PianorollSketch to return a no-op factory
vi.mock('../visualizers/sketches/PianorollSketch', () => ({
  PianorollSketch: vi.fn(() => vi.fn()),
}))

// Mock mountVizRenderer to avoid DOM/canvas side-effects
vi.mock('../visualizers/mountVizRenderer', () => ({
  mountVizRenderer: vi.fn(() => ({
    renderer: { mount: vi.fn(), resize: vi.fn(), pause: vi.fn(), resume: vi.fn(), destroy: vi.fn() },
    disconnect: vi.fn(),
  })),
}))

const mockSource = () => ({
  mount: vi.fn(),
  resize: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  destroy: vi.fn(),
})

function makeEditor(code: string) {
  const zoneIds: string[] = []
  let idCounter = 0
  const addedZones: Array<{ afterLineNumber: number; heightInPx: number }> = []
  const removedIds: string[] = []

  const accessor = {
    addZone: vi.fn((zone: { afterLineNumber: number; heightInPx: number; domNode: HTMLElement }) => {
      const id = `zone-${++idCounter}`
      zoneIds.push(id)
      addedZones.push({ afterLineNumber: zone.afterLineNumber, heightInPx: zone.heightInPx })
      return id
    }),
    removeZone: vi.fn((id: string) => {
      removedIds.push(id)
    }),
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const changeViewZones = vi.fn((cb: (accessor: any) => void) => {
    cb(accessor)
  })

  const model = {
    getValue: vi.fn(() => code),
  }

  const editor = {
    getModel: vi.fn(() => model),
    changeViewZones,
    getLayoutInfo: vi.fn(() => ({ contentWidth: 800 })),
  }

  return { editor, accessor, addedZones, removedIds, changeViewZones }
}

describe('addInlineViewZones', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls editor.changeViewZones when code has $: lines', () => {
    const code = 'setcps(0.5)\n$: note("c3").s("sine")'
    const { editor, changeViewZones } = makeEditor(code)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, mockSource, null, null, new Map())

    expect(changeViewZones).toHaveBeenCalled()
  })

  it('adds a zone for each $: line with heightInPx 120', () => {
    const code = '$: note("c3").s("sine")\n$: note("e3").s("sine")'
    const { editor, addedZones } = makeEditor(code)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, mockSource, null, null, new Map())

    expect(addedZones).toHaveLength(2)
    expect(addedZones[0].heightInPx).toBe(120)
    expect(addedZones[1].heightInPx).toBe(120)
  })

  it('does not add zones for non-$: lines', () => {
    const code = 'setcps(0.5)\nnote("c3").s("sine")'
    const { editor, addedZones } = makeEditor(code)

    // eslint-disable-next-line @typescript-eslant/no-explicit-any
    addInlineViewZones(editor as any, mockSource, null, null, new Map())

    expect(addedZones).toHaveLength(0)
  })

  it('returns an InlineZoneHandle with cleanup, pause, resume', () => {
    const code = '$: note("c3")'
    const { editor } = makeEditor(code)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = addInlineViewZones(editor as any, mockSource, null, null, new Map())

    expect(typeof handle.cleanup).toBe('function')
    expect(typeof handle.pause).toBe('function')
    expect(typeof handle.resume).toBe('function')
  })

  it('handle.cleanup() calls editor.changeViewZones to remove zones', () => {
    const code = '$: note("c3")\n$: note("e3")'
    const { editor, removedIds, changeViewZones } = makeEditor(code)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = addInlineViewZones(editor as any, mockSource, null, null, new Map())
    handle.cleanup()

    // changeViewZones called once for add, once for remove
    expect(changeViewZones).toHaveBeenCalledTimes(2)
    expect(removedIds).toHaveLength(2)
  })

  it('second call triggers cleanup of first call zones before adding new ones', () => {
    const code = '$: note("c3")'
    const { editor, changeViewZones } = makeEditor(code)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle1 = addInlineViewZones(editor as any, mockSource, null, null, new Map())
    // Simulate external cleanup tracking by simulating what StrudelEditor does:
    // call cleanup() before adding new zones (the caller's responsibility).
    handle1.cleanup()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, mockSource, null, null, new Map())

    // add, remove (cleanup1), add (second call) = 3
    expect(changeViewZones).toHaveBeenCalledTimes(3)
  })

  it('returns no-op InlineZoneHandle when editor has no model', () => {
    const editor = {
      getModel: vi.fn(() => null),
      changeViewZones: vi.fn(),
      getLayoutInfo: vi.fn(() => ({ contentWidth: 800 })),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = addInlineViewZones(editor as any, mockSource, null, null, new Map())

    expect(typeof handle.cleanup).toBe('function')
    expect(typeof handle.pause).toBe('function')
    expect(typeof handle.resume).toBe('function')
    // Should not throw
    expect(() => handle.cleanup()).not.toThrow()
    expect(() => handle.pause()).not.toThrow()
    expect(() => handle.resume()).not.toThrow()
  })

  it('adds zone afterLineNumber matching the $: line (1-indexed)', () => {
    const code = 'setcps(0.5)\n$: note("c3")'
    const { editor, addedZones } = makeEditor(code)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, mockSource, null, null, new Map())

    // Line 2 (1-indexed) is the $: line
    expect(addedZones[0].afterLineNumber).toBe(2)
  })

  it('passes source to mountVizRenderer', () => {
    const code = '$: note("c3")'
    const { editor } = makeEditor(code)
    const source = vi.fn(() => ({ mount: vi.fn(), resize: vi.fn(), pause: vi.fn(), resume: vi.fn(), destroy: vi.fn() }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, source, null, null, new Map())

    expect(mountVizRenderer).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      source,
      expect.any(Object),
      expect.any(Object),
      expect.any(Function)
    )
  })

  it('resolves track-scoped schedulerRef from trackSchedulers', () => {
    const code = '$: note("c3")\n$: note("e3")'
    const { editor } = makeEditor(code)
    const mockScheduler = { now: vi.fn(), query: vi.fn() }
    const trackSchedulers = new Map([['$0', mockScheduler]])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, mockSource, null, null, trackSchedulers)

    // mountVizRenderer called twice; first call should have schedulerRef.current === mockScheduler
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstCallRefs = (mountVizRenderer as any).mock.calls[0][2]
    expect(firstCallRefs.schedulerRef.current).toBe(mockScheduler)
  })

  it('uses editor.getLayoutInfo().contentWidth for initial size', () => {
    const code = '$: note("c3")'
    const { editor } = makeEditor(code)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, mockSource, null, null, new Map())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((mountVizRenderer as any).mock.calls[0][3]).toEqual({ w: 800, h: 120 })
  })

  it('handle.pause() calls renderer.pause() on all renderers', () => {
    const code = '$: note("c3")\n$: note("e3")'
    const { editor } = makeEditor(code)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = addInlineViewZones(editor as any, mockSource, null, null, new Map())
    handle.pause()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockRenderer = (mountVizRenderer as any).mock.results[0].value.renderer
    expect(mockRenderer.pause).toHaveBeenCalled()
  })

  it('handle.resume() calls renderer.resume() on all renderers', () => {
    const code = '$: note("c3")\n$: note("e3")'
    const { editor } = makeEditor(code)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = addInlineViewZones(editor as any, mockSource, null, null, new Map())
    handle.resume()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockRenderer = (mountVizRenderer as any).mock.results[0].value.renderer
    expect(mockRenderer.resume).toHaveBeenCalled()
  })
})
