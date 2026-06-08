/**
 * glslShaderSource — build the WebGL2 (GLSL ES 3.00) program sources for a
 * ShaderToy-style sketch. The user writes ONLY the body:
 *
 *   void mainImage(out vec4 fragColor, in vec2 fragCoord) {
 *     vec2 uv = fragCoord / iResolution.xy;
 *     fragColor = vec4(uv, 0.5 + 0.5 * sin(iTime), 1.0);
 *   }
 *
 * We wrap it with the GLSL ES 3.00 preamble, the v1 uniform set, and a `main()`
 * that calls `mainImage`. There is NO transpile — this is string composition, so
 * a `.glsl` sketch crosses to the worker as a plain transferable string (the same
 * property that lets p5/hydra source cross — workerMessages.ts MountMessage.code).
 *
 * v1 uniform set (HARD scope — Vairagya, issue #281):
 *   - `iResolution` (vec3)  — viewport px in .xy, 1.0 in .z
 *   - `iTime`       (float) — seconds since mount
 *   - `iMouse`      (vec4)  — pointer; zero in the worker (no pointer events reach
 *                            an OffscreenCanvas) — declared so shaders compile
 *   - `iChannel0`   (sampler2D) — the master analyser as a 2-row audio texture:
 *       row v≈0.25 = FFT magnitude, row v≈0.75 = waveform (ShaderToy convention)
 * NO iChannelResolution / iFrame / iTimeDelta / multipass in v1 (deferred).
 *
 * REF: glslCore.ts (consumes these), hostP5Worker.ts mountGLSL, GLSLVizRenderer,
 *      architecture/renderer-contract.mdx (the contract this renderer validates).
 */

/** Fullscreen-triangle vertex shader — covers the clip volume with 3 verts and
 *  NO attribute buffer (positions come from `gl_VertexID`), so the core needs no
 *  VBO/VAO setup. Draw with `gl.drawArrays(TRIANGLES, 0, 3)`. */
export const GLSL_FULLSCREEN_VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`

/** The fragment preamble injected before the user's `mainImage`. Declares the v1
 *  uniforms and the GLSL ES 3.00 output. */
const FRAG_PREAMBLE = `#version 300 es
precision highp float;
precision highp int;
uniform vec3 iResolution;
uniform float iTime;
uniform vec4 iMouse;
uniform sampler2D iChannel0;
out vec4 stave_FragColor;
`

/** The entry appended after the user's `mainImage` — calls it with the pixel
 *  coord (origin bottom-left, matching ShaderToy / `gl_FragCoord`). */
const FRAG_ENTRY = `
void main() {
  vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
  mainImage(color, gl_FragCoord.xy);
  stave_FragColor = color;
}
`

/**
 * Compose the full fragment shader source from a user `mainImage` body. The user
 * source is inserted verbatim between the preamble and the entry — a syntax error
 * surfaces as a shader compile error (reported by `glslCore`), attributed to the
 * sketch.
 */
export function buildGLSLFragmentSource(userSource: string): string {
  return `${FRAG_PREAMBLE}\n${userSource}\n${FRAG_ENTRY}`
}
