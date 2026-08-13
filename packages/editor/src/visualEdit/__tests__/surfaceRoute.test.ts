/**
 * surfaceRoute + the cross-statement freshness guard (#1240).
 *
 * ── WHY THIS FILE EXISTS: TWO BREAKS THAT REDDENED NOTHING ────────────────
 * The #1240 break matrix ran five cells. Three reddened app gates. Two did not,
 * and a break that reddens nothing is a claim about the BREAK before it is a
 * claim about the tests — so both were checked for liveness first, and both are
 * live code on a reachable path:
 *
 *   B3 — deleting the `miniAnchor` half of `isChunkFresh` changed no verdict
 *        anywhere. That is the guard standing between a resolver-supplied span
 *        and a write into an unrelated declaration: the most safety-critical
 *        line in the change, and nothing exercised it.
 *
 *   B5 — deleting `chunkSurface`'s `miniVia === 'resolver'` scoping changed no
 *        verdict either, because the only OTHER caller of the rule — the
 *        coverage harness — carries its own copy of that condition, and
 *        `chunkSurface` itself is reached only by `PatternPanel`, which no
 *        vitest arm mounts. The rule was tested; the call site was not
 *        ([[P540]]: arms over an extracted unit are structurally blind to
 *        whether production reaches it).
 *
 * Each arm below was red-tested against the break that motivated it, and the
 * two breaks redden DISJOINT arms — B3 reddens only the freshness describe, B5
 * only the scoping one. Distinct is not disjoint ([[P558]]), so that separation
 * is checked rather than assumed.
 */
import { describe, it, expect } from 'vitest'

import { detectChunk, isChunkFresh } from '../chunkDetect'
import { chunkSurface, routeSurface } from '../panels/surfaceRoute'

describe('the freshness guard follows a cross-statement mini span', () => {
  // `s(drums)` carries no literal of its own; the resolver names the span
  // inside `const drums = …`, which is a DIFFERENT top-level statement from the
  // one `statementRange` watches.
  const doc = 'const drums = "bd sd hh cp"\n$: s(drums).lpf(400)'
  const chunkAt = (needle: string) => detectChunk(doc, doc.indexOf(needle))!

  it('anchors the mini in the declaring statement, not the unit statement', () => {
    const c = chunkAt('lpf')
    expect(c.miniVia).toBe('resolver')
    expect(c.miniString).toBe('bd sd hh cp')
    // The whole point: the span is outside the unit's own statement.
    expect(c.miniAnchor).not.toBeNull()
    expect(c.miniRange![0]).toBeLessThan(c.statementRange[0])
    expect(doc.slice(...c.miniAnchor!.range)).toBe(c.miniAnchor!.text)
  })

  it('is FRESH against the document it was detected from', () => {
    expect(isChunkFresh(doc, chunkAt('lpf'))).toBe(true)
  })

  it('goes STALE when the declaration changes, though its own statement did not', () => {
    const c = chunkAt('lpf')
    // ⚠ THE REPLACEMENT IS THE SAME LENGTH, and that is the whole arm. A
    // shorter declaration shifts every later offset, so `statementText` stops
    // matching and the PRE-#1240 half of the guard catches it — the arm would
    // pass with `miniAnchor` deleted, certifying nothing. At equal length the
    // unit's own statement is byte-identical AT THE SAME OFFSETS, so the old
    // guard sees nothing wrong and only the anchor can fire. This is the exact
    // case that would otherwise write to a span whose content moved.
    const edited = 'const drums = "cp cp cp cp"\n$: s(drums).lpf(400)'
    expect(edited.length).toBe(doc.length)
    expect(edited.slice(...c.statementRange)).toBe(c.statementText)
    expect(isChunkFresh(edited, c)).toBe(false)
  })

  it('stays fresh when an UNRELATED statement changes', () => {
    // The guard must not be a blanket document-hash: an edit that touches
    // neither the unit nor its declaration leaves the offsets valid.
    const c = detectChunk(doc + '\n$: s("hh*4")', doc.indexOf('lpf'))!
    expect(isChunkFresh(doc + '\n$: s("hh*4").gain(0.5)', c)).toBe(true)
  })

  it('a same-statement literal chunk carries NO anchor', () => {
    // The field must stay null on the overwhelmingly common path, or every
    // literal chunk pays for a guard it does not need.
    const plain = '$: s("bd sd")'
    const c = detectChunk(plain, plain.indexOf('bd'))!
    expect(c.miniVia).toBe('literal')
    expect(c.miniAnchor).toBeNull()
  })
})

describe('chunkSurface routes resolver spans, and only those', () => {
  const surfaceOf = (doc: string, needle: string) =>
    chunkSurface(detectChunk(doc, doc.indexOf(needle))!)

  it('sends a resolver-named drum pattern to the step grid', () => {
    expect(surfaceOf('const d = "bd sd hh cp"\n$: s(d).lpf(400)', 'lpf')).toBe('step')
  })

  it('sends a resolver-named melody to the piano roll', () => {
    expect(surfaceOf('const m = "c3 e3 g3"\n$: note(m).room(2)', 'room')).toBe('roll')
  })

  it('routes a resolver span on a SILENT head by its content, not its head', () => {
    // The head (`lpf`) says nothing about which view the values belong to —
    // this is the case `patternKind` alone cannot answer and #1240 exists for.
    expect(routeSurface('lpf', 'c3 e3 g3')).toBe('roll')
    expect(routeSurface('lpf', 'bd sd hh')).toBe('step')
  })

  it('gives a chord progression the grid, since only the roll can decline', () => {
    // The settled product call: a lane-per-chord-name grid IS an editable
    // surface. The roll declines these on vocabulary; the grid takes them.
    expect(routeSurface(null, '<Gsus G7 Em7 D7>')).toBe('step')
    expect(routeSurface(null, '<am dm em>')).toBe('step')
  })

  it('withholds a surface from a LITERAL mini on a non-content head', () => {
    // ⚠ THE B5 ARM. `lpf("0 1 2")` finds its literal the old way, so `miniVia`
    // is `literal` and the routing must NOT fire: re-routing every string a
    // non-content head owns is a separate decision with its own measurement,
    // and #1240 deliberately does not take it. Dropping the scoping makes this
    // return a surface and nothing else in either package notices.
    const doc = '$: lpf("0 1 2")'
    const c = detectChunk(doc, doc.indexOf('lpf'))!
    expect(c.miniVia).toBe('literal')
    expect(chunkSurface(c)).toBeNull()
  })

  it('withholds a surface when there is no content span at all', () => {
    const doc = '$: silence.gain(0.5)'
    expect(chunkSurface(detectChunk(doc, doc.indexOf('gain'))!)).toBeNull()
  })
})
