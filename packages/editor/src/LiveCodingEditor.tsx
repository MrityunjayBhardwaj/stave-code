import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import type * as Monaco from 'monaco-editor'
import { StrudelMonaco } from './monaco/StrudelMonaco'
import { Toolbar } from './toolbar/Toolbar'
import { applyTheme } from './theme/tokens'
import type { StrudelTheme } from './theme/tokens'
import { useHighlighting } from './monaco/useHighlighting'
import type { HapStream } from './engine/HapStream'
import { VizPanel } from './visualizers/VizPanel'
import { VizPicker } from './visualizers/VizPicker'
import type { VizDescriptor, PatternScheduler } from './visualizers/types'
import { DEFAULT_VIZ_DESCRIPTORS } from './visualizers/defaultDescriptors'
import { addInlineViewZones, type InlineZoneHandle } from './visualizers/viewZones'
import type { LiveCodingEngine } from './engine/LiveCodingEngine'

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

  // Advanced
  engineRef?: React.MutableRefObject<LiveCodingEngine | null>
}

const DEFAULT_CODE = `// Welcome to struCode`

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
  vizHeight = 200,
  showToolbar = true,
  showVizPicker,
  readOnly = false,
  activeHighlight: _activeHighlight = true,
  visualizer: _visualizer = 'off',
  vizDescriptors = DEFAULT_VIZ_DESCRIPTORS,
  toolbarExtra,
  onPostEvaluate,
  engineRef: engineRefProp,
}: LiveCodingEditorProps) {
  const isControlled = controlledCode !== undefined
  const [internalCode, setInternalCode] = useState(
    defaultCode ?? DEFAULT_CODE
  )
  const code = isControlled ? controlledCode : internalCode

  const [isPlaying, setIsPlaying] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [hapStream, setHapStream] = useState<HapStream | null>(null)
  const [activeViz, setActiveViz] = useState<string>(
    _visualizer !== 'off' ? _visualizer : (vizDescriptors[0]?.id ?? 'pianoroll')
  )
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const [patternScheduler, setPatternScheduler] = useState<PatternScheduler | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [vizCollapsed, setVizCollapsed] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const viewZoneCleanupRef = useRef<InlineZoneHandle | null>(null)

  // Expose engine to parent via engineRef prop
  useEffect(() => {
    if (engineRefProp) {
      engineRefProp.current = engine
    }
  })

  // Apply theme tokens to container
  const themeKey = typeof theme === 'string' ? theme : 'dark'
  useEffect(() => {
    if (!containerRef.current) return
    applyTheme(containerRef.current, theme)
  }, [theme])

  const { clearAll: clearHighlights } = useHighlighting(editorRef.current, hapStream)

  const handlePlay = useCallback(async () => {
    setErrorMsg(null)
    await engine.init()

    // Read streaming component for highlighting
    const streaming = engine.components.streaming
    if (streaming) {
      setHapStream(streaming.hapStream)
    }

    // Read audio component for viz panel
    const audio = engine.components.audio
    if (audio) {
      setAnalyser(audio.analyser)
    }

    // Route runtime audio errors into the UI
    engine.setRuntimeErrorHandler((err) => {
      setErrorMsg(err.message)
      onError?.(err)
    })

    clearHighlights()
    const { error } = await engine.evaluate(code)
    if (error) {
      const msg = error.message ?? String(error)
      setErrorMsg(msg)
      onError?.(error)
      return
    }

    // Fire post-evaluate callback (for StrudelEditor to extract BPM, soundNames, etc.)
    onPostEvaluate?.(engine)

    // Re-add inline view zones for patterns that called .viz() (they reset after evaluate).
    // TODO(08-02): Replace this bridge code — read afterLine directly from inlineViz component
    //              instead of converting back to the old addInlineViewZones arg format.
    const inlineViz = engine.components.inlineViz
    if (inlineViz && inlineViz.vizRequests.size > 0 && editorRef.current) {
      viewZoneCleanupRef.current?.cleanup()

      // Bridge: convert new Map<string, { vizId, afterLine }> to old Map<string, string>
      // and extract trackSchedulers from queryable component
      const legacyVizRequests = new Map<string, string>()
      for (const [key, val] of inlineViz.vizRequests) {
        legacyVizRequests.set(key, val.vizId)
      }

      const trackSchedulers = engine.components.queryable?.trackSchedulers ?? new Map()
      const currentHapStream = engine.components.streaming?.hapStream ?? null
      const currentAnalyser = engine.components.audio?.analyser ?? null

      viewZoneCleanupRef.current = addInlineViewZones(
        editorRef.current,
        currentHapStream,
        currentAnalyser,
        trackSchedulers,
        legacyVizRequests,
        vizDescriptors
      )
    }

    // Resume inline zones if they were paused by a previous stop (ZONE-04)
    viewZoneCleanupRef.current?.resume()

    const queryable = engine.components.queryable
    if (queryable) {
      setPatternScheduler(queryable.scheduler)
    }

    engine.play()
    setIsPlaying(true)
    onPlay?.()
  }, [code, engine, onPlay, onError, onPostEvaluate, clearHighlights, vizDescriptors])

  const handleStop = useCallback(() => {
    engine.stop()
    clearHighlights()
    viewZoneCleanupRef.current?.pause()
    setIsPlaying(false)
    onStop?.()
  }, [engine, onStop, clearHighlights])

  const handleCodeChange = useCallback(
    (val: string) => {
      if (!isControlled) setInternalCode(val)
      onChange?.(val)
    },
    [isControlled, onChange]
  )

  // Keyboard shortcuts wired through Monaco actions
  const handleMonacoMount = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
      editorRef.current = editor

      editor.addAction({
        id: 'strucode.play',
        label: 'Play',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => {
          if (isPlaying) handleStop()
          else handlePlay()
        },
      })

      editor.addAction({
        id: 'strucode.stop',
        label: 'Stop',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Period],
        run: () => handleStop(),
      })
    },
    [isPlaying, handlePlay, handleStop]
  )

  // Auto-refresh: re-evaluate on code change (debounced 500ms) while playing
  const handlePlayRef = useRef(handlePlay)
  handlePlayRef.current = handlePlay
  const codeRef = useRef(code)
  codeRef.current = code
  const prevCodeRef = useRef(code)
  useEffect(() => {
    if (!autoRefresh || !isPlaying) return
    if (codeRef.current === prevCodeRef.current) return
    const id = setTimeout(() => {
      prevCodeRef.current = codeRef.current
      handlePlayRef.current()
    }, 500)
    return () => clearTimeout(id)
  }, [autoRefresh, isPlaying, code])

  // Esc key exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isFullscreen])

  // Auto-play on mount (no dispose — parent owns engine lifecycle)
  useEffect(() => {
    if (autoPlay) handlePlay()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const monoTheme: 'dark' | 'light' =
    typeof theme === 'string' ? theme : 'dark'

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev)
  }, [])

  const showVizPanel = _visualizer !== 'off' && !isFullscreen

  // No-op export handler for generic toolbar (export is Strudel-specific)
  const noopExport = useCallback(() => {}, [])

  return (
    <div
      ref={containerRef}
      data-strucode-theme={themeKey}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--background)',
        border: isFullscreen ? 'none' : '1px solid var(--border)',
        borderRadius: isFullscreen ? 0 : 8,
        overflow: 'hidden',
        fontFamily: 'var(--font-mono)',
        ...(isFullscreen ? {
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
        } : {}),
      }}
    >
      {showToolbar && (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <Toolbar
              isPlaying={isPlaying}
              error={errorMsg}
              isExporting={false}
              onPlay={handlePlay}
              onStop={handleStop}
              onExport={noopExport}
            />
          </div>
          {toolbarExtra}
          <button
            onClick={() => setAutoRefresh(prev => !prev)}
            title={autoRefresh ? 'Live mode ON — click to disable' : 'Live mode: auto-update on code change while playing'}
            style={{
              background: autoRefresh ? 'rgba(196, 181, 253, 0.15)' : 'none',
              border: autoRefresh ? '1px solid rgba(196, 181, 253, 0.3)' : '1px solid transparent',
              borderRadius: 4,
              color: autoRefresh ? '#c4b5fd' : 'var(--text-secondary, rgba(255,255,255,0.5))',
              cursor: 'pointer',
              padding: '3px 7px',
              fontSize: 11,
              fontFamily: 'inherit',
              marginRight: 2,
            }}
          >
            {autoRefresh ? '\u27F3 live' : '\u27F3'}
          </button>
          <button
            onClick={handleToggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary, rgba(255,255,255,0.5))',
              cursor: 'pointer',
              padding: '4px 8px',
              fontSize: 16,
              lineHeight: 1,
              marginRight: 4,
            }}
          >
            {isFullscreen ? '\u22A0' : '\u26F6'}
          </button>
        </div>
      )}

      {!isFullscreen && (
        <VizPicker
          descriptors={vizDescriptors}
          activeId={activeViz}
          onIdChange={setActiveViz}
          showVizPicker={showVizPicker ?? true}
        />
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        <StrudelMonaco
          code={code}
          onChange={handleCodeChange}
          height={isFullscreen ? '100%' : height}
          theme={monoTheme}
          readOnly={readOnly}
          onMount={handleMonacoMount}
        />
      </div>

      {showVizPanel && (
        <>
          <button
            onClick={() => setVizCollapsed(prev => !prev)}
            style={{
              background: 'var(--surface, rgba(255,255,255,0.03))',
              border: 'none',
              borderTop: '1px solid var(--border, rgba(255,255,255,0.1))',
              color: 'var(--text-secondary, rgba(255,255,255,0.5))',
              cursor: 'pointer',
              padding: '4px 12px',
              fontSize: 11,
              fontFamily: 'inherit',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{
              display: 'inline-block',
              transform: vizCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease',
              fontSize: 10,
            }}>{'\u25BC'}</span>
            Visualizer — {vizDescriptors.find(d => d.id === activeViz)?.label ?? activeViz}
          </button>
          {!vizCollapsed && (
            <>
              <VizPicker
                descriptors={vizDescriptors}
                activeId={activeViz}
                onIdChange={setActiveViz}
                showVizPicker={showVizPicker ?? true}
              />
              <VizPanel
                key={activeViz}
                vizHeight={vizHeight}
                hapStream={hapStream}
                analyser={analyser}
                scheduler={patternScheduler}
                source={vizDescriptors.find(d => d.id === activeViz)?.factory ?? vizDescriptors[0].factory}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
