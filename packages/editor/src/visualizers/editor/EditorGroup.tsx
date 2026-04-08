import React, { useCallback, useEffect, useRef } from 'react'
import type * as Monaco from 'monaco-editor'
import MonacoEditorRaw from '@monaco-editor/react'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MonacoEditor = MonacoEditorRaw as any
import type { VizTab, PreviewMode, DragPayload } from './vizEditorTypes'

interface EditorGroupProps {
  groupId: string
  tabs: VizTab[]
  activeTabId: string | null
  previewMode: PreviewMode
  previewNode: React.ReactNode | null
  height: number | string

  onTabClick: (groupId: string, tabId: string) => void
  onTabClose: (groupId: string, tabId: string) => void
  onCodeChange: (groupId: string, tabId: string, code: string) => void
  onMonacoMount: (groupId: string, editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => void
  onSplit: (groupId: string, direction: 'horizontal' | 'vertical') => void
  onCloseGroup: (groupId: string) => void
  onPreviewModeChange: (groupId: string, mode: PreviewMode) => void

  // Tab DnD
  onTabDragStart: (groupId: string, tabId: string) => void
  onTabDrop: (targetGroupId: string) => void
  canClose: boolean
}

/**
 * A single editor group: tab bar + Monaco editor + optional preview overlay/panel.
 * Supports HTML5 drag-and-drop for tabs.
 */
export function EditorGroup({
  groupId,
  tabs,
  activeTabId,
  previewMode,
  previewNode,
  height,
  onTabClick,
  onTabClose,
  onCodeChange,
  onMonacoMount,
  onSplit,
  onCloseGroup,
  onPreviewModeChange,
  onTabDragStart,
  onTabDrop,
  canClose,
}: EditorGroupProps) {
  const activeTab = tabs.find(t => t.id === activeTabId)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragOver, setDragOver] = React.useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/viz-tab')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDragOver(true)
    }
  }, [])

  const handleDragLeave = useCallback(() => setDragOver(false), [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    onTabDrop(groupId)
  }, [groupId, onTabDrop])

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'var(--background)',
        outline: dragOver ? '2px solid var(--accent, #75baff)' : 'none',
        outlineOffset: -2,
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          height: 30,
          flexShrink: 0,
          overflow: 'auto',
        }}
      >
        {tabs.map(tab => (
          <div
            key={tab.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/viz-tab', JSON.stringify({
                sourceGroupId: groupId,
                tabId: tab.id,
              } satisfies DragPayload))
              onTabDragStart(groupId, tab.id)
            }}
            onClick={() => onTabClick(groupId, tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              padding: '0 8px',
              height: '100%',
              cursor: 'grab',
              background: tab.id === activeTabId ? 'var(--background)' : 'transparent',
              borderRight: '1px solid var(--border)',
              color: tab.id === activeTabId ? 'var(--foreground)' : 'var(--foreground-muted)',
              fontSize: 11,
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            <span style={{ fontSize: 9, opacity: 0.5 }}>
              {tab.preset.renderer === 'hydra' ? '\u25C8' : '\u25CB'}
            </span>
            <span>{tab.label}</span>
            {tab.dirty && <span style={{ color: '#FFCA28', fontSize: 7 }}>{'\u25CF'}</span>}
            <button
              onClick={(e) => { e.stopPropagation(); onTabClose(groupId, tab.id) }}
              style={closeBtnStyle}
            >
              {'\u00D7'}
            </button>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        {/* Group actions */}
        <div style={{ display: 'flex', gap: 1, padding: '0 4px', flexShrink: 0 }}>
          <button onClick={() => onSplit(groupId, 'horizontal')} title="Split right" style={actionBtnStyle}>
            {'\u2502'}
          </button>
          <button onClick={() => onSplit(groupId, 'vertical')} title="Split down" style={actionBtnStyle}>
            {'\u2500'}
          </button>
          {/* Preview mode buttons */}
          {(['panel', 'inline', 'bg', 'popout'] as const).map(m => (
            <button
              key={m}
              onClick={() => onPreviewModeChange(groupId, m === 'bg' ? 'background' : m)}
              title={`Preview: ${m}`}
              style={{
                ...actionBtnStyle,
                background: previewMode === (m === 'bg' ? 'background' : m)
                  ? 'rgba(117,186,255,0.15)' : 'transparent',
                color: previewMode === (m === 'bg' ? 'background' : m)
                  ? '#75baff' : 'var(--foreground-muted)',
              }}
            >
              {m === 'panel' ? '\u25A3' : m === 'inline' ? '\u2582' : m === 'bg' ? '\u25A2' : '\u29C9'}
            </button>
          ))}
          {canClose && (
            <button onClick={() => onCloseGroup(groupId)} title="Close group" style={actionBtnStyle}>
              {'\u00D7'}
            </button>
          )}
        </div>
      </div>

      {/* Content area: editor + optional background/panel preview */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {/* Background preview mode — canvas behind editor */}
        {previewMode === 'background' && previewNode && (
          <div style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            opacity: 0.7,
          }}>
            {previewNode}
          </div>
        )}

        {/* Monaco editor */}
        <div style={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          ...(previewMode === 'background' ? {
            background: 'transparent',
          } : {}),
        }}>
          {activeTab ? (
            <MonacoEditor
              height="100%"
              language={activeTab.language}
              value={activeTab.preset.code}
              onChange={(val: string | undefined) => {
                if (val !== undefined && activeTab) {
                  onCodeChange(groupId, activeTab.id, val)
                }
              }}
              onMount={(editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
                onMonacoMount(groupId, editor, monaco)
              }}
              options={{
                fontSize: 13,
                lineHeight: 22,
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                fontLigatures: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
                padding: { top: 8, bottom: 8 },
                scrollbar: { vertical: 'auto', horizontal: 'auto', useShadows: false },
                lineNumbersMinChars: 3,
                glyphMargin: false,
                folding: false,
                renderLineHighlight: 'line',
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
              }}
            />
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--foreground-muted)',
              fontSize: 12,
            }}>
              Drop a tab here or create a new viz
            </div>
          )}
        </div>

        {/* Panel preview mode — side panel within this group */}
        {previewMode === 'panel' && previewNode && (
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '40%',
            height: '100%',
            borderLeft: '1px solid var(--border)',
            zIndex: 2,
            background: 'var(--background)',
          }}>
            {previewNode}
          </div>
        )}
      </div>

      {/* Inline preview mode — below editor */}
      {previewMode === 'inline' && previewNode && (
        <div style={{
          borderTop: '1px solid var(--border)',
          height: 150,
          flexShrink: 0,
        }}>
          {previewNode}
        </div>
      )}
    </div>
  )
}

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--foreground-muted)',
  cursor: 'pointer',
  fontSize: 11,
  padding: '0 2px',
  lineHeight: 1,
}

const actionBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--foreground-muted)',
  cursor: 'pointer',
  fontSize: 11,
  padding: '2px 4px',
  lineHeight: 1,
  borderRadius: 2,
}
