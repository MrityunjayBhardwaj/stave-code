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

const mockVizDescriptors = [
  { id: 'pianoroll', label: 'Piano Roll', factory: () => ({ mount: vi.fn(), resize: vi.fn(), pause: vi.fn(), resume: vi.fn(), destroy: vi.fn() }) },
  { id: 'scope', label: 'Scope', factory: () => ({ mount: vi.fn(), resize: vi.fn(), pause: vi.fn(), resume: vi.fn(), destroy: vi.fn() }) },
]

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
    const vizRequests = new Map([['$0', 'pianoroll']])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, null, null, new Map(), vizRequests, mockVizDescriptors as any)

    expect(changeViewZones).toHaveBeenCalled()
  })

  it('adds a zone for each $: line with heightInPx 150', () => {
    const code = '$: note("c3").s("sine")\n$: note("e3").s("sine")'
    const { editor, addedZones } = makeEditor(code)
    const vizRequests = new Map([['$0', 'pianoroll'], ['$1', 'pianoroll']])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, null, null, new Map(), vizRequests, mockVizDescriptors as any)

    expect(addedZones).toHaveLength(2)
    expect(addedZones[0].heightInPx).toBe(150)
    expect(addedZones[1].heightInPx).toBe(150)
  })

  it('does not add zones for non-$: lines', () => {
    const code = 'setcps(0.5)\nnote("c3").s("sine")'
    const { editor, addedZones } = makeEditor(code)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, null, null, new Map(), new Map(), mockVizDescriptors as any)

    expect(addedZones).toHaveLength(0)
  })

  it('returns an InlineZoneHandle with cleanup, pause, resume', () => {
    const code = '$: note("c3")'
    const { editor } = makeEditor(code)
    const vizRequests = new Map([['$0', 'pianoroll']])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = addInlineViewZones(editor as any, null, null, new Map(), vizRequests, mockVizDescriptors as any)

    expect(typeof handle.cleanup).toBe('function')
    expect(typeof handle.pause).toBe('function')
    expect(typeof handle.resume).toBe('function')
  })

  it('handle.cleanup() calls editor.changeViewZones to remove zones', () => {
    const code = '$: note("c3")\n$: note("e3")'
    const { editor, removedIds, changeViewZones } = makeEditor(code)
    const vizRequests = new Map([['$0', 'pianoroll'], ['$1', 'pianoroll']])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = addInlineViewZones(editor as any, null, null, new Map(), vizRequests, mockVizDescriptors as any)
    handle.cleanup()

    // changeViewZones called once for add, once for remove
    expect(changeViewZones).toHaveBeenCalledTimes(2)
    expect(removedIds).toHaveLength(2)
  })

  it('second call triggers cleanup of first call zones before adding new ones', () => {
    const code = '$: note("c3")'
    const { editor, changeViewZones } = makeEditor(code)
    const vizRequests = new Map([['$0', 'pianoroll']])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle1 = addInlineViewZones(editor as any, null, null, new Map(), vizRequests, mockVizDescriptors as any)
    // Simulate external cleanup tracking by simulating what StrudelEditor does:
    // call cleanup() before adding new zones (the caller's responsibility).
    handle1.cleanup()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, null, null, new Map(), vizRequests, mockVizDescriptors as any)

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
    const handle = addInlineViewZones(editor as any, null, null, new Map(), new Map(), mockVizDescriptors as any)

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
    const vizRequests = new Map([['$0', 'pianoroll']])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, null, null, new Map(), vizRequests, mockVizDescriptors as any)

    // Line 2 (1-indexed) is the $: line
    expect(addedZones[0].afterLineNumber).toBe(2)
  })

  it('resolves factory from vizDescriptors by vizName', () => {
    const code = '$: note("c3")'
    const { editor } = makeEditor(code)
    const vizRequests = new Map([['$0', 'pianoroll']])
    addInlineViewZones(editor as any, null, null, new Map(), vizRequests, mockVizDescriptors as any) // eslint-disable-line @typescript-eslint/no-explicit-any

    expect(mountVizRenderer).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      mockVizDescriptors[0].factory,
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
    const vizRequests = new Map([['$0', 'pianoroll'], ['$1', 'pianoroll']])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, null, null, trackSchedulers, vizRequests, mockVizDescriptors as any)

    // mountVizRenderer called twice; first call should have queryable.scheduler === mockScheduler
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstCallComponents = (mountVizRenderer as any).mock.calls[0][2]
    expect(firstCallComponents.queryable.scheduler).toBe(mockScheduler)
  })

  it('uses editor.getLayoutInfo().contentWidth for initial size', () => {
    const code = '$: note("c3")'
    const { editor } = makeEditor(code)
    const vizRequests = new Map([['$0', 'pianoroll']])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, null, null, new Map(), vizRequests, mockVizDescriptors as any)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((mountVizRenderer as any).mock.calls[0][3]).toEqual({ w: 800, h: 150 })
  })

  it('handle.pause() calls renderer.pause() on all renderers', () => {
    const code = '$: note("c3")\n$: note("e3")'
    const { editor } = makeEditor(code)
    const vizRequests = new Map([['$0', 'pianoroll'], ['$1', 'pianoroll']])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = addInlineViewZones(editor as any, null, null, new Map(), vizRequests, mockVizDescriptors as any)
    handle.pause()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockRenderer = (mountVizRenderer as any).mock.results[0].value.renderer
    expect(mockRenderer.pause).toHaveBeenCalled()
  })

  it('handle.resume() calls renderer.resume() on all renderers', () => {
    const code = '$: note("c3")\n$: note("e3")'
    const { editor } = makeEditor(code)
    const vizRequests = new Map([['$0', 'pianoroll'], ['$1', 'pianoroll']])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = addInlineViewZones(editor as any, null, null, new Map(), vizRequests, mockVizDescriptors as any)
    handle.resume()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockRenderer = (mountVizRenderer as any).mock.results[0].value.renderer
    expect(mockRenderer.resume).toHaveBeenCalled()
  })

  it('adds zone only for $: lines present in vizRequests', () => {
    const code = '$: note("c3")\n$: note("e3")'
    const { editor, addedZones } = makeEditor(code)
    const vizRequests = new Map([['$0', 'pianoroll']])  // only first pattern
    addInlineViewZones(editor as any, null, null, new Map(), vizRequests, mockVizDescriptors as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(addedZones).toHaveLength(1)
  })

  it('logs warning and skips zone for unknown vizName', () => {
    const code = '$: note("c3")'
    const { editor, addedZones } = makeEditor(code)
    const vizRequests = new Map([['$0', 'nonexistent']])
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    addInlineViewZones(editor as any, null, null, new Map(), vizRequests, mockVizDescriptors as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(addedZones).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('nonexistent'))
    warnSpy.mockRestore()
  })

  it('places zone after last line of multi-line pattern block', () => {
    const code = '$: note("c4")\n  .s("sine")\n  .viz("pianoroll")'
    const { editor, addedZones } = makeEditor(code)
    const vizRequests = new Map([['$0', 'pianoroll']])
    addInlineViewZones(editor as any, null, null, new Map(), vizRequests, mockVizDescriptors as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(addedZones).toHaveLength(1)
    expect(addedZones[0].afterLineNumber).toBe(3)  // after last continuation line
  })
})
