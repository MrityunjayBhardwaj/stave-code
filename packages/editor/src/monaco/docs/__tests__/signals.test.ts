/**
 * Signal-bus docs (Phase 21 T1) — hover resolves the bus symbols/fields,
 * identifier completion narrows to `uKick` for `uK`, the targeted dot provider
 * fires for the FIELDS only after a bus accessor (`u('bd').`) and stays silent
 * after an unrelated `.`, and every doc entry validates (signature+description).
 */

import { describe, it, expect, vi } from 'vitest'
import type * as Monaco from 'monaco-editor'
import { validateDocsIndex } from '../types'
import {
  SIGNAL_BUS_DOCS,
  registerSignalBusProviders,
  __test,
} from '../signals'

function makeMonaco() {
  const registerHover = vi.fn(
    () => ({ dispose: vi.fn() }) as Monaco.IDisposable,
  )
  const registerCompletion = vi.fn(
    () => ({ dispose: vi.fn() }) as Monaco.IDisposable,
  )
  return {
    registerHover,
    registerCompletion,
    monaco: {
      Range: class {
        constructor(
          public sl: number,
          public sc: number,
          public el: number,
          public ec: number,
        ) {}
      },
      languages: {
        registerHoverProvider: registerHover,
        registerCompletionItemProvider: registerCompletion,
        CompletionItemKind: {
          Function: 1,
          Method: 2,
          Variable: 3,
          Constant: 4,
          Keyword: 5,
          Module: 6,
          Value: 7,
          Interface: 8,
        },
      },
    } as unknown as typeof Monaco,
  }
}

function makeModel(line: string) {
  return {
    getLineContent: () => line,
    getWordAtPosition: (pos: { lineNumber: number; column: number }) => {
      const before = line.substring(0, pos.column - 1)
      const after = line.substring(pos.column - 1)
      const startMatch = /[\w$]+$/.exec(before)
      const endMatch = /^[\w$]*/.exec(after)
      const start = startMatch ? before.length - startMatch[0].length : null
      const word = (startMatch?.[0] ?? '') + (endMatch?.[0] ?? '')
      if (!word) return null
      return {
        word,
        startColumn: (start ?? before.length) + 1,
        endColumn: (start ?? before.length) + 1 + word.length,
      }
    },
    getWordUntilPosition: (pos: { lineNumber: number; column: number }) => {
      const before = line.substring(0, pos.column - 1)
      const match = /[\w$]+$/.exec(before)
      const word = match?.[0] ?? ''
      const startCol = pos.column - word.length
      return { word, startColumn: startCol, endColumn: pos.column }
    },
  } as unknown as Monaco.editor.ITextModel
}

function makePos(col: number) {
  return { lineNumber: 1, column: col } as Monaco.Position
}

/** Pull the three providers (hover, identifier-completion, dot-completion) out
 *  of a single registration for `runtime`. */
function register(runtime: 'p5js' | 'hydra') {
  const { monaco, registerHover, registerCompletion } = makeMonaco()
  registerSignalBusProviders(monaco, runtime)
  return {
    hover: registerHover.mock.calls[0][1] as Monaco.languages.HoverProvider,
    // call 0 = identifier completion, call 1 = targeted dot completion
    identifier: registerCompletion.mock.calls[0][1] as Monaco.languages.CompletionItemProvider,
    dot: registerCompletion.mock.calls[1][1] as Monaco.languages.CompletionItemProvider,
    registerHover,
    registerCompletion,
  }
}

function hoverFor(provider: Monaco.languages.HoverProvider, line: string, col: number) {
  return provider.provideHover!(
    makeModel(line),
    makePos(col),
    {} as Monaco.CancellationToken,
  ) as Monaco.languages.Hover | null
}

function completeFor(
  provider: Monaco.languages.CompletionItemProvider,
  line: string,
  col: number,
) {
  return provider.provideCompletionItems(
    makeModel(line),
    makePos(col),
    {} as Monaco.languages.CompletionContext,
    {} as Monaco.CancellationToken,
  ) as Monaco.languages.CompletionList
}

describe('SIGNAL_BUS_DOCS shape', () => {
  it('validates as a DocsIndex (every entry has signature + description)', () => {
    expect(() =>
      validateDocsIndex('signal-bus', {
        runtime: 'p5js',
        docs: SIGNAL_BUS_DOCS,
      }),
    ).not.toThrow()
  })

  it('every entry has a non-empty signature and description', () => {
    for (const [name, doc] of Object.entries(SIGNAL_BUS_DOCS)) {
      expect(doc.signature.length, `${name}.signature`).toBeGreaterThan(0)
      expect(doc.description.length, `${name}.description`).toBeGreaterThan(0)
    }
  })

  it('covers the documented symbols and fields', () => {
    for (const n of [
      'u', 'stave', 'uKick', 'uSnare', 'uHat', 'uOpenHat', 'uClap', 'uRim',
      'uTom', 'uKeyVelocity', 'uRms', 'uBass', 'uMid', 'uTreble',
      'env', 'velocity', 'note', 'color', 'rms', 'fft', 'bass', 'mid',
      'treble', 'wave', 'track', 'tracks', 'sounds',
    ]) {
      expect(SIGNAL_BUS_DOCS[n], `missing doc: ${n}`).toBeDefined()
    }
  })
})

