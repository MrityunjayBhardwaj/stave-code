/**
 * song-period-sweep — THE PINNED BASELINE for the Song timeline's display span,
 * per document, over the 150 real tunes (#1102).
 *
 * ── WHY A PER-DOCUMENT PIN, AND NOT A HISTOGRAM ──────────────────────────────
 * The fix #1102 needs makes the cycle fingerprint read the adapter's whole value
 * partition instead of three curated fields ([[PV255]]). A stricter fingerprint
 * can only LENGTHEN a detected period or make it null, and `analyzeSong` falls
 * back to `horizonCycles` (cap 256) when it finds none — so the change's real
 * risk is not "does the fixture pass" but "which documents move, and how far".
 * A histogram would report the same shape for two completely different sets of
 * movers. Every document's verdict is therefore pinned individually, and the
 * failure message IS the enumeration the fix's gate asks for.
 *
 * Committed BEFORE the production change, on a tree where `cycleFingerprints` is
 * untouched, so the "before" side of the comparison cannot be reconstructed
 * after the fact or quoted from another branch.
 *
 * ── HOW TO RE-BASELINE, deliberately awkward ─────────────────────────────────
 *   UPDATE_SONG_PERIOD_BASELINE=1 pnpm --filter @stave/app exec vitest run \
 *     tests/parity-corpus/song-period-sweep.test.ts
 * Then READ THE DIFF and enumerate the movers per axis in the PR. Re-baselining
 * without reading the diff is how a 256-cycle timeline ships green.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { periodHistogram, sweepCorpus, type PeriodVerdict } from './songPeriodSweep'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASELINE = path.join(HERE, 'SONG-PERIOD-BASELINE.json')

/** the per-document row the baseline pins — verdict only, no volatile counts */
interface BaselineRow {
  period: number | null
  span: number
  reachedCap: boolean
  lanes: number
}

function rowOf(v: PeriodVerdict): BaselineRow {
  return { period: v.period, span: v.span, reachedCap: v.reachedCap, lanes: v.lanes }
}

/**
 * The eight documents that do not evaluate headlessly. NAMED rather than
 * absorbed into a floor with slack in it, so a document that silently drops out
 * of the sweep fails here instead of quietly shrinking the denominator. The
 * classification (5 document-intrinsic · 2 browser-bound · 1 engine-version ·
 * 0 missing-scope) lives in `evalHarness.ts`; six of the eight cannot evaluate
 * in the live app either, which puts the honest ceiling at 144, not 150.
 */
const EVAL_FAILURES = [
  '0/-8Xqyjn750i4',
  '0/-MMxsqMYG_ID',
  '250/0vk9wpBvt6Nd',
  '500/3CMJf_qbfks9',
  '500/3HWHF_ZUbZD_',
  '500/3H_LAkg97Urt',
  '500/3HvvWoaCyciz',
  '500/3L25jxCjZ235',
]

describe('Song display period — corpus baseline (#1102)', () => {
  it('every document reports the period it reported when this was pinned', async () => {
    const verdicts = await sweepCorpus()
    const evaluated = verdicts.filter((v) => v.ok)

    const actual: Record<string, BaselineRow> = {}
    for (const v of verdicts) if (v.ok) actual[v.name] = rowOf(v)

    if (process.env.UPDATE_SONG_PERIOD_BASELINE === '1') {
      fs.writeFileSync(BASELINE, JSON.stringify(actual, null, 2) + '\n')
    }

    const hist = [...periodHistogram(verdicts).entries()].sort((a, b) => b[1] - a[1])
    console.log(
      [
        '',
        `─── Song display period, ${evaluated.length}/${verdicts.length} documents evaluated ───`,
        ...hist.map(([k, n]) => `  period ${k.padEnd(22)} ${n}`),
        `  aperiodic-at-cap ${evaluated.filter((v) => v.reachedCap).length}`,
        `  period 1          ${evaluated.filter((v) => v.period === 1).length}   ← the pool #1102's fix can move`,
      ].join('\n'),
    )

    // COVERAGE IS A RESULT, NOT A PRECONDITION — and the residual is named, not
    // floored with slack. Same population and same harness as the miniSource
    // calibration, so the two arms must agree about who is missing.
    expect(verdicts.filter((v) => !v.ok).map((v) => v.name).sort()).toEqual(EVAL_FAILURES)
    expect(evaluated.length).toBe(142)

    const expected: Record<string, BaselineRow> = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
    // Per-document, so a failure NAMES the movers rather than reporting a
    // distribution that moved. `toEqual` on the whole map gives the enumeration
    // in one diff.
    expect(actual).toEqual(expected)
  }, 600_000)
})
