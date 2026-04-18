import { describe, it, expect, vi } from 'vitest'
import type * as Monaco from 'monaco-editor'
import type { DocsIndex } from '../types'
import { resolveDoc, validateDocsIndex } from '../types'
import {
  createHoverProvider,
  createDotCompletionProvider,
  createIdentifierCompletionProvider,
} from '../providers'

const INDEX: DocsIndex = {
  runtime: 'demo',
  docs: {
    ellipse: {
      signature: 'ellipse(x, y, w, h)',
      description: 'Draw an ellipse at (x, y).',
      example: 'ellipse(50, 50, 80, 80)',
      kind: 'function',
      sourceUrl: 'https://example.test/ellipse',
    },
    rotate: {
      signature: '.rotate(angle)',
      description: 'Rotate the coordinate system.',
      kind: 'method',
    },
  },
  aliases: { bg: 'ellipse' },
}

function makeMonaco() {
  const registerHover = vi.fn(
    () => ({ dispose: vi.fn() }) as Monaco.IDisposable,
  )
  const registerCompletion = vi.fn(
    () => ({ dispose: vi.fn() }) as Monaco.IDisposable,
  )
  return {
    registerHover,
    registerCompletion,
    monaco: {
      Range: class {
        constructor(
          public sl: number,
          public sc: number,
          public el: number,
          public ec: number,
        ) {}
      },
      languages: {
        registerHoverProvider: registerHover,
        registerCompletionItemProvider: registerCompletion,
        CompletionItemKind: {
          Function: 1,
          Method: 2,
          Variable: 3,
          Constant: 4,
          Keyword: 5,
          Module: 6,
          Value: 7,
          Interface: 8,
        },
      },
    } as unknown as typeof Monaco,
  }
}

function makeModel(line: string) {
  return {
    getLineContent: () => line,
    getWordAtPosition: (pos: { lineNumber: number; column: number }) => {
      const before = line.substring(0, pos.column - 1)
      const after = line.substring(pos.column - 1)
      const startMatch = /[\w$]+$/.exec(before)
      const endMatch = /^[\w$]*/.exec(after)
      const start = startMatch ? before.length - startMatch[0].length : null
      const word = (startMatch?.[0] ?? '') + (endMatch?.[0] ?? '')
      if (!word) return null
      return {
        word,
        startColumn: (start ?? before.length) + 1,
        endColumn: (start ?? before.length) + 1 + word.length,
      }
    },
    getWordUntilPosition: (pos: { lineNumber: number; column: number }) => {
      const before = line.substring(0, pos.column - 1)
      const match = /[\w$]+$/.exec(before)
      const word = match?.[0] ?? ''
      const startCol = pos.column - word.length
      return { word, startColumn: startCol, endColumn: pos.column }
    },
  } as unknown as Monaco.editor.ITextModel
}

function makePos(col: number) {
  return { lineNumber: 1, column: col } as Monaco.Position
}

describe('resolveDoc', () => {
  it('resolves direct hits', () => {
    expect(resolveDoc(INDEX, 'ellipse')?.name).toBe('ellipse')
  })
  it('resolves aliases', () => {
    const hit = resolveDoc(INDEX, 'bg')
    expect(hit?.name).toBe('ellipse')
    expect(hit?.doc.description).toContain('ellipse')
  })
  it('returns null for misses', () => {
    expect(resolveDoc(INDEX, 'nope')).toBeNull()
  })
})

describe('validateDocsIndex', () => {
  it('accepts a valid index', () => {
    expect(() => validateDocsIndex('test', INDEX)).not.toThrow()
  })
  it('rejects non-object roots', () => {
    expect(() => validateDocsIndex('test', null)).toThrow(/must be an object/)
    expect(() => validateDocsIndex('test', 42)).toThrow(/must be an object/)
  })
  it('rejects missing runtime field', () => {
    expect(() =>
      validateDocsIndex('test', { docs: {} }),
    ).toThrow(/runtime must be/)
  })
  it('rejects empty runtime string', () => {
    expect(() =>
      validateDocsIndex('test', { runtime: '', docs: {} }),
    ).toThrow(/runtime must be/)
  })
  it('rejects missing docs field', () => {
    expect(() =>
      validateDocsIndex('test', { runtime: 'x' }),
    ).toThrow(/docs must be/)
  })
  it('rejects entry missing signature', () => {
    expect(() =>
      validateDocsIndex('test', {
        runtime: 'x',
        docs: { foo: { description: 'hi' } },
      }),
    ).toThrow(/"foo" is missing string "signature"/)
  })
  it('rejects entry missing description', () => {
    expect(() =>
      validateDocsIndex('test', {
        runtime: 'x',
        docs: { foo: { signature: 'foo()' } },
      }),
    ).toThrow(/"foo" is missing string "description"/)
  })
  it('label appears in error messages', () => {
    expect(() =>
      validateDocsIndex('myruntime.json', { runtime: 42 }),
    ).toThrow(/myruntime\.json/)
  })
})

