#!/usr/bin/env node
/**
 * parity-refresh.mjs — maintainer-only upstream drift surfacer (γ-3).
 *
 * Reads the SHA pin from `packages/app/tests/parity-corpus/CORPUS-SOURCE.md`
 * (or accepts `--sha <new>`), fetches `website/src/repl/tunes.mjs` from
 * upstream `uzu/strudel` on Codeberg, re-extracts the 16 curated tunes
 * by named export, and prints a unified diff for every tune whose body
 * differs from the currently-vendored `.strudel` copy.
 *
 * IMPORTANT — this script:
 *   - Never overwrites a corpus file. Output is a human diff.
 *   - Never runs on CI. Live network is forbidden on PR CI per PLAN §2
 *     D-04. The vitest spec at parity.test.ts is the CI gate; this is
 *     the maintainer-side tool for moving the SHA pin forward.
 *   - Never auto-commits. The maintainer applies any accepted diff by
 *     hand in a PR titled `corpus: refresh from upstream SHA <x>` and
 *     regenerates snapshots there with `vitest -u`.
 *
 * Exit code is always 0 when the network succeeds — the purpose is
 * surfacing drift, not gating. A non-zero exit means the fetch itself
 * failed (network flake, upstream rate limit, removed file).
 *
 * Usage:
 *   node packages/app/scripts/parity-refresh.mjs                  # diff against upstream main
 *   node packages/app/scripts/parity-refresh.mjs --sha <hexsha>   # diff against a specific SHA
 *
 * Wired as `pnpm parity:refresh` (root package.json).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const corpusDir = path.resolve(here, '..', 'tests', 'parity-corpus')
const sourceFile = path.join(corpusDir, 'CORPUS-SOURCE.md')

// Tunes to re-extract. Keep in lockstep with the CORPUS-SOURCE.md curated
// list — if a tune is added/removed there, mirror the change here.
//
// 20-15 V-2: the `bakery-*.strudel` fixtures (the 6 closed Bakery
// gap-class repros) live in the same corpus dir but are NOT upstream
// `tunes.mjs` exports — they are minimal repros distilled from issues
// #132/#134-#138 (provenance in BAKERY-FIXTURES.md). They MUST NOT appear
// in TARGETS or this maintainer tool would report them as permanent
// "missing upstream" drift forever. The list below is upstream-only by
// construction; the assertion further down enforces it so a future edit
// can't accidentally add a `bakery-*` entry.
const TARGETS = [
  'chop',
  'delay',
  'orbit',
  'belldub',
  'sampleDrums',
  'randomBells',
  'barryHarris',
  'echoPiano',
  'holyflute',
  'flatrave',
  'amensister',
  'juxUndTollerei',
  'bassFuge',
  'dinofunk',
  'meltingsubmarine',
  'arpoon',
]

// 20-15 V-2 guard: TARGETS is upstream-only. A `bakery-*` entry here
// would make this tool falsely report a vendored repro as upstream drift.
if (TARGETS.some((t) => t.startsWith('bakery-'))) {
  throw new Error(
    'parity-refresh TARGETS must be upstream tunes only — a bakery-* ' +
      'fixture leaked in (see BAKERY-FIXTURES.md; these are non-upstream).',
  )
}

const args = process.argv.slice(2)
let overrideSha
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--sha' && args[i + 1]) {
    overrideSha = args[i + 1]
    i++
  }
}

async function readCurrentSha() {
  const md = await fs.readFile(sourceFile, 'utf8')
  const m = md.match(/Commit SHA \| `([0-9a-f]{40})`/i)
  if (!m) {
    throw new Error(
      'Could not find current SHA pin in CORPUS-SOURCE.md — expected a `Commit SHA | <hash>` row.',
    )
  }
  return m[1]
}

function buildUrl(sha) {
  if (sha) {
    return `https://codeberg.org/uzu/strudel/raw/commit/${sha}/website/src/repl/tunes.mjs`
  }
  // Latest tip of main.
  return 'https://codeberg.org/uzu/strudel/raw/branch/main/website/src/repl/tunes.mjs'
}

async function fetchUpstream(sha) {
  const url = buildUrl(sha)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status}): ${url}`)
  }
  return await res.text()
}

function extractTune(source, name) {
  // Mirrors the γ-1 extractor — match `export const <name> = \`...\`;`
  // tolerating any chars (including newlines) inside backticks. Escaped
  // backticks inside template literals would break this; none of the 16
  // tunes currently use them.
  const re = new RegExp(`export const ${name} = \`([\\s\\S]*?)\`;`, 'm')
  const m = source.match(re)
  if (!m) return null
  const body = m[1]
  return body.endsWith('\n') ? body : body + '\n'
}

function unifiedDiff(a, b, label) {
  // Tiny line-by-line diff. Not a full implementation of the
  // Myers algorithm — sufficient for "did this body change at all?"
  // and prints any differing lines with -/+ markers. For deep diffing,
  // pipe the two files through your editor's diff tool.
  const aLines = a.split('\n')
  const bLines = b.split('\n')
  const max = Math.max(aLines.length, bLines.length)
  const out = [`--- vendored: ${label}`, `+++ upstream: ${label}`]
  let changed = false
  for (let i = 0; i < max; i++) {
    const av = aLines[i]
    const bv = bLines[i]
    if (av === bv) continue
    changed = true
    if (av !== undefined) out.push(`- ${av}`)
    if (bv !== undefined) out.push(`+ ${bv}`)
  }
  return changed ? out.join('\n') : null
}

async function main() {
  const currentSha = await readCurrentSha()
  const targetSha = overrideSha
  const label = targetSha ? `SHA ${targetSha.slice(0, 8)}` : 'main (latest)'
  console.log(`# parity:refresh`)
  console.log(`# vendored pin: ${currentSha}`)
  console.log(`# fetching:     ${label}`)
  console.log('')

  const upstream = await fetchUpstream(targetSha)
  let unchanged = 0
  let changed = 0
  let missing = 0
  const changedTunes = []

  for (const name of TARGETS) {
    const upstreamBody = extractTune(upstream, name)
    const vendoredPath = path.join(corpusDir, `${name}.strudel`)
    let vendoredBody
    try {
      vendoredBody = await fs.readFile(vendoredPath, 'utf8')
    } catch {
      console.log(`! missing vendored file: ${vendoredPath}`)
      missing++
      continue
    }
    if (upstreamBody === null) {
      console.log(`! tune disappeared upstream: ${name}`)
      missing++
      continue
    }
    if (upstreamBody === vendoredBody) {
      unchanged++
      continue
    }
    changed++
    changedTunes.push(name)
    const diff = unifiedDiff(vendoredBody, upstreamBody, `${name}.strudel`)
    if (diff) {
      console.log(diff)
      console.log('')
    }
  }

  console.log('# summary')
  console.log(`# unchanged: ${unchanged}`)
  console.log(`# changed:   ${changed}${changed ? ` (${changedTunes.join(', ')})` : ''}`)
  console.log(`# missing:   ${missing}`)
  console.log('')
  if (changed > 0) {
    console.log('# next step: open a PR titled `corpus: refresh from upstream SHA <x>`,')
    console.log('# apply the diffs above by hand, update CORPUS-SOURCE.md SHA pin')
    console.log('# + "what changed since snapshot" log, then run')
    console.log('# `pnpm --filter @stave/app exec vitest run tests/parity-corpus -u` to regen snapshots.')
  } else {
    console.log('# no drift — corpus is in sync with the targeted upstream SHA.')
  }
}

main().catch((err) => {
  console.error('parity:refresh failed:', err.message)
  process.exit(1)
})
