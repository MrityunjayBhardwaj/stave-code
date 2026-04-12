/**
 * LiveCodingEditor — backwards-compatible shim (Phase 10.2 Task 09).
 *
 * Thin composition over the new workspace primitives. Preserves the public
 * `LiveCodingEditorProps` interface (D-06) while delegating rendering to
 * `WorkspaceShell`, `EditorView`, and the runtime provider registry.
 *
 * Internally:
 *   1. Seeds a `WorkspaceFile` for the editor content.
 *   2. Creates a `LiveCodingRuntime` for the engine.
 *   3. Manages runtime state (isPlaying, error, bpm) via subscriptions.
 *   4. Mounts `<WorkspaceShell>` with one editor tab, theme, and chrome.
 *   5. Syncs `code` / `defaultCode` via a controlled-prop guard.
 *   6. Calls `runtime.dispose()` on unmount (U3).
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { StrudelTheme } from './theme/tokens'
import type { VizDescriptor } from './visualizers/types'
import { DEFAULT_VIZ_DESCRIPTORS } from './visualizers/defaultDescriptors'
import type { LiveCodingEngine } from './engine/LiveCodingEngine'
import { WorkspaceShell } from './workspace/WorkspaceShell'
import { LiveCodingRuntime } from './workspace/runtime/LiveCodingRuntime'
import { seedWorkspaceFile, getFile, setContent, subscribe as storeSubscribe } from './workspace/WorkspaceFile'
import { getRuntimeProviderForLanguage } from './workspace/runtime/registry'
import type { WorkspaceTab, ChromeContext } from './workspace/types'

export type { StrudelTheme }

export interface LiveCodingEditorProps {
  // Engine (required)
  engine: LiveCodingEngine

  // Content
  code?: string
  defaultCode?: string
  onChange?: (code: string) => void

  // Playback
  autoPlay?: boolean
  onPlay?: () => void
  onStop?: () => void
  onError?: (error: Error) => void

  // Visual
  visualizer?: string
  activeHighlight?: boolean
  theme?: 'dark' | 'light' | StrudelTheme
  showVizPicker?: boolean
  vizDescriptors?: VizDescriptor[]

  // Layout
  height?: number | string
  vizHeight?: number | string
  showToolbar?: boolean
  readOnly?: boolean

  // Extension points
  toolbarExtra?: React.ReactNode
  onPostEvaluate?: (engine: LiveCodingEngine) => void
  soundNames?: string[]
  bpm?: number
  isExporting?: boolean
  onExport?: () => void

  // Advanced
  engineRef?: React.MutableRefObject<LiveCodingEngine | null>
  /** Monaco language ID (e.g. 'strudel', 'sonicpi'). Defaults to 'strudel'. */
  language?: string
}

const DEFAULT_CODE = `// Welcome to Stave`

/** Stable file id for the single editor tab in this shim. */
const FILE_ID = '__livecoding_editor__'

