/**
 * compiledVizProvider — shared adapter used by HYDRA_VIZ and P5_VIZ.
 *
 * Phase 10.2 Task 06. Both viz providers — `HYDRA_VIZ` and `P5_VIZ` — are
 * the same shape with different `extensions` / `label` / `renderer` tags
 * passed through to `compilePreset`. Rather than duplicating ~120 lines
 * twice, the shared work lives here and each provider is a one-line call.
 *
 * @remarks
 * ## What this adapter does
 *
 * Takes the provider's claimed extension set and label, returns a
 * `PreviewProvider` whose `render(ctx)` function:
 *
 *   1. Builds a synthetic `VizPreset` from `ctx.file.content` (renderer
 *      inferred from the extension).
 *   2. Calls `compilePreset()` — unchanged from Phase 10.1 — to produce a
 *      `VizDescriptor`.
 *   3. Returns a `<CompiledVizMount>` React component that mounts the
 *      descriptor via the existing `mountVizRenderer` utility (the
 *      same one the production `useVizRenderer` hook uses), passing
 *      `ctx.audioSource` fields through as the engine component bag.
 *
 * On compile error (the `new Function(...)` path inside `compilePreset`
 * can throw on syntactically invalid user code), the adapter catches the
 * error and returns an error panel instead of a renderer. The panel's
 * shape mirrors the existing `VizEditor.tsx` error panel so the visual
 * cutover at Task 09/10 stays byte-comparable.
 *
 * ## Why the mount lives inside a small React component
 *
 * `mountVizRenderer` is imperative — it grabs a container element, calls
 * `.mount()`, wires a ResizeObserver, and returns a disconnect function.
 * It needs a stable DOM node, which it gets via a React ref. Wrapping
 * the mount in a function component lets us use `useEffect` + `useRef`
 * naturally, and lets React's unmount cycle clean up via the effect's
 * cleanup function.
 *
 * The component is intentionally tiny — no props beyond `descriptor` +
 * `audioSource` + `hidden` — because PreviewView already owns the
 * re-mount key for hot reload. Every reload tick causes PreviewView to
 * key-bump the subtree, which unmounts THIS component, runs its effect
 * cleanup (which destroys the old renderer), and then mounts a fresh
 * copy (which compiles the new code and mounts a new renderer). We do
 * NOT call `renderer.update()` here because the reload policy treats
 * each reload as a full rebuild — `update()` is only useful for
 * live-ref changes within a single mount lifetime, which inside the
 * provider means "audioSource slot references changed without the code
 * changing." PreviewView's key formula covers publisher-identity change
 * too, so that case also triggers unmount/remount rather than update.
 *
 * ## Demo mode (CONTEXT P7)
 *
 * When `ctx.audioSource === null`, the adapter passes an empty component
 * bag to `mountVizRenderer`. The renderers already handle this path:
 *
 *   - `HydraVizRenderer` falls back to its internal `HapEnergyEnvelope`
 *     if there's no analyser AND no hap stream, and the default shader
 *     still draws (silent, static).
 *   - `P5VizRenderer` passes null refs through; the user sketch reads
 *     `scheduler?.now()` and `scheduler?.query()` with optional chaining
 *     in both bundled templates, so the "no data" branch executes
 *     naturally.
 *
 * The demo-mode fallback is NOT a separate code path — it's the same
 * mount with a null/empty component bag. PreviewView already shows a
 * "demo" badge in its chrome when `audioSource` is null (per its
 * existing Task 03 implementation), so the provider doesn't need to
 * paint its own "no data" overlay.
 *
 * ## Hidden pause
 *
 * When `ctx.hidden === true`, the component calls `renderer.pause()` on
 * the mounted renderer. On un-hide, PreviewView triggers a catch-up
 * reload which causes a fresh mount with `hidden: false` (the default).
 * We do NOT track hidden via state or re-mount on hidden change — the
 * simpler "pause/resume at the renderer level" path avoids tearing down
 * and rebuilding a hydra instance every time a user alt-tabs.
 *
 * ## Renderer value vs. factory
 *
 * `VizDescriptor.factory` is the function that produces a fresh
 * `VizRenderer` instance. `mountVizRenderer` accepts either a factory or
 * an instance (it checks `typeof === 'function'`). We pass the factory
 * straight through — the factory runs once per mount so each reload
 * gets a fresh renderer state.
 */

