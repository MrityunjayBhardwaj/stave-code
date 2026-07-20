/**
 * predicateAudit.test.ts — the census in `ir/PREDICATE-AUDIT.md` still matches
 * the source (#959).
 *
 * `parseStrudel.ts` decides things about JavaScript syntax and about Strudel's
 * vocabulary by hand, in anchored regular expressions. Every other module in
 * the parse path asks an authority instead and has zero. The audit document
 * lists all 42, what each one decides, and who owns the right answer — so that
 * "find the next parser bug" is a finite list rather than a search.
 *
 * A document like that decays the moment someone adds a regex, and a decayed
 * census reads exactly like a current one. Hence this gate: it re-derives the
 * census from the source on every run and fails if the document disagrees.
 * Adding a predicate is still allowed; adding one *silently* is not.
 *
 * WHY IT ASKS TYPESCRIPT. Finding regex literals in a TypeScript file means
 * knowing which slashes are division, which are inside strings, and which are
 * inside comments — the same class of question the audit is about. Answering
 * it with a scanner here would reproduce the defect inside the tool that
 * measures it, so the scan delegates to `ts.createSourceFile`. That also makes
 * the exclusion of commented-out regexes structural rather than heuristic:
 * four of them are quoted in prose in `parseStrudel.ts` and the tokenizer
 * never offers them.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

const IR_DIR = join(__dirname, '..')
const SOURCE = join(IR_DIR, 'parseStrudel.ts')
const AUDIT = join(IR_DIR, 'PREDICATE-AUDIT.md')

/** A regex is "anchored" when it decides the shape of a WHOLE token — `^` at
 *  the start or `$` at the end. Unanchored expressions (a `/\s/` scan, a
 *  `.replace` over free text) locate a boundary rather than decide what
 *  something means, which is the distinction the audit turns on. */
function isAnchored(source: string): boolean {
  const body = source.replace(/^\//, '').replace(/\/[gimsuy]*$/, '')
  return body.startsWith('^') || body.endsWith('$')
}

/** Every anchored regex literal in the source, in file order, duplicates kept. */
function censusFromSource(): string[] {
  const text = readFileSync(SOURCE, 'utf8')
  const sf = ts.createSourceFile(SOURCE, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const found: string[] = []
  const walk = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      const src = (node as ts.RegularExpressionLiteral).getText(sf)
      if (isAnchored(src)) found.push(src)
    }
    ts.forEachChild(node, walk)
  }
  walk(sf)
  return found
}

/** Every `<count>x  <regex>` line inside a ```regex fence in the audit. */
function censusFromAudit(): string[] {
  const text = readFileSync(AUDIT, 'utf8')
  const fences = text.matchAll(/```regex\n([\s\S]*?)```/g)
  const declared: string[] = []
  for (const fence of fences) {
    for (const line of fence[1].split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const m = trimmed.match(/^(\d+)x\s+(\/.*)$/)
      expect(m, `unparseable line in a \`\`\`regex fence: ${JSON.stringify(trimmed)}`).toBeTruthy()
      const [, count, source] = m as RegExpMatchArray
      for (let i = 0; i < Number(count); i += 1) declared.push(source)
    }
  }
  return declared
}

function tally(sources: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const s of sources) counts.set(s, (counts.get(s) ?? 0) + 1)
  return counts
}

describe('predicate audit (#959)', () => {
  const actual = censusFromSource()
  const declared = censusFromAudit()

  it('every anchored regex in parseStrudel.ts has an audit entry', () => {
    const have = tally(declared)
    const missing: string[] = []
    for (const [source, count] of tally(actual)) {
      const claimed = have.get(source) ?? 0
      if (claimed < count) missing.push(`${source} — ${count} in source, ${claimed} in audit`)
    }
    expect(
      missing,
      'A predicate was added to parseStrudel.ts without an audit entry. Add it to ' +
        'PREDICATE-AUDIT.md under the category that owns the question it answers — ' +
        'and note whether it delegates or transcribes.',
    ).toEqual([])
  })

  it('every audit entry still exists in parseStrudel.ts', () => {
    const have = tally(actual)
    const stale: string[] = []
    for (const [source, count] of tally(declared)) {
      const real = have.get(source) ?? 0
      if (real < count) stale.push(`${source} — ${count} in audit, ${real} in source`)
    }
    expect(
      stale,
      'The audit claims predicates the source no longer has. If one was deleted or ' +
        'delegated, remove its entry (and say so in the totals) — a census that ' +
        'overstates reads the same as one that is current.',
    ).toEqual([])
  })

  it('the audit states the total it actually lists', () => {
    const text = readFileSync(AUDIT, 'utf8')
    const stated = text.match(/\*\*total anchored regexes\*\*\s*\|\s*\|\s*\*\*(\d+)\*\*/)
    expect(stated, 'the totals table lost its **total anchored regexes** row').toBeTruthy()
    expect(Number((stated as RegExpMatchArray)[1])).toBe(actual.length)
  })

  /**
   * The claim the audit rests on, re-measured rather than quoted. It is a
   * negative result about five modules, so it carries a control arm: the same
   * scan must find anchored regexes in parseStrudel.ts itself. A zero from a
   * broken query would otherwise read as a delegating module.
   */
  it('modules that delegate to an authority still have no anchored regexes', () => {
    const delegating = [
      'parseMini.ts',
      'collect.ts',
      'parseStrudelStages.ts',
      '../visualEdit/chunkDetect.ts',
      '../visualEdit/arrange/parse.ts',
    ]
    const scan = (rel: string): number => {
      const path = join(IR_DIR, rel)
      const text = readFileSync(path, 'utf8')
      const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
      let n = 0
      const walk = (node: ts.Node): void => {
        if (
          node.kind === ts.SyntaxKind.RegularExpressionLiteral &&
          isAnchored((node as ts.RegularExpressionLiteral).getText(sf))
        )
          n += 1
        ts.forEachChild(node, walk)
      }
      walk(sf)
      return n
    }
    expect(scan('parseStrudel.ts'), 'control arm: the scan must find the known 42').toBe(
      actual.length,
    )
    for (const rel of delegating) expect(`${rel}: ${scan(rel)}`).toBe(`${rel}: 0`)
  })
})
