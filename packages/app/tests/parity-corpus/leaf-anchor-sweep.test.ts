/**
 * leaf-anchor-sweep.test.ts — the whole-corpus proof that a shipped GRID leaf
 * anchor slices to its own token (#986 P1a, PR #987 self-review finding #1).
 *
 * The leaf-anchored projection writes an edit by replacing the bytes at a hap's
 * `context.locations[0]` span. That is only sound if the span really IS the
 * played atom's own token — and `loc[0]` is the leaf for MOST bare reified minis
 * but not all: a `..` range gives each generated note the range END's location, a
 * patterned operator (`*<8 [4 16]>`) puts its own argument first, and a `.`
 * phrase separator can pad a token's span with a trailing space. `leafAnchors`
 * (in parse.ts) is exactly the guard that REJECTS any onset whose span does not
 * slice to its token, so those patterns never open a leaf view.
 *
 * This gate proves the guard holds over the full committed corpus, at scale:
 *  1. every anchor in every SHIPPED leaf model slices to its atom (0 exceptions)
 *     — the property a regression in the guard would break, corrupting on the
 *     first click;
 *  2. the guard is LOAD-BEARING, not vacuous — the raw `gridOnsets` stream does
 *     carry non-slicing spans that never reach a view (asserted > 0, so a guard
 *     that silently started accepting them would be caught).
 *
 * THE ORACLE is the shipped `parseStepGrid` / `gridOnsets` — never a
 * re-implementation, which could only agree with itself.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mini as reifyMini } from '@strudel/mini/mini.mjs'
import {
  gridOnsets,
  parseStepGrid,
  parsePianoRoll,
  rollOnsets,
} from '../../../editor/src/visualEdit/notation/parse'

const corpusDir = path.dirname(fileURLToPath(import.meta.url))
const corpus: { minis: { mini: string }[] } = JSON.parse(
  fs.readFileSync(path.join(corpusDir, 'mini-corpus.json'), 'utf8'),
)
const minis = corpus.minis.map((o) => o.mini.trim()).filter((m) => m !== '')

describe('#986 leaf-anchor sweep — a shipped anchor slices to its own token', () => {
  it('every anchor in every leaf-projected grid slices to its atom (0 exceptions)', () => {
    let views = 0
    let anchors = 0
    const bad: string[] = []
    for (const src of minis) {
      const r = parseStepGrid(src)
      if (!r.ok || !r.model.leafSource) continue
      views++
      const ls = r.model.leafSource
      for (const col of ls.cols) {
        for (const a of col) {
          anchors++
          if (ls.src.slice(a.span.start, a.span.end) !== a.atom && bad.length < 20) {
            bad.push(`${JSON.stringify(src)} atom=${JSON.stringify(a.atom)} span=[${a.span.start},${a.span.end}) slice=${JSON.stringify(ls.src.slice(a.span.start, a.span.end))}`)
          }
        }
      }
    }
    console.log(`\n[grid] ${views} leaf views, ${anchors} anchors — all slice to their token`)
    expect(views).toBeGreaterThan(10) // the projection actually opens views (non-vacuous)
    expect(bad, bad.join('\n')).toEqual([])
  })

  it('the slice===token guard is load-bearing — raw gridOnsets DO carry non-slicing spans', () => {
    let checked = 0
    let nonSlicing = 0
    for (const src of minis) {
      let pat: unknown
      try {
        pat = reifyMini(src)
      } catch {
        continue
      }
      for (let c = 0; c < 2; c++) {
        let onsets: ReturnType<typeof gridOnsets>
        try {
          onsets = gridOnsets(pat, c)
        } catch {
          onsets = null
        }
        if (!onsets) continue
        for (const o of onsets) {
          for (let i = 0; i < o.atoms.length; i++) {
            const s = o.spans[i]
            if (!s) continue
            checked++
            if (src.slice(s.start, s.end) !== o.atoms[i]) nonSlicing++
          }
        }
      }
    }
    console.log(`\n[grid] ${nonSlicing} of ${checked} raw gridOnsets spans are non-slicing — leafAnchors rejects these`)
    expect(checked).toBeGreaterThan(5000) // the sweep ran
    // If this hits zero, the guard has nothing to catch and the first test is
    // vacuously true — a regression that started accepting a bad span would then
    // pass silently. Kept as a live tripwire.
    expect(nonSlicing).toBeGreaterThan(0)
  })
})

/**
 * The ROLL arm (#986 P1b). The same proof, and it matters MORE here: the grid rejects
 * numeric values upstream and so never meets a synthesised location, while numbers are
 * the roll's whole point — it meets every one of them. `rollAnchors` is the guard, and
 * the raw stream it filters carries hundreds of non-slicing spans.
 */
describe('#986 P1b leaf-anchor sweep — a shipped ROLL anchor slices to its own pitch', () => {
  it('every anchor in every leaf-projected roll slices to its pitch (0 exceptions)', () => {
    let views = 0
    let anchors = 0
    const bad: string[] = []
    for (const src of minis) {
      const r = parsePianoRoll(src)
      if (!r.ok || !r.model.leafSource) continue
      views++
      const ls = r.model.leafSource
      for (const a of ls.anchors) {
        anchors++
        // the roll case-folds note names for its row math; the anchor must still point
        // at the user's own bytes, which is what the writer puts back
        if (
          ls.src.slice(a.span.start, a.span.end).toLowerCase() !== a.pitch.toLowerCase() &&
          bad.length < 20
        ) {
          bad.push(
            `${JSON.stringify(src)} pitch=${JSON.stringify(a.pitch)} span=[${a.span.start},${a.span.end}) slice=${JSON.stringify(ls.src.slice(a.span.start, a.span.end))}`,
          )
        }
      }
    }
    console.log(`\n[roll] ${views} leaf views, ${anchors} anchors — all slice to their pitch`)
    expect(views).toBeGreaterThan(10) // the projection actually opens views (non-vacuous)
    expect(bad, bad.join('\n')).toEqual([])
  })

  it('the slice===pitch guard is load-bearing — raw rollOnsets DO carry non-slicing spans', () => {
    let checked = 0
    let nonSlicing = 0
    for (const src of minis) {
      let pat: unknown
      try {
        pat = reifyMini(src)
      } catch {
        continue
      }
      for (let c = 0; c < 2; c++) {
        let onsets: ReturnType<typeof rollOnsets>
        try {
          onsets = rollOnsets(pat, c)
        } catch {
          onsets = null
        }
        if (!onsets) continue
        for (const o of onsets) {
          if (!o.loc) continue
          checked++
          if (src.slice(o.loc.start, o.loc.end).toLowerCase() !== o.pitch.toLowerCase()) {
            nonSlicing++
          }
        }
      }
    }
    console.log(
      `\n[roll] ${nonSlicing} of ${checked} raw rollOnsets spans are non-slicing — rollAnchors rejects these`,
    )
    expect(checked).toBeGreaterThan(5000) // the sweep ran
    // The measured class: a `..` range gives every generated note the range END's
    // location, and a patterned operator (`*<8 [4 16]>`) puts its own argument first.
    // Splicing any of them would rewrite the wrong bytes, so this staying > 0 is what
    // proves `rollAnchors` has something real to refuse.
    expect(nonSlicing).toBeGreaterThan(0)
  })
})
