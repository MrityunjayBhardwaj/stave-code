/**
 * VizEditorChrome — shared action bar for viz file editor tabs.
 *
 * Rendered into EditorView's chromeSlot for .hydra / .p5 files. Shows:
 * - Play/Stop toggle — primary action (opens/closes the preview canvas)
 * - File type badge
 * - Source dropdown — pin the preview to a specific audio publisher
 *   (pattern tab, sample sound, or follow-most-recent)
 * - Background toggle (discoverable Cmd+K B) — secondary action
 * - Hot-reload live indicator (static badge)
 * - Save button (Ctrl+S / Cmd+S)
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { PreviewEditorChromeContext } from '../PreviewProvider'
import type { AudioSourceRef } from '../types'
import { workspaceAudioBus } from '../WorkspaceAudioBus'
import {
  startSampleSound,
  stopSampleSound,
  isSampleSoundPlaying,
  SAMPLE_SOUND_SOURCE_ID,
  SAMPLE_SOUND_LABEL,
} from '../sampleSound'

const btnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: 3,
  color: 'var(--foreground-muted)',
  cursor: 'pointer',
  padding: '2px 8px',
  fontSize: 10,
  fontFamily: 'inherit',
}

/**
 * Primary action button style — matches the Play button on the pattern
 * runtime chrome (`strudelRuntime.tsx` StrudelChrome) so viz tabs and
 * pattern tabs have visually symmetric primary actions. Accent-colored
 * fill, white foreground, slightly larger padding than secondary buttons.
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

/**
 * String-encoded form of an `AudioSourceRef` for use as a `<select>`
 * option value. We need a string for the DOM, but we need to parse it
 * back into a ref object when the user changes the selection.
 *
 *   - `{ kind: 'default' }`          → `'default'`
 *   - `{ kind: 'none' }`             → `'none'`
 *   - `{ kind: 'file', fileId }`     → `'file:${fileId}'`
 *
 * The `file:` prefix is unambiguous because file ids never collide
 * with the two literal keywords above.
 */
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

