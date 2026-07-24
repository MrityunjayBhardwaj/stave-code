/**
 * detector-coverage.test.ts — the harness must ask EVERY shipped editor (#1003).
 *
 * `editCoverage.ts` decides a unit's editability by consulting a hand-written
 * set of detectors. That set was correct when it was written and then the
 * product grew: `detectMasterAll` shipped, nothing tied the two together, and
 * sixteen units that the app can edit today reported as `code-only` — a bucket
 * everyone reads as "no view exists" when it only ever meant "none of the
 * detectors this file happens to import said yes."
 *
 * This is the sibling of `denominator-audit.test.ts`, on the other half of the
 * fraction: that one guards what may leave the denominator, this one guards
 * that nothing shipped is missing from the numerator. As there, the direction
 * that costs us is the load-bearing one — a detector may only be listed as NOT
 * consulted with a stated reason, so the escape hatch cannot quietly become
 * "whatever we haven't got round to."
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const visualEditDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../editor/src/visualEdit',
)
const harnessPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'editCoverage.ts')

/**
 * Every detector the harness deliberately does NOT consult, and why. A reason
 * is required: an entry here is a claim that consulting it would make the
 * measurement WRONG, not that we have not looked at it yet.
 */
const NOT_CONSULTED: Record<string, string> = {
  // Cursor-position variants of the `detectAll*` entry points the harness does
  // consult. They answer "what is under the caret", which a whole-document
  // measurement has no caret for; their `All` siblings cover the same surface.
  detectArrangeAt: 'cursor variant of detectAllArrangeCalls, which is consulted',
  detectPickControlAt: 'cursor variant of detectAllPickControls, which is consulted',

  // A refinement of detectMasterAll — it picks WHICH master line the expand
  // drawer binds its insert chain to. Every line it can return is already
  // returned by detectMasterAll, so consulting it would double-count.
  detectMasterAudioAll: 'strict subset of detectMasterAll, which is consulted',

  // Not an editability verdict. It returns the span to WRAP when a bare pattern
  // is first placed in time, and it succeeds for essentially every top-level
  // pattern — consulting it would classify the whole corpus as editable and
  // measure nothing.
  detectBarePattern: 'returns a wrap target for any bare pattern, not a view verdict',
}

/** `export function detectFoo` across visualEdit, excluding tests. */
function shippedDetectors(dir: string, out: Set<string> = new Set()): Set<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) { shippedDetectors(p, out); continue }
    if (!entry.name.endsWith('.ts')) continue
    for (const m of fs.readFileSync(p, 'utf8').matchAll(/^export function (detect\w+)/gm)) out.add(m[1])
  }
  return out
}

describe('the coverage harness asks every shipped editor', () => {
  const detectors = shippedDetectors(visualEditDir)
  const harness = fs.readFileSync(harnessPath, 'utf8')

  it('finds the detectors at all (guards the scan itself)', () => {
    // Without this, a broken scan reports zero detectors and the suite passes
    // vacuously — the failure mode the thing it is testing already had once.
    expect(detectors.size).toBeGreaterThanOrEqual(9)
    expect(detectors.has('detectMasterAll')).toBe(true)
  })

  it('consults every detector, or names why not', () => {
    const unconsulted: string[] = []
    for (const d of detectors) {
      // Word-boundary, not `includes`: a substring test passes for
      // `detectMasterAllSomethingElse`, so renaming the import away would have
      // left this green. Found by red-testing the assertion, not by review.
      if (new RegExp(`\\b${d}\\b`).test(harness)) continue
      if (NOT_CONSULTED[d]) continue
      unconsulted.push(d)
    }
    expect(
      unconsulted,
      `visualEdit exports ${unconsulted.join(', ')}, which editCoverage.ts neither consults nor ` +
        'lists in NOT_CONSULTED with a reason. A surface the app can edit must not be measured as ' +
        '`code-only` — see #1003.',
    ).toEqual([])
  })

  it('every NOT_CONSULTED entry still exists and still carries a reason', () => {
    // The other direction: a stale exemption silently re-opens the hole it was
    // written to document, and an empty reason turns the list into a to-do.
    for (const [name, why] of Object.entries(NOT_CONSULTED)) {
      expect(detectors.has(name), `NOT_CONSULTED lists ${name}, which no longer exists`).toBe(true)
      expect(why.length, `NOT_CONSULTED[${name}] needs a reason`).toBeGreaterThan(20)
    }
  })
})
