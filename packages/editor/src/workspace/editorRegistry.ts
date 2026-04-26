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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MonacoNs = any

const editors = new Map<string, MonacoEditor>()
// One monaco namespace per process (all editors share it). Captured on
// first mount so global operations (setTheme) can run without holding
// onto a specific editor ref.
let monacoNs: MonacoNs | null = null

export function registerMonacoNamespace(monaco: MonacoNs): void {
  if (!monacoNs) monacoNs = monaco
}

/**
 * Return the Monaco namespace captured at first editor mount. `null`
 * until any editor has rendered — callers relying on this for
 * cross-editor operations (setModelMarkers, setTheme) should early-exit
 * when it's missing, not throw.
 */
export function getMonacoNamespace(): MonacoNs | null {
  return monacoNs
}

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
const DEFAULT_UI_ICON_SIZE = 25
const UI_ICON_SIZE_STORAGE = 'stave:uiIconSize'
/** CSS variable that scales every chrome-level icon glyph (menu gear,
 *  activity bar, etc.). Applied to documentElement on mount and on
 *  every change. */
export const UI_ICON_SIZE_VAR = '--ui-icon-size'

const DEFAULT_INLINE_VIZ_ACTION_SIZE = 11
const INLINE_VIZ_ACTION_SIZE_STORAGE = 'stave:inlineVizActionSize'
/** Separate CSS variable for the floating action buttons (edit / crop)
 *  attached to inline `.viz()` zones. They sit inside the canvas area
 *  and tend to need a tighter scale than the rest of the chrome —
 *  hence their own slider, independent of the main UI icon size. */
export const INLINE_VIZ_ACTION_SIZE_VAR = '--inline-viz-action-size'

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

// ── UI icon size (scales chrome glyphs: ⚙, ▢, ✎, etc.) ─────────────
const uiIconSizeListeners = new Set<(size: number) => void>()

function readUiIconSize(): number {
  const ls = safeLocalStorage()
  if (!ls) return DEFAULT_UI_ICON_SIZE
  const saved = Number(ls.getItem(UI_ICON_SIZE_STORAGE))
  return Number.isFinite(saved) && saved >= 10 && saved <= 40
    ? saved
    : DEFAULT_UI_ICON_SIZE
}

function writeUiIconSize(size: number): void {
  safeLocalStorage()?.setItem(UI_ICON_SIZE_STORAGE, String(size))
}

function applyUiIconSizeVar(size: number): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty(UI_ICON_SIZE_VAR, `${size}px`)
}

export function getEditorUiIconSize(): number { return readUiIconSize() }

export function setEditorUiIconSize(size: number): void {
  const clamped = Math.max(10, Math.min(40, Math.round(size)))
  writeUiIconSize(clamped)
  applyUiIconSizeVar(clamped)
  for (const cb of Array.from(uiIconSizeListeners)) cb(clamped)
}

export function onUiIconSizeChange(cb: (size: number) => void): () => void {
  uiIconSizeListeners.add(cb)
  return () => { uiIconSizeListeners.delete(cb) }
}

/** Apply the persisted icon size to the document root on first mount. */
export function applyPersistedUiIconSize(): void {
  applyUiIconSizeVar(readUiIconSize())
}

// ── Inline-viz action button size (edit / crop on viz zones) ────────
const inlineVizActionSizeListeners = new Set<(size: number) => void>()

function readInlineVizActionSize(): number {
  const ls = safeLocalStorage()
  if (!ls) return DEFAULT_INLINE_VIZ_ACTION_SIZE
  const saved = Number(ls.getItem(INLINE_VIZ_ACTION_SIZE_STORAGE))
  return Number.isFinite(saved) && saved >= 8 && saved <= 28
    ? saved
    : DEFAULT_INLINE_VIZ_ACTION_SIZE
}

function writeInlineVizActionSize(size: number): void {
  safeLocalStorage()?.setItem(INLINE_VIZ_ACTION_SIZE_STORAGE, String(size))
}

function applyInlineVizActionSizeVar(size: number): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty(
    INLINE_VIZ_ACTION_SIZE_VAR,
    `${size}px`,
  )
}

export function getInlineVizActionSize(): number {
  return readInlineVizActionSize()
}