export function VizEditorChrome({
  file,
  onOpenPreview,
  onToggleBackground,
  onSave,
  previewOpen,
}: PreviewEditorChromeContext): React.ReactElement {
  const ext = file.language === 'p5js' ? 'p5' : file.language
  const isOpen = previewOpen === true

  // The user's selected audio source for this viz tab. Defaults to
  // `'default'` (follow most recent publisher on the bus) so users who
  // don't care about pinning get the same behavior as before. Local
  // component state persists across re-renders because VizEditorChrome
  // stays mounted as long as the owning editor tab exists.
  const [selectedSource, setSelectedSource] = useState<AudioSourceRef>({
    kind: 'default',
  })

  // Force-rerender trigger for when the bus publisher set changes. The
  // dropdown options include every current publisher; without this
  // subscription, a new pattern file starting/stopping wouldn't update
  // the list until the chrome happened to re-render for another reason.
  const [, forceSourcesRerender] = useState(0)
  useEffect(() => {
    const unsub = workspaceAudioBus.onSourcesChanged(() => {
      forceSourcesRerender((n) => n + 1)
    })
    return unsub
  }, [])

  // Active (preview open) styling mirrors the pattern chrome's
  // "playing" state — transparent background with accent outline + text.
  // The two chromes (pattern vs viz) use the same visual language: filled
  // accent = "click to start", outlined = "click to stop."
  const stopBtnStyle: React.CSSProperties = {
    ...primaryBtnStyle,
    background: 'rgba(139,92,246,0.15)',
    color: 'var(--accent)',
    outline: '1px solid var(--accent)',
  }

  // Handle Play click — toggles the preview, passing the current source
  // selection so the new tab pins to the user's choice. Starts the
  // sample sound lazily if the user picked it and it isn't running yet;
  // the browser's autoplay policy requires this to happen inside the
  // click handler (user gesture), so we can't do it on selection change.
  const handlePlayClick = useCallback(() => {
    if (
      selectedSource.kind === 'file' &&
      selectedSource.fileId === SAMPLE_SOUND_SOURCE_ID &&
      !isSampleSoundPlaying()
    ) {
      startSampleSound()
    }
    onOpenPreview(selectedSource)
  }, [onOpenPreview, selectedSource])

  // Build the list of available audio sources. Order:
  //   1. Default (follow most recent)
  //   2. Sample sound — always shown so the user can test without a
  //      real pattern playing
  //   3. Every current bus publisher (file: entries from listSources)
  //      EXCEPT the sample sound itself (it's already above)
  //   4. None (demo mode)
  // The bus's listSources is read on every render — fresh values each
  // time, no stale cache.
  const busSources = workspaceAudioBus.listSources()
  const patternSources = busSources.filter(
    (s) => s.sourceId !== SAMPLE_SOUND_SOURCE_ID,
  )

  // Handle source selection change. Parses the string into a ref and
  // stores it; if the user selected "sample sound", we DON'T start it
  // here — we wait until Play is clicked because browser autoplay
  // policy rejects AudioContext creation outside of a user gesture on
  // a clickable element, and a <select> change event does count but
  // it's safer to defer.
  const handleSourceChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSelectedSource(stringToRef(e.target.value))
    },
    [],
  )

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
       * Play ↔ Stop toggle. Both states invoke `onOpenPreview(selected)`.
       * The shell's fallback chrome wires this as a toggle — opens a
       * preview tab pinned to the selected source if none exists, closes
       * it otherwise. The shell computes `previewOpen` by scanning every
       * group for a preview tab matching this file id, so drag-dropping
       * the preview or opening it in a popout keeps the chrome in sync
       * without any explicit state threading.
       */}
      <button
        data-testid="viz-chrome-play"
        data-preview-open={isOpen ? 'true' : 'false'}
        onClick={handlePlayClick}
        title={
          isOpen
            ? 'Stop — close preview (Cmd+K V)'
            : 'Play — open preview to side (Cmd+K V)'
        }
        style={isOpen ? stopBtnStyle : primaryBtnStyle}
      >
        {isOpen ? '\u25A0 Stop' : '\u25B6 Play'}
      </button>

      {/* File type badge */}
      <span
        style={{
          background: 'rgba(117,186,255,0.1)',
          color: '#75baff',
          padding: '1px 6px',
          borderRadius: 3,
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {ext}
      </span>

      <div style={{ width: 1, height: 14, background: 'var(--border)' }} />

      {/*
       * Audio source dropdown (Issue #4b). Lets the user pick the
       * publisher the new preview tab will subscribe to:
       *   - Default: follow the most-recently-started publisher
       *   - Sample sound: a test oscillator with LFO-modulated pitch
       *     (starts lazily on first Play click — see handlePlayClick)
       *   - Any pattern file currently publishing on the bus
       *   - None: demo mode (null audioSource, each renderer's fallback)
       *
       * Stored in local state so the selection persists while the user
       * stays on this viz tab. Re-renders when the bus's source set
       * changes (subscribed above) so pattern starts/stops reflect
       * immediately.
       */}
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
        <option value={`file:${SAMPLE_SOUND_SOURCE_ID}`}>
          {SAMPLE_SOUND_LABEL}
        </option>
        {patternSources.length > 0 && (
          <optgroup label="playing patterns">
            {patternSources.map((source) => (
              <option
                key={source.sourceId}
                value={`file:${source.sourceId}`}
              >
                {source.playing ? '\u25CF ' : '\u25CB '}
                {source.label}
              </option>
            ))}
          </optgroup>
        )}
        <option value="none">none (demo mode)</option>
      </select>

      <div style={{ width: 1, height: 14, background: 'var(--border)' }} />

      {/* Background toggle (Cmd+K B equivalent) — secondary action */}
      <button
        data-testid="viz-chrome-background"
        onClick={onToggleBackground}
        title="Toggle background preview (Cmd+K B)"
        style={btnStyle}
      >
        {'\u25A2'} Background
      </button>

      <div style={{ flex: 1 }} />

      {/*
       * Hot reload: static "live" badge.
       *
       * The viz provider's `reload` policy drives auto-recompile cadence
       * (debounced 300ms for HYDRA/P5 — see workspace/preview/hydraViz.tsx
       * and p5Viz.tsx). A per-tab toggle would require threading state
       * through PreviewView's reload effect — out of Phase 10.2 scope.
       * This stays as an indicator, not a control.
       */}
      <span
        data-testid="viz-chrome-live-indicator"
        title="Hot reload is on — preview updates as you type"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 3,
          fontSize: 10,
          fontFamily: 'inherit',
          background: 'rgba(196, 181, 253, 0.12)',
          color: '#c4b5fd',
          border: '1px solid rgba(196, 181, 253, 0.25)',
          userSelect: 'none',
        }}
      >
        {'\u27F3'} live
      </span>

      {/* Save (Cmd+S equivalent) */}
      <button
        onClick={onSave}
        title="Save (Cmd+S)"
        style={btnStyle}
      >
        {'\u2318'}S
      </button>
    </div>
  )
}
