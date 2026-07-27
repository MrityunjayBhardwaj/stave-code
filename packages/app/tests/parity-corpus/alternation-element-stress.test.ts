/**
 * #920 — the every-edit stress gate for `<...>`-as-element writeback, over the
 * real-world corpus. The shipped `edit-locality` gate edits only the LAST element
 * and checks only the prefix — a projection (PV197). This is the property it
 * projects: drag EVERY note / toggle EVERY cell, and assert both
 *   (1) no data loss — the output re-parses with the same note/cell count, and
 *   (2) locality — the changed byte span overlaps at most ONE top-level element,
 * asked of krill (an independent oracle), not of our own regions.
 *
 * This is the sweep that found two data-loss bugs in the roll's whole-cycle span
 * surgery (#916); it must run against the alt-element writer too.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePianoRoll, parseStepGrid } from '../../../editor/src/visualEdit/notation/parse'
import { isCellOn } from '../../../editor/src/visualEdit/notation/model'
// The PRODUCTION cell toggle — see the note at its call site below (#1048).
import { toggleCell } from '../../../editor/src/visualEdit/notation/place'
import { serializePianoRoll, serializeStepGrid } from '../../../editor/src/visualEdit/notation/serialize'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const corpus = JSON.parse(fs.readFileSync(path.join(here, 'mini-corpus.json'), 'utf8'))
const krill = require(
  path.resolve(here, '../../../../node_modules/.pnpm/@strudel+mini@1.2.6/node_modules/@strudel/mini/krill-parser.js'),
)
const minis: string[] = corpus.minis.map((o: { mini: string }) => o.mini)

function topSpans(mini: string): [number, number][] {
  try {
    const ast: { arguments_?: { alignment?: string }; source_?: { location_?: { start: { offset: number }; end: { offset: number } } }[] } =
      krill.parse('"' + mini + '"')
    if (ast.arguments_?.alignment !== 'fastcat') return []
    return (ast.source_ ?? [])
      .map((el): [number, number] | null =>
        el.location_ ? [el.location_.start.offset - 1, el.location_.end.offset - 1] : null,
      )
      .filter((s): s is [number, number] => s !== null)
  } catch {
    return []
  }
}

function changedSpan(a: string, b: string): [number, number] | null {
  if (a === b) return null
  let p = 0
  while (p < a.length && p < b.length && a[p] === b[p]) p++
  let s = 0
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++
  return [p, a.length - s]
}
const touches = (spans: [number, number][], ch: [number, number]) =>
  spans.filter(([a, b]) => ch[0] < b && ch[1] > a).length

describe('#920 — <...>-as-element writeback holds under every edit', () => {
  it('roll: drag every note — no data loss, ≤1 element touched', () => {
    let edits = 0
    const bad: string[] = []
    for (const mini of minis) {
      const r = parsePianoRoll(mini)
      if (!r.ok || !r.model.altSource) continue
      const spans = topSpans(mini.trim())
      const marker = r.model.numeric ? '11' : 'g9'
      for (let i = 0; i < r.model.notes.length; i++) {
        if (r.model.notes[i].pitch === marker) continue
        const edited = { ...r.model, notes: r.model.notes.map((m, j) => (j === i ? { ...m, pitch: marker } : m)) }
        const out = serializePianoRoll(edited)
        edits++
        if (out === null) continue // declined = safe no-op
        const re = parsePianoRoll(out)
        if (!re.ok || re.model.notes.length !== r.model.notes.length) {
          if (bad.length < 8) bad.push(`LOSS ${JSON.stringify(mini.trim())} #${i} -> ${JSON.stringify(out)}`)
          continue
        }
        const ch = changedSpan(mini.trim(), out)
        if (ch && spans.length && touches(spans, ch) > 1 && bad.length < 8) {
          bad.push(`LOCAL ${JSON.stringify(mini.trim())} #${i} -> ${JSON.stringify(out)}`)
        }
      }
    }
    expect(edits, 'the sweep must actually exercise roll alt-element edits').toBeGreaterThan(50)
    expect(bad, bad.join('\n')).toEqual([])
  })

  it('roll: delete every note — output re-parses, ≤1 element touched', () => {
    // Deletes exercise a dimension pitch-drags cannot: emptying a region. A note
    // whose removal makes the bars identical legitimately collapses the pattern to
    // a single cycle (fewer model notes, but hap-equivalent), so the invariant here
    // is "re-parses cleanly and stays local", not "note count − 1".
    let edits = 0
    const bad: string[] = []
    for (const mini of minis) {
      const r = parsePianoRoll(mini)
      if (!r.ok || !r.model.altSource) continue
      const spans = topSpans(mini.trim())
      for (let i = 0; i < r.model.notes.length; i++) {
        const edited = { ...r.model, notes: r.model.notes.filter((_, j) => j !== i) }
        const out = serializePianoRoll(edited)
        edits++
        if (out === null) continue
        const re = parsePianoRoll(out)
        if (!re.ok) {
          if (bad.length < 8) bad.push(`REPARSE ${JSON.stringify(mini.trim())} #${i} -> ${JSON.stringify(out)}`)
          continue
        }
        const ch = changedSpan(mini.trim(), out)
        if (ch && spans.length && touches(spans, ch) > 1 && bad.length < 8) {
          bad.push(`LOCAL ${JSON.stringify(mini.trim())} #${i} -> ${JSON.stringify(out)}`)
        }
      }
    }
    expect(edits, 'the sweep must actually exercise roll alt-element deletes').toBeGreaterThan(50)
    expect(bad, bad.join('\n')).toEqual([])
  })

  it('grid: toggle every cell — no data loss, ≤1 element touched', () => {
    let edits = 0
    const bad: string[] = []
    const declined = new Set<string>()
    let declinedToggles = 0
    for (const mini of minis) {
      const r = parseStepGrid(mini)
      if (!r.ok || !r.model.altSource) continue
      const spans = topSpans(mini.trim())
      for (let lane = 0; lane < r.model.lanes.length; lane++) {
        for (let col = 0; col < r.model.steps; col++) {
          // The PRODUCTION toggle, which clamps (#1010 P4c): painting a hit into a
          // column an earlier note was still sounding through takes that note's room.
          // Modelling the flip here instead simulated a model no gesture can produce,
          // and the writer then rightly declined an edit the UI would have clamped
          // before it ever reached here (#1048).
          const edited = toggleCell(r.model, lane, col, !isCellOn(r.model.lanes[lane].cells[col]))
          const out = serializeStepGrid(edited)
          // A null is a DECLINE, and since #1010 P4c that is a legitimate answer
          // rather than a defect: the printer preserves a note's length, and where
          // the grid's own resolution cannot spell one — a note shorter than a
          // column, or a column another note already starts in — it refuses instead
          // of emitting a shortened note. Refusing is the outcome this project ranks
          // above mis-writing. So declines are COLLECTED AND PINNED rather than
          // forbidden: the set must not grow, which is what would signal the guard
          // spreading past the shapes it was measured on.
          if (out === null) {
            declined.add(mini.trim())
            declinedToggles++
            continue
          }
          edits++
          const re = parseStepGrid(out)
          if (!re.ok) {
            if (bad.length < 8) bad.push(`REPARSE ${JSON.stringify(mini.trim())} -> ${JSON.stringify(out)}`)
            continue
          }
          const ch = changedSpan(mini.trim(), out)
          if (ch && spans.length && touches(spans, ch) > 1 && bad.length < 8) {
            bad.push(`LOCAL ${JSON.stringify(mini.trim())} -> ${JSON.stringify(out)}`)
          }
        }
      }
    }
    expect(edits, 'the sweep must actually exercise grid alt-element edits').toBeGreaterThan(20)
    expect(bad, bad.join('\n')).toEqual([])
    // THE DECLINE SET, pinned — and pinned at BOTH granularities, because a decline is
    // per EDIT and the unit set alone hides how much of a view it costs ([[PK65]] step 3).
    //
    // VERIFIED, NOT ASSUMED. 18 units is 18 more than the one this phase predicted, and
    // a count cannot tell an over-broad guard from a correct refusal — both read as "the
    // writer said no". `_p4c-decline-verify.spec.ts` settles it by counterfactual: every
    // declined toggle is emitted by the writer as it stood at `studio_v0.2.0` (the real
    // old code, imported side by side, not a reconstruction) and the ENGINE is asked
    // whether the notes AWAY from the toggled column still play the same.
    //
    //   512 declined toggles / 18 units — 512 DIFFER, and all 512 differ in DURATION
    //   ONLY. 0 structural, 0 identical. Emitting any of them the old way would have
    //   silently shortened a note the user never touched.
    //
    // So the guard is not over-broad: it declines exactly where emitting corrupts, on
    // the one axis it was written for. The cost, at the granularity the user feels it:
    // 512 of the 1912 toggles these 18 units offer, and NONE of the 512 was an edit the
    // old writer got right. Both controls ran green — the base parser reads the same
    // grid HEAD does (so it is the same edit on both sides), and the comparison was
    // proven able to see a dropped length before its silence was believed ([[P353]]).
    //
    // Pinned as an exact set so the refusal cannot quietly spread to shapes it was never
    // measured against — the failure mode a bare `>= 0` would hide.
    expect(declinedToggles, 'declined EDITS, not units — the number the user experiences').toBe(512)
    expect([...declined].sort()).toEqual([
      '<[d4 c4 d4]> <[g4 c4 bb3]> <[a3 g3 f#3:4]> <[g3]> <[bb4]>',
      '<bd[~ bd bd ~ ][bd ~ ~ bd][bd bd]>sd',
      '[<e2 d3>]\n[b2 <a2 e3>]\n[<g2 d3>]\n[f#2]',
      '[<e4 d5>]\n[b4 <a4 e5>]\n[<g4 d5>]\n[f#4]',
      '[<e5 [d5 g5]>]\n[<d5 a5>]\n[<c5 [e5 d5]>]\n[<b4 b5>]',
      '[<g4 [g4 g4]> e4 d4 c4] [a3 ~ g3 a3]',
      '[<g4 e4> [b4 g4]] [- <a4> <->]',
      '[bd hh:3] sd lt <oh [oh hh] [misc:5 hh]>',
      '[bd*2 -] <- [~@2 bd bd - bd - sd]>',
      '[c4 f4 ~ g4] ~ [a3 <c4 g3>] ~',
      'a1 c2 e2 <e2 [e2 e2] e2 [f2 f2]>',
      'bd sd <[bd ~] [~ bd]> sd',
      'bd:7 [sd ~ ~ bd:7] [<bd [lt,sd]>  bd:7] [sd <~ bd>]',
      'c <d c> - [c <d c>]',
      'd#3 f3 ~ <~ [~ ~ c#3]>',
      'hh*5 <bd bd> ~ sd',
      '{c [f g] d# d}%2',
      '~ sd ~[sd[~ <~~~ sd>]]',
    ])
  })
})
