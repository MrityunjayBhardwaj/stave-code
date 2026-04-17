/**
 * VizEditorChrome — shared action bar for viz file editor tabs.
 *
 * Rendered into EditorView's chromeSlot for .hydra / .p5 files. Shows:
 * - "Open Preview" button — primary action, idempotent (open if missing,
 *   no-op if a preview already exists for this file anywhere in the shell)
 * - File type badge
 * - Source dropdown — pin the preview to a specific audio publisher
 *   (pattern tab, sample sound, or follow-most-recent)
 * - Background toggle (discoverable Cmd+K B) — secondary action
 * - Hot-reload live indicator (static badge)
 * - Save button (Ctrl+S / Cmd+S)
 *
 * Viz tabs intentionally do NOT have a Stop button. A viz file is a
 * persistent editing surface, not a transport; the preview is closed
 * by the tab's ✕ button when the user is done with it. Pattern tabs
 * keep their own Play/Stop (real audio transport) via StrudelChrome.
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { PreviewEditorChromeContext } from '../PreviewProvider'
import type { AudioSourceRef } from '../types'
import { workspaceAudioBus } from '../WorkspaceAudioBus'
import {
  BUILTIN_EXAMPLE_SOURCES,
  BUILTIN_SOURCE_IDS,
  findBuiltinExampleSource,
} from '../builtinExampleSources'
import {
  getVizLive,
  onVizLiveChange,
  toggleVizLive,
} from './vizLiveToggle'

function refToString(ref: AudioSourceRef): string {
  if (ref.kind === 'default') return 'default'
  if (ref.kind === 'none') return 'none'
  return `file:${ref.fileId}`
}

function stringToRef(value: string): AudioSourceRef {
  if (value === 'default') return { kind: 'default' }
  if (value === 'none') return { kind: 'none' }
  if (value.startsWith('file:')) {
    return { kind: 'file', fileId: value.slice('file:'.length) }
  }
  return { kind: 'default' }
}

/**
 * Primary action button style — matches the Play button on the pattern
 * runtime chrome (`strudelRuntime.tsx` StrudelChrome) so viz tabs and
 * pattern tabs have visually symmetric primary actions.
 */
const primaryBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 10px',
  borderRadius: 4,
  border: 'none',
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
  background: 'var(--accent)',
  color: '#fff',
}

