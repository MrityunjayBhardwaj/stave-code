/**
 * p4c-base-pin.test.ts — the pinned P4c baseline has not moved (#1288).
 *
 * `__p4c_base__/` is a frozen copy of parse/resolution/serialize/model as of #1047. The
 * probes that import it (`_1057-denominator-base`, `_1116-lost-units`, …) run one
 * measurement on an old tree and one on the live tree; the delta is only attributable
 * because this side is held still. Nothing enforced that, and it drifted exactly once:
 * #1279 renamed a script repo-wide and updated a reference INSIDE the snapshot.
 *
 * ⚠ WHY THIS NEEDS A GATE RATHER THAN A CONVENTION. The drift changed a COMMENT. Every
 * probe still ran, still imported the snapshot, still produced its numbers — nothing was
 * red, because behaviour was untouched. A drift that moves a comment today is caught by
 * nothing and is indistinguishable from one that moves code tomorrow. So the fingerprint
 * is over the FILE BYTES: anything hashing parsed or normalised output would have been
 * silent on the one drift that has actually happened.
 *
 * ⚠ WHY THE ARMS COLLECT RATHER THAN ASSERT AS THEY GO. `expect` aborts a test at its
 * first failure, so a byte-length check placed before a hash check means a tamper trips
 * the length and the hash is never evaluated — an absent evaluation is indistinguishable
 * from a passing one. Every problem here is pushed onto one list and asserted once, so a
 * run names every file that moved and every property that moved on it.
 *
 * Red? Restore, do not re-pin. The usual answer is that the snapshot was never meant to
 * move:  `git checkout 99fceeb6 -- packages/app/tests/parity-corpus/__p4c_base__/`
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// the pinned-file rule and the hashing live in the generator — imported, not restated,
// so the gate and the answer key cannot disagree about what the snapshot contains
import { fingerprint, isPinned, BASE_DIR, PIN_FILE } from '../../scripts/p4c-base-pin.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

interface Entry {
  bytes: number
  sha256: string
}
interface Pin {
  note: string
  pinnedAt: string
  files: Record<string, Entry>
}

const pin: Pin = JSON.parse(fs.readFileSync(path.join(here, 'P4C-BASE-PIN.json'), 'utf8'))

describe('the pinned P4c baseline is frozen (#1288)', () => {
  it('holds the same set of files the fingerprint records', () => {
    const onDisk = fs.readdirSync(BASE_DIR).filter(isPinned).sort()
    const recorded = Object.keys(pin.files).sort()
    const arrived = onDisk.filter((f) => !recorded.includes(f))
    const departed = recorded.filter((f) => !onDisk.includes(f))
    expect(
      { arrived, departed },
      `${path.basename(PIN_FILE)} and __p4c_base__/ disagree about which files are pinned — ` +
        `a file added to or removed from the baseline changes what every base-vs-live probe ` +
        `is comparing.`,
    ).toEqual({ arrived: [], departed: [] })
  })

  it('holds every pinned file byte-for-byte', () => {
    // the generator is plain `.mjs`, so its return carries no declared shape — name it
    // here rather than reaching for `@ts-expect-error`, which would itself be a second
    // tsc error the moment the inference improves
    const live = fingerprint() as Record<string, Entry | undefined>
    const moved: string[] = []
    for (const [name, want] of Object.entries(pin.files)) {
      const got = live[name]
      if (!got) continue // the set arm above owns this case, and names it better
      if (got.bytes !== want.bytes) moved.push(`${name}: ${want.bytes} bytes -> ${got.bytes}`)
      if (got.sha256 !== want.sha256)
        moved.push(`${name}: sha256 ${want.sha256.slice(0, 16)}… -> ${got.sha256.slice(0, 16)}…`)
    }
    expect(
      moved,
      `the pinned baseline moved. It is frozen at ${pin.pinnedAt}, and the probes that ` +
        `import it attribute their delta to the LIVE tree only because this side does not ` +
        `change. Restore it rather than re-pinning:\n` +
        `    git checkout 99fceeb6 -- packages/app/tests/parity-corpus/__p4c_base__/\n` +
        `Re-pin only if the baseline is deliberately moving to a new commit.`,
    ).toEqual([])
  })

  it('records a fingerprint for every file, with both properties populated', () => {
    // a NEGATIVE control: an empty or half-filled manifest would make both arms above
    // pass vacuously, which is the failure mode a fingerprint gate is most prone to
    const names = Object.keys(pin.files)
    expect(names.length, 'the fingerprint records no files at all').toBeGreaterThan(0)
    const malformed = names.filter(
      (n) =>
        !Number.isInteger(pin.files[n].bytes) ||
        pin.files[n].bytes <= 0 ||
        !/^[0-9a-f]{64}$/.test(pin.files[n].sha256),
    )
    expect(malformed, 'entries without a usable size and sha256 cannot pin anything').toEqual([])
  })
})
