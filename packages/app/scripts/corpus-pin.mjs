#!/usr/bin/env node
/**
 * corpus-pin.mjs — regenerate the fingerprint of the vendored parity corpus (#1290).
 *
 * `tests/parity-corpus/` holds two populations that look like one pile:
 *
 *   - the UPSTREAM tunes, each a byte-faithful extraction of a named export from
 *     upstream `tunes.mjs` at the SHA pinned in CORPUS-SOURCE.md. Byte fidelity IS
 *     their contract, and their licence and attribution live in `//` comments.
 *   - the `bakery-*` fixtures, locally authored minimal repros (BAKERY-FIXTURES.md).
 *     Their contract is "still reproduces the gap class", which the IR snapshots gate,
 *     and editing one when its gap class moves is legitimate. They are NOT hashed here.
 *
 * ⚠ WHY BYTES, WHEN THE CORPUS IS ALREADY SNAPSHOTTED. The snapshots are over the parsed
 * IR, so they see through comments entirely. Observed on the tree that filed this: append
 * a comment line to a vendored tune and every gate over this directory stays green; make
 * a length-preserving change to a VALUE in the same file and two arms redden by name. The
 * blind half is exactly where the third-party licence and the author credit live, so a
 * sweep that rewrote or dropped those headers would not be caught by anything.
 *
 * ⚠ RUNNING THIS IS A DELIBERATE RE-PIN, NOT A REPAIR. It rewrites the answer key. If the
 * gate is red, settle first whether these bytes were supposed to move at all. For an
 * upstream tune the usual answer is no — restore the file. The one case that warrants a
 * re-pin is a genuine corpus refresh, which moves the SHA in CORPUS-SOURCE.md and belongs
 * in its own PR (see `pnpm parity:refresh`, the maintainer tool that surfaces that drift).
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
// The one list of which fixtures have an upstream origin. Imported rather than restated
// so this pin and the refresh tool cannot disagree about what "upstream" means.
import { TARGETS } from './parity-refresh.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
export const CORPUS_DIR = path.resolve(here, '../tests/parity-corpus')
export const PIN_FILE = path.join(CORPUS_DIR, 'CORPUS-PIN.json')
const SOURCE_FILE = path.join(CORPUS_DIR, 'CORPUS-SOURCE.md')

/** Every fixture the corpus gates read — the denominator, not just the hashed part. */
export const isFixture = (name) => name.endsWith('.strudel')

/** The hashed subset: fixtures with an upstream origin, named by `TARGETS`. */
export const upstreamFixtures = () => TARGETS.map((t) => `${t}.strudel`).sort()

export const corpusFiles = (dir = CORPUS_DIR) => fs.readdirSync(dir).filter(isFixture).sort()

export const fingerprint = (dir = CORPUS_DIR) => {
  const out = {}
  for (const f of upstreamFixtures()) {
    const p = path.join(dir, f)
    if (!fs.existsSync(p)) continue // the set arm in the gate owns this case, and names it
    const b = fs.readFileSync(p)
    out[f] = { bytes: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex') }
  }
  return out
}

/** The upstream SHA these bytes are faithful to, read from the corpus's own pin. */
export const pinnedSha = () => {
  const m = fs.readFileSync(SOURCE_FILE, 'utf8').match(/Commit SHA \| `([0-9a-f]{40})`/i)
  if (!m) throw new Error('CORPUS-SOURCE.md has no `Commit SHA | <hash>` row to pin against')
  return m[1]
}

export function generate() {
  const doc = {
    note:
      'FINGERPRINT of the vendored parity corpus. `files` covers the UPSTREAM tunes, ' +
      'whose contract is byte-faithfulness to the SHA below and whose licence and ' +
      'attribution live in comments; `corpus` is every fixture in the directory, because ' +
      'that directory is the denominator of the parity, loc-fidelity, structural-walk and ' +
      'edit-coverage gates and a stray arrival widens all of them. The IR snapshots beside ' +
      'this file see through comments, so they cannot catch either.',
    upstreamSha: pinnedSha(),
    regenerate: 'node scripts/corpus-pin.mjs  <-- a deliberate RE-PIN, never a repair',
    files: fingerprint(),
    corpus: corpusFiles(),
  }
  fs.writeFileSync(PIN_FILE, JSON.stringify(doc, null, 2) + '\n')
  return doc
}

// Guarded so the gate can import the rules above without running the CLI — an export
// nothing can safely import advertises a shared source of truth that does not exist.
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  const doc = generate()
  console.log(`wrote ${path.basename(PIN_FILE)} — upstream SHA ${doc.upstreamSha.slice(0, 8)}`)
  console.log(`  hashed ${Object.keys(doc.files).length} upstream tunes`)
  console.log(`  corpus set ${doc.corpus.length} fixtures`)
  for (const [f, v] of Object.entries(doc.files))
    console.log(`  ${f.padEnd(28)} ${String(v.bytes).padStart(6)} bytes  ${v.sha256.slice(0, 16)}`)
}
