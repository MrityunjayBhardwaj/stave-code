import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setEvalError, clearEvalErrors } from '../diagnostics'
import type * as Monaco from 'monaco-editor'

// ---------------------------------------------------------------------------
// Minimal Monaco mock
// ---------------------------------------------------------------------------

function makeModel(lineCount: number, maxCol = 80): Monaco.editor.ITextModel {
  return {
    getLineCount: () => lineCount,
    getLineMaxColumn: (_line: number) => maxCol,
  } as unknown as Monaco.editor.ITextModel
}

function makeMonaco(setModelMarkers = vi.fn()) {
  return {
    editor: {
      setModelMarkers,
    },
    MarkerSeverity: { Error: 8 },
  } as unknown as typeof Monaco
}

// ---------------------------------------------------------------------------
// setEvalError
// ---------------------------------------------------------------------------

describe('setEvalError', () => {
  it('marks the correct line when stack has V8 eval location', () => {
    const spy = vi.fn()
    const monaco = makeMonaco(spy)
    const model = makeModel(10, 50)

    const error = new Error('Unexpected token')
    error.stack = `SyntaxError: Unexpected token\n    at eval (<anonymous>:3:12)\n    at foo (bar.js:1:1)`

    setEvalError(monaco, model, error)

    expect(spy).toHaveBeenCalledOnce()
    const [, owner, markers] = spy.mock.calls[0]
    expect(owner).toBe('stave')
    expect(markers).toHaveLength(1)
    expect(markers[0]).toMatchObject({
      severity: 8,
      message: 'Unexpected token',
      startLineNumber: 3,
      startColumn: 12,
      endLineNumber: 3,
    })
  })

  it('falls back to full-document range when stack has no eval location', () => {
    const spy = vi.fn()
    const monaco = makeMonaco(spy)
    const model = makeModel(5, 40)

    const error = new Error('something went wrong')
    error.stack = 'Error: something went wrong\n    at Object.<anonymous> (file.js:1:1)'

    setEvalError(monaco, model, error)

    const [, , markers] = spy.mock.calls[0]
    expect(markers[0]).toMatchObject({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 5,
      endColumn: 40,
    })
  })

  it('falls back to full-document range when stack is empty', () => {
    const spy = vi.fn()
    const monaco = makeMonaco(spy)
    const model = makeModel(3, 20)

    const error = new Error('oops')
    error.stack = ''

    setEvalError(monaco, model, error)

    const [, , markers] = spy.mock.calls[0]
    expect(markers[0]).toMatchObject({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 3,
      endColumn: 20,
    })
  })

  it('uses error.message in the marker', () => {
    const spy = vi.fn()
    const monaco = makeMonaco(spy)
    const model = makeModel(2)

    const error = new Error('foo is not defined')
    setEvalError(monaco, model, error)

    const [, , markers] = spy.mock.calls[0]
    expect(markers[0].message).toBe('foo is not defined')
  })
})

// ---------------------------------------------------------------------------
// clearEvalErrors
// ---------------------------------------------------------------------------

describe('clearEvalErrors', () => {
  it('calls setModelMarkers with empty array', () => {
    const spy = vi.fn()
    const monaco = makeMonaco(spy)
    const model = makeModel(5)

    clearEvalErrors(monaco, model)

    expect(spy).toHaveBeenCalledOnce()
    const [, owner, markers] = spy.mock.calls[0]
    expect(owner).toBe('stave')
    expect(markers).toEqual([])
  })
})
