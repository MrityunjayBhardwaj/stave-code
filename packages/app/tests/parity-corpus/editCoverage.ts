/**
 * editCoverage.ts — the view-editability ORACLE, extracted so it can be gated.
 *
 * This is the measurement core `edit-coverage.spec.ts` runs in both its corpus
 * and live-Bakery modes. It lives in its own hermetic module (no vitest, no
 * env, no fs) for one reason: a `.spec.ts` is maintainer-only and never runs in
 * CI, so while the oracle lived inside it NOTHING guarded editability against
 * regression. `parity.test.ts` gates the timeline parser (`ir/parseStrudel`);
 * nothing gated `visualEdit/notation/parse.ts`, and the 55-fixture corpus was
 * the only thing that ever caught a real editability regression.
 *
 * Importing this module — rather than re-deriving the verdict — is the point:
 * a second copy of the oracle would answer confidently and diverge silently,
 * which is the failure this corpus exists to detect.
 *
 * Consumers:
 *   - `edit-coverage.spec.ts` — corpus + live measurement, writes the reports
 *   - `edit-parity.test.ts`   — the CI gate: per-fixture verdicts, snapshotted
 */
import {
  detectAllChunks,
  detectChunk,
  docParses,
  parseTopLevel,
  type ChunkInfo,
} from '../../../editor/src/visualEdit/chunkDetect'
import { parseStepGrid, parsePianoRoll } from '../../../editor/src/visualEdit/notation/parse'
import { detectAllArrangeCalls } from '../../../editor/src/visualEdit/arrange/parse'
import { detectAllPickControls } from '../../../editor/src/visualEdit/pickControl/parse'

// Bare-identifier combinators whose direct arguments are themselves patterns —
// their nested voices ARE separately editable (the app binds them via
// detectChunk at a cursor inside the voice, #395). `arrange` is deliberately
// excluded: it is edited as a CLIP control, not by descending into its arms.
const COMBINATOR_EXPAND = new Set(['stack', 'cat', 'slowcat', 'fastcat'])

// Non-musical setup/boilerplate statement heads — top-level expression
// statements that carry no editable musical content, excluded from the
// editability denominator (reported separately).
//
// NOTE `'await'` is NOT in this list, and deliberately so: `chunkDetect` does
// not unwrap `AwaitExpression`, so `await samples('github:…')` reports a null
// head and the entry could never have matched. That dead entry is what this
// list looked like when it was written by guessing at heads instead of reading
// units — `hostPlumbingRanges` below handles the await-wrapped case against the
// real AST instead. See #998.
const SETUP_HEADS = new Set([
  'samples', 'setcpm', 'setcps', 'setbpm', 'setVoicingRange', 'useRNG',
  'register', 'setGainCurve', 'setmidimap', 'aliasBank',
  'setCpm', 'setCps', 'setBpm', 'initAudio', 'setGain', 'setVolume',
])

// Host/runtime and visual calls: they start a renderer, load a video, or draw —
// they never denote a pattern, so no grid or roll could exist for them however
// good our editors get.
//
// DERIVED FROM THE UNITS, never extended speculatively: every name here was
// observed as a top-level statement in the corpus + 150 real Bakery tunes. A
// speculative entry is invisible when it is wrong, which is exactly how the
// dead `'await'` above survived.
const HOST_CALL_HEADS = new Set([
  'initHydra', 'initBytebeat', 'initVideo', 'dough', 'render', 'src', 'enableMotion',
])

/**
 * The head name of a call chain's ROOT call — `src(s0).kaleid(…).out()` is
 * headed by `src`, and `s1.initVideo('…')` by `initVideo`, matching how
 * `chunkDetect` names heads.
 */
function rootHead(node: any): string | null {
  let n = node
  while (n) {
    if (n.type === 'TaggedTemplateExpression') return n.tag?.type === 'Identifier' ? n.tag.name : null
    if (n.type === 'CallExpression') {
      const c = n.callee
      if (c?.type === 'Identifier') return c.name
      if (c?.type === 'MemberExpression') {
        if (c.object?.type === 'CallExpression' || c.object?.type === 'MemberExpression') {
          n = c.object
          continue
        }
        return c.property?.type === 'Identifier' ? c.property.name : null
      }
      return null
    }
    if (n.type === 'MemberExpression') {
      n = n.object
      continue
    }
    return null
  }
  return null
}

