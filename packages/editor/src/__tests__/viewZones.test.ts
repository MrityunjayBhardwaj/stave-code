import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EngineComponents } from '../engine/LiveCodingEngine'
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
    renderer: { mount: vi.fn(), update: vi.fn(), resize: vi.fn(), pause: vi.fn(), resume: vi.fn(), destroy: vi.fn() },
    disconnect: vi.fn(),
  })),
}))

// Shared mock renderer so tests can assert pause/resume calls across
// all instances produced by the factory.
const mockRenderer = {
  mount: vi.fn(), update: vi.fn(), resize: vi.fn(),
  pause: vi.fn(), resume: vi.fn(), destroy: vi.fn(),
}
const mockPianorollFactory = vi.fn(() => mockRenderer)
const mockScopeFactory = vi.fn(() => mockRenderer)

const mockVizDescriptors = [
  { id: 'pianoroll', label: 'Piano Roll', requires: ['streaming', 'queryable'] as (keyof EngineComponents)[], factory: mockPianorollFactory },
  { id: 'scope', label: 'Scope', requires: ['audio'] as (keyof EngineComponents)[], factory: mockScopeFactory },
]

function makeEditor() {
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

  const editor = {
    changeViewZones,
    getLayoutInfo: vi.fn(() => ({ contentWidth: 800 })),
  }

  return { editor, accessor, addedZones, removedIds, changeViewZones }
}

function makeComponents(
  vizRequests: Map<string, { vizId: string; afterLine: number }>,
  trackSchedulers?: Map<string, unknown>
): Partial<EngineComponents> {
  return {
    inlineViz: { vizRequests },
    queryable: {
      scheduler: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      trackSchedulers: (trackSchedulers ?? new Map()) as any,
    },
  }
}

