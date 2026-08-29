/**
 * stagesParityCorpus — THE PINNED BASELINE for staged-pipeline parity with
 * `parseStrudel`, per document, over the 150 real tunes (#1375).
 *
 * ── THE CONTRACT, AND WHY IT NEEDED A WIDER GATE ─────────────────────────────
 * `parseStrudelStages.ts:6` states it plainly:
 *
 *   "End-to-end behavior at FINAL is byte-identical to parseStrudel(code)."
 *
 * The D-06 sentinel in `parseStrudelStages.test.ts` asserts exactly that — over
 * 13 hand-written fixtures. Of those 13, **0 contain a `const` or `let`** and
 * **0 contain `arrange(` / `cat(` / `slowcat(`**.
 *
 * ── THREE NUMBERS, AND WHY THE ISSUE'S 17 IS THE SMALLEST ────────────────────
 * Measured over the 150-tune corpus, "diverges" has three defensible readings,
 * and they differ by 2.6×:
 *
 *   44  deep equality      — the stated contract, and what D-06 asserts
 *   26  full shape tree    — the two sides disagree on structure anywhere
 *   17  top-level tag only — they disagree at the FIRST node inside Track
 *
 * #1375's body quotes **17**. That is the weakest of the three: it counts a
 * document only when the very top node changed, so a document whose structure
 * is wrong three levels down does not appear in it at all. The contract the file
 * actually states is byte-identity, and by that measure **44 of 150 (29%)**
 * diverge. All three are pinned below so no fix can improve one while quietly
 * worsening another.
 *
 * A gate is only as wide as its fixture list. This is the third bug of the class
 * — #113 (a prelude lifted as opaque Code → empty timeline), #671 (labelled
 * tracks losing their labels), #1373 (`arrange()` behind consts → a 3:28 song
 * bounced at 0:08) — each found through a downstream consumer degrading quietly,
 * each closed by adding one more fixture. This file replaces that loop with a
 * number that cannot drift unnoticed.
 *
 * ── WHY A PER-DOCUMENT PIN, AND NOT JUST THE COUNTS ──────────────────────────
 * A count is the wrong instrument: fixing three binding cases while breaking
 * three others reports 17 and looks like a no-op. Two entirely different sets of
 * documents produce the same headline. Every document's verdict is therefore
 * pinned individually, and the failure message IS the enumeration — which
 * documents moved, and which direction.
 *
 * The 150 rows are pinned INCLUDING the matching ones, deliberately. If only
 * divergences were pinned, a document dropping out of the sweep entirely would
 * shrink the denominator in silence and read as progress.
 *
 * A parse that THROWS is recorded as a divergence carrying its error, never
 * skipped, for the same reason.
 *
 * ── WHAT THEY ARE, as of this pin ────────────────────────────────────────────
 * Of the 17 tag-level divergences, 10 have a top-level `const`/`let` binding
 * (the 44 deep divergences are not yet classified). `parseStrudel` threads a
 * `bindings` map through its parse (`parseStrudel.ts:849-854`); the staged copy
 * never builds one — `parseRootWithChainMeta` (`parseStrudelStages.ts:218`)
 * calls `parseRoot` directly and stops — so a document that NAMES anything
 * collapses to an opaque `Code` node at MINI-EXPANDED.
 *
 * The remaining 7 tag-level cases, and the 18 documents that diverge deeply
 * while agreeing on shape, are UNCHARACTERISED at the time of this pin. They are
 * not guessed at here; step 1 of #1375 classifies them from these rows.
 *
 * ⚠ The `Stack→Seq` and `Param→Stack` rows deserve more alarm than the
 * `→Code` ones. An opaque blob is visibly nothing and fails loudly downstream;
 * a DIFFERENT structure looks right and is consumed as though it were correct.
 *
 * ── HOW TO RE-BASELINE, deliberately awkward ─────────────────────────────────
 *   UPDATE_STAGES_PARITY_BASELINE=1 pnpm --filter @stave/editor exec vitest run \
 *     src/ir/__tests__/stagesParityCorpus.test.ts
 * Then READ THE DIFF and enumerate the movers in the PR. The whole point of this
 * file is that the number moves for a stated reason; re-baselining without
 * reading the diff restores the blindness it was written to remove.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hasCorpusArchive, loadCorpus, CORPUS_RESTORE_HINT } from '../../visualEdit/miniSource/__tests__/evalHarness'
import { parityRow, type ParityRow } from './helpers/stagesParity'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASELINE = path.join(HERE, 'STAGES-PARITY-BASELINE.json')

/** The corpus is 3 offsets × 50 tunes. Pinned so a short read fails loudly. */
const CORPUS_SIZE = 150

/**
 * TWO headline numbers, because the contract and the damage are different
 * questions — see `ParityRow`.
 *
 * ⚠ #1375's body quotes 17. That is the SHAPE number. Measured deeply — which
 * is what `parseStrudelStages.ts:6` actually promises and what the D-06
 * sentinel asserts with `toEqual` — the corpus diverges on 44. Both are pinned
 * so neither can drift, and so that a fix which improves one while worsening
 * the other cannot report success.
 */
