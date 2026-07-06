/**
 * Regression tests for each runtime's hover payload. Asserts that a
 * real symbol from each DocsIndex produces a hover with the expected
 * signature + example/description + Reference link. Prevents future
 * refactors from silently dropping any of those hover items.
 */

import { describe, it, expect, vi } from 'vitest'
import type * as Monaco from 'monaco-editor'
import { P5_DOCS_INDEX } from '../p5'
import { HYDRA_DOCS_INDEX } from '../hydra'
import { SONICPI_DOCS_INDEX } from '../sonicpi'
import { STRUDEL_DOCS_INDEX } from '../../strudelDocs'
import { createHoverProvider } from '../providers'
import type { DocsIndex } from '../types'

function mkMonaco() {
  const registerHoverProvider = vi.fn(
    () => ({ dispose: vi.fn() }) as Monaco.IDisposable,
  )
  return {
    monaco: {
      Range: class {
        constructor(
          public sl: number,
          public sc: number,
          public el: number,
          public ec: number,
        ) {}
      },
      languages: { registerHoverProvider },
    } as unknown as typeof Monaco,
    registerHoverProvider,
  }
}

function mkModel(word: string): Monaco.editor.ITextModel {
  return {
    getWordAtPosition: () => ({
      word,
      startColumn: 1,
      endColumn: word.length + 1,
    }),
  } as unknown as Monaco.editor.ITextModel
}

function hoverFor(
  index: DocsIndex,
  word: string,
): { values: string[] } | null {
  const { monaco, registerHoverProvider } = mkMonaco()
  createHoverProvider(monaco, index)
  const provider = registerHoverProvider.mock.calls[0][1]
  const result = provider.provideHover(
    mkModel(word),
    { lineNumber: 1, column: 2 } as Monaco.Position,
    {} as Monaco.CancellationToken,
  ) as Monaco.languages.Hover | null
  if (!result) return null
  return {
    values: result.contents.map(
      (c) => (c as Monaco.IMarkdownString).value,
    ),
  }
}

describe('p5 hover payload', () => {
  it('ellipse returns signature + description + example + Reference', () => {
    const h = hoverFor(P5_DOCS_INDEX, 'ellipse')
    expect(h).not.toBeNull()
    expect(h!.values[0]).toContain('ellipse(')
    expect(h!.values.some((v) => v.toLowerCase().includes('ellipse'))).toBe(true)
    expect(h!.values.some((v) => v.startsWith('**Example:**'))).toBe(true)
    expect(
      h!.values.some((v) => v.includes('[Reference →]') && v.includes('p5js.org')),
    ).toBe(true)
  })

  it('PI constant returns hover without example', () => {
    const h = hoverFor(P5_DOCS_INDEX, 'PI')
    expect(h).not.toBeNull()
    expect(h!.values[0]).toContain('PI')
  })

  it('unknown word returns null', () => {
    expect(hoverFor(P5_DOCS_INDEX, 'definitelyNotAp5Symbol')).toBeNull()
  })
})

describe('Hydra hover payload', () => {
  it('osc returns signature with defaults + Reference', () => {
    const h = hoverFor(HYDRA_DOCS_INDEX, 'osc')
    expect(h).not.toBeNull()
    expect(h!.values[0]).toContain('osc(')
    expect(h!.values[0]).toMatch(/frequency/i)
    expect(
      h!.values.some((v) => v.includes('[Reference →]') && v.includes('hydra')),
    ).toBe(true)
  })

  it('o0 output buffer resolves', () => {
    const h = hoverFor(HYDRA_DOCS_INDEX, 'o0')
    expect(h).not.toBeNull()
    expect(h!.values.some((v) => v.toLowerCase().includes('output'))).toBe(true)
  })
})

describe('Sonic Pi hover payload', () => {
  it('live_loop returns DSL hover', () => {
    const h = hoverFor(SONICPI_DOCS_INDEX, 'live_loop')
    expect(h).not.toBeNull()
    expect(h!.values[0]).toContain('live_loop')
    expect(h!.values.some((v) => v.toLowerCase().includes('loop'))).toBe(true)
    expect(
      h!.values.some((v) => v.includes('[Reference →]') && v.includes('sonic-pi')),
    ).toBe(true)
  })

  it('synth name dull_bell resolves', () => {
    const h = hoverFor(SONICPI_DOCS_INDEX, 'dull_bell')
    expect(h).not.toBeNull()
    expect(h!.values[0]).toBe('```typescript\n:dull_bell\n```')
  })
})

