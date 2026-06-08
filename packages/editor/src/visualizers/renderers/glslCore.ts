/**
 * glslCore — the SHARED, host-agnostic WebGL2 renderer for a single-pass
 * ShaderToy sketch. ONE implementation drives BOTH viz hosts (PV56 spirit — one
 * concept, one implementation):
 *   - the worker (`hostP5Worker.ts` mountGLSL) — context from the transferred
 *     `OffscreenCanvas` (Tier-1: render DIRECT, no blit);
 *   - the main thread (`GLSLVizRenderer.ts`) — context from a `<canvas>` (the
 *     fallback + non-OffscreenCanvas path).
 * Only the canvas type and the audio source differ; the GL pipeline is identical,
 * so it lives here once.
 *
 * Pipeline (v1, issue #281): a fullscreen triangle (no VBO — `gl_VertexID`) runs
 * the wrapped fragment shader; the master analyser is uploaded each frame to a
 * 2-row `R8` texture bound as `iChannel0` (row 0 = FFT, row 1 = waveform — the
 * ShaderToy convention). Uniforms: `iResolution`, `iTime`, `iMouse`, `iChannel0`.
 *
 * Throw discipline: compile/link errors throw from `create` (mount-time) — the
 * worker host catches them and the FallbackVizRenderer degrades to main (#247).
 * `draw()` runs a GPU shader with NO per-frame user JS, so it does not throw —
 * the #257 draw-swallow seam is satisfied trivially (a notable contract finding).
 *
 * REF: glslShaderSource.ts (the wrapped sources), architecture/renderer-contract.mdx
 *      (the contract), rawShims.ts (the worker AudioByteSource), HydraVizRenderer
 *      (the main-thread analyser source — same getByte* surface).
 */

import { GLSL_FULLSCREEN_VERT, buildGLSLFragmentSource } from './glslShaderSource'

/** The per-frame audio surface — the SAME shape exposed by the worker's
 *  `RawAnalyserShim` AND a Web Audio `AnalyserNode`, so the core feeds from
 *  either host with no branch (the audio-feed seam the contract is tested on). */
export interface AudioByteSource {
  frequencyBinCount: number
  getByteFrequencyData(arr: Uint8Array): void
  getByteTimeDomainData(arr: Uint8Array): void
}

/** A WebGL2 context from either a `<canvas>` (main) or an `OffscreenCanvas`
 *  (worker) — structurally identical for our use. */
export type GL2 = WebGL2RenderingContext

export interface GLSLDrawState {
  /** Backing-store width in device px. */
  width: number
  /** Backing-store height in device px. */
  height: number
  /** Milliseconds since mount → `iTime = ms / 1000`. */
  timeMs: number
  /** `iMouse` (x, y, clickX, clickY); zeros in the worker (no pointer events). */
  mouse?: readonly [number, number, number, number]
}

/** Width (texels) of each row of the `iChannel0` audio texture. */
const AUDIO_TEX_W = 512
const AUDIO_TEX_H = 2

function compileShader(gl: GL2, type: number, src: string, label: string): WebGLShader {
  const sh = gl.createShader(type)
  if (!sh) throw new Error(`glsl: could not create ${label} shader`)
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? ''
    gl.deleteShader(sh)
    // Strip the injected preamble's line offset from messages where we can — the
    // user body starts after the preamble, but raw GLSL line numbers are still
    // the most useful signal; surface the log verbatim.
    throw new Error(`glsl ${label} compile error:\n${log.trim()}`)
  }
  return sh
}

/** Resample `src[0..srcLen)` byte data into `dst[0..dstLen)` by box-averaging —
 *  maps an analyser buffer (1024 bins / 2048 samples) onto the texture row. */
function resampleByteRow(src: Uint8Array, srcLen: number, dst: Uint8Array, dstLen: number): void {
  if (srcLen <= 0) {
    dst.fill(0, 0, dstLen)
    return
  }
  const bucket = srcLen / dstLen
  for (let i = 0; i < dstLen; i++) {
    const start = Math.floor(i * bucket)
    const end = Math.max(start + 1, Math.floor((i + 1) * bucket))
    let sum = 0
    let n = 0
    for (let j = start; j < end && j < srcLen; j++) {
      sum += src[j]
      n++
    }
    dst[i] = n > 0 ? Math.round(sum / n) : 0
  }
}

/**
 * A compiled, drawable single-pass GLSL program bound to one WebGL2 context.
 * Construct with `createGLSLProgram(gl, userSource)` (throws on compile/link
 * error); drive with `draw(audio, state)`; release with `dispose()`.
 */
