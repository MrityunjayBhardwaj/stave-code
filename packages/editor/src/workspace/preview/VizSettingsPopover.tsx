/**
 * VizSettingsPopover — single control surface for a viz file (#773).
 *
 * Opened by the ⚙ gear in VizEditorChrome. Consolidates what used to be a
 * scattered row of chrome controls into one popover:
 *
 *   - preview: [ off | side | backdrop ] — a 3-way segmented control that is
 *     the single source of truth for WHERE this viz renders. 'off' = no
 *     preview; 'side' = a sibling split tab; 'backdrop' = behind the editor.
 *   - backdrop controls (only when mode === 'backdrop'): opacity, quality,
 *     crop, reveal, viz-span. Same capabilities the old BackdropPopover had.
 *   - source: which audio publisher the preview subscribes to.
 *
 * Follows the VS Code status-bar-item-click-opens-menu pattern (mirrors
 * BackdropPopover.tsx): closes on outside click or Escape, deferring the
 * outside-click listener one tick so the opening click doesn't self-close.
 */

import React, { useEffect, useRef, useState } from 'react'
import type { AudioSourceRef } from '../types'
import type { BackdropQuality, BackdropVizSpan } from '../editorRegistry'
import { workspaceAudioBus } from '../WorkspaceAudioBus'
import {
  BUILTIN_EXAMPLE_SOURCES,
  BUILTIN_SOURCE_IDS,
} from '../builtinExampleSources'

export type VizPreviewMode = 'off' | 'side' | 'backdrop'

interface Props {
  anchorRect: DOMRect
  onClose: () => void

  /** Current placement of this viz's preview. */
  mode: VizPreviewMode
  /** Switch placement. The chrome orchestrates open/close + backdrop toggle. */
  onSetMode: (mode: VizPreviewMode) => void

  /**
   * Backdrop controls — meaningful only when mode === 'backdrop'. Each is
   * optional; a missing value/setter hides that control (e.g. crop/reveal
   * when the host doesn't wire them).
   */
  backdropOpacity?: number
  backdropQuality?: BackdropQuality
  backdropVizSpan?: BackdropVizSpan
  onSetBackdropOpacity?: (opacity: number) => void
  onSetBackdropQuality?: (quality: BackdropQuality) => void
  onSetBackdropVizSpan?: (span: BackdropVizSpan) => void
  onCropBackdrop?: () => void
  onRevealBackdrop?: () => void

  /** Source dropdown — value string (refToString) + change handler. */
  sourceValue: string
  onSourceChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
}

const MODES: { key: VizPreviewMode; label: string }[] = [
  { key: 'off', label: 'off' },
  { key: 'side', label: 'side' },
  { key: 'backdrop', label: 'backdrop' },
]

