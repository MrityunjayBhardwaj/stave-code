/**
 * VizEditor — backwards-compatible shim (Phase 10.2 Task 09).
 *
 * Thin composition over `WorkspaceShell` + `seedFromPreset` / `flushToPreset`.
 * Preserves the `VizEditorProps` interface (D-06) while delegating tab bar,
 * preview rendering, and drag-drop to the shell.
 *
 * On mount:
 *   1. Loads presets from `VizPresetStore`.
 *   2. Seeds a `WorkspaceFile` for each preset via `seedFromPreset`.
 *   3. Mounts `<WorkspaceShell>` with editor + preview tabs per preset.
 *
 * Ctrl+S save:
 *   - Wired via `onTabClose` is not applicable here; the shell's keyboard
 *     command registry handles Cmd+K but Ctrl+S is wired at the window level
 *     in this shim to call `flushToPreset` for the active tab.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { EngineComponents } from '../engine/LiveCodingEngine'
import type { VizPreset } from './vizPreset'
import { VizPresetStore, generateUniquePresetId } from './vizPreset'
import type { HapStream } from '../engine/HapStream'
import type { PatternScheduler } from './types'
import { applyTheme } from '../theme/tokens'
import type { StrudelTheme } from '../theme/tokens'
import { WorkspaceShell } from '../workspace/WorkspaceShell'
import {
  seedFromPreset,
  flushToPreset,
  workspaceFileIdForPreset,
  getPresetIdForFile,
} from '../workspace/preview/vizPresetBridge'
import { getPreviewProviderForLanguage } from '../workspace/preview/registry'
import { getFile } from '../workspace/WorkspaceFile'
import type { WorkspaceTab } from '../workspace/types'
import type { PreviewProvider } from '../workspace/PreviewProvider'
import { HYDRA_TEMPLATE, P5_TEMPLATE } from './editor/vizEditorTypes'

export interface VizEditorProps {
  components: Partial<EngineComponents>
  hapStream: HapStream | null
  analyser: AnalyserNode | null
  scheduler: PatternScheduler | null
  onPresetSaved?: (preset: VizPreset) => void
  height?: number | string
  previewHeight?: number | string
  /** Theme applied to the container — defaults to 'dark'. */
  theme?: 'dark' | 'light' | StrudelTheme
}

export function VizEditor({
  components: _components,
  hapStream: _hapStream,
  analyser: _analyser,
  scheduler: _scheduler,
  onPresetSaved,
  height = 400,
  previewHeight: _previewHeight = 200,
  theme = 'dark',
}: VizEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [initialTabs, setInitialTabs] = useState<WorkspaceTab[] | null>(null)
  const activeTabRef = useRef<WorkspaceTab | null>(null)

  // Apply theme to wrapper container.
  useEffect(() => {
    if (containerRef.current) applyTheme(containerRef.current, theme)
  }, [theme])

  // Load presets from IndexedDB and seed workspace files.
  useEffect(() => {
    VizPresetStore.getAll().then((presets) => {
      const tabs: WorkspaceTab[] = []
      for (const preset of presets) {
        const fileId = seedFromPreset(preset)
        tabs.push({
          kind: 'editor',
          id: `editor-${fileId}`,
          fileId,
        })
        tabs.push({
          kind: 'preview',
          id: `preview-${fileId}`,
          fileId,
          sourceRef: { kind: 'none' },
        })
      }
      setInitialTabs(tabs.length > 0 ? tabs : [])
    })
  }, [])

  // Ctrl+S save handler at window level.
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        const tab = activeTabRef.current
        if (!tab) return
        const file = getFile(tab.fileId)
        if (!file) return
        const presetId = getPresetIdForFile(file)
        if (!presetId) return
        flushToPreset(file.id, presetId).then(() => {
          VizPresetStore.get(presetId).then((preset) => {
            if (preset) onPresetSaved?.(preset)
          })
        })
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [onPresetSaved])

  const handleActiveTabChange = useCallback((tab: WorkspaceTab | null) => {
    activeTabRef.current = tab
  }, [])

  const previewProviderFor = useCallback(
    (tab: WorkspaceTab & { kind: 'preview' }): PreviewProvider | undefined => {
      const file = getFile(tab.fileId)
      if (!file) return undefined
      return getPreviewProviderForLanguage(file.language) ?? undefined
    },
    [],
  )

  if (initialTabs === null) return null

  return (
    <div
      ref={containerRef}
      data-testid="viz-editor"
      data-stave-theme={typeof theme === 'string' ? theme : 'custom'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: typeof height === 'number' ? height + 40 : height,
      }}
    >
      <WorkspaceShell
        initialTabs={initialTabs}
        theme={theme}
        height="100%"
        onActiveTabChange={handleActiveTabChange}
        previewProviderFor={previewProviderFor}
      />
    </div>
  )
}
