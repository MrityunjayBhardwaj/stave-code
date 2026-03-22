import type { RefObject } from 'react'
import type { HapStream } from '../engine/HapStream'

/**
 * Thin wrapper around the Strudel scheduler exposed to sketches.
 * `now()` returns the current playback position in cycles.
 * `query()` returns all haps overlapping the given cycle range.
 */
export interface PatternScheduler {
  now(): number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(begin: number, end: number): any[]
}

/** Bundled refs passed to every VizRenderer on mount. */
export interface VizRefs {
  hapStreamRef: RefObject<HapStream | null>
  analyserRef:  RefObject<AnalyserNode | null>
  schedulerRef: RefObject<PatternScheduler | null>
}

/** Renderer-agnostic visualization lifecycle. */
export interface VizRenderer {
  mount(container: HTMLDivElement, refs: VizRefs, size: { w: number; h: number }, onError: (e: Error) => void): void
  resize(w: number, h: number): void
  pause(): void
  resume(): void
  destroy(): void
}

/** A factory function returning a VizRenderer, or a VizRenderer instance directly. */
export type VizRendererSource = (() => VizRenderer) | VizRenderer

/** Descriptor for a visualization mode in the VizPicker. */
export interface VizDescriptor {
  id: string
  label: string
  requires?: 'webgl' | 'webgl2'
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
