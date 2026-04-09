/**
 * HYDRA_VIZ provider — unit tests (Phase 10.2 Task 06).
 *
 * The provider is a one-line call to `createCompiledVizProvider`, so the
 * real surface under test is the helper's render path exercised through
 * the HYDRA adapter. Tests cover:
 *
 *   1. Provider shape (extensions, label, reload policy, keepHidden flag).
 *   2. `render(ctx)` returns a React element — not a ReactNode primitive
 *      or a raw string — so PreviewView can mount it.
 *   3. `compilePreset` is called with a synthetic preset derived from the
 *      file content + path + hydra renderer tag.
 *   4. The mounted output shows the compiled-viz-mount test id (proving
 *      `mountVizRenderer` got called through the shared leaf component).
 *   5. Demo mode: with `audioSource === null`, the renderer still mounts
 *      (empty component bag, which both renderers handle gracefully).
 *   6. Compile error: syntactically invalid code returns an error panel
 *      instead of a mount.
 *
 * ## Mocking strategy
 *
 * `compilePreset` and `mountVizRenderer` are mocked because:
 *   - Real `compilePreset` calls `new Function(code)` on untrusted code.
 *     Safe but irrelevant for this test, which cares about the adapter.
 *   - Real `mountVizRenderer` drives a live `HydraVizRenderer` (loads
 *     hydra-synth via dynamic import, touches WebGL). jsdom has no
 *     WebGL. Mocking isolates the adapter from the renderer stack.
 *
 * The mocks are module-level `vi.mock` hoisted calls; the factory
 * functions are simple spies returning stable objects so that tests
 * can assert on call arguments.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, cleanup } from '@testing-library/react'
import type { PreviewContext } from '../../PreviewProvider'
import type {
  AudioPayload,
  WorkspaceFile,
} from '../../types'
import type { VizDescriptor } from '../../../visualizers/types'

// Mock compilePreset — returns a stable descriptor we can assert on.
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

// Mock mountVizRenderer — returns a fake renderer handle so the effect
// can run to completion without touching Hydra/WebGL.
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

// Import after the mocks so the module picks up the stubbed versions.
import { HYDRA_VIZ } from '../hydraViz'
import { compilePreset } from '../../../visualizers/vizCompiler'
import { mountVizRenderer } from '../../../visualizers/mountVizRenderer'

function makeFile(
  id: string,
  content: string,
  language: WorkspaceFile['language'] = 'hydra',
): WorkspaceFile {
  return {
    id,
    path: `${id}.hydra`,
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

describe('HYDRA_VIZ provider shape', () => {
  it('claims the .hydra extension (hydra without leading dot per contract)', () => {
    expect(HYDRA_VIZ.extensions).toContain('hydra')
  })

  it('has a human-readable label', () => {
    expect(HYDRA_VIZ.label).toBe('Hydra Visualization')
  })

  it('pauses when hidden per D-03', () => {
    expect(HYDRA_VIZ.keepRunningWhenHidden).toBe(false)
  })

  it('uses debounced reload per D-07', () => {
    expect(HYDRA_VIZ.reload).toBe('debounced')
    expect(HYDRA_VIZ.debounceMs).toBe(300)
  })

  it('exposes a render function', () => {
    expect(typeof HYDRA_VIZ.render).toBe('function')
  })
})

describe('HYDRA_VIZ render path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('calls compilePreset with a preset built from the file content and hydra renderer', () => {
    const file = makeFile('f1', 's.osc().out()')
    const node = HYDRA_VIZ.render(makeCtx(file))
    render(node as React.ReactElement)

    expect(compilePreset).toHaveBeenCalledTimes(1)
    const calledPreset = (compilePreset as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0][0]
    expect(calledPreset.renderer).toBe('hydra')
    expect(calledPreset.code).toBe('s.osc().out()')
    expect(calledPreset.id).toBe('f1')
  })

  it('render returns a React element (not a string or null on happy path)', () => {
    const file = makeFile('f2', 's.solid().out()')
    const node = HYDRA_VIZ.render(makeCtx(file))
    expect(React.isValidElement(node)).toBe(true)
  })

  it('mounts the renderer via mountVizRenderer on the compiled descriptor', () => {
    const file = makeFile('f3', 's.osc().out()')
    const node = HYDRA_VIZ.render(makeCtx(file))
    const { getByTestId } = render(node as React.ReactElement)
    // Effect fires after render, so mountVizRenderer should have been
    // called by the time this assertion runs.
    expect(mountVizRenderer).toHaveBeenCalledTimes(1)
    expect(getByTestId('compiled-viz-mount-f3')).toBeTruthy()
  })

  it('passes an empty component bag when audioSource is null (demo mode, P7)', () => {
    const file = makeFile('f4', 's.osc().out()')
    const node = HYDRA_VIZ.render(makeCtx(file, null))
    render(node as React.ReactElement)

    const args = (mountVizRenderer as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]
    // mountVizRenderer(container, source, components, size, onError)
    const components = args[2]
    // Demo mode → no streaming, audio, queryable, or inlineViz slots.
    expect(components.streaming).toBeUndefined()
    expect(components.audio).toBeUndefined()
    expect(components.queryable).toBeUndefined()
    expect(components.inlineViz).toBeUndefined()
  })

  it('populates the component bag when audioSource is non-null', () => {
    const file = makeFile('f5', 's.osc().out()')
    const fakeAnalyser = {
      context: {} as unknown,
    } as unknown as AnalyserNode
    const payload = {
      hapStream: { id: 'hs' } as unknown as AudioPayload['hapStream'],
      analyser: fakeAnalyser,
      scheduler: { id: 's' } as unknown as AudioPayload['scheduler'],
    } as AudioPayload

    const node = HYDRA_VIZ.render(makeCtx(file, payload))
    render(node as React.ReactElement)

    const args = (mountVizRenderer as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]
    const components = args[2]
    expect(components.streaming?.hapStream).toBe(payload.hapStream)
    expect(components.audio?.analyser).toBe(payload.analyser)
    expect(components.queryable?.scheduler).toBe(payload.scheduler)
  })

  it('renders an error panel when compilePreset throws (invalid code)', () => {
    ;(compilePreset as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => {
        throw new Error('syntax error: unexpected token')
      },
    )
    const file = makeFile('f6', 'this is ( not valid')
    const node = HYDRA_VIZ.render(makeCtx(file))
    const { getByTestId } = render(node as React.ReactElement)
    const panel = getByTestId('compiled-viz-error-f6')
    expect(panel.textContent).toContain('syntax error: unexpected token')
  })
})
