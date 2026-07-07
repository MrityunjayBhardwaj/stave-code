/**
 * VizEditorChrome — backdrop activation starts the selected audio source (#784).
 *
 * Regression: the ▶ Play primary (default placement = backdrop) called only
 * onToggleBackground, skipping the `builtin.startIfIdle()` that the side path
 * always ran. So selecting a sample source + Play (backdrop) started NO audio —
 * "not even the selected sample audio is playing", and the audio-reactive viz
 * stayed blank. Side worked because openSidePreview started the source.
 *
 * builtinExampleSources is mocked so startIfIdle/stopIfRunning are inert spies
 * (the real ones touch superdough / AudioContext — unavailable in jsdom).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, cleanup, fireEvent } from '@testing-library/react'
import type { WorkspaceFile } from '../../types'

// Break the p5/WebGL import chain that HYDRA_VIZ pulls in (mirrors hydraViz.test).
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

import { HYDRA_VIZ } from '../hydraViz'

// vi.hoisted so these exist before the hoisted vi.mock factory references them.
const { sampleStart, sampleStop, drumStart, drumStop } = vi.hoisted(() => ({
  sampleStart: vi.fn(),
  sampleStop: vi.fn(),
  drumStart: vi.fn(),
  drumStop: vi.fn(),
}))

vi.mock('../../builtinExampleSources', () => {
  const sample = {
    sourceId: '__sample__',
    label: 'Sample',
    startIfIdle: sampleStart,
    stopIfRunning: sampleStop,
  }
  const drum = {
    sourceId: '__drum__',
    label: 'Drum',
    startIfIdle: drumStart,
    stopIfRunning: drumStop,
  }
  const list = [sample, drum]
  return {
    BUILTIN_EXAMPLE_SOURCES: list,
    BUILTIN_SOURCE_IDS: new Set(list.map((s) => s.sourceId)),
    findBuiltinExampleSource: (id: string) => list.find((s) => s.sourceId === id),
  }
})

function makeFile(id: string): WorkspaceFile {
  return { id, path: `${id}.hydra`, content: 'osc().out()', language: 'hydra' }
}

beforeEach(() => {
  sampleStart.mockClear()
  sampleStop.mockClear()
  drumStart.mockClear()
  drumStop.mockClear()
})
afterEach(cleanup)

function selectSource(
  getByTestId: (id: string) => HTMLElement,
  value: string,
) {
  fireEvent.click(getByTestId('viz-chrome-settings'))
  fireEvent.change(getByTestId('viz-chrome-source'), { target: { value } })
}

describe('VizEditorChrome — backdrop activation starts the audio source (#784)', () => {
  it('▶ Play (default backdrop) starts the SELECTED built-in source', () => {
    const onToggleBackground = vi.fn()
    const onOpenPreview = vi.fn()
    const chrome = HYDRA_VIZ.renderEditorChrome!({
      file: makeFile('rings'),
      onOpenPreview,
      onToggleBackground,
      onSave: vi.fn(),
    })
    const { getByTestId } = render(chrome as React.ReactElement)

    // Pick the sample source in the ⚙ popover, then Play.
    selectSource(getByTestId, 'file:__sample__')
    fireEvent.click(getByTestId('viz-chrome-open-preview'))

    expect(sampleStart).toHaveBeenCalledTimes(1) // audio actually starts
    expect(onToggleBackground).toHaveBeenCalledTimes(1) // mounts the backdrop
    expect(onOpenPreview).not.toHaveBeenCalled() // NOT a side split
  })

  it('changing the source while the BACKDROP is live swaps the audio', () => {
    // isBackground=true → previewMode 'backdrop'. Switching source must stop the
    // old built-in and start the new one (previously only side previews did).
    const chrome = HYDRA_VIZ.renderEditorChrome!({
      file: makeFile('rings'),
      isBackground: true,
      onOpenPreview: vi.fn(),
      onToggleBackground: vi.fn(),
      onSave: vi.fn(),
    })
    const { getByTestId } = render(chrome as React.ReactElement)

    selectSource(getByTestId, 'file:__sample__')
    expect(sampleStart).toHaveBeenCalledTimes(1)

    fireEvent.change(getByTestId('viz-chrome-source'), {
      target: { value: 'file:__drum__' },
    })
    expect(drumStart).toHaveBeenCalledTimes(1) // new source starts
    expect(sampleStop).toHaveBeenCalledTimes(1) // old source stops
  })

  it('side path still starts the source (unchanged parity)', () => {
    const onOpenPreview = vi.fn()
    const chrome = HYDRA_VIZ.renderEditorChrome!({
      file: makeFile('rings'),
      onOpenPreview,
      onToggleBackground: vi.fn(),
      onSave: vi.fn(),
    })
    const { getByTestId } = render(chrome as React.ReactElement)

    // Switch placement pref to side via the popover, pick source, then Play.
    fireEvent.click(getByTestId('viz-chrome-settings'))
    fireEvent.change(getByTestId('viz-chrome-source'), {
      target: { value: 'file:__sample__' },
    })
    fireEvent.click(getByTestId('viz-preview-mode-side'))
    // preview-mode-side already calls openSidePreview once (starts source).
    expect(sampleStart).toHaveBeenCalled()
    expect(onOpenPreview).toHaveBeenCalled()
  })
})
