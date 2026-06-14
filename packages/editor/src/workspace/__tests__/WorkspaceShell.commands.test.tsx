/**
 * WorkspaceShell + commands integration tests (Phase 10.2 Task 08).
 *
 * Covers the shell's command wiring:
 *   - Shell with a preview-able tab --> Cmd+K V --> new split group with preview tab
 *   - Shell with a pattern tab (no preview provider) --> Cmd+K V --> silent no-op, console.warn
 *   - Cmd+K B --> background decoration appears, Cmd+K B again --> disappears
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
  // Named export used by HistoryDiffOverlay (#198) — render-only stub.
  DiffEditor: (props: MonacoEditorProps) => (
    <div data-testid="mock-diff-editor" data-language={props.language ?? ""} />
  ),
}))

vi.mock('../../visualizers/defaultDescriptors', () => ({
  DEFAULT_VIZ_DESCRIPTORS: [],
}))
vi.mock('../../visualizers/viewZones', () => ({
  addInlineViewZones: vi.fn(() => ({ cleanup: vi.fn(), pause: vi.fn(), resume: vi.fn() })),
}))
vi.mock('../../monaco/useHighlighting', () => ({
  useHighlighting: vi.fn(() => ({ clearAll: vi.fn() })),
}))
vi.mock('../../monaco/diagnostics', () => ({
  setEvalError: vi.fn(),
  clearEvalErrors: vi.fn(),
}))

import { WorkspaceShell, type WorkspaceShellHandle } from '../WorkspaceShell'
import {
  createWorkspaceFile,
  __resetWorkspaceFilesForTests,
} from '../WorkspaceFile'
import { __resetWorkspaceLanguagesForTests } from '../languages'
import { __resetWorkspaceAudioBusForTests } from '../WorkspaceAudioBus'
import { resetCommandRegistryForTests } from '../commands/CommandRegistry'
import type {
  PreviewProvider,
  PreviewContext,
} from '../PreviewProvider'
import type { WorkspaceTab, WorkspaceGroupState } from '../types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePreviewProvider(): PreviewProvider {
  return {
    extensions: ['hydra'],
    label: 'Test Preview',
    keepRunningWhenHidden: false,
    reload: 'instant',
    render(ctx: PreviewContext) {
      return (
        <div
          data-testid="stub-preview-output"
          data-file-content={ctx.file.content}
          // #350d: expose the paused flag so the backdrop freeze wiring is
          // observable — active pane = live (false), inactive = frozen (true).
          data-paused={String(ctx.paused ?? false)}
        />
      )
    },
  }
}

function seedFiles() {
  createWorkspaceFile('f-strudel', 'pattern.strudel', '// strudel code', 'strudel')
  createWorkspaceFile('f-hydra', 'pianoroll.hydra', '// hydra code', 'hydra')
}

function editorTab(id: string, fileId: string): WorkspaceTab {
  return { kind: 'editor', id, fileId }
}

function fireKeyDown(
  key: string,
  modifiers?: { metaKey?: boolean; ctrlKey?: boolean },
): void {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    metaKey: modifiers?.metaKey ?? false,
    ctrlKey: modifiers?.ctrlKey ?? false,
  })
  window.dispatchEvent(event)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkspaceShell commands integration', () => {
  beforeEach(() => {
    __resetWorkspaceFilesForTests()
    __resetWorkspaceLanguagesForTests()
    __resetWorkspaceAudioBusForTests()
    resetCommandRegistryForTests()
    seedFiles()
  })

  it('Cmd+K V on a hydra editor tab creates a new split group with preview tab', () => {
    const provider = makePreviewProvider()
    const tabs = [editorTab('t-hydra', 'f-hydra')]
    const { container } = render(
      <WorkspaceShell
        initialTabs={tabs}
        previewProviderFor={(tab) =>
          tab.fileId === 'f-hydra' ? provider : undefined
        }
      />,
    )

    // One group initially.
    expect(container.querySelectorAll('[data-workspace-group]').length).toBe(1)

    // Fire Cmd+K V
    act(() => {
      fireKeyDown('k', { metaKey: true })
    })
    act(() => {
      fireKeyDown('v')
    })

    // Now there should be two groups (original + split).
    const groups = container.querySelectorAll('[data-workspace-group]')
    expect(groups.length).toBe(2)

    // The second group should contain a preview tab.
    const previewTabs = container.querySelectorAll('[data-tab-kind="preview"]')
    expect(previewTabs.length).toBe(1)
  })

  it('Cmd+K V on a strudel editor tab is a silent no-op with console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tabs = [editorTab('t-strudel', 'f-strudel')]
    const { container } = render(
      <WorkspaceShell initialTabs={tabs} />,
    )

    act(() => {
      fireKeyDown('k', { metaKey: true })
    })
    act(() => {
      fireKeyDown('v')
    })

    // Still one group -- no split happened.
    expect(container.querySelectorAll('[data-workspace-group]').length).toBe(1)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('not available for .strudel files'),
    )
    warnSpy.mockRestore()
  })

  it('Cmd+K B toggles background decoration on then off', () => {
    const provider = makePreviewProvider()
    const tabs = [editorTab('t-hydra', 'f-hydra')]
    const { container } = render(
      <WorkspaceShell
        initialTabs={tabs}
        previewProviderFor={(tab) =>
          tab.fileId === 'f-hydra' ? provider : undefined
        }
      />,
    )

    // Toggle on
    act(() => {
      fireKeyDown('k', { metaKey: true })
    })
    act(() => {
      fireKeyDown('b')
    })

    // Background decoration should be rendered.
    let bgLayer = container.querySelector('[data-workspace-background]')
    expect(bgLayer).not.toBeNull()

    // Toggle off
    act(() => {
      fireKeyDown('k', { metaKey: true })
    })
    act(() => {
      fireKeyDown('b')
    })

    bgLayer = container.querySelector('[data-workspace-background]')
    expect(bgLayer).toBeNull()
  })

  it('#350d — active pane backdrop is LIVE, inactive pane backdrop FREEZES (paused)', () => {
    // Two split panes, each with its own pinned backdrop. Only the focused
    // (active) pane renders its backdrop LIVE; the inactive pane freezes to its
    // last frame (paused → renderer.pause()). This bounds the shared-GPU cost to
    // ~1× regardless of how many panes are split (#299/#122). `data-backdrop-live`
    // mirrors the group's `data-active-group`; the backdrop preview's `paused`
    // ctx is the inverse.
    createWorkspaceFile('f-hydra2', 'spectrum.hydra', '// hydra code 2', 'hydra')
    const provider = makePreviewProvider()
    const groups = new Map<string, WorkspaceGroupState>([
      ['g1', { id: 'g1', tabs: [editorTab('t1', 'f-hydra')], activeTabId: 't1', backgroundFileId: 'f-hydra' }],
      ['g2', { id: 'g2', tabs: [editorTab('t2', 'f-hydra2')], activeTabId: 't2', backgroundFileId: 'f-hydra2' }],
    ])
    const { container } = render(
      <WorkspaceShell
        initialGroups={groups}
        initialLayout={[['g1', 'g2']]}
        initialActiveGroupId="g2"
        previewProviderFor={() => provider}
      />,
    )

    // Both panes render a backdrop.
    const backdrops = container.querySelectorAll('[data-workspace-background]')
    expect(backdrops.length).toBe(2)

    // Invariant: each backdrop's live flag matches its group's active state,
    // and the backdrop preview's `paused` ctx is the inverse of live.
    let liveCount = 0
    let frozenCount = 0
    container.querySelectorAll('[data-workspace-group]').forEach((g) => {
      const bg = g.querySelector('[data-workspace-background]')
      if (!bg) return
      const live = bg.getAttribute('data-backdrop-live')
      expect(live).toBe(g.getAttribute('data-active-group'))
      const out = bg.querySelector('[data-testid="stub-preview-output"]')
      expect(out?.getAttribute('data-paused')).toBe(String(live !== 'true'))
      if (live === 'true') liveCount++
      else frozenCount++
    })
    // Exactly one active (live) pane and one inactive (frozen) pane.
    expect(liveCount).toBe(1)
    expect(frozenCount).toBe(1)
  })

  it('#350c — per-pane opacity/quality override the global default; absent → default', () => {
    const provider = makePreviewProvider()
    const groups = new Map<string, WorkspaceGroupState>([
      // g1 has explicit per-pane overrides.
      ['g1', {
        id: 'g1', tabs: [editorTab('t1', 'f-hydra')], activeTabId: 't1',
        backgroundFileId: 'f-hydra', backdropOpacity: 0.3, backdropQuality: 'quarter',
      }],
      // g2 has NO overrides → the global default (opacity 1 / quality 'half').
      ['g2', {
        id: 'g2', tabs: [editorTab('t2', 'f-hydra2')], activeTabId: 't2',
        backgroundFileId: 'f-hydra2',
      }],
    ])
    createWorkspaceFile('f-hydra2', 'spectrum.hydra', '// hydra code 2', 'hydra')
    const { container } = render(
      <WorkspaceShell
        initialGroups={groups}
        initialLayout={[['g1', 'g2']]}
        initialActiveGroupId="g1"
        previewProviderFor={() => provider}
      />,
    )

    const bg1 = container.querySelector('[data-workspace-group="g1"] [data-workspace-background]') as HTMLElement
    const bg2 = container.querySelector('[data-workspace-group="g2"] [data-workspace-background]') as HTMLElement
    // g1: per-pane override applied.
    expect(bg1.getAttribute('data-backdrop-quality')).toBe('quarter')
    expect(bg1.style.opacity).toBe('0.3')
    // g2: untouched → global default.
    expect(bg2.getAttribute('data-backdrop-quality')).toBe('half')
    expect(bg2.style.opacity).toBe('1')
  })

  it('#350c — setBackdropOpacity/Quality handle patches the active group; getBackdropSettings resolves', () => {
    const provider = makePreviewProvider()
    const ref = React.createRef<WorkspaceShellHandle>()
    const groups = new Map<string, WorkspaceGroupState>([
      ['g1', {
        id: 'g1', tabs: [editorTab('t1', 'f-hydra')], activeTabId: 't1',
        backgroundFileId: 'f-hydra',
      }],
    ])
    render(
      <WorkspaceShell
        ref={ref}
        initialGroups={groups}
        initialLayout={[['g1']]}
        initialActiveGroupId="g1"
        previewProviderFor={() => provider}
      />,
    )

    // Before: no override → resolved = global default.
    expect(ref.current!.getBackdropSettings('g1')).toEqual({ opacity: 1, quality: 'half' })

    act(() => {
      ref.current!.setBackdropOpacity(0.5)
      ref.current!.setBackdropQuality('full')
    })

    // After: the active group's override resolves.
    expect(ref.current!.getBackdropSettings('g1')).toEqual({ opacity: 0.5, quality: 'full' })

    // Clearing (null) falls back to the global default again.
    act(() => {
      ref.current!.setBackdropOpacity(null)
      ref.current!.setBackdropQuality(null)
    })
    expect(ref.current!.getBackdropSettings('g1')).toEqual({ opacity: 1, quality: 'half' })
  })
})
