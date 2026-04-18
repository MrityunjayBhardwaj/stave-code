/**
 * Strudel doc fetcher — placeholder until upstream ships a structured dump.
 *
 * Context
 * -------
 * Strudel generates its reference data by running jsdoc over the monorepo:
 *   https://codeberg.org/uzu/strudel → `npm run jsdoc-json`
 * The output is `doc.json` at the repo root — NOT committed and NOT served
 * as a static asset on strudel.cc. Grabbing it automatically therefore
 * requires either:
 *
 *   (a) `git clone https://codeberg.org/uzu/strudel --depth 1` + `pnpm install`
 *       + `npm run jsdoc-json` — heavy (full pnpm workspace) but gives the
 *       authoritative ~300 entries.
 *   (b) Scraping the rendered strudel.cc Functions pages — brittle because
 *       the site is Astro-built with JS hydration, so the function list
 *       isn't in the static HTML.
 *   (c) Upstream starts committing / hosting `doc.json` (filed as a
 *       follow-up idea in session notes).
 *
 * Until one of those lands, `packages/editor/src/monaco/strudelDocs.ts`
 * carries a hand-curated subset (~50 entries covering the most-used
 * pattern / transform / FX surface) that gets served through the shared
 * `DocsIndex` factory — identical markdown shape to p5 / Hydra / Sonic Pi.
 *
 * Re-run this script in the future once path (a) becomes tractable.
 */

console.error(
  'strudel docs are hand-curated — no automated fetch is wired up yet.',
)
console.error(
  'Edit packages/editor/src/monaco/strudelDocs.ts directly.',
)
console.error(
  'See this file\'s header for the upstream integration paths we\'d need to wire.',
)
// Exit non-zero so a CI script or ad-hoc `node … && …` chain notices that
// nothing was fetched — matches the contract of the sibling fetchers
// which all emit a doc index file on success.
process.exit(1)
