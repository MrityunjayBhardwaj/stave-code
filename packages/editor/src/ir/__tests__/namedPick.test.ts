/**
 * namedPick.test.ts — #463 Stage 1.
 *
 * Object/named-key pick family (`sel.pickRestart({verse:…, chorus:…})`) lifts
 * into a structured `NamedPick` node instead of an opaque `Code`, so the Song
 * timeline collects the section CONTENT (the verse/chorus patterns) instead of
 * the control-string LABELS, while toStrudel still round-trips byte-identically.
 *
 * Every collect expectation was GROUNDED against real `@strudel/core` haps
 * (the mini()-wrapped form, queried per cycle) during the fix.
 */
import { describe, it, expect } from 'vitest'
import { parseStrudel, toStrudel, collectCycles } from '../../ir'
import type { PatternIR, IREvent } from '../../ir'
import { IR } from '../PatternIR'
import {
  runRawStage,
  runMiniExpandedStage,
  runChainAppliedStage,
  runFinalStage,
} from '../parseStrudelStages'
import { runPasses, type Pass } from '../passes'

// The staged pipeline that builds the app's IR SNAPSHOT (feeds the Song
// timeline). Must agree with one-shot parseStrudel (P185 divergence guard).
const STAGES: readonly Pass<PatternIR>[] = [
  { name: 'RAW', run: runRawStage },
  { name: 'MINI-EXPANDED', run: runMiniExpandedStage },
  { name: 'CHAIN-APPLIED', run: runChainAppliedStage },
  { name: 'Parsed', run: runFinalStage },
]
function pipeline(code: string): PatternIR {
  const passes = runPasses(IR.code(code), STAGES)
  return passes[passes.length - 1].ir
}

function bodyOf(ir: PatternIR): PatternIR {
  return ir.tag === 'Track' ? (ir as Extract<PatternIR, { tag: 'Track' }>).body : ir
}

// s-or-note value per cycle (sections are `s(...)` so `s` carries the content).
function contentPerCycle(src: string, cycles: number): string[] {
  const evs = collectCycles(parseStrudel(src), 0, cycles) as IREvent[]
  const byCycle: Record<number, string[]> = {}
  for (const e of evs) (byCycle[Math.floor(e.begin)] ||= []).push(String(e.s ?? e.note ?? ''))
  return Array.from({ length: cycles }, (_, c) => (byCycle[c] || []).sort().join(','))
}

const SONG = `"<~@2 verse@2 chorus@2>".pickRestart({verse: s("bd sd"), chorus: s("hh hh")})`

describe('#463 Stage 1 — object-form pick family → NamedPick', () => {
  it('parses object-form pickRestart into a structured NamedPick (not opaque Code)', () => {
    const body = bodyOf(parseStrudel(SONG))
    expect(body.tag).toBe('NamedPick')
    if (body.tag !== 'NamedPick') return
    expect(body.method).toBe('pickRestart')
    expect(body.entries.map((e) => e.key)).toEqual(['verse', 'chorus'])
    expect(body.entries[0].pattern.tag).not.toBe('Code') // the section is parsed
  })

  it('each entry carries a keyLoc pointing at its key token in the source', () => {
    const body = bodyOf(parseStrudel(SONG))
    if (body.tag !== 'NamedPick') throw new Error('not NamedPick')
    for (const e of body.entries) {
      expect(SONG.slice(e.keyLoc!.start, e.keyLoc!.end)).toBe(e.key)
    }
  })

  it('collect plays the section CONTENT per cycle, not the control labels', () => {
    // control `<~@2 verse@2 chorus@2>`: rest c0-1, verse c2-3, chorus c4-5.
    expect(contentPerCycle(SONG, 6)).toEqual([
      '', '', 'bd,sd', 'bd,sd', 'hh,hh', 'hh,hh',
    ])
  })

  it('an unknown key / rest arm collects to silence', () => {
    // `gone` has no entry → silence; the `~` rest arm → silence.
    const src = `"<~ gone verse>".pickRestart({verse: s("bd")})`
    expect(contentPerCycle(src, 3)).toEqual(['', '', 'bd'])
  })

  it('pickRestart RESTARTS the inner pattern on each section entry (restart timing)', () => {
    // verse dwells 3 cycles with a 3-cycle inner alternation → 0,1,2 then
    // restarts. GROUNDED vs real haps.
    const src = `"<verse@3 chorus@2>".pickRestart({verse: s("<a b c>"), chorus: s("hh")})`
    expect(contentPerCycle(src, 10)).toEqual([
      'a', 'b', 'c',   // verse entry c0-2 → inner 0,1,2
      'hh', 'hh',      // chorus c3-4
      'a', 'b', 'c',   // verse RE-entry c5-7 → inner RESTARTS 0,1,2
      'hh', 'hh',      // chorus c8-9
    ])
  })

  it('pick (innerJoin) tracks the GLOBAL cycle (continuous), unlike pickRestart', () => {
    // Same shape but `.pick`: the inner advances by global cycle, so the verse
    // re-entry at c5 is at inner cycle 5 (5%3=2 → c), not a restart to a.
    const src = `"<verse@3 chorus@2>".pick({verse: s("<a b c>"), chorus: s("hh")})`
    expect(contentPerCycle(src, 8)).toEqual([
      'a', 'b', 'c',   // c0-2 → inner 0,1,2
      'hh', 'hh',      // c3-4
      'c', 'a', 'b',   // c5-7 → inner 5,6,7 → c,a,b (NOT a restart)
    ])
  })

  it('toStrudel round-trips byte-identically to the opaque-Code precedent', () => {
    const ir = parseStrudel(SONG)
    // The receiver re-emits via the (lossy-but-stable) mini gen, the args
    // verbatim — exactly what the opaque Code node produced pre-Stage-1.
    expect(toStrudel(ir)).toBe(
      `note("<~ note("verse") note("chorus")>").pickRestart({verse: s("bd sd"), chorus: s("hh hh")})`,
    )
  })

  it('array-form pickRestart stays opaque (only object form is structured here)', () => {
    const body = bodyOf(parseStrudel(`s("0 1").pickRestart([s("bd"), s("hh")])`))
    expect(body.tag).toBe('Code')
  })

  it('the staged snapshot pipeline produces the SAME NamedPick as parseStrudel (P185 guard)', () => {
    // The app's Song timeline reads the staged-pipeline snapshot, not one-shot
    // parseStrudel — they must agree or the timeline diverges silently.
    expect(pipeline(SONG)).toEqual(parseStrudel(SONG))
    expect(bodyOf(pipeline(SONG)).tag).toBe('NamedPick')
  })
})
