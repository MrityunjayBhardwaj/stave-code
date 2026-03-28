import { describe, it, expect, vi } from 'vitest'
import { STRUDEL_DOCS, registerStrudelHover } from '../strudelDocs'
import type * as Monaco from 'monaco-editor'

// ---------------------------------------------------------------------------
// STRUDEL_DOCS
// ---------------------------------------------------------------------------

describe('STRUDEL_DOCS', () => {
  it('has at least 20 entries', () => {
    expect(Object.keys(STRUDEL_DOCS).length).toBeGreaterThanOrEqual(20)
  })

  it('every entry has signature, description, and example', () => {
    for (const [name, doc] of Object.entries(STRUDEL_DOCS)) {
      expect(doc.signature, `${name}.signature`).toBeTruthy()
      expect(doc.description, `${name}.description`).toBeTruthy()
      expect(doc.example, `${name}.example`).toBeTruthy()
    }
  })

  it('includes core functions: note, s, stack, fast, slow', () => {
    expect(STRUDEL_DOCS).toHaveProperty('note')
    expect(STRUDEL_DOCS).toHaveProperty('s')
    expect(STRUDEL_DOCS).toHaveProperty('stack')
    expect(STRUDEL_DOCS).toHaveProperty('fast')
    expect(STRUDEL_DOCS).toHaveProperty('slow')
  })
})

// ---------------------------------------------------------------------------
// registerStrudelHover
// ---------------------------------------------------------------------------

function makeMonaco(registerHoverProvider = vi.fn(() => ({ dispose: vi.fn() }))) {
  return {
    languages: { registerHoverProvider },
    Range: class {
      constructor(
        public startLineNumber: number,
        public startColumn: number,
        public endLineNumber: number,
        public endColumn: number
      ) {}
    },
  } as unknown as typeof Monaco
}

describe('registerStrudelHover', () => {
  it('registers a hover provider for strudel language', () => {
    const spy = vi.fn(() => ({ dispose: vi.fn() }))
    const monaco = makeMonaco(spy)
    registerStrudelHover(monaco)
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0][0]).toBe('strudel')
  })

  it('returns a disposable', () => {
    const dispose = vi.fn()
    const monaco = makeMonaco(vi.fn(() => ({ dispose })))
    const d = registerStrudelHover(monaco)
    d.dispose()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('returns hover content for a known function', () => {
    const spy = vi.fn(() => ({ dispose: vi.fn() }))
    const monaco = makeMonaco(spy)
    registerStrudelHover(monaco)

    const provider = spy.mock.calls[0][1]
    const model = {
      getWordAtPosition: () => ({ word: 'fast', startColumn: 1, endColumn: 5 }),
    } as unknown as Monaco.editor.ITextModel
    const position = { lineNumber: 1, column: 3 } as Monaco.Position

    const result = provider.provideHover(model, position)
    expect(result).not.toBeNull()
    expect(result.contents).toHaveLength(3)
    expect(result.contents[0].value).toContain('fast')
  })

  it('returns null for unknown word', () => {
    const spy = vi.fn(() => ({ dispose: vi.fn() }))
    const monaco = makeMonaco(spy)
    registerStrudelHover(monaco)

    const provider = spy.mock.calls[0][1]
    const model = {
      getWordAtPosition: () => ({ word: 'unknownFn', startColumn: 1, endColumn: 9 }),
    } as unknown as Monaco.editor.ITextModel

    const result = provider.provideHover(model, { lineNumber: 1, column: 1 } as Monaco.Position)
    expect(result).toBeNull()
  })

  it('returns null when no word at position', () => {
    const spy = vi.fn(() => ({ dispose: vi.fn() }))
    const monaco = makeMonaco(spy)
    registerStrudelHover(monaco)

    const provider = spy.mock.calls[0][1]
    const model = {
      getWordAtPosition: () => null,
    } as unknown as Monaco.editor.ITextModel

    const result = provider.provideHover(model, { lineNumber: 1, column: 1 } as Monaco.Position)
    expect(result).toBeNull()
  })
})