describe('createHoverProvider', () => {
  it('registers against the runtime language id', () => {
    const { monaco, registerHover } = makeMonaco()
    createHoverProvider(monaco, INDEX)
    expect(registerHover).toHaveBeenCalledOnce()
    expect(registerHover.mock.calls[0][0]).toBe('demo')
  })

  it('returns null when the word has no doc', () => {
    const { monaco, registerHover } = makeMonaco()
    createHoverProvider(monaco, INDEX)
    const provider = registerHover.mock.calls[0][1]
    const model = makeModel('line(10, 20)')
    const result = provider.provideHover(model, makePos(2))
    expect(result).toBeNull()
  })

  it('returns hover contents with signature and description', () => {
    const { monaco, registerHover } = makeMonaco()
    createHoverProvider(monaco, INDEX)
    const provider = registerHover.mock.calls[0][1]
    const model = makeModel('ellipse(0, 0, 10, 10)')
    const result = provider.provideHover(model, makePos(3))
    expect(result).not.toBeNull()
    expect(result!.contents[0].value).toContain('ellipse(x, y, w, h)')
    expect(result!.contents.some((c) => c.value.includes('Draw an ellipse'))).toBe(true)
  })
})

describe('createDotCompletionProvider', () => {
  it('suggests entries after a dot', () => {
    const { monaco, registerCompletion } = makeMonaco()
    createDotCompletionProvider(monaco, INDEX)
    const provider = registerCompletion.mock.calls[0][1]
    const model = makeModel('foo().')
    const result = provider.provideCompletionItems(
      model,
      makePos(7),
      {} as Monaco.languages.CompletionContext,
      {} as Monaco.CancellationToken,
    ) as Monaco.languages.CompletionList
    expect(result.suggestions.length).toBeGreaterThan(0)
    expect(result.suggestions.some((s) => s.label === 'rotate')).toBe(true)
  })

  it('is silent outside dot context', () => {
    const { monaco, registerCompletion } = makeMonaco()
    createDotCompletionProvider(monaco, INDEX)
    const provider = registerCompletion.mock.calls[0][1]
    const model = makeModel('const x = ')
    const result = provider.provideCompletionItems(
      model,
      makePos(11),
      {} as Monaco.languages.CompletionContext,
      {} as Monaco.CancellationToken,
    ) as Monaco.languages.CompletionList
    expect(result.suggestions).toHaveLength(0)
  })
})

describe('createIdentifierCompletionProvider', () => {
  it('filters by prefix', () => {
    const { monaco, registerCompletion } = makeMonaco()
    createIdentifierCompletionProvider(monaco, INDEX)
    const provider = registerCompletion.mock.calls[0][1]
    const model = makeModel('ell')
    const result = provider.provideCompletionItems(
      model,
      makePos(4),
      {} as Monaco.languages.CompletionContext,
      {} as Monaco.CancellationToken,
    ) as Monaco.languages.CompletionList
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0].label).toBe('ellipse')
  })

  it('returns all entries when prefix is empty', () => {
    const { monaco, registerCompletion } = makeMonaco()
    createIdentifierCompletionProvider(monaco, INDEX)
    const provider = registerCompletion.mock.calls[0][1]
    const model = makeModel('')
    const result = provider.provideCompletionItems(
      model,
      makePos(1),
      {} as Monaco.languages.CompletionContext,
      {} as Monaco.CancellationToken,
    ) as Monaco.languages.CompletionList
    expect(result.suggestions).toHaveLength(2)
  })
})