/** `typeof X !== 'undefined' && X(…)` — a load guard, not a track. */
function isTypeofGuard(e: any): boolean {
  if (!e || e.type !== 'LogicalExpression') return false
  let l = e.left
  while (l && (l.type === 'LogicalExpression' || l.type === 'BinaryExpression')) l = l.left
  return l?.type === 'UnaryExpression' && l.operator === 'typeof'
}

/**
 * Top-level statements that are HOST PLUMBING rather than music — the second
 * half of the coverage fraction, and the half nobody had audited (#998).
 *
 * A coverage number is `editable / musical units`. Statements that start hydra,
 * load a video, log, guard a load, or re-export a helper to `window` carry no
 * note content and never could — counting them in the denominator both deflates
 * the number and, worse, files them under `code-only`, which reads as "we have
 * no view for this YET" when the truth is "this is not a musical unit."
 *
 * THE RULE IS DELIBERATELY NARROW, and errs toward counting things AGAINST us:
 *   - only `ExpressionStatement`s. Declarations are out of scope because
 *     `detectAllChunks` never yields a chunk for one (`chunkDetect.ts:263-266`,
 *     deliberately, to avoid a duplicate strip) — so a `const x = <pattern>`
 *     line is not a unit here at all and this rule must not pretend to judge it.
 *   - an assignment is excluded only when its right-hand side is an identifier
 *     or a number/boolean — a re-export or a knob. `window.foo = "<<C E>:…>"`
 *     stays IN, because its value could carry music.
 *   - `silence`, `all(x => …)`, `chord(…)`, `seq(…)`, `pick(…)`, `mask(…)` all
 *     stay IN. They are musical units with no view yet, and must keep counting
 *     against us — that residual is the roadmap.
 */
function hostPlumbingRanges(doc: string): { setup: Overlap[]; nonMusical: Overlap[] } {
  const setup: Overlap[] = []
  const nonMusical: Overlap[] = []
  for (const stmt of parseTopLevel(doc) ?? []) {
    if (stmt.type !== 'ExpressionStatement') continue
    const range: Overlap = [stmt.start, stmt.end]
    let e = stmt.expression
    if (e?.type === 'AwaitExpression') e = e.argument

    if (isTypeofGuard(e)) {
      nonMusical.push(range)
      continue
    }
    if (e?.type === 'AssignmentExpression') {
      const r = e.right
      const bare =
        r?.type === 'Identifier' ||
        (r?.type === 'Literal' && (typeof r.value === 'number' || typeof r.value === 'boolean'))
      if (bare) nonMusical.push(range)
      continue
    }
    if (e?.type === 'CallExpression' && e.callee?.type === 'MemberExpression' && e.callee.object?.type === 'Identifier' && e.callee.object.name === 'console') {
      nonMusical.push(range)
      continue
    }
    const head = rootHead(e)
    if (head == null) continue
    if (SETUP_HEADS.has(head)) setup.push(range)
    else if (HOST_CALL_HEADS.has(head)) nonMusical.push(range)
  }
  return { setup, nonMusical }
}

type Overlap = [number, number]
const overlaps = (a: Overlap, b: Overlap) => a[0] < b[1] && b[0] < a[1]

/** Walk an ESTree node, invoking `fn` on every nested node. */
function walk(node: any, fn: (n: any) => void): void {
  if (!node || typeof node.type !== 'string') return
  fn(node)
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue
    const v = (node as any)[key]
    if (Array.isArray(v)) v.forEach((c) => walk(c, fn))
    else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v, fn)
  }
}

/**
 * Every editable UNIT in a doc: top-level chunks, plus the nested voices inside
 * stack/cat/slowcat/fastcat calls. Combinator-headed units are dropped (a
 * combinator is never a leaf editable unit — its voices are). Deduped by range.
 */
