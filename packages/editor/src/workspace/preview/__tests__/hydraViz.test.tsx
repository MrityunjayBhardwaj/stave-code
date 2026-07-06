/**
 * HYDRA_VIZ provider — unit tests (Phase 10.2 Task 06).
 *
 * The provider is a one-line call to `createCompiledVizProvider`, so the
 * real surface under test is the helper's render path exercised through
 * the HYDRA adapter. Tests cover:
 *
 *   1. Provider shape (extensions, label, reload policy, keepHidden flag).
 *   2. `render(ctx)` returns a React element — not a ReactNode primitive
 *      or a raw string — so PreviewView can mount it.
 *   3. `compilePreset` is called with a synthetic preset derived from the
 *      file content + path + hydra renderer tag.
 *   4. The mounted output shows the compiled-viz-mount test id (proving
 *      `mountVizRenderer` got called through the shared leaf component).
 *   5. Demo mode: with `audioSource === null`, the renderer still mounts
 *      (empty component bag, which both renderers handle gracefully).
 *   6. Compile error: syntactically invalid code returns an error panel
 *      instead of a mount.
 *
 * ## Mocking strategy
 *
 * `compilePreset` and `mountVizRenderer` are mocked because:
 *   - Real `compilePreset` calls `new Function(code)` on untrusted code.
 *     Safe but irrelevant for this test, which cares about the adapter.
 *   - Real `mountVizRenderer` drives a live `HydraVizRenderer` (loads
 *     hydra-synth via dynamic import, touches WebGL). jsdom has no
 *     WebGL. Mocking isolates the adapter from the renderer stack.
 *
 * The mocks are module-level `vi.mock` hoisted calls; the factory
 * functions are simple spies returning stable objects so that tests
 * can assert on call arguments.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, cleanup, fireEvent } from '@testing-library/react'
import type { PreviewContext } from '../../PreviewProvider'
import type {
  AudioPayload,
  WorkspaceFile,
} from '../../types'
import type { VizDescriptor } from '../../../visualizers/types'

// Mock compilePreset — returns a stable descriptor we can assert on.
vi.mock('../../../visualizers/vizCompiler', () => ({
  compilePreset: vi.fn((preset: { id: string; renderer: string }) => ({
    id: `mock-${preset.id}`,
    label: 'mock',
    renderer: preset.renderer,
    factory: () => ({
      mount: vi.fn(),
      update: vi.fn(),
      resize: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      destroy: vi.fn(),
    }),
  })),
}))

// Mock mountVizRenderer — returns a fake renderer handle so the effect
// can run to completion without touching Hydra/WebGL.
vi.mock('../../../visualizers/mountVizRenderer', () => ({
  mountVizRenderer: vi.fn(() => ({
    renderer: {
      mount: vi.fn(),
      update: vi.fn(),
      resize: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      destroy: vi.fn(),
    },
    disconnect: vi.fn(),
  })),
}))

// Import after the mocks so the module picks up the stubbed versions.
import { HYDRA_VIZ } from '../hydraViz'
import { compilePreset } from '../../../visualizers/vizCompiler'
import { mountVizRenderer } from '../../../visualizers/mountVizRenderer'

function makeFile(
  id: string,
  content: string,
  language: WorkspaceFile['language'] = 'hydra',
): WorkspaceFile {
  return {
    id,
    path: `${id}.hydra`,
    content,
    language,
  }
}

function makeCtx(
  file: WorkspaceFile,
  audioSource: AudioPayload | null = null,
  hidden = false,
): PreviewContext {
  return { file, audioSource, hidden }
}

describe('HYDRA_VIZ provider shape', () => {
  it('claims the .hydra extension (hydra without leading dot per contract)', () => {
    expect(HYDRA_VIZ.extensions).toContain('hydra')
  })

  it('has a human-readable label', () => {
    expect(HYDRA_VIZ.label).toBe('Hydra Visualization')
  })

  it('pauses when hidden per D-03', () => {
    expect(HYDRA_VIZ.keepRunningWhenHidden).toBe(false)
  })

  it('uses debounced reload per D-07', () => {
    expect(HYDRA_VIZ.reload).toBe('debounced')
    expect(HYDRA_VIZ.debounceMs).toBe(300)
  })

  it('exposes a render function', () => {
    expect(typeof HYDRA_VIZ.render).toBe('function')
  })
})

describe('HYDRA_VIZ render path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('calls compilePreset with a preset built from the file content and hydra renderer', () => {
    const file = makeFile('f1', 's.osc().out()')
    const node = HYDRA_VIZ.render(makeCtx(file))
    render(node as React.ReactElement)

    expect(compilePreset).toHaveBeenCalledTimes(1)
    const calledPreset = (compilePreset as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0][0]
    expect(calledPreset.renderer).toBe('hydra')
    expect(calledPreset.code).toBe('s.osc().out()')
    expect(calledPreset.id).toBe('f1')
  })

  it('render returns a React element (not a string or null on happy path)', () => {
    const file = makeFile('f2', 's.solid().out()')
    const node = HYDRA_VIZ.render(makeCtx(file))
    expect(React.isValidElement(node)).toBe(true)
  })

  it('mounts the renderer via mountVizRenderer on the compiled descriptor', () => {
    const file = makeFile('f3', 's.osc().out()')
    const node = HYDRA_VIZ.render(makeCtx(file))
    const { getByTestId } = render(node as React.ReactElement)
    // Effect fires after render, so mountVizRenderer should have been
    // called by the time this assertion runs.
    expect(mountVizRenderer).toHaveBeenCalledTimes(1)
    expect(getByTestId('compiled-viz-mount-f3')).toBeTruthy()
  })

  it('passes an empty component bag when audioSource is null (demo mode, P7)', () => {
    const file = makeFile('f4', 's.osc().out()')
    const node = HYDRA_VIZ.render(makeCtx(file, null))
    render(node as React.ReactElement)

    const args = (mountVizRenderer as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]
    // mountVizRenderer(container, source, components, size, onError)
    const components = args[2]
    // Demo mode → no streaming, audio, queryable, or inlineViz slots.
    expect(components.streaming).toBeUndefined()
    expect(components.audio).toBeUndefined()
    expect(components.queryable).toBeUndefined()
    expect(components.inlineViz).toBeUndefined()
  })

  it('populates the component bag when audioSource is non-null', () => {
    const file = makeFile('f5', 's.osc().out()')
    const fakeAnalyser = {
      context: {} as unknown,
    } as unknown as AnalyserNode
    const payload = {
      hapStream: { id: 'hs' } as unknown as AudioPayload['hapStream'],
      analyser: fakeAnalyser,
      scheduler: { id: 's' } as unknown as AudioPayload['scheduler'],
    } as AudioPayload

    const node = HYDRA_VIZ.render(makeCtx(file, payload))
    render(node as React.ReactElement)

    const args = (mountVizRenderer as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]
    const components = args[2]
    expect(components.streaming?.hapStream).toBe(payload.hapStream)
    expect(components.audio?.analyser).toBe(payload.analyser)
    expect(components.queryable?.scheduler).toBe(payload.scheduler)
  })

  it('calls renderer.pause() when paused flips from false to true (chrome Stop button)', () => {
    // Integration test for the viz chrome Stop button. The chrome
    // flips a shell-level `pausedPreviews` set, which threads
    // through PreviewView → provider ctx → CompiledVizMount.
    // CompiledVizMount should call `renderer.pause()` on its
    // [paused, hidden] effect. Without this test, a regression
    // like "paused prop forgotten somewhere on the chain" would
    // only surface in the running browser.
    const file = makeFile('f-pause', 's.osc().out()')
    const { rerender } = render(
      HYDRA_VIZ.render({ file, audioSource: null, hidden: false, paused: false }) as React.ReactElement,
    )

    const mountMock = mountVizRenderer as unknown as ReturnType<typeof vi.fn>
    const fakeRenderer = mountMock.mock.results[0].value.renderer
    const pauseSpy = fakeRenderer.pause as ReturnType<typeof vi.fn>
    const resumeSpy = fakeRenderer.resume as ReturnType<typeof vi.fn>

    // On initial mount with paused=false and hidden=false, the
    // paused effect runs and takes the else-branch → calls
    // resume(). That's fine (resume is idempotent for a sketch
    // that's already running). Clear the spies to establish a
    // fresh baseline for the Stop click.
    pauseSpy.mockClear()
    resumeSpy.mockClear()

    // Rerender with paused=true — simulates the chrome Stop click
    // propagating through the shell → PreviewView → ctx chain.
    rerender(
      HYDRA_VIZ.render({ file, audioSource: null, hidden: false, paused: true }) as React.ReactElement,
    )
    expect(pauseSpy).toHaveBeenCalled()
    expect(resumeSpy).not.toHaveBeenCalled()

    // Rerender with paused=false — the Play click resumes.
    pauseSpy.mockClear()
    resumeSpy.mockClear()
    rerender(
      HYDRA_VIZ.render({ file, audioSource: null, hidden: false, paused: false }) as React.ReactElement,
    )
    expect(resumeSpy).toHaveBeenCalled()
    expect(pauseSpy).not.toHaveBeenCalled()
  })

  it('calls renderer.update() when audioSource changes within a mount (defense-in-depth)', () => {
    // Defense against a regression where PreviewView's re-mount key
    // fails to fire but the component bag has changed: the update effect
    // in CompiledVizMount runs `renderer.update(components)` on every
    // audioSource change so live-ref analyser swaps still reach the
    // renderer without a full rebuild.
    //
    // We pin the descriptor across renders so the mount effect does NOT
    // re-run — that isolates the update-effect path. In real usage,
    // descriptors DO change between renders (compilePreset returns a
    // fresh object), but the re-mount path is tested separately via
    // PreviewView's key formula. This test exercises the narrower
    // scenario where only `audioSource` drifts and `descriptor` is
    // reference-stable.
    const stableDescriptor: VizDescriptor = {
      id: 'mock-stable',
      label: 'mock',
      renderer: 'hydra',
      factory: () => ({
        mount: vi.fn(),
        update: vi.fn(),
        resize: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        destroy: vi.fn(),
      }),
    } as unknown as VizDescriptor
    ;(compilePreset as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      stableDescriptor,
    )

    const file = makeFile('f-update', 's.osc().out()')
    const { rerender } = render(
      HYDRA_VIZ.render(makeCtx(file, null)) as React.ReactElement,
    )

    const mountMock = mountVizRenderer as unknown as ReturnType<typeof vi.fn>
    const rendererUpdate = mountMock.mock.results[0].value.renderer.update
    const initialUpdateCalls = rendererUpdate.mock.calls.length

    const fakeAnalyser = {
      context: {} as unknown,
    } as unknown as AnalyserNode
    const payload = {
      hapStream: { id: 'hs' } as unknown as AudioPayload['hapStream'],
      analyser: fakeAnalyser,
      scheduler: { id: 's' } as unknown as AudioPayload['scheduler'],
    } as AudioPayload

    rerender(HYDRA_VIZ.render(makeCtx(file, payload)) as React.ReactElement)

    // The mount effect should NOT have re-run because descriptor is
    // pinned — only one mountVizRenderer call.
    expect(mountMock.mock.calls.length).toBe(1)

    // The update effect SHOULD have fired with the new bag.
    expect(rendererUpdate.mock.calls.length).toBeGreaterThan(initialUpdateCalls)
    const lastCall = rendererUpdate.mock.calls[rendererUpdate.mock.calls.length - 1]
    expect(lastCall[0].audio?.analyser).toBe(fakeAnalyser)
  })

  it('settings popover: preview=side → calls onOpenPreview (#773)', () => {
    // Opening a side preview moved from a standalone "▶ Preview" button to the
    // ⚙ viz-settings popover. With no preview open there's no transport button;
    // the gear opens the popover (mode 'off'), and the 'side' segment opens it.
    const onOpenPreview = vi.fn()
    const onTogglePausePreview = vi.fn()
    const file = makeFile('f-preview-closed', 's.osc().out()')
    const chrome = HYDRA_VIZ.renderEditorChrome!({
      file,
      onOpenPreview,
      onTogglePausePreview,
      onToggleBackground: vi.fn(),
      onSave: vi.fn(),
    })
    const { getByTestId, queryByTestId } = render(
      chrome as React.ReactElement,
    )
    // No transport button while no side preview exists.
    expect(queryByTestId('viz-chrome-open-preview')).toBeNull()
    fireEvent.click(getByTestId('viz-chrome-settings'))
    const popover = getByTestId('viz-settings-popover')
    expect(popover.getAttribute('data-mode')).toBe('off')
    fireEvent.click(getByTestId('viz-preview-mode-side'))
    expect(onOpenPreview).toHaveBeenCalledTimes(1)
    expect(onOpenPreview.mock.calls[0][0]).toEqual({ kind: 'default' })
    expect(onTogglePausePreview).not.toHaveBeenCalled()
  })

  it('chrome play/pause: side running → Pause → calls onTogglePausePreview', () => {
    // previewOpen=true, previewPaused=false → button shows "⏸ Pause" and clicks
    // toggle pause on the active side preview (#774).
    const onOpenPreview = vi.fn()
    const onTogglePausePreview = vi.fn()
    const file = makeFile('f-preview-running', 's.osc().out()')
    const chrome = HYDRA_VIZ.renderEditorChrome!({
      file,
      previewOpen: true,
      previewPaused: false,
      onOpenPreview,
      onTogglePausePreview,
      onToggleBackground: vi.fn(),
      onSave: vi.fn(),
    })
    const { getByTestId } = render(chrome as React.ReactElement)
    const btn = getByTestId('viz-chrome-open-preview')
    expect(btn.getAttribute('data-button-state')).toBe('running')
    expect(btn.getAttribute('data-preview-mode')).toBe('side')
    expect(btn.textContent).toContain('Pause')
    fireEvent.click(btn)
    expect(onTogglePausePreview).toHaveBeenCalledTimes(1)
    // Open should NOT have fired — we're in pause-toggle mode.
    expect(onOpenPreview).not.toHaveBeenCalled()
  })

  it('chrome play/pause: shows in BACKDROP mode and toggles pause (#774)', () => {
    // isBackground → previewMode 'backdrop' → the play/pause button is visible
    // (no side preview needed) and toggles pause on the backdrop.
    const onTogglePausePreview = vi.fn()
    const file = makeFile('rings', 'osc().out()')
    const chrome = HYDRA_VIZ.renderEditorChrome!({
      file,
      isBackground: true,
      previewPaused: false,
      onOpenPreview: vi.fn(),
      onTogglePausePreview,
      onToggleBackground: vi.fn(),
      onSave: vi.fn(),
    })
    const { getByTestId } = render(chrome as React.ReactElement)
    const btn = getByTestId('viz-chrome-open-preview')
    expect(btn.getAttribute('data-preview-mode')).toBe('backdrop')
    expect(btn.textContent).toContain('Pause')
    fireEvent.click(btn)
    expect(onTogglePausePreview).toHaveBeenCalledTimes(1)
  })

  it('chrome play/pause: hidden when preview=off (#774)', () => {
    const file = makeFile('rings', 'osc().out()')
    const chrome = HYDRA_VIZ.renderEditorChrome!({
      file,
      onOpenPreview: vi.fn(),
      onToggleBackground: vi.fn(),
      onSave: vi.fn(),
    })
    const { queryByTestId } = render(chrome as React.ReactElement)
    expect(queryByTestId('viz-chrome-open-preview')).toBeNull()
  })

  it('chrome primary button: paused → Play → calls onTogglePausePreview', () => {
    // previewOpen=true, previewPaused=true → button shows "▶ Play"
    // and clicks resume the renderer via onTogglePausePreview.
    const onOpenPreview = vi.fn()
    const onTogglePausePreview = vi.fn()
    const file = makeFile('f-preview-paused', 's.osc().out()')
    const chrome = HYDRA_VIZ.renderEditorChrome!({
      file,
      previewOpen: true,
      previewPaused: true,
      onOpenPreview,
      onTogglePausePreview,
      onToggleBackground: vi.fn(),
      onSave: vi.fn(),
    })
    const { getByTestId } = render(chrome as React.ReactElement)
    const btn = getByTestId('viz-chrome-open-preview')
    expect(btn.getAttribute('data-button-state')).toBe('paused')
    // "Play" label (not "Preview") distinguishes the paused resume
    // state from the closed open state — both use a triangle icon
    // but the word makes the semantic difference explicit.
    expect(btn.textContent).toContain('Play')
    fireEvent.click(btn)
    expect(onTogglePausePreview).toHaveBeenCalledTimes(1)
    expect(onOpenPreview).not.toHaveBeenCalled()
  })

  it('settings gear: present, off mode by default (#773)', () => {
    const file = makeFile('rings', 'osc().out()')
    const chrome = HYDRA_VIZ.renderEditorChrome!({
      file,
      onOpenPreview: vi.fn(),
      onToggleBackground: vi.fn(),
      onSave: vi.fn(),
    })
    const { getByTestId, queryByTestId } = render(chrome as React.ReactElement)
    const gear = getByTestId('viz-chrome-settings')
    expect(gear.getAttribute('data-preview-mode')).toBe('off')
    // Popover is closed until the gear is clicked.
    expect(queryByTestId('viz-settings-popover')).toBeNull()
    fireEvent.click(gear)
    expect(getByTestId('viz-settings-popover').getAttribute('data-mode')).toBe(
      'off',
    )
    // 'off' segment is the active one.
    expect(
      getByTestId('viz-preview-mode-off').getAttribute('data-active'),
    ).toBe('true')
  })

  it('settings popover: preview=backdrop → calls onToggleBackground (#773)', () => {
    // From 'off', selecting 'backdrop' enters backdrop mode via onToggleBackground
    // (which sets, since the file isn't currently the backdrop).
    const onToggleBackground = vi.fn()
    const file = makeFile('rings', 'osc().out()')
    const chrome = HYDRA_VIZ.renderEditorChrome!({
      file,
      onOpenPreview: vi.fn(),
      onToggleBackground,
      onSave: vi.fn(),
    })
    const { getByTestId } = render(chrome as React.ReactElement)
    fireEvent.click(getByTestId('viz-chrome-settings'))
    fireEvent.click(getByTestId('viz-preview-mode-backdrop'))
    expect(onToggleBackground).toHaveBeenCalledTimes(1)
  })

  it('settings popover: backdrop mode shows backdrop controls + routes quality (#773)', () => {
    // isBackground → gear reads 'backdrop', popover exposes the backdrop controls
    // (opacity / quality / viz-span); changing quality routes to the setter.
    const onSetBackdropQuality = vi.fn()
    const file = makeFile('rings', 'osc().out()')
    const chrome = HYDRA_VIZ.renderEditorChrome!({
      file,
      onOpenPreview: vi.fn(),
      onToggleBackground: vi.fn(),
      isBackground: true,
      backdropOpacity: 0.8,
      backdropQuality: 'half',
      backdropVizSpan: 'file',
      onSetBackdropOpacity: vi.fn(),
      onSetBackdropQuality,
      onSetBackdropVizSpan: vi.fn(),
      onSave: vi.fn(),
    })
    const { getByTestId } = render(chrome as React.ReactElement)
    expect(
      getByTestId('viz-chrome-settings').getAttribute('data-preview-mode'),
    ).toBe('backdrop')
    fireEvent.click(getByTestId('viz-chrome-settings'))
    expect(getByTestId('viz-settings-opacity')).toBeTruthy()
    expect(getByTestId('viz-settings-vizspan')).toBeTruthy()
    fireEvent.change(getByTestId('viz-settings-quality'), {
      target: { value: 'full' },
    })
    expect(onSetBackdropQuality).toHaveBeenCalledWith('full')
  })

  it('settings popover: from backdrop, preview=off clears via onToggleBackground (#773)', () => {
    // Leaving 'backdrop' for 'off' calls onToggleBackground (clears, since the
    // file IS currently the backdrop).
    const onToggleBackground = vi.fn()
    const file = makeFile('rings', 'osc().out()')
    const chrome = HYDRA_VIZ.renderEditorChrome!({
      file,
      onOpenPreview: vi.fn(),
      onToggleBackground,
      isBackground: true,
      onSave: vi.fn(),
    })
    const { getByTestId } = render(chrome as React.ReactElement)
    fireEvent.click(getByTestId('viz-chrome-settings'))
    fireEvent.click(getByTestId('viz-preview-mode-off'))
    expect(onToggleBackground).toHaveBeenCalledTimes(1)
  })

  it('settings popover: hosts the source dropdown (moved off the bar) (#773)', () => {
    const file = makeFile('rings', 'osc().out()')
    const chrome = HYDRA_VIZ.renderEditorChrome!({
      file,
      onOpenPreview: vi.fn(),
      onToggleBackground: vi.fn(),
      onSave: vi.fn(),
    })
    const { getByTestId, queryByTestId } = render(chrome as React.ReactElement)
    // Not on the chrome bar anymore.
    expect(queryByTestId('viz-chrome-source')).toBeNull()
    fireEvent.click(getByTestId('viz-chrome-settings'))
    // Lives in the popover now.
    expect(getByTestId('viz-chrome-source')).toBeTruthy()
  })

  it('renders an error panel when compilePreset throws (invalid code)', () => {
    ;(compilePreset as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => {
        throw new Error('syntax error: unexpected token')
      },
    )
    const file = makeFile('f6', 'this is ( not valid')
    const node = HYDRA_VIZ.render(makeCtx(file))
    const { getByTestId } = render(node as React.ReactElement)
    const panel = getByTestId('compiled-viz-error-f6')
    expect(panel.textContent).toContain('syntax error: unexpected token')
  })
})
