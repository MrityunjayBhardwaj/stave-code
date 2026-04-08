import type { VizDescriptor, VizRenderer } from './types'
import type { VizPreset } from './vizPreset'
import { P5VizRenderer } from './renderers/P5VizRenderer'
import { HydraVizRenderer } from './renderers/HydraVizRenderer'
import type { HydraPatternFn } from './renderers/HydraVizRenderer'
import type { EngineComponents } from '../engine/LiveCodingEngine'
import type { HapStream } from '../engine/HapStream'
import type { PatternScheduler } from './types'
import type { RefObject } from 'react'

/**
 * Compiles user-authored viz code into a VizDescriptor.
 *
 * Hydra code: evaluated in a function scope with the hydra synth object
 *   as the implicit `s` parameter. Uses `new Function()`.
 *
 * p5 code: evaluated as a p5 sketch body with hapStream, analyser, scheduler
 *   available as closed-over variables.
 */
export function compilePreset(preset: VizPreset): VizDescriptor {
  const { id, name, renderer, code, requires } = preset

  if (renderer === 'hydra') {
    return {
      id,
      label: name,
      renderer: 'hydra',
      requires,
      factory: () => new HydraVizRenderer(compileHydraCode(code)),
    }
  }

  if (renderer === 'p5') {
    return {
      id,
      label: name,
      renderer: 'p5',
      requires,
      factory: () => new P5VizRenderer(compileP5Code(code)),
    }
  }

  throw new Error(`Unknown renderer: ${renderer}`)
}

/**
 * Compile Hydra code string into a HydraPatternFn.
 * The code runs with `s` (the hydra synth) in scope.
 */
function compileHydraCode(code: string): HydraPatternFn {
  // Return a function that receives the synth and evals the user code
  return (s: any) => {
    const fn = new Function('s', code)
    fn(s)
  }
}

/**
 * Compile p5 code string into a P5SketchFactory.
 * The code runs inside draw() with hapStream, analyser, scheduler,
 * and standard p5 instance methods available.
 */
function compileP5Code(code: string) {
  // P5SketchFactory signature
  return (
    hapStreamRef: RefObject<HapStream | null>,
    analyserRef: RefObject<AnalyserNode | null>,
    schedulerRef: RefObject<PatternScheduler | null>,
  ) => {
    return (p: any) => {
      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight)
        p.colorMode(p.RGB)
      }

      p.draw = () => {
        // Expose variables the user code expects
        const hapStream = hapStreamRef.current
        const analyser = analyserRef.current
        const scheduler = schedulerRef.current
        const { width, height } = p

        // Execute user code with p5 instance methods bound
        const fn = new Function(
          'p', 'hapStream', 'analyser', 'scheduler', 'width', 'height',
          // Expose common p5 methods as bare names
          `with(p) { ${code} }`,
        )
        fn(p, hapStream, analyser, scheduler, width, height)
      }
    }
  }
}
