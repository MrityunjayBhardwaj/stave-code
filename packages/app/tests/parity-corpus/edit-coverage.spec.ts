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
  detectAllChunks,
  detectChunk,
  docParses,
  parseTopLevel,
  type ChunkInfo,
} from '../../../editor/src/visualEdit/chunkDetect'
import { parseStepGrid, parsePianoRoll } from '../../../editor/src/visualEdit/notation/parse'
import { detectAllArrangeCalls } from '../../../editor/src/visualEdit/arrange/parse'
import { detectAllPickControls } from '../../../editor/src/visualEdit/pickControl/parse'

const corpusDir = path.dirname(fileURLToPath(import.meta.url))

// Bare-identifier combinators whose direct arguments are themselves patterns —
// their nested voices ARE separately editable (the app binds them via
// detectChunk at a cursor inside the voice, #395). `arrange` is deliberately
// excluded: it is edited as a CLIP control, not by descending into its arms.
const COMBINATOR_EXPAND = new Set(['stack', 'cat', 'slowcat', 'fastcat'])

// Non-musical setup/boilerplate statement heads — top-level expression
// statements that carry no editable musical content, excluded from the
// editability denominator (reported separately).
const SETUP_HEADS = new Set([
  'samples', 'setcpm', 'setcps', 'setbpm', 'setVoicingRange', 'useRNG',
  'register', 'setGainCurve', 'setmidimap', 'aliasBank', 'await',
  'setCpm', 'setCps', 'setBpm', 'initAudio', 'setGain', 'setVolume',
])

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

type UnitStatus =
  | { status: 'setup'; head: string }
  | { status: 'note'; kind: 'roll' | 'step' }
  | { status: 'note-broken'; kind: 'roll' | 'step'; reason: string; head: string }
  | { status: 'clip'; kind: string }
  | { status: 'knobs' }
  | { status: 'code-only'; head: string }

function classifyUnit(u: ChunkInfo, arrangeRanges: Overlap[], pickRanges: Overlap[]): UnitStatus {
  const head = u.headFn
  const mini = u.miniString
  if (head != null && SETUP_HEADS.has(head)) return { status: 'setup', head }
  if (mini !== null && (head === 'note' || head === 'n')) {
    const r = parsePianoRoll(mini)
    return r.ok
      ? { status: 'note', kind: 'roll' }
      : { status: 'note-broken', kind: 'roll', reason: r.reason, head: head! }
  }
  if (mini !== null && (head === 's' || head === 'sound')) {
    const r = parseStepGrid(mini)
    return r.ok
      ? { status: 'note', kind: 'step' }
      : { status: 'note-broken', kind: 'step', reason: r.reason, head: head! }
  }
  if (arrangeRanges.some((r) => overlaps(r, u.exprRange))) return { status: 'clip', kind: 'arrange' }
  if (pickRanges.some((r) => overlaps(r, u.exprRange))) return { status: 'clip', kind: 'pick' }
  if (u.type === 'knobs') return { status: 'knobs' }
  return { status: 'code-only', head: head ?? '(no-head)' }
}

interface TuneReport {
  file: string
  /** musical units only (setup/boilerplate excluded) */
  units: number
  setup: number
  noteEditable: number
  clip: number
  noteBroken: number
  knobs: number
  codeOnly: number
  /** structurally editable = note OR clip (real view editing, not just a knob) */
  structurallyEditable: number
  tuneClass: 'fully' | 'partial' | 'knobs-only' | 'code-only' | 'unparseable'
}

interface Measurement {
  tunes: TuneReport[]
  brokenReasons: Map<string, number>
  codeOnlyHeads: Map<string, number>
}

