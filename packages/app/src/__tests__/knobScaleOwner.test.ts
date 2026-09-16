/**
 * One owner for the value↔position map (#1581) — a census of the SOURCE, not of
 * behaviour.
 *
 * A control's value has a place on its dial (linear or logarithmic) and a
 * quantum it is spelled on. Two surfaces turn pointer travel into a value with
 * those rules — the mixer knob and the timeline's stepped automation lane — and
 * they used to spell all three themselves, in two files, four spellings in all.
 *
 * ⚠ NO BEHAVIOURAL TEST CAN SEE A SECOND SPELLING THAT AGREES. That is the whole
 * reason this file reads text. While the copies agree every arm on both surfaces
 * is green; they part on the first change to either, and what the user then sees
 * is a step dragged on the lane landing on a different number than the same
 * control turned on the knob. The copies had already begun to part: the knob
 * asked `value > 0 && min > 0` before going logarithmic, the lane only relied on
 * its axis having been built with a positive floor.
 *
 * ⚠ AND NO GREP CAN PROVE AN ABSENCE WITHOUT ITS CONTROLS. A pattern that matches
 * nothing anywhere reads the same as a pattern that matches nothing NEW: both
 * say "no second spelling". So every pattern here is also run against the owner,
 * where it MUST match, and the walk prints the number of files it examined — a
 * zero with no denominator cannot be told from a walk that never ran.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/** packages/app/src/__tests__ → the repo root. */
const ROOT = path.resolve(__dirname, '..', '..', '..', '..')
const PACKAGES = ['app', 'editor']

/** The file that owns all three rules. Repo-relative, POSIX spelling. */
const OWNER = 'packages/editor/src/visualEdit/panels/knobScale.ts'

interface Rule {
  readonly what: string
  readonly pattern: RegExp
}

/**
 * One regex per rule, written against the SHAPE of the arithmetic rather than
 * any name, so a copy that renamed its variables is still caught.
 */
const RULES: readonly Rule[] = [
  { what: 'value → position on a log range', pattern: /Math\.log\([^)]*\)\s*\/\s*Math\.log\(/ },
  { what: 'position → value on a log range', pattern: /Math\.pow\([^,]*\/[^,]*,/ },
  { what: "the quantum's decimal places", pattern: /split\('\.'\)\[1\]/ },
]

/** Every non-test source file in the two packages, repo-relative. */
function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue
        walk(full)
      } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
        out.push(path.relative(ROOT, full).split(path.sep).join('/'))
      }
    }
  }
  for (const pkg of PACKAGES) walk(path.join(ROOT, 'packages', pkg, 'src'))
  return out.sort()
}

describe('the knob scale has ONE owner (#1581)', () => {
  const files = sourceFiles()

  it('walked a whole tree, not an empty one', () => {
    // The census in #1581 counted 432 non-test source files; this walk's own
    // filter finds 428. Either way the floor is what makes a "no hits" answer
    // mean anything at all.
    expect(files.length).toBeGreaterThan(400)
    expect(files).toContain(OWNER)
  })

  it('the owner really does spell all three rules (the positive control)', () => {
    const text = readFileSync(path.join(ROOT, OWNER), 'utf8')
    for (const rule of RULES) {
      expect(rule.pattern.test(text), `owner is missing: ${rule.what}`).toBe(true)
    }
  })

  for (const rule of RULES) {
    it(`no second spelling of: ${rule.what}`, () => {
      const elsewhere = files.filter(
        (f) => f !== OWNER && rule.pattern.test(readFileSync(path.join(ROOT, f), 'utf8')),
      )
      // Read the list, don't just count it: a legitimate new use of the same
      // arithmetic (some other dial, some other axis) belongs in `knobScale`,
      // called from wherever it is needed — that is what this test is asking for.
      expect(elsewhere, `examined ${files.length} source files`).toEqual([])
    })
  }
})