export function VizSettingsPopover(props: Props): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape. Defer the outside-click attach one tick
  // so the click that opened the popover doesn't immediately close it.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) props.onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [props])

  // The bus's source set changes when patterns start/stop. Re-render the
  // dropdown options while the popover is open so newly-running patterns show.
  const [, forceSourcesRerender] = useState(0)
  useEffect(
    () =>
      workspaceAudioBus.onSourcesChanged(() =>
        forceSourcesRerender((n) => n + 1),
      ),
    [],
  )

  // Position below the gear, left-aligned to its left edge, clamped so a
  // button near the right edge doesn't push the popover off-screen.
  const left = Math.max(
    8,
    Math.min(window.innerWidth - 8 - POPOVER_WIDTH, props.anchorRect.left),
  )
  const top = props.anchorRect.bottom + 6

  // #782 — backdrop controls are ALWAYS rendered so the popover surfaces the
  // viz's full capability in one place; they're disabled/greyed until this viz
  // is actually the backdrop, since opacity/crop/span only apply to one.
  const bdEnabled = props.mode === 'backdrop'
  const patternSources = workspaceAudioBus
    .listSources()
    .filter((s) => !BUILTIN_SOURCE_IDS.has(s.sourceId))

  return (
    <div
      ref={ref}
      data-testid="viz-settings-popover"
      data-mode={props.mode}
      style={{
        position: 'fixed',
        left,
        top,
        width: POPOVER_WIDTH,
        background: 'var(--bg-elevated, var(--surface))',
        border: '1px solid var(--border-strong, var(--border))',
        borderRadius: 6,
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.45)',
        zIndex: 16000,
        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
        fontSize: 11,
        padding: 0,
      }}
    >
      {/* Preview placement — the single source of truth. */}
      <Row label="preview">
        <div
          data-testid="viz-preview-mode"
          role="radiogroup"
          style={{ display: 'flex', flex: 1, gap: 4 }}
        >
          {MODES.map((m) => {
            const active = props.mode === m.key
            return (
              <button
                key={m.key}
                data-testid={`viz-preview-mode-${m.key}`}
                data-active={active ? 'true' : 'false'}
                role="radio"
                aria-checked={active}
                onClick={() => props.onSetMode(m.key)}
                style={{
                  flex: 1,
                  padding: '4px 0',
                  borderRadius: 3,
                  fontSize: 10,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  userSelect: 'none',
                  textTransform: 'none',
                  background: active ? 'var(--accent-dim)' : 'none',
                  color: active
                    ? 'var(--accent-strong, var(--accent))'
                    : 'var(--foreground-muted)',
                  border: `1px solid ${
                    active ? 'var(--accent-dim)' : 'var(--border)'
                  }`,
                }}
              >
                {m.label}
              </button>
            )
          })}
        </div>
      </Row>

      {/* Backdrop controls (#782) — always rendered; disabled + greyed until
          preview=backdrop so the popover shows the full capability up front. */}
      <div style={divider} />

      {props.backdropOpacity != null && props.onSetBackdropOpacity && (
        <Row label="opacity">
          <input
            data-testid="viz-settings-opacity"
            data-disabled={bdEnabled ? 'false' : 'true'}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={props.backdropOpacity}
            disabled={!bdEnabled}
            onChange={(e) =>
              props.onSetBackdropOpacity!(Number(e.target.value))
            }
            style={{
              flex: 1,
              accentColor: 'var(--accent-strong, var(--accent))',
              opacity: bdEnabled ? 1 : 0.4,
              cursor: bdEnabled ? 'pointer' : 'not-allowed',
            }}
          />
          <span style={{ ...valueStyle, opacity: bdEnabled ? 1 : 0.4 }}>
            {Math.round(props.backdropOpacity * 100)}%
          </span>
        </Row>
      )}

      {props.backdropQuality != null && props.onSetBackdropQuality && (
        <Row label="quality">
          <select
            data-testid="viz-settings-quality"
            data-disabled={bdEnabled ? 'false' : 'true'}
            value={props.backdropQuality}
            disabled={!bdEnabled}
            onChange={(e) =>
              props.onSetBackdropQuality!(e.target.value as BackdropQuality)
            }
            style={{ ...selectStyle, opacity: bdEnabled ? 1 : 0.4, cursor: bdEnabled ? 'pointer' : 'not-allowed' }}
          >
            <option value="full">Full</option>
            <option value="half">Half</option>
            <option value="quarter">Quarter</option>
          </select>
        </Row>
      )}

      {(props.onCropBackdrop || props.onRevealBackdrop) && (
        <>
          <div style={divider} />
          <div style={{ display: 'flex', flexDirection: 'column', padding: '6px 0' }}>
            {props.onCropBackdrop && (
              <button
                data-testid="viz-settings-crop"
                data-disabled={bdEnabled ? 'false' : 'true'}
                disabled={!bdEnabled}
                onClick={() => {
                  props.onCropBackdrop!()
                  props.onClose()
                }}
                style={{ ...actionBtnStyle, opacity: bdEnabled ? 1 : 0.4, cursor: bdEnabled ? 'pointer' : 'not-allowed' }}
              >
                <span aria-hidden="true">⬚</span> crop…
              </button>
            )}
            {props.onRevealBackdrop && (
              <button
                data-testid="viz-settings-reveal"
                data-disabled={bdEnabled ? 'false' : 'true'}
                disabled={!bdEnabled}
                onClick={() => {
                  props.onRevealBackdrop!()
                  props.onClose()
                }}
                style={{ ...actionBtnStyle, opacity: bdEnabled ? 1 : 0.4, cursor: bdEnabled ? 'pointer' : 'not-allowed' }}
              >
                → reveal in editor
              </button>
            )}
          </div>
        </>
      )}

      {props.backdropVizSpan != null && props.onSetBackdropVizSpan && (
        <>
          <div style={divider} />
          <Row label="viz span">
            <select
              data-testid="viz-settings-vizspan"
              data-disabled={bdEnabled ? 'false' : 'true'}
              value={props.backdropVizSpan}
              disabled={!bdEnabled}
              onChange={(e) =>
                props.onSetBackdropVizSpan!(e.target.value as BackdropVizSpan)
              }
              style={{ ...selectStyle, opacity: bdEnabled ? 1 : 0.4, cursor: bdEnabled ? 'pointer' : 'not-allowed' }}
            >
              <option value="file">File</option>
              <option value="workspace">Workspace</option>
            </select>
          </Row>
        </>
      )}

      <div style={divider} />

      {/* Source — which audio publisher the preview subscribes to. */}
      <Row label="source">
        <select
          data-testid="viz-chrome-source"
          value={props.sourceValue}
          onChange={props.onSourceChange}
          style={selectStyle}
        >
          <option value="default">default (follow most recent)</option>
          <optgroup label="built-in examples">
            {BUILTIN_EXAMPLE_SOURCES.map((src) => (
              <option key={src.sourceId} value={`file:${src.sourceId}`}>
                {src.label}
              </option>
            ))}
          </optgroup>
          {patternSources.length > 0 && (
            <optgroup label="playing patterns">
              {patternSources.map((source) => (
                <option key={source.sourceId} value={`file:${source.sourceId}`}>
                  {source.playing ? '● ' : '○ '}
                  {source.label}
                </option>
              ))}
            </optgroup>
          )}
          <option value="none">none (demo mode)</option>
        </select>
      </Row>
    </div>
  )
}

const POPOVER_WIDTH = 300

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '64px 1fr auto',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
      }}
    >
      <span style={{ color: 'var(--text-secondary, var(--foreground-muted))', fontSize: 10 }}>
        {label}
      </span>
      {children}
    </div>
  )
}

const divider: React.CSSProperties = {
  height: 1,
  background: 'var(--border-subtle, var(--border))',
}
const valueStyle: React.CSSProperties = {
  color: 'var(--text-tertiary, var(--foreground-muted))',
  fontSize: 10,
  minWidth: 36,
  textAlign: 'right',
}
const selectStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'var(--bg-input, var(--surface-elevated, var(--surface)))',
  color: 'var(--foreground)',
  border: '1px solid var(--border)',
  borderRadius: 3,
  padding: '3px 6px',
  fontSize: 10,
  fontFamily: 'inherit',
  cursor: 'pointer',
}
const actionBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  background: 'none',
  border: 'none',
  color: 'var(--text-primary, var(--foreground))',
  fontSize: 11,
  fontFamily: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
}