import React, { useEffect, useMemo, useRef } from 'react'
import type { VizDescriptor } from '../../visualizers/types'
import type { VizPreset } from '../../visualizers/vizPreset'
import { compilePreset } from '../../visualizers/vizCompiler'
import { mountVizRenderer } from '../../visualizers/mountVizRenderer'
import type { EngineComponents } from '../../engine/LiveCodingEngine'
import type { PreviewContext, PreviewEditorChromeContext, PreviewProvider } from '../PreviewProvider'
import { VizEditorChrome } from './VizEditorChrome'

/**
 * Options accepted by `createCompiledVizProvider`. Both viz providers pass
 * the same values except for the renderer tag, the claimed extension, and
 * the display label.
 */
export interface CompiledVizProviderOptions {
  /** Claimed file extensions (without the leading dot, per CONTEXT). */
  readonly extensions: readonly string[]
  /** Display label used in dropdown tooltips / error messages. */
  readonly label: string
  /** Which concrete renderer `compilePreset` should produce. */
  readonly renderer: 'hydra' | 'p5'
}

/**
 * Build a PreviewProvider for a compile-on-reload viz file type. Per
 * CONTEXT D-03 (viz pauses when hidden) and D-07 (300ms debounced reload),
 * the result always uses those constants — they are characteristics of
 * "visual output compiled from source code on every edit," not per-format
 * tunables. If a future renderer wants different timing, it should call
 * the underlying helpers directly rather than threading more options
 * through here.
 */
export function createCompiledVizProvider(
  opts: CompiledVizProviderOptions,
): PreviewProvider {
  return {
    extensions: opts.extensions,
    label: opts.label,
    keepRunningWhenHidden: false, // D-03
    reload: 'debounced', // D-07
    debounceMs: 300, // D-07
    render: (ctx: PreviewContext): React.ReactNode => {
      // Compilation used to happen HERE, but that meant every call to
      // `render()` (once per provider re-render — and PreviewView
      // re-renders on every audio payload change, paused toggle, etc.)
      // built a fresh `VizDescriptor` with a new factory closure. The
      // downstream `CompiledVizMount`'s mount effect depended on
      // `[descriptor]`, so any provider re-render destroyed the p5
      // instance and built a brand new one. The user's Stop button
      // couldn't "stop" anything because by the time the paused effect
      // fired, a freshly-mounted p5 instance was already back at work.
      //
      // Fix: hand `CompiledVizMount` the FILE + renderer type and let
      // it do the compile itself, memoized on the file content. The
      // descriptor then stays stable across re-renders that don't
      // actually change the source, and the mount effect runs only on
      // real compilation boundaries (content edit, debounced reload).
      return (
        <CompiledVizMount
          file={ctx.file}
          rendererType={opts.renderer}
          audioSource={ctx.audioSource}
          hidden={ctx.hidden}
          paused={ctx.paused ?? false}
          fileId={ctx.file.id}
        />
      )
    },
    renderEditorChrome: (ctx: PreviewEditorChromeContext): React.ReactNode => {
      return <VizEditorChrome {...ctx} />
    },
  }
}

// ---------------------------------------------------------------------------
// CompiledVizMount — the React leaf that owns the imperative mount lifecycle.
// ---------------------------------------------------------------------------

interface CompiledVizMountProps {
  /**
   * The workspace file whose content is compiled into the
   * descriptor. Compilation lives inside the component (not the
   * provider) so the descriptor can be memoized on file content
   * — this is the fix for the "pause toggle re-mounts the
   * sketch" bug: without memoization, every re-render of the
   * parent built a fresh descriptor and the mount effect
   * destroyed + recreated the p5 instance on every state
   * change.
   */
  readonly file: PreviewContext['file']
  /** Which renderer the provider wraps ('hydra' | 'p5'). */
  readonly rendererType: 'hydra' | 'p5'
  readonly audioSource: PreviewContext['audioSource']
  readonly hidden: boolean
  /**
   * User-initiated pause state from the chrome's Stop button.
   * When true, we call `renderer.pause()` (p5.noLoop / hydra
   * stop) to freeze the canvas. When false, `renderer.resume()`
   * restarts the loop. Independent of `hidden` — hidden is
   * visibility-driven, paused is user-intent-driven.
   */
  readonly paused: boolean
  readonly fileId: string
}

