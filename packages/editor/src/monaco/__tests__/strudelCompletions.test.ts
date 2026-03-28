import { describe, it, expect, vi } from 'vitest'
import {
  generateNoteNames,
  NOTE_NAMES,
  registerStrudelDotCompletions,
  registerStrudelNoteCompletions,
} from '../strudelCompletions'
import type * as Monaco from 'monaco-editor'

// ---------------------------------------------------------------------------
// Minimal Monaco mock factory
// ---------------------------------------------------------------------------

function makeMonaco(registerCompletionItemProvider = vi.fn(() => ({ dispose: vi.fn() }))) {
  return {
    languages: {
      registerCompletionItemProvider,
      CompletionItemKind: { Method: 0, Value: 1 },
    },
  } as unknown as typeof Monaco
}

function makeModel(lineContent: string): Monaco.editor.ITextModel {
  return {
    getLineContent: () => lineContent,
    getWordUntilPosition: () => ({ word: '', startColumn: 1, endColumn: 1 }),
  } as unknown as Monaco.editor.ITextModel
}

function makePosition(col: number): Monaco.Position {
  return { lineNumber: 1, column: col } as Monaco.Position
}

// ---------------------------------------------------------------------------
// generateNoteNames
// ---------------------------------------------------------------------------

describe('generateNoteNames', () => {
  it('includes c4', () => {
    expect(NOTE_NAMES).toContain('c4')
  })

  it('includes flats like eb3', () => {
    expect(NOTE_NAMES).toContain('eb3')
  })

  it('includes sharps like f#5', () => {
    expect(NOTE_NAMES).toContain('f#5')
  })

  it('covers octaves 0 through 7', () => {
    expect(NOTE_NAMES).toContain('c0')
    expect(NOTE_NAMES).toContain('b7')
  })

  it('generates more than 100 names', () => {
    expect(generateNoteNames().length).toBeGreaterThan(100)
  })
})

// ---------------------------------------------------------------------------
// registerStrudelDotCompletions
// ---------------------------------------------------------------------------

describe('registerStrudelDotCompletions', () => {
  it('registers a completion provider for strudel language', () => {
    const spy = vi.fn(() => ({ dispose: vi.fn() }))
    const monaco = makeMonaco(spy)
    registerStrudelDotCompletions(monaco)
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0][0]).toBe('strudel')
  })

  it('returns a disposable', () => {
    const dispose = vi.fn()
    const monaco = makeMonaco(vi.fn(() => ({ dispose })))
    const d = registerStrudelDotCompletions(monaco)
    d.dispose()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('provides suggestions after closing paren dot', () => {
    const spy = vi.fn(() => ({ dispose: vi.fn() }))
    const monaco = makeMonaco(spy)
    registerStrudelDotCompletions(monaco)

    const provider = spy.mock.calls[0][1]
    // "note("c4")." — cursor is at col 12 (after the dot, 1-indexed)
    const model = makeModel('note("c4").')
    const result = provider.provideCompletionItems(model, makePosition(12))
    expect(result.suggestions.length).toBeGreaterThan(0)
    expect(result.suggestions.some((s: { label: string }) => s.label === 'fast')).toBe(true)
  })

  it('returns empty suggestions when no dot context', () => {
    const spy = vi.fn(() => ({ dispose: vi.fn() }))
    const monaco = makeMonaco(spy)
    registerStrudelDotCompletions(monaco)

    const provider = spy.mock.calls[0][1]
    const model = makeModel('const x = ')
    const result = provider.provideCompletionItems(model, makePosition(11))
    expect(result.suggestions).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// registerStrudelNoteCompletions
// ---------------------------------------------------------------------------

describe('registerStrudelNoteCompletions', () => {
  it('registers a completion provider for strudel language', () => {
    const spy = vi.fn(() => ({ dispose: vi.fn() }))
    const monaco = makeMonaco(spy)
    registerStrudelNoteCompletions(monaco)
    expect(spy.mock.calls[0][0]).toBe('strudel')
  })

  it('provides note name suggestions inside note("...")', () => {
    const spy = vi.fn(() => ({ dispose: vi.fn() }))
    const monaco = makeMonaco(spy)
    registerStrudelNoteCompletions(monaco)

    const provider = spy.mock.calls[0][1]
    const model = makeModel('note("c')
    const result = provider.provideCompletionItems(model, makePosition(8))
    expect(result.suggestions.length).toBeGreaterThan(0)
    expect(result.suggestions.some((s: { label: string }) => s.label === 'c4')).toBe(true)
  })

  it('returns empty suggestions outside note() context', () => {
    const spy = vi.fn(() => ({ dispose: vi.fn() }))
    const monaco = makeMonaco(spy)
    registerStrudelNoteCompletions(monaco)

    const provider = spy.mock.calls[0][1]
    const model = makeModel('s("bd')
    const result = provider.provideCompletionItems(model, makePosition(6))
    expect(result.suggestions).toHaveLength(0)
  })

  it('matches .note( chained call', () => {
    const spy = vi.fn(() => ({ dispose: vi.fn() }))
    const monaco = makeMonaco(spy)
    registerStrudelNoteCompletions(monaco)

    const provider = spy.mock.calls[0][1]
    // 's("bd").note("e' is 15 chars, cursor at col 16
    const model = makeModel('s("bd").note("e')
    const result = provider.provideCompletionItems(model, makePosition(16))
    expect(result.suggestions.length).toBeGreaterThan(0)
  })
})
