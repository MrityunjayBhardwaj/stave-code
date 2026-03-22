import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addInlineViewZones } from '../visualizers/viewZones'

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
  }

  return { editor, accessor, addedZones, removedIds, changeViewZones }
}

describe('addInlineViewZones', () => {
  it('calls editor.changeViewZones when code has $: lines', () => {
    const code = 'setcps(0.5)\n$: note("c3").s("sine")'
    const { editor, changeViewZones } = makeEditor(code)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, null, null)

    expect(changeViewZones).toHaveBeenCalled()
  })

  it('adds a zone for each $: line with heightInPx 120', () => {
    const code = '$: note("c3").s("sine")\n$: note("e3").s("sine")'
    const { editor, addedZones } = makeEditor(code)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, null, null)

    expect(addedZones).toHaveLength(2)
    expect(addedZones[0].heightInPx).toBe(120)
    expect(addedZones[1].heightInPx).toBe(120)
  })

  it('does not add zones for non-$: lines', () => {
    const code = 'setcps(0.5)\nnote("c3").s("sine")'
    const { editor, addedZones } = makeEditor(code)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, null, null)

    expect(addedZones).toHaveLength(0)
  })

  it('returns a cleanup function', () => {
    const code = '$: note("c3")'
    const { editor } = makeEditor(code)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleanup = addInlineViewZones(editor as any, null, null)

    expect(typeof cleanup).toBe('function')
  })

  it('cleanup function calls editor.changeViewZones to remove zones', () => {
    const code = '$: note("c3")\n$: note("e3")'
    const { editor, removedIds, changeViewZones } = makeEditor(code)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleanup = addInlineViewZones(editor as any, null, null)
    cleanup()

    // changeViewZones called once for add, once for remove
    expect(changeViewZones).toHaveBeenCalledTimes(2)
    expect(removedIds).toHaveLength(2)
  })

  it('second call triggers cleanup of first call zones before adding new ones', () => {
    const code = '$: note("c3")'
    const { editor, changeViewZones } = makeEditor(code)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleanup1 = addInlineViewZones(editor as any, null, null)
    // Simulate external cleanup tracking by simulating what StrudelEditor does:
    // call cleanup1() before adding new zones (the caller's responsibility).
    cleanup1()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, null, null)

    // add, remove (cleanup1), add (second call) = 3
    expect(changeViewZones).toHaveBeenCalledTimes(3)
  })

  it('returns no-op cleanup when editor has no model', () => {
    const editor = {
      getModel: vi.fn(() => null),
      changeViewZones: vi.fn(),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleanup = addInlineViewZones(editor as any, null, null)

    expect(typeof cleanup).toBe('function')
    // Should not throw
    expect(() => cleanup()).not.toThrow()
  })

  it('adds zone afterLineNumber matching the $: line (1-indexed)', () => {
    const code = 'setcps(0.5)\n$: note("c3")'
    const { editor, addedZones } = makeEditor(code)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addInlineViewZones(editor as any, null, null)

    // Line 2 (1-indexed) is the $: line
    expect(addedZones[0].afterLineNumber).toBe(2)
  })
})
