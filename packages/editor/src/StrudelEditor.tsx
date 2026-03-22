import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type * as Monaco from 'monaco-editor'
import { StrudelMonaco } from './monaco/StrudelMonaco'
import { Toolbar } from './toolbar/Toolbar'
import { StrudelEngine } from './engine/StrudelEngine'
import { applyTheme } from './theme/tokens'
import type { StrudelTheme } from './theme/tokens'
import { useHighlighting } from './monaco/useHighlighting'
import type { HapStream } from './engine/HapStream'
import { VizPanel } from './visualizers/VizPanel'
import { VizPicker } from './visualizers/VizPicker'
import type { VizDescriptor, VizRendererSource, PatternScheduler } from './visualizers/types'
import { DEFAULT_VIZ_DESCRIPTORS } from './visualizers/defaultDescriptors'
import { addInlineViewZones } from './visualizers/viewZones'

export type { StrudelTheme }

export interface StrudelEditorProps {
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
  inlinePianoroll?: boolean
  activeHighlight?: boolean
  theme?: 'dark' | 'light' | StrudelTheme
  showVizPicker?: boolean
  vizDescriptors?: VizDescriptor[]
  vizRenderer?: VizRendererSource

  // Layout
  height?: number | string
  vizHeight?: number | string
  showToolbar?: boolean
  readOnly?: boolean

  // Export
  onExport?: (blob: Blob, stemName?: string) => Promise<string>

  // Advanced
  engineRef?: React.MutableRefObject<StrudelEngine | null>
}

const DEFAULT_CODE = `// Welcome to struCode
setcps(120/240)
$: note("c3 e3 g3 b3").s("sine").gain(0.7)`

const DEFAULT_EXPORT_DURATION = 8 // seconds

