import type * as Monaco from 'monaco-editor'
import { STRUDEL_DOCS } from './strudelDocs'

// ---------------------------------------------------------------------------
// Note names: c0–b7, including sharps and flats for accidentals
// ---------------------------------------------------------------------------

const NOTE_ROOTS = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b'] as const
const SHARP_ROOTS = ['c#', 'd#', 'f#', 'g#', 'a#'] as const

export function generateNoteNames(): string[] {
  const names: string[] = []
  for (let oct = 0; oct <= 7; oct++) {
    for (const root of NOTE_ROOTS) names.push(`${root}${oct}`)
    for (const root of SHARP_ROOTS) names.push(`${root}${oct}`)
  }
  return names
}

export const NOTE_NAMES: string[] = generateNoteNames()

// ---------------------------------------------------------------------------
// Dot completions — triggered by '.' after a pattern expression
// ---------------------------------------------------------------------------

export function registerStrudelDotCompletions(monaco: typeof Monaco): Monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider('strudel', {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
      const textBefore = model.getLineContent(position.lineNumber).substring(0, position.column - 1)

      // Only trigger after a dot that follows ) " ' ` or an identifier character
      if (!/[)\]"'`\w]\.$/.test(textBefore)) {
        return { suggestions: [] }
      }

      const word = model.getWordUntilPosition(position)
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      return {
        suggestions: Object.entries(STRUDEL_DOCS).map(([name, doc]) => ({
          label: name,
          kind: monaco.languages.CompletionItemKind.Method,
          insertText: name,
          detail: doc.signature,
          documentation: { value: `${doc.description}\n\n**Example:** \`${doc.example}\`` },
          range,
        })),
      }
    },
  })
}

// ---------------------------------------------------------------------------
// note("...") completions — triggered inside a note() string argument
// ---------------------------------------------------------------------------

export function registerStrudelNoteCompletions(monaco: typeof Monaco): Monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider('strudel', {
    triggerCharacters: ['"', "'", ' '],
    provideCompletionItems(model, position) {
      const lineContent = model.getLineContent(position.lineNumber)
      const textBefore = lineContent.substring(0, position.column - 1)

      // Match: note(" or .note(" with optional already-typed prefix
      if (!/(?:^|[\s,(.])note\(["']([^"']*)$/.test(textBefore)) {
        return { suggestions: [] }
      }

      const word = model.getWordUntilPosition(position)
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      return {
        suggestions: NOTE_NAMES.map((name) => ({
          label: name,
          kind: monaco.languages.CompletionItemKind.Value,
          insertText: name,
          range,
        })),
      }
    },
  })
}
