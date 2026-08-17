#!/usr/bin/env node
/**
 * p4c-base-pin.mjs — regenerate the fingerprint of the pinned P4c baseline (#1288).
 *
 * `tests/parity-corpus/__p4c_base__/` is a frozen copy of parse/resolution/serialize/model
 * as of #1047. The probes that import it run one measurement on an old tree and one on the
 * live tree, and the delta is only meaningful because this side does not move. Nothing
 * enforced that until now, and it drifted once: #1279's repo-wide rename of a script
 * updated a reference INSIDE the snapshot, because `git grep` returns a pinned copy and a
 * live copy indistinguishably and the snapshot's comments read exactly like live docs —
 * at the pin they were.
 *
 * ⚠ RUNNING THIS IS A DELIBERATE RE-PIN, NOT A REPAIR. It rewrites the answer key. If the
 * gate is red, the question to settle first is whether the snapshot was supposed to move
 * at all; the usual answer is no, and the fix is to restore the file rather than to bless
 * the drift:
 *
 *     git checkout 99fceeb6 -- packages/app/tests/parity-corpus/__p4c_base__/
 *
 * Regenerate only when re-pinning the baseline to a NEW commit, and say which in `pinnedAt`.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const CORPUS = path.resolve(here, '../tests/parity-corpus')
export const BASE_DIR = path.join(CORPUS, '__p4c_base__')
export const PIN_FILE = path.join(CORPUS, 'P4C-BASE-PIN.json')

/**
 * What counts as a pinned file — ONE definition, imported by the gate rather than
 * restated there, so the two cannot disagree about what the snapshot contains ([[P588]]).
 */
export const isPinned = (name) => name.endsWith('.ts')

export const fingerprint = (dir = BASE_DIR) => {
  const out = {}
  for (const f of fs.readdirSync(dir).filter(isPinned).sort()) {
    const b = fs.readFileSync(path.join(dir, f))
    out[f] = { bytes: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex') }
  }
  return out
}

export function generate(pinnedAt) {
  const files = fingerprint()
  const doc = {
    note:
      'FINGERPRINT of the pinned P4c baseline (`__p4c_base__/`) — a frozen copy of ' +
      'parse/resolution/serialize/model. The probes that import it compare an old tree ' +
      'against the live one, and that delta means something only because this side does ' +
      'not move. A drift here goes UNNOTICED by every probe, because changing a comment ' +
      'leaves behaviour identical — which is exactly how it drifted the one time it did.',
    pinnedAt,
    regenerate: 'node scripts/p4c-base-pin.mjs  <-- a deliberate RE-PIN, never a repair',
    files,
  }
  fs.writeFileSync(PIN_FILE, JSON.stringify(doc, null, 2) + '\n')
  return doc
}

// Guarded so the gate can import `isPinned`/`fingerprint` without running the CLI —
// an export nothing can safely import is worse than an honest copy ([[P588]]).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const pinnedAt = process.argv[2]
  if (!pinnedAt) {
    console.error(
      'usage: node scripts/p4c-base-pin.mjs "<what this is pinned to>"\n' +
        '  e.g. node scripts/p4c-base-pin.mjs "#1047 — 99fceeb6"\n' +
        '  ⚠ this REWRITES the answer key; see the docblock before running it.',
    )
    process.exit(2)
  }
  const doc = generate(pinnedAt)
  console.log(`wrote ${path.basename(PIN_FILE)} — pinned at ${pinnedAt}`)
  for (const [f, v] of Object.entries(doc.files))
    console.log(`  ${f.padEnd(15)} ${String(v.bytes).padStart(7)} bytes  ${v.sha256.slice(0, 16)}`)
}
