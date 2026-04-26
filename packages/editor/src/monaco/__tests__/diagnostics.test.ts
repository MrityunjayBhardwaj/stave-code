import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  setEvalError,
  clearEvalErrors,
  setLineMarker,
  clearLineMarkers,
} from '../diagnostics'
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
    MarkerSeverity: { Error: 8, Warning: 4, Info: 2 },
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

  // --- P37 regression cases ---

  it('clamps to full-document range when stack reports a line past EOF', () => {
    const spy = vi.fn()
    const monaco = makeMonaco(spy)
    const model = makeModel(4, 30)

    // Strudel transpiler wraps user code; stack points at a synthetic line.
    const error = new Error('notes is not defined')
    error.stack = `ReferenceError: notes is not defined\n    at eval (<anonymous>:42:7)`

    expect(() => setEvalError(monaco, model, error)).not.toThrow()

    const [, , markers] = spy.mock.calls[0]
    expect(markers[0]).toMatchObject({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 4,
      endColumn: 30,
    })
  })

  it('clamps to full-document range when stack reports line 0', () => {
    const spy = vi.fn()
    const monaco = makeMonaco(spy)
    const model = makeModel(5, 20)

    const error = new Error('bad')
    error.stack = `Error: bad\n    at eval (<anonymous>:0:0)`

    expect(() => setEvalError(monaco, model, error)).not.toThrow()

    const [, , markers] = spy.mock.calls[0]
    expect(markers[0]).toMatchObject({
      startLineNumber: 1,
      endLineNumber: 5,
    })
  })

  it('never throws when Monaco.setModelMarkers itself throws', () => {
    const throwing = vi.fn(() => {
      throw new Error('Illegal value for lineNumber')
    })
    const monaco = makeMonaco(throwing)
    const model = makeModel(3)

    const error = new Error('oops')
    expect(() => setEvalError(monaco, model, error)).not.toThrow()
  })

  it('never throws when model.getLineMaxColumn throws', () => {
    const spy = vi.fn()
    const monaco = makeMonaco(spy)
    const model = {
      getLineCount: () => 3,
      getLineMaxColumn: () => {
        throw new Error('bad line')
      },
    } as unknown as Monaco.editor.ITextModel

    expect(() => setEvalError(monaco, model, new Error('x'))).not.toThrow()
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

  it('never throws when setModelMarkers throws', () => {
    const monaco = makeMonaco(
      vi.fn(() => {
        throw new Error('boom')
      })
    )
    expect(() => clearEvalErrors(monaco, makeModel(3))).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// setLineMarker / clearLineMarkers
// ---------------------------------------------------------------------------

describe('setLineMarker', () => {
  it('places a marker on a valid line with the given severity + owner', () => {
    const spy = vi.fn()
    const monaco = makeMonaco(spy)
    const model = makeModel(10, 50)

    setLineMarker(monaco, model, {
      line: 3,
      column: 7,
      message: 'hint',
      severity: 'warn',
      owner: 'stave-log',
    })

    const [, owner, markers] = spy.mock.calls[0]
    expect(owner).toBe('stave-log')
    expect(markers[0]).toMatchObject({
      severity: 4,
      message: 'hint',
      startLineNumber: 3,
      startColumn: 7,
      endLineNumber: 3,
    })
  })

  it('falls back to full-document range when line is out of bounds', () => {
    const spy = vi.fn()
    const monaco = makeMonaco(spy)
    const model = makeModel(4, 30)

    setLineMarker(monaco, model, {
      line: 99,
      message: 'x',
    })

    const [, , markers] = spy.mock.calls[0]
    expect(markers[0]).toMatchObject({
      startLineNumber: 1,
      endLineNumber: 4,
      endColumn: 30,
    })
  })

  it('defaults to error severity + stave owner when unspecified', () => {
    const spy = vi.fn()
    const monaco = makeMonaco(spy)

    setLineMarker(monaco, makeModel(2), { line: 1, message: 'boom' })

    const [, owner, markers] = spy.mock.calls[0]
    expect(owner).toBe('stave')
    expect(markers[0].severity).toBe(8)
  })

  it('never throws when Monaco rejects the marker', () => {
    const monaco = makeMonaco(
      vi.fn(() => {
        throw new Error('Illegal value for lineNumber')
      })
    )
    expect(() =>
      setLineMarker(monaco, makeModel(3), { line: 1, message: 'x' }),
    ).not.toThrow()
  })
})

describe('clearLineMarkers', () => {
  it('clears the given owner with an empty array', () => {
    const spy = vi.fn()
    const monaco = makeMonaco(spy)
    clearLineMarkers(monaco, makeModel(3), 'stave-log')
    expect(spy).toHaveBeenCalledWith(expect.anything(), 'stave-log', [])
  })
})
