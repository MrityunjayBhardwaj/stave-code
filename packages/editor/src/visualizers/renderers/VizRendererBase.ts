import type { EngineComponents } from '../../engine/LiveCodingEngine'
import type { VizOptions, VizRenderer } from '../types'

/**
 * The one place `components.options` is captured (#883).
 *
 * ## Why this class exists
 *
 * `VizRenderer` is an interface, so "expose the options bag to the sketch" was a
 * rule every renderer had to remember independently — in TWO places each, since
 * the bag arrives on `mount()` AND is re-published on every `update()`. Six
 * implementations, twelve chances to forget.
 *
 * Three forgot. And forgetting is INVISIBLE: a dropped option is pixel-for-pixel
 * identical to a sketch drawing its default, so nothing errors, nothing warns,
 * and the viz just looks like it always did. #880 is what that costs — the worker
 * renderer omitted this exact field and every viz option was silently dead on the
 * DEFAULT path for six weeks, while the main-thread path kept working and hid it.
 *
 * So the invariant gets a home instead of a convention. `mount`/`update` are
 * sealed here and capture the bag before delegating to `onMount`/`onUpdate`. A
 * renderer cannot silently drop options, because it never handles the raw
 * lifecycle call that carries them — including the next renderer someone adds,
 * which is the case a code review would never catch.
 *
 * ## What subclasses still own
 *
 * EXPOSURE, which is irreducibly per-engine and cannot live here: p5 and hydra
 * hand the sketch a JS object (`stave.options`); a fragment shader cannot read
 * one at all and needs generated uniforms (#894). The base guarantees the bag
 * ARRIVES and stays live; how a language surfaces it is the leaf's business.
 *
 * ## The slot is a live ref, deliberately
 *
 * `optionsRef.current` is REPLACED (never mutated) on each publish, so sketch
 * scopes must read THROUGH the ref — a getter, not a captured value — or they
 * pin the first bag forever. The replace is what makes a removed key stop
 * applying, which merging would silently break (#881).
 *
 * Decorators (`FallbackVizRenderer`, `TeardownOnPauseRenderer`) deliberately do
 * NOT extend this: they forward `components` verbatim to an inner renderer whose
 * own base captures it. Extending here would capture a bag they never expose.
 */
export abstract class VizRendererBase implements VizRenderer {
  /**
   * Live options bag from the viz call's argument (`.pianoroll({ labels: 1 })`).
   * Populated before `onMount`/`onUpdate` run, so subclasses may read it in
   * either. Read `.current` at USE time, never capture it.
   */
  protected readonly optionsRef: { current: VizOptions } = { current: {} }

  mount(
    container: HTMLDivElement,
    components: Partial<EngineComponents>,
    size: { w: number; h: number },
    onError: (e: Error) => void,
  ): void {
    this.optionsRef.current = components.options ?? {}
    this.onMount(container, components, size, onError)
  }

  update(components: Partial<EngineComponents>): void {
    this.optionsRef.current = components.options ?? {}
    this.onUpdate(components)
  }

  /** As {@link VizRenderer.mount}; the options bag is already captured. */
  protected abstract onMount(
    container: HTMLDivElement,
    components: Partial<EngineComponents>,
    size: { w: number; h: number },
    onError: (e: Error) => void,
  ): void

  /** As {@link VizRenderer.update}; the options bag is already captured. */
  protected abstract onUpdate(components: Partial<EngineComponents>): void

  abstract resize(w: number, h: number): void
  abstract pause(): void
  abstract resume(): void
  abstract destroy(): void
}
