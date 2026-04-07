import type { RefObject } from 'react'
import type { HapStream } from '../engine/HapStream'
import type { EngineComponents } from '../engine/LiveCodingEngine'
import type { NormalizedHap } from '../engine/NormalizedHap'
import type { IRPattern } from '../ir/IRPattern'

/**
 * PatternScheduler — backward-compatible alias for IRPattern.
 * New code should import IRPattern from '../ir' directly.
 */
export type PatternScheduler = IRPattern

/**
 * Bundled refs passed to every VizRenderer on mount.
 * @deprecated Use {@link EngineComponents} instead. VizRenderer.mount() now accepts
 * `Partial<EngineComponents>`. This type is retained for backward compatibility.
 */
export interface VizRefs {
  hapStreamRef: RefObject<HapStream | null>
  analyserRef:  RefObject<AnalyserNode | null>
  schedulerRef: RefObject<PatternScheduler | null>
}

/** Renderer-agnostic visualization lifecycle. */
export interface VizRenderer {
  mount(container: HTMLDivElement, components: Partial<EngineComponents>, size: { w: number; h: number }, onError: (e: Error) => void): void
  /** Refresh engine data refs (called each React render for live updates). */
  update(components: Partial<EngineComponents>): void
  resize(w: number, h: number): void
  pause(): void
  resume(): void
  destroy(): void
}

/** A factory function returning a VizRenderer, or a VizRenderer instance directly. */
export type VizRendererSource = (() => VizRenderer) | VizRenderer

/**
 * Descriptor for a visualization mode in the VizPicker.
 *
 * `requires` lists the engine component slots this viz needs. Used by VizPicker
 * to disable unavailable visualizations. This is about engine data requirements,
 * NOT renderer capabilities (e.g. WebGL) — renderer caps are a separate concern.
 *
 * IDs follow the `"mode:renderer"` convention when multiple renderers offer the
 * same visual concept (e.g. `"pianoroll"` vs `"pianoroll:hydra"`). The bare
 * `"mode"` form is the default renderer for that concept.
 */
export interface VizDescriptor {
  id: string
  label: string
  requires?: (keyof EngineComponents)[]
  /** Renderer technology name (e.g. 'p5', 'hydra', 'canvas2d'). Used for VizPicker grouping. */
  renderer?: string
  factory: () => VizRenderer
}

/**
 * Internal type alias for the existing p5 sketch factory signature.
 * Used only by P5VizRenderer — NOT exported from the package.
 */
export type P5SketchFactory = (
  hapStreamRef: RefObject<HapStream | null>,
  analyserRef: RefObject<AnalyserNode | null>,
  schedulerRef: RefObject<PatternScheduler | null>
) => (p: import('p5').default) => void