const DEEP_DIVERGENCE = 44
const SHAPE_DIVERGENCE = 26
const TAG_DIVERGENCE = 17

/**
 * The four measured mechanisms behind the 44 (#1375 step 1) — see
 * `classifyDivergence`. Pinned per class so a fix is scored against the
 * mechanism it claims to address, instead of against one total that three
 * different changes could move by the same amount.
 *
 * Bindings are NOT a class of their own — they cut across these. 28 of the 44
 * documents carry a top-level `const`/`let`/`var`, concentrated in A (15/18)
 * and C (10/16) and nearly absent from B (1/8). So the binding fix in step 2
 * should empty most of A and C, and is expected to move B by roughly nothing.
 */
const BY_CLASS: Record<string, number> = {
  'A-opaque-collapse': 18,
  'C-via-vs-blob': 16,
  'B-track-count': 8,
  'D-metadata': 2,
}

describe('staged pipeline vs parseStrudel — corpus parity baseline (#1375)', () => {
  // `.bakery-runs/` is gitignored — unreviewed third-party tunes (#1307). On a
  // machine without it this SKIPS rather than dying on an ENOENT naming a path
  // git refuses to track. `CORPUS_RESTORE_HINT` says how to rebuild it.
  it.skipIf(!hasCorpusArchive())(
    'every document reports the parity verdict it reported when this was pinned',
    async () => {
      const corpus = await loadCorpus()
      expect(
        corpus.length,
        `corpus is ${corpus.length}, expected ${CORPUS_SIZE}. ${CORPUS_RESTORE_HINT}`,
      ).toBe(CORPUS_SIZE)

      const actual: Record<string, ParityRow> = {}
      for (const { name, code } of corpus) actual[name] = parityRow(code)

      if (process.env.UPDATE_STAGES_PARITY_BASELINE === '1') {
        fs.writeFileSync(BASELINE, JSON.stringify(actual, null, 2) + '\n')
        return
      }

      const expected: Record<string, ParityRow> = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))

      // Enumerate the movers, per document and per direction — this message is
      // the deliverable when the gate goes red, not a hint to go investigate.
      const gained: string[] = []   // diverged -> matches  (a FIX)
      const lost: string[] = []     // matches  -> diverges (a REGRESSION)
      const reshaped: string[] = [] // still diverges, differently
      const missing: string[] = []

      for (const name of Object.keys(expected)) {
        const e = expected[name]
        const a = actual[name]
        if (!a) { missing.push(name); continue }
        if (e.match && !a.match) lost.push(`  ${name}  ${a.direct}  !=  ${a.staged}`)
        else if (!e.match && a.match) gained.push(`  ${name}  now matches (was ${e.direct} != ${e.staged})`)
        else if (!e.match && !a.match && (e.direct !== a.direct || e.staged !== a.staged)) {
          reshaped.push(`  ${name}\n    was  ${e.direct} != ${e.staged}\n    now  ${a.direct} != ${a.staged}`)
        }
      }
      const added = Object.keys(actual).filter((n) => !(n in expected))

      const report = [
        lost.length     ? `REGRESSED — these matched when pinned and no longer do (${lost.length}):\n${lost.join('\n')}` : '',
        gained.length   ? `FIXED — these diverged when pinned and now match (${gained.length}):\n${gained.join('\n')}` : '',
        reshaped.length ? `RESHAPED — still diverging, differently (${reshaped.length}):\n${reshaped.join('\n')}` : '',
        missing.length  ? `DROPPED OUT of the sweep (${missing.length}):\n  ${missing.join('\n  ')}` : '',
        added.length    ? `NEW in the corpus (${added.length}):\n  ${added.join('\n  ')}` : '',
      ].filter(Boolean).join('\n\n')

      expect(report, `staged-pipeline parity moved.\n\n${report}\n\nIf this is intended, re-baseline and enumerate the movers in the PR.`).toBe('')
    },
  )

  it.skipIf(!hasCorpusArchive())(
    'the divergence count is the number the issue quotes',
    async () => {
      const expected: Record<string, ParityRow> = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
      const diverging = Object.values(expected).filter((r) => !r.match).length
      // Not a second source of truth — a guard on the FIRST. It exists so that
      // a re-baseline which quietly accepts a worse number has to change a
      // literal a reviewer can see in the diff.
      const shapeDiverging = Object.values(expected).filter((r) => !r.shapeMatch).length
      const tagDiverging = Object.values(expected).filter((r) => !r.tagMatch).length
      expect(diverging).toBe(DEEP_DIVERGENCE)
      expect(shapeDiverging).toBe(SHAPE_DIVERGENCE)
      expect(tagDiverging).toBe(TAG_DIVERGENCE)

      const byClass: Record<string, number> = {}
      for (const r of Object.values(expected)) {
        if (!r.match && r.cls) byClass[r.cls] = (byClass[r.cls] ?? 0) + 1
      }
      expect(byClass).toEqual(BY_CLASS)
      expect(Object.values(BY_CLASS).reduce((a, b) => a + b, 0)).toBe(DEEP_DIVERGENCE)
      expect(Object.keys(expected)).toHaveLength(CORPUS_SIZE)
    },
  )
})
