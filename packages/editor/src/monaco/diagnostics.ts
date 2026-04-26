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
 *
 * Stack-parsed line numbers can exceed the model's line count — Strudel
 * transpiles user code into a wrapper so the reported line may sit past
 * the end of the visible document. Monaco throws `Illegal value for
 * lineNumber` when that happens; the throw cascades through React's
 * commit phase and unmounts the editor subtree. Clamp line/column into
 * model range and swallow any residual Monaco validation errors so a
 * bad stack trace never tears down the UI (hetvabhasa P37).
 */
export function setEvalError(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  error: Error
): void {
  try {
    const loc = parseErrorLocation(error)
    const lineCount = model.getLineCount()

    const validLine =
      loc && Number.isFinite(loc.line) && loc.line >= 1 && loc.line <= lineCount
        ? loc.line
        : null
    const validCol =
      loc && Number.isFinite(loc.col) && loc.col >= 1 ? loc.col : 1

    const lineNumber = validLine ?? 1
    const startColumn = validLine ? validCol : 1
    const endLineNumber = validLine ?? lineCount
    const endColumn = model.getLineMaxColumn(endLineNumber)

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
  } catch (markerError) {
    // eslint-disable-next-line no-console
    console.warn('[stave] setEvalError failed, marker skipped:', markerError)
  }
}

/**
 * Clears all eval error markers from the model.
 * Call on successful evaluate() or on stop().
 */
export function clearEvalErrors(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel
): void {
  try {
    monaco.editor.setModelMarkers(model, MARKER_OWNER, [])
  } catch (markerError) {
    // eslint-disable-next-line no-console
    console.warn('[stave] clearEvalErrors failed:', markerError)
  }
}

/**
 * Place a single marker on a specific line. Owner is caller-supplied so
 * log-driven markers (`stave-log`) can coexist with the runtime-driven
 * `setEvalError` markers (`stave`) without clobbering each other — the
 * user sees both surfaces highlight the same line when they overlap.
 *
 * Line/column validation mirrors `setEvalError`: values outside the
 * model's range fall back to a full-document marker. Any residual
 * Monaco throw is swallowed (hetvabhasa P37).
 */
export function setLineMarker(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  opts: {
    line?: number
    column?: number
    message: string
    severity?: 'error' | 'warn' | 'info'
    owner?: string
  }
): void {
  try {
    const lineCount = model.getLineCount()
    const line =
      opts.line != null &&
      Number.isFinite(opts.line) &&
      opts.line >= 1 &&
      opts.line <= lineCount
        ? opts.line
        : null
    const col =
      opts.column != null && Number.isFinite(opts.column) && opts.column >= 1
        ? opts.column
        : 1

    const severityMap = {
      error: monaco.MarkerSeverity.Error,
      warn: monaco.MarkerSeverity.Warning,
      info: monaco.MarkerSeverity.Info,
    } as const
    const severity = severityMap[opts.severity ?? 'error']

    const startLine = line ?? 1
    const endLine = line ?? lineCount
    const startColumn = line ? col : 1
    const endColumn = model.getLineMaxColumn(endLine)

    monaco.editor.setModelMarkers(model, opts.owner ?? MARKER_OWNER, [
      {
        severity,
        message: opts.message,
        startLineNumber: startLine,
        startColumn,
        endLineNumber: endLine,
        endColumn,
      },
    ])
  } catch (markerError) {
    // eslint-disable-next-line no-console
    console.warn('[stave] setLineMarker failed, skipped:', markerError)
  }
}

/** Clear markers of a specific owner. Use to drop log-driven squiggles. */
export function clearLineMarkers(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  owner: string
): void {
  try {
    monaco.editor.setModelMarkers(model, owner, [])
  } catch (markerError) {
    // eslint-disable-next-line no-console
    console.warn('[stave] clearLineMarkers failed:', markerError)
  }
}
