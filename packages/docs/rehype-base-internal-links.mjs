/**
 * rehype-base-internal-links
 *
 * Prefixes root-absolute internal links in docs CONTENT with the configured
 * Astro `base`, so author-written links work when the site is served under a
 * subpath (`base: '/docs/'`).
 *
 * Why this is needed: Astro/Starlight only base-prefixes framework-generated
 * URLs (favicon, sitemap, sidebar config links via `pathWithBase`). Links an
 * author writes in markdown bodies (`[x](/architecture/...)`) and HTML pass
 * through verbatim — so under `base: '/docs/'` they resolve to `/architecture/...`
 * (the host app's catch-all) instead of `/docs/architecture/...`.
 *
 * Base-agnostic: it receives the resolved base and skips anything already
 * carrying it, so `STAVE_DOCS_BASE=/` (standalone preview) is a clean no-op.
 *
 * Scope note: `markdown.rehypePlugins` runs over the per-page markdown/MDX
 * content tree ONLY — not the surrounding Starlight chrome (nav, sidebar are
 * `.astro` components). So this can only touch author content links, never the
 * already-correct framework links. That's the safety property that lets it run
 * blanket over every `<a href>`/`<img src>` without risk of double-prefixing.
 *
 * Dependency-free walker (unist-util-visit is not resolvable at the docs root).
 *
 * Assumption: every root-absolute (`/…`) link in docs content is docs-INTERNAL.
 * This holds for a docs site — authors link within the docs. If you ever need to
 * link to a host-app route OUTSIDE the docs (e.g. the Stave editor at `/`), this
 * plugin would wrongly prefix it to `/docs/…`. Escape hatch: write a full origin
 * URL (`https://stave.live/`) or a protocol-relative `//…` — both are skipped.
 */

const ATTR_FOR = { a: 'href', area: 'href', img: 'src', source: 'src' }

export default function rehypeBaseInternalLinks({ base = '/' } = {}) {
  // Normalise to a leading+trailing-slash form, e.g. '/docs/'.
  const b = ('/' + base + '/').replace(/\/{2,}/g, '/')
  // No subpath → nothing to prefix (e.g. STAVE_DOCS_BASE=/).
  if (b === '/') return () => {}
  const prefix = b.slice(0, -1) // '/docs'

  const walk = (node) => {
    if (node.type === 'element') {
      const attr = ATTR_FOR[node.tagName]
      const val = attr && node.properties ? node.properties[attr] : undefined
      if (
        typeof val === 'string' &&
        val.startsWith('/') && // root-absolute only…
        !val.startsWith('//') && // …but not protocol-relative
        val !== prefix && // not already exactly the base root
        !val.startsWith(b) // not already base-prefixed
      ) {
        node.properties[attr] = prefix + val
      }
    }
    if (node.children) for (const child of node.children) walk(child)
  }

  return (tree) => walk(tree)
}
