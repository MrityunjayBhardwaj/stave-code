import React, { useEffect, useRef } from 'react'
import MonacoEditorRaw, { type OnMount } from '@monaco-editor/react'
// @monaco-editor/react types are against React 18; cast to any to satisfy React 19 JSX
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MonacoEditor = MonacoEditorRaw as any
import type * as Monaco from 'monaco-editor'
import { defineStrudelMonacoTheme } from '../theme/monacoTheme'
import { registerStrudelLanguage } from './language'

const DEFAULT_CODE = `// Welcome to struCode
setcps(120/240)
$: note("c3 e3 g3 b3").s("sine").gain(0.7)`

interface StrudelMonacoProps {
  code: string
  onChange?: (code: string) => void
  height?: number | string
  theme?: 'dark' | 'light'
  readOnly?: boolean
  onMount?: (
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof Monaco
  ) => void
}

export function StrudelMonaco({
  code,
  onChange,
  height = 320,
  theme = 'dark',
  readOnly = false,
  onMount,
}: StrudelMonacoProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    defineStrudelMonacoTheme(monaco)
    registerStrudelLanguage(monaco)

    monaco.editor.setTheme(
      theme === 'dark' ? 'strucode-dark' : 'strucode-light'
    )

    // Inject active highlight CSS once
    injectHighlightStyles()

    // Keyboard shortcuts
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => {
        editor.trigger('keyboard', 'strucode.play', null)
      }
    )
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Period,
      () => {
        editor.trigger('keyboard', 'strucode.stop', null)
      }
    )

    onMount?.(editor, monaco)
  }

  // Sync external code changes without resetting cursor position
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const model = editor.getModel()
    if (!model) return
    if (model.getValue() !== code) {
      const pos = editor.getPosition()
      model.setValue(code)
      if (pos) editor.setPosition(pos)
    }
  }, [code])

  return (
    <MonacoEditor
      height={height}
      defaultLanguage="strudel"
      value={code || DEFAULT_CODE}
      onChange={(val: string | undefined) => onChange?.(val ?? '')}
      onMount={handleMount}
      options={{
        fontSize: 13,
        lineHeight: 22,
        fontFamily:
          '"JetBrains Mono", "Fira Code", "Cascadia Code", "Menlo", monospace',
        fontLigatures: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        readOnly,
        automaticLayout: true,
        padding: { top: 16, bottom: 16 },
        scrollbar: {
          vertical: 'auto',
          horizontal: 'auto',
          useShadows: false,
        },
        lineNumbersMinChars: 3,
        glyphMargin: false,
        folding: false,
        renderLineHighlight: 'line',
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
      }}
    />
  )
}

let stylesInjected = false
function injectHighlightStyles() {
  if (stylesInjected || typeof document === 'undefined') return
  stylesInjected = true

  const style = document.createElement('style')
  style.textContent = `
    .strudel-active-hap {
      background: rgba(var(--accent-rgb, 139, 92, 246), 0.3);
      border-radius: 2px;
      outline: 1px solid rgba(var(--accent-rgb, 139, 92, 246), 0.5);
      box-shadow: 0 0 8px rgba(var(--accent-rgb, 139, 92, 246), 0.3);
    }
  `
  document.head.appendChild(style)
}