function collectUnits(doc: string): ChunkInfo[] {
  const units: ChunkInfo[] = []
  const seen = new Set<string>()
  const add = (c: ChunkInfo | null) => {
    if (!c) return
    const key = `${c.exprRange[0]}-${c.exprRange[1]}`
    if (seen.has(key)) return
    seen.add(key)
    units.push(c)
  }

  // Nested voices first. Reuse chunkDetect's own acorn parse (`parseTopLevel`)
  // — acorn is the editor's dep, not the app's, so we never import it here.
  for (const stmt of parseTopLevel(doc) ?? []) {
    walk(stmt, (n) => {
      if (
        n.type === 'CallExpression' &&
        n.callee?.type === 'Identifier' &&
        COMBINATOR_EXPAND.has(n.callee.name)
      ) {
        for (const arg of n.arguments ?? []) {
          if (arg && typeof arg.start === 'number') add(detectChunk(doc, arg.start))
        }
      }
    })
  }
  for (const c of detectAllChunks(doc)) add(c)

  // Nested stacks otherwise leak in as phantom 'code-only: stack' units.
  return units.filter((u) => !(u.headFn != null && COMBINATOR_EXPAND.has(u.headFn)))
}

export type UnitStatus =
  | { status: 'setup'; head: string }
  | { status: 'non-musical'; head: string }
  | { status: 'note'; kind: 'roll' | 'step' }
  | { status: 'note-broken'; kind: 'roll' | 'step'; reason: string; gate?: string; head: string }
  | { status: 'clip'; kind: string }
  | { status: 'knobs' }
  | { status: 'code-only'; head: string }

/**
 * How a broken unit is BUCKETED in the blocker histogram (#990).
 *
 * The parser's `gate` when it has one, the raw reason otherwise. The gate is the
 * cause; the reason string used to be whichever of the three stacked writers
 * declined FIRST, so a histogram keyed on it ranked subsystems that had nothing
 * to do with why the unit was unavailable — "nested groups" sat near the top of
 * this list for months while not one of those units was stopped by nesting.
 *
 * NOTE on `wrong-surface`: it means the values played belong to the other view.
 * In the both-surfaces gate sweep that is a routing fact and no failure at all —
 * a drum pattern SHOULD decline the roll. Here it is still an editability
 * failure, because this harness routes by HEAD (`note`/`n` → roll, `s`/`sound` →
 * grid) exactly as the app does: a `wrong-surface` unit is one whose head asks
 * for a view its own values cannot fill, and the user gets code. Same gate, two
 * honest readings — which is why the distinction is worth carrying.
 */
const blockerKey = (s: { kind: string; reason: string; gate?: string }): string =>
  `${s.kind}: ${s.gate ?? s.reason}`

function classifyUnit(
  u: ChunkInfo,
  arrangeRanges: Overlap[],
  pickRanges: Overlap[],
  plumbing: { setup: Overlap[]; nonMusical: Overlap[] },
): UnitStatus {
  const head = u.headFn
  const mini = u.miniString
  if (head != null && SETUP_HEADS.has(head)) return { status: 'setup', head }
  // Statement-level host plumbing (#998). Checked against the real AST rather
  // than the unit's head, because the head is null for the shapes that matter
  // (`await samples(…)`, `window.x = y`, a `typeof` guard).
  if (plumbing.setup.some((r) => overlaps(r, u.exprRange))) return { status: 'setup', head: head ?? '(await)' }
  if (plumbing.nonMusical.some((r) => overlaps(r, u.exprRange))) {
    return { status: 'non-musical', head: head ?? '(no-head)' }
  }
  if (mini !== null && (head === 'note' || head === 'n')) {
    const r = parsePianoRoll(mini)
    return r.ok
      ? { status: 'note', kind: 'roll' }
      : { status: 'note-broken', kind: 'roll', reason: r.reason, gate: r.gate, head: head! }
  }
  if (mini !== null && (head === 's' || head === 'sound')) {
    const r = parseStepGrid(mini)
    return r.ok
      ? { status: 'note', kind: 'step' }
      : { status: 'note-broken', kind: 'step', reason: r.reason, gate: r.gate, head: head! }
  }
  if (arrangeRanges.some((r) => overlaps(r, u.exprRange))) return { status: 'clip', kind: 'arrange' }
  if (pickRanges.some((r) => overlaps(r, u.exprRange))) return { status: 'clip', kind: 'pick' }
  if (u.type === 'knobs') return { status: 'knobs' }
  return { status: 'code-only', head: head ?? '(no-head)' }
}

