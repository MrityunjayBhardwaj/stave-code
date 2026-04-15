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
import {
  getVizLive,
  onVizLiveChange,
  toggleVizLive,
} from './vizLiveToggle'

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
}: PreviewEditorChromeContext): React.ReactElement {
  // Subscribe to the per-file hot-reload toggle so other surfaces
  // (command palette, future settings) stay in sync with the button.
  const [liveOn, setLiveOn] = useState<boolean>(() => getVizLive(file.id))
  useEffect(() => {
    setLiveOn(getVizLive(file.id))
    return onVizLiveChange(file.id, setLiveOn)
  }, [file.id])
  // The source selector chrome was removed, so we always open a preview
  // with the default ref (follow most recent publisher). Kept as a local
  // so future bring-back of a source picker stays cheap.
  const selectedSource = { kind: 'default' as const }

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
      // Stop / Play click — flip the renderer pause state. The
      // shell-side `onTogglePausePreview` handler ALSO dispatches
      // built-in audio start/stop using the OPEN PREVIEW TAB's
      // sourceRef as the source of truth — NOT this chrome's
      // local `selectedSource` state. The chrome can be unmounted
      // and remounted whenever the layout shape changes (e.g.,
      // splitting from one group to two), which wipes
      // `selectedSource` back to default. The shell's preview-
      // tab sourceRef survives such remounts because it's stored
      // in the shell's `groups` map, not in component state. See
      // `WorkspaceShell.handleTogglePausePreview` for the audio
      // dispatch.
      onTogglePausePreview()
      return
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

      <div style={{ flex: 1 }} />

      {/*
       * Hot reload: togglable badge. On → preview rebuilds on every
       * debounced content change (default). Off → the preview is
       * frozen on its last compiled state; the user can keep editing
       * without seeing intermediate frames. PreviewView observes the
       * per-file flag and short-circuits its reload effect.
       */}
      <button
        data-testid="viz-chrome-live-toggle"
        data-live={liveOn ? 'on' : 'off'}
        onClick={() => toggleVizLive(file.id)}
        title={
          liveOn
            ? 'Hot reload is ON — click to freeze preview updates'
            : 'Hot reload is OFF — click to resume live updates'
        }
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 3,
          fontSize: 10,
          fontFamily: 'inherit',
          background: liveOn ? 'var(--accent-dim)' : 'transparent',
          color: liveOn
            ? 'var(--accent-strong, var(--accent))'
            : 'var(--foreground-muted)',
          border: `1px solid ${liveOn ? 'var(--accent-dim)' : 'var(--border)'}`,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {liveOn ? '\u27F3 live' : '\u2225 frozen'}
      </button>
    </div>
  )
}
