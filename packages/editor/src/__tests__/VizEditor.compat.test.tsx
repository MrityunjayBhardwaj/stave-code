/**
 * VizEditor backwards-compat smoke test (Phase 10.2 Task 09).
 *
 * Verifies that the thin-composition shim renders, loads presets, and
 * delegates to the workspace shell primitives.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { render, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock @monaco-editor/react BEFORE importing anything that reaches for it.
// ---------------------------------------------------------------------------

interface MonacoEditorProps {
  language?: string
  value?: string
  onChange?: (value: string | undefined) => void
  onMount?: (editor: unknown, monaco: unknown) => void
  height?: string | number
  options?: Record<string, unknown>
}

const stubEditor = { id: 'stub-editor' }
const stubMonaco = {
  languages: {
    register: vi.fn(),
    setMonarchTokensProvider: vi.fn(),
    setLanguageConfiguration: vi.fn(),
    getLanguages: vi.fn(() => [] as Array<{ id: string }>),
  },
}

vi.mock('@monaco-editor/react', () => ({
  default: (props: MonacoEditorProps) => {
    React.useEffect(() => {
      props.onMount?.(stubEditor, stubMonaco)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return (
      <div
        data-testid="mock-monaco-editor"
        data-language={props.language ?? ''}
        data-value={props.value ?? ''}
      />
    )
  },
}))

// Mock modules imported transitively by EditorView
vi.mock('../visualizers/defaultDescriptors', () => ({
  DEFAULT_VIZ_DESCRIPTORS: [],
}))
vi.mock('../visualizers/viewZones', () => ({
  addInlineViewZones: vi.fn(() => ({ cleanup: vi.fn(), pause: vi.fn(), resume: vi.fn() })),
}))
vi.mock('../monaco/useHighlighting', () => ({
  useHighlighting: vi.fn(() => ({ clearAll: vi.fn() })),
}))
vi.mock('../monaco/diagnostics', () => ({
  setEvalError: vi.fn(),
  clearEvalErrors: vi.fn(),
}))

// Mock VizPresetStore to return test presets
vi.mock('../visualizers/vizPreset', async () => {
  const actual = await vi.importActual('../visualizers/vizPreset') as Record<string, unknown>
  return {
    ...actual,
    VizPresetStore: {
      getAll: vi.fn(async () => [
        {
          id: 'test-hydra-1',
          name: 'test-viz',
          renderer: 'hydra' as const,
          code: '// hydra test',
          requires: ['audio'],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]),
      get: vi.fn(async (id: string) => ({
        id,
        name: 'test-viz',
        renderer: 'hydra' as const,
        code: '// hydra test',
        requires: ['audio'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })),
      put: vi.fn(async () => {}),
    },
  }
})

import { VizEditor } from '../visualizers/VizEditor'
import { __resetWorkspaceFilesForTests } from '../workspace/WorkspaceFile'
import { __resetWorkspaceLanguagesForTests } from '../workspace/languages'
import { __resetWorkspaceAudioBusForTests } from '../workspace/WorkspaceAudioBus'
import type { EngineComponents } from '../engine/LiveCodingEngine'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VizEditor backwards-compat shim', () => {
  beforeEach(() => {
    __resetWorkspaceFilesForTests()
    __resetWorkspaceLanguagesForTests?.()
    __resetWorkspaceAudioBusForTests?.()
  })

  it('renders without crashing', async () => {
    let container: HTMLElement | undefined
    await act(async () => {
      const result = render(
        <VizEditor
          components={{} as Partial<EngineComponents>}
          hapStream={null}
          analyser={null}
          scheduler={null}
        />,
      )
      container = result.container
    })
    expect(container).toBeDefined()
    // The viz-editor wrapper should be present
    const wrapper = container!.querySelector('[data-testid="viz-editor"]')
    expect(wrapper).not.toBeNull()
  })

  it('applies theme', async () => {
    let container: HTMLElement | undefined
    await act(async () => {
      const result = render(
        <VizEditor
          components={{} as Partial<EngineComponents>}
          hapStream={null}
          analyser={null}
          scheduler={null}
          theme="light"
        />,
      )
      container = result.container
    })
    const themed = container!.querySelector('[data-stave-theme="light"]')
    expect(themed).not.toBeNull()
  })

  it('loads presets and seeds workspace files', async () => {
    await act(async () => {
      render(
        <VizEditor
          components={{} as Partial<EngineComponents>}
          hapStream={null}
          analyser={null}
          scheduler={null}
        />,
      )
    })
    const { getFile } = await import('../workspace/WorkspaceFile')
    const file = getFile('viz:test-hydra-1')
    expect(file).toBeDefined()
    expect(file!.content).toBe('// hydra test')
    expect(file!.language).toBe('hydra')
  })
})
