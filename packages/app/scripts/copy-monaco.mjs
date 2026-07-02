// Self-host Monaco (#690): copy `monaco-editor/min/vs` into `public/monaco/vs`
// so `@monaco-editor/loader` (configured with `paths.vs = /monaco/vs` in
// @stave/editor's warmMonaco.ts) loads the editor core + workers from our own
// origin instead of the jsdelivr CDN. Runs before `next dev` / `next build`.
//
// Version-stamped: skips the copy when the assets for the installed
// monaco-editor version are already present, so it doesn't slow repeat dev
// starts. The copied assets are gitignored (regenerated from node_modules).
import { createRequire } from 'node:module'
import { cp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))

const monacoPkgPath = require.resolve('monaco-editor/package.json')
const monacoDir = dirname(monacoPkgPath)
const version = JSON.parse(await readFile(monacoPkgPath, 'utf8')).version

const vsSrc = join(monacoDir, 'min', 'vs')
const destRoot = join(here, '..', 'public', 'monaco')
const vsDest = join(destRoot, 'vs')
const stampFile = join(destRoot, '.monaco-version')

const exists = async (p) => {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

const stamp = (await exists(stampFile)) ? (await readFile(stampFile, 'utf8')).trim() : null
if (stamp === version && (await exists(vsDest))) {
  console.log(`[copy-monaco] monaco-editor@${version} vs assets already present — skipping`)
  process.exit(0)
}

console.log(`[copy-monaco] copying monaco-editor@${version} min/vs → public/monaco/vs`)
await rm(vsDest, { recursive: true, force: true })
await mkdir(destRoot, { recursive: true })
await cp(vsSrc, vsDest, { recursive: true })
await writeFile(stampFile, `${version}\n`)
console.log('[copy-monaco] done')
