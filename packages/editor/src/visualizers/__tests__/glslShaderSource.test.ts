import { describe, it, expect } from 'vitest'
import {
  buildGLSLFragmentSource,
  GLSL_FULLSCREEN_VERT,
} from '../renderers/glslShaderSource'

/**
 * Pure-logic unit tests for the GLSL renderer (#281) — only the string
 * composition (the wrapped shader source), which has no heavy deps. The WebGL
 * pipeline (glslCore), the worker/main mounts, AND the `compilePreset` glsl
 * routing all need a real GL context / drag in the p5+gifenc chain → covered by
 * the Playwright e2e `glsl-path-coverage.spec.ts` (which exercises
 * register→compilePreset→makeGLSLRenderer→worker mount end to end).
 */
describe('buildGLSLFragmentSource', () => {
  const body = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    fragColor = vec4(1.0);
  }`

  it('declares the v1 uniform set so a ShaderToy body compiles', () => {
    const src = buildGLSLFragmentSource(body)
    expect(src).toContain('uniform vec3 iResolution;')
    expect(src).toContain('uniform float iTime;')
    expect(src).toContain('uniform vec4 iMouse;')
    expect(src).toContain('uniform sampler2D iChannel0;')
  })

  it('targets GLSL ES 3.00 with a high-precision float', () => {
    const src = buildGLSLFragmentSource(body)
    expect(src.startsWith('#version 300 es')).toBe(true)
    expect(src).toContain('precision highp float;')
  })

  it('embeds the user body verbatim and calls mainImage from main()', () => {
    const src = buildGLSLFragmentSource(body)
    expect(src).toContain(body)
    expect(src).toContain('mainImage(color, gl_FragCoord.xy)')
    expect(src).toContain('out vec4 stave_FragColor;')
  })

  it('the fullscreen vertex shader needs no attribute buffer (gl_VertexID)', () => {
    expect(GLSL_FULLSCREEN_VERT).toContain('gl_VertexID')
    expect(GLSL_FULLSCREEN_VERT.startsWith('#version 300 es')).toBe(true)
    // No `in`/attribute declarations — positions are computed from the vertex id.
    expect(GLSL_FULLSCREEN_VERT).not.toMatch(/\bin\s+vec/)
  })
})
