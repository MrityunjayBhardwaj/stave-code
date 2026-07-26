/**
 * A/B EQUIVALENCE — the derived arrays against the ACTUAL pre-change reader.
 * Proves inertness by observation over the real corpus rather than by
 * construction, which is the claim that matters for a representation change.
 *
 * RESULT WHEN RUN (2026-07-26, against `b08326cf`): 4662 ok unit×cycle pairs
 * compared, **0 differences** in `atoms`/`spans`/`durs`; 19375 occurrences
 * retained against 19331 atoms after display dedupe, i.e. **44 occurrences the
 * old reader dropped**.
 *
 * TO RE-RUN, materialize the old reader beside the new one first — it is not
 * committed, because a second copy of `parse.ts` in the tree is exactly the kind
 * of divergent oracle this suite exists to avoid:
 *
 *     git show <base>:packages/editor/src/visualEdit/notation/parse.ts \
 *       > packages/editor/src/visualEdit/notation/parseBASE.ts
 *     mv _sweep-1034e.spec.ts _sweep-1034e.test.ts   # the gate includes *.test.ts only
 *     pnpm --filter @stave/app exec vitest run tests/parity-corpus/_sweep-1034e.test.ts
 *     # then delete parseBASE.ts and restore the .spec.ts name
 */
import { describe, it, expect } from 'vitest'
import { mini as reifyMini } from '@strudel/mini/mini.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readGridOnsets as NEW } from '../../../editor/src/visualEdit/notation/parse'

/**
 * Loaded through a non-literal specifier ON PURPOSE: `parseBASE.ts` is a scratch
 * copy that is deleted after the run, and a static import of a missing module is
 * a typecheck error in every build that follows. The indirection keeps this file
 * committed and green while the module it needs exists only during the A/B.
 */
const BASE = '../../../editor/src/visualEdit/notation/parseBASE'

const dir = path.dirname(fileURLToPath(import.meta.url))
const minis: string[] = JSON.parse(fs.readFileSync(path.join(dir, 'mini-corpus.json'), 'utf8'))
  .minis.map((o: { mini: string }) => o.mini.trim()).filter((m: string) => m !== '')

describe('#1034 A/B — derived atoms/spans/durs are byte-identical to the old reader', () => {
  it('agrees on every corpus mini across a 4-cycle window', async () => {
    const OLD = (await import(/* @vite-ignore */ BASE)).readGridOnsets as typeof NEW
    let compared = 0, occTotal = 0, derivedTotal = 0
    const diffs: string[] = []
    for (const m of minis) {
      for (const cyc of [0, 1, 2, 3]) {
        let pat: unknown
        try { pat = reifyMini(m) } catch { continue }
        const a = OLD(pat, cyc) as any
        const b = NEW(pat, cyc) as any
        if (a.ok !== b.ok) { diffs.push(`ok mismatch: ${m} @${cyc}`); continue }
        if (!a.ok) { if (a.gate !== b.gate) diffs.push(`gate: ${m} @${cyc}`); continue }
        compared++
        const strip = (o: any[]) => o.map((x) => ({ pos: x.pos, atoms: x.atoms, spans: x.spans, durs: x.durs }))
        if (JSON.stringify(strip(a.onsets)) !== JSON.stringify(strip(b.onsets))) {
          diffs.push(`onsets: ${JSON.stringify(m)} @${cyc}`)
        }
        for (const o of b.onsets) { occTotal += o.occ.length; derivedTotal += o.atoms.length }
      }
    }
    console.log(`\n  compared (ok) unit×cycle pairs: ${compared}`)
    console.log(`  occurrences RETAINED:           ${occTotal}`)
    console.log(`  atoms after display dedupe:     ${derivedTotal}`)
    console.log(`  occurrences the old reader DROPPED: ${occTotal - derivedTotal}`)
    console.log(`  differences in derived output:  ${diffs.length}`)
    if (diffs.length) console.log(diffs.slice(0, 10).join('\n'))
    expect(diffs).toHaveLength(0)
  })
})
