#!/usr/bin/env node
/**
 * parity-bakery.mjs — maintainer-only REAL-WORLD parity sampler (20-15 V-1, D-03).
 *
 * Sibling of parity-refresh.mjs. Same class of tool:
 *   - Never runs on CI. Live network is forbidden on PR CI per the
 *     20-14/20-15 parity discipline. The vitest specs at parity.test.ts /
 *     loc-fidelity.test.ts (+ the 6 vendored bakery-*.strudel fixtures,
 *     V-2) are the CI gate; this is the maintainer-side measurement tool.
 *   - Never auto-commits. It pulls a FRESH live sample from the public
 *     `code_v1` Supabase backend, classifies each through the PURE
 *     `parseStrudel`, prints a statistically-meaningful real-world parity
 *     %, and lists any NEW fallback class for the backlog (NOT fixed here).
 *   - Exit code is always 0 when the network succeeds — the purpose is
 *     surfacing the real-world number + backlog, not gating. A non-zero
 *     exit means the live fetch itself failed (do NOT fabricate a %).
 *
 * The 20-14 load-bearing lesson this implements (D-03): a curated 16-tune
 * corpus over-states real-world parity ~2:1, and a fixed-10 sample is
 * noisy. So pull ~50 fresh public rows, measure, and convert a hand-wavy
 * % into a dated/SHA'd recorded number + a prioritized backlog.
 *
 * The REPRODUCIBLE artifact is NOT this run (network-dependent); it is
 * (a) the dated/SHA'd JSON written to tests/parity-corpus/.bakery-runs/
 *     (gitignored — raw community code, not vendored), and
 * (b) the 6 vendored bakery-*.strudel fixtures (V-2) which ARE the
 *     CI-reproducible floor for the 6 closed classes.
 *
 * Column / pagination resolution (R5): the `code_v1` body column and the
 * anon key are read from upstream `website/src/repl/util.mjs` at the
 * pinned Codeberg SHA at run time (NOT determinable from local source).
 * Resolved at f73b395648645aabe699f91ba0989f35a6fd8a3c: the body column
 * is `code` (util.mjs `.from('code_v1').select('code')`), the anon key is
 * the public client key embedded in util.mjs. Pagination is standard
 * PostgREST: anon `apikey` header + `limit`/`offset` query params.
 *
 * Usage:
 *   node packages/app/scripts/parity-bakery.mjs [--n 50]
 * Wired as `pnpm parity:bakery` (root package.json).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(here, '..')
const corpusDir = path.join(appDir, 'tests', 'parity-corpus')
const runsDir = path.join(corpusDir, '.bakery-runs')

// Pinned upstream — same SHA the corpus + parity-refresh.mjs use.
const UPSTREAM_SHA = 'f73b395648645aabe699f91ba0989f35a6fd8a3c'
const UTIL_URL = `https://codeberg.org/uzu/strudel/raw/commit/${UPSTREAM_SHA}/website/src/repl/util.mjs`
const SUPABASE_BASE = 'https://pidxdsxphlhzjnzmifth.supabase.co'

const args = process.argv.slice(2)
let N = 50
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--n' && args[i + 1]) {
    N = Number(args[i + 1])
    i++
  }
}

/**
 * Resolve the body column + anon key from upstream util.mjs at the pinned
 * SHA (R5 — resolve at run time, do not hardcode-blind). We still pin the
 * SHA so the resolution is reproducible.
 */
async function resolveUpstream() {
  const res = await fetch(UTIL_URL)
  if (!res.ok) throw new Error(`util.mjs fetch failed (${res.status}): ${UTIL_URL}`)
  const src = await res.text()
  const colM = src.match(/\.from\('code_v1'\)\s*\.select\('([^']+)'\)/)
  const keyM = src.match(/createClient\(\s*'https:\/\/[^']+',\s*'([A-Za-z0-9._-]+)'/)
  if (!colM) throw new Error('Could not resolve code_v1 body column from upstream util.mjs')
  if (!keyM) throw new Error('Could not resolve Supabase anon key from upstream util.mjs')
  return { column: colM[1], anonKey: keyM[1] }
}

async function fetchSamples(anonKey, column, n) {
  // PostgREST: public rows only, paged. We over-fetch slightly then trim,
  // because some rows are empty / whitespace-only and don't count as a
  // measurable sample.
  const url =
    `${SUPABASE_BASE}/rest/v1/code_v1?public=eq.true&select=hash,${column}` +
    `&order=hash.asc&limit=${n * 2}&offset=0`
  const res = await fetch(url, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  })
  if (!res.ok) throw new Error(`code_v1 fetch failed (${res.status}): ${url}`)
  const rows = await res.json()
  if (!Array.isArray(rows)) throw new Error('code_v1 returned a non-array body')
  const samples = []
  for (const r of rows) {
    const code = r[column]
    if (typeof code === 'string' && code.trim().length > 0) {
      samples.push({ hash: r.hash ?? null, code })
    }
    if (samples.length >= n) break
  }
  return { samples, rawCount: rows.length }
}

