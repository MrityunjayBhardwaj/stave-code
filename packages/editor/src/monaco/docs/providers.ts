/**
 * Factories that turn a `DocsIndex` into Monaco hover and completion
 * providers. Every runtime uses the same factories — only the doc index
 * differs, so adding a new runtime is one import + one register call.
 */

import type * as Monaco from 'monaco-editor'
import type { DocKind, DocsIndex, RuntimeDoc } from './types'
import { resolveDoc } from './types'

// ---------------------------------------------------------------------------
// Hover
// ---------------------------------------------------------------------------

/**
 * Register a hover provider that renders the doc entry for the word under
 * the cursor. Word is looked up through `resolveDoc`, so aliases work.
 */
export function createHoverProvider(
  monaco: typeof Monaco,
  index: DocsIndex,
): Monaco.IDisposable {
  return monaco.languages.registerHoverProvider(index.runtime, {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position)
      if (!word) return null
      const hit = resolveDoc(index, word.word)
      if (!hit) return null
      return {
        range: new monaco.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn,
        ),
        contents: renderHoverContents(hit.name, hit.doc),
      }
    },
  })
}

function renderHoverContents(
  name: string,
  doc: RuntimeDoc,
): Monaco.IMarkdownString[] {
  const out: Monaco.IMarkdownString[] = []
  out.push({ value: '```typescript\n' + doc.signature + '\n```' })
  if (doc.description) out.push({ value: doc.description })
  if (doc.example) out.push({ value: '**Example:** `' + doc.example + '`' })
  if (doc.returns) out.push({ value: '**Returns:** ' + doc.returns })
  if (doc.sourceUrl) {
    out.push({
      value: '[Reference →](' + doc.sourceUrl + ')',
      isTrusted: true,
    })
  }
  void name
  return out
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

const KIND_TO_MONACO: Record<DocKind, keyof typeof MonacoKindNames> = {
  function: 'Function',
  method: 'Method',
  variable: 'Variable',
  constant: 'Constant',
  keyword: 'Keyword',
  synth: 'Module',
  sample: 'Value',
  fx: 'Interface',
}

const MonacoKindNames = {
  Function: 1,
  Method: 1,
  Variable: 1,
  Constant: 1,
  Keyword: 1,
  Module: 1,
  Value: 1,
  Interface: 1,
} as const

function kindOf(
  monaco: typeof Monaco,
  kind: DocKind | undefined,
): Monaco.languages.CompletionItemKind {
  const mapped = kind ? KIND_TO_MONACO[kind] : 'Function'
  return monaco.languages.CompletionItemKind[mapped]
}

/**
 * Dot-chain completion provider. Fires when the user types a `.` after a
 * `)`, `]`, `"`, `'`, `` ` ``, or word character — the shape of a method
 * chain. Suggests every entry in `index.docs` (hover decides relevance).
 */
export function createDotCompletionProvider(
  monaco: typeof Monaco,
  index: DocsIndex,
): Monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider(index.runtime, {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
      const lineBefore = model
        .getLineContent(position.lineNumber)
        .substring(0, position.column - 1)
      if (!/[)\]"'`\w]\.[\w]*$/.test(lineBefore)) {
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
        suggestions: Object.entries(index.docs).map(([name, doc]) =>
          toSuggestion(monaco, name, doc, range),
        ),
      }
    },
  })
}

/**
 * Identifier completion provider. Fires on any identifier character, used
 * for top-level APIs (p5 `ellipse`, Sonic Pi `play`). Filters by prefix so
 * the list narrows as the user types.
 */
export function createIdentifierCompletionProvider(
  monaco: typeof Monaco,
  index: DocsIndex,
): Monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider(index.runtime, {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const prefix = word.word
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }
      const entries = Object.entries(index.docs).filter(([name]) =>
        prefix.length === 0 ? true : name.toLowerCase().startsWith(prefix.toLowerCase()),
      )
      return {
        suggestions: entries.map(([name, doc]) =>
          toSuggestion(monaco, name, doc, range),
        ),
      }
    },
  })
}

function toSuggestion(
  monaco: typeof Monaco,
  name: string,
  doc: RuntimeDoc,
  range: Monaco.IRange,
): Monaco.languages.CompletionItem {
  const documentation: Monaco.IMarkdownString = {
    value:
      (doc.description ?? '') +
      (doc.example ? '\n\n**Example:** `' + doc.example + '`' : '') +
      (doc.sourceUrl ? '\n\n[Reference →](' + doc.sourceUrl + ')' : ''),
    isTrusted: true,
  }
  return {
    label: name,
    kind: kindOf(monaco, doc.kind),
    insertText: name,
    detail: doc.signature,
    documentation,
    range,
  }
}

// ---------------------------------------------------------------------------
// Convenience — register hover + dot + identifier for a runtime at once.
// ---------------------------------------------------------------------------

export interface ProvidersToggle {
  hover?: boolean
  dotCompletion?: boolean
  identifierCompletion?: boolean
}

export function registerRuntimeProviders(
  monaco: typeof Monaco,
  index: DocsIndex,
  toggle: ProvidersToggle = {
    hover: true,
    dotCompletion: true,
    identifierCompletion: true,
  },
): Monaco.IDisposable[] {
  const disposables: Monaco.IDisposable[] = []
  if (toggle.hover) disposables.push(createHoverProvider(monaco, index))
  if (toggle.dotCompletion)
    disposables.push(createDotCompletionProvider(monaco, index))
  if (toggle.identifierCompletion)
    disposables.push(createIdentifierCompletionProvider(monaco, index))
  return disposables
}
