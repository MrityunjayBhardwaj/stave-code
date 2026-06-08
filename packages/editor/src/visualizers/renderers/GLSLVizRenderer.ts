/**
 * GLSLVizRenderer — the MAIN-THREAD `VizRenderer` for a single-pass GLSL/ShaderToy
 * sketch (issue #281). It is the ALWAYS-available path: used directly when the
 * worker path is off / unsupported, and as the `FallbackVizRenderer` target when a
 * GLSL worker fails to start (#247). The worker counterpart is `mountGLSL` in
 * `hostP5Worker.ts`; both drive the SAME `glslCore` pipeline (one implementation).
 *
 * Loop ownership mirrors `HydraVizRenderer`: we own a single rAF that reads the
 * master analyser and draws exactly one frame, so `pause()` (cancel the rAF) truly
 * halts rendering. There is no per-frame user JS — the shader runs on the GPU — so
 * `draw()` can't throw post-mount; the only failure point is shader compile/link,
 * caught at mount and surfaced via `onError` (→ fallback when wrapped).
 *
 * REF: glslCore.ts (the shared pipeline), HydraVizRenderer (the loop/gauge/pause
 *      idiom mirrored here), makeGLSLRenderer (#247 wrapping), perf.gauge('viz.glsl').
 */

import type { EngineComponents } from '../../engine/LiveCodingEngine'
import type { VizRenderer } from '../types'
import { perf } from '../../perf/profiler'
import { createGLSLProgram, type GLSLProgram, type AudioByteSource, type GL2 } from './glslCore'

/** Monotone id source for a stable per-instance profiler key (`glsl#N`). */
let glslPerfSeq = 0

export class GLSLVizRenderer implements VizRenderer {
  private canvas: HTMLCanvasElement | null = null
  private gl: GL2 | null = null
  private program: GLSLProgram | null = null
  private analyser: AnalyserNode | null = null
  private rafId: number | null = null
  private paused = false
  private destroyed = false
  private startMs = 0
  private size = { w: 400, h: 300 }
  private readonly perfId = `glsl#${++glslPerfSeq}`

  constructor(private readonly code: string) {}

  mount(
    container: HTMLDivElement,
    components: Partial<EngineComponents>,
    size: { w: number; h: number },
    onError: (e: Error) => void,
  ): void {
    perf.gauge('viz.glsl', 1) // live GLSL-instance gauge; -1 in destroy()
    try {
      this.size = { w: size.w, h: size.h }
      this.analyser = (components.audio?.analyser as AnalyserNode | undefined) ?? null

      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(size.w))
      canvas.height = Math.max(1, Math.round(size.h))
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      canvas.style.display = 'block'
      container.appendChild(canvas)
      this.canvas = canvas

      const gl = canvas.getContext('webgl2')
      if (!gl) throw new Error('GLSLVizRenderer: WebGL2 not available')
      this.gl = gl
      // Throws on a shader compile/link error → onError (fallback when wrapped).
      this.program = createGLSLProgram(gl, this.code)

      this.startMs = performance.now()
      if (!this.paused && !this.destroyed && this.rafId == null) {
        this.rafId = requestAnimationFrame(this.loop)
      }
    } catch (e) {
      onError(e as Error)
    }
  }

  private loop = (now: number): void => {
    if (this.paused || this.destroyed || !this.program) {
      this.rafId = null
      return
    }
    perf.frame(this.perfId)
    perf.begin('glsl.draw')
    try {
      this.program.draw(this.analyser as AudioByteSource | null, {
        width: this.size.w,
        height: this.size.h,
        timeMs: now - this.startMs,
      })
    } finally {
      perf.end('glsl.draw')
    }
    this.rafId = requestAnimationFrame(this.loop)
  }

  update(components: Partial<EngineComponents>): void {
    // Only the analyser is live data for GLSL; rebind it so a re-evaluate that
    // swaps the audio node keeps the shader reactive (mirror HydraVizRenderer).
    this.analyser = (components.audio?.analyser as AnalyserNode | undefined) ?? null
  }

  resize(w: number, h: number): void {
    this.size = { w, h }
    if (this.canvas) {
      this.canvas.width = Math.max(1, Math.round(w))
      this.canvas.height = Math.max(1, Math.round(h))
    }
  }

  pause(): void {
    this.paused = true
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  resume(): void {
    this.paused = false
    // iTime tracks wall-clock from mount; a pause lets it advance (v1 — shaders
    // are continuous-time, no freeze needed). Just re-arm the loop.
    if (this.rafId == null && !this.destroyed) {
      this.rafId = requestAnimationFrame(this.loop)
    }
  }

  destroy(): void {
    this.destroyed = true
    perf.gauge('viz.glsl', -1)
    perf.dropFrames(this.perfId)
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.program?.dispose()
    this.program = null
    // Release the WebGL context explicitly (mirrors #266 hygiene on the worker
    // path) — p5/hydra rely on lazy GC, but a raw context we own we can free.
    try {
      this.gl?.getExtension('WEBGL_lose_context')?.loseContext()
    } catch {
      /* already lost / unsupported — ignore */
    }
    this.gl = null
    this.canvas?.remove()
    this.canvas = null
    this.analyser = null
  }
}
