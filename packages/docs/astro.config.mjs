import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

// Deployed at stave.live/docs/ — Astro's `base` makes every generated
// URL (asset + internal link) include that prefix, so the Next app can
// serve the built output from `public/docs/` and the dev rewrite can
// forward `/docs/:path*` to the Astro dev server running with the same
// base. Override via `STAVE_DOCS_BASE=/` for standalone preview.
const BASE = process.env.STAVE_DOCS_BASE ?? '/docs/'

export default defineConfig({
  site: 'https://stave.live',
  base: BASE,
  integrations: [
    starlight({
      title: 'Stave Code',
      description:
        'Browser-native live-coding editor for music (Strudel, Sonic Pi) and visuals (p5.js, Hydra).',
      logo: { src: './src/assets/stave.svg' },
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
          ],
        },
        {
          label: 'API reference',
          items: [
            { label: 'Strudel', link: '/reference/strudel/' },
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
