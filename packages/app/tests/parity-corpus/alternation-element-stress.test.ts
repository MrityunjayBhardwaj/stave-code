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
    for (const mini of minis) {
      const r = parseStepGrid(mini)
      if (!r.ok || !r.model.altSource) continue
      const spans = topSpans(mini.trim())
      for (let lane = 0; lane < r.model.lanes.length; lane++) {
        for (let col = 0; col < r.model.steps; col++) {
          const cells = [...r.model.lanes[lane].cells]
          cells[col] = !cells[col]
          const edited = {
            ...r.model,
            lanes: r.model.lanes.map((l, li) => (li === lane ? { ...l, cells } : l)),
          }
          const out = serializeStepGrid(edited)
          // an altSource grid is always expressible, so a null here would be a
          // real defect — flag it rather than silently skip
          if (out === null) {
            if (bad.length < 8) bad.push(`NULL ${JSON.stringify(mini.trim())}`)
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
  })
})
