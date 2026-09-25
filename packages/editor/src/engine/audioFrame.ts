/**
 * audioFrame — audio objects the browser can actually free (#1758).
 *
 * Chromium never collects an `OfflineAudioContext` that has loaded an audio
 * worklet module: the worklet thread's proxy is a C++ root that holds the
 * context, and with it the whole rendered buffer (a 512 s stereo render at
 * 48 kHz is ~197 MB). Nothing done to the context releases it: not skipping the
 * node, not a processor that returns false, not dropping every reference.
 *
 * What does release it is removing the FRAME the context belongs to. A context
 * built with a hidden iframe's own `OfflineAudioContext` constructor lives in
 * that frame, and removing the frame tears down its worklet thread, so the
 * context and its audio are collected like any other object. Measured in a bare
 * page (256 s stereo, 48 kHz, one worklet module and node, renderer footprint
 * after GC over six renders): 112 → 586 MB built in the page, 114 → 593 MB with
 * the frame kept, 18 → 19 MB with the frame removed after each render.
 *
 * So this module hands out a frame, lets the caller build audio objects with
 * that frame's constructors, and removes the frame on `dispose()`. It is not
 * specific to rendering: anything that must load worklets into a context it
 * wants to throw away later can use it.
 *
 * ⚠ OBJECTS FROM THE FRAME ARE FROM ANOTHER REALM. A node made by the frame's
 * context (`ctx.createGain()`) is not an `instanceof` this page's `AudioNode`,
 * and its prototype chain ends at the frame's `Object.prototype`. Code that
 * checks classes that way must check by what the object is instead; Stave's
 * superdough patch does (`patches/superdough@1.3.0.patch`, `realm.mjs`). Nodes
 * built with this page's constructors (`new GainNode(ctx)`,
 * `new AudioWorkletNode(ctx, …)`) are this page's objects and work as usual.
 *
 * ⚠ A buffer rendered in the frame stays readable after `dispose()`, and is
 * freed once nothing holds it. Disposing while a render is still running stops
 * it; dispose once the work that needs the context is done.
 */

/** The audio classes a library might extend on this page, and so on a frame. */
const EXTENDED_AUDIO_CLASSES = ['BaseAudioContext', 'AudioContext', 'OfflineAudioContext', 'AudioNode', 'AudioParam'] as const

/** A hidden frame whose audio objects are freed when it is disposed. */
export interface AudioFrame {
  /** The frame's own constructor. A context built with it belongs to the frame. */
  readonly OfflineAudioContext: typeof OfflineAudioContext
  /** The frame's own realtime context constructor, for the same purpose. */
  readonly AudioContext: typeof AudioContext
  /** Shorthand for `new frame.OfflineAudioContext(channels, length, sampleRate)`. */
  offlineContext(channels: number, length: number, sampleRate: number): OfflineAudioContext
  /**
   * Remove the frame. Every context it built, their worklet threads and their
   * rendered audio become collectable. Safe to call more than once.
   */
  dispose(): void
  /** Whether `dispose()` has run. A disposed frame builds nothing. */
  readonly disposed: boolean
}

/** Whether this environment can open an audio frame (a DOM with Web Audio). */
export function canOpenAudioFrame(doc: Document | undefined = globalThis.document): boolean {
  return doc != null && doc.body != null && typeof (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext === 'function'
}

/**
 * Copy what this page added to its audio classes onto the frame's (#1758).
 *
 * A library may extend the page's audio prototypes when it loads: superdough
 * adds `createReverb`, `createVowelFilter`, `createFeedbackDelay` and
 * `adjustLength` to `BaseAudioContext.prototype`. A context built in a frame
 * inherits from the FRAME's prototypes, which have none of them, so a reverb
 * rendered there would throw. Every own property the page's prototype has and
 * the frame's lacks is copied, descriptor and all; nothing the frame already
 * has is replaced. Keyed by class name, not by a list of methods, so an
 * extension added later is carried too.
 *
 * `page` and `frame` are the two windows (anything holding the classes by name).
 */
export function bridgeAudioExtensions(page: object, frame: object): number {
  let copied = 0
  for (const name of EXTENDED_AUDIO_CLASSES) {
    const mine = (page as Record<string, { prototype?: object } | undefined>)[name]?.prototype
    const theirs = (frame as Record<string, { prototype?: object } | undefined>)[name]?.prototype
    if (mine == null || theirs == null || mine === theirs) continue
    for (const key of Object.getOwnPropertyNames(mine)) {
      if (Object.prototype.hasOwnProperty.call(theirs, key)) continue
      const descriptor = Object.getOwnPropertyDescriptor(mine, key)
      if (descriptor == null) continue
      Object.defineProperty(theirs, key, descriptor)
      copied++
    }
  }
  return copied
}

/**
 * Open a hidden frame to build audio objects in, and free them with `dispose()`.
 *
 * Throws when there is no document to put the frame in (check
 * `canOpenAudioFrame` first where that can happen).
 */
export function openAudioFrame(doc: Document = globalThis.document): AudioFrame {
  if (doc?.body == null) throw new Error('openAudioFrame needs a document with a body')
  const element = doc.createElement('iframe')
  element.style.display = 'none'
  element.setAttribute('aria-hidden', 'true')
  element.setAttribute('tabindex', '-1')
  element.setAttribute('data-stave-audio-frame', '')
  doc.body.appendChild(element)
  const win = element.contentWindow as (Window & typeof globalThis) | null
  if (win == null) {
    element.remove()
    throw new Error('openAudioFrame could not reach the frame it opened')
  }
  bridgeAudioExtensions(doc.defaultView ?? globalThis, win)

  let disposed = false
  const live = <T>(value: T): T => {
    if (disposed) throw new Error('This audio frame has been disposed')
    return value
  }
  return {
    get OfflineAudioContext() {
      return live(win.OfflineAudioContext)
    },
    get AudioContext() {
      return live(win.AudioContext)
    },
    offlineContext(channels, length, sampleRate) {
      return new (live(win.OfflineAudioContext))(channels, length, sampleRate)
    },
    dispose() {
      if (disposed) return
      disposed = true
      element.remove()
    },
    get disposed() {
      return disposed
    },
  }
}

/**
 * Run `work` with a fresh audio frame, and dispose the frame when it ends,
 * however it ends. The value `work` returns (a rendered buffer, say) stays
 * usable afterwards.
 */
export async function withAudioFrame<T>(work: (frame: AudioFrame) => T | Promise<T>, doc?: Document): Promise<T> {
  const frame = openAudioFrame(doc)
  try {
    return await work(frame)
  } finally {
    frame.dispose()
  }
}

/**
 * An offline context in a frame of its own, whose `dispose()` removes that frame.
 * For a caller that holds one context and wants it freed when done, without
 * managing the frame.
 */
export function offlineContextInFrame(
  channels: number,
  length: number,
  sampleRate: number,
  doc?: Document,
): OfflineAudioContext & { dispose(): void } {
  const frame = openAudioFrame(doc)
  try {
    const ctx = frame.offlineContext(channels, length, sampleRate) as OfflineAudioContext & { dispose(): void }
    ctx.dispose = () => frame.dispose()
    return ctx
  } catch (err) {
    frame.dispose()
    throw err
  }
}
