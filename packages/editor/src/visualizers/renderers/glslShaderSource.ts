/**
 * glslShaderSource — build the WebGL2 (GLSL ES 3.00) program sources for a viz
 * sketch. Supports BOTH conventions (#283), auto-detected from the source:
 *
 *   - SHADERTOY — the user writes only `void mainImage(out vec4 fragColor,
 *     in vec2 fragCoord)`. We add the `main()` entry that calls it + the output.
 *   - RAW GLSL  — the user writes their own `void main()` (and their own `out`).
 *     We only prepend the version, precision, and the Stave uniforms.
 *
 * Both get the SAME uniforms; both render through the same fullscreen-triangle
 * vertex shader (the user controls only the FRAGMENT shader). There is NO
 * transpile — string composition — so a `.glsl` sketch crosses to the worker as a
 * plain transferable string (the same property that lets p5/hydra source cross —
 * workerMessages.ts MountMessage.code).
 *
 * v1 uniform set (HARD scope — Vairagya, issue #281):
 *   - `iResolution` (vec3)  — viewport px in .xy, 1.0 in .z
 *   - `iTime`       (float) — seconds since mount
 *   - `iMouse`      (vec4)  — pointer; zero in the worker (no pointer events)
 *   - `iChannel0`   (sampler2D) — master analyser, 2-row texture (row 0 FFT,
 *                                 row 1 waveform — ShaderToy convention)
 *   (Per-event signal uniforms — uKick/uSnare/… — are appended by #284.)
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

const VERSION = '#version 300 es'
const PRECISION = 'precision highp float;\nprecision highp int;'
/** The v1 uniforms, declared for BOTH modes. A user shader must NOT redeclare
 *  these (same rule as ShaderToy, where the user never declares uniforms). */
const UNIFORMS = `uniform vec3 iResolution;
uniform float iTime;
uniform vec4 iMouse;
uniform sampler2D iChannel0;`

/** ShaderToy-mode output + entry: we own `main()`, it calls the user's mainImage. */
const SHADERTOY_OUT = 'out vec4 stave_FragColor;'
const SHADERTOY_ENTRY = `
void main() {
  vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
  mainImage(color, gl_FragCoord.xy);
  stave_FragColor = color;
}
`

/** Blank out comments so the entry-point detection can't be fooled by a
 *  `// uses mainImage` line or a `/* main() *​/` block. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
}

/** Remove a user-supplied `#version` directive — ours is canonical and must be
 *  the first line; two `#version`s is a compile error. */
function stripVersion(src: string): string {
  return src.replace(/^[ \t]*#version[^\n]*\r?\n?/m, '')
}

/**
 * Compose the full fragment shader source from a user sketch. Detects the
 * convention (ShaderToy `mainImage` vs raw `void main`) and wraps accordingly.
 * Throws a friendly error for the ambiguous (both) and empty (neither) cases —
 * NOT a cryptic GLSL duplicate-symbol / undefined-symbol error.
 */
export function buildGLSLFragmentSource(userSource: string): string {
  const probe = stripComments(userSource)
  const hasMainImage = /\bmainImage\s*\(/.test(probe)
  const hasMain = /\bvoid\s+main\s*\(/.test(probe)

  if (hasMainImage && hasMain) {
    throw new Error(
      'GLSL: found both mainImage() and main(). For a ShaderToy shader, remove your main() — Stave provides it. For a raw GLSL shader, remove mainImage().',
    )
  }
  if (hasMainImage) {
    // ShaderToy mode — Stave owns the entry point + the fragment output.
    return `${VERSION}\n${PRECISION}\n${UNIFORMS}\n${SHADERTOY_OUT}\n${userSource}\n${SHADERTOY_ENTRY}`
  }
  if (hasMain) {
    // Raw GLSL mode — the user owns `out` + `main()`; Stave provides only the
    // version, precision, and uniforms. Strip a user `#version` (ours is first).
    return `${VERSION}\n${PRECISION}\n${UNIFORMS}\n${stripVersion(userSource)}\n`
  }
  throw new Error(
    'GLSL: no entry point. Define `void mainImage(out vec4 fragColor, in vec2 fragCoord)` for a ShaderToy shader, or `void main()` for a raw GLSL shader.',
  )
}
