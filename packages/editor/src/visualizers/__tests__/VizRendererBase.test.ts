/**
 * VizRendererBase — the options invariant's one home (#883).
 *
 * These tests exist because the rule they encode has been broken twice by two
 * different renderers, silently: #880 (the worker renderer omitted
 * `components.options`, killing every viz option on the DEFAULT path for six
 * weeks) and #883 (hydra + GLSL never read it at all). A dropped option is
 * invisible — the sketch just draws its default — so nothing catches it but a
 * test like this.
 *
 * The point of the base is that a subclass CANNOT forget: it never handles the
 * raw lifecycle call. So the assertions below are about the SEALED path
 * (`mount`/`update` → capture → `onMount`/`onUpdate`), not about any one engine.
 */

import { describe, it, expect } from 'vitest'
import type { EngineComponents } from '../../engine/LiveCodingEngine'
import { VizRendererBase } from '../renderers/VizRendererBase'

/** A minimal subclass that does nothing but record what the base gave it. */
class ProbeRenderer extends VizRendererBase {
  seenOnMount: Record<string, unknown> | null = null
  seenOnUpdate: Record<string, unknown> | null = null
  /** The live slot, exposed for assertions — subclasses read `this.optionsRef`. */
  peek(): Record<string, unknown> {
    return this.optionsRef.current
  }
  protected onMount(): void {
    this.seenOnMount = this.optionsRef.current
  }
  protected onUpdate(): void {
    this.seenOnUpdate = this.optionsRef.current
  }
  resize(): void {}
  pause(): void {}
  resume(): void {}
  destroy(): void {}
}

const el = () => ({}) as HTMLDivElement
const size = { w: 10, h: 10 }
const noop = () => {}

describe('VizRendererBase — options capture', () => {
  it('captures components.options BEFORE onMount runs', () => {
    const r = new ProbeRenderer()
    r.mount(el(), { options: { background: '#cc1133' } }, size, noop)
    // The subclass must be able to read options during its own mount — a p5
    // sketch is compiled there, and it closes over the slot.
    expect(r.seenOnMount).toEqual({ background: '#cc1133' })
  })

  it('captures components.options BEFORE onUpdate runs', () => {
    const r = new ProbeRenderer()
    r.mount(el(), { options: { a: 1 } }, size, noop)
    r.update({ options: { a: 2 } })
    expect(r.seenOnUpdate).toEqual({ a: 2 })
  })

  it('REPLACES the bag on update — a removed key stops applying', () => {
    // Merging would leave `labels` applying forever after the user deletes it
    // from the viz call. #881 fixed exactly this on the worker seam; the base
    // must not reintroduce it.
    const r = new ProbeRenderer()
    r.mount(el(), { options: { labels: 1, vertical: 1 } }, size, noop)
    r.update({ options: { vertical: 1 } })
    expect(r.peek()).toEqual({ vertical: 1 })
    expect(r.peek().labels).toBeUndefined()
  })

  it('defaults to an empty bag when the viz was called with no argument', () => {
    // `stave.options.foo` must be a safe read from a sketch, never a throw.
    const r = new ProbeRenderer()
    r.mount(el(), {}, size, noop)
    expect(r.peek()).toEqual({})
    r.update({})
    expect(r.peek()).toEqual({})
  })

  it('clears a previously-set bag when a later publish carries none', () => {
    const r = new ProbeRenderer()
    r.mount(el(), { options: { a: 1 } }, size, noop)
    r.update({} as Partial<EngineComponents>)
    expect(r.peek()).toEqual({})
  })

  it('keeps the slot IDENTITY stable so a sketch can close over it', () => {
    // The whole live-ref idiom depends on this: the compiler captures the ref
    // object once and reads `.current` per frame. Swapping the ref would strand
    // every sketch on the first bag.
    const r = new ProbeRenderer()
    const ref = (r as unknown as { optionsRef: object }).optionsRef
    r.mount(el(), { options: { a: 1 } }, size, noop)
    r.update({ options: { a: 2 } })
    expect((r as unknown as { optionsRef: object }).optionsRef).toBe(ref)
  })

  it('a subclass that never touches options still gets them captured', () => {
    // The regression guard for the whole class of bug: forgetting is not
    // possible, because the subclass does not handle mount/update at all.
    class ForgetfulRenderer extends VizRendererBase {
      protected onMount(): void {}
      protected onUpdate(): void {}
      resize(): void {}
      pause(): void {}
      resume(): void {}
      destroy(): void {}
      read(): Record<string, unknown> {
        return this.optionsRef.current
      }
    }
    const r = new ForgetfulRenderer()
    r.mount(el(), { options: { intensity: 0.8 } }, size, noop)
    expect(r.read()).toEqual({ intensity: 0.8 })
  })
})
