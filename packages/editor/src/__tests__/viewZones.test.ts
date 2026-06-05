import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EngineComponents } from '../engine/LiveCodingEngine'
import { addInlineViewZones } from '../visualizers/viewZones'
import { mountVizRenderer } from '../visualizers/mountVizRenderer'
import { getInlineVizResolution } from '../workspace/editorRegistry'

// Mock p5 to avoid canvas/DOM side-effects in tests
vi.mock('p5', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      remove: vi.fn(),
      resizeCanvas: vi.fn(),
    })),
  }
})

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

interface MockDecoration {
  ranges: Array<{
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
  }>
  cleared: boolean
}

function makeEditor(initialCode = '') {
  const zoneIds: string[] = []
  let idCounter = 0
  const addedZones: Array<{ afterLineNumber: number; heightInPx: number }> = []
  const removedIds: string[] = []
  const decorations: MockDecoration[] = []

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
    getModel: () => ({
      getValue: () => code,
      getLineMaxColumn: () => 80,
    }),
    onDidChangeModelContent: vi.fn((cb: () => void) => {
      contentChangeListeners.push(cb)
      return { dispose: () => {
        const i = contentChangeListeners.indexOf(cb)
        if (i >= 0) contentChangeListeners.splice(i, 1)
      } }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createDecorationsCollection: vi.fn((items: Array<{ range: any }>) => {
      const dec: MockDecoration = {
        ranges: items.map((i) => ({ ...i.range })),
        cleared: false,
      }
      decorations.push(dec)
      return {
        getRanges: () => (dec.cleared ? [] : dec.ranges),
        clear: () => { dec.cleared = true },
      }
    }),
  }

  const setCode = (newCode: string, decorationLineShift = 0) => {
    code = newCode
    if (decorationLineShift !== 0) {
      for (const dec of decorations) {
        if (dec.cleared) continue
        for (const r of dec.ranges) {
          r.startLineNumber += decorationLineShift
          r.endLineNumber += decorationLineShift
        }
      }
    }
    for (const cb of contentChangeListeners) cb()
  }

  return { editor, accessor, addedZones, removedIds, changeViewZones, setCode, decorations }
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

  it('passes the render resolution (aspect-preserved, height = inlineVizResolution) to renderer.mount', () => {
    const { editor } = makeEditor()
    const components = makeComponents(
      new Map([['$0', { vizId: 'pianoroll', afterLine: 1 }]])
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, components, mockVizDescriptors as any)

    // #261: mount renders at the configured render RESOLUTION, not the descriptor
    // native — height = inlineVizResolution, width aspect-preserved from the
    // native 1200×600 (2:1). Display/crop/zone-height stay driven by `native`
    // (computeLayout, unchanged); only the rendered backing store changes.
    const res = getInlineVizResolution() // default 512
    const firstMountCall = (mockRenderer.mount as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(firstMountCall[2]).toEqual({ w: res * 2, h: res })
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
  // Decoration-based anchor: Monaco tracks the .viz() text position, so the
  // mock simulates the decoration shifting down by (lineShift) when the edit
  // adds lines before the .viz() call.
  it('re-anchors zone to new block-end line when code grows without re-eval', () => {
    const initial = '$: s("bd*4").viz("pianoroll")\n'
    const { editor, addedZones, removedIds, setCode } = makeEditor(initial)
    const components = makeComponents(
      new Map([['$0', { vizId: 'pianoroll', afterLine: 1 }]])
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, components, mockVizDescriptors as any)
    expect(addedZones).toHaveLength(1)
    expect(addedZones[0].afterLineNumber).toBe(1)

    // User expands the one-liner into a 5-line block — .viz() moves to line 5.
    setCode(
      '$: stack(\n' +
      '  s("hh*8").gain(0.3),\n' +
      '  s("bd [~ bd] ~ bd").gain(0.5),\n' +
      '  s("~ sd ~ [sd cp]").gain(0.4)\n' +
      ').viz("pianoroll")\n',
      4, // decoration shifts from line 1 → line 5
    )

    expect(removedIds).toContain('zone-1')
    expect(addedZones).toHaveLength(2)
    expect(addedZones[1].afterLineNumber).toBe(5)
  })

  // Regression for #27 — trailing `//` comments must not drag the anchor.
  it('re-anchors zone immediately after .viz() even with trailing // comments', () => {
    const initial =
      '$: stack(\n' +
      '  note("c4 e4").s("saw")\n' +
      ').viz("pianoroll")\n'
    const { editor, addedZones, setCode } = makeEditor(initial)
    const components = makeComponents(
      new Map([['$0', { vizId: 'pianoroll', afterLine: 3 }]])
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, components, mockVizDescriptors as any)
    expect(addedZones[0].afterLineNumber).toBe(3)

    // User appends trailing // comments. The .viz() text doesn't move, so
    // the decoration stays at line 3. Block-end scan still stops at line 3
    // because // lines don't advance lastLineIdx (#27).
    setCode(
      initial +
      '\n' +
      '// $: stack(\n' +
      '//   s("hh*2").gain(0.3)\n' +
      '// )\n'
    )

    const latestAfterLine = addedZones[addedZones.length - 1].afterLineNumber
    expect(latestAfterLine).toBe(3)
  })

  // Regression for #28 — inserting a new $: above a viz'd block must not
  // drag the zone to the new (empty) block.
  // Decoration-based: when the user inserts a line above the viz, Monaco
  // shifts the decoration down by 1. Walk-back finds the ORIGINAL block,
  // not the new one.
  it('zone stays anchored to its block when a new $: is inserted above', () => {
    const initial = '$: s("bd*4").viz("pianoroll")\n'
    const { editor, addedZones, removedIds, setCode } = makeEditor(initial)
    const components = makeComponents(
      new Map([['$0', { vizId: 'pianoroll', afterLine: 1 }]])
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, components, mockVizDescriptors as any)
    expect(addedZones[0].afterLineNumber).toBe(1)

    // User types a new $: above. Decoration shifts line 1 → line 2.
    setCode('$:\n' + initial, 1)

    // Re-anchor finds the $: at line 2 (the original block), block end at
    // line 2. New afterLine = 2. The zone moves DOWN by 1 (because the
    // whole block shifted), but it is still anchored to its own block —
    // NOT the new empty $: at line 1.
    expect(addedZones).toHaveLength(2)
    expect(addedZones[addedZones.length - 1].afterLineNumber).toBe(2)
    expect(removedIds).toContain('zone-1')
  })

  // Regression for #29 — zone anchored to its .viz() source must survive
  // unrelated block insertions further away in the file.
  it('zone stays on its .viz() line when a new $: block is inserted between existing ones', () => {
    const initial =
      '$: s("hh*8").gain(0.3)\n' +
      '\n' +
      '$: s("bd*4").viz("pianoroll")\n'
    const { editor, addedZones, removedIds, setCode } = makeEditor(initial)
    const components = makeComponents(
      new Map([['$1', { vizId: 'pianoroll', afterLine: 3 }]])
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, components, mockVizDescriptors as any)
    expect(addedZones[0].afterLineNumber).toBe(3)

    // User inserts a new $:(  ) block between the two originals — adds 3
    // lines before the viz'd block. Decoration shifts from line 3 → line 6.
    setCode(
      '$: s("hh*8").gain(0.3)\n' +
      '\n' +
      '$:(\n' +
      ')\n' +
      '\n' +
      '$: s("bd*4").viz("pianoroll")\n',
      3,
    )

    // Decoration at line 6 points at the viz'd block. Re-anchor finds
    // block start at line 6, block end at line 6. New afterLine = 6 — zone
    // sits DIRECTLY under its own .viz("p5test") block, not inside the new
    // $:(  ) block further up.
    expect(removedIds).toContain('zone-1')
    expect(addedZones[addedZones.length - 1].afterLineNumber).toBe(6)
  })

  it('does not re-anchor when decoration has been deleted (viz call text removed)', () => {
    const initial = '$: s("bd*4").viz("pianoroll")\n'
    const { editor, addedZones, removedIds, setCode, decorations } = makeEditor(initial)
    const components = makeComponents(
      new Map([['$0', { vizId: 'pianoroll', afterLine: 1 }]])
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, components, mockVizDescriptors as any)
    expect(addedZones).toHaveLength(1)

    // User deletes the .viz(...) text entirely. Simulate decoration
    // collapse by clearing it.
    decorations[0].cleared = true
    setCode('// nothing\n')

    // No re-anchor fires — decoration has no ranges, zone stays static
    // pending next evaluate.
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
