/**
 * Live coding runtime provider registry — Phase 10.2 Task 05.
 *
 * Module-level Map keyed by file extension. Provider registration is
 * idempotent on extension; calling `registerRuntimeProvider(p)` for an
 * extension that already has a provider replaces the previous entry. This
 * matches the `VizPresetStore` precedent (the singleton store pattern Phase
 * 10.2 follows for every workspace registry — see `WorkspaceAudioBus.ts`'s
 * "Why a singleton" remark for the rationale).
 *
 * @remarks
 * ## Extension keying convention
 *
 * Keys include the leading dot (`.strudel`, `.sonicpi`). Mirrors how Node
 * and most editors talk about file extensions, and avoids the "is `.foo`
 * or `foo` the canonical form?" ambiguity that bites multi-language
 * routers. The lookup helpers normalize on input — callers can pass either
 * `.strudel` or `strudel` and get the same provider back.
 *
 * Each provider may claim multiple extensions (its `extensions` array).
 * `registerRuntimeProvider` registers under every claimed extension. If
 * another provider had previously registered any of those extensions, the
 * later call wins for those keys (a provider that claims `.foo` and `.bar`
 * after a previous provider claimed only `.bar` will overwrite `.bar` and
 * coexist with the previous one on `.foo`).
 *
 * ## Why also key by language
 *
 * Tab dispatch knows the file's language (`WorkspaceFile.language`), not
 * its extension. The two are 1:1 in 10.2 but the indirection lets future
 * languages with multiple extensions (e.g., `.tidal` + `.tidalcycles` →
 * `tidal`) avoid extension-leak through the chrome-resolution path. The
 * registry keeps a parallel `Map<language, provider>` so language-keyed
 * lookups stay O(1).
 *
 * ## Test isolation
 *
 * `resetRuntimeRegistryForTests()` clears the maps. Same pattern as
 * `__resetWorkspaceAudioBusForTests` — tests in `__tests__/` call this in
 * `beforeEach` to avoid cross-test leakage when one test registers a
 * provider another test doesn't expect.
 */

import type { LiveCodingRuntimeProvider } from '../types'

const byExtension = new Map<string, LiveCodingRuntimeProvider>()
const byLanguage = new Map<string, LiveCodingRuntimeProvider>()

/**
 * Normalize an extension input to the canonical leading-dot form. `'foo'`
 * → `'.foo'`; `'.foo'` → `'.foo'`. Empty / undefined inputs return
 * `undefined` (callers handle the lookup-miss path).
 */
function normalizeExtension(ext: string | undefined): string | undefined {
  if (!ext) return undefined
  return ext.startsWith('.') ? ext : `.${ext}`
}

/**
 * Register a provider under every extension it claims AND its language id.
 * Calling for the same extension twice replaces the previous provider for
 * THAT extension only — other extensions are unaffected. This is the
 * "registration is idempotent on key" semantics every workspace registry
 * uses.
 */
export function registerRuntimeProvider(
  provider: LiveCodingRuntimeProvider,
): void {
  for (const rawExt of provider.extensions) {
    const ext = normalizeExtension(rawExt)
    if (ext) byExtension.set(ext, provider)
  }
  byLanguage.set(provider.language, provider)
}

/**
 * Look up a provider by file extension. Accepts either dotted (`.strudel`)
 * or undotted (`strudel`) form. Returns `undefined` if no provider is
 * registered for the extension.
 */
export function getRuntimeProviderForExtension(
  extension: string,
): LiveCodingRuntimeProvider | undefined {
  const key = normalizeExtension(extension)
  if (!key) return undefined
  return byExtension.get(key)
}

/**
 * Look up a provider by workspace language id (e.g., `'strudel'`,
 * `'sonicpi'`). The shell's per-tab chrome resolution uses this — the tab
 * carries a language string (via `WorkspaceFile.language`), not an
 * extension. Returns `undefined` if no provider is registered for the
 * language.
 */
export function getRuntimeProviderForLanguage(
  language: string,
): LiveCodingRuntimeProvider | undefined {
  return byLanguage.get(language)
}

/**
 * The full registry as a read-only Map keyed by extension. Used by Task 09
 * (compat shims) and Task 10 (app rewire) when wiring `chromeForTab` —
 * those callers iterate the registry to discover the set of pattern-file
 * languages currently registered. The map is intentionally immutable from
 * the caller's perspective: mutation goes through `registerRuntimeProvider`
 * so both maps stay in sync.
 */
export const liveCodingRuntimeRegistry: ReadonlyMap<
  string,
  LiveCodingRuntimeProvider
> = byExtension

/**
 * TESTING ONLY — reset every internal map. Used by unit tests to ensure
 * isolation between cases. Mirrors `__resetWorkspaceAudioBusForTests`.
 * Not exported via the package barrel; tests import directly.
 */
export function resetRuntimeRegistryForTests(): void {
  byExtension.clear()
  byLanguage.clear()
}
