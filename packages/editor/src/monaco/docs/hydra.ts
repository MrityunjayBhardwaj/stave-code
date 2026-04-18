/**
 * Hydra hover + completion — sourced from the hydra-synth function list
 * (`glsl-functions.js` vendored as `data/hydra.json` via
 * `scripts/fetch-docs/hydra.mjs`) plus a small hand-curated set of
 * runtime-only globals (output buffers, `hush`, `time`, etc.) that don't
 * live in the GLSL list.
 *
 * Re-sync with upstream:
 *   node packages/editor/scripts/fetch-docs/hydra.mjs
 */

import type * as Monaco from 'monaco-editor'
import type { DocsIndex } from './types'
import { validateDocsIndex } from './types'
import { registerRuntimeProviders } from './providers'
import RAW from './data/hydra.json'

validateDocsIndex('hydra.json', RAW)
export const HYDRA_DOCS_INDEX: DocsIndex = RAW as DocsIndex

export function registerHydraProviders(
  monaco: typeof Monaco,
): Monaco.IDisposable[] {
  return registerRuntimeProviders(monaco, HYDRA_DOCS_INDEX, {
    hover: true,
    dotCompletion: true,
    identifierCompletion: true,
  })
}
