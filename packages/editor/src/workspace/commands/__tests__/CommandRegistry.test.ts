/**
 * CommandRegistry -- unit tests (Phase 10.2 Task 08).
 *
 * Covers:
 *   - Register + get + execute
 *   - executeCommand with unknown id --> no-op
 *   - resetCommandRegistryForTests clears and re-registers built-ins
 *   - Built-in commands: openPreviewToSide, toggleBackgroundPreview,
 *     openPreviewInWindow
 *   - Disabled for pattern files with one-time console.warn (U5)
 *   - Preview-kind tab --> silent no-op for openPreviewToSide
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  registerCommand,
  getCommand,
  executeCommand,
  resetCommandRegistryForTests,
  type CommandContext,
  type WorkspaceShellActions,
  type WorkspaceCommand,
} from '../CommandRegistry'
import type { WorkspaceTab, WorkspaceGroupState } from '../../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeShellActions(overrides?: Partial<WorkspaceShellActions>): WorkspaceShellActions {
  return {
    addTab: vi.fn(),
    splitGroupWithTab: vi.fn(),
    updateGroupBackground: vi.fn(),
    closeTab: vi.fn(),
    findTabByFileId: vi.fn(() => null),
    openPopoutPreview: vi.fn(),
    ...overrides,
  }
}

function makeCtx(
  overrides?: Partial<CommandContext>,
): CommandContext {
  return {
    activeTab: null,
    activeGroupId: 'g1',
    activeGroup: { id: 'g1', tabs: [], activeTabId: null },
    shell: makeShellActions(),
    getPreviewProvider: () => undefined,
    ...overrides,
  }
}

const hydraProvider = {
  extensions: ['hydra'],
  label: 'Hydra',
  keepRunningWhenHidden: false,
  reload: 'instant' as const,
  render: () => null,
}

function editorTab(fileId: string): WorkspaceTab {
  return { kind: 'editor', id: `tab-${fileId}`, fileId }
}

function previewTab(fileId: string): WorkspaceTab {
  return {
    kind: 'preview',
    id: `preview-${fileId}`,
    fileId,
    sourceRef: { kind: 'default' },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CommandRegistry', () => {
  beforeEach(() => {
    resetCommandRegistryForTests()
  })

  describe('register + get + execute', () => {
    it('registers a command and retrieves it by id', () => {
      const cmd: WorkspaceCommand = {
        id: 'test.cmd',
        label: 'Test',
        execute: vi.fn(),
      }
      registerCommand(cmd)
      expect(getCommand('test.cmd')).toBe(cmd)
    })

    it('executeCommand with unknown id is a no-op', () => {
      // Should not throw
      executeCommand('nonexistent.command', makeCtx())
    })

    it('executeCommand invokes the command', () => {
      const execute = vi.fn()
      registerCommand({ id: 'test.exec', label: 'Test', execute })
      const ctx = makeCtx()
      executeCommand('test.exec', ctx)
      expect(execute).toHaveBeenCalledWith(ctx)
    })
  })

  describe('resetCommandRegistryForTests', () => {
    it('clears custom commands but re-registers built-ins', () => {
      registerCommand({ id: 'custom', label: 'Custom', execute: vi.fn() })
      resetCommandRegistryForTests()
      expect(getCommand('custom')).toBeUndefined()
      // Built-ins should still exist
      expect(getCommand('workspace.openPreviewToSide')).toBeDefined()
      expect(getCommand('workspace.toggleBackgroundPreview')).toBeDefined()
      expect(getCommand('workspace.openPreviewInWindow')).toBeDefined()
    })
  })

  describe('workspace.openPreviewToSide', () => {
    it('creates a split group with a preview tab for a hydra file', () => {
      const shell = makeShellActions()
      const ctx = makeCtx({
        activeTab: editorTab('pianoroll.hydra'),
        shell,
        getPreviewProvider: (lang) => (lang === 'hydra' ? hydraProvider : undefined),
      })
      executeCommand('workspace.openPreviewToSide', ctx)
      expect(shell.splitGroupWithTab).toHaveBeenCalledTimes(1)
      const [groupId, direction, newTab] = (shell.splitGroupWithTab as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(groupId).toBe('g1')
      expect(direction).toBe('right')
      expect(newTab.kind).toBe('preview')
      expect(newTab.fileId).toBe('pianoroll.hydra')
      expect(newTab.sourceRef).toEqual({ kind: 'default' })
    })

    it('no-ops silently for preview-kind tabs', () => {
      const shell = makeShellActions()
      const ctx = makeCtx({
        activeTab: previewTab('pianoroll.hydra'),
        shell,
        getPreviewProvider: () => hydraProvider,
      })
      executeCommand('workspace.openPreviewToSide', ctx)
      expect(shell.splitGroupWithTab).not.toHaveBeenCalled()
    })

    it('no-ops with console.warn for strudel files (U5)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const shell = makeShellActions()
      const ctx = makeCtx({
        activeTab: editorTab('pattern.strudel'),
        shell,
      })
      executeCommand('workspace.openPreviewToSide', ctx)
      expect(shell.splitGroupWithTab).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledWith(
        'workspace.openPreviewToSide not available for .strudel files',
      )
      // Second invocation -- no additional warn (one-time per U5)
      executeCommand('workspace.openPreviewToSide', ctx)
      expect(warnSpy).toHaveBeenCalledTimes(1)
      warnSpy.mockRestore()
    })
  })

  describe('workspace.toggleBackgroundPreview', () => {
    it('sets backgroundTabId on first toggle', () => {
      const shell = makeShellActions()
      const group: WorkspaceGroupState = {
        id: 'g1',
        tabs: [editorTab('pianoroll.hydra')],
        activeTabId: 'tab-pianoroll.hydra',
      }
      const ctx = makeCtx({
        activeTab: editorTab('pianoroll.hydra'),
        activeGroup: group,
        shell,
        getPreviewProvider: (lang) => (lang === 'hydra' ? hydraProvider : undefined),
      })
      executeCommand('workspace.toggleBackgroundPreview', ctx)
      expect(shell.updateGroupBackground).toHaveBeenCalledWith('g1', 'bg-pianoroll.hydra')
    })

    it('clears backgroundTabId on second toggle', () => {
      const shell = makeShellActions()
      const group: WorkspaceGroupState = {
        id: 'g1',
        tabs: [editorTab('pianoroll.hydra')],
        activeTabId: 'tab-pianoroll.hydra',
        backgroundTabId: 'bg-pianoroll.hydra',
      }
      const ctx = makeCtx({
        activeTab: editorTab('pianoroll.hydra'),
        activeGroup: group,
        shell,
        getPreviewProvider: (lang) => (lang === 'hydra' ? hydraProvider : undefined),
      })
      executeCommand('workspace.toggleBackgroundPreview', ctx)
      expect(shell.updateGroupBackground).toHaveBeenCalledWith('g1', null)
    })

    it('no-ops with console.warn for pattern files', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const shell = makeShellActions()
      const ctx = makeCtx({
        activeTab: editorTab('pattern.strudel'),
        shell,
      })
      executeCommand('workspace.toggleBackgroundPreview', ctx)
      expect(shell.updateGroupBackground).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledWith(
        'workspace.toggleBackgroundPreview not available for .strudel files',
      )
      warnSpy.mockRestore()
    })
  })

  describe('workspace.openPreviewInWindow', () => {
    it('calls openPopoutPreview for a hydra file', () => {
      const shell = makeShellActions()
      const ctx = makeCtx({
        activeTab: editorTab('pianoroll.hydra'),
        shell,
        getPreviewProvider: (lang) => (lang === 'hydra' ? hydraProvider : undefined),
      })
      executeCommand('workspace.openPreviewInWindow', ctx)
      expect(shell.openPopoutPreview).toHaveBeenCalledWith('pianoroll.hydra')
    })

    it('no-ops with console.warn for sonicpi files', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const shell = makeShellActions()
      const ctx = makeCtx({
        activeTab: editorTab('pattern.sonicpi'),
        shell,
      })
      executeCommand('workspace.openPreviewInWindow', ctx)
      expect(shell.openPopoutPreview).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledWith(
        'workspace.openPreviewInWindow not available for .sonicpi files',
      )
      warnSpy.mockRestore()
    })
  })
})
