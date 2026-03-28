import type * as Monaco from 'monaco-editor'

const MARKER_OWNER = 'stave'

/**
 * Attempts to extract a line/column from a V8 stack trace produced by eval().
 *
 * V8 format: "at eval (<anonymous>:LINE:COL)" or "at eval (eval at ...:LINE:COL)"
 * Returns null if no match — caller falls back to full-document range.
 */
function parseErrorLocation(error: Error): { line: number; col: number } | null {
  const stack = error.stack ?? ''
  const match = stack.match(/at eval[^(]*\(.*?:(\d+):(\d+)\)/)
  if (match) {
    return { line: parseInt(match[1], 10), col: parseInt(match[2], 10) }
  }
  return null
}

/**
 * Sets a red error squiggle on the model.
 * If the error has a parseable location, marks that line.
 * Otherwise marks the entire document.
 */
export function setEvalError(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  error: Error
): void {
  const loc = parseErrorLocation(error)

  const lineNumber = loc?.line ?? 1
  const startColumn = loc?.col ?? 1
  const endLineNumber = loc ? loc.line : model.getLineCount()
  const endColumn = loc
    ? model.getLineMaxColumn(loc.line)
    : model.getLineMaxColumn(model.getLineCount())

  monaco.editor.setModelMarkers(model, MARKER_OWNER, [
    {
      severity: monaco.MarkerSeverity.Error,
      message: error.message,
      startLineNumber: lineNumber,
      startColumn,
      endLineNumber,
      endColumn,
    },
  ])
}

/**
 * Clears all eval error markers from the model.
 * Call on successful evaluate() or on stop().
 */
export function clearEvalErrors(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel
): void {
  monaco.editor.setModelMarkers(model, MARKER_OWNER, [])
}
