import type * as Monaco from 'monaco-editor'

export function defineStrudelMonacoTheme(monaco: typeof Monaco): void {
  monaco.editor.defineTheme('stave-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'strudel.pattern-start', foreground: '8b5cf6', fontStyle: 'bold' },
      { token: 'strudel.tempo',         foreground: 'a78bfa' },
      { token: 'strudel.function',      foreground: '93c5fd' },
      { token: 'strudel.note',          foreground: '86efac' },
      { token: 'strudel.mini.note',     foreground: '86efac' },
      { token: 'strudel.mini.operator', foreground: 'f472b6' },
      { token: 'strudel.mini.number',   foreground: 'fb923c' },
      { token: 'string',                foreground: 'fcd34d' },
      { token: 'number',                foreground: 'fb923c' },
      { token: 'comment',               foreground: '6b7280', fontStyle: 'italic' },
      { token: 'keyword',               foreground: 'c4b5fd' },
      // Sonic Pi tokens
      { token: 'sonicpi.function',      foreground: '93c5fd', fontStyle: 'bold' },
      { token: 'sonicpi.music',         foreground: 'a78bfa' },
      { token: 'sonicpi.symbol',        foreground: 'f472b6' },
      { token: 'sonicpi.note',          foreground: '86efac' },
      { token: 'sonicpi.kwarg',         foreground: '6ee7b7' },
    ],
    colors: {
      'editor.background':           '#090912',
      'editor.foreground':           '#c4b5fd',
      'editorLineNumber.foreground': '#3d3d5c',
      'editorCursor.foreground':     '#8b5cf6',
      'editor.selectionBackground':  '#8b5cf640',
      'editor.lineHighlightBackground': '#8b5cf60d',
      'editorIndentGuide.background':   '#ffffff10',
      'editorWidget.background':     '#0f0f1a',
      'editorSuggestWidget.background': '#0f0f1a',
      'editorSuggestWidget.border':  '#8b5cf640',
    },
  })

  monaco.editor.defineTheme('stave-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'strudel.pattern-start', foreground: '7c3aed', fontStyle: 'bold' },
      { token: 'strudel.tempo',         foreground: '6d28d9' },
      { token: 'strudel.function',      foreground: '1d4ed8' },
      { token: 'strudel.note',          foreground: '15803d' },
      { token: 'strudel.mini.note',     foreground: '15803d' },
      { token: 'strudel.mini.operator', foreground: 'be185d' },
      { token: 'strudel.mini.number',   foreground: 'c2410c' },
      { token: 'string',                foreground: '92400e' },
      { token: 'number',                foreground: 'c2410c' },
      { token: 'comment',               foreground: '9ca3af', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background':              '#f0eeff',
      'editor.foreground':              '#4c1d95',
      'editorLineNumber.foreground':    '#a5b4fc',
      'editorCursor.foreground':        '#7c3aed',
      'editor.selectionBackground':     '#7c3aed30',
      'editor.lineHighlightBackground': '#7c3aed08',
    },
  })
}