export function setInlineVizActionSize(size: number): void {
  const clamped = Math.max(8, Math.min(28, Math.round(size)))
  writeInlineVizActionSize(clamped)
  applyInlineVizActionSizeVar(clamped)
  for (const cb of Array.from(inlineVizActionSizeListeners)) cb(clamped)
}

export function onInlineVizActionSizeChange(
  cb: (size: number) => void,
): () => void {
  inlineVizActionSizeListeners.add(cb)
  return () => { inlineVizActionSizeListeners.delete(cb) }
}

export function applyPersistedInlineVizActionSize(): void {
  applyInlineVizActionSizeVar(readInlineVizActionSize())
}

// ── Backdrop blur (code-surface legibility over viz backdrop) #39 ───
const DEFAULT_BACKDROP_BLUR = 8
const BACKDROP_BLUR_STORAGE = 'stave:backdropBlur'
/** CSS variable read by the shell's code-panel blur rule (see
 *  globals.css). 0 disables the blur entirely; higher values push
 *  more toward frosted-glass legibility. */
export const BACKDROP_BLUR_VAR = '--stave-backdrop-blur'

function readBackdropBlur(): number {
  const ls = safeLocalStorage()
  if (!ls) return DEFAULT_BACKDROP_BLUR
  const saved = Number(ls.getItem(BACKDROP_BLUR_STORAGE))
  return Number.isFinite(saved) && saved >= 0 && saved <= 40
    ? saved
    : DEFAULT_BACKDROP_BLUR
}

function writeBackdropBlur(size: number): void {
  safeLocalStorage()?.setItem(BACKDROP_BLUR_STORAGE, String(size))
}

function applyBackdropBlurVar(size: number): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty(
    BACKDROP_BLUR_VAR,
    `${size}px`,
  )
}

export function getEditorBackdropBlur(): number {
  return readBackdropBlur()
}

export function setEditorBackdropBlur(size: number): void {
  const clamped = Math.max(0, Math.min(40, Math.round(size)))
  writeBackdropBlur(clamped)
  applyBackdropBlurVar(clamped)
}

export function applyPersistedBackdropBlur(): void {
  applyBackdropBlurVar(readBackdropBlur())
}

// ── Backdrop viz opacity — user-facing dim control ──────────────────
const DEFAULT_BACKDROP_OPACITY = 1
const BACKDROP_OPACITY_STORAGE = 'stave:backdropOpacity'
const backdropOpacityListeners = new Set<(o: number) => void>()

function readBackdropOpacity(): number {
  const ls = safeLocalStorage()
  if (!ls) return DEFAULT_BACKDROP_OPACITY
  const saved = Number(ls.getItem(BACKDROP_OPACITY_STORAGE))
  return Number.isFinite(saved) && saved >= 0 && saved <= 1
    ? saved
    : DEFAULT_BACKDROP_OPACITY
}

function writeBackdropOpacity(o: number): void {
  safeLocalStorage()?.setItem(BACKDROP_OPACITY_STORAGE, String(o))
}

export function getBackdropOpacity(): number {
  return readBackdropOpacity()
}

export function setBackdropOpacity(o: number): void {
  const clamped = Math.max(0, Math.min(1, o))
  writeBackdropOpacity(clamped)
  for (const cb of Array.from(backdropOpacityListeners)) cb(clamped)
}

export function onBackdropOpacityChange(
  cb: (o: number) => void,
): () => void {
  backdropOpacityListeners.add(cb)
  return () => { backdropOpacityListeners.delete(cb) }
}

// ── Backdrop quality ladder (Full / Half / Quarter) #41 ─────────────
export type BackdropQuality = 'full' | 'half' | 'quarter'
const DEFAULT_BACKDROP_QUALITY: BackdropQuality = 'half'
const BACKDROP_QUALITY_STORAGE = 'stave:backdropQuality'
const backdropQualityListeners = new Set<(q: BackdropQuality) => void>()

function readBackdropQuality(): BackdropQuality {
  const ls = safeLocalStorage()
  const v = ls?.getItem(BACKDROP_QUALITY_STORAGE)
  return v === 'full' || v === 'half' || v === 'quarter'
    ? v
    : DEFAULT_BACKDROP_QUALITY
}

