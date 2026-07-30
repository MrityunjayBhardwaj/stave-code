/**
 * songPeriodSweep — THE ONE definition of "what period does the Song timeline
 * give this document", measured over the 150 real tunes (#1102).
 *
 * ── WHY THIS EXISTS BEFORE ANY FIX ───────────────────────────────────────────
 * `cycleFingerprints` decides the display span, the mark window, the sections,
 * the playhead wrap and every clip extent. A stricter fingerprint can only
 * LENGTHEN detected periods or null them ([[PV255]]), and `reachedCap` drives
 * only a LABEL (`FullSongTimeline.tsx:1409-1417`) while the span itself takes
 * `periodCycles ?? horizonCycles`, cap 256 — so a document reading period 1
 * today can land on a 256-cycle-wide timeline after a fix that is locally
 * correct. That risk is not analysable from the diff; it has to be swept.
 *
 * So this module is the BASELINE instrument, committed and pinned before the
 * production code is touched, and re-run afterwards with every moved document
 * enumerated per axis.
 *
 * ── FIDELITY: WHY IT GOES THROUGH THE PER-TRACK PATTERNS ─────────────────────
 * The whole defect lives in a lane key. `laneKeyOf` is `ev.trackId ?? ev.s`, and
 * production ALWAYS supplies a `trackId` — `getTimelineEvents` stamps the
 * capture key on every hap (`StrudelEngine.ts:1366-1378`) and `MusicalTimeline`
 * then remaps it to the structural lane (`MusicalTimeline.tsx:266`). A probe
 * that queried one stacked pattern would produce haps with no `trackId`, the
 * `?? ev.s` fallback would put the sample name into the fingerprint by accident,
 * and the sweep would report a healthy corpus. Hence `evalSongTracks`, which
 * mirrors `songPatterns` rather than the repl's play pattern.
 *
 * The analysis itself is the PRODUCTION function — `analyzeSong` with an
 * injected collector, exactly as `MusicalTimeline.tsx:269` calls it, so the
 * progressive horizon, the doubling, the cap and the one-loop trim are the real
 * ones and not a re-implementation ([[PV192]]: a second oracle can only agree
 * with itself).
 *
 * ── DECLARED BOUNDS, so no figure here is quoted wider than it holds ──────────
 *  1. 142 of the 150 tunes evaluate headlessly, and the eight that do not are
 *     NAMED (`evalHarness.ts` header: 5 document-intrinsic, 2 browser-bound,
 *     1 engine-version). Report the bound with every figure; do not smooth it.
 *  2. Lanes are keyed by CAPTURE key, not by the structural lane the app remaps
 *     to. Period is invariant under relabelling; only a join that MERGED two
 *     capture keys could move one (upward). See `evalSongTracks`' own note.
 *  3. `analyzeSong` stops at the first period it can confirm, so a document
 *     reported aperiodic is aperiodic WITHIN the 256-cycle cap — a different
 *     fact from "has no period", and counted separately.
 */
// Imported from the MODULES, never from the `@stave/editor` barrel: the barrel
// drags `gifenc` (CJS) into the hermetic app test env and the suite fails to
// collect ([[feedback_editor_barrel_import_breaks_app_tests]]).
import { analyzeSong } from '../../../editor/src/ir/songAnalysis'
import type { IREvent } from '../../../editor/src/ir/IREvent'
import { normalizeStrudelHap } from '../../../editor/src/engine/NormalizedHap'
import {
  evalSongTracks,
  loadCorpus,
  type SongTrack,
} from '../../../editor/src/visualEdit/miniSource/__tests__/evalHarness'

export { loadCorpus }

/** One document's Song-timeline verdict. */
export interface PeriodVerdict {
  name: string
  /** false when the document did not evaluate — see bound 1. */
  ok: boolean
  error?: string
  /** `analyzeSong`'s detected display period, or null when none within the cap. */
  period: number | null
  /** the span the timeline actually draws: `period ?? horizon`. */
  span: number
  /** true when the progressive horizon hit the cap without confirming a period. */
  reachedCap: boolean
  /** distinct lane keys the analysis produced. */
  lanes: number
  /** total events collected over the analysed horizon. */
  events: number
}

/**
 * The collector production injects, reproduced against per-track patterns.
 *
 * Mirrors `MusicalTimeline.tsx:260-266` including its onset filter: a hap whose
 * `whole.begin` precedes the band is a FRAGMENT of an earlier cycle's note and
 * must not be counted as an onset in this one.
 */
function trackCollector(tracks: readonly SongTrack[]) {
  return (startCycle: number, endCycle: number): IREvent[] => {
    const out: IREvent[] = []
    for (const { trackId, pattern } of tracks) {
      let haps: unknown[]
      try {
        haps = pattern.queryArc(startCycle, endCycle) as unknown[]
      } catch {
        continue // per-track query failure — skipped, as the engine skips it
      }
      for (const hap of haps) {
        const ev = normalizeStrudelHap(hap, trackId)
        const c = Math.floor(ev.begin)
        if (c >= startCycle && c < endCycle) out.push(ev)
      }
    }
    return out
  }
}

/** Analyse one already-evaluated document through the production path. */
export async function periodOfTracks(
  tracks: readonly SongTrack[],
): Promise<Omit<PeriodVerdict, 'name' | 'ok' | 'error'>> {
  let events = 0
  const collect = trackCollector(tracks)
  const analysis = await analyzeSong(null, {
    // no yield: this is a batch sweep, not a frame budget. The yield primitive is
    // injectable precisely so the slicing logic stays deterministic under test.
    yieldFn: async () => {},
    collectFn: (a, b) => {
      const evs = collect(a, b)
      events += evs.length
      return evs
    },
  })
  return {
    period: analysis.periodCycles,
    span: analysis.periodCycles ?? analysis.horizonCycles,
    reachedCap: analysis.reachedCap,
    lanes: analysis.lanes.length,
    events,
  }
}

/** Evaluate + analyse one document. */
export async function periodOfDocument(code: string, name: string): Promise<PeriodVerdict> {
  const r = await evalSongTracks(code)
  if (!r.ok) {
    return {
      name,
      ok: false,
      error: r.error,
      period: null,
      span: 0,
      reachedCap: false,
      lanes: 0,
      events: 0,
    }
  }
  try {
    return { name, ok: true, ...(await periodOfTracks(r.tracks)) }
  } catch (e: unknown) {
    return {
      name,
      ok: false,
      error: 'analyze: ' + String((e as Error)?.message ?? e),
      period: null,
      span: 0,
      reachedCap: false,
      lanes: 0,
      events: 0,
    }
  }
}

/** Sweep the whole corpus, in corpus order. */
export async function sweepCorpus(): Promise<PeriodVerdict[]> {
  const corpus = await loadCorpus()
  const out: PeriodVerdict[] = []
  for (const { name, code } of corpus) out.push(await periodOfDocument(code, name))
  return out
}

/** `period → how many documents` — the distribution the risk is read from. */
export function periodHistogram(verdicts: readonly PeriodVerdict[]): Map<string, number> {
  const h = new Map<string, number>()
  for (const v of verdicts) {
    if (!v.ok) continue
    const k = v.period === null ? `aperiodic(span ${v.span})` : String(v.period)
    h.set(k, (h.get(k) ?? 0) + 1)
  }
  return h
}
