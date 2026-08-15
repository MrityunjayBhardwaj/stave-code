/**
 * p6Table.ts — the P6 blocker table: ONE derivation, generated into the documents rather
 * than transcribed into them, and an expiry stamp for the one column no gate can produce
 * (#1046).
 *
 * WHAT WENT WRONG. `ROLL-CAP-SWEEP.md` and `WRITER-CENSUS.md` both carry a section
 * reporting what the roll's period cap does to the number #1012 is scoped against. Every
 * figure in them was typed out by hand from a run, and the corpus has been rebuilt three
 * times since (#1037, #1066, #1242) with a fourth admission change at #1260. Measured on
 * `studio_v0.2.0` at the tip: of the four rows in that section, THREE were wrong and one
 * was right by accident — the "untransferable, both surfaces" row read 68, had passed
 * through 78 at #1043, and had landed back on 68. **A partly-correct table is what makes
 * the rest of it look corroborated.**
 *
 * And the diagnosis is not "the figure is ungated" ([[P574]]). The cap-4 blocker has been
 * gated the whole time — `writer-census.test.ts` pins it — so the documents have been
 * drifting from a GREEN pin, which is strictly worse than drifting from nothing, because
 * the green run reads as though it had checked the prose.
 *
 * SO THE TABLE IS GENERATED. `renderP6Table` produces the section body and
 * `writeGeneratedBlock` splices it between markers in both documents on every census run.
 * Nothing asserts the documents' contents, and that is deliberate: a test that both writes
 * a file and asserts it is the circularity of [[P578]] wearing a different hat. Generation
 * removes the drift by construction; there is nothing left for an assertion to catch.
 *
 * THE COLUMN THAT CANNOT BE GENERATED, AND THE POINT OF THIS FILE. The cap-12 column is
 * an OBSERVATION: the cap is a module constant, so reading the census at 12 means
 * rewriting `parse.ts` and running again — which no gate can do. #1046 prescribes
 * "derive the table, do not transcribe it", and that prescription reaches three of the
 * four rows and is silent on the fourth, which is the one #1012 is actually scoped
 * against. Replacing that observation with a derivation (subtracting the cap's known
 * contribution) is the same defect in the other direction and was refused when it was
 * first proposed.
 *
 * What it gets instead is an EXPIRY. `scripts/p6-cap-census.mjs` records the candidate
 * cap's reading and, from the SAME RUN, the shipped cap's reading as a `companion`. The
 * shipped column is free to re-derive in any gate, so `assertObservationCurrent` re-takes
 * it live and requires a match. Any change that moves the cap-4 world — a corpus rebuild,
 * an admission change, a writer fix — reddens with "re-run the sweep" instead of leaving a
 * stale cap-12 number sitting in Markdown.
 *
 * ⚠ STATED LIMIT, not glossed: the companion is a NECESSARY condition, not a sufficient
 * one. A change touching only patterns whose period falls in (shipped, candidate] moves
 * the observed column while leaving the companion identical, and this check would pass. It
 * is strictly better than the nothing that guarded this figure before, and it is not proof
 * of currency. When the roll's period gate itself changes, re-run the script whether or
 * not this is green.
 */

/** the subset of a census ask this table reads — kept structural so a grid model, a roll
 *  model and the script's re-read of `WRITER-CENSUS.json` all satisfy it with no cast */
export interface P6Ask {
  surface: 'step' | 'roll'
  outcome: 'transfers' | 'no-view' | 'view-corrupts' | 'no-probe'
  arrayValue: boolean
  coreProbe: 'ok' | 'corrupt' | 'no-probe'
  coreStructured: boolean
}