async function main() {
  console.log('# parity:bakery — real-world Bakery parity (20-15 D-03)')
  console.log(`# upstream pin:  ${UPSTREAM_SHA}`)
  console.log(`# target N:      ${N}`)
  console.log('')

  const { column, anonKey } = await resolveUpstream()
  console.log(`# resolved body column (R5): "${column}"`)
  const { samples, rawCount } = await fetchSamples(anonKey, column, N)
  console.log(`# Supabase returned ${rawCount} rows; ${samples.length} non-empty samples`)
  if (samples.length === 0) throw new Error('No non-empty samples — refusing to report a %')

  // Eyeball the first row's shape before trusting the % (pre-mortem
  // mitigation: a wrong column would print garbage here).
  console.log('# --- first sample (eyeball the shape) ---')
  console.log(
    samples[0].code.split('\n').slice(0, 4).map((l) => `#   ${l}`).join('\n'),
  )
  console.log('# ----------------------------------------')
  console.log('')

  // Persist the FRESH pull as the dated/SHA'd reproducible artifact
  // BEFORE classifying (so a classifier crash still leaves the raw data).
  await fs.mkdir(runsDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const samplesPath = path.join(runsDir, `samples-${stamp}.json`)
  await fs.writeFile(samplesPath, JSON.stringify({ stamp, UPSTREAM_SHA, column, samples }, null, 2))

  // Classify through the PURE parseStrudel. The parser source path import
  // only works under vite-node (the @stave/editor barrel crashes
  // standalone node — α-1 commit body documents this). So we spawn the
  // app's vitest in run-once mode on the classifier spec, handing it the
  // samples file + a result path via env. Same source-path import the
  // parity specs use → identical parser, no @strudel/core crash.
  const resultPath = path.join(runsDir, `result-${stamp}.json`)
  const r = spawnSync(
    'pnpm',
    [
      '--filter',
      '@stave/app',
      'exec',
      'vitest',
      'run',
      '--config',
      'vitest.bakery.config.ts',
      '--reporter',
      'dot',
    ],
    {
      cwd: path.resolve(appDir, '..', '..'),
      env: {
        ...process.env,
        BAKERY_SAMPLES: samplesPath,
        BAKERY_RESULT: resultPath,
      },
      stdio: 'inherit',
    },
  )
  if (r.status !== 0) {
    throw new Error('classifier spec failed — see vitest output above')
  }

  const result = JSON.parse(await fs.readFile(resultPath, 'utf8'))
  const { total, structured, codeFallback, classes, perSample } = result
  const pct = ((structured / total) * 100).toFixed(1)

  console.log('')
  console.log('# === per-sample classification ===')
  for (const s of perSample) {
    console.log(`#  ${s.verdict === 'structured' ? 'OK ' : 'COD'}  ${s.hash ?? '(nohash)'}  ${s.firstLine}`)
  }
  console.log('')
  console.log('# === REAL-WORLD PARITY ===')
  console.log(`# N (measured):     ${total}`)
  console.log(`# structured:       ${structured}`)
  console.log(`# Code-fallback:    ${codeFallback}`)
  console.log(`# real-world %:     ${pct}%   (structured / N)`)
  console.log(`# 20-15 baseline:   4/10 = 40.0% (2026-05-15 stress test)`)
  console.log('')
  console.log('# === NEW fallback classes (BACKLOG — NOT fixed this phase, D-03) ===')
  if (Object.keys(classes).length === 0) {
    console.log('#   (none — all Code-fallbacks match an already-known/closed class)')
  } else {
    for (const [cls, cnt] of Object.entries(classes).sort((a, b) => b[1] - a[1])) {
      console.log(`#   [${cnt}x] ${cls}`)
    }
  }
  console.log('')
  console.log(`# artifact (gitignored, dated/SHA'd): ${path.relative(process.cwd(), samplesPath)}`)
  console.log(`# result:                              ${path.relative(process.cwd(), resultPath)}`)
  console.log('# Record the % + stamp + UPSTREAM_SHA in the phase SUMMARY (V-4).')
}

main().catch((err) => {
  console.error('parity:bakery failed:', err.message)
  console.error('(D-03 discipline: a failed live fetch must NOT be reported as a %.)')
  process.exit(1)
})
