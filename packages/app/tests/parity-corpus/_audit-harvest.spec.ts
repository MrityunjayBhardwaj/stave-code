/**
 * GAP 2 — what does the corpus HARVEST REGEX miss? Measurement only.
 *
 * `mini-corpus.json` records its own pattern:
 *     \b(?:s|sound|note|n)\(\s*"([^"\\]*)"
 * Three restrictions ride in it, none stated as a limitation: double quotes only,
 * four call heads only, and no escapes. Every reach denominator we quote is over
 * the result, so if the miss is material the denominators are understated.
 *
 * Coarse by construction: this scans TEXT for `head(<quoted>)`, so it will catch
 * strings that are not mini-notation (bank names, sample paths). That is why the
 * output is broken down BY HEAD rather than given as one total — the reader has to
 * be able to judge which heads carry playable notation and which do not.
 */
import { describe, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '.bakery-runs')
const RUNS = [
  'edit-samples-2026-07-24T17-49-00-172Z.json',
  'edit-samples-offset250-2026-07-24T17-49-04-301Z.json',
  'edit-samples-offset500-2026-07-24T17-49-08-639Z.json',
]

/** the harvester's own pattern, verbatim from the corpus file's `pattern` field */
const HARVEST = /\b(?:s|sound|note|n)\(\s*"([^"\\]*)"/g
/** the same call shapes, but any quote style and ANY head */
const ANY = /\b([A-Za-z_$][\w$]*)\(\s*(["'`])((?:(?!\2)[^\\]|\\.)*)\2/g

describe('GAP 2 — harvest coverage over the 150-tune population', () => {
  it('reports what the corpus regex captures and what it steps over', () => {
    const docs: string[] = []
    for (const f of RUNS) {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
      docs.push(...(j.samples as { code: string }[]).map((s) => s.code))
    }

    const harvested = new Set<string>()
    const byHeadQuote = new Map<string, Set<string>>()
    for (const code of docs) {
      for (const m of code.matchAll(HARVEST)) harvested.add(m[1].trim())
      for (const m of code.matchAll(ANY)) {
        const [, head, quote, body] = m
        const key = `${head}(${quote === '"' ? 'double' : quote === "'" ? 'single' : 'backtick'})`
        if (!byHeadQuote.has(key)) byHeadQuote.set(key, new Set())
        byHeadQuote.get(key)!.add(body.trim())
      }
    }

    const NOTATION_HEADS = new Set(['s', 'sound', 'note', 'n'])
    let missedInNotationHeads = 0
    const missedRows: string[] = []
    const otherHeadRows: [string, number, number][] = []

    for (const [key, set] of [...byHeadQuote.entries()].sort()) {
      const head = key.slice(0, key.indexOf('('))
      const missed = [...set].filter((v) => !harvested.has(v))
      if (NOTATION_HEADS.has(head)) {
        if (!key.endsWith('(double)')) {
          missedInNotationHeads += missed.length
          for (const v of missed.slice(0, 4)) missedRows.push(`    ${key}  ${JSON.stringify(v)}`)
        }
      } else if (missed.length >= 3) {
        otherHeadRows.push([key, set.size, missed.length])
      }
    }

    console.log(`\n===== HARVEST COVERAGE (150 tunes) =====`)
    console.log(`distinct strings the corpus regex captured here: ${harvested.size}`)
    console.log(`\n-- the four NOTATION heads, by quote style --`)
    for (const [key, set] of [...byHeadQuote.entries()].sort()) {
      const head = key.slice(0, key.indexOf('('))
      if (!NOTATION_HEADS.has(head)) continue
      const missed = [...set].filter((v) => !harvested.has(v)).length
      console.log(`  ${key.padEnd(18)} distinct=${String(set.size).padStart(4)}  not in corpus=${missed}`)
    }
    console.log(`\n  NOTATION-head strings missed for QUOTE STYLE alone: ${missedInNotationHeads}`)
    console.log(missedRows.join('\n') || '    (none)')

    // Is the missed set merely SMALLER, or a different KIND? Complexity proxies.
    const prof = (which: 'double' | 'backtick') => {
      const all: string[] = []
      for (const [key, set] of byHeadQuote) {
        const head = key.slice(0, key.indexOf('('))
        if (NOTATION_HEADS.has(head) && key.endsWith(`(${which})`)) all.push(...set)
      }
      const pct = (f: (v: string) => boolean) =>
        all.length ? Math.round((all.filter(f).length / all.length) * 100) : 0
      return {
        n: all.length,
        meanLen: all.length ? Math.round(all.reduce((a, b) => a + b.length, 0) / all.length) : 0,
        maxLen: all.reduce((a, b) => Math.max(a, b.length), 0),
        multiline: pct((v) => v.includes('\n')),
        alternation: pct((v) => v.includes('<')),
        stack: pct((v) => v.includes(',')),
      }
    }
    const d = prof('double'), b = prof('backtick')
    console.log(`\n-- IS THE MISSED SET A DIFFERENT KIND? (notation heads only) --`)
    console.log(`                 n   meanLen  maxLen  multiline  <alternation>  ,stack`)
    for (const [name, x] of [['double (kept)', d], ['backtick (MISSED)', b]] as const) {
      console.log(
        `  ${name.padEnd(18)}${String(x.n).padStart(4)}${String(x.meanLen).padStart(9)}` +
        `${String(x.maxLen).padStart(8)}${String(x.multiline + '%').padStart(11)}` +
        `${String(x.alternation + '%').padStart(15)}${String(x.stack + '%').padStart(8)}`,
      )
    }

    console.log(`\n-- OTHER heads taking a quoted first arg (>=3 not in corpus) --`)
    for (const [key, total, missed] of otherHeadRows.sort((a, b) => b[2] - a[2]).slice(0, 20)) {
      console.log(`  ${key.padEnd(22)} distinct=${String(total).padStart(4)}  not in corpus=${missed}`)
    }
  })
})
