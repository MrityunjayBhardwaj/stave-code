/**
 * GLSL_VIZ provider — unit tests (issue #287).
 *
 * Mirrors `hydraViz.test.tsx` / `p5Viz.test.tsx`. The provider is a one-line
 * call to `createCompiledVizProvider`, so the surface under test is that the
 * GLSL adapter claims `.glsl`, drives the shared compile/mount leaf, and passes
 * the `'glsl'` renderer tag to `compilePreset`. The shared render path (chrome
 * buttons, pause, demo bag) is already covered by the hydra/p5 suites, so this
 * file stays focused on the GLSL-specific wiring.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, cleanup } from '@testing-library/react'
import type { PreviewContext } from '../../PreviewProvider'
import type { AudioPayload, WorkspaceFile } from '../../types'

vi.mock('../../../visualizers/vizCompiler', () => ({
  compilePreset: vi.fn((preset: { id: string; renderer: string }) => ({
    id: `mock-${preset.id}`,
    label: 'mock',
    renderer: preset.renderer,
    factory: () => ({
      mount: vi.fn(),
      update: vi.fn(),
      resize: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      destroy: vi.fn(),
    }),
  })),
}))

vi.mock('../../../visualizers/mountVizRenderer', () => ({
  mountVizRenderer: vi.fn(() => ({
    renderer: {
      mount: vi.fn(),
      update: vi.fn(),
      resize: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      destroy: vi.fn(),
    },
    disconnect: vi.fn(),
  })),
}))

import { GLSL_VIZ } from '../glslViz'
import { compilePreset } from '../../../visualizers/vizCompiler'
import { mountVizRenderer } from '../../../visualizers/mountVizRenderer'

function makeFile(id: string, content: string): WorkspaceFile {
  return { id, path: `${id}.glsl`, content, language: 'glsl' }
}

function makeCtx(file: WorkspaceFile, audioSource: AudioPayload | null = null): PreviewContext {
  return { file, audioSource, hidden: false }
}

describe('GLSL_VIZ provider shape', () => {
  it('claims the .glsl extension', () => {
    expect(GLSL_VIZ.extensions).toContain('glsl')
  })

  it('has a human-readable label', () => {
    expect(GLSL_VIZ.label).toBe('GLSL Visualization')
  })

  it('pauses when hidden + debounced reload (shared D-03/D-07 policy)', () => {
    expect(GLSL_VIZ.keepRunningWhenHidden).toBe(false)
    expect(GLSL_VIZ.reload).toBe('debounced')
    expect(GLSL_VIZ.debounceMs).toBe(300)
  })

  it('exposes a render function', () => {
    expect(typeof GLSL_VIZ.render).toBe('function')
  })
})

describe('GLSL_VIZ render path', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  it('compiles the file content with the glsl renderer tag', () => {
    const file = makeFile('shader', 'void mainImage(out vec4 o, in vec2 f){ o = vec4(1.0); }')
    render(GLSL_VIZ.render(makeCtx(file)) as React.ReactElement)
    expect(compilePreset).toHaveBeenCalledTimes(1)
    const preset = (compilePreset as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(preset.renderer).toBe('glsl')
    expect(preset.code).toContain('mainImage')
    expect(preset.id).toBe('shader')
  })

  it('render returns a React element on the happy path', () => {
    const file = makeFile('shader2', 'void mainImage(out vec4 o, in vec2 f){ o = vec4(0.0); }')
    expect(React.isValidElement(GLSL_VIZ.render(makeCtx(file)))).toBe(true)
  })

  it('mounts the renderer via the shared leaf', () => {
    const file = makeFile('shader3', 'void mainImage(out vec4 o, in vec2 f){ o = vec4(0.5); }')
    const { getByTestId } = render(GLSL_VIZ.render(makeCtx(file)) as React.ReactElement)
    expect(mountVizRenderer).toHaveBeenCalledTimes(1)
    expect(getByTestId('compiled-viz-mount-shader3')).toBeTruthy()
  })

  it('mounts in demo mode with a null audioSource (shader animates off iTime)', () => {
    const file = makeFile('shader4', 'void mainImage(out vec4 o, in vec2 f){ o = vec4(1.0); }')
    render(GLSL_VIZ.render(makeCtx(file, null)) as React.ReactElement)
    const components = (mountVizRenderer as unknown as ReturnType<typeof vi.fn>).mock.calls[0][2]
    expect(components.audio).toBeUndefined()
  })
})