export function StrudelEditor({
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
  inlinePianoroll: _inlinePianoroll = false,
  vizDescriptors = DEFAULT_VIZ_DESCRIPTORS,
  vizRenderer,
  onExport,
  engineRef: engineRefProp,
}: StrudelEditorProps) {
  const isControlled = controlledCode !== undefined
  const [internalCode, setInternalCode] = useState(
    defaultCode ?? DEFAULT_CODE
  )
  const code = isControlled ? controlledCode : internalCode

  const [isPlaying, setIsPlaying] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [bpm, setBpm] = useState<number | undefined>(120)
  const [hapStream, setHapStream] = useState<HapStream | null>(null)
  const [soundNames, setSoundNames] = useState<string[]>([])
  const [activeViz, setActiveViz] = useState<string>(
    _visualizer !== 'off' ? _visualizer : (vizDescriptors[0]?.id ?? 'pianoroll')
  )
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const [patternScheduler, setPatternScheduler] = useState<PatternScheduler | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<StrudelEngine | null>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const viewZoneCleanupRef = useRef<(() => void) | null>(null)

  // Expose engine to parent via engineRef prop
  useEffect(() => {
    if (engineRefProp) {
      engineRefProp.current = engineRef.current
    }
  })

  // Apply theme tokens to container
  const themeKey = typeof theme === 'string' ? theme : 'dark'
  useEffect(() => {
    if (!containerRef.current) return
    applyTheme(containerRef.current, theme)
  }, [theme])

  // Lazily create engine (one per component instance)
  function getEngine(): StrudelEngine {
    if (!engineRef.current) {
      engineRef.current = new StrudelEngine()
      if (engineRefProp) engineRefProp.current = engineRef.current
    }
    return engineRef.current
  }

  const currentSource: VizRendererSource = useMemo(
    () => vizRenderer ?? (vizDescriptors.find(d => d.id === activeViz)?.factory ?? vizDescriptors[0].factory),
    [activeViz, vizDescriptors, vizRenderer]
  )

  const { clearAll: clearHighlights } = useHighlighting(editorRef.current, hapStream)

  const handlePlay = useCallback(async () => {
    setErrorMsg(null)
    const engine = getEngine()
    await engine.init()
    setHapStream(engine.getHapStream())

    // setAnalyser() triggers a re-render. VizPanel will receive the new analyser
    // on the next render cycle. On the first frame after play, VizPanel's analyser
    // prop may still be null — PianorollSketch handles this by falling back to
    // performance.now()/1000 for timing (see analyserRef.current?.context.currentTime
    // ?? performance.now() / 1000 in PianorollSketch.ts). This is intentional: the
    // fallback provides smooth animation until the real AudioContext time is available.
    setAnalyser(engine.getAnalyser())

    // Route runtime audio errors (scheduler-time, e.g. "sound X not found") into the UI.
    engine.setRuntimeErrorHandler((err) => {
      setErrorMsg(err.message)
      onError?.(err)
    })

    // Collect sound names once for Monaco autocompletion (no-op on subsequent plays).
    if (soundNames.length === 0) {
      setSoundNames(engine.getSoundNames())
    }

    clearHighlights()
    const { error } = await engine.evaluate(code)
    if (error) {
      const msg = error.message ?? String(error)
      setErrorMsg(msg)
      onError?.(error)
      return
    }

    // Re-add inline pianoroll view zones (they reset after evaluate).
    // addInlineViewZones receives engine.getAnalyser() directly (synchronous),
    // bypassing the React state timing — view zones get the analyser immediately.
    if (_inlinePianoroll && editorRef.current) {
      viewZoneCleanupRef.current?.()
      viewZoneCleanupRef.current = addInlineViewZones(
        editorRef.current,
        engine.getHapStream(),
        engine.getAnalyser()
      )
    }

    // Extract BPM from setcps line if present
    const cpsMatch = code.match(/setcps\s*\(\s*([\d.]+)\s*\/\s*([\d.]+)\s*\)/)
    if (cpsMatch) {
      const numerator = parseFloat(cpsMatch[1])
      const denominator = parseFloat(cpsMatch[2])
      if (denominator > 0) setBpm(Math.round((numerator / denominator) * 60))
    }

    setPatternScheduler(engine.getPatternScheduler())
    engine.play()
    setIsPlaying(true)
    onPlay?.()
  }, [code, onPlay, onError, clearHighlights, soundNames, _inlinePianoroll])

  const handleStop = useCallback(() => {
    engineRef.current?.stop()
    clearHighlights()
    viewZoneCleanupRef.current?.()
    viewZoneCleanupRef.current = null
    setIsPlaying(false)
    onStop?.()
  }, [onStop, clearHighlights])

  const handleExport = useCallback(async () => {
    if (isExporting) return
    setIsExporting(true)
    setErrorMsg(null)

    try {
      const engine = getEngine()
      await engine.init()
      const blob = await engine.renderOffline(code, DEFAULT_EXPORT_DURATION)

      if (onExport) {
        await onExport(blob)
      } else {
        // Default: trigger browser download
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'pattern.wav'
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      const e = err as Error
      setErrorMsg(e.message ?? String(e))
      onError?.(e)
    } finally {
      setIsExporting(false)
    }
  }, [code, isExporting, onExport, onError])

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
        label: 'Strudel: Play',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => {
          if (isPlaying) handleStop()
          else handlePlay()
        },
      })

      editor.addAction({
        id: 'strucode.stop',
        label: 'Strudel: Stop',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Period],
        run: () => handleStop(),
      })
    },
    [isPlaying, handlePlay, handleStop]
  )

  // Auto-play on mount
  useEffect(() => {
    if (autoPlay) handlePlay()
    return () => {
      engineRef.current?.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const monoTheme: 'dark' | 'light' =
    typeof theme === 'string' ? theme : 'dark'

  return (
    <div
      ref={containerRef}
      data-strucode-theme={themeKey}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--background)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {showToolbar && (
        <Toolbar
          isPlaying={isPlaying}
          bpm={bpm}
          error={errorMsg}
          isExporting={isExporting}
          onPlay={handlePlay}
          onStop={handleStop}
          onExport={handleExport}
        />
      )}

      <VizPicker
        descriptors={vizDescriptors}
        activeId={activeViz}
        onIdChange={setActiveViz}
        showVizPicker={showVizPicker ?? true}
      />

      <div style={{ flex: 1, minHeight: 0 }}>
        <StrudelMonaco
          code={code}
          onChange={handleCodeChange}
          height={height}
          theme={monoTheme}
          readOnly={readOnly}
          onMount={handleMonacoMount}
          soundNames={soundNames}
        />
      </div>

      {_visualizer !== 'off' && (
        <VizPanel
          key={activeViz}
          vizHeight={vizHeight}
          hapStream={hapStream}
          analyser={analyser}
          scheduler={patternScheduler}
          source={currentSource}
        />
      )}
    </div>
  )
}
