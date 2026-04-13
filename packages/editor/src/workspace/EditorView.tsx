/**
 * EditorView — Phase 10.2 Tasks 03 + 07.
 *
 * Pure Monaco editor view bound to a single workspace file, extended with
 * bus-driven inline view zones, active highlighting, and error diagnostics.
 *
 * ## Task 03 (base)
 *
 * Monaco mount, theme application (PV6/PK6), chrome slot injection, and
 * file store binding via `useWorkspaceFile`.
 *
 * ## Task 07 (wiring)
 *
 * Three bus-driven features layered on top of the Task 03 base:
 *
 * 1. **Inline view zones (D-08):** Subscribes to `workspaceAudioBus` with
 *    `{ kind: 'file', fileId }` — its OWN file's runtime, never `'default'`.
 *    On non-null payload with `inlineViz.vizRequests.size > 0`, calls
 *    `addInlineViewZones(editor, payload, descriptors)`. On null (runtime
 *    stopped) calls `pause()`, NOT `cleanup()` (PK3). On file content
 *    change calls `cleanup()` (zone line numbers stale).
 *
 * 2. **Active highlighting (S5):** Reads `payload.hapStream` from the same
 *    bus subscription and feeds it to `useHighlighting(editor, hapStream)`.
 *    Clears when payload goes null.
 *
 * 3. **Eval error diagnostics (S7):** Accepts an `error?: Error | null` prop.
 *    When error transitions from null to Error, calls `setEvalError`. When
 *    it transitions to null, calls `clearEvalErrors`. The parent (compat
 *    shim or shell integration) manages the runtime's `onError` subscription.
 */

import React, { useEffect, useRef, useState } from 'react'
import MonacoEditorRaw from '@monaco-editor/react'
import { applyTheme } from '../theme/tokens'
import { defineStrudelMonacoTheme } from '../theme/monacoTheme'
import { useWorkspaceFile } from './useWorkspaceFile'
import { ensureWorkspaceLanguages, toMonacoLanguage } from './languages'
import { workspaceAudioBus } from './WorkspaceAudioBus'
import { useHighlighting } from '../monaco/useHighlighting'
import { registerEditor, unregisterEditor, applyPersistedEditorOptions } from './editorRegistry'
import { setEvalError, clearEvalErrors } from '../monaco/diagnostics'
import { addInlineViewZones } from '../visualizers/viewZones'
import { DEFAULT_VIZ_DESCRIPTORS } from '../visualizers/defaultDescriptors'
import type { EditorViewProps } from './types'
import type { AudioPayload } from './types'
import type { InlineZoneHandle } from '../visualizers/viewZones'
import type { HapStream } from '../engine/HapStream'

/**
 * Resolve the EditorView `theme` prop to the matching Monaco theme name.
 * A custom `StrudelTheme` object falls back to `stave-dark` — custom light
 * palettes should pass `'light'` explicitly to opt into the vs-base light
 * theme. Keeping this mapping in one place means `handleMonacoMount` and
 * the theme-change effect can't disagree.
 */
function monacoThemeNameFor(theme: EditorViewProps['theme']): string {
  return theme === 'light' ? 'stave-light' : 'stave-dark'
}

// `@monaco-editor/react`'s default export is typed loosely; we cast once
// and reuse. Mirrors the approach taken in the legacy `EditorGroup.tsx:5`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MonacoEditor = MonacoEditorRaw as any

/**
 * Fixed Monaco editor options shared across every `EditorView` instance.
 * Matches the legacy `EditorGroup.tsx:210-227` option set so the visual
 * experience is identical during the refactor cutover. Opening these up
 * to embedder customization is explicitly out of scope for Phase 10.2.
 */
const MONACO_OPTIONS = {
  fontSize: 13,
  lineHeight: 22,
  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
  fontLigatures: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
  automaticLayout: true,
  padding: { top: 8, bottom: 8 },
  scrollbar: {
    vertical: 'auto' as const,
    horizontal: 'auto' as const,
    useShadows: false,
  },
  lineNumbersMinChars: 3,
  glyphMargin: false,
  folding: false,
  renderLineHighlight: 'line' as const,
  cursorBlinking: 'smooth' as const,
  cursorSmoothCaretAnimation: 'on' as const,
}

