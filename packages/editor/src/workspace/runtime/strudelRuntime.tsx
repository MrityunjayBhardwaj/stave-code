/**
 * STRUDEL_RUNTIME — Phase 10.2 Task 05.
 *
 * The `LiveCodingRuntimeProvider` for `.strudel` files. Wraps `StrudelEngine`
 * (untouched), declares its extension/language, and renders the per-tab
 * transport chrome (`▶ ⏹ BPM error chromeExtras`).
 *
 * @remarks
 * ## Pattern.prototype hands-off (PV1, PV2, P1, P2)
 *
 * This file does NOT touch `Pattern.prototype`. All Strudel Pattern method
 * interception lives inside `StrudelEngine.evaluate()`'s setter trap. The
 * runtime is a thin wrapper around `engine.play()` / `engine.stop()` /
 * `engine.evaluate()` plus bus publish/unpublish — nothing more.
 *
 * The constraint is enforced by a source-grep test in
 * `__tests__/strudelRuntime.test.tsx` — the assertion fails if any of
 * `Pattern.prototype` shows up in this file or `LiveCodingRuntime.ts`.
 * The grep is the canary for the most likely failure mode (P2): a future
 * maintainer reading "the runtime owns chrome AND engine wrapping" and
 * deciding to "own" the viz interceptor here too.
 *
 * ## Chrome rendering
 *
 * `renderChrome(ctx)` returns a small React component (`StrudelChrome`)
 * that renders the transport bar. The component is a function call, not a
 * class, so each invocation produces a fresh element with its own
 * lifecycle — the embedder mounts it inside the EditorView's `chromeSlot`
 * via Task 09's wiring.
 *
 * The component intentionally does NOT subscribe to `runtime.onError` or
 * `runtime.onPlayingChanged` itself — it reads from `ctx` directly. The
 * embedder (Task 09's compat shim) holds the subscription state and
 * passes the latest values through `ChromeContext`. This keeps the
 * provider stateless and lets the same chrome render in environments
 * (Task 09's `StrudelEditor` shim) where the embedder already has those
 * values from elsewhere (e.g., its own `useState`).
 *
 * The visual style mirrors the legacy `Toolbar.tsx` look so the
 * cutover is byte-comparable in screenshots. Inline styles only — no
 * import from `Toolbar.tsx` because the legacy toolbar bundles an export
 * button into its surface, and Phase 10.2 routes the export button
 * through `chromeExtras` instead (per U8). Reusing the legacy component
 * would force the export button into the chrome at the wrong layer.
 */

import React from 'react'
import { StrudelEngine } from '../../engine/StrudelEngine'
import type {
  ChromeContext,
  LiveCodingRuntimeProvider,
} from '../types'

/**
 * Transport chrome for `.strudel` files. Renders inside
 * `EditorView.chromeSlot` via the embedder. Subscribes to nothing — every
 * piece of state comes through `ctx`.
 */
function StrudelChrome(ctx: ChromeContext): React.ReactElement {
  const { isPlaying, error, bpm, onPlay, onStop, chromeExtras } = ctx
  return (
    <div
      data-strudel-runtime-chrome="root"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 40,
        padding: '0 12px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
      }}
    >
      <button
        data-testid="strudel-chrome-transport"
        onClick={isPlaying ? onStop : onPlay}
        title={isPlaying ? 'Stop (Ctrl+.)' : 'Play (Ctrl+Enter)'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          borderRadius: 4,
          border: 'none',
          cursor: 'pointer',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          background: isPlaying ? 'rgba(139,92,246,0.15)' : 'var(--accent)',
          color: isPlaying ? 'var(--accent)' : '#fff',
          outline: isPlaying ? '1px solid var(--accent)' : 'none',
        }}
      >
        {isPlaying ? '\u25A0 Stop' : '\u25B6 Play'}
      </button>

      {bpm != null && (
        <span
          data-testid="strudel-chrome-bpm"
          style={{ color: 'var(--foreground-muted)', fontSize: 11 }}
        >
          {bpm} BPM
        </span>
      )}

      <div style={{ flex: 1 }} />

      {error && (
        <span
          data-testid="strudel-chrome-error"
          title={error.message}
          style={{
            maxWidth: 240,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: '#f87171',
            fontSize: 11,
            padding: '2px 8px',
            background: 'rgba(248,113,113,0.1)',
            borderRadius: 4,
            border: '1px solid rgba(248,113,113,0.3)',
          }}
        >
          {error.message}
        </span>
      )}

      {chromeExtras && (
        <div
          data-testid="strudel-chrome-extras"
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
        >
          {chromeExtras}
        </div>
      )}
    </div>
  )
}

export const STRUDEL_RUNTIME: LiveCodingRuntimeProvider = {
  extensions: ['.strudel'],
  language: 'strudel',
  createEngine: () => new StrudelEngine(),
  renderChrome: (ctx) => <StrudelChrome {...ctx} />,
}