export class GLSLProgram {
  private readonly program: WebGLProgram
  private readonly vao: WebGLVertexArrayObject
  private readonly audioTex: WebGLTexture
  private readonly uResolution: WebGLUniformLocation | null
  private readonly uTime: WebGLUniformLocation | null
  private readonly uMouse: WebGLUniformLocation | null
  private readonly uChannel0: WebGLUniformLocation | null
  /** Scratch buffers, allocated once (no per-frame alloc). */
  private readonly freqScratch = new Uint8Array(AUDIO_TEX_W * 4)
  private readonly waveScratch = new Uint8Array(AUDIO_TEX_W * 4)
  /** The 2-row texel buffer uploaded each frame (row 0 FFT, row 1 wave). */
  private readonly texRows = new Uint8Array(AUDIO_TEX_W * AUDIO_TEX_H)
  private disposed = false

  constructor(
    private readonly gl: GL2,
    userSource: string,
  ) {
    const vert = compileShader(gl, gl.VERTEX_SHADER, GLSL_FULLSCREEN_VERT, 'vertex')
    const frag = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      buildGLSLFragmentSource(userSource),
      'fragment',
    )
    const program = gl.createProgram()
    if (!program) throw new Error('glsl: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    // Shaders can be flagged for deletion once linked.
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? ''
      gl.deleteProgram(program)
      throw new Error(`glsl link error:\n${log.trim()}`)
    }
    this.program = program
    this.uResolution = gl.getUniformLocation(program, 'iResolution')
    this.uTime = gl.getUniformLocation(program, 'iTime')
    this.uMouse = gl.getUniformLocation(program, 'iMouse')
    this.uChannel0 = gl.getUniformLocation(program, 'iChannel0')

    // WebGL2 core requires a bound VAO for drawArrays, even with no attributes.
    const vao = gl.createVertexArray()
    if (!vao) throw new Error('glsl: could not create VAO')
    this.vao = vao

    // The audio texture — single-channel R8, 512×2, linear-filtered, clamped.
    const tex = gl.createTexture()
    if (!tex) throw new Error('glsl: could not create audio texture')
    this.audioTex = tex
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1) // R8 rows aren't 4-byte aligned
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.R8, AUDIO_TEX_W, AUDIO_TEX_H, 0, gl.RED, gl.UNSIGNED_BYTE, null,
    )
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindTexture(gl.TEXTURE_2D, null)
  }

  /** Render one frame. `audio` may be null (no analyser yet) → the texture stays
   *  at its current contents (or zero) and the shader still animates off iTime. */
  draw(audio: AudioByteSource | null, state: GLSLDrawState): void {
    if (this.disposed) return
    const gl = this.gl
    const w = Math.max(1, Math.round(state.width))
    const h = Math.max(1, Math.round(state.height))

    // Upload the audio texture (row 0 = FFT, row 1 = waveform).
    if (audio) {
      const bins = Math.min(audio.frequencyBinCount, this.freqScratch.length)
      const freq = this.freqScratch.subarray(0, bins)
      const wave = this.waveScratch.subarray(0, bins)
      audio.getByteFrequencyData(freq)
      audio.getByteTimeDomainData(wave)
      resampleByteRow(freq, bins, this.texRows.subarray(0, AUDIO_TEX_W), AUDIO_TEX_W)
      resampleByteRow(wave, bins, this.texRows.subarray(AUDIO_TEX_W), AUDIO_TEX_W)
      gl.bindTexture(gl.TEXTURE_2D, this.audioTex)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      gl.texSubImage2D(
        gl.TEXTURE_2D, 0, 0, 0, AUDIO_TEX_W, AUDIO_TEX_H, gl.RED, gl.UNSIGNED_BYTE, this.texRows,
      )
    }

    gl.viewport(0, 0, w, h)
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vao)

    if (this.uResolution) gl.uniform3f(this.uResolution, w, h, 1)
    if (this.uTime) gl.uniform1f(this.uTime, state.timeMs / 1000)
    if (this.uMouse) {
      const m = state.mouse ?? [0, 0, 0, 0]
      gl.uniform4f(this.uMouse, m[0], m[1], m[2], m[3])
    }
    if (this.uChannel0) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.audioTex)
      gl.uniform1i(this.uChannel0, 0)
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const gl = this.gl
    try {
      gl.deleteProgram(this.program)
      gl.deleteVertexArray(this.vao)
      gl.deleteTexture(this.audioTex)
    } catch {
      /* context may already be lost — ignore */
    }
  }
}

/** Compile + link a ShaderToy `mainImage` body against `gl`. Throws on a compile
 *  or link error (the message carries the GLSL info log). */
export function createGLSLProgram(gl: GL2, userSource: string): GLSLProgram {
  return new GLSLProgram(gl, userSource)
}
