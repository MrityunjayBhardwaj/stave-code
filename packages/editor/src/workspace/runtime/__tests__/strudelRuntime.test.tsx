/**
 * STRUDEL_RUNTIME — unit tests (Phase 10.2 Task 05).
 *
 * Asserts the provider shape, the chrome render path (transport, BPM,
 * error, chromeExtras), and — most importantly — the source-grep guard
 * that no runtime/ source file references `Pattern.prototype`. The
 * grep is the canary for PV2 / P2: a maintainer thinking the runtime
 * should "own" the viz interceptor here would touch `Pattern.prototype`
 * and the test would fail before the bad code ever runs.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, fireEvent, cleanup } from '@testing-library/react'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { STRUDEL_RUNTIME } from '../strudelRuntime'
import { LiveCodingRuntime } from '../LiveCodingRuntime'
import type {
  ChromeContext,
  WorkspaceFile,
} from '../../types'
import type { LiveCodingEngine } from '../../../engine/LiveCodingEngine'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RUNTIME_DIR = path.resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// Provider shape
// ---------------------------------------------------------------------------

describe('STRUDEL_RUNTIME provider', () => {
  it('declares .strudel extension and strudel language', () => {
    expect(STRUDEL_RUNTIME.extensions).toContain('.strudel')
    expect(STRUDEL_RUNTIME.language).toBe('strudel')
  })

  it('createEngine returns a fresh LiveCodingEngine instance per call', () => {
    const a = STRUDEL_RUNTIME.createEngine()
    const b = STRUDEL_RUNTIME.createEngine()
    expect(a).not.toBe(b)
    // Both implement the LiveCodingEngine interface (init/evaluate/play/...)
    expect(typeof a.init).toBe('function')
    expect(typeof a.evaluate).toBe('function')
    expect(typeof a.play).toBe('function')
    expect(typeof a.stop).toBe('function')
    expect(typeof a.dispose).toBe('function')
    // Dispose immediately so the test doesn't leak the engine state.
    a.dispose()
    b.dispose()
  })
})

// ---------------------------------------------------------------------------
// Chrome rendering
// ---------------------------------------------------------------------------

describe('STRUDEL_RUNTIME renderChrome', () => {
  // Cleanup between cases — render() appends to document.body and
  // queries via testid scan the global tree. Without explicit cleanup,
  // the BPM-hide test would still see a previous test's BPM badge.
  afterEach(() => cleanup())

  // A minimal stub WorkspaceFile + LiveCodingRuntime — the chrome only
  // reads from the ChromeContext fields, never from the runtime methods,
  // so an unconstructed runtime stand-in is fine here.
  function makeCtx(overrides: Partial<ChromeContext> = {}): ChromeContext {
    const file: WorkspaceFile = {
      id: 'file-1',
      path: '/pattern.strudel',
      content: '',
      language: 'strudel',
    }
    return {
      runtime: {} as LiveCodingRuntime,
      file,
      isPlaying: false,
      error: null,
      bpm: undefined,
      onPlay: vi.fn(),
      onStop: vi.fn(),
      ...overrides,
    }
  }

  it('renders the play button when not playing and calls onPlay on click', () => {
    const onPlay = vi.fn()
    const ctx = makeCtx({ onPlay })
    const { getByTestId } = render(STRUDEL_RUNTIME.renderChrome(ctx) as React.ReactElement)
    const btn = getByTestId('strudel-chrome-transport')
    expect(btn.textContent).toContain('Play')
    fireEvent.click(btn)
    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  it('renders the stop button when playing and calls onStop on click', () => {
    const onStop = vi.fn()
    const ctx = makeCtx({ isPlaying: true, onStop })
    const { getByTestId } = render(STRUDEL_RUNTIME.renderChrome(ctx) as React.ReactElement)
    const btn = getByTestId('strudel-chrome-transport')
    expect(btn.textContent).toContain('Stop')
    fireEvent.click(btn)
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('shows BPM when defined', () => {
    const withBpm = render(
      STRUDEL_RUNTIME.renderChrome(makeCtx({ bpm: 120 })) as React.ReactElement,
    )
    expect(withBpm.queryByTestId('strudel-chrome-bpm')?.textContent).toContain('120 BPM')
  })

  it('hides BPM when undefined', () => {
    const withoutBpm = render(
      STRUDEL_RUNTIME.renderChrome(makeCtx()) as React.ReactElement,
    )
    expect(withoutBpm.queryByTestId('strudel-chrome-bpm')).toBeNull()
  })

  it('shows the error badge when error is present', () => {
    const err = new Error('parse error: line 3')
    const { getByTestId } = render(
      STRUDEL_RUNTIME.renderChrome(makeCtx({ error: err })) as React.ReactElement,
    )
    expect(getByTestId('strudel-chrome-error').textContent).toBe('parse error: line 3')
  })

  it('renders chromeExtras when provided', () => {
    const extras = <button data-testid="extras-export">Export</button>
    const { getByTestId } = render(
      STRUDEL_RUNTIME.renderChrome(makeCtx({ chromeExtras: extras })) as React.ReactElement,
    )
    expect(getByTestId('strudel-chrome-extras')).toBeTruthy()
    expect(getByTestId('extras-export').textContent).toBe('Export')
  })
})

// ---------------------------------------------------------------------------
// PV2 / P2 source-grep guard
// ---------------------------------------------------------------------------

describe('Pattern.prototype hands-off (PV2 / P2 guard)', () => {
  it('no runtime/ source file references Pattern.prototype', () => {
    const offenders: string[] = []
    const checkFile = (filePath: string) => {
      const content = fs.readFileSync(filePath, 'utf8')
      // Strip block + line comments so the JSDoc explanations of WHY the
      // restriction exists do not trip the grep. The check is about real
      // code touching the prototype, not about the documentation that
      // explains why we never do.
      const stripped = content
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      if (/Pattern\.prototype/.test(stripped)) {
        offenders.push(filePath)
      }
    }
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '__tests__') continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          checkFile(full)
        }
      }
    }
    walk(RUNTIME_DIR)
    expect(offenders).toEqual([])
  })
})
