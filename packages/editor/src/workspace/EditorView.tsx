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
import { useBreakpoints } from '../monaco/useBreakpoints'
import { registerEditor, unregisterEditor, applyPersistedEditorOptions, registerMonacoNamespace } from './editorRegistry'
import {
  setEvalError,
  clearEvalErrors,
  refreshStrudelLintMarkers,
  clearStrudelLintMarkers,
} from '../monaco/diagnostics'
import { addInlineViewZones } from '../visualizers/viewZones'
import { onNamedVizChanged } from '../visualizers/namedVizRegistry'
import { subscribeToZoneOverrides } from './WorkspaceFile'
import {
  getViewedContent,
  getViewedCommit,
  exitRuntimeView,
  subscribeToRuntimeView,
} from './history/historyViewing'
import { DEFAULT_VIZ_DESCRIPTORS } from '../visualizers/defaultDescriptors'
import type { EditorViewProps } from './types'
import type { AudioPayload } from './types'
import type { InlineZoneHandle } from '../visualizers/viewZones'
import type { HapStream } from '../engine/HapStream'
import type { BreakpointStore } from '../engine/BreakpointStore'

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
  glyphMargin: true,  // Phase 20-07 — gutter glyphs render breakpoint markers via useBreakpoints
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
  onEditViz,
  onCropViz,
}: EditorViewProps): React.ReactElement {
  const { file, setContent } = useWorkspaceFile(fileId)
  const containerRef = useRef<HTMLDivElement>(null)

  // #204 time-travel: when a commit is checked out, this editor shows that
  // commit's content for the current file (read-only) instead of live Y.Text.
  // Re-render on enter/exit. Falls back to live content for files absent at
  // the commit (getViewedContent → null).
  const [, forceViewTick] = useState(0)
  useEffect(() => subscribeToRuntimeView(() => forceViewTick((n) => n + 1)), [])
  const viewedContent = getViewedContent(fileId)
  const viewing = viewedContent !== null
  const viewedCommit = getViewedCommit()

  // Monaco instance refs — captured in onMount, used by bus wiring.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monacoRef = useRef<any>(null)

  // Inline view zone handle — owned by the bus subscription effect.
  const viewZoneHandleRef = useRef<InlineZoneHandle | null>(null)
  // Keep the last engine payload so we can remount viz zones when a
  // referenced viz preset is re-saved (hot reload).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastPayloadRef = useRef<any>(null)

  // HapStream from the bus payload — drives useHighlighting.
  const [hapStream, setHapStream] = useState<HapStream | null>(null)

  // Phase 20-07 — BreakpointStore + onResume from the bus payload —
  // drives useBreakpoints. Both null when no engine is publishing.
  const [breakpointStore, setBreakpointStore] = useState<BreakpointStore | null>(null)
  const [onResume, setOnResume] = useState<(() => void) | null>(null)

  // Flipped in `handleMonacoMount`; included in the bus-subscribe deps so a
  // split editor group re-subscribes AFTER `editorRef.current` is populated
  // — the re-subscribe's synchronous initial fire then redelivers any
  // in-flight payload. Fixes #22.
  const [editorReady, setEditorReady] = useState(false)

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
        // Phase 20-07 — drive breakpoint UI via the same bus subscription.
        setBreakpointStore(payload?.breakpointStore ?? null)
        // useState's functional setter would invoke the callback; wrap to
        // store the function as a value, not a state-update.
        setOnResume(() => payload?.onResume ?? null)
        lastPayloadRef.current = payload

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
            { onEdit: onEditViz, onCrop: onCropViz },
            fileId,
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
      lastPayloadRef.current = null
      viewZoneHandleRef.current?.cleanup()
      viewZoneHandleRef.current = null
    }
  }, [fileId, editorReady])

  // ----------------------------------------------------------------
  // Viz hot-reload — remount inline zones when a named viz preset
  // is re-saved. The registry fires `onNamedVizChanged` after
  // `registerPresetAsNamedViz`; we use the stored payload to
  // rebuild the zones with the fresh descriptor.
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!fileId) return
    const remount = () => {
      const payload = lastPayloadRef.current
      if (
        !payload?.inlineViz?.vizRequests?.size ||
        !editorRef.current
      ) return
      viewZoneHandleRef.current?.cleanup()
      viewZoneHandleRef.current = addInlineViewZones(
        editorRef.current,
        payload.engineComponents ?? payload,
        DEFAULT_VIZ_DESCRIPTORS,
        { onEdit: onEditViz, onCrop: onCropViz },
        fileId,
      )
      viewZoneHandleRef.current?.resume()
    }
    const unsubViz = onNamedVizChanged(remount)
    // Per-zone crop overrides live on the file's Y.Map — remount when any
    // override for this file changes so the zone picks up the new crop.
    const unsubOverrides = subscribeToZoneOverrides(fileId, remount)
    return () => {
      unsubViz()
      unsubOverrides()
    }
  }, [fileId])

  // Active highlighting (S5) — driven by hapStream from bus subscription.
  useHighlighting(editorRef.current, hapStream)

  // Phase 20-07 — Monaco gutter breakpoints. Reads BreakpointStore + onResume
  // from the bus payload (LiveCodingRuntime publishes when the engine
  // implements getBreakpointStore). Renders glyph decorations on store
  // changes; gutter-click toggles via snap.irNodeIdsByLine; "Debugger:
  // Resume" command registered when onResume is non-null.
  useBreakpoints(editorRef.current, breakpointStore, onResume ?? undefined)

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
    setEditorReady(true)
    registerEditor(fileId, editor)
    registerMonacoNamespace(monaco)
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

    // F-2 — refresh Strudel idiom lint markers on initial mount + every
    // subsequent content change. Scoped to strudel-language models; other
    // languages get a no-op (the lint regex doesn't match their syntax
    // anyway, but the explicit guard keeps the scan off-thread for
    // sonicpi / hydra / p5 buffers).
    const model = editor.getModel?.()
    if (model && model.getLanguageId?.() === 'strudel') {
      refreshStrudelLintMarkers(monaco, model)
      const lintListener = model.onDidChangeContent(() => {
        refreshStrudelLintMarkers(monaco, model)
      })
      model.onWillDispose(() => {
        try { lintListener?.dispose?.() } catch { /* swallow */ }
        clearStrudelLintMarkers(monaco, model)
      })
    }

    onMount?.(editor, monaco)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChange = (value: string | undefined): void => {
    if (value === undefined) return
    if (viewing) return // time-travel is read-only — never write Y.Text (#204)
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
        {viewing && (
          <div
            data-editor-timetravel-banner
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, zIndex: 6,
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '4px 10px', fontSize: 11,
              background: 'color-mix(in srgb, var(--accent, #6ea8fe) 22%, var(--background, #16161a))',
              color: 'var(--foreground, #e6e6ea)',
              borderBottom: '1px solid var(--accent, #6ea8fe)',
              fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
            }}
          >
            <span style={{ flex: 1 }}>
              ⏱ Viewing commit <strong>{(viewedCommit ?? '').slice(0, 7)}</strong> — read-only time-travel. Fork to edit here.
            </span>
            <button
              data-editor-timetravel-exit
              onClick={() => exitRuntimeView()}
              style={{
                background: 'var(--accent, #6ea8fe)', color: '#0b0b0f', border: 'none',
                borderRadius: 4, padding: '2px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600,
              }}
            >
              Exit
            </button>
          </div>
        )}
        {file ? (
          <MonacoEditor
            height="100%"
            language={toMonacoLanguage(file.language)}
            value={viewing ? (viewedContent as string) : file.content}
            onChange={handleChange}
            onMount={handleMonacoMount}
            options={viewing ? { ...MONACO_OPTIONS, readOnly: true } : MONACO_OPTIONS}
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
