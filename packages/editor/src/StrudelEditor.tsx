import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { StrudelEngine } from './engine/StrudelEngine'
import type { StrudelTheme } from './theme/tokens'
import type { VizDescriptor } from './visualizers/types'
import { DEFAULT_VIZ_DESCRIPTORS } from './visualizers/defaultDescriptors'
import { LiveCodingEditor } from './LiveCodingEditor'
import type { LiveCodingEngine } from './engine/LiveCodingEngine'

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
  activeHighlight?: boolean
  theme?: 'dark' | 'light' | StrudelTheme
  showVizPicker?: boolean
  vizDescriptors?: VizDescriptor[]

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

const DEFAULT_CODE = `// Welcome to Stave
setcps(120/240)
$: note("c3 e3 g3 b3").s("sine").gain(0.7)`

const DEFAULT_EXPORT_DURATION = 8 // seconds

export function StrudelEditor({
  code: controlledCode,
  defaultCode = DEFAULT_CODE,
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
  activeHighlight = true,
  visualizer = 'off',
  vizDescriptors = DEFAULT_VIZ_DESCRIPTORS,
  onExport,
  engineRef: engineRefProp,
}: StrudelEditorProps) {
  const engineRef = useRef<StrudelEngine | null>(null)
  const [bpm, setBpm] = useState<number | undefined>(120)
  const [soundNames, setSoundNames] = useState<string[]>([])
  const [isExporting, setIsExporting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Lazily create engine (one per component instance)
  function getEngine(): StrudelEngine {
    if (!engineRef.current) {
      engineRef.current = new StrudelEngine()
      if (engineRefProp) engineRefProp.current = engineRef.current
    }
    return engineRef.current
  }

  // Expose engine to parent via engineRef prop
  useEffect(() => {
    if (engineRefProp) {
      engineRefProp.current = engineRef.current
    }
  })

  // Dispose engine on unmount
  useEffect(() => {
    return () => {
      engineRef.current?.dispose()
    }
  }, [])

  // Get current code for export (track via ref to avoid stale closures)
  const codeRef = useRef(controlledCode ?? defaultCode)
  codeRef.current = controlledCode ?? defaultCode

  // BPM extraction + soundNames collection after successful evaluate
  const handlePostEvaluate = useCallback((engine: LiveCodingEngine) => {
    // Extract BPM from setcps line if present
    const code = codeRef.current
    const cpsMatch = code.match(/setcps\s*\(\s*([\d.]+)\s*\/\s*([\d.]+)\s*\)/)
    if (cpsMatch) {
      const numerator = parseFloat(cpsMatch[1])
      const denominator = parseFloat(cpsMatch[2])
      if (denominator > 0) setBpm(Math.round((numerator / denominator) * 60))
    }

    // Collect sound names once for Monaco autocompletion
    const strudelEngine = engine as StrudelEngine
    if (soundNames.length === 0) {
      setSoundNames(strudelEngine.getSoundNames())
    }
  }, [soundNames])

  const handleExport = useCallback(async () => {
    if (isExporting) return
    setIsExporting(true)
    setErrorMsg(null)

    try {
      const engine = getEngine()
      await engine.init()
      const blob = await engine.renderOffline(codeRef.current, DEFAULT_EXPORT_DURATION)

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExporting, onExport, onError])

  // Toolbar extra: BPM display + export button (Strudel-specific)
  const toolbarExtra = (
    <>
      {bpm !== undefined && (
        <span
          style={{
            color: 'var(--text-secondary, rgba(255,255,255,0.5))',
            fontSize: 11,
            fontFamily: 'inherit',
            marginRight: 6,
          }}
        >
          {bpm} BPM
        </span>
      )}
      <button
        onClick={handleExport}
        disabled={isExporting}
        title="Export audio"
        style={{
          background: 'none',
          border: '1px solid var(--border, rgba(255,255,255,0.1))',
          borderRadius: 4,
          color: isExporting
            ? 'var(--text-secondary, rgba(255,255,255,0.3))'
            : 'var(--text-secondary, rgba(255,255,255,0.5))',
          cursor: isExporting ? 'wait' : 'pointer',
          padding: '3px 7px',
          fontSize: 11,
          fontFamily: 'inherit',
          marginRight: 2,
        }}
      >
        {isExporting ? 'Exporting...' : 'Export'}
      </button>
    </>
  )

  // Eagerly create engine so it can be passed as prop
  const engine = getEngine()

  return (
    <LiveCodingEditor
      engine={engine}
      code={controlledCode}
      defaultCode={defaultCode}
      onChange={onChange}
      autoPlay={autoPlay}
      onPlay={onPlay}
      onStop={onStop}
      onError={onError}
      theme={theme}
      height={height}
      vizHeight={vizHeight}
      showToolbar={showToolbar}
      showVizPicker={showVizPicker}
      readOnly={readOnly}
      activeHighlight={activeHighlight}
      visualizer={visualizer}
      vizDescriptors={vizDescriptors}
      toolbarExtra={toolbarExtra}
      onPostEvaluate={handlePostEvaluate}
      soundNames={soundNames}
    />
  )
}
