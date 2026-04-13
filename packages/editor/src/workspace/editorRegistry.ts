/**
 * editorRegistry — tiny module-level map so callers outside the
 * editor package (shell, app, outline panel) can find the Monaco
 * editor instance that's currently rendering a given fileId. Used
 * for cross-file navigation features like "reveal at line".
 *
 * EditorView registers on mount and unregisters on unmount. Only the
 * ACTIVE editor for a fileId matters — if two groups show the same
 * file, the last mount wins, which matches the UX ("jump to this
 * symbol" lands wherever the editor is currently focused).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MonacoEditor = any

const editors = new Map<string, MonacoEditor>()

export function registerEditor(fileId: string, editor: MonacoEditor): void {
  editors.set(fileId, editor)
}

export function unregisterEditor(fileId: string, editor: MonacoEditor): void {
  if (editors.get(fileId) === editor) editors.delete(fileId)
}

export function getEditorForFile(fileId: string): MonacoEditor | undefined {
  return editors.get(fileId)
}

/**
 * Reveal the given line in the editor for `fileId` and set the cursor
 * at column 1. Returns true if the editor was found. Line numbers are
 * 1-based.
 */
export function revealLineInFile(fileId: string, line: number): boolean {
  const editor = editors.get(fileId)
  if (!editor) return false
  try {
    editor.revealLineInCenter?.(line)
    editor.setPosition?.({ lineNumber: line, column: 1 })
    editor.focus?.()
    return true
  } catch {
    return false
  }
}

// ── Global editor options ──────────────────────────────────────────

const DEFAULT_FONT_SIZE = 14
const FONT_SIZE_STORAGE = 'stave:editorFontSize'
const MINIMAP_STORAGE = 'stave:editorMinimap'

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    if (typeof window.localStorage?.getItem !== 'function') return null
    return window.localStorage
  } catch {
    return null
  }
}

function readFontSize(): number {
  const ls = safeLocalStorage()
  if (!ls) return DEFAULT_FONT_SIZE
  const saved = Number(ls.getItem(FONT_SIZE_STORAGE))
  return Number.isFinite(saved) && saved >= 8 && saved <= 40 ? saved : DEFAULT_FONT_SIZE
}

function readMinimap(): boolean {
  const ls = safeLocalStorage()
  return ls?.getItem(MINIMAP_STORAGE) === '1'
}

function writeFontSize(size: number): void {
  safeLocalStorage()?.setItem(FONT_SIZE_STORAGE, String(size))
}

function writeMinimap(on: boolean): void {
  safeLocalStorage()?.setItem(MINIMAP_STORAGE, on ? '1' : '0')
}

function applyOptionsToEditor(editor: MonacoEditor): void {
  const fontSize = readFontSize()
  const minimap = readMinimap()
  editor.updateOptions?.({ fontSize, minimap: { enabled: minimap } })
}

/** Get the current global editor font size (px). */
export function getEditorFontSize(): number { return readFontSize() }

/** Get the current global minimap visibility flag. */
export function getEditorMinimap(): boolean { return readMinimap() }

/** Set the font size (clamped 8–40) and apply to every open editor. */
export function setEditorFontSize(size: number): void {
  const clamped = Math.max(8, Math.min(40, Math.round(size)))
  writeFontSize(clamped)
  for (const ed of editors.values()) ed.updateOptions?.({ fontSize: clamped })
}

/** Bump font size by delta (positive / negative). */
export function bumpEditorFontSize(delta: number): void {
  setEditorFontSize(readFontSize() + delta)
}

/** Toggle minimap visibility across every open editor. */
export function toggleEditorMinimap(): void {
  const next = !readMinimap()
  writeMinimap(next)
  for (const ed of editors.values()) ed.updateOptions?.({ minimap: { enabled: next } })
}

/** Called by EditorView on mount to seed the editor with saved options. */
export function applyPersistedEditorOptions(editor: MonacoEditor): void {
  applyOptionsToEditor(editor)
}
