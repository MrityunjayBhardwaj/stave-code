/**
 * edit-coverage.spec.ts — VIEW-EDITABILITY coverage measurement.
 *
 * Sibling of parity.test.ts, but a strictly harder question. parity measures
 * whether a tune's musical body PARSES to a structured IR (a `via`-Code opaque
 * fragment still counts as "structured"). This measures whether a tune can
 * actually be EDITED through a Stave view — which requires more:
 *
 *   1. the statement is an editable chunk (`detectAllChunks` / nested voices),
 *   2. its note string ROUND-TRIPS into an editable model — the exact gate the
 *      app uses (`useGridModel`: parseStepGrid/parsePianoRoll must be `.ok`),
 *      OR the statement is an `arrange(...)` / `pickRestart(...)` clip control,
 *      OR it exposes a numeric knob.
 *
 * TWO MODES (one measurement core):
 *   - CORPUS (default): measures the 53 vendored `.strudel` fixtures, writes a
 *     committed EDIT-COVERAGE.{md,json}. The only assertion is corpus non-empty.
 *   - LIVE (env `EDIT_SAMPLES` set — driven by scripts/edit-coverage-bakery.mjs):
 *     measures a fresh real-world Bakery sample and writes `EDIT_RESULT` JSON.
 *     Mirrors _bakery-classify.spec.ts's env-driven contract exactly.
 *
 * The oracle is the app's own: `chunkDetect` + `classifyChunk` + the notation
 * model parsers + the arrange/pick detectors. No `parseStrudel` / `@strudel`
 * dependency — pure acorn (via chunkDetect's parseTopLevel) + the visualEdit
 * modules, imported from source (the `@stave/editor` barrel pulls
 * @strudel/draw → gifenc CJS crash under vite-node; parity.test.ts documents
 * the same deep-path convention).
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  measureDocs,
  aggregate,
  renderMarkdown,
  resultJson,
  summaryLines,
} from './editCoverage'

const corpusDir = path.dirname(fileURLToPath(import.meta.url))


const LIVE_SAMPLES = process.env.EDIT_SAMPLES
const LIVE_RESULT = process.env.EDIT_RESULT

/* eslint-disable no-console */

// ─────────────────────────── CORPUS MODE (default) ───────────────────────────
describe.skipIf(!!LIVE_SAMPLES)('edit-coverage — vendored corpus', () => {
  const files = fs.readdirSync(corpusDir).filter((f) => f.endsWith('.strudel')).sort()

  it('corpus is non-empty (sanity gate)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('measures and writes EDIT-COVERAGE.{md,json}', () => {
    const docs = files.map((f) => ({ name: f, code: fs.readFileSync(path.join(corpusDir, f), 'utf8') }))
    const m = measureDocs(docs)
    fs.writeFileSync(
      path.join(corpusDir, 'EDIT-COVERAGE.md'),
      renderMarkdown(m, 'Edit-Coverage Report — view-editability over the vendored parity corpus'),
    )
    fs.writeFileSync(path.join(corpusDir, 'EDIT-COVERAGE.json'), JSON.stringify(resultJson(m), null, 2))
    console.log('\n' + summaryLines('corpus', m).join('\n'))
    console.log('report → tests/parity-corpus/EDIT-COVERAGE.md')
    console.log('═══════════════════════════════════\n')
    expect(aggregate(m).totalUnits).toBeGreaterThan(0)
  })
})

// ─────────────────── LIVE MODE (driven by edit-coverage-bakery.mjs) ───────────
describe.skipIf(!LIVE_SAMPLES)('edit-coverage — live Bakery sample', () => {
  it('classifies the fresh sample and writes EDIT_RESULT', () => {
    const raw = JSON.parse(fs.readFileSync(LIVE_SAMPLES!, 'utf8'))
    const samples: { hash?: string; code: string }[] = raw.samples ?? raw
    const docs = samples.map((s, i) => ({ name: s.hash ?? `sample-${i}`, code: s.code }))
    const m = measureDocs(docs)
    if (LIVE_RESULT) {
      fs.writeFileSync(
        LIVE_RESULT,
        JSON.stringify(resultJson(m, { stamp: raw.stamp ?? null, source: 'bakery-live' }), null, 2),
      )
    }
    console.log('\n' + summaryLines('LIVE Bakery', m).join('\n'))
    console.log('═══════════════════════════════════\n')
    expect(m.tunes.length).toBeGreaterThan(0)
  })
})
