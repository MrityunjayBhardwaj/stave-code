/**
 * VizEditorChrome — built-in audio source stop wiring (#3).
 *
 * The Stop button on a viz chrome should silence the audio source
 * if the source is a built-in example (sample sound, drum pattern,
 * chord progression). The same applies to picking "none" from the
 * source dropdown, and to closing the preview tab via its × button.
 * Pattern runtime sources are NOT in the built-in registry and
 * therefore stay untouched by these gestures.
 *
 * The audio source modules touch real Web Audio (AudioContext,
 * AudioBufferSourceNode), which jsdom doesn't have. We mock the
 * shared `builtinExampleSources` registry with synthetic entries
 * whose `startIfIdle` / `stopIfRunning` are spies — that's the
 * exact integration boundary the chrome talks to, and it's
 * isolation-clean (no Web Audio touched, no module-level singleton
 * state shared between tests).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, cleanup, fireEvent } from '@testing-library/react'

// Per-test spies hoisted alongside the vi.mock factory so that
// vitest's hoist-to-top transformation doesn't try to access them
// before initialization. The spies persist across tests; vi.clear-
// AllMocks() in beforeEach resets their call records.
const {
  sampleStartSpy,
  sampleStopSpy,
  drumStartSpy,
  drumStopSpy,
  chordStartSpy,
  chordStopSpy,
} = vi.hoisted(() => ({
  sampleStartSpy: vi.fn(),
  sampleStopSpy: vi.fn(),
  drumStartSpy: vi.fn(),
  drumStopSpy: vi.fn(),
  chordStartSpy: vi.fn(),
  chordStopSpy: vi.fn(),
}))

vi.mock('../../builtinExampleSources', () => {
  const SAMPLE_ID = '__example_sample__'
  const DRUM_ID = '__example_drums__'
  const CHORD_ID = '__example_chords__'
  const sources = [
    {
      sourceId: SAMPLE_ID,
      label: 'Example: sample sound',
      startIfIdle: sampleStartSpy,
      stopIfRunning: sampleStopSpy,
    },
    {
      sourceId: DRUM_ID,
      label: 'Example: drum pattern',
      startIfIdle: drumStartSpy,
      stopIfRunning: drumStopSpy,
    },
    {
      sourceId: CHORD_ID,
      label: 'Example: chord progression',
      startIfIdle: chordStartSpy,
      stopIfRunning: chordStopSpy,
    },
  ]
  return {
    BUILTIN_EXAMPLE_SOURCES: sources,
    BUILTIN_SOURCE_IDS: new Set(sources.map((s) => s.sourceId)),
    findBuiltinExampleSource: (id: string) =>
      sources.find((s) => s.sourceId === id),
  }
})

// Mock the audio bus so chrome can read source listings without
// hitting the real bus singleton. Empty list is fine — the chrome
// only consults this for pattern sources, which we don't exercise
// in these tests.
vi.mock('../../WorkspaceAudioBus', () => ({
  workspaceAudioBus: {
    listSources: () => [],
    onSourcesChanged: () => () => {},
  },
}))

// Import after the mocks so the chrome picks up the stubbed
// builtinExampleSources module.
import { VizEditorChrome } from '../VizEditorChrome'
import type { PreviewEditorChromeContext } from '../../PreviewProvider'
import type { WorkspaceFile } from '../../types'

function makeFile(
  id: string,
  language: WorkspaceFile['language'] = 'p5js',
): WorkspaceFile {
  return {
    id,
    path: `${id}.p5`,
    content: '// noop',
    language,
  }
}

function makeCtx(
  overrides: Partial<PreviewEditorChromeContext>,
): PreviewEditorChromeContext {
  const file = overrides.file ?? makeFile('f-test')
  return {
    file,
    onOpenPreview: vi.fn(),
    onTogglePausePreview: vi.fn(),
    onChangePreviewSource: vi.fn(),
    onToggleBackground: vi.fn(),
    onSave: vi.fn(),
    previewOpen: false,
    previewPaused: false,
    ...overrides,
  }
}

/**
 * Helper that picks a source from the chrome's dropdown. The chrome's
 * `selectedSource` is internal state initialized to `{kind: 'default'}`
 * — there's no prop to set the initial value, so tests that need a
 * specific source must select it via the actual dropdown event.
 *
 * If `previewOpen` was true on render, the dropdown change handler will
 * dispatch start/stop spies as a side effect. Tests that want to assert
 * on a CLEAN spy state should call this helper, then `vi.clearAllMocks()`
 * before the gesture under test.
 */
