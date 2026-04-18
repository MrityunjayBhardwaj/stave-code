/**
 * p5.js hover + completion — sourced from the official p5.js reference
 * (YUIDoc build, vendored to `data/p5.json` via
 * `scripts/fetch-docs/p5.mjs`).
 *
 * Re-sync with upstream:
 *   node packages/editor/scripts/fetch-docs/p5.mjs
 *
 * The transform trims descriptions to one sentence and picks the shortest
 * real call-site line from each method's examples, so the vendored JSON
 * stays under 200 KB.
 */

import type * as Monaco from 'monaco-editor'
import type { DocsIndex } from './types'
import { validateDocsIndex } from './types'
import { registerRuntimeProviders } from './providers'
import RAW from './data/p5.json'

validateDocsIndex('p5.json', RAW)
export const P5_DOCS_INDEX: DocsIndex = RAW as DocsIndex

export function registerP5Providers(
  monaco: typeof Monaco,
): Monaco.IDisposable[] {
  return registerRuntimeProviders(monaco, P5_DOCS_INDEX, {
    hover: true,
    dotCompletion: false,
    identifierCompletion: true,
  })
}
