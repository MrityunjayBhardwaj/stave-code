import { describe, it, expect } from 'vitest'
import {
  buildGLSLFragmentSource,
  GLSL_FULLSCREEN_VERT,
} from '../renderers/glslShaderSource'

/**
 * Pure-logic unit tests for the GLSL source wrapper (#281 / #283) — only the
 * string composition + convention detection, which have no heavy deps. The WebGL
 * pipeline (glslCore), the worker/main mounts, AND the `compilePreset` glsl routing
 * need a real GL context / drag in the p5+gifenc chain → covered by the Playwright
 * e2e `glsl-path-coverage.spec.ts`.
 */
const SHADERTOY = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  fragColor = vec4(1.0);
}`

const RAW = `out vec4 fragColor;
void main() {
  fragColor = vec4(iTime, 0.0, 0.0, 1.0);
}`

describe('buildGLSLFragmentSource — common preamble', () => {
  it('declares the v1 uniform set in BOTH modes', () => {
    for (const src of [SHADERTOY, RAW]) {
      const out = buildGLSLFragmentSource(src)
      expect(out).toContain('uniform vec3 iResolution;')
      expect(out).toContain('uniform float iTime;')
      expect(out).toContain('uniform vec4 iMouse;')
      expect(out).toContain('uniform sampler2D iChannel0;')
      expect(out.startsWith('#version 300 es')).toBe(true)
      expect(out).toContain('precision highp float;')
    }
  })

  it('the fullscreen vertex shader needs no attribute buffer (gl_VertexID)', () => {
    expect(GLSL_FULLSCREEN_VERT).toContain('gl_VertexID')
    expect(GLSL_FULLSCREEN_VERT.startsWith('#version 300 es')).toBe(true)
    expect(GLSL_FULLSCREEN_VERT).not.toMatch(/\bin\s+vec/)
  })
})

describe('buildGLSLFragmentSource — ShaderToy mode (mainImage)', () => {
  it('embeds the body and adds the main() that calls mainImage', () => {
    const out = buildGLSLFragmentSource(SHADERTOY)
    expect(out).toContain(SHADERTOY)
    expect(out).toContain('mainImage(color, gl_FragCoord.xy)')
    expect(out).toContain('out vec4 stave_FragColor;')
  })
})

describe('buildGLSLFragmentSource — raw GLSL mode (void main)', () => {
  it('uses the body as-is and does NOT inject a mainImage entry', () => {
    const out = buildGLSLFragmentSource(RAW)
    expect(out).toContain('void main()')
    expect(out).not.toContain('mainImage')
    // The user owns the output — we don't add stave_FragColor in raw mode.
    expect(out).not.toContain('stave_FragColor')
  })

  it('strips a user-supplied #version (ours must be the single first line)', () => {
    const withVersion = `#version 300 es\n${RAW}`
    const out = buildGLSLFragmentSource(withVersion)
    // Exactly one #version, at the very start.
    expect(out.match(/#version/g)?.length).toBe(1)
    expect(out.startsWith('#version 300 es')).toBe(true)
  })
})

describe('buildGLSLFragmentSource — ambiguous & empty cases (friendly errors)', () => {
  it('throws a friendly error when BOTH mainImage and main are present', () => {
    const both = `${SHADERTOY}\nvoid main() { mainImage(gl_FragColor, gl_FragCoord.xy); }`
    expect(() => buildGLSLFragmentSource(both)).toThrow(/both mainImage\(\) and main\(\)/)
  })

  it('throws a friendly error when NEITHER entry point is present', () => {
    expect(() => buildGLSLFragmentSource('float f = 1.0;')).toThrow(/no entry point/)
  })

  it('is not fooled by mainImage/main mentioned only in comments', () => {
    // A raw shader whose comment MENTIONS mainImage must still be raw mode (the
    // comment is stripped before detection), not flagged as "both".
    const commented = `// this is like mainImage but raw\n${RAW}`
    const out = buildGLSLFragmentSource(commented)
    expect(out).toContain('void main()')
    expect(out).not.toContain('out vec4 stave_FragColor;')
  })
})
