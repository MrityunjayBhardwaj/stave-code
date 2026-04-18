/**
 * Sonic Pi hover + completion — assembled from the upstream sonic-pi repo:
 *   - Language functions scraped from `app/server/ruby/lib/sonicpi/lang/*.rb`
 *     via the `doc name:` metadata blocks.
 *   - Synth symbols from `etc/doc/cheatsheets/synths.md`.
 *   - FX symbols from `etc/doc/cheatsheets/fx.md`.
 *
 * Re-sync with upstream:
 *   node packages/editor/scripts/fetch-docs/sonicpi.mjs
 *
 * Monaco's `getWordAtPosition` stops at `:`, so `:dull_bell` resolves to
 * the bare `dull_bell` identifier — which the docs index stores under
 * that bare key. One lookup covers both forms.
 */

import type * as Monaco from 'monaco-editor'
import type { DocsIndex } from './types'
import { registerRuntimeProviders } from './providers'
import RAW from './data/sonicpi.json'

export const SONICPI_DOCS_INDEX: DocsIndex = RAW as DocsIndex

export function registerSonicPiProviders(
  monaco: typeof Monaco,
): Monaco.IDisposable[] {
  return registerRuntimeProviders(monaco, SONICPI_DOCS_INDEX, {
    hover: true,
    dotCompletion: false,
    identifierCompletion: true,
  })
}