export interface TuneReport {
  file: string
  /** musical units only (setup/boilerplate AND host plumbing excluded) */
  units: number
  setup: number
  /** host plumbing: hydra init, video, render, logging, guards, re-exports (#998) */
  nonMusical: number
  noteEditable: number
  clip: number
  noteBroken: number
  knobs: number
  codeOnly: number
  /** structurally editable = note OR clip (real view editing, not just a knob) */
  structurallyEditable: number
  tuneClass: 'fully' | 'partial' | 'knobs-only' | 'code-only' | 'unparseable'
}

export interface Measurement {
  tunes: TuneReport[]
  brokenReasons: Map<string, number>
  codeOnlyHeads: Map<string, number>
}

/** The measurement core — shared by corpus and live modes. */
export function measureDocs(docs: { name: string; code: string }[]): Measurement {
  const tunes: TuneReport[] = []
  const brokenReasons = new Map<string, number>()
  const codeOnlyHeads = new Map<string, number>()
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)

  for (const { name, code } of docs) {
    if (!docParses(code)) {
      tunes.push({
        file: name, units: 0, setup: 0, nonMusical: 0, noteEditable: 0, clip: 0, noteBroken: 0,
        knobs: 0, codeOnly: 0, structurallyEditable: 0, tuneClass: 'unparseable',
      })
      continue
    }
    const arrangeRanges = detectAllArrangeCalls(code).map((a): Overlap => a.callRange)
    const pickRanges = detectAllPickControls(code).map((p): Overlap => p.callRange)
    const plumbing = hostPlumbingRanges(code)
    const allUnits = collectUnits(code)

    let note = 0, clip = 0, broken = 0, knobs = 0, codeOnly = 0, setup = 0, nonMusical = 0
    for (const u of allUnits) {
      const s = classifyUnit(u, arrangeRanges, pickRanges, plumbing)
      switch (s.status) {
        case 'setup': setup++; break
        case 'non-musical': nonMusical++; break
        case 'note': note++; break
        case 'clip': clip++; break
        case 'knobs': knobs++; break
        case 'note-broken': broken++; bump(brokenReasons, blockerKey(s)); break
        case 'code-only': codeOnly++; bump(codeOnlyHeads, s.head); break
      }
    }
    const musical = allUnits.length - setup - nonMusical
    const structural = note + clip
    const tuneClass: TuneReport['tuneClass'] =
      musical === 0 ? 'code-only'
      : structural === musical ? 'fully'
      : structural > 0 ? 'partial'
      : knobs > 0 ? 'knobs-only'
      : 'code-only'

    tunes.push({
      file: name, units: musical, setup, nonMusical, noteEditable: note, clip, noteBroken: broken,
      knobs, codeOnly, structurallyEditable: structural, tuneClass,
    })
  }
  return { tunes, brokenReasons, codeOnlyHeads }
}

const pct = (x: number, d: number) => (d === 0 ? '0.0' : ((100 * x) / d).toFixed(1))
const rank = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])

/** Aggregate a Measurement into the headline numbers (pure). */
export function aggregate(m: Measurement) {
  const { tunes } = m
  const n = tunes.length
  const cls = (c: TuneReport['tuneClass']) => tunes.filter((t) => t.tuneClass === c).length
  const sum = (f: (t: TuneReport) => number) => tunes.reduce((a, t) => a + f(t), 0)
  const fully = cls('fully')
  const partial = cls('partial')
  const anyEditable = fully + partial
  const totalUnits = sum((t) => t.units)
  const uNote = sum((t) => t.noteEditable)
  const uClip = sum((t) => t.clip)
  return {
    n, fully, partial, anyEditable,
    knobsOnly: cls('knobs-only'), codeOnlyTunes: cls('code-only'), unparseable: cls('unparseable'),
    totalUnits, uSetup: sum((t) => t.setup), uNonMusical: sum((t) => t.nonMusical), uNote, uClip,
    uStructural: uNote + uClip, uBroken: sum((t) => t.noteBroken),
    uKnobs: sum((t) => t.knobs), uCode: sum((t) => t.codeOnly),
    anyEditablePct: Number(pct(anyEditable, n)),
    structuralPct: Number(pct(uNote + uClip, totalUnits)),
  }
}