export function EditorView({
  fileId,
  theme = 'dark',
  chromeSlot,
  onMount,
  error,
  onPlay,
  onStop,
}: EditorViewProps): React.ReactElement {
  const { file, setContent } = useWorkspaceFile(fileId)
  const containerRef = useRef<HTMLDivElement>(null)

  // Monaco instance refs — captured in onMount, used by bus wiring.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monacoRef = useRef<any>(null)

  // Inline view zone handle — owned by the bus subscription effect.
  const viewZoneHandleRef = useRef<InlineZoneHandle | null>(null)

  // HapStream from the bus payload — drives useHighlighting.
  const [hapStream, setHapStream] = useState<HapStream | null>(null)

  // Theme application — PV6 / PK6. Two layers that must stay in sync:
  //
  //   1. CSS vars on the container (chrome bars, backgrounds, borders).
  //      Applied via `applyTheme(containerRef, theme)`.
  //   2. Monaco's own theme (editor gutter, syntax highlighting, caret).
  //      Applied via `monaco.editor.setTheme('stave-dark' | 'stave-light')`.
  //
  // Missing #2 is why the editor surface renders white on a dark shell —
  // @monaco-editor/react defaults to the built-in `vs` theme when no
  // `theme` prop is passed to <MonacoEditor>. We don't pass it as a prop
  // because the mount handler registers the custom `stave-dark` /
  // `stave-light` theme and setTheme-switches between them, which
  // includes the custom syntax rules for Strudel + Sonic Pi tokens.
  useEffect(() => {
    if (!containerRef.current) return
    applyTheme(containerRef.current, theme)
  }, [theme])

  useEffect(() => {
    // Monaco may not be ready on the first render — the effect runs
    // after every theme change AND after mount (when monacoRef is set
    // inside handleMonacoMount). The guard keeps it a no-op until both
    // are available.
    const monaco = monacoRef.current
    if (!monaco?.editor?.setTheme) return
    monaco.editor.setTheme(monacoThemeNameFor(theme))
  }, [theme])

  // ----------------------------------------------------------------
  // Bus subscription — inline view zones + highlighting (D-08, PK3, S5)
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!fileId) return

    const unsub = workspaceAudioBus.subscribe(
      { kind: 'file', fileId },
      (payload: AudioPayload | null) => {
        // Drive highlighting via hapStream state.
        setHapStream(payload?.hapStream ?? null)

        if (
          payload?.inlineViz?.vizRequests?.size &&
          editorRef.current
        ) {
          // PK3: cleanup old zones BEFORE adding new ones.
          viewZoneHandleRef.current?.cleanup()
          // addInlineViewZones expects the nested EngineComponents shape
          // (queryable.trackSchedulers, audio.trackAnalysers, etc.).
          // The bus payload carries the full components via engineComponents.
          viewZoneHandleRef.current = addInlineViewZones(
            editorRef.current,
            payload.engineComponents ?? payload as any,
            DEFAULT_VIZ_DESCRIPTORS,
          )
          viewZoneHandleRef.current?.resume()
        } else if (payload === null) {
          // Runtime stopped — PK3: pause, NOT cleanup. Zones stay visible
          // but frozen so the user sees the last frame.
          viewZoneHandleRef.current?.pause()
        }
      },
    )

    return () => {
      unsub()
      viewZoneHandleRef.current?.cleanup()
      viewZoneHandleRef.current = null
    }
  }, [fileId])

  // Active highlighting (S5) — driven by hapStream from bus subscription.
  useHighlighting(editorRef.current, hapStream)

  // Unregister from the cross-file editor registry on unmount so
  // revealLineInFile doesn't reference a dead editor instance.
  useEffect(() => {
    return () => {
      if (editorRef.current) unregisterEditor(fileId, editorRef.current)
    }
  }, [fileId])

  // ----------------------------------------------------------------
  // Error diagnostics (S7) — driven by the `error` prop.
  // ----------------------------------------------------------------
  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return

    const model = editor.getModel?.()
    if (!model) return

    if (error) {
      setEvalError(monaco, model, error)
    } else {
      clearEvalErrors(monaco, model)
    }
  }, [error])

  // Stable refs for play/stop so Monaco actions always call the latest callback
  // without re-registering on every render.
  const onPlayRef = useRef(onPlay)
  onPlayRef.current = onPlay
  const onStopRef = useRef(onStop)
  onStopRef.current = onStop

  // Monaco mount handler. Registers workspace languages the first time
  // any EditorView mounts inside a given Monaco instance, then captures
  // refs for bus wiring, registers keyboard shortcuts, and forwards to
  // the caller's mount callback.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleMonacoMount = (editor: any, monaco: any): void => {
    editorRef.current = editor
    monacoRef.current = monaco
    registerEditor(fileId, editor)
    applyPersistedEditorOptions(editor)
    ensureWorkspaceLanguages(monaco)

    // Register the Stave Monaco theme (syntax rules + editor colors)
    // and activate the correct variant. Must happen BEFORE any model
    // renders so the first paint uses the right colors — `setTheme` is
    // applied globally to Monaco so any future editors pick it up too.
    // The theme-change effect above handles subsequent prop flips.
    if (monaco.editor?.defineTheme && monaco.editor?.setTheme) {
      defineStrudelMonacoTheme(monaco)
      monaco.editor.setTheme(monacoThemeNameFor(theme))
    }

    // Register Ctrl+Enter (play) and Ctrl+. (stop) — mirrors the legacy
    // LiveCodingEditor.tsx:266-281 keybindings. Uses refs so the actions
    // always call the latest callback without needing to re-register.
    // Guard: `monaco.KeyMod` may be undefined in test mocks.
    if (monaco.KeyMod && monaco.KeyCode && editor.addAction) {
      editor.addAction({
        id: 'stave.play',
        label: 'Play / Stop',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => onPlayRef.current?.(),
      })
      editor.addAction({
        id: 'stave.stop',
        label: 'Stop',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Period],
        run: () => onStopRef.current?.(),
      })
    }

    onMount?.(editor, monaco)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChange = (value: string | undefined): void => {
    if (value === undefined) return
    setContent(value)
  }

  return (
    <div
      ref={containerRef}
      data-workspace-view="editor"
      data-file-id={fileId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'var(--background)',
        color: 'var(--foreground)',
      }}
    >
      {chromeSlot ? (
        <div
          data-workspace-view-slot="chrome"
          style={{ flexShrink: 0 }}
        >
          {chromeSlot}
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {file ? (
          <MonacoEditor
            height="100%"
            language={toMonacoLanguage(file.language)}
            value={file.content}
            onChange={handleChange}
            onMount={handleMonacoMount}
            options={MONACO_OPTIONS}
          />
        ) : (
          <div
            data-workspace-view-state="loading"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--foreground-muted)',
              fontSize: 12,
            }}
          >
            Loading…
          </div>
        )}
      </div>
    </div>
  )
}