function pickSource(getByTestId: (id: string) => HTMLElement, value: string) {
  const select = getByTestId('viz-chrome-source') as HTMLSelectElement
  fireEvent.change(select, { target: { value } })
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('VizEditorChrome — built-in source stop wiring (issue #3)', () => {
  // ---- Stop click ------------------------------------------------------
  //
  // The chrome itself NO LONGER dispatches audio start/stop on the
  // Stop / Play click. The shell-side `onTogglePausePreview` handler
  // owns that dispatch (because the chrome's local `selectedSource`
  // can be wiped by layout-shape-driven remounts). The chrome only
  // delegates to `onTogglePausePreview`. The shell's audio dispatch
  // is covered separately in the WorkspaceShell test suite.
  it('Stop click delegates to onTogglePausePreview only (no chrome-side audio dispatch)', () => {
    const ctx = makeCtx({
      previewOpen: true,
      previewPaused: false,
    })
    const { getByTestId } = render(<VizEditorChrome {...ctx} />)
    pickSource(getByTestId, 'file:__example_drums__')
    vi.clearAllMocks()
    fireEvent.click(getByTestId('viz-chrome-open-preview'))

    expect(ctx.onTogglePausePreview).toHaveBeenCalledTimes(1)
    // Chrome MUST NOT dispatch audio side effects on Stop click —
    // its local selectedSource state can be stale across layout-
    // shape remounts. The shell handles this (see
    // WorkspaceShell.test.tsx).
    expect(drumStopSpy).not.toHaveBeenCalled()
    expect(drumStartSpy).not.toHaveBeenCalled()
    expect(sampleStopSpy).not.toHaveBeenCalled()
    expect(chordStopSpy).not.toHaveBeenCalled()
  })

  // ---- Dropdown change -------------------------------------------------

  it('Dropdown change from drum to none stops the drum source', () => {
    // we only stop the previous source if a preview is open
    const ctx = makeCtx({ previewOpen: true })
    const { getByTestId } = render(<VizEditorChrome {...ctx} />)
    pickSource(getByTestId, 'file:__example_drums__')
    vi.clearAllMocks()
    pickSource(getByTestId, 'none')

    expect(drumStopSpy).toHaveBeenCalledTimes(1)
    expect(ctx.onChangePreviewSource).toHaveBeenCalledWith({ kind: 'none' })
  })

  it('Dropdown change from drum to chord stops drum AND starts chord', () => {
    const ctx = makeCtx({ previewOpen: true })
    const { getByTestId } = render(<VizEditorChrome {...ctx} />)
    pickSource(getByTestId, 'file:__example_drums__')
    vi.clearAllMocks()
    pickSource(getByTestId, 'file:__example_chords__')

    expect(drumStopSpy).toHaveBeenCalledTimes(1)
    expect(chordStartSpy).toHaveBeenCalledTimes(1)
  })

  it('Dropdown change from drum to default stops the drum source', () => {
    const ctx = makeCtx({ previewOpen: true })
    const { getByTestId } = render(<VizEditorChrome {...ctx} />)
    pickSource(getByTestId, 'file:__example_drums__')
    vi.clearAllMocks()
    pickSource(getByTestId, 'default')

    expect(drumStopSpy).toHaveBeenCalledTimes(1)
  })

  it('Dropdown change does NOT stop a non-built-in source', () => {
    // Previous selection was a pattern-runtime source. Switching
    // away from it must not call any built-in stop, because the
    // pattern source isn't in the built-in registry.
    const ctx = makeCtx({ previewOpen: true })
    const { getByTestId } = render(<VizEditorChrome {...ctx} />)
    pickSource(getByTestId, 'file:pattern.strudel')
    vi.clearAllMocks()
    pickSource(getByTestId, 'none')

    expect(sampleStopSpy).not.toHaveBeenCalled()
    expect(drumStopSpy).not.toHaveBeenCalled()
    expect(chordStopSpy).not.toHaveBeenCalled()
  })

  it('Dropdown change while PAUSED does NOT auto-start the new built-in', () => {
    // The user reported: "switch between examples in the dropdown
    // while everything is stopped — the music runs but the viz
    // stays still." Picking a new source while paused must NOT
    // auto-start its audio, because the viz is frozen and the
    // resulting "audible-but-frozen" asymmetry is confusing.
    //
    // Expected behavior: dropdown change while paused just pins
    // the new sourceRef. The user must click Play to engage. The
    // shell's onTogglePausePreview reads the freshly-pinned
    // sourceRef and starts the source then.
    const ctx = makeCtx({
      previewOpen: true,
      previewPaused: true, // viz is currently paused
    })
    const { getByTestId } = render(<VizEditorChrome {...ctx} />)
    pickSource(getByTestId, 'file:__example_drums__')
    vi.clearAllMocks()
    pickSource(getByTestId, 'file:__example_chords__')

    // The new source must NOT have been auto-started.
    expect(chordStartSpy).not.toHaveBeenCalled()
    // The previous source's stop dispatch is fine — it's idempotent
    // and a no-op when the source is already stopped.
    // The shell still gets notified of the source change via
    // onChangePreviewSource so the preview tab's sourceRef is
    // updated for the next Play click.
    expect(ctx.onChangePreviewSource).toHaveBeenCalledWith({
      kind: 'file',
      fileId: '__example_chords__',
    })
  })

  it('Dropdown change while NOT paused DOES auto-start the new built-in', () => {
    // Sanity check that the running case still auto-starts (no
    // regression from the paused-state guard).
    const ctx = makeCtx({
      previewOpen: true,
      previewPaused: false, // viz is currently running
    })
    const { getByTestId } = render(<VizEditorChrome {...ctx} />)
    pickSource(getByTestId, 'file:__example_drums__')
    vi.clearAllMocks()
    pickSource(getByTestId, 'file:__example_chords__')

    expect(chordStartSpy).toHaveBeenCalledTimes(1)
    expect(drumStopSpy).toHaveBeenCalledTimes(1)
  })
})
