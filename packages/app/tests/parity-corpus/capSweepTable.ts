/**
 * capSweepTable.ts — the roll cap sweep's own table, generated from the runs rather than
 * typed out of them (#1270).
 *
 * WHAT WENT WRONG, AGAIN, ONE SECTION UP. #1046 fixed `ROLL-CAP-SWEEP.md`'s P6 section.
 * The section directly above it — the sweep proper, which is what the whole document is
 * named for — had the same disease and was not in that issue's scope. Re-measured on
 * `studio_v0.2.0`:
 *
 *     population A asks   1086 -> 1180        A reach  4/6/8/12   85/85/86/86 -> 95/95/96/96
 *     population B asks    414 ->  453        B transfers         339/340/352/355 -> 369/371/383/386
 *
 * Every figure, in the same direction, because #1242 widened the corpus underneath a table
 * last taken at 1535 units.
 *
 * ⚠⚠ AND THE CLAIMS SURVIVED WHILE THE DIGITS ROTTED, WHICH IS THE READING THAT MATTERS.
 * "Population A's reach moves by exactly ONE ask, at cap 8 and above" is still exactly true
 * (95 -> 96 at cap 8). "Zero asks moved to a worse outcome at any cap, on either
 * population" is still true. So the DECISION the document reaches is unchanged — and
 * anyone re-reading the table to check that decision would have been checking it against
 * four wrong numbers. A conclusion that survives its evidence going stale is the most
 * dangerous kind to leave transcribed, because nothing about it looks wrong.
 *
 * ONE CLAIM DID MOVE, AND IT IS LOAD-BEARING. The document argues the raise should not
 * ship before #1012 because it opens "nine views, 27.6% live" on the population production
 * actually reaches — "squarely inside the 13-58% band the original decision refused".
 * Measured today that gained set is **12 views at 47.8% live**. Still inside the band, so
 * the conclusion holds; but "mostly-inert" now describes a set where nearly half the notes
 * respond, and the margin is far thinner than the sentence reads. Generated here so the
 * next reader sees the number rather than the characterisation.
 *
 * HOW THE COLUMNS ARE OBTAINED. The shipped cap's reading is free — every run of
 * `roll-cap-sweep.test.ts` produces it. The other three are OBSERVATIONS: the cap is a
 * module constant, so reading the sweep at 6, 8 or 12 means rewriting `parse.ts` and
 * running again, which no gate can do. They are committed in `ROLL-CAP-SWEEP.json` with
 * the same run's shipped-cap reading as an expiry stamp, and `generatedDoc.ts` carries the
 * mechanism and its stated limit.
 */
import { assertCompanionCurrent, blockMarkers, writeGeneratedBlock } from './generatedDoc'

/** the subset of a sweep row this table reads */
export interface SweepAsk {
  pop: string
  outcome: 'transfers' | 'no-view' | 'view-corrupts' | 'no-probe'
  writer?: 'leaf' | 'element'
  structured?: boolean
  alive?: number
  probed?: number
}

export interface SweepColumns {
  asks: number
  /** any derived writer answered */
  opened: number
  /** …and it was the LEAF writer, the one this cap governs */
  leafOpened: number
  transfers: number
  noView: number
  noProbe: number
  /** must be 0 at every cap: a view that mis-writes is worse than no view */
  viewCorrupts: number
  /** of the leaf-served views, how many are worth showing (more than one note) */
  leafStructured: number
  /** notes of leaf-served views whose own delete round-trips / notes cleanly probeable */
  leafAlive: number
  leafProbed: number
}

export interface SweepReading {
  cap: number
  /** core-REFUSED — what production reaches today, as the fallback */
  A: SweepColumns
  /** core-SERVED — what the core's deletion would inherit (#1012) */
  B: SweepColumns
}