function writeBackdropQuality(q: BackdropQuality): void {
  safeLocalStorage()?.setItem(BACKDROP_QUALITY_STORAGE, q)
}

export function getBackdropQuality(): BackdropQuality {
  return readBackdropQuality()
}

export function setBackdropQuality(q: BackdropQuality): void {
  writeBackdropQuality(q)
  for (const cb of Array.from(backdropQualityListeners)) cb(q)
}

export function onBackdropQualityChange(
  cb: (q: BackdropQuality) => void,
): () => void {
  backdropQualityListeners.add(cb)
  return () => { backdropQualityListeners.delete(cb) }
}

/** Resolution factor applied to the backdrop — render at factor×
 *  viewport size, CSS-stretch to fill. Lower = cheaper GPU. */
export function backdropQualityFactor(q: BackdropQuality): number {
  return q === 'full' ? 1 : q === 'quarter' ? 0.25 : 0.5
}

/** Called by EditorView on mount to seed the editor with saved options. */
export function applyPersistedEditorOptions(editor: MonacoEditor): void {
  applyOptionsToEditor(editor)
}

// ── Theme ──────────────────────────────────────────────────────────

export type EditorTheme = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'
const THEME_STORAGE = 'stave:editorTheme'

function readTheme(): EditorTheme {
  const ls = safeLocalStorage()
  const v = ls?.getItem(THEME_STORAGE)
  return v === 'light' || v === 'system' ? v : v === 'dark' ? 'dark' : 'dark'
}

function writeTheme(t: EditorTheme): void {
  safeLocalStorage()?.setItem(THEME_STORAGE, t)
}

function systemPrefersLight(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: light)').matches
}

function resolveTheme(t: EditorTheme): ResolvedTheme {
  if (t === 'dark' || t === 'light') return t
  return systemPrefersLight() ? 'light' : 'dark'
}

type ThemeListener = (t: ResolvedTheme) => void
const themeListeners = new Set<ThemeListener>()
let systemMqlWired = false
let systemMql: MediaQueryList | null = null

function notifyThemeListeners(resolved: ResolvedTheme): void {
  for (const fn of themeListeners) {
    try { fn(resolved) } catch { /* swallow */ }
  }
}

function wireSystemMqlOnce(): void {
  if (systemMqlWired || typeof window === 'undefined' || !window.matchMedia) return
  systemMqlWired = true
  systemMql = window.matchMedia('(prefers-color-scheme: light)')
  const onChange = (): void => {
    if (readTheme() !== 'system') return
    applyResolvedTheme(resolveTheme('system'))
  }
  try {
    systemMql.addEventListener('change', onChange)
  } catch {
    // Safari < 14 fallback
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(systemMql as any).addListener?.(onChange)
  }
}

function applyResolvedTheme(resolved: ResolvedTheme): void {
  if (monacoNs?.editor?.setTheme) {
    monacoNs.editor.setTheme(resolved === 'light' ? 'stave-light' : 'stave-dark')
  }
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-stave-theme', resolved)
  }
  notifyThemeListeners(resolved)
}

export function getEditorTheme(): EditorTheme { return readTheme() }

export function getResolvedTheme(): ResolvedTheme { return resolveTheme(readTheme()) }

export function setEditorTheme(theme: EditorTheme): void {
  writeTheme(theme)
  wireSystemMqlOnce()
  applyResolvedTheme(resolveTheme(theme))
}

/** Cycle dark → light → system → dark. Used by the menu command. */
export function cycleEditorTheme(): EditorTheme {
  const next: EditorTheme = readTheme() === 'dark' ? 'light' : readTheme() === 'light' ? 'system' : 'dark'
  setEditorTheme(next)
  return next
}

/** Subscribe to resolved theme changes. Fires when mode changes or when
 * 'system' preference flips. Returns an unsubscribe. */
export function onThemeChange(fn: ThemeListener): () => void {
  themeListeners.add(fn)
  return () => { themeListeners.delete(fn) }
}

/** Seed DOM + monaco with the persisted theme. Call after mounting. */
export function applyPersistedTheme(): void {
  wireSystemMqlOnce()
  setEditorTheme(readTheme())
}
