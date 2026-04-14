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

function makeEditor(initialCode = '') {
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

  let code = initialCode
  const contentChangeListeners: Array<() => void> = []

  const editor = {
    changeViewZones,
    getLayoutInfo: vi.fn(() => ({ contentWidth: 800 })),
    getModel: () => ({ getValue: () => code }),
    onDidChangeModelContent: vi.fn((cb: () => void) => {
      contentChangeListeners.push(cb)
      return { dispose: () => {
        const i = contentChangeListeners.indexOf(cb)
        if (i >= 0) contentChangeListeners.splice(i, 1)
      } }
    }),
  }

  const setCode = (newCode: string) => {
    code = newCode
    for (const cb of contentChangeListeners) cb()
  }

  return { editor, accessor, addedZones, removedIds, changeViewZones, setCode }
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

  // Regression for #25 — zone re-anchors as the user edits between evals.
  it('re-anchors zone to new block-end line when code grows without re-eval', () => {
    const { editor, addedZones, removedIds, setCode } = makeEditor(
      '$: s("bd*4").viz("pianoroll")\n' // 1 line — zone after line 1
    )
    const components = makeComponents(
      new Map([['$0', { vizId: 'pianoroll', afterLine: 1 }]])
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, components, mockVizDescriptors as any)
    expect(addedZones).toHaveLength(1)
    expect(addedZones[0].afterLineNumber).toBe(1)

    // User types: same block, now 5 lines. Block-end shifts from 1 to 5.
    setCode(
      '$: stack(\n' +
      '  s("hh*8").gain(0.3),\n' +
      '  s("bd [~ bd] ~ bd").gain(0.5),\n' +
      '  s("~ sd ~ [sd cp]").gain(0.4)\n' +
      ').viz("pianoroll")\n'
    )

    // Zone removed + re-added with new afterLineNumber; same domNode preserved
    // by the entry (we only check the wire-level move here).
    expect(removedIds).toContain('zone-1')
    expect(addedZones).toHaveLength(2)
    expect(addedZones[1].afterLineNumber).toBe(5)
  })

  it('does not re-anchor when block count changes (defers to next eval)', () => {
    const { editor, addedZones, removedIds, setCode } = makeEditor(
      '$: s("bd*4").viz("pianoroll")\n'
    )
    const components = makeComponents(
      new Map([['$0', { vizId: 'pianoroll', afterLine: 1 }]])
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, components, mockVizDescriptors as any)
    expect(addedZones).toHaveLength(1)

    // User deletes the only $: block — block count drops to zero.
    // The existing zone's trackKey $0 no longer has a matching block.
    // Don't touch it; the next eval will republish and rebuild.
    setCode('// nothing\n')

    expect(removedIds).toHaveLength(0)
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
