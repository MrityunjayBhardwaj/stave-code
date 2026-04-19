/**
 * Strudel function documentation.
 *
 * The entries live in `monaco/docs/data/strudel.json` alongside the
 * other runtime indexes. They're hand-curated for now — upstream
 * strudel generates doc.json at build time via `npm run jsdoc-json`
 * but doesn't commit or host it. See
 * `packages/editor/scripts/fetch-docs/strudel.mjs` for the paths we'd
 * need to automate the larger ~300-entry import.
 *
 * STRUDEL_DOCS_INDEX plugs into the same hover/completion factories
 * the other runtimes use (see monaco/docs/providers.ts).
 * STRUDEL_DOCS is re-exported as `Record<string, RuntimeDoc>` for
 * existing consumers (strudelCompletions.ts, tests).
 */

import type * as Monaco from 'monaco-editor'
import type { DocsIndex, RuntimeDoc } from './docs/types'
import { validateDocsIndex } from './docs/types'
import { createHoverProvider } from './docs/providers'
import RAW from './docs/data/strudel.json'

validateDocsIndex('strudel.json', RAW)
export const STRUDEL_DOCS_INDEX: DocsIndex = RAW as DocsIndex
export const STRUDEL_DOCS: Record<string, RuntimeDoc> = STRUDEL_DOCS_INDEX.docs

export function registerStrudelHover(
  monaco: typeof Monaco,
): Monaco.IDisposable {
  return createHoverProvider(monaco, STRUDEL_DOCS_INDEX)
}
