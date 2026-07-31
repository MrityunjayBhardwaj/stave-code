/**
 * SCRATCH PROBE, inert (`_*.spec.ts`; vitest.config includes only `*.test.ts`).
 *   SWEEP=tests/parity-corpus/_1057-refusal-attribution.spec.ts \
 *     pnpm --filter @stave/app exec vitest run --config vitest.sweep.config.ts
 *
 * The free-zone gate reports 55 grid / 40 roll asks that are arithmetically free but
 * REFUSED by the parser. #1117 names four bar-expanding projections. Self-review found a
 * second candidate cause — a grid carrying `_` sustains would not refine — so the refusals
 * must be attributed to a NAMED path rather than assumed to be #1117's.
 */
import { describe, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseStepGrid, parsePianoRoll } from '../../../editor/src/visualEdit/notation/parse'
import { freeZoneScale, RESOLUTION_PRESETS } from '../../../editor/src/visualEdit/notation/resolution'
import { documentSteps } from '../../../editor/src/visualEdit/notation/viewResolution'

const here = path.dirname(fileURLToPath(import.meta.url))
const corpus: { minis: { mini: string }[] } = JSON.parse(
  fs.readFileSync(path.join(here, 'mini-corpus.json'), 'utf8'),
)
const minis = [...new Set(corpus.minis.map((o) => o.mini.trim()).filter((m) => m !== ''))]

function sweep(label: string, parse: (m: string, s?: number) => { ok: boolean; model?: any }): void {
  let asks = 0
  const byCause: Record<string, number> = {}
  const units = new Set<string>()
  const examples: Record<string, string[]> = {}
  for (const mini of minis) {
    const base = parse(mini)
    if (!base.ok || !base.model || base.model.leafSource != null) continue
    const D = documentSteps(base.model)
    for (const t of RESOLUTION_PRESETS) {
      const scale = freeZoneScale(D, t)
      if (scale === null || t === base.model.steps) continue
      if (parse(mini, scale).ok) continue
      asks++
      units.add(mini)
      const hasSustain = /(^|\s)_(\s|$)/.test(mini)
      const hasAlt = mini.includes('<')
      const cause = hasAlt && hasSustain ? 'alt+sustain' : hasAlt ? 'alternation (#1117)' : hasSustain ? 'sustain `_`' : 'other'
      byCause[cause] = (byCause[cause] ?? 0) + 1
      ;(examples[cause] ??= []).length < 3 && examples[cause].push(mini)
    }
  }
  console.log(`\n════ ${label} ════  refused asks ${asks} over ${units.size} units`)
  for (const [c, n] of Object.entries(byCause).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${c}`)
    for (const e of examples[c] ?? []) console.log(`        ${JSON.stringify(e).slice(0, 110)}`)
  }
}

describe('#1057 refused-view attribution', () => {
  it('grid', () => sweep('STEP GRID', parseStepGrid as never))
  it('roll', () => sweep('PIANO ROLL', parsePianoRoll as never))
})