/**
 * React leaf that calls `mountVizRenderer` into a container ref on mount
 * and disposes on unmount. PreviewView's React key formula (payloadKey +
 * reloadTick) drives re-mount for:
 *
 *   - Publisher identity change on the audio bus (→ fresh analyser refs).
 *   - Content change after the provider's debounce window (→ fresh code).
 *
 * So within a single mount lifetime, the descriptor and audioSource
 * are effectively stable. Inside this component we don't need to observe
 * them for updates — PreviewView tears us down when they change.
 *
 * The only dynamic value we DO observe is `hidden` — we call `pause()` /
 * `resume()` on the renderer when it flips, so that alt-tab doesn't
 * cause a full rebuild. That path is a cheap state change, not a
 * teardown.
 */
function CompiledVizMount(props: CompiledVizMountProps): React.ReactElement {
  const { file, rendererType, audioSource, hidden, paused, fileId } = props

  // Compile ONCE per file-content change. This is the memoization
  // boundary that keeps the descriptor stable across re-renders
  // that don't actually change the source (pause toggles, source
  // swaps, audio payload refreshes). The `[file.content,
  // file.language, rendererType]` dep set is the minimum that
  // uniquely identifies the compiled output — file.id alone isn't
  // enough because the user may edit the same file.
  //
  // Errors are captured into state via the try/catch so a syntax
  // error in user code doesn't unmount the component; instead the
  // component renders a distinguishable error panel.
  const { descriptor, compileError } = useMemo<{
    descriptor: VizDescriptor | null
    compileError: string | null
  }>(() => {
    try {
      const preset: VizPreset = {
        id: file.id,
        name: file.path,
        renderer: rendererType,
        code: file.content,
        requires: [],
        createdAt: 0,
        updatedAt: 0,
      }
      return { descriptor: compilePreset(preset), compileError: null }
    } catch (err) {
      return {
        descriptor: null,
        compileError: err instanceof Error ? err.message : String(err),
      }
    }
  }, [file.id, file.content, file.language, rendererType])

  const containerRef = useRef<HTMLDivElement>(null)
  // Track the live renderer across effect invocations so the hidden-flip
  // effect can call pause/resume without tearing down the mount.
  const rendererRef = useRef<ReturnType<
    typeof mountVizRenderer
  > | null>(null)

  // Build the component bag once per render from the current audioSource.
  // Passing it directly to `mountVizRenderer` on mount; the mount-effect
  // re-runs only when the descriptor changes (which, again, triggers a
  // full unmount via PreviewView's key formula, not via this effect).
  const components = useMemo<Partial<EngineComponents>>(() => {
    const bag: Partial<EngineComponents> = {}
    if (audioSource?.hapStream) {
      bag.streaming = { hapStream: audioSource.hapStream }
    }
    if (audioSource?.analyser) {
      bag.audio = {
        analyser: audioSource.analyser,
        audioCtx: audioSource.analyser.context as AudioContext,
      }
    }
    if (audioSource?.scheduler) {
      bag.queryable = {
        scheduler: audioSource.scheduler,
        trackSchedulers: new Map(),
      }
    }
    if (audioSource?.inlineViz) {
      bag.inlineViz = audioSource.inlineViz
    }
    return bag
    // We deliberately depend on the audioSource reference, which is stable
    // within a single mount lifetime (PreviewView's key formula enforces
    // this). A shallow-unsafe dep is fine here because a stale value is
    // impossible — the component unmounts before audioSource changes.
  }, [audioSource])

  // Mount/unmount the renderer. This effect runs exactly once per mount
  // because descriptor is captured at mount time and PreviewView owns the
  // "descriptor changed → remount" signal via its React key. We do NOT
  // include `components` in the deps because they come from the same
  // audioSource that's also bound to PreviewView's key.
  useEffect(() => {
    if (!descriptor) return
    const el = containerRef.current
    if (!el) return
    const size = {
      w: el.clientWidth || 400,
      h: el.clientHeight || 300,
    }
    let mounted: ReturnType<typeof mountVizRenderer> | null = null
    try {
      mounted = mountVizRenderer(
        el,
        descriptor.factory,
        components,
        size,
        (e) => {
          // Surface renderer errors into the DOM so tests and observers
          // can detect them without console-sniffing.
          // eslint-disable-next-line no-console
          console.error('[compiledVizProvider] renderer error:', e)
        },
      )
      rendererRef.current = mounted
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        '[compiledVizProvider] mountVizRenderer threw:',
        err,
      )
    }
    return () => {
      rendererRef.current = null
      if (mounted) {
        try {
          mounted.disconnect()
          mounted.renderer.destroy()
        } catch {
          // Swallow — destruction errors are non-fatal during unmount.
        }
      }
    }
    // Intentionally NOT observing `components`: PreviewView's key formula
    // re-mounts this component when publisher identity changes, which
    // means a stale components bag is impossible within a single mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descriptor])

  // Defense-in-depth for audio reactivity: observe the components bag and
  // call `renderer.update()` whenever it changes within a single mount
  // lifetime. PreviewView's key formula is SUPPOSED to force unmount when
  // publisher identity changes (which rebuilds the component bag via
  // `components = useMemo([audioSource])`), but if any path ever skips
  // the re-mount — e.g., a publisher repubishes the same id with new
  // refs (D-01 identity guard path), or an edge case in payloadKey's
  // staleness window — this update() call catches the live-ref change
  // without a full rebuild. Cheap no-op when the refs haven't changed.
  useEffect(() => {
    const r = rendererRef.current?.renderer
    if (!r || !r.update) return
    try {
      r.update(components)
    } catch {
      // Non-fatal — renderer update is a live-ref refresh, not a hard
      // dependency. A broken update() must not crash the mount.
    }
  }, [components])

  // Pause/resume on hidden flip — no teardown. Cheap state change.
  useEffect(() => {
    const r = rendererRef.current?.renderer
    if (!r) return
    if (hidden) {
      try {
        r.pause()
      } catch {
        // Non-fatal.
      }
    } else {
      try {
        r.resume()
      } catch {
        // Non-fatal.
      }
    }
  }, [hidden])

  // Pause/resume on user-initiated pause (chrome Stop button). Same
  // cheap state change as the `hidden` effect — no teardown, just
  // flips the renderer's animation loop. The two effects compose
  // naturally: if either `hidden` OR `paused` is true, the renderer
  // ends up paused; the latest transition wins until the next flip.
  useEffect(() => {
    const r = rendererRef.current?.renderer
    if (!r) return
    if (paused) {
      try {
        r.pause()
      } catch {
        // Non-fatal.
      }
    } else if (!hidden) {
      // Only resume if we're not also hidden — don't undo the
      // hidden-pause by clearing a separate paused flag. The
      // `hidden` effect will pick up where it left off when the
      // tab is un-hidden.
      try {
        r.resume()
      } catch {
        // Non-fatal.
      }
    }
  }, [paused, hidden])

  // Compile error panel — a syntax error in the user's source
  // renders here instead of unmounting the component. Keeping the
  // component mounted preserves the audio subscription so a
  // subsequent fix-and-save fires the debounced reload without
  // having to re-subscribe.
  if (compileError !== null) {
    return (
      <div
        data-testid={`compiled-viz-error-${fileId}`}
        data-compiled-viz-error="true"
        style={{
          padding: 12,
          color: '#ff6b6b',
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          fontFamily: 'var(--font-mono)',
          background: 'rgba(255,107,107,0.05)',
          height: '100%',
          boxSizing: 'border-box',
          overflow: 'auto',
        }}
      >
        {compileError}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      data-testid={`compiled-viz-mount-${fileId}`}
      data-compiled-viz-mount="true"
      data-renderer={descriptor?.renderer ?? 'unknown'}
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--background)',
        overflow: 'hidden',
        position: 'relative',
      }}
    />
  )
}
