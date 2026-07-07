import { describe, it, expect } from 'vitest'
import { scanVizRequestLines } from './vizLineScan'

/**
 * #725 — inline-viz zone placement must anchor NAMED tracks (`drums: …`), not
 * only anonymous `$:` ones. Strudel's transpiler rewrites `x: y` → `y.p('x')`,
 * so the `.p()` capture side keys a named label by its name; this scan must
 * agree. Pre-fix, the scan filtered on `startsWith('$:')` and keyed positionally
 * `$N`, so a named track produced NO zone (observed: named → [], `$:` → one).
 */
describe('scanVizRequestLines — named tracks (#725)', () => {
  // The exact failing pattern from the report.
  const NAMED = `drums: "<~@4 verse@8 chorus@8 verse@8 chorus@8 ~@4>".pickRestart({
  verse: s("bd ~ sd ~ bd bd sd ~").bank("ajkpercusyn").gain(0.136).room(0.754).lpf(1790),
  chorus: s("bd ~ [bd,sd] ~ bd ~ [bd,sd] ~").bank("RolandTR909"),
})._pianoroll()`

  it('anchors a named track keyed by its label name', () => {
    // capture keys a named label by its name ('drums'), not positionally.
    const reqs = new Map([['drums', 'pianoroll']])
    const out = scanVizRequestLines(reqs, NAMED)
    expect(out.has('drums')).toBe(true)
    expect(out.get('drums')?.vizId).toBe('pianoroll')
    // block spans all 4 lines → zone anchors AFTER the last (`})._pianoroll()`).
    expect(out.get('drums')?.afterLine).toBe(4)
  })

  it('does NOT treat indented object props (verse:/chorus:) as tracks', () => {
    // Only 'drums' is a real track; a stray request for the indented 'verse'
    // key must not conjure a zone (column-0 discriminator).
    const reqs = new Map([
      ['drums', 'pianoroll'],
      ['verse', 'scope'],
    ])
    const out = scanVizRequestLines(reqs, NAMED)
    expect([...out.keys()]).toEqual(['drums'])
  })

  it('still anchors the anonymous `$:` form (no regression)', () => {
    const anon = NAMED.replace('drums:', '$:')
    const reqs = new Map([['$0', 'pianoroll']])
    const out = scanVizRequestLines(reqs, anon)
    expect(out.get('$0')?.afterLine).toBe(4)
  })

  it('handles mixed named + anonymous tracks, keying each correctly', () => {
    const code = [
      'drums: s("bd sd")._pianoroll()', // line 1 → named 'drums'
      '$: s("hh*8")._pianoroll()', //       line 2 → anon '$0'
      'bass: note("c2 e2")._pianoroll()', // line 3 → named 'bass'
    ].join('\n')
    const reqs = new Map([
      ['drums', 'pianoroll'],
      ['$0', 'pianoroll'],
      ['bass', 'pianoroll'],
    ])
    const out = scanVizRequestLines(reqs, code)
    expect(out.get('drums')?.afterLine).toBe(1)
    expect(out.get('$0')?.afterLine).toBe(2)
    expect(out.get('bass')?.afterLine).toBe(3)
  })

  it('carries per-track viz options through by key', () => {
    const reqs = new Map([['drums', 'pianoroll']])
    const opts = new Map([['drums', { fold: 1 }]])
    const out = scanVizRequestLines(reqs, NAMED, opts)
    expect(out.get('drums')?.options).toEqual({ fold: 1 })
  })

  // #797 — a master `all(x=>…)` line below a `$:`-with-inline-viz block is a
  // top-level statement, so the block MUST end above it. Pre-fix, the block-end
  // scan didn't recognize `all(` as a boundary → the `$:` block absorbed the
  // `all()` line → the zone anchored below it (and flickered as the mixer
  // rewrote the gain literal). Same class as #569 (unrecognized top-level form).
  it('ends the block ABOVE a master all(x=>…) line, not below it', () => {
    const code = [
      '$: stack(', //                       line 1 — block start
      '  s("hh*8").gain(0.3),', //          line 2
      '  s("bd [~ bd] ~ bd").gain(0.5),', //line 3
      '  s("~ sd ~ [sd cp]").gain(0.4)', // line 4
      ').viz("wordfall")', //               line 5 — block's real last line
      'all(x => x.gain(0.089))', //         line 6 — master bus, its own block
    ].join('\n')
    const reqs = new Map([['$0', 'wordfall']])
    const out = scanVizRequestLines(reqs, code)
    // anchors after `).viz("wordfall")` (line 5), NOT after `all(...)` (line 6).
    expect(out.get('$0')?.afterLine).toBe(5)
  })
})