export function VizEditorChrome({
  file,
  onOpenPreview,
  previewOpen,
  previewPaused,
  onTogglePausePreview,
  onChangePreviewSource,
  onToggleBackground,
  isBackground,
}: PreviewEditorChromeContext): React.ReactElement {
  // Subscribe to the per-file hot-reload toggle so other surfaces
  // (command palette, future settings) stay in sync with the button.
  const [liveOn, setLiveOn] = useState<boolean>(() => getVizLive(file.id))
  useEffect(() => {
    setLiveOn(getVizLive(file.id))
    return onVizLiveChange(file.id, setLiveOn)
  }, [file.id])

  // Per-tab source pin. Default is "follow most recent" so users who
  // don't care still see the latest publisher on the bus. Built-in
  // examples are restored to the dropdown so the viz can be tested
  // without a pattern file currently playing.
  const [selectedSource, setSelectedSource] = useState<AudioSourceRef>({
    kind: 'default',
  })

  // The bus's source set changes when patterns start/stop. Re-render
  // the dropdown options when that happens so newly-running patterns
  // appear without waiting for an unrelated trigger.
  const [, forceSourcesRerender] = useState(0)
  useEffect(() => {
    return workspaceAudioBus.onSourcesChanged(() => {
      forceSourcesRerender((n) => n + 1)
    })
  }, [])

  const handleSourceChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const next = stringToRef(e.target.value)
      const prevBuiltin =
        selectedSource.kind === 'file'
          ? findBuiltinExampleSource(selectedSource.fileId)
          : undefined
      const nextBuiltin =
        next.kind === 'file'
          ? findBuiltinExampleSource(next.fileId)
          : undefined
      setSelectedSource(next)
      if (previewOpen && onChangePreviewSource) {
        if (nextBuiltin && !previewPaused) {
          nextBuiltin.startIfIdle()
        }
        if (prevBuiltin && prevBuiltin !== nextBuiltin) {
          prevBuiltin.stopIfRunning()
        }
        onChangePreviewSource(next)
      }
    },
    [previewOpen, previewPaused, onChangePreviewSource, selectedSource],
  )

  // Primary-button click handler. Three states drive the behavior:
  //
  //   (1) Preview closed         → open it (idempotent).
  //   (2) Preview open & playing → pause renderer (Stop click).
  //                                ALSO stop the audio source if
  //                                it's a built-in example. Pattern
  //                                runtimes keep playing — they're
  //                                owned by their own pattern tab.
  //   (3) Preview open & paused  → resume renderer (Play click).
  //                                ALSO restart the audio source if
  //                                it's a built-in example that we
  //                                stopped on the previous Stop click,
  //                                so Play actually returns the user
  //                                to "what they had before Stop."
  //
  // In state (1) we also lazy-start whichever built-in example
  // source the dropdown selection points to (sample sound, drum
  // pattern, chord progression), inside this click handler so the
  // browser's autoplay policy accepts the AudioContext creation.
  // In states (2)/(3) we delegate to `onTogglePausePreview` which
  // the shell wires to its `pausedPreviews` state, then handle the
  // built-in audio start/stop side effect locally — the chrome is
  // the only place that knows the dropdown selection, so it has
  // to own the audio side effect.
  const handlePrimaryButtonClick = useCallback(() => {
    if (previewOpen && onTogglePausePreview) {
      onTogglePausePreview()
      return
    }
    if (selectedSource.kind === 'file') {
      const builtin = findBuiltinExampleSource(selectedSource.fileId)
      if (builtin) builtin.startIfIdle()
    }
    onOpenPreview(selectedSource)
  }, [onOpenPreview, onTogglePausePreview, previewOpen, selectedSource])

  // Derive the button's visual state from the two flags. The
  // three label/title combinations map 1:1 to the three states
  // above — keeping the derivation in one place avoids drift
  // between the label, the title, and the click handler.
  const buttonState: 'closed' | 'paused' | 'running' =
    !previewOpen ? 'closed' : previewPaused ? 'paused' : 'running'
  const buttonLabel =
    buttonState === 'closed'
      ? '\u25B6 Preview'
      : buttonState === 'paused'
        ? '\u25B6 Play'
        : '\u25A0 Stop'
  const buttonTitle =
    buttonState === 'closed'
      ? 'Open preview to side (Cmd+K V)'
      : buttonState === 'paused'
        ? 'Resume preview rendering'
        : 'Pause preview rendering (tab stays open)'

  return (
    <div
      data-workspace-chrome="viz"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 40,
        padding: '0 12px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        fontSize: 11,
        flexShrink: 0,
      }}
    >
      {/*
       * Primary action — three states:
       *   - closed  → "▶ Preview" opens a new preview tab
       *   - running → "■ Stop"    pauses the render loop
       *   - paused  → "▶ Play"    resumes the render loop
       *
       * The preview tab is ONLY closed by its own ✕ button — Stop
       * does not destroy the tab, it only freezes the canvas.
       * A viz file is a persistent editing surface, not a
       * transport.
       */}
      <button
        data-testid="viz-chrome-open-preview"
        data-button-state={buttonState}
        onClick={handlePrimaryButtonClick}
        title={buttonTitle}
        style={primaryBtnStyle}
      >
        {buttonLabel}
      </button>

      <label
        htmlFor={`viz-chrome-source-${file.id}`}
        style={{ color: 'var(--foreground-muted)', fontSize: 10 }}
      >
        source:
      </label>
      <select
        id={`viz-chrome-source-${file.id}`}
        data-testid="viz-chrome-source"
        value={refToString(selectedSource)}
        onChange={handleSourceChange}
        style={{
          background: 'var(--surface-elevated)',
          color: 'var(--foreground)',
          border: '1px solid var(--border)',
          borderRadius: 3,
          padding: '2px 6px',
          fontSize: 10,
          fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        <option value="default">default (follow most recent)</option>
        <optgroup label="built-in examples">
          {BUILTIN_EXAMPLE_SOURCES.map((src) => (
            <option key={src.sourceId} value={`file:${src.sourceId}`}>
              {src.label}
            </option>
          ))}
        </optgroup>
        {(() => {
          const patternSources = workspaceAudioBus
            .listSources()
            .filter((s) => !BUILTIN_SOURCE_IDS.has(s.sourceId))
          if (patternSources.length === 0) return null
          return (
            <optgroup label="playing patterns">
              {patternSources.map((source) => (
                <option key={source.sourceId} value={`file:${source.sourceId}`}>
                  {source.playing ? '\u25CF ' : '\u25CB '}
                  {source.label}
                </option>
              ))}
            </optgroup>
          )
        })()}
        <option value="none">none (demo mode)</option>
      </select>

      <div style={{ flex: 1 }} />

      {/*
       * Set-as-Background toggle. Pins / unpins this viz file as the
       * active group's backdrop. Mirrors the Cmd+K B keybind but is
       * discoverable without keyboard muscle memory. Active (accent-
       * filled) when this file IS the group's backdrop; inactive
       * (outline) otherwise.
       */}
      <button
        data-testid="viz-chrome-bg-toggle"
        data-bg-mode={isBackground ? 'on' : 'off'}
        onClick={onToggleBackground}
        title={
          isBackground
            ? 'This file is the group backdrop — click to clear (Cmd+K B)'
            : 'Set as background for this group (Cmd+K B)'
        }
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          borderRadius: 3,
          fontSize: 10,
          fontFamily: 'inherit',
          cursor: 'pointer',
          userSelect: 'none',
          background: isBackground ? 'var(--accent-dim)' : 'none',
          color: isBackground
            ? 'var(--accent-strong, var(--accent))'
            : 'var(--foreground-muted)',
          border: `1px solid ${
            isBackground ? 'var(--accent-dim)' : 'var(--border)'
          }`,
        }}
      >
        {isBackground ? '\u25A0 bg' : '\u25A0'}
      </button>

      {/*
       * Hot reload: togglable badge. On → preview rebuilds on every
       * debounced content change (default). Off → the preview is
       * frozen on its last compiled state; the user can keep editing
       * without seeing intermediate frames. PreviewView observes the
       * per-file flag and short-circuits its reload effect.
       */}
      <button
        data-testid="viz-chrome-live-toggle"
        data-live-mode={liveOn ? 'on' : 'off'}
        onClick={() => toggleVizLive(file.id)}
        title={
          liveOn
            ? 'Live mode ON — preview re-renders on edit'
            : 'Live mode OFF — click to resume live updates'
        }
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          borderRadius: 3,
          fontSize: 10,
          fontFamily: 'inherit',
          cursor: 'pointer',
          userSelect: 'none',
          background: liveOn ? 'var(--accent-dim)' : 'none',
          color: liveOn
            ? 'var(--accent-strong, var(--accent))'
            : 'var(--foreground-muted)',
          border: `1px solid ${liveOn ? 'var(--accent-dim)' : 'var(--border)'}`,
        }}
      >
        {liveOn ? '\u27F3 live' : '\u27F3'}
      </button>
    </div>
  )
}
