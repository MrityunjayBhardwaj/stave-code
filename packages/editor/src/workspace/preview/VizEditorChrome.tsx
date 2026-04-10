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
  startSampleSound,
  isSampleSoundPlaying,
  SAMPLE_SOUND_SOURCE_ID,
  SAMPLE_SOUND_LABEL,
} from '../sampleSound'
import {
  startDrumPattern,
  isDrumPatternPlaying,
  DRUM_PATTERN_SOURCE_ID,
  DRUM_PATTERN_LABEL,
} from '../drumPattern'
import {
  startChordProgression,
  isChordProgressionPlaying,
  CHORD_PROGRESSION_SOURCE_ID,
  CHORD_PROGRESSION_LABEL,
} from '../chordProgression'

/**
 * Registry of built-in example audio sources. Each entry describes
 * a source that's always available in the chrome's source dropdown
 * alongside user-published patterns. Keeping this as a data-driven
 * list (rather than three hardcoded `<option>` branches in JSX)
 * makes it trivial to add more examples later — just append an
 * entry and the dropdown picks it up automatically.
 *
 * `startIfIdle` is the click-handler side effect: lazy-start the
 * source if it isn't running yet. Called from inside the Play click
 * handler so the browser's autoplay policy accepts the
 * AudioContext creation (which needs a user gesture).
 */
interface BuiltinExampleSource {
  readonly sourceId: string
  readonly label: string
  readonly startIfIdle: () => void
}

const BUILTIN_EXAMPLE_SOURCES: readonly BuiltinExampleSource[] = [
  {
    sourceId: SAMPLE_SOUND_SOURCE_ID,
    label: SAMPLE_SOUND_LABEL,
    startIfIdle: () => {
      if (!isSampleSoundPlaying()) startSampleSound()
    },
  },
  {
    sourceId: DRUM_PATTERN_SOURCE_ID,
    label: DRUM_PATTERN_LABEL,
    startIfIdle: () => {
      if (!isDrumPatternPlaying()) startDrumPattern()
    },
  },
  {
    sourceId: CHORD_PROGRESSION_SOURCE_ID,
    label: CHORD_PROGRESSION_LABEL,
    startIfIdle: () => {
      if (!isChordProgressionPlaying()) startChordProgression()
    },
  },
]

const BUILTIN_SOURCE_IDS = new Set(
  BUILTIN_EXAMPLE_SOURCES.map((s) => s.sourceId),
)

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
  previewPaused,
  onTogglePausePreview,
  onChangePreviewSource,
}: PreviewEditorChromeContext): React.ReactElement {
  const ext = file.language === 'p5js' ? 'p5' : file.language

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

  // Primary-button click handler. Three states drive the behavior:
  //
  //   (1) Preview closed         → open it (idempotent).
  //   (2) Preview open & playing → pause renderer (Stop click).
  //   (3) Preview open & paused  → resume renderer (Play click).
  //
  // In state (1) we also lazy-start whichever built-in example
  // source the dropdown selection points to (sample sound, drum
  // pattern, chord progression), inside this click handler so the
  // browser's autoplay policy accepts the AudioContext creation.
  // In states (2)/(3) we delegate to `onTogglePausePreview` which
  // the shell wires to its `pausedPreviews` state.
  const handlePrimaryButtonClick = useCallback(() => {
    if (previewOpen && onTogglePausePreview) {
      onTogglePausePreview()
      return
    }
    if (selectedSource.kind === 'file') {
      const builtin = BUILTIN_EXAMPLE_SOURCES.find(
        (s) =>
          selectedSource.kind === 'file' &&
          s.sourceId === selectedSource.fileId,
      )
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

  // Build the list of available audio sources. Order:
  //   1. Default (follow most recent)
  //   2. Built-in example sources (sample sound + prebaked schedulers)
  //      — always shown so users can test without a real pattern
  //   3. Every current bus publisher (file: entries from listSources)
  //      EXCEPT the built-in example ids (they're already rendered above)
  //   4. None (demo mode)
  // The bus's listSources is read on every render — fresh values each
  // time, no stale cache.
  const busSources = workspaceAudioBus.listSources()
  const patternSources = busSources.filter(
    (s) => !BUILTIN_SOURCE_IDS.has(s.sourceId),
  )

  // Handle source selection change. Parses the string into a ref
  // and stores it in the chrome's local state. If a preview is
  // ALREADY open for this file AND the shell supplied an
  // `onChangePreviewSource` handler, we also dispatch the new ref
  // so the live preview tab swaps its source without the user
  // having to close and reopen it.
  //
  // When the new source is a built-in example (sample sound, drum
  // pattern, chord progression) we lazy-start it here — the
  // `<select>` change event IS a user gesture as far as browser
  // autoplay policy is concerned, so this is safe.
  const handleSourceChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const ref = stringToRef(e.target.value)
      setSelectedSource(ref)
      if (previewOpen && onChangePreviewSource) {
        if (ref.kind === 'file') {
          const builtin = BUILTIN_EXAMPLE_SOURCES.find(
            (s) => s.sourceId === ref.fileId,
          )
          if (builtin) builtin.startIfIdle()
        }
        onChangePreviewSource(ref)
      }
    },
    [previewOpen, onChangePreviewSource],
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
        <optgroup label="built-in examples">
          {BUILTIN_EXAMPLE_SOURCES.map((src) => (
            <option
              key={src.sourceId}
              value={`file:${src.sourceId}`}
            >
              {src.label}
            </option>
          ))}
        </optgroup>
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
