import { afterEach, describe, expect, it } from 'vitest'

import {
  bridgeAudioExtensions,
  canOpenAudioFrame,
  offlineContextInFrame,
  openAudioFrame,
  withAudioFrame,
} from '../audioFrame'

/**
 * #1758 — the frame module's own contract. That removing the frame really frees
 * a worklet-loaded context is a browser fact, measured in the browser
 * (`offline-render-memory.spec.ts`); here jsdom stands in for the DOM, and a
 * fake constructor on the frame's window stands in for its audio classes.
 */

const frames = () => document.querySelectorAll('iframe[data-stave-audio-frame]')

/** Give the most recently opened frame a fake OfflineAudioContext, and record what it builds. */
function fakeAudioOnLastFrame() {
  const all = frames()
  const win = (all[all.length - 1] as HTMLIFrameElement).contentWindow as unknown as Record<string, unknown>
  const built: unknown[][] = []
  win.OfflineAudioContext = class {
    constructor(...args: unknown[]) {
      built.push(args)
    }
  }
  return { win, built }
}

afterEach(() => {
  for (const f of frames()) f.remove()
})

describe('bridgeAudioExtensions', () => {
  /** A window-shaped object whose audio classes have the given prototype members. */
  const windowWith = (protos: Record<string, object>) =>
    Object.fromEntries(Object.entries(protos).map(([name, proto]) => [name, { prototype: proto }]))

  it("copies what the page added to its audio classes onto the frame's, descriptor and all", () => {
    const createReverb = function () {}
    const page = windowWith({ BaseAudioContext: { createReverb, createGain() {} } })
    Object.defineProperty(page.BaseAudioContext.prototype, 'hidden', { value: 1, enumerable: false, writable: false })
    const frame = windowWith({ BaseAudioContext: { createGain() {} } })

    expect(bridgeAudioExtensions(page, frame)).toBe(2)
    const theirs = frame.BaseAudioContext.prototype as Record<string, unknown>
    expect(theirs.createReverb).toBe(createReverb)
    expect(Object.getOwnPropertyDescriptor(theirs, 'hidden')).toEqual({ value: 1, enumerable: false, writable: false, configurable: false })
  })

  it("never replaces what the frame already has", () => {
    const framesOwn = function () {}
    const page = windowWith({ AudioNode: { connect() {} } })
    const frame = windowWith({ AudioNode: { connect: framesOwn } })
    expect(bridgeAudioExtensions(page, frame)).toBe(0)
    expect((frame.AudioNode.prototype as Record<string, unknown>).connect).toBe(framesOwn)
  })

  it('covers every audio class a library extends, and skips a class either side lacks', () => {
    const page = windowWith({
      BaseAudioContext: { a() {} },
      AudioContext: { b() {} },
      OfflineAudioContext: { c() {} },
      AudioNode: { d() {} },
      AudioParam: { e() {} },
      GainNode: { notBridged() {} },
    })
    const frame = windowWith({ BaseAudioContext: {}, AudioContext: {}, OfflineAudioContext: {}, AudioNode: {}, GainNode: {} })
    expect(bridgeAudioExtensions(page, frame)).toBe(4)
    expect(Object.keys(frame.GainNode.prototype)).toEqual([])
  })

  it('does nothing when both sides share one prototype', () => {
    const shared = { BaseAudioContext: { prototype: { a() {} } } }
    expect(bridgeAudioExtensions(shared, shared)).toBe(0)
  })
})

describe('openAudioFrame', () => {
  it('opens one hidden frame, and builds contexts with THAT frame’s constructor', () => {
    const frame = openAudioFrame()
    expect(frames()).toHaveLength(1)
    const el = frames()[0] as HTMLIFrameElement
    expect([el.style.display, el.getAttribute('aria-hidden'), el.getAttribute('tabindex')]).toEqual(['none', 'true', '-1'])

    const { win, built } = fakeAudioOnLastFrame()
    const ctx = frame.offlineContext(2, 480, 48000)
    expect(built).toEqual([[2, 480, 48000]])
    expect(ctx).toBeInstanceOf(win.OfflineAudioContext as new () => unknown)
    expect(frame.OfflineAudioContext).toBe(win.OfflineAudioContext)
  })

  it('dispose removes the frame, once, and a disposed frame builds nothing', () => {
    const frame = openAudioFrame()
    fakeAudioOnLastFrame()
    frame.dispose()
    frame.dispose()
    expect(frames()).toHaveLength(0)
    expect(frame.disposed).toBe(true)
    expect(() => frame.offlineContext(2, 1, 48000)).toThrow('disposed')
    expect(() => frame.OfflineAudioContext).toThrow('disposed')
  })

  it('each frame is its own, so disposing one leaves another open', () => {
    const a = openAudioFrame()
    const b = openAudioFrame()
    a.dispose()
    expect(frames()).toHaveLength(1)
    expect(b.disposed).toBe(false)
  })
})

describe('withAudioFrame', () => {
  it('disposes the frame when the work succeeds, and returns what the work returned', async () => {
    const out = await withAudioFrame(async (frame) => {
      expect(frames()).toHaveLength(1)
      return frame.disposed ? 'already gone' : 'rendered'
    })
    expect(out).toBe('rendered')
    expect(frames()).toHaveLength(0)
  })

  it('disposes the frame when the work throws, and passes the error on', async () => {
    await expect(
      withAudioFrame(() => {
        throw new Error('render failed')
      }),
    ).rejects.toThrow('render failed')
    expect(frames()).toHaveLength(0)
  })
})

describe('offlineContextInFrame', () => {
  it("returns a context whose dispose() removes the frame it was built in", () => {
    // The fake has to be on the frame before the context is built, so patch the
    // iframe prototype's getter for this one call.
    const getter = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow')!
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
      configurable: true,
      get() {
        const win = getter.get!.call(this) as Record<string, unknown>
        win.OfflineAudioContext ??= class {}
        return win
      },
    })
    try {
      const ctx = offlineContextInFrame(2, 480, 48000)
      expect(frames()).toHaveLength(1)
      ctx.dispose()
      expect(frames()).toHaveLength(0)
    } finally {
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', getter)
    }
  })

  it('removes the frame again when the context cannot be built', () => {
    // jsdom's frame has no OfflineAudioContext, so building one throws.
    expect(() => offlineContextInFrame(2, 480, 48000)).toThrow()
    expect(frames()).toHaveLength(0)
  })
})

describe('canOpenAudioFrame', () => {
  it('is false without a document, or without Web Audio', () => {
    expect(canOpenAudioFrame(undefined)).toBe(false)
    // jsdom has a document but no OfflineAudioContext.
    expect(canOpenAudioFrame(document)).toBe(false)
  })

  it('is true with a document body and Web Audio', () => {
    const g = globalThis as { OfflineAudioContext?: unknown }
    const had = g.OfflineAudioContext
    g.OfflineAudioContext = class {}
    try {
      expect(canOpenAudioFrame(document)).toBe(true)
    } finally {
      g.OfflineAudioContext = had
    }
  })
})
