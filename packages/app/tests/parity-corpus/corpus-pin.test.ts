/**
 * corpus-pin.test.ts — the vendored parity corpus has not drifted (#1290).
 *
 * This directory holds two populations with two different contracts. The UPSTREAM tunes
 * are byte-faithful extractions of named exports from upstream `tunes.mjs` at the SHA in
 * CORPUS-SOURCE.md — byte fidelity IS their contract, and their licence and attribution
 * live in `//` comments. The `bakery-*` fixtures are locally authored repros whose
 * contract is "still reproduces the gap class"; editing one when that class moves is
 * legitimate, so they are deliberately not hashed here.
 *
 * ⚠ WHY BYTES, WITH SNAPSHOTS ALREADY BESIDE THIS FILE. The snapshots are over the parsed
 * IR, which sees through comments entirely. Measured on the tree that filed this: append a
 * comment line to a vendored tune and every gate over this directory stays green, while a
 * length-preserving change to a VALUE in the same file reddens two arms by name. The blind
 * half is exactly where the third-party licence and the author credit sit, so a sweep that
 * rewrote or dropped those headers would pass every gate — the same drift class as #1288,
 * pointed at someone else's source instead of at our own frozen copy.
 *
 * ⚠ WHY THE ARMS COLLECT RATHER THAN ASSERT AS THEY GO. `expect` aborts at its first
 * failure, so a size check placed ahead of a hash check means a tamper trips the size and
 * the hash is never evaluated — and an assertion that never ran is indistinguishable from
 * one that passed. Every problem is pushed onto one list and asserted once, so a run names
 * every file that moved and every property that moved on it.
 *
 * Red? Restore, do not re-pin. A vendored tune is not supposed to move at all outside a
 * deliberate corpus refresh, which moves the SHA in CORPUS-SOURCE.md and belongs in its
 * own PR (`pnpm parity:refresh` surfaces that drift).
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// the population rules and the hashing live in the generator — imported, not restated, so
// the gate and the answer key cannot disagree about what is pinned or what is upstream
import {
  fingerprint,
  corpusFiles,
  upstreamFixtures,
  CORPUS_DIR,
  PIN_FILE,
} from '../../scripts/corpus-pin.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

interface Entry {
  bytes: number
  sha256: string
}
interface Pin {
  note: string
  upstreamSha: string
  files: Record<string, Entry>
  corpus: string[]
}

const pin: Pin = JSON.parse(fs.readFileSync(path.join(here, 'CORPUS-PIN.json'), 'utf8'))
const pinName = path.basename(PIN_FILE)

describe('the vendored parity corpus is pinned (#1290)', () => {
  it('agrees with the refresh tool about which fixtures came from upstream', () => {
    // THREE readings of one question, asserted against each other rather than against a
    // literal: the refresh tool's TARGETS (via `upstreamFixtures`), the `bakery-*` naming
    // convention on disk, and the fingerprint's own keys. Any two agreeing while the third
    // differs is the interesting case — a new upstream tune added without a pin would sit
    // on disk and in neither list, and would then be gated by nothing.
    const byTargets = upstreamFixtures()
    const byConvention = corpusFiles(CORPUS_DIR).filter((f: string) => !f.startsWith('bakery-'))
    const byPin = Object.keys(pin.files).sort()
    expect(
      { byConvention, byPin },
      `the three answers to "which fixtures are upstream?" disagree. TARGETS in ` +
        `scripts/parity-refresh.mjs, the bakery-* naming convention, and ${pinName} must ` +
        `describe the same set, or a vendored tune is pinned by nobody.`,
    ).toEqual({ byConvention: byTargets, byPin: byTargets })
  })

  it('holds every upstream tune byte-for-byte', () => {
    // the generator is plain `.mjs`, so its return carries no declared shape — name it here
    // rather than reaching for `@ts-expect-error`, which is a claim the typechecker checks
    const live = fingerprint() as Record<string, Entry | undefined>
    const moved: string[] = []
    for (const [name, want] of Object.entries(pin.files)) {
      const got = live[name]
      if (!got) continue // the population arm above owns this case, and names it better
      if (got.bytes !== want.bytes) moved.push(`${name}: ${want.bytes} bytes -> ${got.bytes}`)
      if (got.sha256 !== want.sha256)
        moved.push(`${name}: sha256 ${want.sha256.slice(0, 16)}… -> ${got.sha256.slice(0, 16)}…`)
    }
    expect(
      moved,
      `a vendored tune's bytes moved. These are byte-faithful extractions from upstream at ` +
        `${pin.upstreamSha.slice(0, 8)}, and their licence and attribution live in comments — ` +
        `which the IR snapshots cannot see. Restore the file rather than re-pinning, unless ` +
        `this is a deliberate corpus refresh moving the SHA in CORPUS-SOURCE.md.`,
    ).toEqual([])
  })

  it('holds the same set of fixtures the pin records', () => {
    // the whole directory, not just the hashed part: it is the denominator of the parity,
    // loc-fidelity, structural-walk and edit-coverage gates, so a stray arrival widens all
    // of them at once. A new fixture reddens under --ci for want of a snapshot, but a local
    // run writes one silently, which is the case this arm exists to catch.
    const onDisk = corpusFiles(CORPUS_DIR)
    const recorded = [...pin.corpus].sort()
    const arrived = onDisk.filter((f: string) => !recorded.includes(f))
    const departed = recorded.filter((f) => !onDisk.includes(f))
    expect(
      { arrived, departed },
      `${pinName} and the corpus directory disagree about which fixtures exist. This ` +
        `directory is the denominator of every coverage figure this repo quotes, so a file ` +
        `arriving or leaving moves all of them together.`,
    ).toEqual({ arrived: [], departed: [] })
  })

  it('records a usable fingerprint for every pinned tune', () => {
    // a NEGATIVE control: an empty or half-filled manifest would make both arms above pass
    // vacuously, which is the failure mode a fingerprint gate is most prone to
    const names = Object.keys(pin.files)
    expect(names.length, 'the fingerprint records no tunes at all').toBeGreaterThan(0)
    expect(pin.corpus.length, 'the fingerprint records no corpus set at all').toBeGreaterThan(0)
    expect(
      /^[0-9a-f]{40}$/.test(pin.upstreamSha),
      'the pin records no upstream SHA to be faithful to',
    ).toBe(true)
    const malformed = names.filter(
      (n) =>
        !Number.isInteger(pin.files[n].bytes) ||
        pin.files[n].bytes <= 0 ||
        !/^[0-9a-f]{64}$/.test(pin.files[n].sha256),
    )
    expect(malformed, 'entries without a usable size and sha256 cannot pin anything').toEqual([])
  })
})
