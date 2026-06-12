/**
 * Copy the built Astro output into `packages/app/docs-dist/` so the Next app's
 * /docs/[[...slug]] route handler serves it. Runs as postbuild. In dev a Next
 * rewrite forwards to the Astro dev server instead — this step is only relevant
 * for production builds.
 *
 * NOT `public/docs`: Next 16's public-static handler claims the docs' nested
 * directory clean-URLs (because each `<page>/index.html` exists) and 404s them
 * before the route handler runs (#322). Keeping the output out of `public/`
 * lets the route handler own all of `/docs/*`.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(__dirname, '../dist')
const TARGET = path.resolve(__dirname, '../../app/docs-dist')

async function rmrf(p) {
  await fs.rm(p, { recursive: true, force: true })
}

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true })
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const sp = path.join(src, entry.name)
    const dp = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      await copyDir(sp, dp)
    } else {
      await fs.copyFile(sp, dp)
    }
  }
}

await rmrf(TARGET)
await copyDir(DIST, TARGET)

const stat = await fs.stat(TARGET).catch(() => null)
if (!stat) {
  console.error('docs publish: target missing')
  process.exit(1)
}
console.log(`docs publish: ${DIST} → ${TARGET}`)
