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
import { findBuiltinExampleSource } from '../builtinExampleSources'
import {
  getVizLive,
  onVizLiveChange,
  toggleVizLive,
} from './vizLiveToggle'
import { rendererForLanguage } from '../vizLanguages'
import { StaveInputsPanel } from './StaveInputsPanel'
import { VizSettingsPopover, type VizPreviewMode } from './VizSettingsPopover'

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
  onClosePreview,
  onToggleBackground,
  isBackground,
  backdropOpacity,
  backdropQuality,
  backdropVizSpan,
  onSetBackdropOpacity,
  onSetBackdropQuality,
  onSetBackdropVizSpan,
  onCropBackdrop,
  onRevealBackdrop,
}: PreviewEditorChromeContext): React.ReactElement {
  // ⚙ viz-settings popover anchor (#773). Non-null while open; carries the
  // gear's bounding rect so the popover positions under it.
  const [settingsAnchor, setSettingsAnchor] = useState<DOMRect | null>(null)

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

  // Open the side-preview tab. Lazy-starts whichever built-in example source
  // the dropdown points to inside the click handler so the browser's autoplay
  // policy accepts the AudioContext creation. Idempotent — the shell's
  // onOpenPreview no-ops if a preview tab already exists.
  const openSidePreview = useCallback(() => {
    if (selectedSource.kind === 'file') {
      const builtin = findBuiltinExampleSource(selectedSource.fileId)
      if (builtin) builtin.startIfIdle()
    }
    onOpenPreview(selectedSource)
  }, [onOpenPreview, selectedSource])

  // Current preview placement (#773). Derived from the two shell flags so the
  // segmented control always mirrors reality: backdrop wins over a side preview
  // (a viz can't be both), then side, else off.
  const previewMode: VizPreviewMode = isBackground
    ? 'backdrop'
    : previewOpen
      ? 'side'
      : 'off'

  // Switch placement. Each transition tears down the old placement then sets up
  // the new one. onToggleBackground FLIPS based on current backdrop state, so
  // calling it when leaving 'backdrop' clears and when entering 'backdrop' sets.
  const handleSetPreviewMode = useCallback(
    (next: VizPreviewMode) => {
      if (next === previewMode) return
      if (previewMode === 'side') onClosePreview?.()
      if (previewMode === 'backdrop') onToggleBackground()
      if (next === 'side') openSidePreview()
      if (next === 'backdrop') onToggleBackground()
    },
    [previewMode, onClosePreview, onToggleBackground, openSidePreview],
  )

  // Primary button transport — rendered ONLY while a side preview is open
  // (#773). Pause/resume delegates to onTogglePausePreview; the shell owns the
  // built-in audio start/stop side effect that pairs with it.
  const buttonState: 'paused' | 'running' = previewPaused ? 'paused' : 'running'
  const buttonLabel = buttonState === 'paused' ? '\u25B6 Play' : '\u25A0 Stop'
  const buttonTitle =
    buttonState === 'paused'
      ? 'Resume preview rendering'
      : 'Pause preview rendering (tab stays open)'

  // The renderer kind drives the "Stave Inputs" reference panel (#309). Non-null
  // for every viz file; guard anyway so a non-viz tab never renders the panel.
  const vizKind = rendererForLanguage(file.language)

  return (
    <>
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
       * Primary transport — visible ONLY while a side preview is open (#773).
       * Opening a preview now happens through the ⚙ popover's preview=side
       * mode, so this button lost its "closed → open" role; it just pauses /
       * resumes the render loop. Stop freezes the canvas; the tab is closed by
       * its own ✕ button or the popover's preview=off.
       */}
      {previewOpen && (
        <button
          data-testid="viz-chrome-open-preview"
          data-button-state={buttonState}
          onClick={() => onTogglePausePreview?.()}
          title={buttonTitle}
          style={primaryBtnStyle}
        >
          {buttonLabel}
        </button>
      )}

      {/*
       * ⚙ viz settings (#773). One entry point for everything about this viz:
       * preview placement (off | side | backdrop), the backdrop controls when
       * it's the backdrop, and the audio source. Accent-filled while the
       * popover is open OR the viz is placed somewhere (side / backdrop).
       */}
      <button
        data-testid="viz-chrome-settings"
        data-settings-open={settingsAnchor ? 'true' : 'false'}
        data-preview-mode={previewMode}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          setSettingsAnchor((prev) => (prev ? null : rect))
        }}
        title="Viz settings — preview placement, backdrop, source"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 22,
          borderRadius: 3,
          fontSize: 13,
          fontFamily: 'inherit',
          cursor: 'pointer',
          userSelect: 'none',
          background:
            settingsAnchor || previewMode !== 'off'
              ? 'var(--accent-dim)'
              : 'none',
          color:
            settingsAnchor || previewMode !== 'off'
              ? 'var(--accent-strong, var(--accent))'
              : 'var(--foreground-muted)',
          border: `1px solid ${
            settingsAnchor || previewMode !== 'off'
              ? 'var(--accent-dim)'
              : 'var(--border)'
          }`,
        }}
      >
        {'\u2699'}
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

      <div style={{ flex: 1 }} />
    </div>

    {/* \u2699 viz settings popover (#773) \u2014 mounted while open. Owns the preview
        placement segment, backdrop controls, and the source dropdown that
        used to live inline on the chrome bar. */}
    {settingsAnchor && (
      <VizSettingsPopover
        anchorRect={settingsAnchor}
        onClose={() => setSettingsAnchor(null)}
        mode={previewMode}
        onSetMode={handleSetPreviewMode}
        backdropOpacity={backdropOpacity}
        backdropQuality={backdropQuality}
        backdropVizSpan={backdropVizSpan}
        onSetBackdropOpacity={onSetBackdropOpacity}
        onSetBackdropQuality={onSetBackdropQuality}
        onSetBackdropVizSpan={onSetBackdropVizSpan}
        onCropBackdrop={onCropBackdrop}
        onRevealBackdrop={onRevealBackdrop}
        sourceValue={refToString(selectedSource)}
        onSourceChange={handleSourceChange}
      />
    )}
    {vizKind && <StaveInputsPanel kind={vizKind} />}
    </>
  )
}