export interface P6Columns {
  asks: number
  transfers: number
  /** no derived view at all, or a view that corrupts — the two ways an ask fails to transfer */
  untransferable: number
  /** of those, the ones playing a `word:index` array value — a hole, not a bound */
  arrayValue: number
  /** …and the complement: the ones where the bijection genuinely fails */
  structural: number
  /** of the structural set, how many have a core view worth keeping */
  coreStructured: number
  /** …and how many have a core edit that verified */
  coreEdits: number
  /**
   * THE CONJUNCTION. Both at once, and only both: "has a structured core view" and "has a
   * verified core edit" are different filters over the same set, and quoting either alone
   * overstates what deleting the core would cost.
   */
  blocker: number
}

export interface P6Reading {
  cap: number
  both: P6Columns
  grid: P6Columns
  roll: P6Columns
}

const UNTRANSFERABLE = new Set(['no-view', 'view-corrupts'])

export function p6Columns(rows: readonly P6Ask[]): P6Columns {
  const untransferable = rows.filter((r) => UNTRANSFERABLE.has(r.outcome))
  const structural = untransferable.filter((r) => !r.arrayValue)
  return {
    asks: rows.length,
    transfers: rows.filter((r) => r.outcome === 'transfers').length,
    untransferable: untransferable.length,
    arrayValue: untransferable.length - structural.length,
    structural: structural.length,
    coreStructured: structural.filter((r) => r.coreStructured).length,
    coreEdits: structural.filter((r) => r.coreProbe === 'ok').length,
    blocker: structural.filter((r) => r.coreStructured && r.coreProbe === 'ok').length,
  }
}

/**
 * The whole reading at one cap, both surfaces and each alone.
 *
 * Each surface is reported on its own because the constant is PER SURFACE and roll-only:
 * the grid columns are this measurement's control arm, and a netted figure is a number
 * about no population at all ([[P345]]) — the error that set this cap in the first place.
 */
export function readP6(rows: readonly P6Ask[], cap: number): P6Reading {
  return {
    cap,
    both: p6Columns(rows),
    grid: p6Columns(rows.filter((r) => r.surface === 'step')),
    roll: p6Columns(rows.filter((r) => r.surface === 'roll')),
  }
}

/** the committed observation: a cap this tree does not ship, plus its own expiry stamp */
export interface P6CapObservation {
  note: string
  /** re-run this when `assertObservationCurrent` reddens */
  script: string
  /** the corpus the pair was taken over — a second, coarser staleness signal */
  corpusUnits: number
  /** the reading at the candidate cap. The thing no gate can re-derive. */
  observed: P6Reading
  /** the SAME RUN's reading at the shipped cap. Free to re-take, so it is the expiry. */
  companion: P6Reading
}

/**
 * Is the committed cap-12 observation still about this tree?
 *
 * Throws with the script to re-run rather than returning a boolean, because the only
 * useful thing a caller can do with `false` is say exactly this.
 */
export function assertObservationCurrent(
  obs: P6CapObservation,
  liveRows: readonly P6Ask[],
  liveCap: number,
  liveCorpusUnits: number,
): void {
  const live = readP6(liveRows, liveCap)
  const stale: string[] = []
  if (obs.companion.cap !== liveCap)
    stale.push(`shipped cap ${obs.companion.cap} -> ${liveCap}`)
  if (obs.corpusUnits !== liveCorpusUnits)
    stale.push(`corpus ${obs.corpusUnits} -> ${liveCorpusUnits} units`)
  for (const surface of ['both', 'grid', 'roll'] as const)
    for (const k of Object.keys(live[surface]) as (keyof P6Columns)[])
      if (obs.companion[surface][k] !== live[surface][k])
        stale.push(`${surface}.${k} ${obs.companion[surface][k]} -> ${live[surface][k]}`)
  if (stale.length)
    throw new Error(
      `the committed cap-${obs.observed.cap} observation is STALE — the world it was taken in has moved:\n` +
        stale.map((s) => `    ${s}`).join('\n') +
        `\n  Re-take it:  ${obs.script}\n` +
        `  It cannot be repaired by editing the number: the cap-${obs.observed.cap} column is an ` +
        `observation, and deriving it by subtraction is the defect this check exists to prevent.`,
    )
}

/* ── the generated section ───────────────────────────────────────────────────── */