export function summaryLines(label: string, m: Measurement): string[] {
  const a = aggregate(m)
  const lines = [
    `══════════ EDIT-COVERAGE (${label}) ══════════`,
    `tunes: ${a.n}`,
    `TUNE  any-editable: ${a.anyEditable}/${a.n} (${a.anyEditablePct}%)  ` +
      `[fully ${a.fully} · partial ${a.partial} · knobs ${a.knobsOnly} · code ${a.codeOnlyTunes} · unparse ${a.unparseable}]`,
    `UNIT  structural: ${a.uStructural}/${a.totalUnits} (${a.structuralPct}%)  ` +
      `[note ${a.uNote} · clip ${a.uClip} · broken ${a.uBroken} · knobs ${a.uKnobs} · code ${a.uCode}]  ` +
      `(excluded: setup ${a.uSetup} · host plumbing ${a.uNonMusical})`,
    'top note-broken reasons:',
    ...rank(m.brokenReasons).slice(0, 6).map(([k, c]) => `   ${c}×  ${k}`),
    'top code-only heads:',
    ...rank(m.codeOnlyHeads).slice(0, 8).map(([k, c]) => `   ${c}×  ${k}`),
  ]
  return lines
}

export function renderMarkdown(m: Measurement, title: string): string {
  const a = aggregate(m)
  const md: string[] = []
  md.push(`# ${title}`)
  md.push('')
  md.push(`Generated by \`tests/parity-corpus/edit-coverage.spec.ts\`. ${a.n} tunes.`)
  md.push('')
  md.push('> **What "editable" means:** a unit is *structurally editable* when its note')
  md.push('> string round-trips into a StepGrid/PianoRoll model (the app\'s own')
  md.push('> `useGridModel` gate) **or** it is an `arrange`/`pickRestart` clip control.')
  md.push('> `note-broken` = the app would OFFER a grid/roll editor but the string does')
  md.push('> not round-trip (the "offered but blank" class). `knobs`-only = numeric')
  md.push('> params but no note/clip structure. Setup/boilerplate heads excluded.')
  md.push('')
  md.push('## Tune-level')
  md.push('')
  md.push('| Class | Tunes | % |')
  md.push('|---|---:|---:|')
  md.push(`| Fully editable (every unit note/clip) | ${a.fully} | ${pct(a.fully, a.n)} |`)
  md.push(`| Partially editable (≥1 note/clip unit) | ${a.partial} | ${pct(a.partial, a.n)} |`)
  md.push(`| **Any editable surface (fully+partial)** | **${a.anyEditable}** | **${pct(a.anyEditable, a.n)}** |`)
  md.push(`| Knobs-only | ${a.knobsOnly} | ${pct(a.knobsOnly, a.n)} |`)
  md.push(`| Code-only (no view edit) | ${a.codeOnlyTunes} | ${pct(a.codeOnlyTunes, a.n)} |`)
  md.push(`| Unparseable | ${a.unparseable} | ${pct(a.unparseable, a.n)} |`)
  md.push('')
  md.push('## Unit-level')
  md.push('')
  md.push(`Total musical units (top-level chunks + stack/cat voices): **${a.totalUnits}**`)
  md.push('')
  md.push(`Excluded from that denominator: **${a.uSetup}** setup/boilerplate statements and`)
  md.push(`**${a.uNonMusical}** host-plumbing statements — hydra \`initHydra\`/\`initVideo\`/\`render\`/\`src\`,`)
  md.push('`console.*`, `typeof` load guards, and `window.x = y` re-exports. These carry no note')
  md.push('content and no view could ever open them, so counting them would both deflate the')
  md.push('percentage and file them under `code-only`, which reads as "no view for this yet"')
  md.push('(#998). Deliberately still counted AGAINST us: `silence`, `all(x => …)`, `chord(…)`,')
  md.push('`seq(…)`, `pick(…)`, `mask(…)`, and every `const x = <pattern>` binding.')
  md.push('')
  md.push('| Status | Units | % |')
  md.push('|---|---:|---:|')
  md.push(`| note-editable (round-trips) | ${a.uNote} | ${pct(a.uNote, a.totalUnits)} |`)
  md.push(`| clip (arrange/pick) | ${a.uClip} | ${pct(a.uClip, a.totalUnits)} |`)
  md.push(`| **structurally editable** | **${a.uStructural}** | **${pct(a.uStructural, a.totalUnits)}** |`)
  md.push(`| note-broken (offered, no round-trip) | ${a.uBroken} | ${pct(a.uBroken, a.totalUnits)} |`)
  md.push(`| knobs-only | ${a.uKnobs} | ${pct(a.uKnobs, a.totalUnits)} |`)
  md.push(`| code-only | ${a.uCode} | ${pct(a.uCode, a.totalUnits)} |`)
  md.push('')
  md.push('## Blocker histogram — `note-broken` (offered a grid/roll but no round-trip)')
  md.push('')
  md.push('> Bucketed by the **gate that actually stopped the write-back**, not by the')
  md.push('> first writer to decline (#990). Three writers stack behind one parse call')
  md.push('> — syntactic core → element projection → leaf projection — and the reason')
  md.push('> string used to be whichever spoke first, which is how "nested groups" led')
  md.push('> this list while not one of those units was stopped by nesting.')
  md.push('>')
  md.push('> `wrong-surface` = the values played belong to the other view. Under this')
  md.push('> harness\'s head routing (`note`/`n` → roll, `s`/`sound` → grid, as the app')
  md.push('> does) that is still an editability failure: the head asks for a view its')
  md.push('> own values cannot fill. It is only a non-failure in a sweep that asks BOTH')
  md.push('> surfaces of every unit — there, a drum pattern *should* decline the roll.')
  md.push('')
  md.push('| Count | kind: gate |')
  md.push('|---:|---|')
  for (const [k, c] of rank(m.brokenReasons)) md.push(`| ${c} | ${k} |`)
  if (m.brokenReasons.size === 0) md.push('| — | none |')
  md.push('')
  md.push('## Blocker histogram — `code-only` head functions')
  md.push('')
  md.push('| Count | head |')
  md.push('|---:|---|')
  for (const [k, c] of rank(m.codeOnlyHeads)) md.push(`| ${c} | ${k} |`)
  if (m.codeOnlyHeads.size === 0) md.push('| — | none |')
  md.push('')
  md.push('## Per-tune')
  md.push('')
  md.push('| Tune | units | note | clip | broken | knobs | code | class |')
  md.push('|---|---:|---:|---:|---:|---:|---:|---|')
  for (const t of m.tunes) {
    md.push(
      `| ${t.file} | ${t.units} | ${t.noteEditable} | ${t.clip} | ${t.noteBroken} | ${t.knobs} | ${t.codeOnly} | ${t.tuneClass} |`,
    )
  }
  md.push('')
  return md.join('\n')
}

export function resultJson(m: Measurement, extra: Record<string, unknown> = {}) {
  const a = aggregate(m)
  return {
    ...extra,
    tunes: a.n,
    tuneLevel: {
      fully: a.fully, partial: a.partial, anyEditable: a.anyEditable,
      knobsOnly: a.knobsOnly, codeOnly: a.codeOnlyTunes, unparseable: a.unparseable,
      anyEditablePct: a.anyEditablePct,
    },
    unitLevel: {
      totalUnits: a.totalUnits, note: a.uNote, clip: a.uClip, structurallyEditable: a.uStructural,
      noteBroken: a.uBroken, knobs: a.uKnobs, codeOnly: a.uCode, setup: a.uSetup,
      nonMusical: a.uNonMusical,
      structurallyEditablePct: a.structuralPct,
    },
    brokenReasons: Object.fromEntries(rank(m.brokenReasons)),
    codeOnlyHeads: Object.fromEntries(rank(m.codeOnlyHeads)),
    perTune: m.tunes,
  }
}
