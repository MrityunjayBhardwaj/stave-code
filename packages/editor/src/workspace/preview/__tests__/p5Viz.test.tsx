/**
 * P5_VIZ provider — unit tests (Phase 10.2 Task 06).
 *
 * Mirror of `hydraViz.test.tsx` — P5_VIZ is a one-line call to the same
 * helper with different tags, so the tests target the same surface
 * (provider shape, compilePreset + mountVizRenderer invocation, demo
 * mode, compile error) with the p5-specific identity substituted.
 *
 * ## Why duplicate the test file
 *
 * The two providers are isomorphic under `renderer` / `label` /
 * `extensions`, but the test file still duplicates because:
 *
 *   - Vitest output clarity: a P5_VIZ failure shows up in a file named
 *     `p5Viz.test.tsx`, not buried inside a "hydra" suite.
 *   - Future divergence: if a later Phase teaches the p5 provider
 *     something the hydra provider does not know (e.g., a specific
 *     sketch-template fallback), the tests can grow independently.
 *
 * The shared helper's invariants (D-03, D-07, demo mode, compile error)
 * are covered in BOTH tests — they're testing the surface the adapter
 * exposes, not the helper's private internals. If they drift, it's a
 * red flag that the helper contract changed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, cleanup } from '@testing-library/react'
import type { PreviewContext } from '../../PreviewProvider'
import type {
  AudioPayload,
  WorkspaceFile,
} from '../../types'

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

import { P5_VIZ } from '../p5Viz'
import { compilePreset } from '../../../visualizers/vizCompiler'
import { mountVizRenderer } from '../../../visualizers/mountVizRenderer'

function makeFile(
  id: string,
  content: string,
  language: WorkspaceFile['language'] = 'p5js',
): WorkspaceFile {
  return {
    id,
    path: `${id}.p5`,
    content,
    language,
  }
}

function makeCtx(
  file: WorkspaceFile,
  audioSource: AudioPayload | null = null,
  hidden = false,
): PreviewContext {
  return { file, audioSource, hidden }
}

describe('P5_VIZ provider shape', () => {
  it('claims the .p5 extension (without leading dot per contract)', () => {
    expect(P5_VIZ.extensions).toContain('p5')
  })

  it('has a human-readable label', () => {
    expect(P5_VIZ.label).toBe('p5 Visualization')
  })

  it('pauses when hidden per D-03', () => {
    expect(P5_VIZ.keepRunningWhenHidden).toBe(false)
  })

  it('uses debounced reload per D-07', () => {
    expect(P5_VIZ.reload).toBe('debounced')
    expect(P5_VIZ.debounceMs).toBe(300)
  })
})

describe('P5_VIZ render path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('calls compilePreset with the p5 renderer tag', () => {
    const file = makeFile('pf1', 'background(0); ellipse(50,50,20,20)')
    const node = P5_VIZ.render(makeCtx(file))
    render(node as React.ReactElement)

    expect(compilePreset).toHaveBeenCalledTimes(1)
    const calledPreset = (compilePreset as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0][0]
    expect(calledPreset.renderer).toBe('p5')
    expect(calledPreset.code).toBe('background(0); ellipse(50,50,20,20)')
    expect(calledPreset.id).toBe('pf1')
  })

  it('render returns a React element', () => {
    const file = makeFile('pf2', 'background(0)')
    const node = P5_VIZ.render(makeCtx(file))
    expect(React.isValidElement(node)).toBe(true)
  })

  it('mounts the renderer via mountVizRenderer', () => {
    const file = makeFile('pf3', 'background(0)')
    const node = P5_VIZ.render(makeCtx(file))
    const { getByTestId } = render(node as React.ReactElement)
    expect(mountVizRenderer).toHaveBeenCalledTimes(1)
    expect(getByTestId('compiled-viz-mount-pf3')).toBeTruthy()
  })

  it('demo mode: audioSource null → empty component bag (P7)', () => {
    const file = makeFile('pf4', 'background(0)')
    const node = P5_VIZ.render(makeCtx(file, null))
    render(node as React.ReactElement)

    const args = (mountVizRenderer as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]
    const components = args[2]
    expect(components.streaming).toBeUndefined()
    expect(components.audio).toBeUndefined()
    expect(components.queryable).toBeUndefined()
  })

  it('populates queryable slot when audioSource carries a scheduler', () => {
    const file = makeFile('pf5', 'background(0)')
    const payload = {
      scheduler: { id: 's' } as unknown as AudioPayload['scheduler'],
    } as AudioPayload
    const node = P5_VIZ.render(makeCtx(file, payload))
    render(node as React.ReactElement)

    const args = (mountVizRenderer as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]
    const components = args[2]
    expect(components.queryable?.scheduler).toBe(payload.scheduler)
  })

  it('renders an error panel when compilePreset throws', () => {
    ;(compilePreset as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => {
        throw new Error('p5 parse failure')
      },
    )
    const file = makeFile('pf6', 'invalid (')
    const node = P5_VIZ.render(makeCtx(file))
    const { getByTestId } = render(node as React.ReactElement)
    const panel = getByTestId('compiled-viz-error-pf6')
    expect(panel.textContent).toContain('p5 parse failure')
  })
})
