/**
 * Preview registry — unit tests (Phase 10.2 Task 06).
 *
 * Mirrors `workspace/runtime/__tests__/registry.test.ts` line-for-line so
 * the two registries stay behaviorally identical. The contracts that
 * matter: extension normalization (dotted ↔ undotted), idempotent
 * registration, language-keyed lookup, and the test-only reset helper.
 *
 * Getting any of these wrong would silently break Task 09's compat shims
 * and Task 10's app rewire, both of which iterate this registry to
 * discover which providers exist. Locking the contract here catches
 * regressions before they propagate.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerPreviewProvider,
  getPreviewProviderForExtension,
  getPreviewProviderForLanguage,
  previewProviderRegistry,
  resetPreviewRegistryForTests,
} from '../registry'
import type { PreviewProvider } from '../../PreviewProvider'

/**
 * Build a minimal PreviewProvider stub with the given extensions. The
 * render function is a no-op returning null — the registry never calls
 * render during lookup, so the stub can stay trivial.
 */
function stub(extensions: readonly string[], label = 'stub'): PreviewProvider {
  return {
    extensions,
    label,
    keepRunningWhenHidden: false,
    reload: 'debounced',
    debounceMs: 300,
    render: () => null,
  }
}

describe('preview registry', () => {
  beforeEach(() => {
    resetPreviewRegistryForTests()
  })

  it('register + lookup by extension (with leading dot)', () => {
    const p = stub(['.hydra'])
    registerPreviewProvider(p)
    expect(getPreviewProviderForExtension('.hydra')).toBe(p)
  })

  it('lookup normalizes input — accepts dotted and undotted form', () => {
    const p = stub(['.hydra'])
    registerPreviewProvider(p)
    expect(getPreviewProviderForExtension('hydra')).toBe(p)
    expect(getPreviewProviderForExtension('.hydra')).toBe(p)
  })

  it('register normalizes claimed extensions to leading-dot form', () => {
    // Provider declares ext WITHOUT a dot; the registry still keys it
    // canonically so Task 09 / Task 10 iteration doesn't have to care
    // which form a provider used.
    const p = stub(['p5'])
    registerPreviewProvider(p)
    expect(getPreviewProviderForExtension('.p5')).toBe(p)
    expect(previewProviderRegistry.has('.p5')).toBe(true)
  })

  it('register + lookup by language id (hydra)', () => {
    const p = stub(['.hydra'])
    registerPreviewProvider(p)
    // .hydra → language 'hydra'
    expect(getPreviewProviderForLanguage('hydra')).toBe(p)
  })

  it('register + lookup by language id (p5js — note the js suffix)', () => {
    const p = stub(['.p5'])
    registerPreviewProvider(p)
    // .p5 → language 'p5js' (the Monaco language id used by the p5 editor)
    expect(getPreviewProviderForLanguage('p5js')).toBe(p)
  })

  it('returns undefined for unknown extensions and languages', () => {
    expect(getPreviewProviderForExtension('.glsl')).toBeUndefined()
    expect(getPreviewProviderForLanguage('glsl')).toBeUndefined()
  })

  it('re-registering an extension replaces the previous entry', () => {
    const p1 = stub(['.hydra'], 'first')
    const p2 = stub(['.hydra'], 'second')
    registerPreviewProvider(p1)
    registerPreviewProvider(p2)
    expect(getPreviewProviderForExtension('.hydra')).toBe(p2)
  })

  it('a provider claiming multiple extensions registers under all of them', () => {
    const p = stub(['.hydra', '.hy'])
    registerPreviewProvider(p)
    expect(getPreviewProviderForExtension('.hydra')).toBe(p)
    expect(getPreviewProviderForExtension('.hy')).toBe(p)
  })

  it('resetPreviewRegistryForTests clears all entries', () => {
    registerPreviewProvider(stub(['.hydra']))
    registerPreviewProvider(stub(['.p5']))
    resetPreviewRegistryForTests()
    expect(getPreviewProviderForExtension('.hydra')).toBeUndefined()
    expect(getPreviewProviderForLanguage('p5js')).toBeUndefined()
    expect(previewProviderRegistry.size).toBe(0)
  })

  it('MARKDOWN_HTML is NOT auto-registered (U7 deferred to Phase 10.3)', () => {
    // This is a documentation test — the registry ships empty by default
    // and nothing in workspace/preview/index.ts registers a markdown
    // provider. When Phase 10.3 lands, this assertion flips.
    resetPreviewRegistryForTests()
    expect(getPreviewProviderForExtension('.md')).toBeUndefined()
    expect(getPreviewProviderForLanguage('markdown')).toBeUndefined()
  })
})
