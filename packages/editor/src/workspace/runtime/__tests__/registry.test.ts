/**
 * Runtime registry — unit tests (Phase 10.2 Task 05).
 *
 * Covers idempotent registration, extension normalization, and language
 * lookup. The registry is a thin Map wrapper, but Task 09's compat shims
 * and Task 10's app rewire iterate it to discover providers — getting the
 * normalization wrong (e.g. missing the leading-dot canonicalization)
 * would silently break those callers, so the contract is locked here.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerRuntimeProvider,
  getRuntimeProviderForExtension,
  getRuntimeProviderForLanguage,
  liveCodingRuntimeRegistry,
  resetRuntimeRegistryForTests,
} from '../registry'
import type {
  LiveCodingRuntimeProvider,
  WorkspaceLanguage,
} from '../../types'

function stub(
  language: WorkspaceLanguage,
  extensions: readonly string[],
): LiveCodingRuntimeProvider {
  return {
    extensions,
    language,
    createEngine: () =>
      ({
        init: async () => {},
        evaluate: async () => ({}),
        play: () => {},
        stop: () => {},
        dispose: () => {},
        get components() {
          return {}
        },
        setRuntimeErrorHandler: () => {},
      } as unknown as ReturnType<LiveCodingRuntimeProvider['createEngine']>),
    renderChrome: () => null,
  }
}

describe('runtime registry', () => {
  beforeEach(() => {
    resetRuntimeRegistryForTests()
  })

  it('register + lookup by extension (with leading dot)', () => {
    const p = stub('strudel', ['.strudel'])
    registerRuntimeProvider(p)
    expect(getRuntimeProviderForExtension('.strudel')).toBe(p)
  })

  it('lookup normalizes input — accepts dotted and undotted form', () => {
    const p = stub('strudel', ['.strudel'])
    registerRuntimeProvider(p)
    expect(getRuntimeProviderForExtension('strudel')).toBe(p)
    expect(getRuntimeProviderForExtension('.strudel')).toBe(p)
  })

  it('register normalizes claimed extensions to leading-dot form', () => {
    // Provider declares ext WITHOUT a dot; the registry still keys it
    // canonically. This is the behavior the iteration in Task 09 / Task 10
    // depends on — they don't have to know which form a provider used.
    const p = stub('sonicpi', ['sonicpi'])
    registerRuntimeProvider(p)
    expect(getRuntimeProviderForExtension('.sonicpi')).toBe(p)
    expect(liveCodingRuntimeRegistry.has('.sonicpi')).toBe(true)
  })

  it('register + lookup by language id', () => {
    const p = stub('sonicpi', ['.sonicpi'])
    registerRuntimeProvider(p)
    expect(getRuntimeProviderForLanguage('sonicpi')).toBe(p)
  })

  it('returns undefined for unknown extensions and languages', () => {
    expect(getRuntimeProviderForExtension('.tidal')).toBeUndefined()
    expect(getRuntimeProviderForLanguage('tidal')).toBeUndefined()
  })

  it('re-registering an extension replaces the previous entry', () => {
    const p1 = stub('strudel', ['.strudel'])
    const p2 = stub('strudel', ['.strudel'])
    registerRuntimeProvider(p1)
    registerRuntimeProvider(p2)
    expect(getRuntimeProviderForExtension('.strudel')).toBe(p2)
  })

  it('a provider claiming multiple extensions registers under all of them', () => {
    const p = stub('strudel', ['.strudel', '.str'])
    registerRuntimeProvider(p)
    expect(getRuntimeProviderForExtension('.strudel')).toBe(p)
    expect(getRuntimeProviderForExtension('.str')).toBe(p)
  })

  it('resetRuntimeRegistryForTests clears all entries', () => {
    registerRuntimeProvider(stub('strudel', ['.strudel']))
    registerRuntimeProvider(stub('sonicpi', ['.sonicpi']))
    resetRuntimeRegistryForTests()
    expect(getRuntimeProviderForExtension('.strudel')).toBeUndefined()
    expect(getRuntimeProviderForLanguage('sonicpi')).toBeUndefined()
    expect(liveCodingRuntimeRegistry.size).toBe(0)
  })
})