function columns(rows: readonly SweepAsk[]): SweepColumns {
  const by = (o: SweepAsk['outcome']) => rows.filter((r) => r.outcome === o).length
  const leaf = rows.filter((r) => r.outcome !== 'no-view' && r.writer === 'leaf')
  const probed = leaf.filter((r) => (r.probed ?? 0) > 0)
  return {
    asks: rows.length,
    opened: rows.filter((r) => r.outcome !== 'no-view').length,
    leafOpened: leaf.length,
    transfers: by('transfers'),
    noView: by('no-view'),
    noProbe: by('no-probe'),
    viewCorrupts: by('view-corrupts'),
    leafStructured: leaf.filter((r) => r.structured).length,
    leafAlive: probed.reduce((n, r) => n + (r.alive ?? 0), 0),
    leafProbed: probed.reduce((n, r) => n + (r.probed ?? 0), 0),
  }
}

/**
 * The whole reading at one cap, each population alone.
 *
 * NEVER netted. `writer-reach`'s population is `if (core.ok) continue` and the census's is
 * its complement; a cap figure that mixes them is a number about no population at all, and
 * that is the error that set this cap to 4 in the first place ([[P345]]). The two move in
 * opposite directions because they are made of different notation.
 */
export function readSweep(rows: readonly SweepAsk[], cap: number): SweepReading {
  return {
    cap,
    A: columns(rows.filter((r) => r.pop === 'A-core-refused')),
    B: columns(rows.filter((r) => r.pop === 'B-core-served')),
  }
}

export interface SweepObservation {
  note: string
  /** re-run this when `assertSweepObservationCurrent` reddens */
  script: string
  /** readings at caps this tree does not ship — the ones no gate can re-derive */
  observed: SweepReading[]
  /** the SAME RUN's reading at the shipped cap. Free to re-take, so it is the expiry. */
  companion: SweepReading
}

export function assertSweepObservationCurrent(
  obs: SweepObservation,
  liveRows: readonly SweepAsk[],
  liveCap: number,
): void {
  assertCompanionCurrent({
    what: `the committed roll-cap sweep observation (caps ${obs.observed.map((r) => r.cap).join(', ')})`,
    script: obs.script,
    companion: obs.companion,
    live: readSweep(liveRows, liveCap),
  })
}

/**
 * Is the committed sweep observation internally coherent?
 *
 * The currency check cannot see the observed readings at all — they are the un-derivable
 * part, which is the whole reason they are committed. What it can insist on is that each
 * one adds up and that the set is actually a set of OTHER caps: a single hand-edited field
 * then fails, which is the realistic failure this discipline exists to stop. A wholly
 * self-consistent fabrication still would not be caught, and nothing short of re-running
 * the script would catch it.
 */
export function assertSweepObservationCoherent(obs: SweepObservation): void {
  const wrong: string[] = []
  for (const r of [...obs.observed, obs.companion])
    for (const [pop, c] of [
      ['A', r.A],
      ['B', r.B],
    ] as const) {
      if (c.transfers + c.noProbe + c.viewCorrupts !== c.opened)
        wrong.push(
          `cap ${r.cap} ${pop}: transfers ${c.transfers} + no-probe ${c.noProbe} + corrupts ` +
            `${c.viewCorrupts} !== opened ${c.opened}`,
        )
      if (c.opened + c.noView !== c.asks)
        wrong.push(`cap ${r.cap} ${pop}: opened ${c.opened} + no-view ${c.noView} !== asks ${c.asks}`)
      if (c.leafOpened > c.opened)
        wrong.push(`cap ${r.cap} ${pop}: leaf-opened ${c.leafOpened} exceeds opened ${c.opened}`)
      if (c.leafAlive > c.leafProbed)
        wrong.push(`cap ${r.cap} ${pop}: alive ${c.leafAlive} exceeds probed ${c.leafProbed}`)
    }
  const caps = obs.observed.map((r) => r.cap)
  if (caps.includes(obs.companion.cap))
    wrong.push(`the shipped cap ${obs.companion.cap} also appears among the observed caps`)
  if (new Set(caps).size !== caps.length) wrong.push(`the observed caps repeat: ${caps.join(', ')}`)
  if (wrong.length)
    throw new Error(
      `ROLL-CAP-SWEEP.json does not reconcile with itself — a field was edited rather than observed:\n` +
        wrong.map((s) => `    ${s}`).join('\n') +
        `\n  Re-take it:  ${obs.script}`,
    )
}