describe('Strudel hover payload', () => {
  it('stack returns hover with its per-function permalink (#765)', () => {
    const h = hoverFor(STRUDEL_DOCS_INDEX, 'stack')
    expect(h).not.toBeNull()
    expect(h!.values[0]).toContain('stack(')
    expect(
      h!.values.some(
        (v) => v.includes('[Reference →]') && v.includes('strudel.cc/learn/factories/#stack'),
      ),
    ).toBe(true)
  })

  it('every (no permalink) falls back to the docsBaseUrl function browser (#765)', () => {
    const h = hoverFor(STRUDEL_DOCS_INDEX, 'every')
    expect(h).not.toBeNull()
    // `every` has no per-function anchor on strudel.cc, so it's the one entry
    // that still uses meta.docsBaseUrl — proves the `?? fallbackUrl` path lives.
    expect(
      h!.values.some(
        (v) => v.includes('[Reference →]') && v.includes('strudel.cc/functions/'),
      ),
    ).toBe(true)
  })

  it('setcps resolves with its tempo-section permalink (#767)', () => {
    const h = hoverFor(STRUDEL_DOCS_INDEX, 'setcps')
    expect(h).not.toBeNull()
    expect(h!.values[0]).toContain('setcps(')
    expect(
      h!.values.some(
        (v) => v.includes('[Reference →]') && v.includes('strudel.cc/understand/cycles/'),
      ),
    ).toBe(true)
  })

  it('setCps (camelCase) aliases to the setcps doc (#767)', () => {
    const h = hoverFor(STRUDEL_DOCS_INDEX, 'setCps')
    expect(h).not.toBeNull()
    expect(h!.values[0]).toContain('setcps(')
  })

  it('viz resolves, is flagged Stave-not-Strudel, and shows NO Reference link (#767)', () => {
    const h = hoverFor(STRUDEL_DOCS_INDEX, 'viz')
    expect(h).not.toBeNull()
    expect(h!.values[0]).toContain('.viz(')
    // explicitly states it is a Stave feature, not Strudel
    expect(h!.values.some((v) => /Stave/.test(v) && /not Strudel/i.test(v))).toBe(true)
    // no Reference→ link (empty sourceUrl suppresses the strudel.cc fallback,
    // since this is not a Strudel function)
    expect(h!.values.some((v) => v.includes('[Reference →]'))).toBe(false)
  })

  it('viz methods resolve in both forms: _name (inline) + name (backdrop) (#767)', () => {
    // inline underscore form
    const inline = hoverFor(STRUDEL_DOCS_INDEX, '_pianoroll')
    expect(inline).not.toBeNull()
    expect(inline!.values[0]).toContain('._pianoroll()')
    expect(inline!.values.some((v) => /Inline/.test(v))).toBe(true)
    expect(
      inline!.values.some(
        (v) => v.includes('[Reference →]') && v.includes('strudel.cc/learn/visual-feedback/'),
      ),
    ).toBe(true)

    // full-screen backdrop (non-underscore) form
    const bg = hoverFor(STRUDEL_DOCS_INDEX, 'pianoroll')
    expect(bg).not.toBeNull()
    expect(bg!.values[0]).toContain('.pianoroll()')
    expect(bg!.values.some((v) => /backdrop/i.test(v))).toBe(true)

    // a second viz name works too (the whole family is generated)
    expect(hoverFor(STRUDEL_DOCS_INDEX, '_scope')).not.toBeNull()
    expect(hoverFor(STRUDEL_DOCS_INDEX, 'spectrum')).not.toBeNull()
  })

  it('degradeBy camelCase still resolves', () => {
    const h = hoverFor(STRUDEL_DOCS_INDEX, 'degradeBy')
    expect(h).not.toBeNull()
    expect(h!.values[0]).toContain('degradeBy')
  })
})