describe('addInlineViewZones', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls editor.changeViewZones when vizRequests are present', () => {
    const { editor, changeViewZones } = makeEditor()
    const components = makeComponents(
      new Map([['$0', { vizId: 'pianoroll', afterLine: 2 }]])
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, components, mockVizDescriptors as any)

    expect(changeViewZones).toHaveBeenCalled()
  })

  it('adds a zone for each vizRequest with computed height', () => {
    const { editor, addedZones } = makeEditor()
    const components = makeComponents(
      new Map([
        ['$0', { vizId: 'pianoroll', afterLine: 1 }],
        ['$1', { vizId: 'pianoroll', afterLine: 3 }],
      ])
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, components, mockVizDescriptors as any)

    // Default native 1200×600, contentWidth 800, full crop →
    // zoneH = 800 * (600/1200) = 400
    expect(addedZones).toHaveLength(2)
    expect(addedZones[0].heightInPx).toBe(400)
    expect(addedZones[1].heightInPx).toBe(400)
  })

  it('returns no-op InlineZoneHandle when no vizRequests', () => {
    const { editor } = makeEditor()
    const components: Partial<EngineComponents> = {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = addInlineViewZones(editor as any, components, mockVizDescriptors as any)

    expect(typeof handle.cleanup).toBe('function')
    expect(typeof handle.pause).toBe('function')
    expect(typeof handle.resume).toBe('function')
    // Should not throw
    expect(() => handle.cleanup()).not.toThrow()
    expect(() => handle.pause()).not.toThrow()
    expect(() => handle.resume()).not.toThrow()
  })

  it('returns no-op InlineZoneHandle when vizRequests map is empty', () => {
    const { editor } = makeEditor()
    const components = makeComponents(new Map())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = addInlineViewZones(editor as any, components, mockVizDescriptors as any)

    expect(typeof handle.cleanup).toBe('function')
    expect(() => handle.cleanup()).not.toThrow()
  })

  it('returns an InlineZoneHandle with cleanup, pause, resume', () => {
    const { editor } = makeEditor()
    const components = makeComponents(
      new Map([['$0', { vizId: 'pianoroll', afterLine: 1 }]])
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = addInlineViewZones(editor as any, components, mockVizDescriptors as any)

    expect(typeof handle.cleanup).toBe('function')
    expect(typeof handle.pause).toBe('function')
    expect(typeof handle.resume).toBe('function')
  })

  it('handle.cleanup() calls editor.changeViewZones to remove zones', () => {
    const { editor, removedIds, changeViewZones } = makeEditor()
    const components = makeComponents(
      new Map([
        ['$0', { vizId: 'pianoroll', afterLine: 1 }],
        ['$1', { vizId: 'pianoroll', afterLine: 3 }],
      ])
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = addInlineViewZones(editor as any, components, mockVizDescriptors as any)
    handle.cleanup()

    // changeViewZones called once for add, once for remove
    expect(changeViewZones).toHaveBeenCalledTimes(2)
    expect(removedIds).toHaveLength(2)
  })

  it('second call triggers cleanup of first call zones before adding new ones', () => {
    const { editor, changeViewZones } = makeEditor()
    const components = makeComponents(
      new Map([['$0', { vizId: 'pianoroll', afterLine: 1 }]])
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle1 = addInlineViewZones(editor as any, components, mockVizDescriptors as any)
    handle1.cleanup()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, components, mockVizDescriptors as any)

    // add, remove (cleanup1), add (second call) = 3
    expect(changeViewZones).toHaveBeenCalledTimes(3)
  })

  it('places zone at afterLine from vizRequest', () => {
    const { editor, addedZones } = makeEditor()
    const components = makeComponents(
      new Map([['$0', { vizId: 'pianoroll', afterLine: 5 }]])
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, components, mockVizDescriptors as any)

    expect(addedZones[0].afterLineNumber).toBe(5)
  })

  it('resolves factory from vizDescriptors by vizId', () => {
    const { editor } = makeEditor()
    const components = makeComponents(
      new Map([['$0', { vizId: 'pianoroll', afterLine: 1 }]])
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, components, mockVizDescriptors as any)

    expect(mockPianorollFactory).toHaveBeenCalled()
    expect(mockRenderer.mount).toHaveBeenCalled()
  })

  it('resolves track-scoped scheduler from trackSchedulers', () => {
    const { editor } = makeEditor()
    const mockScheduler = { now: vi.fn(), query: vi.fn() }
    const trackSchedulers = new Map([['$0', mockScheduler]])
    const components = makeComponents(
      new Map([
        ['$0', { vizId: 'pianoroll', afterLine: 1 }],
        ['$1', { vizId: 'pianoroll', afterLine: 3 }],
      ]),
      trackSchedulers
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, components, mockVizDescriptors as any)

    // mount called per zone; first call's second arg (components)
    // should carry the track-scoped scheduler.
    const firstMountCall = (mockRenderer.mount as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(firstMountCall[1].queryable.scheduler).toBe(mockScheduler)
  })

  it('passes native canvas size (not contentWidth) to renderer.mount', () => {
    const { editor } = makeEditor()
    const components = makeComponents(
      new Map([['$0', { vizId: 'pianoroll', afterLine: 1 }]])
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, components, mockVizDescriptors as any)

    // Default native size is 1200×600
    const firstMountCall = (mockRenderer.mount as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(firstMountCall[2]).toEqual({ w: 1200, h: 600 })
  })

  it('handle.pause() calls renderer.pause() on all renderers', () => {
    const { editor } = makeEditor()
    const components = makeComponents(
      new Map([
        ['$0', { vizId: 'pianoroll', afterLine: 1 }],
        ['$1', { vizId: 'pianoroll', afterLine: 3 }],
      ])
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = addInlineViewZones(editor as any, components, mockVizDescriptors as any)
    handle.pause()
    expect(mockRenderer.pause).toHaveBeenCalled()
  })

  it('handle.resume() calls renderer.resume() on all renderers', () => {
    const { editor } = makeEditor()
    const components = makeComponents(
      new Map([
        ['$0', { vizId: 'pianoroll', afterLine: 1 }],
        ['$1', { vizId: 'pianoroll', afterLine: 3 }],
      ])
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = addInlineViewZones(editor as any, components, mockVizDescriptors as any)
    handle.resume()
    expect(mockRenderer.resume).toHaveBeenCalled()
  })

  it('adds zone only for tracks present in vizRequests', () => {
    const { editor, addedZones } = makeEditor()
    const components = makeComponents(
      new Map([['$0', { vizId: 'pianoroll', afterLine: 1 }]])  // only one track
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, components, mockVizDescriptors as any)
    expect(addedZones).toHaveLength(1)
  })

  it('logs warning and skips zone for unknown vizId', () => {
    const { editor, addedZones } = makeEditor()
    const components = makeComponents(
      new Map([['$0', { vizId: 'nonexistent', afterLine: 1 }]])
    )
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, components, mockVizDescriptors as any)

    expect(addedZones).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('nonexistent'))
    warnSpy.mockRestore()
  })
})