export function LiveCodingEditor({
  engine,
  code: controlledCode,
  defaultCode,
  onChange,
  autoPlay = false,
  onPlay,
  onStop,
  onError,
  theme = 'dark',
  height = 320,
  vizHeight: _vizHeight = 200,
  showToolbar: _showToolbar = true,
  showVizPicker: _showVizPicker,
  readOnly: _readOnly = false,
  activeHighlight: _activeHighlight = true,
  visualizer: _visualizer = 'off',
  vizDescriptors: _vizDescriptors = DEFAULT_VIZ_DESCRIPTORS,
  toolbarExtra,
  onPostEvaluate,
  soundNames: _soundNames,
  bpm: bpmProp,
  isExporting: _isExportingProp = false,
  onExport: _onExportProp,
  engineRef: engineRefProp,
  language: _language,
}: LiveCodingEditorProps) {
  const isControlled = controlledCode !== undefined
  const initialCode = controlledCode ?? defaultCode ?? DEFAULT_CODE

  // -- Runtime lifecycle --
  const runtimeRef = useRef<LiveCodingRuntime | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [bpm, setBpm] = useState<number | undefined>(bpmProp)
  const [autoRefresh, setAutoRefresh] = useState(false)

  // Seed the workspace file once on mount.
  const fileIdRef = useRef(FILE_ID)
  const [seeded, setSeeded] = useState(false)
  useEffect(() => {
    seedWorkspaceFile(
      fileIdRef.current,
      'pattern.strudel',
      initialCode,
      'strudel',
    )
    setSeeded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Create runtime once.
  useEffect(() => {
    if (!seeded) return
    const rt = new LiveCodingRuntime(
      fileIdRef.current,
      engine,
      () => getFile(fileIdRef.current)?.content ?? '',
      // Pass the workspace-file subscriber so the runtime can install
      // its own content-change subscription for live mode. Lazy — only
      // fires after setAutoRefresh(true).
      (cb) => storeSubscribe(fileIdRef.current, cb),
    )
    runtimeRef.current = rt

    // Expose engine to parent via engineRef prop.
    if (engineRefProp) engineRefProp.current = engine

    // Subscribe to runtime events.
    const unsubError = rt.onError((err) => {
      setError(err)
      onError?.(err)
    })
    const unsubPlaying = rt.onPlayingChanged((playing) => {
      setIsPlaying(playing)
      if (playing) {
        onPlay?.()
        setBpm(rt.getBpm())
        onPostEvaluate?.(engine)
      } else {
        onStop?.()
      }
    })
    const unsubAutoRefresh = rt.onAutoRefreshChanged(setAutoRefresh)

    // Dispose on unmount (U3).
    return () => {
      unsubError()
      unsubPlaying()
      unsubAutoRefresh()
      rt.dispose()
      runtimeRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeded, engine])

  // Auto-play on mount.
  const autoPlayedRef = useRef(false)
  useEffect(() => {
    if (!autoPlay || !runtimeRef.current || autoPlayedRef.current) return
    autoPlayedRef.current = true
    runtimeRef.current.play()
  }, [autoPlay, seeded])

  // -- Controlled prop sync --
  // When the embedder passes a new `code` prop, sync it into the workspace
  // file store. Equality guard prevents overwriting in-progress keystrokes.
  useEffect(() => {
    if (!isControlled || !seeded) return
    const file = getFile(fileIdRef.current)
    if (file && controlledCode !== file.content) {
      setContent(fileIdRef.current, controlledCode!)
    }
  }, [controlledCode, isControlled, seeded])

  // Listen to workspace file changes and propagate to onChange.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    if (!seeded) return
    return storeSubscribe(fileIdRef.current, () => {
      const file = getFile(fileIdRef.current)
      if (file) onChangeRef.current?.(file.content)
    })
  }, [seeded])

  // -- Shell chrome wiring --
  const handlePlay = useCallback(() => {
    setError(null)
    runtimeRef.current?.play()
  }, [])

  const handleStop = useCallback(() => {
    runtimeRef.current?.stop()
  }, [])

  const handleToggleAutoRefresh = useCallback(() => {
    const rt = runtimeRef.current
    if (!rt) return
    rt.setAutoRefresh(!rt.isAutoRefreshEnabled())
  }, [])

  const chromeForTab = useCallback(
    (tab: WorkspaceTab): React.ReactNode | undefined => {
      if (tab.kind !== 'editor') return undefined
      const rt = runtimeRef.current
      if (!rt) return undefined
      const provider = getRuntimeProviderForLanguage('strudel')
      if (!provider) return undefined
      const ctx: ChromeContext = {
        runtime: rt,
        file: getFile(fileIdRef.current)!,
        isPlaying,
        error,
        bpm: bpmProp ?? bpm,
        onPlay: handlePlay,
        onStop: handleStop,
        chromeExtras: toolbarExtra,
        autoRefresh,
        onToggleAutoRefresh: handleToggleAutoRefresh,
      }
      return provider.renderChrome(ctx)
    },
    [isPlaying, error, bpm, bpmProp, handlePlay, handleStop, toolbarExtra, autoRefresh, handleToggleAutoRefresh],
  )

  // -- Editor extras (play/stop keybindings + error squiggles) --
  const editorExtrasForTab = useCallback(
    () => ({
      onPlay: handlePlay,
      onStop: handleStop,
      error,
    }),
    [handlePlay, handleStop, error],
  )

  // -- Shell tabs --
  const initialTabs: WorkspaceTab[] = [
    { kind: 'editor', id: 'editor-main', fileId: fileIdRef.current },
  ]

  if (!seeded) return null

  return (
    <WorkspaceShell
      initialTabs={initialTabs}
      theme={theme}
      height={height}
      chromeForTab={chromeForTab}
      editorExtrasForTab={editorExtrasForTab}
    />
  )
}
