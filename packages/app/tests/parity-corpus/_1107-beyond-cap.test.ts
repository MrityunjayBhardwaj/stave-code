/**
 * PROBE E (#1107 self-review, delete before PR) — of the registered patterns that
 * produce nothing inside the 256-cycle cap, how many are SILENT and how many
 * merely enter later?
 *
 * The presence clause lifts at the cap so a silent track cannot stall a document
 * forever. That is right for silence and wrong-looking for a late entry: such a
 * track is still absent from `analysis.lanes` and still draws an empty, unmarked
 * row. The difference is not observable from inside the cap, so this asks past it.
 */
import { describe, it } from 'vitest'
import type { IREvent } from '../../../editor/src/ir/IREvent'
import { normalizeStrudelHap } from '../../../editor/src/engine/NormalizedHap'
import { evalSongTracks, loadCorpus } from '../../../editor/src/visualEdit/miniSource/__tests__/evalHarness'

const CAP = 256
const BEYOND = 1024

describe('#1107 probe E — silence vs. a late entry past the cap', () => {
  it('classifies every unheard registered track', async () => {
    const corpus = await loadCorpus()
    const rows: string[] = []
    let evaluated = 0
    for (const { name, code } of corpus) {
      const r = await evalSongTracks(code)
      if (!r.ok) continue
      evaluated++
      for (const { trackId, pattern } of r.tracks) {
        const count = (from: number, to: number): number => {
          try {
            const haps = pattern.queryArc(from, to) as unknown[]
            let n = 0
            for (const hap of haps) {
              const ev: IREvent = normalizeStrudelHap(hap, trackId)
              const c = Math.floor(ev.begin)
              if (c >= from && c < to) n++
            }
            return n
          } catch {
            return -1
          }
        }
        const inside = count(0, CAP)
        if (inside !== 0) continue
        const outside = count(CAP, BEYOND)
        rows.push(`${name} :: ${trackId} :: inside=${inside} beyond256=${outside}`)
      }
    }
    // eslint-disable-next-line no-console
    console.log('=== PROBE E ===\n' + JSON.stringify({ evaluated, unheard: rows.length, rows }, null, 1))
  }, 1_800_000)
})