const n = (v: number): string => String(v)

/**
 * The section body both documents carry. Rendered from one reading pair so the two
 * documents cannot quote different gains from the same run — which is exactly what
 * happened while each maintained its own copy by hand.
 */
export function renderP6Table(obs: P6CapObservation, live: P6Reading, corpusUnits: number): string {
  const a = live
  const b = obs.observed
  const row = (label: string, x: number, y: number): string =>
    `| ${label} | ${n(x)} | ${n(y)} |`
  return [
    `At roll cap **${b.cap}**, with the syntactic core deleted (#1012) — over ${corpusUnits} corpus`,
    `units, ${a.both.asks} core-served asks (${a.grid.asks} grid / ${a.roll.asks} roll):`,
    ``,
    `| | cap ${a.cap} (shipped) | cap ${b.cap} |`,
    `|---|---|---|`,
    row('untransferable asks, both surfaces', a.both.untransferable, b.both.untransferable),
    row('roll untransferable', a.roll.untransferable, b.roll.untransferable),
    row('**the set that actually blocks deleting the core**', a.both.blocker, b.both.blocker),
    row('…of it, grid', a.grid.blocker, b.grid.blocker),
    row('…of it, roll', a.roll.blocker, b.roll.blocker),
    ``,
    `**The cap's own contribution is ${a.both.blocker - b.both.blocker} asks** ` +
      `(${a.both.blocker} − ${b.both.blocker}), all of it on the roll: ` +
      `${a.roll.blocker} − ${b.roll.blocker} = ${a.roll.blocker - b.roll.blocker}.`,
    ``,
    `**The grid is the control arm** and it is identical to the digit at both caps — ` +
      `${a.grid.asks} asks / ${a.grid.transfers} transfers / ${a.grid.untransferable} untransferable / ` +
      `blocker ${a.grid.blocker} at cap ${a.cap}, and ` +
      `${b.grid.asks} / ${b.grid.transfers} / ${b.grid.untransferable} / ${b.grid.blocker} at cap ${b.cap}. ` +
      `The constant is per-surface and roll-only, so a grid column that moved would mean ` +
      `the sweep had changed something it was not aiming at.`,
    ``,
    `The cap-${a.cap} column is DERIVED from this run. The cap-${b.cap} column is an ` +
      `OBSERVATION taken by \`${obs.script}\`, which sets the module constant exactly as a ship ` +
      `would; it carries the cap-${a.cap} column from its own run as an expiry stamp, and ` +
      `\`writer-census.test.ts\` reddens when that stamp stops matching this tree.`,
  ].join('\n')
}

export const P6_BLOCK_BEGIN = '<!-- P6-TABLE:BEGIN — generated by writer-census.test.ts (#1046); do not edit by hand -->'
export const P6_BLOCK_END = '<!-- P6-TABLE:END -->'

/**
 * Splice `body` between the markers.
 *
 * THROWS when a marker is missing or the two are out of order. An anchored in-place edit
 * whose anchor has gone silently appends, and every count-the-token check still passes
 * ([[P497]]) — so the structure is asserted before anything is sliced, and a document that
 * loses its markers fails the census rather than quietly stopping being generated.
 */
export function writeGeneratedBlock(source: string, body: string, where: string): string {
  const i = source.indexOf(P6_BLOCK_BEGIN)
  const j = source.indexOf(P6_BLOCK_END)
  if (i < 0) throw new Error(`${where}: the generated block's BEGIN marker is gone — nothing would be written`)
  if (j < 0) throw new Error(`${where}: the generated block's END marker is gone — nothing would be written`)
  if (j < i) throw new Error(`${where}: the generated block's markers are inverted`)
  if (source.indexOf(P6_BLOCK_BEGIN, i + 1) >= 0)
    throw new Error(`${where}: the generated block's BEGIN marker appears twice — the splice is ambiguous`)
  return source.slice(0, i + P6_BLOCK_BEGIN.length) + '\n\n' + body + '\n\n' + source.slice(j)
}
