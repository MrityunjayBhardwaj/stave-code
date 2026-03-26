import React, { useEffect, useRef } from 'react'
import MonacoEditorRaw, { type OnMount } from '@monaco-editor/react'
// @monaco-editor/react types are against React 18; cast to any to satisfy React 19 JSX
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MonacoEditor = MonacoEditorRaw as any
import type * as Monaco from 'monaco-editor'
import { defineStrudelMonacoTheme } from '../theme/monacoTheme'
import { registerStrudelLanguage, registerSonicPiLanguage } from './language'

const DEFAULT_CODE = `// Welcome to Stave
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
  soundNames?: string[]
  /** Monaco language ID. Defaults to 'strudel'. Use 'sonicpi' for Sonic Pi code. */
  language?: string
}

export function StrudelMonaco({
  code,
  onChange,
  height = 320,
  theme = 'dark',
  readOnly = false,
  onMount,
  soundNames = [],
  language = 'strudel',
}: StrudelMonacoProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof Monaco | null>(null)

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    defineStrudelMonacoTheme(monaco)
    registerStrudelLanguage(monaco)
    registerSonicPiLanguage(monaco)

    monaco.editor.setTheme(
      theme === 'dark' ? 'stave-dark' : 'stave-light'
    )

    // Inject active highlight CSS once
    injectHighlightStyles()

    // Keyboard shortcuts
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => {
        editor.trigger('keyboard', 'stave.play', null)
      }
    )
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Period,
      () => {
        editor.trigger('keyboard', 'stave.stop', null)
      }
    )

    onMount?.(editor, monaco)
  }

  // Register s("...") completion provider when sound names become available after engine init.
  // Disposable is recreated when soundNames changes so the list stays current.
  useEffect(() => {
    const monaco = monacoRef.current
    if (!monaco || soundNames.length === 0) return

    const disposable = monaco.languages.registerCompletionItemProvider('strudel', {
      triggerCharacters: ['"', "'", ' '],
      provideCompletionItems(model, position) {
        const lineContent = model.getLineContent(position.lineNumber)
        const textBefore = lineContent.substring(0, position.column - 1)

        // Match: s(" or .s(" (possibly with already-typed prefix inside the string)
        // Covers: s("bd ...cursor"), stack(s("...cursor")), .s("...cursor"), sound("...cursor")
        if (!/(?:^|[\s,(])(?:s|sound)\(["']([^"']*)$/.test(textBefore)) {
          return { suggestions: [] }
        }

        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }

        return {
          suggestions: soundNames.map((name) => ({
            label: name,
            kind: monaco.languages.CompletionItemKind.Value,
            insertText: name,
            range,
          })),
        }
      },
    })

    return () => disposable.dispose()
  }, [soundNames])

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
      defaultLanguage={language}
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