describe.each(['p5js', 'hydra'] as const)('hover (%s)', (runtime) => {
  it('resolves uKick', () => {
    const { hover } = register(runtime)
    const h = hoverFor(hover, 'uKick', 2)
    expect(h).not.toBeNull()
    expect(h!.contents[0].value).toContain('uKick')
    expect(h!.contents.some((c) => c.value.toLowerCase().includes('kick'))).toBe(true)
  })

  it('resolves rms', () => {
    const { hover } = register(runtime)
    const h = hoverFor(hover, 'rms', 2)
    expect(h).not.toBeNull()
    expect(h!.contents.some((c) => c.value.toLowerCase().includes('rms'))).toBe(true)
  })

  it('resolves fft and states it is an array in both runtimes', () => {
    const { hover } = register(runtime)
    const h = hoverFor(hover, 'fft', 2)
    expect(h).not.toBeNull()
    expect(h!.contents.some((c) => c.value.toLowerCase().includes('array'))).toBe(true)
  })

  it('returns null for an unrelated word', () => {
    const { hover } = register(runtime)
    expect(hoverFor(hover, 'circle', 2)).toBeNull()
  })
})

describe.each(['p5js', 'hydra'] as const)('identifier completion (%s)', (runtime) => {
  it('suggests uKick for prefix uK', () => {
    const { identifier } = register(runtime)
    const list = completeFor(identifier, 'uK', 3)
    expect(list.suggestions.some((s) => s.label === 'uKick')).toBe(true)
  })

  it('does NOT suggest bare field names (env) as identifiers', () => {
    const { identifier } = register(runtime)
    const list = completeFor(identifier, 'en', 3)
    // 'env' is a FIELD, not a top-level symbol — must not appear here.
    expect(list.suggestions.some((s) => s.label === 'env')).toBe(false)
  })
})

describe.each(['p5js', 'hydra'] as const)('targeted dot completion (%s)', (runtime) => {
  it("suggests rms/fft/env after u('bd').", () => {
    const { dot } = register(runtime)
    const line = "circle(x, u('bd')."
    const list = completeFor(dot, line, line.length + 1)
    const labels = list.suggestions.map((s) => s.label)
    expect(labels).toContain('rms')
    expect(labels).toContain('fft')
    expect(labels).toContain('env')
  })

  it('fires after u. and stave.u.', () => {
    const { dot } = register(runtime)
    for (const line of ['osc(() => u.', 'stave.u.']) {
      const list = completeFor(dot, line, line.length + 1)
      expect(list.suggestions.length, line).toBeGreaterThan(0)
    }
  })

  it("fires after .track('x').", () => {
    const { dot } = register(runtime)
    const line = "u.track('$0')."
    const list = completeFor(dot, line, line.length + 1)
    expect(list.suggestions.some((s) => s.label === 'color')).toBe(true)
  })

  it('does NOT suggest the bus symbols (u/uKick) — fields only', () => {
    const { dot } = register(runtime)
    const line = "u('bd')."
    const list = completeFor(dot, line, line.length + 1)
    const labels = list.suggestions.map((s) => s.label)
    expect(labels).not.toContain('u')
    expect(labels).not.toContain('uKick')
  })

  it('stays silent after an unrelated dot (someShape.)', () => {
    const { dot } = register(runtime)
    const line = 'someShape.'
    const list = completeFor(dot, line, line.length + 1)
    expect(list.suggestions).toHaveLength(0)
  })

  it('stays silent after circle().', () => {
    const { dot } = register(runtime)
    const line = 'circle().'
    const list = completeFor(dot, line, line.length + 1)
    expect(list.suggestions).toHaveLength(0)
  })
})

describe('BUS_ACCESSOR_RE', () => {
  it('matches bus accessors', () => {
    for (const s of [
      "u('bd').",
      'u("sd").',
      'u.',
      'stave.u.',
      "u.track('$0').",
      "circle(x, u('bd').r",
    ]) {
      expect(__test.BUS_ACCESSOR_RE.test(s), s).toBe(true)
    }
  })

  it('does NOT match unrelated dots', () => {
    for (const s of ['someShape.', 'circle().', 'foo.bar.', 'const x = ']) {
      expect(__test.BUS_ACCESSOR_RE.test(s), s).toBe(false)
    }
  })
})