/** The measurement core — shared by corpus and live modes. */
function measureDocs(docs: { name: string; code: string }[]): Measurement {
  const tunes: TuneReport[] = []
  const brokenReasons = new Map<string, number>()
  const codeOnlyHeads = new Map<string, number>()
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)

  for (const { name, code } of docs) {
    if (!docParses(code)) {
      tunes.push({
        file: name, units: 0, setup: 0, noteEditable: 0, clip: 0, noteBroken: 0,
        knobs: 0, codeOnly: 0, structurallyEditable: 0, tuneClass: 'unparseable',
      })
      continue
    }
    const arrangeRanges = detectAllArrangeCalls(code).map((a): Overlap => a.callRange)
    const pickRanges = detectAllPickControls(code).map((p): Overlap => p.callRange)
    const allUnits = collectUnits(code)

    let note = 0, clip = 0, broken = 0, knobs = 0, codeOnly = 0, setup = 0
    for (const u of allUnits) {
      const s = classifyUnit(u, arrangeRanges, pickRanges)
      switch (s.status) {
        case 'setup': setup++; break
        case 'note': note++; break
        case 'clip': clip++; break
        case 'knobs': knobs++; break
        case 'note-broken': broken++; bump(brokenReasons, `${s.kind}: ${s.reason}`); break
        case 'code-only': codeOnly++; bump(codeOnlyHeads, s.head); break
      }
    }
    const musical = allUnits.length - setup
    const structural = note + clip
    const tuneClass: TuneReport['tuneClass'] =
      musical === 0 ? 'code-only'
      : structural === musical ? 'fully'
      : structural > 0 ? 'partial'
      : knobs > 0 ? 'knobs-only'
      : 'code-only'

    tunes.push({
      file: name, units: musical, setup, noteEditable: note, clip, noteBroken: broken,
      knobs, codeOnly, structurallyEditable: structural, tuneClass,
    })
  }
  return { tunes, brokenReasons, codeOnlyHeads }
}

const pct = (x: number, d: number) => (d === 0 ? '0.0' : ((100 * x) / d).toFixed(1))
const rank = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])

/** Aggregate a Measurement into the headline numbers (pure). */
function aggregate(m: Measurement) {
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
    totalUnits, uSetup: sum((t) => t.setup), uNote, uClip,
    uStructural: uNote + uClip, uBroken: sum((t) => t.noteBroken),
    uKnobs: sum((t) => t.knobs), uCode: sum((t) => t.codeOnly),
    anyEditablePct: Number(pct(anyEditable, n)),
    structuralPct: Number(pct(uNote + uClip, totalUnits)),
  }
}

function summaryLines(label: string, m: Measurement): string[] {
  const a = aggregate(m)
  const lines = [
    `══════════ EDIT-COVERAGE (${label}) ══════════`,
    `tunes: ${a.n}`,
    `TUNE  any-editable: ${a.anyEditable}/${a.n} (${a.anyEditablePct}%)  ` +
      `[fully ${a.fully} · partial ${a.partial} · knobs ${a.knobsOnly} · code ${a.codeOnlyTunes} · unparse ${a.unparseable}]`,
    `UNIT  structural: ${a.uStructural}/${a.totalUnits} (${a.structuralPct}%)  ` +
      `[note ${a.uNote} · clip ${a.uClip} · broken ${a.uBroken} · knobs ${a.uKnobs} · code ${a.uCode}]  (setup ${a.uSetup} excluded)`,
    'top note-broken reasons:',
    ...rank(m.brokenReasons).slice(0, 6).map(([k, c]) => `   ${c}×  ${k}`),
    'top code-only heads:',
    ...rank(m.codeOnlyHeads).slice(0, 8).map(([k, c]) => `   ${c}×  ${k}`),
  ]
  return lines
}

function renderMarkdown(m: Measurement, title: string): string {
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
  md.push(`Total musical units (top-level chunks + stack/cat voices, setup excluded): **${a.totalUnits}**`)
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
  md.push('| Count | kind: reason |')
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

function resultJson(m: Measurement, extra: Record<string, unknown> = {}) {
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
      structurallyEditablePct: a.structuralPct,
    },
    brokenReasons: Object.fromEntries(rank(m.brokenReasons)),
    codeOnlyHeads: Object.fromEntries(rank(m.codeOnlyHeads)),
    perTune: m.tunes,
  }
}

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
