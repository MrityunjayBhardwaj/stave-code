import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import rehypeBaseInternalLinks from './rehype-base-internal-links.mjs'

// Deployed at stave.live/docs/ — Astro's `base` makes every generated
// URL (asset + internal link) include that prefix, so the Next app can
// serve the built output (published to app/docs-dist, served by the
// /docs/[[...slug]] route handler) and the dev rewrite can forward
// `/docs/:path*` to the Astro dev server running with the same base.
// Override via `STAVE_DOCS_BASE=/` for standalone preview.
const BASE = process.env.STAVE_DOCS_BASE ?? '/docs/'

export default defineConfig({
  site: 'https://stave.live',
  base: BASE,
  // Author-written content links (markdown bodies) are emitted verbatim by
  // Astro/Starlight — they don't get the `base` prefix that framework URLs do.
  // This plugin prefixes root-absolute internal links in content with BASE so
  // they resolve under `/docs/`. Base-agnostic: a no-op when BASE is `/`.
  markdown: {
    rehypePlugins: [[rehypeBaseInternalLinks, { base: BASE }]],
  },
  integrations: [
    starlight({
      title: 'Stave Code',
      description:
        'Browser-native live-coding editor for music (Strudel, Sonic Pi) and visuals (p5.js, Hydra).',
      logo: { src: './src/assets/stave.svg' },
      // Override Hero to base-prefix splash action links — Starlight renders
      // them verbatim, and the rehype plugin can't reach frontmatter.
      components: {
        Hero: './src/components/Hero.astro',
      },
      social: {
        github: 'https://github.com/MrityunjayBhardwaj/stave-code',
      },
      editLink: {
        baseUrl:
          'https://github.com/MrityunjayBhardwaj/stave-code/edit/main/packages/docs/',
      },
      lastUpdated: true,
      pagefind: true,
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Getting started', link: '/getting-started/' },
          ],
        },
        {
          label: 'Core concepts',
          autogenerate: { directory: 'concepts' },
        },
        {
          label: 'Runtimes',
          items: [
            { label: 'Strudel', link: '/runtimes/strudel/' },
            { label: 'Sonic Pi', link: '/runtimes/sonicpi/' },
            { label: 'p5.js', link: '/runtimes/p5/' },
            { label: 'Hydra', link: '/runtimes/hydra/' },
            { label: 'GLSL / ShaderToy', link: '/runtimes/glsl/' },
          ],
        },
        {
          label: 'Guides',
          autogenerate: { directory: 'guides' },
        },
        {
          label: 'Architecture',
          items: [
            { label: 'The viz renderer contract', link: '/architecture/renderer-contract/' },
            { label: 'Renderer: GLSL', link: '/architecture/glsl/' },
            { label: 'Renderer: Hydra', link: '/architecture/hydra/' },
            { label: 'Renderer: p5.js', link: '/architecture/p5/' },
          ],
        },
        {
          label: 'API reference',
          // Strudel reference omitted on this base — its vendored DocsIndex
          // (`strudel.json`) is a docs-site-only refactor not yet on `performance`.
          items: [
            { label: 'Sonic Pi', link: '/reference/sonicpi/' },
            { label: 'p5.js', link: '/reference/p5/' },
            { label: 'Hydra', link: '/reference/hydra/' },
          ],
        },
      ],
      customCss: ['./src/styles/custom.css'],
    }),
  ],
})