/* ── the generated section ───────────────────────────────────────────────────── */

const pct = (a: number, b: number): string => (b === 0 ? '—' : `${((100 * a) / b).toFixed(1)}%`)

export function renderSweepTable(obs: SweepObservation, live: SweepReading): string {
  const all = [live, ...obs.observed].sort((x, y) => x.cap - y.cap)
  const caps = all.map((r) => r.cap)
  const shipped = live.cap
  const head = `| | ${all.map((r) => (r.cap === shipped ? `**${r.cap}** (shipped)` : String(r.cap))).join(' | ')} |`
  const rule = `|---|${all.map(() => '---').join('|')}|`
  const row = (label: string, f: (r: SweepReading) => string): string =>
    `| ${label} | ${all.map(f).join(' | ')} |`

  const aReach = all.map((r) => r.A.transfers)
  const bReach = all.map((r) => r.B.transfers)
  const worst = all.reduce((n, r) => n + r.A.viewCorrupts + r.B.viewCorrupts, 0)

  return [
    `> **REGENERATED BY THE SWEEP ON EVERY RUN AT THE SHIPPED CAP — no dating banner above`,
    `> this block applies to it.** The shipped column is derived from the run; the others are`,
    `> observations committed in \`ROLL-CAP-SWEEP.json\`, re-taken by \`${obs.script}\`.`,
    ``,
    `Both populations, all ${caps.length} caps, the real shipped writers at each value —`,
    `**A** = core-REFUSED (${live.A.asks} roll asks, what production reaches today),`,
    `**B** = core-SERVED (${live.B.asks} roll asks, what #1012 would inherit).`,
    ``,
    head,
    rule,
    row('**A** reach (transfers)', (r) => String(r.A.transfers)),
    row('**B** transfers', (r) => String(r.B.transfers)),
    row('A views opened by the leaf writer', (r) => String(r.A.leafOpened)),
    row('B views opened by the leaf writer', (r) => String(r.B.leafOpened)),
    row('A leaf notes live', (r) => `${r.A.leafAlive}/${r.A.leafProbed} ${pct(r.A.leafAlive, r.A.leafProbed)}`),
    row('B leaf notes live', (r) => `${r.B.leafAlive}/${r.B.leafProbed} ${pct(r.B.leafAlive, r.B.leafProbed)}`),
    row('views that CORRUPT (must be 0)', (r) => String(r.A.viewCorrupts + r.B.viewCorrupts)),
    ``,
    `- **Population A's reach moves by ${aReach[aReach.length - 1] - aReach[0]} ask(s) across the whole range** ` +
      `(${aReach.join(' → ')}). It is the population production reaches today, and it is the ` +
      `reason the cap has not been raised: the gain there is a rounding error.`,
    `- **Population B gains ${bReach[bReach.length - 1] - bReach[0]} transfers** ` +
      `(${bReach.join(' → ')}), every one served by the leaf writer, which is the writer this ` +
      `cap governs. B is a counterfactual until the core is deleted.`,
    `- **${worst === 0 ? 'Zero' : String(worst)} views corrupt on either population at any cap**, and zero asks ` +
      `moved to a worse outcome per ask — checked against the shipped-cap rows rather than by ` +
      `netting totals, since an ask lost and an ask gained sum to no change.`,
    ``,
    `The ceiling is ${caps[caps.length - 1]} and not a round number: \`detectPeriod\` confirms a period \`p\` only`,
    `once \`2p\` cycles were probed, and \`PERIOD_PROBE\` is 24. A higher cap would admit periods`,
    `this code has never verified, and a period-32 pattern would masquerade as period-16 — a`,
    `view that silently stops being true one cycle past its own width.`,
  ].join('\n')
}

/** this table's marker pair; the splice itself lives in `generatedDoc.ts` */
export const SWEEP_BLOCK = blockMarkers('SWEEP-TABLE', '#1270', 'roll-cap-sweep.test.ts')

export function spliceSweepBlock(source: string, body: string, where: string): string {
  return writeGeneratedBlock(source, body, SWEEP_BLOCK, where)
}
