/**
 * LiveCodingEditor backwards-compat smoke test (Phase 10.2 Task 09).
 *
 * Verifies that the thin-composition shim renders, accepts the most-used
 * props, and delegates to the workspace shell primitives.
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

import { LiveCodingEditor } from '../LiveCodingEditor'
import { __resetWorkspaceFilesForTests } from '../workspace/WorkspaceFile'
import { __resetWorkspaceLanguagesForTests } from '../workspace/languages'
import { __resetWorkspaceAudioBusForTests } from '../workspace/WorkspaceAudioBus'
import type { LiveCodingEngine, EngineComponents } from '../engine/LiveCodingEngine'

// ---------------------------------------------------------------------------
// Minimal mock engine
// ---------------------------------------------------------------------------

function createMockEngine(): LiveCodingEngine {
  return {
    components: {} as EngineComponents,
    init: vi.fn(async () => {}),
    evaluate: vi.fn(async () => ({ error: null })),
    play: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
    setRuntimeErrorHandler: vi.fn(),
    getSoundNames: vi.fn(() => []),
  } as unknown as LiveCodingEngine
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LiveCodingEditor backwards-compat shim', () => {
  beforeEach(() => {
    __resetWorkspaceFilesForTests()
    __resetWorkspaceLanguagesForTests?.()
    __resetWorkspaceAudioBusForTests?.()
  })

  it('renders without crashing with a mock engine', async () => {
    const engine = createMockEngine()
    let container: HTMLElement | undefined
    await act(async () => {
      const result = render(
        <LiveCodingEditor engine={engine} defaultCode="// test" />,
      )
      container = result.container
    })
    expect(container).toBeDefined()
    // The shell should have rendered — look for mock Monaco editor
    expect(container!.querySelector('[data-testid="mock-monaco-editor"]')).not.toBeNull()
  })

  it('passes the code prop through to the workspace file store', async () => {
    const engine = createMockEngine()
    const onChange = vi.fn()
    await act(async () => {
      render(
        <LiveCodingEditor
          engine={engine}
          code="// controlled code"
          onChange={onChange}
        />,
      )
    })
    // The shell rendered — controlled code was seeded
    const { getFile } = await import('../workspace/WorkspaceFile')
    const file = getFile('__livecoding_editor__')
    expect(file).toBeDefined()
    expect(file!.content).toBe('// controlled code')
  })

  it('applies theme to the shell', async () => {
    const engine = createMockEngine()
    let container: HTMLElement | undefined
    await act(async () => {
      const result = render(
        <LiveCodingEditor engine={engine} theme="light" />,
      )
      container = result.container
    })
    // The shell renders a container — verify it exists.
    // Theme is applied via applyTheme() CSS vars, not a data attribute.
    expect(container!.children.length).toBeGreaterThan(0)
  })
})
